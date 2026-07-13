# Root-Cause Findings — Two Pre-existing Bugs (Issues 1 & 2)

**Date:** 2026-07-13
**Method:** superpowers:systematic-debugging (Iron Law — no fix without confirmed root cause).
**Status:** Both root-caused with direct evidence. **No fixes applied yet — awaiting approval.**
Both bugs pre-date Phase 14.7 (confirmed; neither touches 14.7 code paths).

---

## Issue 2 — "First section's placeholders not marked; a console error appears"

### Verdict: CONFIRMED — the proposal-generation trigger is **re-entrant**, so `generateAll` runs **twice concurrently**, both loops starting at section 1.

### Evidence (live repro, new proposal `f4ddd9ab-…`, no docs uploaded)
- **Network:** two POSTs to `generate-proposal-section` (`#181`, `#182`) both target the **same** `sectionId c2404142` ("Understanding of the Study"), both `priorSections: 0`. ~22 total POSTs for a 9-section proposal (~2×).
- **Live UI:** section 1's streaming text was visibly **interleaved** — two generations mixed token-by-token (`[Company Name] …` and `[Name of CRO] …` woven together).
- **Console (captured):**
  - `AbortError: BodyStreamBuffer was aborted` at `src/hooks/useProposalGeneration.ts:279/338` ← **the reported "console error."**
  - `POST 402` / `POST 502` on `generate-proposal-section` (doubled API load).
  - `@supabase/gotrue-js: Lock "…auth-token" was not released within 5000ms … (e.g., React Strict Mode)` ×3.
- **Persisted DB (`proposal_sections`):** section 1 saved with a **raw** `<strong>[Company Name]</strong>` (no `data-placeholder-id` span) → renders **unmarked**. Sections 2–6 saved with proper `<span data-placeholder-id=…>` → marked correctly.

### Root cause (code)
1. `main.tsx:7` wraps the app in `<StrictMode>` → React dev **double-invokes effects**.
2. The auto-generate effect `src/pages/ProposalDetail.tsx:435-441` has **no synchronous re-entrancy guard and no cleanup**. Its guard is `!genState.isGenerating && completedCount === 0`.
3. `generateAll` (`useProposalGeneration.ts:435`) flips `isGenerating=true` **only after two awaited round-trips** (`fetchAssumptions` L445, sections fetch L452, then `START_GENERATION` dispatch L474). A second invocation during that async window still sees `isGenerating === false` → **passes the guard**.
4. `window.history.replaceState(...)` (L439) does **not** update react-router's `searchParams`, so the `?generate=true` guard clause **never clears**; any change in the effect's dependency identities (`proposal`, `buildProposalInput`, `generateAll`) re-fires it — reproducing the double-fire **in production too**, independent of StrictMode.
5. Both loops iterate from position 1 and call `streamSection(section1)`, both dispatching `SECTION_TOKEN` for the same `sectionId` → the reducer concatenates two token streams into one `liveText` → garbled markup + a race over which generation persists.
6. Both loops **share one `abortControllerRef.current`** (L282, overwritten by the 2nd loop). The credit/402 path calls `abortControllerRef.current?.abort()` (L411), tearing down the **sibling** loop's in-flight stream → uncaught `AbortError`.

Section 1 is uniquely affected because it is the only section both loops hit **simultaneously** (they desync after, and later sections converge via last-writer-wins realtime writes).

### Secondary contributor (defense-in-depth)
Placeholder marking only ever converts `[PLACEHOLDER: label]`:
- edge post-processor `extract`/`generate-proposal-section/index.ts:299-303` (`/\[PLACEHOLDER:\s*([^\]]+)\]/`),
- client `src/lib/migratePlaceholders.ts` (that pattern + ALL-CAPS multi-word).

Bare title-case brackets the model sometimes emits (`[Company Name]`, `[Name of CRO]`) match **neither**, so they never become marked spans. Independent of the race, this makes marking fragile whenever the model deviates from the instructed format.

### Proposed fixes (ranked)
| # | Fix | Risk | Effort | Notes |
|---|-----|------|--------|-------|
| **2A** | **Synchronous re-entrancy guard.** Add a `useRef` flag set at the very top of `generateAll` *before any await* (and/or guard the trigger effect with a `hasTriggeredRef`); bail if already running. | **Low** | **S** | Kills concurrent loops in dev (StrictMode) **and** prod (dep churn). Primary fix — removes interleaving, AbortError, doubled 402/502, gotrue lock. |
| 2B | Clear the query param via react-router `setSearchParams` instead of `window.history.replaceState`, so the effect's own guard clears. | Low | S | Complements 2A. |
| 2C | Make abort robust: give each `generateAll` its own `AbortController` (local var, not shared ref) or no-op when already aborted. | Low | S | Mostly moot once 2A lands, but tidies the AbortError path. |
| 2D | Placeholder-format hardening: strengthen the prompt to *always* emit `[PLACEHOLDER: …]`, and/or extend the post-processor to also convert bare `[Title Case …]` brackets. | Med | M | Regex must avoid over-matching real bracketed text (acronyms like `[US]`, `[EU]` are already excluded by design). Defense-in-depth. |

