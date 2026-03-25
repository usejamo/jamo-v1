# Phase 7: Proposal Generation Engine - Research

**Researched:** 2026-03-24
**Domain:** Anthropic SSE streaming, Supabase Edge Functions (Deno), Supabase Realtime, React streaming state
**Confidence:** HIGH — all key patterns established in prior phases; no new external dependencies

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Section sequencing (three-wave):**
- Wave 1 (anchor): `Understanding of the Study` — generates first; seeds consistency anchor
- Wave 2 (parallel body): `Scope of Work`, `Proposed Team`, `Timeline & Milestones`, `Budget Overview`, `Regulatory Strategy`, `Quality Management` — parallel after Wave 1
- Wave 3 (summary): `Executive Summary`, `Cover Letter` — last, after all body sections complete

**D-02:** Client-side orchestrator owns wave logic and fires Wave 2 sections simultaneously after Wave 1 settles.

**D-03:** Extend `ProposalDraftRenderer` with per-section streaming cards showing live text buffer + status indicator (`queued` / `generating...` / `waiting for body sections` / `complete`). Snaps to final on stream close.

**D-04:** Phase 7 does NOT build TipTap. Only the streaming card layout. TipTap is Phase 8.

**D-05:** Main section generation uses `claude-sonnet-4-6`.

**D-06:** Consistency anchor extraction uses `claude-haiku-4-5-20251001`. Anchor is ~500-token summary after each section, passed to subsequent calls.

**D-07 — Edge Function input contract:**
```
POST /generate-proposal-section
{
  proposalId,
  sectionId,
  proposalInput: { studyInfo, assumptions, services },
  ragChunks: [...],
  consistencyAnchor: "...",
  tone: "formal" | "regulatory" | "persuasive"
}
```

**D-08:** Edge Function is stateless — receives everything, calls Anthropic with streaming, pipes SSE to browser, writes completed section to `proposal_sections` on stream close.

**D-09:** Client orchestrator owns all assembly: fetches assumptions from `proposal_assumptions`, calls `retrieve-context` for RAG chunks, maintains and passes consistency anchor between waves.

### Claude's Discretion
- Exact prompt structure per section (use `cro-proposal-generator.js` system prompt as base, adapt per section)
- `[PLACEHOLDER: ...]` marker format and insertion logic
- Supabase Realtime subscription approach for frontend section updates
- Error recovery for failed section streams (retry logic, failed state in card)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-4.1 | Generation runs in Supabase Edge Functions — API key never exposed to browser | Edge Function SSE proxy pattern established below |
| REQ-4.2 | Sections generated in dependency order: Study Understanding first, Executive Summary and Cover Letter last | Three-wave client orchestrator pattern (D-01/D-02) |
| REQ-4.3 | ~500-token Consistency Anchor from prior sections (not full prior text) to prevent O(n²) context inflation | Haiku anchor extraction call pattern documented below |
| REQ-4.4 | Streaming: Edge Function pipes Anthropic SSE stream to browser; sections appear as they are written | Deno TransformStream + ReadableStream piping pattern |
| REQ-4.5 | Each completed section written to Supabase (`proposal_sections` table) immediately — durable progress | Stream-close write pattern using service role client |
| REQ-4.6 | Frontend subscribes to Supabase Realtime to render sections as they arrive in DB | `supabase.channel().on('postgres_changes')` pattern |
| REQ-4.7 | Generation can be triggered section-by-section or full-proposal | Orchestrator exposes both `generateSection(id)` and `generateAll()` |
| REQ-4.8 | Tone controls per section: formal / regulatory / persuasive | `tone` field in D-07 payload; injected into section prompt |
| REQ-4.9 | RAG context: retrieve relevant regulatory document chunks from pgvector | Client calls `retrieve-context` before each section call |
| REQ-4.10 | `[PLACEHOLDER: ...]` markers preserved in output for user to fill in missing information | Enforced via system prompt CRITICAL RULES (rule 2 in cro-proposal-generator.js) |
</phase_requirements>

---

## Summary

Phase 7 delivers the core generation loop: a stateless `generate-proposal-section` Supabase Edge Function that proxies Anthropic SSE streams to the browser, a client-side orchestrator that sequences sections in three waves, and a React streaming card UI extending `ProposalDraftRenderer`.

