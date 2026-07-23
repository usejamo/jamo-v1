# Demo Fixture Generation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every proposal section reach generation with a length + strategy target, and make truncation and role-classification failures announce themselves instead of silently baking into the permanent demo fixture.

**Architecture:** Prompt shaping happens in the Vitest-importable `promptAssembly.ts` (depth map + strategy hints keyed by role, with fallbacks). Truncation is detected server-side from the Anthropic `message_delta` SSE event, which makes the server *skip the persist* and emit a sentinel; the client discards the streamed text and raises a section error rather than completing — so the row stays blank and `demo-capture-fixture`'s existing blank-section refusal catches it. Template-role classification gains a coverage check so a truncated Haiku response flags `low_confidence` instead of returning `{}` silently.

**Tech Stack:** Deno edge functions (Supabase), React + Vitest frontend, Postgres. Anthropic Messages API (streaming SSE for generation, non-streaming for classification).

## Global Constraints

- Generation `max_tokens` stays **4000** (`generate-proposal-section/index.ts:279`). The truncation guard is the safety net; the depth map keeps sections well under it.
- `comprehensive` depth target is **1000–1200 words** — comfortably under the 4000-token ceiling so the guard trips on anomalies, not on a section doing its job.
- Canonical role spelling is **`study_understanding`** (matches `KNOWN_ROLES`, `ROLE_OPTIONS`). `understanding` is aliased, never introduced as new.
- Deno edge files import from `deno.land`/`esm.sh` at top level and **cannot be imported by Vitest**. Testable logic goes in pure sibling modules with no Deno imports (the established `promptAssembly.ts` pattern). Cross-boundary constants are duplicated, never imported.
- **Do NOT edit already-applied migration `20260427000024`.** Corrective data changes go in a new forward migration (editing an applied migration risks checksum divergence in already-diverged environments).
- Live Supabase project ref: **`fuuvdcvbliijffogjnwg`**. Edge deploys use `SUPABASE_ACCESS_TOKEN` from `.env` (`export SUPABASE_ACCESS_TOKEN=$(grep -m1 '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2- | tr -d '"' | tr -d "\r")`).
- Run frontend/pure tests with `npm run test:run -- <pattern>`. Full suite baseline is green; keep it green.

---

## Task 1: Section depth map in the generation prompt

**Files:**
- Modify: `supabase/functions/generate-proposal-section/promptAssembly.ts` (add `SECTION_DEPTH` + `DEPTH_GUIDANCE`; emit a depth block in `buildSectionPromptV2`, ~line 230)
- Test: `supabase/functions/generate-proposal-section/promptAssembly.test.ts`

**Interfaces:**
- Produces: `export const SECTION_DEPTH: Record<string, 'brief'|'standard'|'comprehensive'>` (21 KNOWN_ROLES keys) and `export const DEPTH_GUIDANCE: Record<'brief'|'standard'|'comprehensive', string>`. `buildSectionPromptV2` now always appends a `SECTION LENGTH:` block using `SECTION_DEPTH[sectionRole ?? ''] ?? 'standard'`.

- [ ] **Step 1: Write the failing test**

Add to `promptAssembly.test.ts`:
```typescript
import { buildSectionPromptV2, SECTION_DEPTH, DEPTH_GUIDANCE } from './promptAssembly.ts'

function baseV2(role: string | null) {
  return buildSectionPromptV2({
    sectionId: 's', sectionName: 'S', sectionDescription: null, sectionRole: role,
    tone: 'formal', regulatoryChunks: [], proposalChunks: [], regulatoryCount: 0,
    priorSections: [], proposalContext: {},
  })
}

describe('section depth', () => {
  it('emits a SECTION LENGTH block for a known role (comprehensive for study_understanding)', () => {
    const { system } = baseV2('study_understanding')
    expect(system).toContain('SECTION LENGTH:')
    expect(system).toContain(DEPTH_GUIDANCE.comprehensive)
  })
  it('falls back to standard depth for a null role', () => {
    const { system } = baseV2(null)
    expect(system).toContain('SECTION LENGTH:')
    expect(system).toContain(DEPTH_GUIDANCE.standard)
  })
  it('falls back to standard depth for an off-list role (site_selection)', () => {
    const { system } = baseV2('site_selection')
    expect(system).toContain(DEPTH_GUIDANCE.standard)
  })
  it('maps all 21 known roles to a depth level', () => {
    expect(Object.keys(SECTION_DEPTH).length).toBe(21)
    for (const v of Object.values(SECTION_DEPTH)) {
      expect(['brief', 'standard', 'comprehensive']).toContain(v)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- promptAssembly`
