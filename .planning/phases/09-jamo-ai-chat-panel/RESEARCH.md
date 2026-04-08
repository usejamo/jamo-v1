# Phase 9: Jamo AI Chat Panel - Research

**Researched:** 2026-03-30
**Domain:** React chat UI wiring, Supabase Edge Function streaming SSE, TipTap injection, RAG intent routing
**Confidence:** HIGH — all findings verified directly from source files in the repo

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Gap Surfacing — Proactive Analysis**
- D-01: After generation completes, gap analysis scans for `[PLACEHOLDER]` markers and thin sections. Results are NOT auto-opened — the chat panel stays collapsed.
- D-02: The rail icon pulses with a badge count (e.g. "3") to signal gaps exist. Auto-open is reserved for blocking errors only.
- D-03: When user opens panel after pulse, Jamo skips the greeting and opens mid-context: "I found 3 things worth addressing before you finalize this."
- D-04: Jamo surfaces gaps as sequential messages, capped at 3, each ending in a direct question with optional shortcut chips.
- D-05: If more than 3 gaps, the third message consolidates the remainder.

**Edit Proposal Flow**
- D-06: Jamo streams proposed edit into the chat bubble. Accept/Reject buttons appear when streaming completes. Same mental model as Phase 8.
- D-07: On Accept: snapshot target section → inject via `editorRef.current.insertContentAt()` → undoable with Cmd+Z. Never modify editor until explicit Accept.
- D-08: Chat panel header always shows active target: "Editing: Section 4.2 — Adverse Events".
- D-09: Default scope is targeted section only.
- D-10: Cross-section implications prompt a confirmation question before acting.
- D-11: Multi-section edits are multiple discrete proposals — one Accept/Reject per section.

**Context Building**
- D-12: Each call sends full text of locked/targeted section + section title/type + 200-char summaries of all other sections + sliding-window chat history.
- D-13: Never send full content of all sections on every call — expand on demand.
- D-14: Token-budget sliding window ~2000 tokens. Walk backwards, include whole messages until budget exhausted. System message and current section are fixed overhead.
- D-15: RAG intent detection in Edge Function via keyword matching: "protocol", "RFP", "SOW", "according to", "based on", "what does the". AI classification only for ambiguous cases.
- D-16: RAG chunks appended as a clearly labeled block separate from section content.

**"Explain This Section"**
- D-17: Quick chip "Explain this section" visible when a section is targeted.
- D-18: Natural language intent also triggers explain.
- D-19: Output is a chat bubble with inline doc references. Short quoted passage per citation.
- D-20: Citations reference source document name and chunk/section identifier.

### Claude's Discretion
- System prompt structure for `chat-with-jamo`
- Model choice (Sonnet 4.6 for generation; Haiku may suit intent detection)
- `proposal_chats` table schema additions (section_target_id column)
- Quick chip set beyond "Explain this section"
- Token counting approach for sliding window (char-based estimate acceptable)

### Deferred Ideas (OUT OF SCOPE)
- Margin annotations for source references in TipTap
- Side-by-side source overlay panel
</user_constraints>

---

## Summary

Phase 9 wires the existing `AIChatPanel` shell — which already has all visual/animation infrastructure — to a new `chat-with-jamo` Supabase Edge Function. The component UI (aurora border, rail, message list, ⌘J toggle, thinking indicator, quick chips, input) is complete and must not be rebuilt. Only `handleSubmit` and the panel's prop interface need to change.

The critical integration challenge is surfacing `editorRefs` from `SectionWorkspace` up to `ProposalDetail` so that `AIChatPanel` can call `insertContentAt()` on the targeted section. Currently `editorRefs` is a `Map<string, SectionEditorHandle>` internal to `SectionWorkspace` — it is not forwarded up. Phase 9 must expose it.

The `proposal_chats` table already exists in migration `20260305000009_proposal_chats.sql` but is missing a `section_target_id` column. A new migration is required to add it.

**Primary recommendation:** Build `chat-with-jamo` following the `section-ai-action` SSE pattern exactly (Deno.serve, `anthropic.messages.stream`, `data: ${JSON.stringify(event)}\n\n`, `data: [DONE]\n\n`), surface `editorRefs` via a forwarded ref or callback on `SectionWorkspace`, and add `section_target_id` migration.

---

## Implementation Concern 1: AIChatPanel Current Interface

