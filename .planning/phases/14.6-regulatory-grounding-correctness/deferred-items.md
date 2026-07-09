# Deferred Items — Phase 14.6

Out-of-scope discoveries logged during execution. Not fixed per scope-boundary rule
(only auto-fix issues directly caused by the current task's changes).

## From Plan 02 execution (2026-07-09)

### `src/hooks/useProposalGeneration.test.ts` — 2 pre-existing failures

- **Found during:** Task 2 full-suite regression run (`npm run test:run`) after
  wiring `promptAssembly.test.ts` into the exclude carve-out.
- **Not caused by Plan 02.** Root cause is commit `15529c5` ("feat(14.6-01): thread
  split RAG payload through fetchRagChunks and streamSection") — `fetchRagChunks`
  now returns `{ regulatoryChunks, proposalChunks, regulatoryCount }` instead of a
  merged array, but `useProposalGeneration.test.ts` (lines ~301, ~314) still asserts
  the old merged-array shape (`toHaveLength(1)`, `toEqual([])`).
- **Files:** `src/hooks/useProposalGeneration.test.ts`
- **Not in Plan 02's `files_modified`** (`supabase/functions/generate-proposal-section/index.ts`,
  `supabase/functions/generate-proposal-section/promptAssembly.test.ts`) — left untouched.
- **Action needed:** Update the two assertions in `useProposalGeneration.test.ts` to
  expect the split-object shape. Should be picked up by whichever plan closes out
  Plan 01's test coverage, or a follow-up fix commit.

### `supabase/functions/generate-proposal-section/test.ts` — stray unresolved-merge marker + stale signature

- **Found during:** Task 1/2 read-first pass on the directory.
- **Pre-existing, not caused by Plan 02.** Line 1 is a bare `<<<<<<< HEAD` marker
  with no matching `=======`/`>>>>>>>` pair (invalid TS syntax if parsed). The file
  also calls `buildSectionPrompt({ ragChunks: [...], ... })` using the pre-14.6-02
  signature (now `regulatoryChunks` / `proposalChunks` / `regulatoryCount`).
- **Not in Plan 02's `files_modified`.** This is the Deno-runtime test suite
  (`deno test`), not the Vitest suite — it is not picked up by `npm run test:run`
  (vitest.config.ts excludes `supabase/functions/**` except the new
  `promptAssembly.test.ts`), so it does not block Plan 02's verification.
- **Action needed:** Strip the stray conflict marker and update
  `buildSectionPrompt` call sites to the new param shape (or delete the file's
  now-superseded prompt-assembly cases in favor of `promptAssembly.test.ts`,
  keeping only the `parseSSEDelta` / `writeSection` Deno-specific cases).