All major technical patterns are already established in this codebase. The `extract-assumptions` Edge Function (Phase 6) provides the exact Deno boilerplate needed. The `retrieve-context` function (Phase 4) provides the RAG call pattern. The `cro-proposal-generator.js` system prompt covers all 10+ section definitions. The `proposal_sections` table is already migrated and ready.

The primary research focus is: (1) how Deno Edge Functions proxy Anthropic SSE streams without buffering, (2) how the Supabase Realtime subscription pattern works with `postgres_changes`, and (3) the correct React pattern for buffering SSE tokens into a live text display.

**Primary recommendation:** Build `generate-proposal-section` by directly extending `extract-assumptions/index.ts` — swap the Anthropic call from non-streaming to `stream: true` with `ReadableStream` piping, add the on-close DB write, and keep all CORS/serve/error boilerplate identical.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deno (Edge runtime) | Supabase-managed | Edge Function runtime | Established in all prior functions |
| Anthropic Messages API (streaming) | `anthropic-version: 2023-06-01` | SSE stream generation | Same API used in extract-assumptions; streaming via `stream: true` |
| `@supabase/supabase-js` | ^2.98.0 | Realtime subscriptions, DB writes | Project standard |
| React 19 | ^19.2.0 | Streaming card UI | Project standard |
| Tailwind CSS | project version | Streaming card styling | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^4.0.4 | Unit tests for orchestrator logic | All client-side logic |
| Deno test runner | built-in | Edge Function unit tests | All Edge Function helpers |

### No New Dependencies Needed
Phase 7 introduces zero new npm or Deno packages. All required capabilities exist in the current stack.

---

## Architecture Patterns

### Recommended Project Structure
```
supabase/functions/generate-proposal-section/
├── index.ts          # Edge Function: SSE proxy + DB write on close
├── deno.json         # Import map (same as extract-assumptions)
└── test.ts           # Deno unit tests for helpers

src/
├── hooks/
│   └── useProposalGeneration.ts   # Client orchestrator (wave logic, anchor management)
├── components/
│   ├── ProposalDraftRenderer.tsx  # EXTENDED (not replaced) with streaming cards
│   └── SectionStreamCard.tsx      # New: per-section streaming display card
└── types/
    └── generation.ts              # New: SectionStatus, GenerationState types
```

### Pattern 1: Deno SSE Proxy (Edge Function streaming)

The Anthropic API returns SSE when `stream: true`. The Edge Function must pipe this stream directly to the browser response rather than buffering. Deno's `ReadableStream` and `TransformStream` make this native.

**What:** Pipe Anthropic SSE response body → browser response body as `text/event-stream`
**When to use:** The only correct pattern for REQ-4.1 + REQ-4.4

```typescript
// Source: Anthropic streaming API + Deno Web Streams API
// Pattern: pipe-through, collect text in TransformStream side-channel

const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    stream: true,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  }),
})

if (!anthropicResp.ok || !anthropicResp.body) {
  throw new Error(`Anthropic error ${anthropicResp.status}`)
}

// Collect full text while piping SSE to browser
let fullText = ''
const { readable, writable } = new TransformStream({
  transform(chunk, controller) {
    // Parse SSE delta for text accumulation
    const text = new TextDecoder().decode(chunk)
    const lines = text.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'content_block_delta' && data.delta?.text) {
            fullText += data.delta.text
          }
        } catch { /* non-JSON lines (e.g. "[DONE]") — skip */ }
      }
    }
    controller.enqueue(chunk)
  },
  flush() {
    // Stream complete — write section to DB (fire-and-forget from flush)
    writeSection(supabase, proposalId, sectionId, orgId, fullText)
      .catch(err => console.error('[generate-proposal-section] DB write error:', err))
  }
})

anthropicResp.body.pipeTo(writable)

return new Response(readable, {
  headers: {
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
  },
})
```

**Critical:** `flush()` in TransformStream fires when the stream closes — this is the correct hook for the DB write (REQ-4.5). Do NOT await the DB write inside flush (blocks stream close); use fire-and-forget with error logging.

