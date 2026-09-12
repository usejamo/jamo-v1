# Design: Generation Resume & Navigation Survival (todos #9, #12)

**Date:** 2026-09-12
**Status:** Awaiting review
**Todos:** `.planning/todos/pending/2026-09-10-ui-ux-bug-batch.md` items 9 and 12
**Supersedes:** the assessment in `docs/handoffs/2026-09-11-generation-lifecycle-handoff.md` §2, corrected below

---

## 1. Problem

Two todos, one underlying question — *where did we get to, and how do we pick up.*

- **#9** — when Stop is pressed mid-generation, offer Resume instead of leaving the user stranded.
- **#12** — generation should survive navigating away from the proposal page and back.

`generateAll` (`src/hooks/useProposalGeneration.ts` ~474) resets every section to `pending` via
`START_GENERATION` and loops over all of them with no skip. Re-calling it is therefore **not** a
resume: it discards completed state, regenerates sections already written, and spends the tokens
again. A naive Stop→Resume button swap would silently destroy the user's completed work.

---

## 2. Verified findings

Everything here was observed, not inferred. Two corrections to prior assumptions are called out
explicitly because both were load-bearing.

### 2.1 Section writes are single-shot

`fullText` accumulates in the TransformStream `transform`; the only write of `content` is a single
UPDATE inside `flush()` (`supabase/functions/generate-proposal-section/index.ts` ~326, write at
~357 via `writeSectionById`). No partial content is ever persisted. `writeSectionById` sets
`content`, `status='complete'` and `generated_at` together, so **`generated_at IS NOT NULL` is a
reliable marker that flush ran**.

### 2.2 CORRECTION — aborting the client stream DOES cancel server-side generation

Previously assumed the edge function ran to completion and wrote anyway, inferred from the absence
of `signal`/abort handling. That is wrong. Cancellation propagates implicitly through the stream
plumbing: `anthropicResp.body.pipeTo(writable)` → TransformStream → `new Response(readable)`.
A client abort cancels the readable, which errors the writable, which aborts the `pipeTo` and
cancels the Anthropic body. Per the Streams spec `flush()` runs only on normal close, never on
cancel, so no DB write occurs.

Observed 2026-09-12 on proposal `54a22cff`, Stop pressed ~1s into section 2:

| position | status | content | generated_at |
|---|---|---|---|
| 1 Executive Summary | complete | 9711 chars | set |
| 2 Scope of Services | **generating** | **empty** | **null** |
| 3 Regulatory Activities | pending | empty | null |

Identical at T+0s, T+15s and T+40s. Edge logs at the same moment:

```
error: event loop error: Http: connection closed before message completed
       at Object.respondWith (ext:runtime/01...)
```

No flush-write error, no `usage_events` insert, no write.

Historical corroboration across the whole database: of 43 rows stranded at `generating`, 39 have
no content and only 1 has `generated_at`; all 394 `complete` rows have both.

**Consequence:** an interrupted section is abandoned with nothing written, and its row is stranded
at `status='generating'` with null or empty content. Stop already cancels server-side. The missing
piece is only the cleanup rule for the stranded row. No edge-function change is required.

### 2.3 CORRECTION — generation already survives navigation

Todo #12 guesses this "likely needs server-side / background generation". It does not. Nothing
aborts on unmount: the only aborts are the 402 path (~439) and `stopGeneration` (~631), and the
cleanup at ~366 removes the Realtime channel only. `generateAll` is a plain async closure and
`fetch` is not tied to component lifecycle, so the loop keeps running after `ProposalDetail`
unmounts. Only the React dispatches are lost.

Observed while parked on `/settings` with `ProposalDetail` unmounted:

```
T+120s  done 1,2,3      generating 4
T+180s  done 1,2,3,4    generating 5
T+210s  done 1,2,3,4,5  generating 6
```

Six sections completed while the user was away. A full page refresh does end the loop; SPA
navigation does not.

### 2.4 The Stop button destroys its own location

`isStreamingMode = genState.isGenerating` and nothing else (`ProposalDetail.tsx:450`).
`stopGeneration` dispatches `GENERATION_COMPLETE`, so the entire `GenerationHeader` unmounts the
instant Stop is pressed. Todo #9's "swap the Stop button for a Resume button in the same spot" is
not literally achievable — the spot is destroyed by the same action. `isStreamingMode` must widen.

### 2.5 View mode is driven by sessionStorage, not by the data

`generated` is initialised from `sessionStorage.getItem('draft-generated-<id>')`
(`ProposalDetail.tsx:264`). A stopped proposal therefore reloads announcing itself as
**"Generated"** with **Export** as its only control, while 8 of 9 sections are empty and there is
no way to continue. This is the actual user-visible bug behind both todos, and it is worse than a
hanging spinner because it asserts completion.

### 2.6 `status='generating'` is not a safe "regenerate me" test

4 of the 43 stranded rows carry non-empty content with `generated_at` null — content written by a
non-flush path such as editor autosave. Partitioning on status alone would regenerate over them
and destroy user edits.

### 2.7 The anchor is memoryless