### Existing Props (must change)
```typescript
interface Props {
  draftGenerated: boolean           // keep — gate for "generate first" message
  onCommand: (suggestion: PendingSuggestion) => void  // REMOVE — demo only
  onSuggestionResolved: () => void  // REMOVE — demo only
  lastResolution: 'accepted' | 'declined' | null      // REMOVE — demo only
}
```

### New Props Required
```typescript
interface Props {
  proposalId: string                          // for Edge Function calls and DB persistence
  orgId: string                               // for RAG retrieve-context calls
  draftGenerated: boolean                     // keep
  sections: Array<{ section_key: string; content: string; title: string }>  // for context payload
  editorRefs: React.MutableRefObject<Map<string, SectionEditorHandle>>      // for injection
  activeSectionKey: string | null             // currently targeted section
  gapCount: number                            // drives rail badge pulse; 0 = no badge
}
```

### State to Add Inside AIChatPanel
- `messages: ChatMessage[]` — extended to support `citations?: Citation[]` and `editProposal?: EditProposal`
- `targetSectionKey: string | null` — which section edit proposals land in
- `gapMessages: GapMessage[]` — pre-computed from gap analysis, consumed sequentially on first open

### What to Preserve
Everything visual: `SpectrumSparkle`, `AuroraBorder`, `Rail`, `AnimatePresence` transitions, ⌘J handler, auto-scroll, thinking indicator. Only `handleSubmit` internals and the `Rail` component need gap-badge augmentation.

---

## Implementation Concern 2: editorRef Surfacing

### Current State (verified from source)
`SectionWorkspace.tsx` line 25:
```typescript
const editorRefs = useRef<Map<string, SectionEditorHandle>>(new Map())
```
This ref is populated at lines 180–182 via a ref callback on each `SectionEditorBlock`. It is **not currently exposed** outside `SectionWorkspace`.

### SectionEditorHandle Interface (verified from SectionEditorBlock.tsx lines 87–89)
```typescript
// Exposed via useImperativeHandle
{
  insertContentAt: (pos: number, content: string) => void
  // setContent also exists (used at line 146)
}
```

### Required Change
`SectionWorkspace` must accept a `onEditorRefsReady` callback prop or be wrapped with `forwardRef` to expose the `editorRefs` map. The simplest approach:

```typescript
// SectionWorkspace new prop
interface SectionWorkspaceProps {
  // ...existing props...
  editorRefsRef?: React.MutableRefObject<Map<string, SectionEditorHandle>>
}
// Inside SectionWorkspace, replace local ref with the passed ref when provided
```

`ProposalDetail` creates the ref, passes it to both `SectionWorkspace` and `AIChatPanel`.

### Injection Call Site
```typescript
// In AIChatPanel accept handler:
const handle = editorRefs.current.get(targetSectionKey)
if (handle) {
  handle.insertContentAt(0, proposedContent)  // pos 0 replaces entire section
}
```

---

## Implementation Concern 3: SSE Streaming Pattern (chat-with-jamo Edge Function)

### Verified Pattern (from section-ai-action/index.ts)
```typescript
// section-ai-action is the most recent Edge Function — use this pattern exactly

import Anthropic from 'npm:@anthropic-ai/sdk'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6-20251001',  // use Sonnet for chat; Haiku for intent-only
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [...chatHistory, { role: 'user', content: userMessage }],
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
})
```

### Key differences from generate-proposal-section
- `section-ai-action` uses `npm:@anthropic-ai/sdk` import (NOT the deno.land URL) — confirmed current pattern
- Uses `Deno.serve()` not `serve()` from std — confirmed current pattern
- Event loop: `for await (const event of stream)` — streams raw SDK events as JSON

### Client-Side SSE Reading Pattern (from Phase 7/8 hooks)
```typescript
const response = await supabase.functions.invoke('chat-with-jamo', {
  body: payload,
})
// response.data is a ReadableStream
const reader = response.data.getReader()
const decoder = new TextDecoder()
// parse 'data: {...}\n\n' lines, extract delta text from content_block_delta events
```

---

## Implementation Concern 4: proposal_chats Table

### Existing Schema (migration 20260305000009_proposal_chats.sql)
```sql
CREATE TABLE proposal_chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,  -- 'user' or 'assistant'
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proposal_chats_proposal_id ON proposal_chats(proposal_id);
```

### Missing Column
`section_target_id TEXT` is absent. Required per D-08/D-12 to record which section each message was sent in context of, and to reconstruct per-session context.

