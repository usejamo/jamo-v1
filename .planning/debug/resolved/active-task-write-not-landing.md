---
status: resolved
slug: active-task-write-not-landing
trigger: "chat-with-jamo edge does not persist active_task (and resolved_items) to chat_sessions on the ask_user needs-value path, despite the request carrying cta_payload.originating_snapshot, proposal_id set, and the session row's user_id matching the authed user. Breaks AC-5 durable resume + Risk B attribution (phase 14.2.4)."
created: 2026-06-12
updated: 2026-06-12
phase: 14.2.4-placeholder-resolution-ask-then-fill
---

# Debug: active_task write not landing in chat_sessions

## Symptoms

- **Expected:** When a needs-value `ask_user` CTA is clicked, the edge writes a 12-field
  `active_task` (status:'active', stage:'gathering_inputs', section_title, originating_snapshot)
  to `chat_sessions`, filtered by proposal_id + user_id (Plan 03). A page reload then restores
  the walkthrough via ResumeTaskBanner (AC-5).
- **Actual:** `active_task` stays `null` in `chat_sessions`. No durable resume.
- **Errors:** None surfaced client-side (200 OK from chat-with-jamo). Edge logs not yet inspected.
- **Timeline:** Observed during phase 14.2.4 live smoke (2026-06-12) after deploying analyze-proposal-gaps + chat-with-jamo.
- **Reproduction:** Login usera@jamo.com / password123 at http://localhost:5173 → open proposal
  1221775d-c244-4d32-871c-5c9dcaf9819a → click a "Provide info" suggestion CTA → query
  `chat_sessions.active_task` for that proposal → it is null.

## Evidence (confirmed before this session)

- timestamp: 2026-06-12 — Request to chat-with-jamo carries `forced_tool: ask_user` AND
  `cta_payload.originating_snapshot` = {id, section_key:'section-2', finding_type:'gap', title, description}.
  Verified via Playwright network capture (request #171). (After client fix bc4c309.)
- timestamp: 2026-06-12 — `chat_sessions` row for the proposal has `user_id` =
  2c94e12e-eca8-4306-8393-3ccea2bdb2ce, which EQUALS the authed test user (usera@jamo.com).
  So the `.eq('user_id', user_id)` filter should match the row IF the edge derives the same id.
- timestamp: 2026-06-12 — chat-with-jamo was freshly redeployed (project fuuvdcvbliijffogjnwg).
  NOT a stale deploy. active_task still null after redeploy.
- timestamp: 2026-06-12 — `resolved_items` on the same table also stays empty
  (`_gap_debug.resolved_count` is always 0 across all analyze runs), suggesting the broader
  chat_sessions write path filtered by JWT user_id is broken, not just active_task.
- timestamp: 2026-06-12 — The ask-then-fill propose_edit DOES apply (LabCorp filled the
  Understanding section), so chat-with-jamo runs and the tool dispatch works — only the
  chat_sessions UPDATE side-effects don't persist.

## Eliminated

- hypothesis: Stale chat-with-jamo deploy → ELIMINATED (redeployed, still null).
- hypothesis: Client not sending the snapshot → ELIMINATED (fixed in bc4c309; request now carries cta_payload.originating_snapshot).
- hypothesis: Session row user_id mismatch → ELIMINATED (row user_id == authed user id).

## Current Focus

- hypothesis: The edge's JWT-derived `user_id` is null or differs from the row's user_id, so the
  awaited `.update(...).eq('proposal_id').eq('user_id')` matches 0 rows silently — OR the write
  errors/throws and is swallowed — OR active_task is overwritten later in the same request.
- test: Inspect chat-with-jamo edge function logs for an ask_user invocation; log the derived
  user_id, the guard branch taken, and the update result (rows affected / error).
- expecting: Either user_id is null/different, the update returns 0 rows, or an error is swallowed.
- next_action: Pull Supabase edge-function logs (Management API with SUPABASE_ACCESS_TOKEN) for a
  fresh ask_user run; read supabase/functions/chat-with-jamo/index.ts ask_user dispatch (~line 255+)
  to confirm how user_id is derived and whether the update result is checked.
- reasoning_checkpoint:
- tdd_checkpoint:

## Investigation Aids

- Test creds + _gap_debug table + ctx_execute REST pattern: see memory `local-app-debug-setup`.
- Related: memory `edge-chat-session-writes-not-landing`, `edge-functions-need-deploy`.
- Key files: supabase/functions/chat-with-jamo/index.ts (ask_user dispatch, buildNeedsValueActiveTask,
  the awaited chat_sessions.update), and how `user_id` is derived from the JWT near request start.

## Resolution

root_cause: chat-with-jamo derives `user_id` from the request BODY (index.ts line 85-97:
  `const body = await req.json(); { ...user_id... } = body`), NOT from the JWT. Every chat_sessions
  read+write guards on `proposal_id && user_id` and filters `.eq('user_id', user_id)` (D-45) — the
  active_task write (260/278), resolved_items (289/310), gathering_inputs (233/239), and read (109).
  The client `buildContextPayload` never included `user_id` in the body, so user_id was `undefined`
  in the edge → every guarded write was silently skipped (no error, 200 OK). Explains active_task
  staying null AND resolved_items staying empty, while propose_edit (client-side editor apply) worked.
fix: Frontend-only (no edge redeploy). Added `user_id` to `ChatWithJamoRequest` (required);
  `buildContextPayload` now accepts `userId` and emits `user_id`; `handleSendMessage` passes `userId`
  (already in scope via `useAuth()`). Regression test asserts `payload.user_id`. Commit 70ec6e3.
  (Earlier prerequisite fix bc4c309 threaded cta_payload.originating_snapshot — also required.)
verification: Live Playwright repro — clicking a needs-value "Provide info" CTA now persists
  chat_sessions.active_task = {status:'active', stage:'gathering_inputs', originating_snapshot present,
  source_action_item_id set}. Confirmed via REST query with service role key. AC-5 durable resume unblocked.
files_changed: src/types/chat.ts, src/utils/chatContext.ts, src/components/AIChatPanel.tsx, src/utils/__tests__/chatContext.test.ts

## Follow-ups (not blocking this resolution)
- active_task.section_key / section_title came back undefined — the forced ask_user tool-input did
  not carry section_key, so buildNeedsValueActiveTask got undefined (D-10 title resolution → undefined).
  Minor: ResumeTaskBanner display may be blank. Worth a small follow-up.
- Intermittent first-attempt propose_edit `paragraph_id not found` (editor-mount/data-id race) — separate.
- AC-8 (batched/partial) and AC-9 (defer ≠ dismiss) still untested in the 14.2.4 smoke.
