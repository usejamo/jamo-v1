# Generation Resume & Navigation Survival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user resume a stopped or interrupted proposal generation without regenerating the sections that already finished, and keep the generation UI alive across in-app navigation.

**Architecture:** Generation stays client-driven. Progress derivation moves into a small pure module (`src/lib/generationProgress.ts`) that partitions sections by **content** rather than status. A new `RESUME_GENERATION` reducer action seeds state from that partition without resetting completed work. The single `useProposalGeneration` instance is hoisted into a `GenerationContext` above the routes, which supplies UI continuity and — critically — one shared re-entrancy guard so Resume can never start a second concurrent loop. `ProposalDetail`'s view mode stops reading sessionStorage and is derived from the section data.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest, @testing-library/react, Supabase (Postgres + Realtime + Edge Functions), Playwright for browser verification.

**Spec:** `docs/superpowers/specs/2026-09-12-generation-resume-design.md`

## Global Constraints

- **Frontend-only.** No changes under `supabase/functions/`, no migrations, no deploys. If a task seems to need one, stop and raise it.
- **Never regenerate a section that has content.** This is the prime directive of the whole feature. Partition on content, never on `status` — spec §2.6: 4 production rows carry editor-saved content under `status='generating'`.
- **Test baselines:** `npx vitest run` = 625 passed / 16 skipped before this work. `npx tsc --noEmit` = **303 pre-existing errors** — that is the baseline, not a regression. Compare counts; keep files you create at zero; do not chase the 303.
- **Dev server:** `npm run dev`. The port varies (5173 upward); read it from the log. A different port is a different origin, so the login session does not carry over. Login `usera@jamo.com` / `password123`.
- **Every commit message ends with these two lines:**
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01T5j6ivLB8WHxm5AjLYYv8q
  ```
- **`.env` must contain only `KEY=VALUE` lines.** A bare pasted command in there breaks every Supabase CLI invocation with a confusing parse error.

---

## File Structure

| path | responsibility |
|---|---|
| `src/lib/generationProgress.ts` | **new** — pure progress derivation: content test, partition, row→state mapping, phase. No React, no Supabase, no I/O. Kept out of the 640-line hook so it is trivially testable. |
| `src/lib/generationProgress.test.ts` | **new** — unit tests for the above |
| `src/types/generation.ts` | add `RESUME_GENERATION` action |
| `src/hooks/useProposalGeneration.ts` | extract `runLoop`; add `resumeGeneration`; use `rowToSectionState` in hydration |
| `src/context/GenerationContext.tsx` | **new** — single hook instance above the routes, claim protocol, shared guard |
| `src/components/GenerationHeader.tsx` | `onResume` prop + paused heading |
| `src/components/GenerationHeader.test.tsx` | **new** — render tests for the three control states |
| `src/pages/ProposalDetail.tsx` | consume provider; derive phase from data; widen `isStreamingMode`; wire Resume and Start-over |

---

### Task 1: Content test and section partition

**Files:**
- Create: `src/lib/generationProgress.ts`
- Test: `src/lib/generationProgress.test.ts`

**Interfaces:**
- Consumes: `SectionState` from `src/types/generation.ts`
- Produces:
  - `interface SectionRow { id: string; name: string | null; section_key?: string | null; description?: string | null; position: number | null; role: string | null; status: string | null; content: string | null }`
  - `hasContent(content: string | null | undefined): boolean`
  - `partitionSections(rows: SectionRow[]): { done: SectionRow[]; todo: SectionRow[] }`
  - `pickAnchorSource(done: SectionRow[]): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/generationProgress.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hasContent, partitionSections, pickAnchorSource } from './generationProgress'
import type { SectionRow } from './generationProgress'

function makeRow(overrides?: Partial<SectionRow>): SectionRow {
  return {
    id: 'sec-1',
    name: 'Understanding of the Study',
    section_key: null,
    description: null,
    position: 1,
    role: null,
    status: 'pending',
    content: null,
    ...overrides,
  }
}

describe('hasContent', () => {
  it('is false for null, undefined, empty string and whitespace', () => {
    expect(hasContent(null)).toBe(false)
    expect(hasContent(undefined)).toBe(false)
    expect(hasContent('')).toBe(false)
    expect(hasContent('   \n  ')).toBe(false)
  })

  it('is true for real content', () => {
    expect(hasContent('<p>Section text</p>')).toBe(true)
  })
})

describe('partitionSections', () => {
  it('classifies a content-bearing row as done even when status is generating', () => {
    // Guards the prime directive: 4 production rows carry editor-saved content
    // under status='generating'. Regenerating them would destroy user edits.
    const rows = [makeRow({ id: 'a', status: 'generating', content: '<p>edited by hand</p>' })]
    const { done, todo } = partitionSections(rows)
    expect(done.map(r => r.id)).toEqual(['a'])
    expect(todo).toEqual([])
  })

  it('classifies empty-string and null content as todo regardless of status', () => {
    const rows = [
      makeRow({ id: 'a', position: 1, status: 'generating', content: '' }),
      makeRow({ id: 'b', position: 2, status: 'complete', content: null }),
    ]
    const { done, todo } = partitionSections(rows)
    expect(done).toEqual([])
    expect(todo.map(r => r.id)).toEqual(['a', 'b'])
  })

  it('classifies error rows with no content as todo so Resume retries them', () => {
    const rows = [makeRow({ id: 'a', status: 'error', content: null })]
    const { todo } = partitionSections(rows)
    expect(todo.map(r => r.id)).toEqual(['a'])
  })

  it('orders both partitions by position, tolerating null positions', () => {
    const rows = [
      makeRow({ id: 'c', position: 3, content: '<p>x</p>' }),
      makeRow({ id: 'a', position: 1, content: '<p>x</p>' }),
      makeRow({ id: 'z', position: null, content: null }),
      makeRow({ id: 'b', position: 2, content: null }),
    ]
    const { done, todo } = partitionSections(rows)
    expect(done.map(r => r.id)).toEqual(['a', 'c'])
    expect(todo.map(r => r.id)).toEqual(['b', 'z'])
  })
})