### New Migration Required
```sql
-- supabase/migrations/20260330000019_proposal_chats_section_target.sql
ALTER TABLE proposal_chats
  ADD COLUMN section_target_id TEXT,      -- FK-free; matches section_key string
  ADD COLUMN message_type TEXT DEFAULT 'chat';  -- 'chat' | 'gap' | 'explain'
```

### RLS
The existing `proposal_chats` table has no RLS policies visible in the migration itself — check `20260305000013_rls_policies.sql` before writing. At minimum, insert/select must be gated to `org_id = auth.jwt()->>'org_id'`.

---

## Implementation Concern 5: Gap Analysis Trigger in ProposalDetail

### Current Generation Completion Signal
`ProposalDetail.tsx` line 130: `const [generated, setGenerated] = useState(...)` — set to `true` when `proposalSections` loads from Supabase (line 165) or via sessionStorage.

`genState.isGenerating` (from `useProposalGeneration`) transitions to `false` when the last wave completes — this is the streaming-mode completion signal.

### Gap Trigger Point
Gap analysis should fire when:
```
genState.isGenerating === false && genState.completedCount === genState.totalCount && genState.totalCount > 0
```
This is the post-streaming completion moment. `ProposalDetail` can run gap analysis in a `useEffect` watching these values, then pass `gapCount` to `AIChatPanel`.

### Gap Detection Logic
Scan `proposalSections` (or `genState.sections`) for:
1. Sections where `content` contains `[PLACEHOLDER]`
2. Sections where `content.length < 200` (thin section heuristic)
3. Sections where `status === 'error'`

This runs client-side — no Edge Function needed for gap detection itself.

### Section Key Map (from types/generation.ts)
```typescript
// 9 sections across 3 waves:
understanding, scope_of_work, proposed_team, timeline, budget,
regulatory_strategy, quality_management, executive_summary, cover_letter
```

---

## Implementation Concern 6: AIActionPreview Component API

### Verified Props (AIActionPreview.tsx)
```typescript
interface AIActionPreviewProps {
  previewContent: string      // HTML string — rendered via dangerouslySetInnerHTML
  isStreaming: boolean        // disables Accept button, shows "Generating..." label
  actionType: 'expand' | 'condense' | 'generate' | 'regenerate'
  onAccept: () => void
  onDecline: () => void
}
```

### Phase 9 Usage Pattern
For chat edit proposals, `AIActionPreview` will be embedded **inside a chat bubble** (not in the section block). The `actionType` will likely be a new value like `'chat-edit'` — or Phase 9 renders its own inline preview variant within the message bubble rather than reusing `AIActionPreview` directly.

Recommendation: create a `ChatEditPreview` sub-component inside `AIChatPanel.tsx` styled for the chat bubble context (narrower, chat-bubble radius, no blue border). It follows the same `previewContent / isStreaming / onAccept / onDecline` contract but is visually distinct.

---

## Implementation Concern 7: retrieve-context Function Signature

### Verified Request Shape (retrieve-context/index.ts)
```typescript
interface RetrieveRequest {
  orgId: string
  query: string
  therapeuticArea?: string  // optional filter
}
```

### Verified Response Shape
```typescript
interface RetrieveResponse {
  regulatoryChunks: Chunk[]
  proposalChunks: Chunk[]
  systemPromptBlock: string     // pre-formatted "[REGULATORY CONTEXT]...[PROPOSAL HISTORY]..." block
  retrievalMeta: {
    regulatoryCount: number
    proposalCount: number
    belowThreshold: boolean
  }
}
```

### How chat-with-jamo Calls It
`chat-with-jamo` Edge Function calls `retrieve-context` as a **sub-fetch** (not a Supabase client RPC):
```typescript
const retrieveRes = await fetch(
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/retrieve-context`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ orgId, query: userMessage, therapeuticArea }),
  }
)
const ragData = await retrieveRes.json()
// Use ragData.systemPromptBlock as the RAG context block in the system prompt
```

---

## Implementation Concern 8: chat-with-jamo Request/Response Payload Design

### Recommended Request Payload
```typescript
interface ChatWithJamoRequest {
  proposal_id: string
  org_id: string
  user_message: string
  target_section: {
    key: string
    title: string
    content: string        // full plain text — HTML stripped client-side
  }
  other_sections: Array<{
    key: string
    title: string
    summary: string        // first 200 chars
  }>
  chat_history: Array<{   // sliding window, pre-filtered client-side
    role: 'user' | 'assistant'
    content: string
  }>
  intent_hint?: 'explain' | 'edit' | 'rag' | null  // optional client hint
}
```

### Intent Detection (D-15) — in Edge Function
```typescript
const RAG_KEYWORDS = ['protocol', 'rfp', 'sow', 'according to', 'based on', 'what does the']
const EXPLAIN_KEYWORDS = ['explain', 'where did this', 'source', 'citation', 'where does']
const EDIT_KEYWORDS = ['expand', 'condense', 'rewrite', 'add', 'remove', 'change', 'make it', 'shorten']