### Pattern 2: Client Orchestrator (Three-Wave Sequencing)

**What:** React hook managing wave order, anchor state, and parallel Wave 2 calls
**When to use:** Single hook owns all generation state; components only read status

```typescript
// Source: D-01/D-02 decisions, cro-proposal-generator.js PROPOSAL_SECTIONS
// src/hooks/useProposalGeneration.ts

const WAVE_MAP: Record<string, 1 | 2 | 3> = {
  understanding:       1,
  scope_of_work:       2,
  proposed_team:       2,
  timeline:            2,
  budget:              2,
  regulatory_strategy: 2,
  quality_management:  2,
  executive_summary:   3,
  cover_letter:        3,
}

async function generateAll(proposalId: string, proposalInput: ProposalInput) {
  // Wave 1 — serial
  const anchor1 = await generateSection('understanding', proposalInput, '')
  const anchorText = await extractAnchor(anchor1)

  // Wave 2 — parallel
  const wave2Keys = Object.entries(WAVE_MAP).filter(([,w]) => w === 2).map(([k]) => k)
  const wave2Results = await Promise.all(
    wave2Keys.map(key => generateSection(key, proposalInput, anchorText))
  )
  const fullAnchor = await extractAnchor([anchor1, ...wave2Results].join('\n\n'))

  // Wave 3 — serial (needs full anchor)
  await generateSection('executive_summary', proposalInput, fullAnchor)
  await generateSection('cover_letter', proposalInput, fullAnchor)
}
```

### Pattern 3: Consistency Anchor Extraction (Haiku call)

**What:** After each wave, call Haiku to produce a ~500-token summary of completed sections
**When to use:** Between Wave 1→2 and Wave 2→3 transitions

```typescript
// Source: D-06 decision + Anthropic API pattern from extract-assumptions
async function extractAnchor(sectionText: string): Promise<string> {
  const resp = await supabase.functions.invoke('generate-proposal-section', {
    body: { _anchorOnly: true, text: sectionText }
  })
  // OR: call Anthropic directly from client via a dedicated anchor Edge Function
  // Decision: keep anchor extraction inside generate-proposal-section as a mode flag,
  // or create a separate extract-anchor Edge Function. Either works — planner chooses.
  return resp.data.anchor
}
```

**Note for planner:** Two valid approaches — (a) add `_anchorMode: true` flag to `generate-proposal-section` for Haiku anchor calls, or (b) create a minimal `extract-anchor` Edge Function. Option (a) avoids a new function deployment; option (b) is cleaner. This is Claude's discretion per CONTEXT.md.

### Pattern 4: Supabase Realtime Subscription

**What:** Frontend subscribes to `proposal_sections` inserts/updates for the proposal
**When to use:** Phase 7 uses Realtime to render sections as they become complete (REQ-4.6)

```typescript
// Source: @supabase/supabase-js v2 Realtime API
// Note: Realtime renders COMPLETED sections. Live streaming is via SSE directly.
// The two-phase display: SSE buffer → React state (live chars) → Realtime snap (final)

useEffect(() => {
  const channel = supabase
    .channel(`proposal-sections-${proposalId}`)
    .on(
      'postgres_changes',
      {
        event: '*',           // INSERT and UPDATE
        schema: 'public',
        table: 'proposal_sections',
        filter: `proposal_id=eq.${proposalId}`,
      },
      (payload) => {
        dispatch({ type: 'SECTION_UPDATED', section: payload.new })
      }
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [proposalId])
```

**Critical:** Realtime requires RLS to not block the subscription. The `proposal_sections` RLS policy (from migration 20260305000005) must allow `SELECT` for the authenticated user's org. Verify this before implementing.

### Pattern 5: SSE Consumer in React (browser-side stream reading)

**What:** Read SSE from Edge Function response, buffer tokens into React state
**When to use:** SectionStreamCard component reads the SSE, updates live text