`extractAnchor(content, session)` (~546) is passed only the section that just finished. The server
prompt is *"Summarize the following proposal section text in approximately 500 tokens"*
(`index.ts` ~151), with no prior anchor supplied, and the loop does `anchor = newAnchor` — replace,
never append. The anchor is therefore a function of the immediately preceding section alone.
Accumulated continuity lives in `priorSections` (full content of every completed section), which is
passed separately.

**Consequence:** one `extractAnchor` call on the highest-position completed section does not
approximate the original value — it is the same function of the same input. Exact recovery, no
schema change, no persisted anchor column.

---

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| D-1 | Generation stays **client-driven**. No job table, no server-side loop. | Required survival scope is in-app navigation, which §2.3 shows already works. Token-by-token streaming is preserved. |
| D-2 | Resume is offered **whenever work is unfinished**, derived from the data — not from a tab-local "was stopped" flag. | Survives refresh, crash and tab close for free, and needs no extra state. |
| D-3 | Stop keeps its current meaning; **no edge-function change**. | §2.2 — it already cancels server-side. |
| D-4 | **One generation at a time**, clearly signalled. | Matches the sequential loop; avoids accidental double token spend. |
| D-5 | Partition on **content**, never on status. | §2.6 — protects editor-saved content sitting under a drifted status. |

### Non-goals

- Server-side or background generation (ruled out by §2.3).
- Concurrent generation of multiple proposals.
- Changing mid-section cancellation semantics beyond what already happens.
- Fixing the `consistencyAnchor` name/behaviour mismatch (§2.7) — separate todo.

---

## 4. Architecture

### 4.1 `GenerationContext` (new)

`src/context/GenerationContext.tsx`, mounted above the routes. It holds exactly one
`useProposalGeneration` instance plus the id of the proposal that instance belongs to.
`ProposalDetail` stops owning the hook and consumes the provider.

Its purpose is **not** keeping the loop alive — §2.3 shows the loop already survives. It provides:

1. **UI continuity.** On return the live reducer state is still present, so progress renders
   instead of a stale "Generated".
2. **A single re-entrancy guard.** This is a correctness requirement, not a nicety. `isGeneratingRef`
   (~310) is per-hook-instance. A remount creates a fresh ref, so pressing Resume beside a
   still-running orphaned loop would start a **second concurrent loop** writing the same sections —
   precisely the interleaving that ref exists to prevent. Resume introduces this hazard; hoisting
   the instance removes it.

A module-level singleton was considered and rejected: the loop needs `session.access_token` and
`profile.org_id` from `AuthContext`, which would have to be injected on every call.

**Claim protocol.** On mount for proposal X, `ProposalDetail` calls `claimGeneration(X)`. The claim
is granted unless a *different* proposal is mid-generation, in which case X renders its normal
data-derived view and its Generate/Resume control prompts with the other proposal named:
*"<other proposal title> is still generating. Stop it and start here?"* Confirming stops the
running loop and claims the generation slot for the current proposal; the stopped proposal keeps
its completed sections and shows Resume when reopened.

### 4.2 Resume algorithm

`resumeGeneration(proposalContext)`, alongside `generateAll`:

1. **Re-read** all `proposal_sections` for the proposal, fresh at click time, ordered by position.
2. **Partition by content (D-5):** `done` = non-empty `content` regardless of status;
   `todo` = everything else (`pending`, `error`, and rows stranded at `generating`).
3. If `todo` is empty, dispatch `GENERATION_COMPLETE` and stop.
4. Dispatch **`RESUME_GENERATION`** — seeds sections at their true statuses, `isGenerating: true`,
   `completedCount = done.length`, `totalCount = all.length`, `creditsExhausted: false`.
   Critically it does **not** reset completed sections to `pending`. That is the sole behavioural
   difference from `START_GENERATION`, and the reason a naive button swap destroys work.
5. Rebuild `completedSections` from the same read — exact, no extra query.
6. Recover `anchor` with one `extractAnchor()` call on the highest-position `done` section (§2.7).
   If `done` is empty, `anchor = ''`, exactly as a fresh run begins.
7. Loop over `todo` only; loop body identical to `generateAll`.

`generateAll` and `resumeGeneration` share one extracted
`runLoop(sections, completedSections, anchor, ...)`. `generateAll` keeps its reset-everything
semantics, because pressing Generate is an explicit request to redo.

### 4.3 View state derived from data

Replaces the sessionStorage `generated` flag (§2.5):

Note the two different shapes, so the "has content" test is not written against the wrong one:
`partitionSections` reads **DB rows**, whose field is `content`; `derivePhase` reads
**`SectionState`** from the reducer, whose field is `finalContent` (`liveText` is streaming scratch
and must not count as done).

```ts
// SectionState[] from the reducer, not DB rows
const doneCount = sections.filter(s => s.finalContent?.trim()).length
const phase = isGenerating           ? 'generating'
            : doneCount === 0        ? 'not-started'
            : doneCount < totalCount ? 'paused'
            :                          'complete'
const isStreamingMode = phase === 'generating' || phase === 'paused'
```

