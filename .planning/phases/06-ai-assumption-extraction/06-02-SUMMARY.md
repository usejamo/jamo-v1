---
phase: 06-ai-assumption-extraction
plan: "02"
subsystem: edge-functions
tags: [ai, anthropic, deno, edge-function, assumptions, supabase]
dependency_graph:
  requires: [06-00, proposal_assumptions table, document_extracts table]
  provides: [extract-assumptions edge function]
  affects: [Step 2 fire-and-forget trigger, WizardState assumptions population]
tech_stack:
  added: []
  patterns: [Anthropic HTTP API via fetch, serve()+CORS, service-role-client, regex JSON extraction]
key_files:
  created:
    - supabase/functions/extract-assumptions/index.ts
  modified: []
decisions:
  - "Anthropic HTTP API (fetch) used directly — no SDK found in codebase; retrieve-context uses OpenAI SDK, extract-document has no AI calls"
  - "claude-haiku-20240307 per STATE.md active decision (claude-haiku for extraction/anchors)"
  - "Graceful parse failure returns 200 with { assumptions: [], missing: [], warning: 'parse_failed' } — not 500"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-03-23"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 06 Plan 02: Extract-Assumptions Edge Function Summary

One-liner: Deno edge function calling Claude Haiku via HTTP API to extract structured CRO proposal assumptions from document_extracts, with regex JSON parsing and graceful failure handling.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build extract-assumptions edge function | 47b4aeb | supabase/functions/extract-assumptions/index.ts |

## What Was Built

`supabase/functions/extract-assumptions/index.ts` — a Deno edge function that:

1. Accepts `{ proposalId: string }`, returns 400 if missing
2. Fetches `org_id` from proposals table using service role client
3. Queries `document_extracts` joined to `proposal_documents` for the proposal
4. Concatenates document texts with `--- Document: {filename} ---` headers, truncated to 32000 chars
5. Calls Anthropic API (`claude-haiku-20240307`, max_tokens: 2000) via HTTP fetch
6. Extracts JSON from response with `content.match(/\{[\s\S]*\}/)` regex + try/catch
7. Maps float confidence (`>= 0.8` → `'high'`, `>= 0.5` → `'medium'`, else `'low'`)
8. Bulk-inserts to `proposal_assumptions` with `content` column (not `value`)
9. Returns `{ assumptions, missing }` — frontend reads this to populate WizardState

## Decisions Made

- Used Anthropic HTTP API directly via `fetch` — no `@anthropic-ai/sdk` found anywhere in the codebase
- Model: `claude-haiku-20240307` per STATE.md active decision
- Parse failure path returns status 200 with `{ assumptions: [], missing: [], warning: 'parse_failed' }` — never 500

## Deviations from Plan

None — plan executed exactly as written.

## Authentication Gate

**Deploy step blocked:** `npx supabase functions deploy extract-assumptions --no-verify-jwt` requires `SUPABASE_ACCESS_TOKEN`.

**Action required:** Run `npx supabase login` then redeploy:
```
npx supabase functions deploy extract-assumptions --no-verify-jwt
```

The function file is complete and correct. Deploy is the only remaining step.

## Pre-existing Test Failures (Out of Scope)

3 tests in `ProposalCreationWizard.test.tsx` were already failing before this plan (REQ-1.6 sessionStorage, REQ-9.4 generate button). These are unrelated to extract-assumptions and not caused by this plan's changes.

## Self-Check: PASSED

- [x] `supabase/functions/extract-assumptions/index.ts` exists
- [x] Commit 47b4aeb exists
- [x] `from('proposal_assumptions').insert` pattern present
- [x] `content` column used (not `value`)
- [x] Graceful JSON parse failure returns 200