```typescript
// Source: Fetch Streams API (browser-native)
const response = await fetch('/functions/v1/generate-proposal-section', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  },
  body: JSON.stringify(payload),
})

if (!response.body) throw new Error('No stream body')
const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const chunk = decoder.decode(value, { stream: true })
  // Parse SSE lines for content_block_delta events
  for (const line of chunk.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6))
        if (data.type === 'content_block_delta' && data.delta?.text) {
          setLiveText(prev => prev + data.delta.text)
        }
      } catch { /* skip */ }
    }
  }
}
// Stream closed — Realtime will now deliver the persisted section
setStatus('complete')
```

### Pattern 6: Section Prompt Assembly

**What:** Build per-section system prompt from `cro-proposal-generator.js` + section-specific instruction
**When to use:** Inside `generate-proposal-section` Edge Function, per `sectionId`

Key insight from `cro-proposal-generator.js`: the system prompt covers 13 full sections. For Phase 7, the Edge Function receives a `sectionId` and constructs a focused prompt:

```typescript
// Adapt CRO_PROPOSAL_SYSTEM_PROMPT for single-section generation:
const sectionSystemPrompt = `${CRO_PROPOSAL_SYSTEM_PROMPT}

IMPORTANT: Generate ONLY the "${sectionName}" section.
Tone for this section: ${tone}.
${consistencyAnchor ? `\n## CONSISTENCY ANCHOR (summary of prior sections):\n${consistencyAnchor}` : ''}

[REGULATORY CONTEXT]
${ragChunks.map(c => c.content).join('\n---\n')}
[/REGULATORY CONTEXT]`
```

The `[REGULATORY CONTEXT]` block format is the versioned contract established in Phase 4 (STATE.md: "System prompt block format is versioned contract").

### Anti-Patterns to Avoid

- **Buffering the full Anthropic response before streaming to browser:** Defeats the purpose of streaming; introduces Edge Function timeout risk at section boundary. Always pipe directly.
- **Passing full prior section text as context (O(n²) growth):** Use the ~500-token consistency anchor. This is a locked decision (REQ-4.3/D-06).
- **Calling `retrieve-context` from inside the Edge Function:** D-09 locks this — the client orchestrator fetches RAG chunks and passes them in the payload. Keep Edge Function stateless.
- **Awaiting DB write inside TransformStream flush:** This blocks the stream close event. Use fire-and-forget (`writeSection(...).catch(console.error)`).
- **Building TipTap in Phase 7:** Explicitly deferred to Phase 8 (D-04). Phase 7 streaming cards are plain `<div>` + `<pre>` / `<p>` elements.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE streaming | Custom chunked encoding | Deno `ReadableStream` piped from Anthropic response | Native Web Streams API; Deno handles backpressure |
| Realtime section updates | WebSocket or polling | `supabase.channel().on('postgres_changes')` | Already in project; free with Supabase plan |
| Section prompt templates | New prompt system | Adapt `cro-proposal-generator.js` `CRO_PROPOSAL_SYSTEM_PROMPT` | Production-quality, covers all sections |
| Wave sequencing | Complex state machine library | `useReducer` + `Promise.all` (established pattern) | Consistent with Phase 5/6 wizard pattern |

---

## Common Pitfalls

### Pitfall 1: Edge Function JWT Auth on Streaming Response
**What goes wrong:** `supabase.functions.invoke()` (JS client) does not support streaming responses — it buffers the full response body before returning. The section stream arrives all at once after the section finishes generating.
**Why it happens:** `supabase.functions.invoke()` uses the standard fetch API with `response.json()`.
**How to avoid:** Use raw `fetch()` to call the Edge Function URL, not `supabase.functions.invoke()`. Pass the Supabase JWT manually in the `Authorization` header. The Edge Function URL is `${SUPABASE_URL}/functions/v1/generate-proposal-section`.
**Warning signs:** Streaming card stays empty then snaps to full text; no incremental characters visible.

### Pitfall 2: Supabase Edge Function 150-Second Timeout
**What goes wrong:** Long sections (Scope of Work covers 13 sub-sections) may exceed 150s on slow Anthropic responses.
**Why it happens:** Supabase Edge Functions have a hard 150s wall-clock timeout (noted in STATE.md critical risks).
**How to avoid:** Keep `max_tokens` per section to ≤8000 tokens. The section-by-section approach (not full proposal in one call) is specifically designed to stay within this limit. Wave 2 parallel calls each run independently, so no single call bears the full load.
**Warning signs:** Browser receives a truncated stream; `proposal_sections.status` stays `generating` (DB write in flush never fires).