**Recommended:** ship **2A (+2B, +2C)** first — single small change, removes the entire symptom cluster. Treat **2D** as a follow-up.

---

## Issue 1 — "extract-document OOM (546 WORKER_RESOURCE_LIMIT) on heavier PDFs"

### Verdict: PREMISE REFUTED. Not size/memory-driven. **CONFIRMED:** a **transient isolate resource-limit kill during the chunk+embed step**, made *permanent* by **zero crash-resilience** in the status machine.

### Evidence (prod DB)
- The two docs cited are **twins**: identical `Vericel_RFP_ADVANCE-301.pdf`, **14,516 bytes** each, uploaded **7.7 min apart** (22:11 vs 22:18 — not concurrent).
  - `694f8ad5…` → **complete**, extract present, **5 chunks**.
  - `08358f62…` → **stuck `extracting`**, extract present (10,457 chars), **0 chunks**.
- Whole-table status distribution: **`complete`: 36 docs, 0.014 MB → 4.966 MB** (avg 1.2 MB). **`extracting` (stuck): 1 doc — the *smallest* at 0.014 MB.** ⇒ failure is **anti-correlated with size**; ~5 MB PDFs succeed.
- The stuck doc has its `document_extracts` row (step 9 done) but 0 chunks and status never advanced ⇒ it died **inside step 10 `chunkAndEmbedProposal`**, after the extract insert and before the final status flip (step 11).

### Root cause
- `chunkAndEmbedProposal` (`index.ts:45-87`) is wrapped in try/catch that returns `0` on any JS error — which would still let **step 11 mark the doc `complete`**. The *only* way to be stranded at `extracting` is an **isolate-level kill** (WORKER_RESOURCE_LIMIT) that bypasses JS entirely.
- A 14 KB / 5-chunk doc **cannot** exhaust 256 MB memory; a **~3.75 s** kill on a CPU-bound path (pdf.js parse + cold dynamic imports + embed) points to the **CPU-time limit**, not memory. It is **non-deterministic** — the identical twin succeeded minutes earlier.
- **No recovery exists.** Transitions are only `pending→extracting` (step 4), `extracting→complete` (step 11), `→error` (catch). An isolate kill runs **neither** step 11 nor the catch ⇒ the row is **permanently `extracting`**. There is **no reaper/cron/timeout** anywhere resetting stuck rows, and `FileUpload.tsx:151` fires the invoke **once with no retry**. Result: `Step2DocumentUpload.tsx:56` never sees "all complete" → the wizard **blocks indefinitely**; `DocumentList` spins forever.

### Latent (separate) scalability risk — real, but NOT what happened here
For genuinely large PDFs the function *would* hit true memory/CPU limits: whole-file `arrayBuffer()` (L207) → pdf.js whole-document parse holding every page (L97-103) → `pages.join` + duplicated `extractedText` → `extractedText.split(/\s+/)` full word array (L231) → `embedTexts` accumulating **all** embeddings + the full `rows` array (L58-67) — all in one isolate. Worth fixing for scale, but it did **not** cause the observed stuck doc.

### Proposed fixes (ranked)
| # | Fix | Risk | Effort | Notes |
|---|-----|------|--------|-------|
| **1A** | **Flip status as soon as text is extracted.** Mark the doc usable (`complete`, or a new `embedding` sub-state) **right after the `document_extracts` insert (step 9)**, before chunk+embed. Embedding is already "best-effort / never fail extraction." | **Low** | **S** | Directly neutralizes the observed failure: a transient kill *during embed* no longer strands the doc. Highest value / lowest risk. |
| **1B** | **Stuck-row reaper.** `pg_cron` job (or a client sweep) that flips `parse_status='extracting'` rows older than e.g. 5 min → `error` (or re-queues). | Low | S–M | External recovery is the *only* thing that survives an isolate kill. Pairs with 1A. |
| 1C | **Client retry.** `FileUpload` retries the invoke once on failure/timeout. | Low | S | Cheap resilience for transient kills. |
| 1D | **Decouple embedding** into its own function/invocation triggered after extract completes, so pdf.js parse and embed never share one isolate's CPU/mem budget. | Med | M | Bigger refactor; also enables 1A cleanly. |
| 1E | **Large-doc hardening** (for scale, not this bug): bound pdf.js page accumulation, avoid `extractedText` duplication, stream `split` for word count, cap/stream embed accumulation; consider a higher edge memory tier. | Med | M–L | Lower priority — no evidence large docs currently fail. |