describe('pickAnchorSource', () => {
  it('returns the content of the highest-position done section', () => {
    const done = [
      makeRow({ id: 'a', position: 1, content: 'first' }),
      makeRow({ id: 'b', position: 5, content: 'last' }),
    ]
    expect(pickAnchorSource(done)).toBe('last')
  })

  it('returns empty string when nothing is done', () => {
    expect(pickAnchorSource([])).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/generationProgress.test.ts`
Expected: FAIL — `Failed to resolve import "./generationProgress"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/generationProgress.ts`:

```ts
/**
 * Pure progress derivation for proposal generation.
 *
 * Everything here partitions and classifies sections by CONTENT, never by status.
 * Status drifts: a section interrupted mid-stream is stranded at 'generating' with
 * nothing written, and a handful of rows carry editor-saved content under that same
 * status. Content is the only field that reliably answers "is there work here to keep".
 */

/** Shape of a `proposal_sections` row as selected by the generation code paths. */
export interface SectionRow {
  id: string
  name: string | null
  section_key?: string | null
  description?: string | null
  position: number | null
  role: string | null
  status: string | null
  content: string | null
}

/** A section counts as done if, and only if, it holds non-whitespace content. */
export function hasContent(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.trim().length > 0
}

const byPosition = (a: SectionRow, b: SectionRow) =>
  (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)

/**
 * Split rows into the work already banked and the work still to do.
 * `done` is never regenerated; `todo` is what a resume loops over.
 */
export function partitionSections(rows: SectionRow[]): {
  done: SectionRow[]
  todo: SectionRow[]
} {
  const done: SectionRow[] = []
  const todo: SectionRow[] = []
  for (const row of rows) {
    if (hasContent(row.content)) done.push(row)
    else todo.push(row)
  }
  return { done: done.sort(byPosition), todo: todo.sort(byPosition) }
}

/**
 * The text the consistency anchor is rebuilt from on resume.
 *
 * The anchor is memoryless — it is a summary of the immediately preceding section
 * only, replaced (not accumulated) after each one. So re-deriving it from the
 * highest-position completed section reproduces exactly the value the loop held.
 */
export function pickAnchorSource(done: SectionRow[]): string {
  if (done.length === 0) return ''
  const last = [...done].sort(byPosition)[done.length - 1]
  return last.content ?? ''
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/generationProgress.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generationProgress.ts src/lib/generationProgress.test.ts
git commit -m "$(cat <<'EOF'
feat(generation): add content-based section partition helpers

Partition on content rather than status. An interrupted section strands at
status='generating' with nothing written, and some rows carry editor-saved
content under that same status, so status cannot answer "is there work to keep".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T5j6ivLB8WHxm5AjLYYv8q
EOF
)"
```

---

### Task 2: Row-to-state mapping and phase derivation

**Files:**
- Modify: `src/lib/generationProgress.ts`
- Test: `src/lib/generationProgress.test.ts`

**Interfaces:**
- Consumes: `hasContent` (Task 1), `SectionState` and `SectionStatus` from `src/types/generation.ts`
- Produces:
  - `rowToSectionState(row: SectionRow): SectionState`
  - `type GenerationPhase = 'not-started' | 'generating' | 'paused' | 'complete'`
  - `derivePhase(isGenerating: boolean, sections: SectionState[], totalCount: number): GenerationPhase`

**Note on the two shapes:** `rowToSectionState` reads a **DB row**, whose content field is `content`. `derivePhase` reads **`SectionState`** from the reducer, whose content field is `finalContent`. `liveText` is streaming scratch and must never count as done. Writing either test against the wrong field would make Resume skip unfinished sections or regenerate finished ones.

- [ ] **Step 1: Write the failing tests**

Extend the **existing** import at the top of `src/lib/generationProgress.test.ts` — do not add a
second import block lower down — so it reads:

```ts
import {
  hasContent,
  partitionSections,
  pickAnchorSource,
  rowToSectionState,
  derivePhase,
} from './generationProgress'
import type { SectionRow } from './generationProgress'
import type { SectionState } from '../types/generation'
```

Then append the new tests to the same file, reusing the `makeRow` helper already defined there:

```ts
function makeSectionState(overrides?: Partial<SectionState>): SectionState {
  return {
    id: 'sec-1',
    name: 'Understanding of the Study',
    position: 1,
    role: null,
    status: 'pending',
    liveText: '',
    finalContent: null,
    error: null,
    ...overrides,
  }
}

describe('rowToSectionState', () => {
  it('normalises a stranded generating row with no content to pending', () => {
    // No loop is running behind it, so rendering it as in-progress would show a
    // spinner that never resolves.
    const state = rowToSectionState(makeRow({ status: 'generating', content: '' }))
    expect(state.status).toBe('pending')
    expect(state.finalContent).toBeNull()
  })

  it('maps a content-bearing generating row to complete', () => {
    const state = rowToSectionState(makeRow({ status: 'generating', content: '<p>kept</p>' }))
    expect(state.status).toBe('complete')
    expect(state.finalContent).toBe('<p>kept</p>')
  })

  it('maps a complete row to complete with its content', () => {
    const state = rowToSectionState(makeRow({ status: 'complete', content: '<p>done</p>' }))
    expect(state.status).toBe('complete')
    expect(state.finalContent).toBe('<p>done</p>')
  })

  it('falls back to section_key then a default for the name', () => {
    expect(rowToSectionState(makeRow({ name: null, section_key: 'budget' })).name).toBe('budget')
    expect(rowToSectionState(makeRow({ name: null, section_key: null })).name).toBe('Section')
  })

  it('defaults a null position to 99', () => {
    expect(rowToSectionState(makeRow({ position: null })).position).toBe(99)
  })
})

describe('derivePhase', () => {
  it('is generating whenever the loop is running, regardless of counts', () => {
    expect(derivePhase(true, [makeSectionState()], 1)).toBe('generating')
  })

  it('is not-started when nothing has content', () => {
    expect(derivePhase(false, [makeSectionState(), makeSectionState({ id: 'b' })], 2))
      .toBe('not-started')
  })

  it('is not-started when sections have not hydrated yet', () => {
    expect(derivePhase(false, [], 0)).toBe('not-started')
  })

  it('is paused when some but not all sections have content', () => {
    const sections = [
      makeSectionState({ id: 'a', finalContent: '<p>x</p>', status: 'complete' }),
      makeSectionState({ id: 'b' }),
    ]
    expect(derivePhase(false, sections, 2)).toBe('paused')
  })

  it('does not count liveText as done', () => {
    // A section that only ever streamed into liveText was never persisted.
    const sections = [
      makeSectionState({ id: 'a', liveText: 'half a section', finalContent: null }),
      makeSectionState({ id: 'b' }),
    ]
    expect(derivePhase(false, sections, 2)).toBe('not-started')
  })

  it('is complete when every section has content', () => {
    const sections = [
      makeSectionState({ id: 'a', finalContent: '<p>x</p>', status: 'complete' }),
      makeSectionState({ id: 'b', finalContent: '<p>y</p>', status: 'complete' }),
    ]
    expect(derivePhase(false, sections, 2)).toBe('complete')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/generationProgress.test.ts`
Expected: FAIL — `rowToSectionState is not a function` / `derivePhase is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/generationProgress.ts`:

```ts
import type { SectionState } from '../types/generation'

/**
 * Map a DB row to reducer state.
 *
 * A row stranded at 'generating' with no content is normalised to 'pending': no loop
 * is running behind it, so presenting it as in-progress would show a spinner that
 * never resolves. A row with content is 'complete' whatever its status column says.
 */
export function rowToSectionState(row: SectionRow): SectionState {
  const complete = hasContent(row.content)
  return {
    id: row.id,
    name: row.name ?? row.section_key ?? 'Section',
    position: row.position ?? 99,
    role: row.role ?? null,
    status: complete ? 'complete' : 'pending',
    liveText: '',
    finalContent: complete ? row.content : null,
    error: null,
  }
}

export type GenerationPhase = 'not-started' | 'generating' | 'paused' | 'complete'

/**
 * Which generation UI to show. Derived from the data — never from sessionStorage,
 * which is per-tab and goes stale the moment generation is interrupted.
 *
 * Reads SectionState.finalContent (NOT SectionRow.content, and never liveText,
 * which is unpersisted streaming scratch).
 */
export function derivePhase(
  isGenerating: boolean,
  sections: SectionState[],
  totalCount: number
): GenerationPhase {
  if (isGenerating) return 'generating'
  if (totalCount === 0) return 'not-started'
  const doneCount = sections.filter(s => hasContent(s.finalContent)).length
  if (doneCount === 0) return 'not-started'
  return doneCount < totalCount ? 'paused' : 'complete'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/generationProgress.test.ts`
Expected: PASS, 19 tests total in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generationProgress.ts src/lib/generationProgress.test.ts
git commit -m "$(cat <<'EOF'
feat(generation): derive view phase and section state from data

rowToSectionState normalises stranded 'generating' rows to pending so they cannot
render as a spinner with no loop behind them. derivePhase replaces the sessionStorage
"generated" flag with a four-state phase derived from section content.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T5j6ivLB8WHxm5AjLYYv8q
EOF
)"
```

---

### Task 3: `RESUME_GENERATION` reducer action

**Files:**
- Modify: `src/types/generation.ts:22-33` (the `GenerationAction` union)
- Modify: `src/hooks/useProposalGeneration.ts:35-47` (the reducer's `START_GENERATION` case — add the new case beside it)
- Test: `src/hooks/useProposalGeneration.test.ts`

**Interfaces:**
- Consumes: `SectionState` from `src/types/generation.ts`
- Produces: action `{ type: 'RESUME_GENERATION'; sections: SectionState[]; completedCount: number }` handled by `generationReducer`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('generationReducer', ...)` block in `src/hooks/useProposalGeneration.test.ts`:

```ts
  it('RESUME_GENERATION preserves completed sections instead of resetting them', () => {
    // This is the regression the whole feature exists to prevent. START_GENERATION
    // resets every section to pending; if RESUME did the same it would regenerate
    // and overwrite work the user already has.
    const state = makeInitialState()
    const sections = [
      makeSectionState({ id: 'a', position: 1, status: 'complete', finalContent: '<p>kept</p>' }),
      makeSectionState({ id: 'b', position: 2, status: 'pending' }),
    ]
    const next = generationReducer(state, {
      type: 'RESUME_GENERATION',
      sections,
      completedCount: 1,
    })
    expect(next.sections['a'].status).toBe('complete')
    expect(next.sections['a'].finalContent).toBe('<p>kept</p>')
    expect(next.sections['b'].status).toBe('pending')
  })

  it('RESUME_GENERATION does NOT zero completedCount the way START_GENERATION does', () => {
    const state = makeInitialState()
    const sections = [
      makeSectionState({ id: 'a', position: 1, status: 'complete', finalContent: '<p>x</p>' }),
      makeSectionState({ id: 'b', position: 2 }),
    ]
    const next = generationReducer(state, {
      type: 'RESUME_GENERATION',
      sections,
      completedCount: 1,
    })
    expect(next.completedCount).toBe(1)
    expect(next.totalCount).toBe(2)
  })

  it('RESUME_GENERATION sets isGenerating and clears creditsExhausted for a fresh attempt', () => {
    const state = { ...makeInitialState(), creditsExhausted: true }
    const next = generationReducer(state, {
      type: 'RESUME_GENERATION',
      sections: [makeSectionState()],
      completedCount: 0,
    })
    expect(next.isGenerating).toBe(true)
    expect(next.creditsExhausted).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/useProposalGeneration.test.ts -t RESUME_GENERATION`
Expected: FAIL — TypeScript rejects the action type, or the reducer falls through and returns unchanged state so `next.isGenerating` is `false`.

- [ ] **Step 3: Add the action type**

In `src/types/generation.ts`, add one line to the `GenerationAction` union, directly after the `START_GENERATION` entry:

```ts
  | { type: 'RESUME_GENERATION'; sections: SectionState[]; completedCount: number }
```

- [ ] **Step 4: Add the reducer case**

In `src/hooks/useProposalGeneration.ts`, add this case immediately after the closing brace of the `START_GENERATION` case:

```ts
    case 'RESUME_GENERATION': {
      // Deliberately unlike START_GENERATION: sections arrive at their true statuses
      // and completedCount is carried in, so already-written work is neither reset
      // nor regenerated. creditsExhausted clears so a top-up can be retried without
      // a full regenerate; a still-exhausted balance re-raises it on the next 402.
      const sections = action.sections.reduce<Record<string, SectionState>>(
        (acc, s) => ({ ...acc, [s.id]: s }),
        {}
      )
      return {
        ...state,
        isGenerating: true,
        completedCount: action.completedCount,
        totalCount: action.sections.length,
        sections,
        creditsExhausted: false,
      }
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/useProposalGeneration.test.ts`
Expected: PASS, including the three new tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/generation.ts src/hooks/useProposalGeneration.ts src/hooks/useProposalGeneration.test.ts
git commit -m "$(cat <<'EOF'
feat(generation): add RESUME_GENERATION reducer action

Seeds state from a real partition without resetting completed sections. The
load-bearing difference from START_GENERATION is that completedCount is carried
in rather than zeroed, so a resume cannot overwrite finished work.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T5j6ivLB8WHxm5AjLYYv8q
EOF
)"
```

---

### Task 4: Extract `runLoop` and add `resumeGeneration`

**Files:**
- Modify: `src/hooks/useProposalGeneration.ts` — hydration effect (~313-339), `generateAll` (~474-562), and the hook's return object (~639)

**Interfaces:**
- Consumes: `partitionSections`, `pickAnchorSource`, `rowToSectionState`, `SectionRow` (Tasks 1-2); `RESUME_GENERATION` (Task 3)
- Produces: `resumeGeneration(proposalContext: GenerateSectionPayloadV2['proposalContext'], debug?: boolean): Promise<void>` on the hook's return value, alongside the existing `generateAll` and `stopGeneration`

- [ ] **Step 1: Import the helpers**

At the top of `src/hooks/useProposalGeneration.ts`, beside the existing imports:

```ts
import {
  partitionSections,
  pickAnchorSource,
  rowToSectionState,
  type SectionRow,
} from '../lib/generationProgress'
```

- [ ] **Step 2: Use `rowToSectionState` in the hydration effect**

In the hydration effect, replace the inline `data.map((row: any) => ({ ... }))` block — the one whose `status` ternary maps `row.status === 'generating' ? 'generating' : 'pending'` — with:

```ts
        const sections: SectionState[] = (data as SectionRow[]).map(rowToSectionState)
```

Leave the two dispatches that follow it (`START_GENERATION` then `GENERATION_COMPLETE`, the hydration-only pair) exactly as they are. Make sure the `select` on that query includes `content` — it already does.

- [ ] **Step 3: Extract the loop body into `runLoop`**

Add this `useCallback` above `generateAll`. The body is lifted verbatim from `generateAll`'s existing `for` loop, with the section list, seed completions and seed anchor becoming parameters:

```ts
  // The shared sequential loop. generateAll runs it over every section; resumeGeneration
  // runs it over the unfinished ones only. Extracted so the two entry points cannot drift.
  const runLoop = useCallback(
    async (
      toGenerate: SectionState[],
      seedCompleted: Array<{ id: string; name: string; content: string }>,
      seedAnchor: string,
      rowsById: Map<string, SectionRow>,
      enrichedContext: Awaited<ReturnType<typeof buildEnrichedContext>>,
      isDebug: boolean,
      abortController: AbortController
    ) => {
      const completedSections = [...seedCompleted]
      let anchor = seedAnchor

      for (const section of toGenerate) {
        const rag = await fetchRagChunks(
          profile?.org_id ?? '',
          proposalId,
          section.name,
          enrichedContext.studyInfo.therapeuticArea,
          enrichedContext.studyInfo.studyPhase,
          enrichedContext.studyInfo.countries,
          enrichedContext.studyInfo.indication
        )
        const sectionDescription = rowsById.get(section.id)?.description ?? null
        const content = await streamSection(
          section,
          sectionDescription,
          completedSections,
          anchor,
          enrichedContext,
          rag,
          isDebug,
          abortController.signal
        )
        if (abortController.signal.aborted) break
        if (content) {
          completedSections.push({ id: section.id, name: section.name, content })
          if (session) {
            const newAnchor = await extractAnchor(content, session)
            if (newAnchor) anchor = newAnchor
            dispatch({ type: 'SET_ANCHOR', anchor })
          }
        }
      }
    },
    [proposalId, session, profile, streamSection]
  )
```

- [ ] **Step 3a: Rewrite `generateAll` to call `runLoop`**

Replace `generateAll`'s `for` loop — everything from `const completedSections: Array<...> = []` down to the closing brace of the loop — with:

```ts
        const rowsById = new Map<string, SectionRow>(
          (sectionRows as SectionRow[]).map(r => [r.id, r])
        )
        await runLoop(sections, [], '', rowsById, enrichedContext, isDebug, abortController)
```

Add `runLoop` to `generateAll`'s dependency array. Everything else in `generateAll` — the re-entrancy guard, `START_GENERATION`, the `try/catch/finally`, the final `GENERATION_COMPLETE` — stays exactly as it is.

- [ ] **Step 4: Add `resumeGeneration`**

Add directly after `generateAll`:

```ts
  // Resume: pick up the unfinished sections without touching what is already written.
  const resumeGeneration = useCallback(
    async (
      proposalContext: GenerateSectionPayloadV2['proposalContext'],
      debug?: boolean
    ) => {
      // Same synchronous guard generateAll uses. Hoisted into GenerationContext so a
      // remount cannot create a second guard and let two loops run over one proposal.
      if (isGeneratingRef.current) return
      isGeneratingRef.current = true
      const isDebug = debug ?? localStorage.getItem('jamo_debug_mode') === 'true'
      const abortController = new AbortController()
      abortControllerRef.current = abortController
      try {
        const enrichedContext = await buildEnrichedContext(proposalId, proposalContext)

        // Re-read at resume time, not from stale state: a section that was mid-flush
        // when Stop landed may have completed since, and must then be skipped.
        const { data: sectionRows } = await supabase
          .from('proposal_sections')
          .select('id, name, description, position, role, status, section_key, content')
          .eq('proposal_id', proposalId)
          .order('position', { ascending: true })

        if (!sectionRows || sectionRows.length === 0) {
          dispatch({ type: 'GENERATION_COMPLETE' })
          return
        }

        const rows = sectionRows as SectionRow[]
        const { done, todo } = partitionSections(rows)

        if (todo.length === 0) {
          dispatch({ type: 'GENERATION_COMPLETE' })
          return
        }

        const allSections = rows.map(rowToSectionState)
        dispatch({
          type: 'RESUME_GENERATION',
          sections: allSections,
          completedCount: done.length,
        })

        const seedCompleted = done.map(r => ({
          id: r.id,
          name: r.name ?? r.section_key ?? 'Section',
          content: r.content ?? '',
        }))

        // The anchor is memoryless — a summary of the previous section only — so one
        // call on the last completed section reproduces the value the loop held exactly.
        const anchorSource = pickAnchorSource(done)
        let anchor = ''
        if (anchorSource && session) {
          anchor = await extractAnchor(anchorSource, session)
          if (anchor) dispatch({ type: 'SET_ANCHOR', anchor })
        }

        const rowsById = new Map<string, SectionRow>(rows.map(r => [r.id, r]))
        const todoStates = todo.map(rowToSectionState)
        await runLoop(
          todoStates,
          seedCompleted,
          anchor,
          rowsById,
          enrichedContext,
          isDebug,
          abortController
        )
        dispatch({ type: 'GENERATION_COMPLETE' })
      } catch (err) {
        console.error('[useProposalGeneration] resumeGeneration error:', err)
        dispatch({ type: 'GENERATION_COMPLETE' })
      } finally {
        isGeneratingRef.current = false
      }
    },
    [proposalId, session, profile, runLoop]
  )
```

- [ ] **Step 5: Export it from the hook**

Change the hook's return statement to include `resumeGeneration`:

```ts
  return { state, dispatch, generateAll, generateSection, regenerateSection, sortedSections, stopGeneration, resumeGeneration }
```

- [ ] **Step 6: Verify nothing regressed**

Run: `npx vitest run`
Expected: 628 passed / 16 skipped — the 625 baseline plus the 3 from Task 3. (Task 1-2 tests are in their own file and add to the total; confirm the count only rises and nothing previously passing now fails.)

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `303` — unchanged from baseline.

Run: `npx tsc --noEmit 2>&1 | grep -E "generationProgress|GenerationContext" || echo "new files clean"`
Expected: `new files clean`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useProposalGeneration.ts
git commit -m "$(cat <<'EOF'
feat(generation): add resumeGeneration over a shared runLoop

generateAll and resumeGeneration now share one loop body so they cannot drift.
Resume re-reads sections at click time, partitions by content, rebuilds
priorSections from that read and recovers the anchor with a single extractAnchor
call on the last completed section.

Hydration now routes through rowToSectionState, so a stranded 'generating' row
normalises to pending instead of rendering as perpetual progress.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T5j6ivLB8WHxm5AjLYYv8q
EOF
)"
```

---

### Task 5: `GenerationContext` provider

**Files:**
- Create: `src/context/GenerationContext.tsx`
- Modify: `src/App.tsx` — mount the provider inside the auth provider, wrapping the routes

**Interfaces:**
- Consumes: `useProposalGeneration` (Task 4)
- Produces: `GenerationProvider` component and `useGeneration(): GenerationContextValue`, where

```ts
interface GenerationContextValue {
  activeProposalId: string | null
  generatingProposalId: string | null
  claimGeneration: (proposalId: string) => boolean
  generation: ReturnType<typeof useProposalGeneration>
}
```

- [ ] **Step 1: Write the provider**

Create `src/context/GenerationContext.tsx`:

```tsx
import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { useProposalGeneration } from '../hooks/useProposalGeneration'

interface GenerationContextValue {
  /** The proposal the single hook instance is currently bound to. */
  activeProposalId: string | null
  /** The proposal with a loop actually running, if any. */
  generatingProposalId: string | null
  /** Bind the hook to a proposal. Returns false if another proposal is mid-generation. */
  claimGeneration: (proposalId: string) => boolean
  generation: ReturnType<typeof useProposalGeneration>
}

const GenerationContext = createContext<GenerationContextValue | null>(null)

/**
 * Holds exactly one useProposalGeneration instance, above the routes.
 *
 * This is NOT what keeps generation alive across navigation — the loop is a plain
 * async closure and already survives unmount on its own. The provider exists for:
 *
 *   1. UI continuity. The reducer state survives, so returning to the page shows
 *      live progress instead of a stale "Generated".
 *   2. ONE re-entrancy guard. isGeneratingRef lives inside the hook instance. If the
 *      hook remounted per page visit, returning mid-generation and pressing Resume
 *      would create a fresh guard and start a SECOND concurrent loop writing the same
 *      sections. Keeping one instance alive is what makes Resume safe.
 */
export function GenerationProvider({ children }: { children: ReactNode }) {
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null)
  const generation = useProposalGeneration(activeProposalId ?? '')

  // Mirrors isGenerating without making claimGeneration depend on render timing.
  const generatingIdRef = useRef<string | null>(null)
  if (generation.state.isGenerating && activeProposalId) {
    generatingIdRef.current = activeProposalId
  } else if (!generation.state.isGenerating) {
    generatingIdRef.current = null
  }

  const claimGeneration = useCallback(
    (proposalId: string) => {
      const busyWith = generatingIdRef.current
      if (busyWith && busyWith !== proposalId) return false
      setActiveProposalId(prev => (prev === proposalId ? prev : proposalId))
      return true
    },
    []
  )

  return (
    <GenerationContext.Provider
      value={{
        activeProposalId,
        generatingProposalId: generatingIdRef.current,
        claimGeneration,
        generation,
      }}
    >
      {children}
    </GenerationContext.Provider>
  )
}

export function useGeneration(): GenerationContextValue {
  const ctx = useContext(GenerationContext)
  if (!ctx) throw new Error('useGeneration must be used within a GenerationProvider')
  return ctx
}
```

- [ ] **Step 2: Mount it in `App.tsx`**

Open `src/App.tsx`. Add the import:

```tsx
import { GenerationProvider } from './context/GenerationContext'
```

Then wrap the `<Routes>` element (and anything rendering routes) in `<GenerationProvider>…</GenerationProvider>`, placing it **inside** the existing `AuthProvider` — the hook reads `session` and `profile` from auth context, so it must be nested within it. Do not wrap the router itself; wrap the routes.

- [ ] **Step 3: Verify the app still boots**

Run: `npm run dev`
Open the printed URL, log in as `usera@jamo.com` / `password123`, and open any proposal.
Expected: the page renders exactly as before — this task changes no behaviour yet, only ownership of the hook instance. Check the browser console is free of "must be used within a GenerationProvider" errors.

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `303`.

- [ ] **Step 4: Commit**

```bash
git add src/context/GenerationContext.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat(generation): hoist the generation hook into GenerationContext

Holds one useProposalGeneration instance above the routes. The loop already
survived unmount on its own; what this adds is UI continuity on return and a
single re-entrancy guard, without which Resume beside a still-running orphaned
loop would start a second concurrent loop over the same sections.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T5j6ivLB8WHxm5AjLYYv8q
EOF
)"
```

---

### Task 6: Resume button in `GenerationHeader`

**Files:**
- Modify: `src/components/GenerationHeader.tsx`
- Test: `src/components/GenerationHeader.test.tsx` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `GenerationHeaderProps` gains `onResume?: () => void` and `phase?: GenerationPhase`. Task 7 passes both.

- [ ] **Step 1: Write the failing tests**

Create `src/components/GenerationHeader.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerationHeader } from './GenerationHeader'

describe('GenerationHeader', () => {
  it('shows Stop and no Resume while generating', () => {
    render(
      <GenerationHeader
        isGenerating
        phase="generating"
        completedCount={2}
        totalCount={9}
        onStop={vi.fn()}
        onResume={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
  })

  it('shows Resume and no Stop when paused, with the progress wording', () => {
    render(
      <GenerationHeader
        isGenerating={false}
        phase="paused"
        completedCount={6}
        totalCount={9}
        onStop={vi.fn()}
        onResume={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(screen.getByText(/Generation paused/)).toBeDefined()
    expect(screen.getByText(/6 of 9 sections/)).toBeDefined()
  })

  it('calls onResume when Resume is clicked', async () => {
    const onResume = vi.fn()
    render(
      <GenerationHeader
        isGenerating={false}
        phase="paused"
        completedCount={1}
        totalCount={9}
        onResume={onResume}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('shows neither control when generation is complete', () => {
    render(
      <GenerationHeader
        isGenerating={false}
        phase="complete"
        completedCount={9}
        totalCount={9}
        onStop={vi.fn()}
        onResume={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/GenerationHeader.test.tsx`
Expected: FAIL — no Resume button is rendered, and TypeScript rejects the `phase` and `onResume` props.

- [ ] **Step 3: Update the component**

In `src/components/GenerationHeader.tsx`, replace the props interface with:

```tsx
import type { GenerationPhase } from '../lib/generationProgress'

interface GenerationHeaderProps {
  isGenerating: boolean
  completedCount: number
  totalCount: number
  phase?: GenerationPhase
  onStop?: () => void
  onResume?: () => void
}
```

Change the component signature to destructure `phase` and `onResume`, then replace the `headingText` / `subText` definitions with:

```tsx
  const isPaused = phase === 'paused'

  const headingText = isGenerating
    ? 'Generating Proposal'
    : isPaused
    ? 'Generation paused'
    : safeCompleted === totalCount && totalCount > 0
    ? `${totalCount} sections complete. Review your proposal below.`
    : 'Ready to generate'

  const subText = isGenerating
    ? `Generating section ${Math.min(safeCompleted + 1, totalCount)} of ${totalCount}…`
    : safeCompleted > 0
    ? `${safeCompleted} of ${totalCount} sections complete`
    : 'Review your tone selection, then click Generate Proposal to begin.'
```

Then add the Resume button beside the existing Stop button, inside the same `{totalCount > 0 && (...)}` block and directly after the Stop block:

```tsx
          {!isGenerating && isPaused && onResume && (
            <button
              onClick={onResume}
              className="px-3 py-1.5 text-sm font-medium text-white bg-jamo-500 rounded-md hover:bg-jamo-600 transition-colors"
            >
              Resume
            </button>
          )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/GenerationHeader.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/GenerationHeader.tsx src/components/GenerationHeader.test.tsx
git commit -m "$(cat <<'EOF'
feat(generation): add a Resume control to GenerationHeader

Resume renders in the paused phase, in the position Stop occupies while generating.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T5j6ivLB8WHxm5AjLYYv8q
EOF
)"
```

---

### Task 7: Wire `ProposalDetail` to phase-derived state

**Files:**
- Modify: `src/pages/ProposalDetail.tsx` — hook consumption (~397), `generated` state (~264), `isStreamingMode` (~450), header wiring (~764-775)

**Interfaces:**
- Consumes: `useGeneration` (Task 5), `derivePhase` (Task 2), `resumeGeneration` (Task 4), `GenerationHeader`'s `phase`/`onResume` (Task 6)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Consume the provider instead of the hook**

Replace the hook call at ~397:

```tsx
  const { claimGeneration, generatingProposalId, generation } = useGeneration()
  const {
    state: genState,
    dispatch: genDispatch,
    generateAll,
    regenerateSection,
    stopGeneration,
    resumeGeneration,
  } = generation

  // Bind the shared instance to this proposal. This MUST live in an effect, not in
  // render or a useMemo — claimGeneration sets state in the provider, and calling it
  // during render triggers "Cannot update a component while rendering a different
  // component".
  useEffect(() => {
    if (id) claimGeneration(id)
  }, [id, claimGeneration])

  // Refused only while a *different* proposal is mid-generation.
  const hasClaim = !generatingProposalId || generatingProposalId === id
```

Add the import:

```tsx
import { useGeneration } from '../context/GenerationContext'
import { derivePhase } from '../lib/generationProgress'
```

- [ ] **Step 2: Derive phase and widen `isStreamingMode`**

Replace line ~450 (`const isStreamingMode = genState.isGenerating`) with:

```tsx
  const phase = derivePhase(genState.isGenerating, sortedGenSections, genState.totalCount)
  // Widened from `genState.isGenerating` alone. stopGeneration dispatches
  // GENERATION_COMPLETE, so without 'paused' the entire header — Resume included —
  // unmounts the instant Stop is pressed.
  const isStreamingMode = phase === 'generating' || phase === 'paused'
```

where `sortedGenSections` is the hook's existing sorted array. If `ProposalDetail` does not already have it in scope, add:

```tsx
  const sortedGenSections = useMemo(
    () => Object.values(genState.sections).sort((a, b) => a.position - b.position),
    [genState.sections]
  )
```

- [ ] **Step 3: Replace the sessionStorage `generated` flag**

There are exactly three sites. Delete the state declaration at line 264:

```tsx
  const [generated, setGenerated] = useState(() => !!sessionStorage.getItem(DRAFT_KEY))
```

and replace it with the derived value:

```tsx
  // Derived from section content, not from a per-tab sessionStorage flag. The old flag
  // was set true whenever section ROWS existed — regardless of whether any of them had
  // content — which is why a stopped proposal reloaded announcing itself as "Generated"
  // with 8 of 9 sections empty and Export as its only control.
  const generated = phase === 'complete'
```

Then delete the two `setGenerated(true)` calls, at **line ~332** and **line ~437**. Both sit in the
same shape of `.then(({ data }) => { ... })` block:

```tsx
        if (data && data.length > 0) {
          setProposalSections(data as any)
          setGenerated(true)      // <- delete this line only
        }
```

Keep `setProposalSections` and `setSectionsLoaded` exactly as they are. Leave `DRAFT_KEY` and any
`sessionStorage.setItem` write in place — other code still reads that key; it simply no longer drives
what the page renders.

- [ ] **Step 4: Wire the header**

Replace the `<GenerationHeader .../>` element at ~766 with:

```tsx
                <GenerationHeader
                  isGenerating={genState.isGenerating}
                  phase={phase}
                  completedCount={genState.completedCount}
                  totalCount={genState.totalCount}
                  onStop={stopGeneration}
                  onResume={() => {
                    if (!hasClaim) {
                      window.alert('Another proposal is still generating. Stop it first.')
                      return
                    }
                    resumeGeneration(buildProposalInput())
                  }}
                />
```

- [ ] **Step 5: Confirm before Start-over destroys work**

Find the existing Generate control that calls `handleGenerate`. Wrap its handler so a regenerate over existing work is confirmed:

```tsx
  const handleGenerateOrStartOver = useCallback(() => {
    if (!hasClaim) {
      window.alert(
        `Another proposal is still generating. Stop it before starting generation here.`
      )
      return
    }
    if (phase === 'paused' || phase === 'complete') {
      const ok = window.confirm(
        'Start over? This regenerates every section and replaces the ones already written. Use Resume to keep them.'
      )
      if (!ok) return
    }
    handleGenerate()
  }, [hasClaim, phase, handleGenerate])
```

Point the existing Generate button's `onClick` at `handleGenerateOrStartOver`.

- [ ] **Step 6: Verify**

Run: `npx vitest run`
Expected: full suite green; total count at or above 628 passed / 16 skipped.

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `303`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ProposalDetail.tsx
git commit -m "$(cat <<'EOF'
feat(generation): derive proposal view state from data and wire Resume

isStreamingMode widens to cover the paused phase, so the header survives Stop and
can host Resume. The sessionStorage "generated" flag is replaced by a phase derived
from section content — it was why a stopped proposal reloaded as "Generated" with
Export as its only control. Start-over now confirms before overwriting written work.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T5j6ivLB8WHxm5AjLYYv8q
EOF
)"
```

---

### Task 8: End-to-end browser verification

**Files:**
- None modified. This task produces evidence, not code.

**Interfaces:**
- Consumes: everything above
- Produces: a pass/fail record to paste into the PR or todo

jsdom has no layout engine and cannot prove any of this. Use a real browser.

- [ ] **Step 1: Start the dev server and note the port**

Run: `npm run dev`
Read the printed port from the log (5173 upward). Log in as `usera@jamo.com` / `password123`.

- [ ] **Step 2: Pick a fixture proposal**

Use an **active** proposal in org `00000000-0000-0000-0000-000000000001` — check `is_archived = false` **and `deleted_at IS NULL`**, or the detail page returns "Proposal not found". `54a22cff-d566-4698-b5bf-0b8c06277ed6` is active and already sits in a genuine half-generated state (6 of 9 complete).

To reset it to a clean pre-generation state, run this against the Management API (token from `.env`, key `SUPABASE_ACCESS_TOKEN`):

```sql
update proposal_sections
set status='pending', content='', generated_at=null
where proposal_id='54a22cff-d566-4698-b5bf-0b8c06277ed6';
```

`supabase db push` does not work in this repo (history diverged) — POST to
`https://api.supabase.com/v1/projects/fuuvdcvbliijffogjnwg/database/query` instead.

- [ ] **Step 3: The core regression check — Resume must not regenerate finished work**

1. Open `/proposals/54a22cff-d566-4698-b5bf-0b8c06277ed6?generate=true`.
2. Wait for the header to read "Generating section 2 of 9", then click **Stop**.
3. Record the completed rows' timestamps:

```sql
select position, status, length(content) len, generated_at, updated_at
from proposal_sections
where proposal_id='54a22cff-d566-4698-b5bf-0b8c06277ed6'
order by position;
```

4. Confirm the header now reads **"Generation paused"** with a **Resume** button — not "Generated" with only Export.
5. Click **Resume**.
6. After it finishes, re-run the query.

**Expected:** every row that was `complete` before Resume has an **unchanged `generated_at` and `updated_at`**, and only the previously-empty positions gained content. Any change to a completed row's timestamp is a failure — it means completed work was regenerated.

- [ ] **Step 4: Resume after a refresh**

Stop a generation partway, then hard-refresh the page. Expected: the page loads showing "Generation paused — N of M sections" with a working Resume, rather than "Generated". Confirm no section shows a spinner that never resolves — that is the stranded `generating` row, and Task 2's `rowToSectionState` should have normalised it to pending.

- [ ] **Step 5: Navigation survival with live progress**

Start a generation, click **Settings** in the nav (an in-app navigation, not a reload), wait ~60s, then navigate back to the proposal. Expected: the header still shows live generation with an advanced section count. Before this work the loop kept running but the page returned showing "Generated".

- [ ] **Step 6: Second-proposal guard**

Start generating proposal A. Without stopping it, open a different proposal B and press its Generate/Resume. Expected: the alert about A still generating, and **no** second loop starts. Verify in the database that B's sections stay untouched while A's continue advancing.

- [ ] **Step 7: Record the results**

Write the outcome of steps 3-6 into the todo file
`.planning/todos/pending/2026-09-10-ui-ux-bug-batch.md` under items 9 and 12, including the
before/after timestamp comparison from step 3.

- [ ] **Step 8: Commit the record**

```bash
git add .planning/todos/pending/2026-09-10-ui-ux-bug-batch.md
git commit -m "$(cat <<'EOF'
docs: record E2E verification for generation resume (#9, #12)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T5j6ivLB8WHxm5AjLYYv8q
EOF
)"
```

---

## Appendix: traps that cost this investigation time

- **A todo's stated cause is a hypothesis, not a finding.** Todo #12 says generation "likely needs server-side / background generation". It does not — the loop already survives unmount, proven by watching six sections complete while the page was unmounted. Reproduce and measure before designing.
- **`generated_at IS NOT NULL` is the marker that the edge function's `flush()` ran.** It is set in the same UPDATE as `content` and `status='complete'`. Use it to tell a real completion from a stranded row.
- **A "Proposal not found" page usually means `deleted_at` is set**, not an RLS failure. Check the column before debugging policies.
- **`user_profiles` keys on `user_id`, not `id`.** `private.get_user_org_id()` selects `org_id from user_profiles where user_id = auth.uid()`. Joining on `id` silently returns nothing.
- **Edge functions are not deployed by committing.** Irrelevant to this plan, which is frontend-only — but if a task pulls you into `supabase/functions/`, stop: that is out of scope here.