Expected: FAIL — `SECTION_DEPTH`/`DEPTH_GUIDANCE` not exported; `SECTION LENGTH:` not in prompt.

- [ ] **Step 3: Write minimal implementation**

In `promptAssembly.ts`, after `COMPLIANCE_CLAUSE` (near line 71), add:
```typescript
// Per-role output size. Keyed by the same role vocabulary as KNOWN_ROLES (study_understanding,
// not understanding). `?? 'standard'` at the call site covers null and any off-list role, so no
// section can reach generation without a length target.
export const SECTION_DEPTH: Record<string, 'brief' | 'standard' | 'comprehensive'> = {
  cover_letter: 'brief', executive_summary: 'standard', study_understanding: 'comprehensive',
  company_overview: 'brief', therapeutic_experience: 'standard', references: 'brief',
  scope_of_work: 'comprehensive', project_management: 'standard', proposed_team: 'standard',
  clinical_operations: 'standard', site_management: 'standard', patient_recruitment: 'standard',
  data_management: 'standard', biostatistics: 'standard', medical_writing: 'brief',
  regulatory_strategy: 'standard', pharmacovigilance: 'standard', quality_management: 'standard',
  timeline: 'brief', assumptions: 'brief', budget: 'brief',
}

export const DEPTH_GUIDANCE: Record<'brief' | 'standard' | 'comprehensive', string> = {
  brief: 'Keep this section tight — roughly 200–400 words. Lead with the essentials, use a table or list where it carries the content, and stop once the point is made.',
  standard: 'Aim for roughly 500–800 words. Cover the topic thoroughly without padding; every paragraph should add something the sponsor needs.',
  comprehensive: 'This is a substantial section — roughly 1000–1200 words. Structure it around the scope above, give each sub-topic proportionate depth, and always finish with an explicit concluding paragraph. Never stop mid-thought or trail off; a section that ends abruptly reads as an error.',
}
```

In `buildSectionPromptV2`, immediately after the `Tone for this section` line (currently ~line 230, `system += \`\n\nTone for this section: ${tone}...\``), add:
```typescript
    const depthKey = SECTION_DEPTH[sectionRole ?? ''] ?? 'standard'
    system += `\n\nSECTION LENGTH: ${DEPTH_GUIDANCE[depthKey]}`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- promptAssembly`