`totalCount` is `state.totalCount`. When `totalCount === 0` (sections not yet hydrated) the phase is
`not-started`, and the existing `sectionsLoaded` guard continues to gate rendering as it does today.

| phase | heading | control |
|---|---|---|
| not-started | "Ready to generate" | Generate |
| generating | "Generating section N of M…" | **Stop** |
| paused | "Generation paused — N of M sections" | **Resume** (primary), Start over (secondary, confirmed) |
| complete | existing completion heading | Export |

"Start over" calls `generateAll` and therefore overwrites completed sections, so it requires a
confirmation dialog when `doneCount > 0`. Today that destruction is reachable with no confirmation.

### 4.4 Hydration fix

Mount hydration (~327) maps a DB `generating` row to section status `generating`. Once the header
renders in the `paused` phase, such a row would show an in-progress spinner with no loop behind it.
Hydration must map **`generating` with no content → `pending`**. Rows with content are `done` per
D-5, whatever their status says.

---

## 5. Error handling

- **Credits (402).** `CREDITS_EXHAUSTED` aborts the loop and raises a persistent banner.
  `RESUME_GENERATION` clears the flag so a retry is possible after a top-up; if credits are still
  exhausted the next 402 re-raises it. Self-correcting, and it does not force a full regenerate.
- **Section errors.** Error rows have no content, so they fall into `todo` and Resume retries them,
  subsuming the existing per-section Retry.
- **Truncated sections.** A `max_tokens` section is deliberately left blank and errored, so it
  lands in `todo` and Resume retries it. Unchanged behaviour.
- **Stranded `generating` rows.** Treated as `todo` (no content) and regenerated. Nothing is
  overwritten because nothing was written (§2.2).
- **Residual race.** A Stop landing after `flush()` has begun does write the section. The fresh
  re-read at step 1 sees it and skips it. Bounded at one section either way.

---

## 6. Testing

Following the pattern that works in `src/hooks/useProposalGeneration.test.ts` — test exported pure
functions rather than rendering the hook.

**Unit**

1. `partitionSections(rows)`
   - a content-bearing row with `status='generating'` classifies as `done` and is never
     regenerated (§2.6)
   - `''` and `null` content both classify as `todo`
   - `status='error'` rows classify as `todo`
   - ordering by position preserved
2. `generationReducer` / `RESUME_GENERATION`
   - completed sections keep `finalContent` and `complete` status
   - `completedCount === done.length`, `totalCount === all.length`
   - `creditsExhausted` cleared
   - **load-bearing:** asserts it does *not* zero `completedCount` the way `START_GENERATION` does
3. `derivePhase()` — all four phases, including `doneCount === 0` → `not-started`, never `paused`
4. anchor input selection — highest-position `done` section chosen; `''` when none

**Browser E2E** (jsdom has no layout engine and cannot prove this; use Playwright against
`npm run dev`)

Generate → Stop → record `updated_at` of every `done` row → Resume → assert those `updated_at`
values are **unchanged** and only `todo` positions moved. This is the regression that matters:
proof that completed work was not regenerated.

Also verify: SPA-navigate away mid-generation and back, and confirm live progress renders rather
than "Generated".

**Baselines** — `npx vitest run` = 625 passed / 16 skipped. `npx tsc --noEmit` = 303 pre-existing
errors; compare counts, keep new files clean, do not chase the 303.

---

## 7. Files touched

| path | change |
|---|---|
| `src/context/GenerationContext.tsx` | **new** — single hook instance, claim protocol, shared guard |
| `src/hooks/useProposalGeneration.ts` | extract `runLoop`; add `resumeGeneration` and `partitionSections`; hydration `generating` + empty → `pending` |
| `src/types/generation.ts` | add `RESUME_GENERATION` action |
| `src/pages/ProposalDetail.tsx` | consume provider; replace sessionStorage `generated` with derived `phase`; widen `isStreamingMode`; wire `onResume` |
| `src/components/GenerationHeader.tsx` | add `onResume?: () => void`; paused heading |

No edge-function change, no migration, no deploy. Frontend-only.

---

## 8. Known limits

- A full page refresh mid-section strands that section, and Resume regenerates it. Accepted:
  nothing was persisted, so nothing is lost but the tokens already spent on the abandoned attempt.
- Resume pressed within ~2s of Stop may regenerate a section that was mid-flush. Bounded at one
  section, mitigated by the fresh re-read.
- `consistencyAnchor` remains a one-section-back summary despite its name (§2.7). Out of scope.
- The unhandled `pipeTo` rejection surfaces as an `event loop error` in edge logs on every Stop.
  Cosmetic and pre-existing.

---

## 9. Follow-up todos to file

1. Fix the `consistencyAnchor` name/behaviour mismatch, or make it genuinely cumulative.
2. Catch the `pipeTo` rejection in the edge function to silence the event-loop error on cancel.
3. Backfill: 43 rows are stranded at `generating` in production. 39 are blank and safe to reset to
   `pending`; 4 carry content and should be reconciled by hand.