**Recommended:** ship **1A + 1B** first (targeted at the actual failure mode); **1C** as a bonus; **1D/1E** only if large-doc ingestion becomes a real requirement.

### Cleanup (explicitly requested, prod write — pending approval)
Stuck doc `08358f62-c61f-47bd-903b-d91c8efdeab5` has valid extracted text but 0 RAG chunks. Options:
- `update proposal_documents set parse_status='error' where id='08358f62-…';` (honest: pipeline failed), **or**
- `…set parse_status='complete'` (unblocks UI; note it will lack RAG chunks unless re-embedded).

### Repro artifact to clean up
This investigation created a real prod proposal **"Debug Sponsor Inc" (`f4ddd9ab-d502-4685-853c-61c81705fda4`)** whose section 1 is corrupted (demonstrates Issue 2). Safe to delete on request.

---

## Implementation status (branch `fix/gen-reentrancy-and-extract-resilience`)

| Fix | Status | Commit / verification |
|-----|--------|-----------------------|
| 2A re-entrancy guard | ✅ done + **live-verified** | `8f996aa` · see live verification below |
| 2B clear param via router | ✅ done | `8f996aa` |
| 2C per-loop AbortController | ✅ subsumed by 2A | only one loop/controller now exists |
| 2D placeholder-format hardening | ✅ done (TDD) | `e7e347a` · 23/23 tests green (client + edge parity) |
| 1A mark usable after extract insert | ✅ done | `a424ad8` · reviewed (deno unavailable locally) |
| 1E-lite batched embed+insert | ✅ done | `a424ad8` |
| 1C client retry + idempotent extract | ✅ done | `a424ad8` + test `98fd087` · FileUpload 9/9 green |
| 1B pg_cron reaper | ✅ done + **applied to prod** | `1ba5807` · job active `*/5`, reaper returns 0, 0 stuck |
| **1E chunker O(n) — the actual 546 fix** | ✅ done + **deployed + live-verified** | `9a0f73b` · see below |
| 1D full decouple (separate embed fn) | ⏸ not needed | superseded by the chunker fix — the CPU killer is gone |
| Cleanup: reset doc 08358f62 | ✅ done | prod: `extracting` → `error` |
| Cleanup: delete repro proposal f4ddd9ab | ✅ done | prod: deleted (cascade) |

### The 546 root cause (found by live instrumentation) — RESOLVED
Per-step timing written to a temp table (survives the isolate kill) showed the isolate dying **inside `chunkDocument`**, before any embed. `windowSegment` grew a word window one token at a time and **re-encoded the entire growing window with js-tiktoken every step — O(n²) BPE `encode` calls** — burning >2 s CPU and tripping the edge **CPU-time limit**. Not memory, not pdfjs, not size. Fix (`9a0f73b`): encode once, slice token-id ranges (O(n)), applied to both chunker copies. **Live-verified**: the doc that returned 546 three times in a row now returns **200**; `chunkDocument` ~0.7 s; full pipeline completes (5 chunks). Combined with 1A/1B, extraction is now both correct and resilient.

### Issue 2 live verification (real app, credits restored)
Drove a fresh new-proposal generation through the wizard in the running dev build (React StrictMode on — the exact dev repro condition). Result vs. the pre-fix run:

| Check | Before | After |
|-------|--------|-------|
| Section 1 generation requests | 2 (concurrent, same `sectionId`) | **1** |
| Section 1 content | interleaved / garbled | **coherent** |
| Section 1 placeholder spans | 0 (raw `[Company Name]`) | **12 marked, 0 raw** |
| Console errors/warnings | `AbortError` + 402/502 + 3× gotrue StrictMode lock | **0 / 0** |
| Total requests | ~22 (~2.4/section, doubled) | ~2/section (single loop) |

Test proposal deleted afterward.

**Deploy status:** `extract-document` and `generate-proposal-section` **deployed to prod and verified** (`extract-document` smoke-tested to HTTP 200; the reaper migration is applied). Client bundle (2A/2B/2D-client/1C) still ships via the normal frontend deploy pipeline. Issue-2 live E2E (proposal generation) still needs an Anthropic-credit top-up to re-confirm.

## Recommended sequencing
1. **Issue 2 → 2A** (tiny, removes an entire symptom cluster incl. the console error) — highest ROI.
2. **Issue 1 → 1A + 1B** (targeted resilience for the actual failure).
3. Follow-ups: 2B/2C, 1C, then 2D and 1D/1E as scope allows.

Each fix should land with a failing test first (TDD) per systematic-debugging Phase 4.
