---
phase: 07-proposal-generation-engine
plan: 02
subsystem: frontend-hooks
tags: [generation, orchestration, sse, realtime, rag, wave-sequencing]
dependency_graph:
  requires: [07-00]
  provides: [useProposalGeneration hook, generationReducer, readSSEStream, fetchRagChunks, extractAnchor]
  affects: [07-03-SectionStreamCard, 07-04-ProposalWorkspace]
tech_stack:
  added: []
  patterns: [useReducer orchestration, SSE stream reading via raw fetch(), Supabase Realtime postgres_changes, Promise.all wave parallelism]
key_files:
  created:
    - src/hooks/useProposalGeneration.ts
    - src/types/generation.ts
    - src/hooks/useProposalGeneration.test.ts
    - src/components/SectionStreamCard.test.tsx
    - supabase/functions/generate-proposal-section/deno.json
    - supabase/functions/generate-proposal-section/test.ts
  modified: []
decisions:
  - "Raw fetch() used for SSE streaming (not supabase.functions.invoke which buffers full response — Pitfall 1)"
  - "readSSEStream uses TextDecoder with stream:false (line-by-line buffer split) for multi-byte safety"
  - "Realtime subscription dispatches SECTION_COMPLETE on postgres_changes; 10s setTimeout fallback from local SSE text"
  - "fetchRagChunks returns [] on error — RAG is enhancement not blocker"
  - "Wave 0 prerequisite types (07-00) created inline since 07-00 had not been executed"
metrics:
  duration: ~15 minutes
  completed_date: "2026-03-25"
  tasks_completed: 1
  files_created: 6
---

# Phase 07 Plan 02: useProposalGeneration Hook Summary

One-liner: Three-wave client orchestrator hook using useReducer, raw-fetch SSE streaming, Promise.all Wave 2 parallelism, consistency anchor extraction, and Supabase Realtime subscription.

## What Was Built

`src/hooks/useProposalGeneration.ts` — the client-side brain of proposal generation:

- **generationReducer**: Pure reducer handling 10 action types for all generation state transitions
- **readSSEStream**: SSE consumer using raw `fetch()` + `getReader()` + `TextDecoder` — parses `content_block_delta` events per Anthropic streaming protocol
- **fetchRagChunks**: Calls `retrieve-context` Edge Function via `supabase.functions.invoke`; returns `[]` on error (RAG is enhancement)
- **extractAnchor**: Calls `generate-proposal-section` with `_anchorMode: true` via raw fetch with Bearer auth
- **generateAll**: Three-wave orchestration — Wave 1 serial (understanding), Wave 2 `Promise.all` parallel (6 body sections), Wave 3 serial (executive_summary, cover_letter); anchor extracted between waves
- **generateSection / regenerateSection**: Single-section independent generation for REQ-4.7
- **Realtime subscription**: `supabase.channel().on('postgres_changes')` on `proposal_sections` table filtered by `proposal_id`

Also created prerequisite `src/types/generation.ts` (07-00 was not yet executed) with all type contracts: `SectionStatus`, `GenerationState`, `GenerationAction`, `SECTION_WAVE_MAP`, `SECTION_NAMES`, `GenerateSectionPayload`, `AnchorPayload`, `getWaveSections()`, `createInitialSections()`.

## Test Results

- 18 tests passing (reducer actions, SSE parsing, RAG fetching, wave section mapping)
- 2 tests skipped (Realtime subscription — require live Supabase connection)
- Full suite: 79 passing, 9 skipped, 1 pre-existing failure (ProposalCreationWizard.test.tsx — missing untracked `cro-proposal-generator.js` in worktree, pre-dates this plan)

## Deviations from Plan

### Auto-created Prerequisites

**[Rule 3 - Blocking] Created 07-00 prerequisite artifacts inline**
- **Found during:** Pre-execution file check
- **Issue:** Plan 07-00 (type contracts + Wave 0 stubs) had not been executed; `src/types/generation.ts` and test stubs were absent
- **Fix:** Created `src/types/generation.ts`, `src/hooks/useProposalGeneration.test.ts` (Wave 0 stubs), `src/components/SectionStreamCard.test.tsx`, `supabase/functions/generate-proposal-section/test.ts` and `deno.json` per 07-00 plan spec before implementing 07-02
- **Files modified:** 5 files (committed as `feat(07-00)`)
- **Commit:** e990775

### Test file update (Wave 0 → real tests)

The 07-02 plan called for "converting Wave 0 stubs to real tests." The Wave 0 stubs for `useProposalGeneration.test.ts` were created in the 07-00 prerequisite commit, then fully replaced with 18 real passing tests in the 07-02 commit. The Wave 0 stubs for `SectionStreamCard.test.tsx` remain as skips (those are 07-03 scope).

## Known Stubs

None. All hook logic is implemented. The Realtime tests are skipped with `it.skip` (not stubs blocking plan goal) — they require a live Supabase connection and are documented as such.

## Self-Check

- [x] `src/hooks/useProposalGeneration.ts` exists and exports `useProposalGeneration`, `generationReducer`
- [x] Contains `supabase.channel(` and `postgres_changes`
- [x] Contains `Promise.all` for Wave 2
- [x] Contains `getWaveSections(1)`, `getWaveSections(2)`, `getWaveSections(3)` in generateAll
- [x] Contains `extractAnchor` calls between waves
- [x] Contains `fetchRagChunks` calls
- [x] Uses raw `fetch()` not `supabase.functions.invoke` for streaming
- [x] Contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in fetch headers
- [x] 18 non-skipped passing tests
- [x] Commits e990775 and f896a15 exist

## Self-Check: PASSED