function detectIntent(message: string): 'rag' | 'explain' | 'edit' | 'general' {
  const lower = message.toLowerCase()
  if (EXPLAIN_KEYWORDS.some(k => lower.includes(k))) return 'explain'
  if (RAG_KEYWORDS.some(k => lower.includes(k))) return 'rag'
  if (EDIT_KEYWORDS.some(k => lower.includes(k))) return 'edit'
  return 'general'
}
```

### System Prompt Assembly Order
1. Role + CRO domain context (static)
2. `[TARGET SECTION]` block — full text of locked section
3. `[OTHER SECTIONS]` block — 200-char summaries labeled by title
4. `[REGULATORY CONTEXT / PROPOSAL HISTORY]` block — only when intent is `rag` or `explain`
5. `[INSTRUCTIONS]` — what type of response to produce based on intent

---

## Architecture Patterns

### Component Data Flow (Phase 9)

```
ProposalDetail
├── editorRefsMap = useRef<Map<string, SectionEditorHandle>>(new Map())
├── [gapCount, setGapCount] — computed after generation completes
├── SectionWorkspace
│   └── editorRefsRef={editorRefsMap}   ← new prop
│       └── SectionEditorBlock (forwardRef, exposes insertContentAt)
└── AIChatPanel
    ├── proposalId, orgId, draftGenerated
    ├── sections (for context payload)
    ├── editorRefs={editorRefsMap}       ← injects accepted edits
    ├── activeSectionKey
    └── gapCount                         ← drives rail badge
