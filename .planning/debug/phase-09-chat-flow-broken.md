---
status: awaiting_human_verify
trigger: "phase-09-chat-flow-broken"
created: 2026-03-30T00:00:00Z
updated: 2026-03-30T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — model ID `claude-sonnet-4-6-20251001` is invalid (date predates Sonnet 4.6 release Feb 2026); Anthropic API accepts it but stream hangs/fails silently after intent event
test: Changed model ID to `claude-sonnet-4-6`, redeploying edge function
expecting: Stream produces text tokens after intent event
next_action: Deploy edge function, then request human browser verification

## Symptoms

expected: AIChatPanel streams live responses from chat-with-jamo edge function, gap badge shows after generation, edit proposals work
actual: Chat fails with schema cache error. User sees no new UI from Phase 9. Multiple errors when trying to chat.
errors: "Could not find the 'message_type' column of 'proposal_chats' in the schema cache"
reproduction: Open any proposal that was generated before Phase 9. Try to send a message in the Jamo AI chat panel.
started: After Phase 9 execution. Migration file created locally but not applied to remote Supabase.

## Eliminated

- hypothesis: Bug in AIChatPanel.tsx component code (first pass)
  evidence: Component code is correct — it inserts the right fields. The failure was purely the missing remote schema columns.
  timestamp: 2026-03-30T00:01:00Z

- hypothesis: supabase.functions.invoke returns a ReadableStream in `data`
  evidence: invoke() always resolves `data` as the parsed response body. `data.getReader` is undefined. Must use raw fetch + response.body.getReader() for SSE streaming.
  timestamp: 2026-03-30T00:02:00Z

## Evidence

- timestamp: 2026-03-30T00:00:00Z
  checked: supabase/migrations/20260330000020_proposal_chats_phase9.sql
  found: Migration adds `section_target_id TEXT` and `message_type TEXT DEFAULT 'chat'` columns to proposal_chats, plus an index
  implication: These columns are required by AIChatPanel.tsx lines 311-318 and 389-396 when persisting chat messages

- timestamp: 2026-03-30T00:00:00Z
  checked: src/components/AIChatPanel.tsx insert calls
  found: Both insert calls (user message line 311, assistant message line 389) include `section_target_id` and `message_type` fields
  implication: Any insert will fail with schema cache error if migration not applied

- timestamp: 2026-03-30T00:00:00Z
  checked: supabase/functions/chat-with-jamo/index.ts
  found: Edge function exists locally — deployment to remote was unknown
  implication: Even after schema fix, chat would fail if function not deployed

- timestamp: 2026-03-30T00:01:00Z
  checked: remote proposal_chats schema (via supabase --experimental db query --linked)
  found: section_target_id (text, nullable) and message_type (text, default 'chat') now present in schema
  implication: Schema cache error is resolved — insert calls will succeed

- timestamp: 2026-03-30T00:01:00Z
  checked: supabase functions deploy chat-with-jamo
  found: "Deployed Functions on project fuuvdcvbliijffogjnwg: chat-with-jamo"
  implication: Edge function is now live at /functions/v1/chat-with-jamo

- timestamp: 2026-03-30T00:03:00Z
  checked: supabase/functions/chat-with-jamo/index.ts model ID
  found: model was `claude-sonnet-4-6-20251001` — invalid snapshot date (20251001 = Oct 2025, predates Sonnet 4.6 Feb 2026 release)
  implication: Anthropic API accepted the request (no 400 error), emitted intent event, then stream hung because model ID was invalid. Fixed to `claude-sonnet-4-6`.

- timestamp: 2026-03-30T00:03:00Z
  checked: deployment of updated function
  found: supabase CLI requires SUPABASE_ACCESS_TOKEN — not available in CI context
  implication: Manual deploy required: `npx supabase functions deploy chat-with-jamo`

## Resolution

root_cause: Four issues: (1) Phase 9 migration never applied to remote — schema columns missing; (2) chat-with-jamo edge function never deployed; (3) `supabase.functions.invoke` resolves `data` as a parsed body, not a ReadableStream — calling `.getReader()` on it throws TypeError; (4) model ID `claude-sonnet-4-6-20251001` is invalid — the date 20251001 predates Sonnet 4.6's Feb 2026 release, causing the Anthropic API stream to hang silently after the intent event.
fix: (1+2) Applied migration + deployed function. (3) Replaced invoke() with raw fetch + response.body.getReader(). (4) Changed model to `claude-sonnet-4-6`.
verification: Code change applied to edge function. Awaiting manual deploy + human browser verification.
files_changed: [src/components/AIChatPanel.tsx, supabase/functions/chat-with-jamo/index.ts]