Expected: PASS (existing specs still green).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-proposal-section/promptAssembly.ts supabase/functions/generate-proposal-section/promptAssembly.test.ts
git commit -m "feat(generation): per-role section depth map with standard fallback"
```

---

## Task 2: Strategy hints — fill gaps, generic fallback, rename+alias

**Files:**
- Modify: `supabase/functions/generate-proposal-section/promptAssembly.ts` (`roleHints` map ~207–216; strategy emit line ~226–228)
- Test: `supabase/functions/generate-proposal-section/promptAssembly.test.ts`

**Interfaces:**
- Produces: `buildSectionPromptV2` now always appends a `SECTION STRATEGY:` block. `roleHints` gains `study_understanding` (+ `understanding` alias), `scope_of_work`, `proposed_team`, `quality_management`; any unmatched role uses `GENERIC_STRATEGY`.

- [ ] **Step 1: Write the failing test**

Add to `promptAssembly.test.ts` (reuses `baseV2` from Task 1):
```typescript
describe('section strategy', () => {
  it('emits a specific hint for study_understanding', () => {
    expect(baseV2('study_understanding').system).toContain('credibility section')
  })
  it('understanding alias resolves to the same hint (fresh-env seed value)', () => {
    expect(baseV2('understanding').system).toContain('credibility section')
  })
  it('fills the previously-missing default roles', () => {
    expect(baseV2('scope_of_work').system).toContain('SECTION STRATEGY:')
    expect(baseV2('proposed_team').system).toContain('SECTION STRATEGY:')
    expect(baseV2('quality_management').system).toContain('SECTION STRATEGY:')
  })
  it('uses a generic strategy for a null role and an off-list role', () => {
    expect(baseV2(null).system).toContain('conclude explicitly')
    expect(baseV2('site_selection').system).toContain('conclude explicitly')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- promptAssembly`
Expected: FAIL — `understanding`/off-list/null produce no strategy block today; the 4 roles are missing.

- [ ] **Step 3: Write minimal implementation**

In `buildSectionPromptV2`, replace the `roleHints` object (currently ~207–216) with:
```typescript
    const studyUnderstandingHint =
      "Demonstrate deep comprehension of the sponsor's study. Reference protocol specifics and therapeutic context. This is your credibility section."
    const roleHints: Record<string, string> = {
      executive_summary: 'Write as a compelling 1–2 page executive summary. Synthesize all key points from prior sections. Lead with the CRO\'s strongest differentiators.',
      cover_letter: 'Write as a formal business letter. Keep under 1 page. Reference the sponsor by name. Express genuine enthusiasm and commitment.',
      budget: 'Organize as a structured financial breakdown. Use tables. Include payment milestone assumptions. Align all line items with scope of work.',
      timeline: 'Include a visual Gantt-style description. Reference specific milestones, durations, and dependencies. All dates must be internally consistent.',
      regulatory_strategy: groundedCount > 0
        ? 'Reference specific ICH-GCP guidelines (E6 R2/R3) and FDA/EMA guidance only where grounded in the provided [REGULATORY CONTEXT].'
        : 'No regulatory grounding is available for this section/geography. Do not reference or assert compliance with any named regulatory framework or guideline for this section. Flag any unresolved regulatory items with [PLACEHOLDER] per the CRITICAL RULES; never fabricate.',
      study_understanding: studyUnderstandingHint,
      understanding: studyUnderstandingHint, // alias: fresh envs whose seed wrote 'understanding'
      scope_of_work: 'Lead with a clear table or list of every service in scope, then give proportionate detail per service area. Be explicit about what is included and what is excluded.',
      proposed_team: 'Introduce named roles and responsibilities — a role-by-role table works well. Emphasize therapeutic-area and phase-relevant experience.',
      quality_management: 'Describe the quality system concretely: SOP framework, audit plan, deviation/CAPA handling, and how risk is managed across the study.',
    }
    const GENERIC_STRATEGY =
      'Structure the section around the scope described above. Lead with the material most decision-relevant to the sponsor, support claims with specifics, and conclude explicitly rather than trailing off.'
```

Replace the conditional strategy emit (currently `if (sectionRole && roleHints[sectionRole]) { system += \`\n\nSECTION STRATEGY: ${roleHints[sectionRole]}\` }`) with an always-emit:
```typescript
    const strategy = (sectionRole ? roleHints[sectionRole] : undefined) ?? GENERIC_STRATEGY
    system += `\n\nSECTION STRATEGY: ${strategy}`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- promptAssembly`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-proposal-section/promptAssembly.ts supabase/functions/generate-proposal-section/promptAssembly.test.ts
git commit -m "fix(generation): fill missing role hints, generic fallback, alias understanding->study_understanding"
```

---

## Task 3: Server-side truncation detection + discard + sentinel

**Files:**
- Create: `supabase/functions/generate-proposal-section/truncationSignal.ts`
- Create: `supabase/functions/generate-proposal-section/truncationSignal.test.ts`
- Modify: `supabase/functions/generate-proposal-section/index.ts` (transform loop ~309–315; flush ~317–355)

**Interfaces:**
- Produces: `export function parseStopReason(line: string): string | null` and `export const TRUNCATION_SENTINEL: string`. On `stop_reason === 'max_tokens'`, `flush` skips the DB write and enqueues `TRUNCATION_SENTINEL` to the stream. `max_tokens` stays 4000.
- Consumes (Task 4): the client reads `TRUNCATION_SENTINEL` as `data: {"type":"jamo_truncated"}`.

- [ ] **Step 1: Write the failing test**

Create `truncationSignal.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseStopReason, TRUNCATION_SENTINEL } from './truncationSignal.ts'

describe('parseStopReason', () => {
  it('extracts max_tokens from a message_delta line', () => {
    const line = 'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":4000}}'
    expect(parseStopReason(line)).toBe('max_tokens')
  })
  it('extracts end_turn from a normal completion', () => {
    expect(parseStopReason('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}')).toBe('end_turn')
  })
  it('returns null for a text delta', () => {
    expect(parseStopReason('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}')).toBeNull()
  })
  it('returns null for [DONE] and malformed lines', () => {
    expect(parseStopReason('data: [DONE]')).toBeNull()
    expect(parseStopReason('event: ping')).toBeNull()
    expect(parseStopReason('data: {oops')).toBeNull()
  })
  it('sentinel is a well-formed jamo_truncated SSE data line', () => {
    expect(TRUNCATION_SENTINEL).toContain('"type":"jamo_truncated"')
    expect(TRUNCATION_SENTINEL.startsWith('data: ')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- truncationSignal`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `truncationSignal.ts`:
```typescript
// Pure, Vitest-importable (no Deno top-level imports) — mirrors the promptAssembly extraction.
// The client half of the truncation contract lives in src/hooks/useProposalGeneration.ts.

// A custom terminal SSE event. Anthropic's own events are content_block_delta / message_delta /
// message_stop, so "jamo_truncated" cannot collide with an upstream frame.
export const TRUNCATION_SENTINEL = 'data: {"type":"jamo_truncated"}\n\n'

/** Returns the stop_reason from an Anthropic `message_delta` SSE line, else null. */
export function parseStopReason(line: string): string | null {
  const t = line.trim()
  if (!t.startsWith('data:')) return null
  const raw = t.slice(t.indexOf(':') + 1).trim()
  if (!raw || raw === '[DONE]') return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.type === 'message_delta' && typeof parsed?.delta?.stop_reason === 'string') {
      return parsed.delta.stop_reason
    }
  } catch {
    // Non-JSON SSE line (event:, ping, etc.)
  }
  return null
}
```

In `index.ts`, add the import near the top with the other local imports:
```typescript
import { parseStopReason, TRUNCATION_SENTINEL } from './truncationSignal.ts'
```

Change the accumulator declaration (currently `let fullText = ''`, ~line 307) to also track stop_reason:
```typescript
    let fullText = ''
    let stopReason: string | null = null
```

In the `transform` callback loop (currently ~311–314), capture stop_reason alongside the text delta:
```typescript
        for (const line of text.split('\n')) {
          const delta = parseSSEDelta(line)
          if (delta) fullText += delta
          const sr = parseStopReason(line)
          if (sr) stopReason = sr
        }
```

Change the flush signature to receive the controller and short-circuit on truncation — replace `async flush() {` (line 317) with:
```typescript
      async flush(controller: TransformStreamDefaultController) {
        // Truncated at the token ceiling: do NOT persist. Leaving the proposal_sections row
        // blank routes it into demo-capture-fixture's existing blank-section refusal, so a
        // cut-off section can never be baked into the fixture. Signal the client so it discards
        // the streamed text and raises a section error instead of completing.
        if (stopReason === 'max_tokens') {
          controller.enqueue(new TextEncoder().encode(TRUNCATION_SENTINEL))
          return
        }
```
(The existing placeholder-processing + write body follows unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- truncationSignal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-proposal-section/truncationSignal.ts supabase/functions/generate-proposal-section/truncationSignal.test.ts supabase/functions/generate-proposal-section/index.ts
git commit -m "feat(generation): detect max_tokens truncation server-side, skip persist, emit sentinel"
```

---

## Task 4: Client-side truncation handling (the half that actually protects the fixture)

**Files:**
- Modify: `src/hooks/useProposalGeneration.ts` (`readSSEStream` 126–171; `generateSection` stream handling 426–437)
- Test: `src/hooks/useProposalGeneration.test.ts`

**Interfaces:**
- Consumes: `TRUNCATION_SENTINEL` as an SSE line `data: {"type":"jamo_truncated"}` (Task 3).
- Produces: `readSSEStream(response, onToken, signal?, onControl?)` — new optional 4th param `onControl?: (evt: { type: string }) => void`. On truncation, `generateSection` dispatches `SECTION_ERROR`, returns `''`, and does **not** schedule the 10s `SECTION_COMPLETE` fallback.

**Context:** Without this task the server-side discard is undone by the client — `readSSEStream` accumulates `fullText` (429), and a 10s fallback dispatches `SECTION_COMPLETE` from that local text (433–435), which the autosave/refetch path then persists (see the 402 handler note at index-level line 414–415). The row would not stay blank.

- [ ] **Step 1: Write the failing test**

Add to `useProposalGeneration.test.ts`:
```typescript
import { readSSEStream } from './useProposalGeneration'

function sseResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const l of lines) c.enqueue(new TextEncoder().encode(l + '\n')); c.close() },
  })
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

describe('readSSEStream truncation control event', () => {
  it('routes jamo_truncated to onControl and never to onToken', async () => {
    const tokens: string[] = []
    const controls: string[] = []
    await readSSEStream(
      sseResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}',
        'data: {"type":"jamo_truncated"}',
      ]),
      (t) => tokens.push(t),
      undefined,
      (e) => controls.push(e.type),
    )
    expect(tokens).toEqual(['partial'])
    expect(controls).toEqual(['jamo_truncated'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- useProposalGeneration`
Expected: FAIL — `readSSEStream` has no 4th param; `jamo_truncated` is ignored.

- [ ] **Step 3: Write minimal implementation**

Change the `readSSEStream` signature (line 126–130) to add the optional control callback:
```typescript
export async function readSSEStream(
  response: Response,
  onToken: (token: string) => void,
  signal?: AbortSignal,
  onControl?: (evt: { type: string }) => void
): Promise<void> {
```

Inside the line loop (after `const parsed = JSON.parse(raw)`, line 158), handle the control event before the text-delta branch:
```typescript
        const parsed = JSON.parse(raw)
        if (parsed.type === 'jamo_truncated') { onControl?.({ type: 'jamo_truncated' }); continue }
        if (
          parsed.type === 'content_block_delta' &&
          parsed.delta?.type === 'text_delta' &&
          typeof parsed.delta?.text === 'string'
        ) {
          onToken(parsed.delta.text)
        }
```

In `generateSection`, replace the stream-read + fallback block (426–435) with:
```typescript
      let fullText = ''
      let truncated = false
      await readSSEStream(response, (token) => {
        fullText += token
        dispatch({ type: 'SECTION_TOKEN', sectionId: section.id, token })
      }, signal, (evt) => { if (evt.type === 'jamo_truncated') truncated = true })

      if (truncated) {
        // Server refused to persist a max_tokens-truncated section, so the DB row is blank and
        // capture will refuse it. Discard the streamed text and surface an error — do NOT run the
        // 10s complete-from-local-text fallback, which would re-materialize the cut-off content.
        dispatch({
          type: 'SECTION_ERROR',
          sectionId: section.id,
          error: 'This section hit the length limit and was discarded. Regenerate it.',
        })
        return ''
      }

      // Fallback: if Realtime hasn't confirmed within 10s, dispatch complete from local text
      setTimeout(() => {
        dispatch({ type: 'SECTION_COMPLETE', sectionId: section.id, content: fullText })
      }, 10000)

      return fullText
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- useProposalGeneration`
Expected: PASS.

- [ ] **Step 5: Trace the autosave/refetch path and add the blank-DB guard test**

The server skip + client SECTION_ERROR keep the row blank *unless* an editor autosave persists `liveText` independently. Locate the autosave:
```bash
grep -rn "last_saved_content\|autosave\|debounce" src --include=*.ts --include=*.tsx | head
```
Confirm autosave only fires for a section whose status is `complete`/editable (a `status: 'error'` section, with `finalContent === null`, must not be persisted). If autosave keys on editor content rather than status, add a guard: do not autosave a section whose reducer status is `'error'`. Add a reducer-level assertion test:
```typescript
it('SECTION_ERROR leaves finalContent null so nothing is persisted for a truncated section', () => {
  const start = generationReducer(initialGenState(['sec-1']), { type: 'SECTION_GENERATING', sectionId: 'sec-1' })
  const withText = generationReducer(start, { type: 'SECTION_TOKEN', sectionId: 'sec-1', token: 'cut off here' })
  const errored = generationReducer(withText, { type: 'SECTION_ERROR', sectionId: 'sec-1', error: 'truncated' })
  expect(errored.sections['sec-1'].status).toBe('error')
  expect(errored.sections['sec-1'].finalContent).toBeNull()
})
```
(Use the reducer + state helpers already present in this test file; match their existing names.)

Run: `npm run test:run -- useProposalGeneration`
Expected: PASS. If the grep shows autosave persists `liveText` regardless of status, add the status guard in that file and a test there before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useProposalGeneration.ts src/hooks/useProposalGeneration.test.ts
git commit -m "fix(generation): discard streamed text on truncation, suppress complete-fallback"
```

---

## Task 5: classifyRoles coverage check + larger token budget + low_confidence on miss

**Files:**
- Create: `supabase/functions/template-extract/coverage.ts`
- Create: `supabase/functions/template-extract/coverage.test.ts`
- Modify: `supabase/functions/template-extract/index.ts` (classifyRoles `max_tokens` line 131; `isLowConfidence` line 291)

**Interfaces:**
- Produces: `export function isCoverageComplete(sectionNames: string[], roleMap: Record<string, string | null>): boolean`. `isLowConfidence` becomes true when classification ran but did not return a key for every section (this is exactly what `{}` currently erases).

- [ ] **Step 1: Write the failing test**

Create `coverage.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { isCoverageComplete } from './coverage.ts'

describe('isCoverageComplete', () => {
  it('true when every section name is a key, including present-with-null (a real "no match")', () => {
    expect(isCoverageComplete(['A', 'B'], { A: 'budget', B: null })).toBe(true)
  })
  it('false when a section name is absent (never answered — what {} produces)', () => {
    expect(isCoverageComplete(['A', 'B'], { A: 'budget' })).toBe(false)
    expect(isCoverageComplete(['A', 'B'], {})).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- coverage`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `coverage.ts`:
```typescript
// A truncated or errored classifyRoles response returns {} — indistinguishable, until now, from
// "the model matched nothing". Key-present-with-null = a legitimate no-match. Key-absent = we
// never got an answer for that section. This distinguishes them.
export function isCoverageComplete(
  sectionNames: string[],
  roleMap: Record<string, string | null>
): boolean {
  return sectionNames.every((n) => Object.prototype.hasOwnProperty.call(roleMap, n))
}
```

In `index.ts`, add the import at top:
```typescript
import { isCoverageComplete } from './coverage.ts'
```
Raise the classification budget (line 131): `max_tokens: 200,` → `max_tokens: 2000,`.
Replace the low-confidence line (291) with:
```typescript
    const classificationRan = !!anthropicApiKey && sections.length > 0
    const classificationIncomplete =
      classificationRan && !isCoverageComplete(sections.map((s) => s.name), roleMap)
    const isLowConfidence = sections.length < 3 || wordCount < 200 || classificationIncomplete
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/template-extract/coverage.ts supabase/functions/template-extract/coverage.test.ts supabase/functions/template-extract/index.ts
git commit -m "fix(template-extract): flag low_confidence when role classification is incomplete"
```

---

## Task 6: Corrective forward migration for the seed role divergence

**Files:**
- Create: `supabase/migrations/20260723000001_fix_default_understanding_role.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Forward corrective migration (Phase: demo fixture hardening).
-- The applied DB has template_sections.role = 'study_understanding' for the Standard Proposal's
-- first section, but 20260427000024 seeded that id as 'understanding' under ON CONFLICT DO NOTHING,
-- so a fresh replay diverges from prod. Converge both to the canonical 'study_understanding' — the
-- value KNOWN_ROLES, ROLE_OPTIONS, and the depth/hint maps all key on.
-- Idempotent: the WHERE clause makes re-application a no-op. Do NOT edit 20260427000024.
UPDATE template_sections
SET role = 'study_understanding'
WHERE id = '00000000-0000-0000-0001-000000000001'
  AND role = 'understanding';
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply through the MCP `apply_migration` tool (name `fix_default_understanding_role`, project `fuuvdcvbliijffogjnwg`). Do NOT run `supabase db push` (history diverged).

- [ ] **Step 3: Verify**

Run (MCP `execute_sql`):
```sql
select role from template_sections where id = '00000000-0000-0000-0001-000000000001';
```
Expected: one row, `study_understanding`. (In prod this row was already `study_understanding`, so the UPDATE touches 0 rows — the value is the assertion, not the row count.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260723000001_fix_default_understanding_role.sql
git commit -m "fix(migration): converge default template section-1 role to study_understanding"
```

---

## Task 7: KNOWN_ROLES ↔ ROLE_OPTIONS parity guard

**Files:**
- Create: `src/lib/__tests__/roleVocabularyParity.test.ts`

**Context:** The Deno/Vite boundary forces `KNOWN_ROLES` (edge) and `ROLE_OPTIONS` (frontend) to be hand-maintained duplicates. Unlike `demoFixtureValidation`, nothing currently guards them — the `understanding`/`study_understanding` drift is proof of what that costs. This is a value-set + order equality check (the two differ in shape: `string[]` vs `{value,label}[]`).

- [ ] **Step 1: Write the failing test (make it real by asserting equality now)**

Create `roleVocabularyParity.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')

function extractKnownRoles(): string[] {
  const src = read('supabase/functions/template-extract/index.ts')
  const block = src.slice(src.indexOf('const KNOWN_ROLES'), src.indexOf('] as const'))
  // strip // comments, then pull every single-quoted token in array order
  const noComments = block.replace(/\/\/[^\n]*/g, '')
  return [...noComments.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

function extractRoleOptionValues(): string[] {
  const src = read('src/components/settings/TemplatesTab.tsx')
  const block = src.slice(src.indexOf('const ROLE_OPTIONS'), src.indexOf('\n]', src.indexOf('const ROLE_OPTIONS')))
  return [...block.matchAll(/value:\s*'([a-z_]+)'/g)].map((m) => m[1])
}

describe('role vocabulary parity (Deno/Vite duplication guard)', () => {
  it('KNOWN_ROLES equals ROLE_OPTIONS values, order included', () => {
    const known = extractKnownRoles()
    const options = extractRoleOptionValues()
    expect(known.length).toBe(21)
    expect(options).toEqual(known)
  })
})
```

- [ ] **Step 2: Run it — it should PASS immediately** (the two lists currently match)

Run: `npm run test:run -- roleVocabularyParity`
Expected: PASS. If it fails, the extraction regex is wrong or the lists have already drifted — fix the drift, not the test.

- [ ] **Step 3: Verify the guard actually catches drift**

Temporarily append `{ value: 'zzz_temp', label: 'Z' },` inside `ROLE_OPTIONS`, re-run — expect FAIL. Revert the edit, re-run — expect PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/roleVocabularyParity.test.ts
git commit -m "test: guard KNOWN_ROLES/ROLE_OPTIONS parity across the Deno-Vite boundary"
```

---

## Task 8: Capture-time placeholder-prose warning (heuristic, non-blocking)

**Files:**
- Create: `supabase/functions/demo-capture-fixture/proseScan.ts`
- Create: `supabase/functions/demo-capture-fixture/proseScan.test.ts`
- Modify: `supabase/functions/demo-capture-fixture/index.ts` (after sections are gathered; add `warnings` to the success response)

**Interfaces:**
- Produces: `export function scanPlaceholderProse(content: string): string[]`. Capture response gains a `warnings: Array<{ section: string; found: string[] }>` field. **This never blocks capture** — false positives must not wall off a legitimate fixture; the presenter decides.

- [ ] **Step 1: Write the failing test**

Create `proseScan.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { scanPlaceholderProse } from './proseScan.ts'

describe('scanPlaceholderProse', () => {
  it('flags the common self-instruction phrasings', () => {
    expect(scanPlaceholderProse('ranges from approximately insert validated FGF19 prevalence rate')).toContain('insert …')
    expect(scanPlaceholderProse('milestone date to be confirmed based on startup')).toContain('to be confirmed')
    expect(scanPlaceholderProse('value TBD at this stage')).toContain('TBD')
    expect(scanPlaceholderProse('see [citation needed]')).toContain('[citation')
  })
  it('does not false-positive on legitimate clinical prose', () => {
    expect(scanPlaceholderProse('biomarker sample collection and insertion of the catheter')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- proseScan`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `proseScan.ts`:
```typescript
// Heuristic capture-time WARNING (never a block). Catches the most common unbracketed
// self-instruction phrasings the model leaves in prose instead of using [PLACEHOLDER: …].
// A read of every section before capture remains the real safeguard; this converts the
// frequent phrasings from invisible to flagged.
const PROSE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'insert …', re: /\binsert\s+[a-z]/i },   // "insert X"; "insertion" (no space) is safe
  { label: 'to be confirmed', re: /to be confirmed/i },
  { label: 'to be determined', re: /to be determined/i },
  { label: 'TBD', re: /\bTBD\b/ },
  { label: '[citation', re: /\[citation/i },
]

export function scanPlaceholderProse(content: string): string[] {
  return PROSE_PATTERNS.filter((p) => p.re.test(content)).map((p) => p.label)
}
```

In `demo-capture-fixture/index.ts`, import it and, after the sections are fetched (the block that builds `sectionRows` / runs `findBlankSections`), collect warnings without blocking:
```typescript
import { scanPlaceholderProse } from './proseScan.ts'
// ...after sections are loaded and validated non-blank:
const warnings = sections
  .map((s) => ({ section: s.section_name ?? s.name ?? `position ${s.position}`, found: scanPlaceholderProse(s.content ?? '') }))
  .filter((w) => w.found.length > 0)
```
Add `warnings` to the existing success `Response` JSON body (alongside `fixture_id`, `version`, …).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- proseScan`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/demo-capture-fixture/proseScan.ts supabase/functions/demo-capture-fixture/proseScan.test.ts supabase/functions/demo-capture-fixture/index.ts
git commit -m "feat(demo-capture): warn (not block) on unbracketed placeholder prose at capture"
```

---

## Deploy + regenerate gate (must complete before capturing the fixture)

- [ ] **Deploy the three changed edge functions to prod:**
```bash
export SUPABASE_ACCESS_TOKEN=$(grep -m1 '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2- | tr -d '"' | tr -d "\r")
npx supabase functions deploy generate-proposal-section --project-ref fuuvdcvbliijffogjnwg
npx supabase functions deploy template-extract        --project-ref fuuvdcvbliijffogjnwg
npx supabase functions deploy demo-capture-fixture    --project-ref fuuvdcvbliijffogjnwg
```
(No proposal recreation needed — the current proposal's `proposal_sections` already carry the live roles.)

- [ ] **Regenerate every section fresh**, then **read each one before capture.** The plan does not catch unbracketed self-instruction prose beyond the Task 8 heuristic — the read is the real safeguard. Look specifically for "insert …", "to be confirmed/determined", "TBD", trailing/cut-off endings.

## Acceptance checks (verify the assembled prompt, not output length)

- [ ] A section with `role = null` produces a prompt containing **both** a `SECTION LENGTH:` block and a `SECTION STRATEGY:` block. Verify against the assembled `system` string (Task 1/2 tests cover this; spot-check one live prompt).
- [ ] A section with `role = 'site_selection'` (exists live, absent from all three code lists) produces both blocks, at `standard` depth + `GENERIC_STRATEGY`.
- [ ] Force `classifyRoles` to return `{}` (e.g. unset `ANTHROPIC_API_KEY` on a re-extract, or a >15-section template) and confirm the template lands `low_confidence = true` and the flag is surfaced in `SectionDisclosure` — not silently clean.
- [ ] Simulate a `max_tokens` truncation and confirm the section's `proposal_sections.content` stays blank in the DB and `demo-capture-fixture` refuses to capture it (existing `findBlankSections` path).

## Deferred — not in this plan

- `template_sections.target_depth` column (per-template depth override). The depth map from Task 1 becomes its default values. Do this only when depth genuinely needs to vary per template; the wiring is the `select` at `ProposalCreationWizard.tsx:151`, the object literal at `160–171`, a new `proposal_sections` column, and the payload at `useProposalGeneration.ts:371–386`. Deliberate work when there's a reason, not speculative infrastructure.

## Self-Review

- **Spec coverage:** Demo-blocking items → Tasks 1 (depth), 2 (strategy + rename/alias), 3+4 (truncation guard, both halves). Same-week → Tasks 5 (coverage), 6 (migration). Later → Tasks 7 (parity), 8 (prose warning). Acceptance checks and the read-before-capture gate are captured above. No spec item is unmapped.
- **Placeholder scan:** every code step contains real code; the one investigation step (Task 4 Step 5) carries a concrete grep + a real assertion test, not a hand-wave.
- **Type consistency:** `SECTION_DEPTH`/`DEPTH_GUIDANCE`, `parseStopReason`/`TRUNCATION_SENTINEL`, `isCoverageComplete`, `scanPlaceholderProse`, and `readSSEStream`'s new `onControl` param are named identically at definition and every call site. Reducer actions (`SECTION_TOKEN`/`SECTION_COMPLETE`/`SECTION_ERROR`) match `src/types/generation.ts`.