```

### Message Types in Chat State
```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isThinking?: boolean
  // New fields:
  citations?: Array<{ source: string; passage: string; chunkId: string }>
  editProposal?: {
    sectionKey: string
    proposedContent: string
    isStreaming: boolean
    status: 'pending' | 'accepted' | 'rejected'
  }
  messageType?: 'chat' | 'gap' | 'explain' | 'edit-proposal'
}
```

### Rail Badge Augmentation
The existing `Rail` component renders a pulsing dot. Phase 9 adds a numeric badge:
```typescript
// Rail component new props
function Rail({ onExpand, processing, gapCount }: {
  onExpand: () => void
  processing: boolean
  gapCount: number
}) {
  // Existing pulse dot stays — its animation speed driven by processing
  // New: orange badge overlaid on SpectrumSparkle when gapCount > 0
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE streaming | Custom WebSocket or polling | `anthropic.messages.stream` + `ReadableStream` | Established pattern in section-ai-action |
| RAG retrieval | New embedding/vector logic | `retrieve-context` function (already built) | Hybrid vector+FTS merge already implemented |
| TipTap content injection | Direct DOM manipulation | `SectionEditorHandle.insertContentAt()` | Already wired via useImperativeHandle |
| Token counting | tiktoken or similar library | Character-based estimate (~4 chars/token) | D-14 explicitly allows this; avoids dependency |
| Accept/Reject UI | New component from scratch | Pattern from `AIActionPreview.tsx` | Same mental model, adapt to chat bubble context |

---

## Common Pitfalls

### Pitfall 1: editorRefs Not Populated at Accept Time
**What goes wrong:** `editorRefs.current.get(sectionKey)` returns `undefined` because the Map is populated asynchronously as sections mount.
**Why it happens:** React ref callbacks fire per-section on mount. If the user accepts an edit before all sections are mounted, the target key may be missing.
**How to avoid:** Guard the accept handler: `if (!handle) { show error toast; return }`. Also ensure `SectionWorkspace` is fully mounted before enabling edit proposals — only allow edits when `draftGenerated === true`.

### Pitfall 2: Streaming into Chat Bubble Causes Layout Thrash
**What goes wrong:** Each SSE token appended to a chat bubble causes re-render, which scrolls erratically.
**Why it happens:** `bottomRef.current?.scrollIntoView()` fires in a `useEffect` watching `messages`. Every token update fires this.
**How to avoid:** Use a separate `streamingContent` state (not in `messages`) during streaming. Merge into messages only on `[DONE]`. Scroll-to-bottom only on message array change, not streaming content.

### Pitfall 3: RAG Sub-Fetch Timeout
**What goes wrong:** `chat-with-jamo` calls `retrieve-context` as a sub-fetch; Edge Function timeout is 60s default. If embedding + retrieval is slow, the outer function times out before responding.
**How to avoid:** Call `retrieve-context` only when intent is `rag` or `explain` (D-15). For `edit` and `general` intents, skip the sub-fetch entirely.

### Pitfall 4: proposal_chats RLS Missing
**What goes wrong:** Client-side inserts to `proposal_chats` fail with 403 or silently drop.
**Why it happens:** The existing migration creates the table but RLS policies may not cover it, or the `org_id` column check doesn't match the JWT claim.
**How to avoid:** Verify `20260305000013_rls_policies.sql` covers `proposal_chats`. If not, add in the Phase 9 migration.

### Pitfall 5: Ghost Gap Badge After User Dismisses
**What goes wrong:** Rail badge persists at count "3" even after user has walked through all gap messages.
**How to avoid:** Track consumed gap count in `AIChatPanel` state. When gap messages are exhausted, call `onGapsConsumed()` callback which sets `gapCount = 0` in `ProposalDetail`.

---

## Schema

### Existing proposal_chats (verified)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| proposal_id | UUID | FK → proposals |
| org_id | UUID | FK → organizations |
| role | TEXT | 'user' or 'assistant' |
| content | TEXT | |
| created_at | TIMESTAMPTZ | |

### Required Addition (new migration)
| Column | Type | Notes |
|--------|------|-------|
| section_target_id | TEXT | section_key string, nullable |
| message_type | TEXT | 'chat', 'gap', 'explain', 'edit-proposal' |

---

## Environment Availability

Step 2.6: SKIPPED — Phase 9 is purely code/function changes. No new external tools or runtimes beyond the established Supabase/Anthropic stack.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (confirmed — existing tests in `src/components/editor/__tests__/`) |
| Config file | `vite.config.ts` or `vitest.config.ts` (check root) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Behavior | Test Type | Notes |
|----------|-----------|-------|
| Gap detection logic (placeholder scan, thin section) | unit | Pure function — fully testable |
| Sliding window token budget (chat history truncation) | unit | Pure function — fully testable |
| Intent detection keyword matching | unit | Pure function |
| Rail badge shows correct count | unit (component) | Mock gapCount prop |
| Accept inject calls insertContentAt on correct ref | unit (component) | Mock editorRefs Map |
| Streaming content accumulates correctly | unit | Mock SSE reader |
| Chat history persisted to proposal_chats | integration | Requires Supabase client mock |

### Wave 0 Gaps
- [ ] `src/components/__tests__/AIChatPanel.test.tsx` — covers gap badge, accept/reject, streaming
- [ ] `src/utils/__tests__/chatContext.test.ts` — covers sliding window, intent detection, gap detection
- [ ] `supabase/migrations/20260330000019_proposal_chats_section_target.sql` — schema migration

---

## Sources

### Primary (HIGH confidence)
- `src/components/AIChatPanel.tsx` — full source read; props, state, all component structure
- `supabase/functions/section-ai-action/index.ts` — SSE pattern, Anthropic SDK import style, Deno.serve
- `supabase/functions/retrieve-context/index.ts` — request/response interface, hybrid merge logic
- `src/context/SectionWorkspaceContext.tsx` — WorkspaceState/WorkspaceAction shapes, reducer actions
- `src/components/editor/AIActionPreview.tsx` — exact prop interface
- `src/components/editor/SectionWorkspace.tsx` + `SectionEditorBlock.tsx` — editorRefs Map, SectionEditorHandle API
- `src/pages/ProposalDetail.tsx` — AIChatPanel render location, generation completion signals, all existing props
- `supabase/migrations/20260305000009_proposal_chats.sql` — exact existing schema
- `src/types/generation.ts` — section keys, SECTION_WAVE_MAP, SECTION_NAMES

### Secondary (MEDIUM confidence)
- `09-CONTEXT.md` — locked decisions D-01 through D-20, discretion areas

---

## Metadata

**Confidence breakdown:**
- Current AIChatPanel interface: HIGH — direct source read
- SSE streaming pattern: HIGH — verified from most recent Edge Function
- editorRef surfacing: HIGH — verified useImperativeHandle in SectionEditorBlock
- proposal_chats schema: HIGH — direct migration read
- retrieve-context API: HIGH — full source read
- Gap trigger in ProposalDetail: HIGH — generation state directly observed

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable codebase; re-verify if Phase 8 files change)