### Pitfall 3: Realtime RLS Policy Blocking Subscriptions
**What goes wrong:** Supabase Realtime `postgres_changes` subscriptions require the subscribing user to have SELECT permission via RLS on the table. If the `proposal_sections` RLS policy only grants access by `org_id` but the Realtime channel doesn't pass the auth context correctly, subscription events silently drop.
**Why it happens:** Realtime uses the user's JWT to evaluate RLS. If the channel is created before the session is established, or if the policy is misconfigured, events are filtered out server-side with no client error.
**How to avoid:** Create the Realtime channel only after `session` is confirmed in AuthContext. Pass `session.access_token` when creating the Supabase client (project already handles this via AuthContext). Verify `proposal_sections` RLS policy allows `SELECT` with `org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())`.
**Warning signs:** SSE streaming works (section text appears live) but `status` never snaps to `complete` in the card; Realtime events never fire.

### Pitfall 4: TransformStream flush() Race with Response Close
**What goes wrong:** The DB write (REQ-4.5) fires in `flush()` but the Edge Function response has already been sent. If the write fails, there is no way to surface the error to the client.
**Why it happens:** Streaming responses are one-way; once the response is returned, error communication requires a side-channel (Supabase Realtime).
**How to avoid:** Log errors in `flush()` with `console.error`. The client knows a write failed when Realtime does not deliver a `status: 'complete'` update within a timeout (e.g., 10s after SSE closes). Design the error card state to trigger a "section failed — retry?" prompt when Realtime doesn't confirm within that window.
**Warning signs:** SSE stream completes normally, live text displayed, but `proposal_sections` row never updates from `generating` to `complete`.

### Pitfall 5: `supabase.functions.invoke` Import in Deno (Edge Function calling another function)
**What goes wrong:** If the anchor extraction is implemented as an Edge Function and `generate-proposal-section` tries to call it via the Supabase client, this creates a recursive Edge Function call. Supabase does not support this pattern reliably in all regions.
**Why it happens:** Edge Functions don't have a native way to call sibling functions except via HTTP.
**How to avoid:** Implement anchor extraction as a Haiku call directly inside `generate-proposal-section` (when `_anchorMode: true` flag is set), OR keep anchor extraction entirely client-side (call Anthropic Haiku from the browser via a dedicated Edge Function after each section SSE stream closes). Do NOT chain Edge Functions.

---

## Code Examples

### Edge Function: Streaming response setup
```typescript
// Source: Anthropic API docs + Deno Web Streams — established pattern
// Full skeleton for generate-proposal-section/index.ts

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const body = await req.json()
  // ... validate payload, build prompts ...

  const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8000, stream: true, ... }),
  })

  let fullText = ''
  const { readable, writable } = new TransformStream({
    transform(chunk, controller) {
      // accumulate text from SSE deltas
      accumulateText(chunk, (delta) => { fullText += delta })
      controller.enqueue(chunk)
    },
    flush() {
      writeSection(supabase, proposalId, sectionId, orgId, fullText)
        .catch(err => console.error('[generate-proposal-section] flush write error:', err))
    },
  })

  anthropicResp.body!.pipeTo(writable)

  return new Response(readable, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
})
```

### Client: Raw fetch for streaming (not supabase.functions.invoke)
```typescript
// Source: Fetch Streams API (browser-native)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const { session } = useAuth()

const response = await fetch(
  `${SUPABASE_URL}/functions/v1/generate-proposal-section`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session!.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(payload),
  }
)
```

### writeSection helper
```typescript
async function writeSection(
  supabase: SupabaseClient,
  proposalId: string,
  sectionId: string,
  orgId: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from('proposal_sections')
    .upsert({
      proposal_id: proposalId,
      org_id: orgId,
      section_key: sectionId,
      section_name: SECTION_NAMES[sectionId],
      content,
      status: 'complete',
      generated_at: new Date().toISOString(),
    }, { onConflict: 'proposal_id,section_key' })

  if (error) throw new Error(`writeSection failed: ${error.message}`)
}
```

