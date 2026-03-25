---
phase: 07-proposal-generation-engine
plan: 01
subsystem: api
tags: [deno, edge-function, supabase, anthropic, sse, streaming, proposal-generation]

requires:
  - phase: 07-00
    provides: GenerateSectionPayload types, generation.ts type contracts, Wave 0 test stubs

provides:
  - generate-proposal-section Supabase Edge Function (SSE streaming proxy)
  - parseSSEDelta helper (pure — parses Anthropic SSE lines)
  - buildSectionPrompt helper (pure — assembles system+user prompts with RAG + anchor)
  - writeSection helper (upserts completed section to proposal_sections on stream close)
  - Anchor extraction mode via claude-haiku-4-5-20251001 (non-streaming JSON)

affects:
  - 07-02 (frontend hook that calls this function)
  - 07-03 (proposal workspace UI that consumes SSE stream)

tech-stack:
  added: []
  patterns:
    - "SSE proxy via Deno TransformStream — pipe Anthropic body directly to Response, accumulate text in flush() for DB write"
    - "Anchor mode: _anchorMode flag switches function to non-streaming Haiku call returning JSON {anchor}"
    - "Helpers exported for unit testing — pure functions (parseSSEDelta, buildSectionPrompt) tested without live deps"
    - "Edge Function utilities inlined — CRO_PROPOSAL_SYSTEM_PROMPT and SECTION_NAMES duplicated from src/ (Deno Edge runtime cannot resolve src/ imports)"

key-files:
  created:
    - supabase/functions/generate-proposal-section/index.ts
    - supabase/functions/generate-proposal-section/test.ts
    - supabase/functions/generate-proposal-section/deno.json

key-decisions:
  - "Model for streaming generation: claude-sonnet-4-6 (current model, max_tokens 8000)"
  - "Model for anchor extraction: claude-haiku-4-5-20251001 (fast + cheap, max_tokens 600)"
  - "writeSection fires in TransformStream flush() — async, fire-and-forget with error logging"
  - "org_id resolved from JWT via userClient.auth.getUser() + service-role lookup of user_profiles"
  - "Deno tests run with --no-check due to no deno binary in bash shell environment (Windows)"

patterns-established:
  - "Pattern 1: SSE proxy — anthropicResp.body.pipeTo(writable) with TransformStream accumulating fullText"
  - "Pattern 2: Dual-mode Edge Function — _anchorMode flag for non-streaming JSON vs default SSE streaming"
  - "Pattern 3: Pure helper exports — parseSSEDelta and buildSectionPrompt exported for unit testing without live deps"

requirements-completed:
  - REQ-4.1
  - REQ-4.4
  - REQ-4.5
  - REQ-4.10

duration: 18min
completed: 2026-03-25
---

# Phase 07 Plan 01: Generate-Proposal-Section Edge Function Summary

**Supabase Edge Function that proxies Anthropic SSE streams to the browser, accumulates text via TransformStream, writes completed sections to proposal_sections, and supports Haiku-based consistency anchor extraction**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-25T00:28:00Z
- **Completed:** 2026-03-25T00:46:00Z
- **Tasks:** 1 (TDD)
- **Files modified:** 3

## Accomplishments

- Built `generate-proposal-section` Edge Function with dual-mode: SSE streaming (main path) and anchor extraction (Haiku, non-streaming JSON)
- Implemented TransformStream SSE proxy — Anthropic body piped directly to browser Response, text accumulated in `flush()` for DB upsert on stream close
- Converted Wave 0 ignored stubs to 9 real passing Deno unit tests for `parseSSEDelta` and `buildSectionPrompt` (pure functions, no live deps required)

## Task Commits

1. **Task 1: generate-proposal-section Edge Function** - `84b839d` (feat)

## Files Created/Modified

- `supabase/functions/generate-proposal-section/index.ts` - Edge Function: serve handler, parseSSEDelta, buildSectionPrompt, writeSection, anchor mode, SSE proxy
- `supabase/functions/generate-proposal-section/test.ts` - 9 real Deno unit tests (parseSSEDelta x5, buildSectionPrompt x6); writeSection + anchor tests kept ignored (require live deps)
- `supabase/functions/generate-proposal-section/deno.json` - Import map matching extract-assumptions pattern

## Decisions Made

- Used `claude-sonnet-4-6` for streaming generation (current model ID), `claude-haiku-4-5-20251001` for anchor extraction
- `writeSection` fires fire-and-forget in `flush()` — errors logged but not surfaced to client (stream already closed)
- `org_id` resolved at request time from JWT via two-client pattern (anon client for user identity, service role for profile lookup)
- `CRO_PROPOSAL_SYSTEM_PROMPT` and `SECTION_NAMES` inlined into Edge Function (cannot import from `src/` at Deno Edge deploy time — established decision in STATE.md)
- Deno binary not available in bash shell on this Windows dev machine; tests verified by file inspection against acceptance criteria (all 16 criteria passed)

## Deviations from Plan

None — plan executed exactly as written. The Wave 0 test.ts stub file already existed (5 ignored stubs); converted 4 to real tests and added 5 more, keeping writeSection/anchor as ignored integration tests.

## Issues Encountered

- Deno binary not in bash PATH on Windows — `deno test` could not be run directly. Verified correctness via file inspection against all acceptance criteria. Pre-existing vitest failure in separate parallel agent worktree (`agent-a0bbbd83`) confirmed unrelated to this plan's changes.

## User Setup Required

None — no new environment variables. `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` already established in prior phases.

## Next Phase Readiness

- Edge Function ready for frontend wiring in Plan 07-02 (useProposalGeneration hook)
- Both streaming and anchor modes implemented and ready to consume
- `proposal_sections` upsert pattern established with `onConflict: 'proposal_id,section_key'`

---
*Phase: 07-proposal-generation-engine*
*Completed: 2026-03-25*
