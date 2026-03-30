---
phase: 09-jamo-ai-chat-panel
plan: 01
subsystem: backend/edge-functions
tags: [edge-function, streaming, sse, rag, intent-detection, anthropic]
dependency_graph:
  requires: [supabase/functions/retrieve-context/index.ts, supabase/functions/section-ai-action/index.ts]
  provides: [supabase/functions/chat-with-jamo/index.ts]
  affects: [Phase 09 frontend chat panel plans]
tech_stack:
  added: []
  patterns: [Deno.serve SSE streaming, npm:@anthropic-ai/sdk, RAG sub-fetch pattern, intent metadata event]
key_files:
  created:
    - supabase/functions/chat-with-jamo/index.ts
  modified: []
decisions:
  - "RAG sub-fetch fires only for rag/explain intents — avoids timeout on edit/general chat"
  - "Intent metadata event emitted as first SSE event so client can branch render logic before content arrives"
  - "RAG failure is non-blocking — chat proceeds without regulatory context if retrieve-context errors"
metrics:
  duration: "5 minutes"
  completed_date: "2026-03-30"
  tasks_completed: 1
  files_changed: 1
---

# Phase 09 Plan 01: chat-with-jamo Edge Function Summary

**One-liner:** Streaming SSE chat Edge Function with keyword-based intent detection (rag/explain/edit/general) and conditional RAG sub-fetch to retrieve-context.

## What Was Built

`supabase/functions/chat-with-jamo/index.ts` — 153-line Deno Edge Function that:

1. Receives `user_message`, `target_section`, `other_sections`, `chat_history`, `intent_hint`
2. Detects intent via keyword matching (or accepts explicit `intent_hint`)
3. Sub-fetches `retrieve-context` only for `rag`/`explain` intents
4. Assembles system prompt: role + target section content + other section summaries + optional RAG block + intent-specific instructions
5. Streams Anthropic SSE events back to client, prefixed with a `{ type: 'intent', intent }` metadata event
6. Returns `[DONE]` sentinel to signal stream completion

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create chat-with-jamo Edge Function | 69b4b79 | supabase/functions/chat-with-jamo/index.ts |

## Decisions Made

- **RAG conditional on intent:** Only `rag`/`explain` trigger the retrieve-context sub-fetch. `edit` and `general` skip it to keep latency low and avoid the 150s Edge Function timeout.
- **Intent metadata as first SSE event:** Client receives intent before any content tokens, enabling immediate UI branching (e.g., render diff view for edit intent).
- **Non-blocking RAG:** try/catch around the sub-fetch — failure logs are swallowed and chat proceeds without regulatory context.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — function is fully implemented and deployable.

## Self-Check: PASSED

- `supabase/functions/chat-with-jamo/index.ts` — FOUND (153 lines)
- Commit `69b4b79` — FOUND
- Contains `detectIntent` — FOUND
- Contains `retrieve-context` — FOUND
- Contains `[DONE]` sentinel — FOUND
- Contains `Deno.serve` — FOUND
- Contains `npm:@anthropic-ai/sdk` — FOUND