Note: `proposal_sections` has `UNIQUE(proposal_id, section_key)` — use `upsert` with `onConflict` for idempotent regeneration (REQ-4.7).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Buffer full LLM response, return JSON | SSE stream piped directly to browser | Anthropic API stream support (~2023) | Sections appear character-by-character; no timeout risk |
| Pass all prior sections as context | ~500-token consistency anchor | Design decision in this project | O(1) context size per section vs O(n²) |
| `supabase.functions.invoke()` for streaming | Raw `fetch()` with JWT header | Supabase SDK limitation (current) | Required to get true streaming; invoke() buffers |

---

## Schema Reference (proposal_sections)

From `20260305000005_proposal_sections.sql`:
```sql
-- Key columns for Phase 7:
section_key   TEXT NOT NULL           -- e.g. 'understanding', 'executive_summary'
content       TEXT                    -- written by Edge Function on stream close
status        TEXT DEFAULT 'pending'  -- 'pending'|'generating'|'complete'|'error'|'needs_review'
is_locked     BOOLEAN DEFAULT FALSE
version       INTEGER DEFAULT 1
generated_at  TIMESTAMPTZ
UNIQUE(proposal_id, section_key)      -- enables upsert for regeneration
```

Phase 7 uses `status` field for card display state. The orchestrator should set `status = 'generating'` via a client-side DB update before firing the SSE call, so the card shows the correct state even before tokens arrive.

---

## Section ID Canonical Mapping

From `cro-proposal-generator.js` PROPOSAL_SECTIONS + D-01 wave decisions:

| section_key | section_name | Wave |
|------------|--------------|------|
| `understanding` | Understanding of the Study | 1 (anchor) |
| `scope_of_work` | Scope of Work & Service Delivery | 2 (parallel) |
| `proposed_team` | Proposed Team & Organizational Structure | 2 (parallel) |
| `timeline` | Timeline & Milestones | 2 (parallel) |
| `budget` | Budget & Pricing | 2 (parallel) |
| `regulatory_strategy` | Regulatory Strategy | 2 (parallel) |
| `quality_management` | Quality Management | 2 (parallel) |
| `executive_summary` | Executive Summary | 3 (summary) |
| `cover_letter` | Cover Letter | 3 (summary) |

Note: The `cro-proposal-generator.js` PROPOSAL_SECTIONS array uses different IDs (legacy). Phase 7 defines a canonical section map aligned with the `proposal_sections` `section_key` column. The planner should define this map as a shared constant (import in both the orchestrator and Edge Function).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Dev tooling | ✓ | v22.18.0 | — |
| Supabase CLI | Edge Function deploy | ✓ | 2.84.0 | — |
| Anthropic API key | Edge Function (ANTHROPIC_API_KEY secret) | ✓ (set in prior phases) | — | — |
| Supabase project (fuuvdcvbliijffogjnwg) | All Supabase calls | ✓ (live) | — | — |
| `proposal_sections` table | REQ-4.5 | ✓ (migrated in Phase 1) | — | — |
| `retrieve-context` Edge Function | REQ-4.9 | ✓ (deployed in Phase 4) | — | — |
| Supabase Realtime | REQ-4.6 | ✓ (included in all Supabase plans) | — | — |

**Missing dependencies with no fallback:** None — all dependencies confirmed available.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.4 (client) + Deno built-in (Edge Functions) |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npm run test:run` |
| Full suite command | `npm run test:run` (no coverage flag per project decision) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-4.1 | API key never in browser — Edge Function handles Anthropic call | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ Wave 0 |
| REQ-4.2 | Wave sequencing: understanding first, summary last | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ Wave 0 |
| REQ-4.3 | Consistency anchor ~500 tokens, not full text | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ Wave 0 |
| REQ-4.4 | SSE stream arrives incrementally (not buffered) | integration/manual | manual smoke test | — |
| REQ-4.5 | Section written to DB on stream close | unit | `supabase/functions/generate-proposal-section/test.ts` | ❌ Wave 0 |
| REQ-4.6 | Realtime subscription receives section updates | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ Wave 0 |
| REQ-4.7 | Single section regeneration works independently | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ Wave 0 |
| REQ-4.8 | Tone parameter passed through to Edge Function payload | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ Wave 0 |
| REQ-4.9 | RAG chunks included in generation payload | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ Wave 0 |
| REQ-4.10 | `[PLACEHOLDER: ...]` markers preserved in output | manual | manual smoke test | — |

### Sampling Rate
- **Per task commit:** `npm run test:run`
- **Per wave merge:** `npm run test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/hooks/useProposalGeneration.test.ts` — covers REQ-4.2, 4.3, 4.6, 4.7, 4.8, 4.9
- [ ] `supabase/functions/generate-proposal-section/test.ts` — covers REQ-4.5 (Deno test: writeSection helper + payload parsing)
- [ ] `src/components/SectionStreamCard.test.tsx` — covers streaming card status display
- [ ] `src/types/generation.ts` — SectionStatus, GenerationState type contracts

Note: REQ-4.4 (actual SSE streaming) and REQ-4.10 (placeholder preservation) are manual-only. Automated tests for streaming would require a live Edge Function + Anthropic API — out of scope for unit tests. Use it.skip stubs per established project pattern.

---

## Open Questions

1. **Anchor extraction placement: mode flag vs. separate function**
   - What we know: D-06 says Haiku is used for anchor extraction; D-09 says client orchestrator manages assembly
   - What's unclear: Whether anchor extraction runs in `generate-proposal-section` (with a mode flag) or requires a dedicated Edge Function
   - Recommendation: Add `_anchorMode: true` flag to `generate-proposal-section`. When set, accept `text` field, call Haiku with a 500-token summarization prompt, return JSON `{ anchor: "..." }` (non-streaming). Avoids a new function deployment.

2. **Section `status` update before streaming begins**
   - What we know: The card needs to show `generating...` immediately when the section call starts, before any SSE tokens arrive
   - What's unclear: Whether this is a client-side optimistic update or an Edge Function pre-write
   - Recommendation: Client orchestrator does an optimistic DB update (`status: 'generating'`) immediately before firing the `fetch()` call. This is a direct Supabase client call, not through the Edge Function.

3. **Concurrency of Wave 2 calls and Edge Function limits**
   - What we know: Wave 2 fires 6 sections in parallel; each is a separate Edge Function invocation
   - What's unclear: Whether 6 simultaneous Edge Function invocations hit any Supabase concurrency limit on the free/pro tier
   - Recommendation: The Supabase Pro plan supports concurrent Edge Function invocations without documented per-project limits. If throttling is observed, add a concurrency limiter (e.g., process 3 at a time with Promise batching). Flag as LOW risk; implement only if observed.

---

## Sources

### Primary (HIGH confidence)
- `cro-proposal-generator.js` — section definitions, system prompt, PROPOSAL_SECTIONS array, PLACEHOLDER rule
- `supabase/functions/extract-assumptions/index.ts` — canonical Edge Function boilerplate for this project
- `supabase/migrations/20260305000005_proposal_sections.sql` — exact schema for writes
- `src/types/wizard.ts` — ProposalInput structure (StudyInfo, assumptions, services)
- `supabase/functions/retrieve-context/index.ts` — RAG call pattern, system prompt block format
- `src/components/ProposalDraftRenderer.tsx` — component to extend (not replace)
- `.planning/STATE.md` — active decisions, critical risks, established patterns

### Secondary (MEDIUM confidence)
- Anthropic API streaming documentation — `stream: true`, SSE event format (`content_block_delta`), `[DONE]` terminator
- Supabase Realtime `postgres_changes` API — `supabase.channel().on()` subscription pattern
- Deno Web Streams API — `TransformStream`, `ReadableStream`, `pipeTo()` — native in Deno runtime

### Tertiary (LOW confidence)
- Supabase Pro plan Edge Function concurrency limits — not officially documented; LOW risk per community reports

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all patterns from prior phases
- Architecture: HIGH — SSE proxy, Realtime subscription, and wave orchestration are established patterns
- Pitfalls: HIGH — supabase.functions.invoke() streaming limitation is a known, documented constraint; others derived from project history

**Research date:** 2026-03-24
**Valid until:** 2026-06-24 (stable APIs; Anthropic streaming API format has been stable since mid-2023)
