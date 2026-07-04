// ── REQ-1 identity-hardening scaffolds (14.3-02) ──────────────────────────
// getAuthedUserAndOrg (supabase/functions/_shared/auth.ts) is now hoisted to
// the top of the chat-with-jamo try block, before the first chat_sessions
// read — see index.ts. Both behaviors below are INTEGRATION behaviors that
// require a deployed function + two real authenticated users (one caller,
// one impersonation target) and cannot be asserted with a pure unit test in
// this Deno runner. Definitive validation is the LIVE check owned by plan
// 14.3-05 (RESEARCH.md Q6): a live request with a tampered body user_id/org_id
// is sent against a deployed instance and the resulting chat_sessions rows /
// RAG scope are asserted against the JWT identity, not the body. These
// scaffolds exist so the REQ-1 acceptance behaviors are discoverable in the
// test suite pending that live run.

Deno.test({
  name: "REQ-1: body user_id/org_id mismatched vs JWT — served by JWT identity (session rows + RAG scoped to JWT, not body)",
  ignore: true, // live-only — see 14.3-05 Q6
  fn: async () => {},
})

Deno.test({
  name: "REQ-1: existing authenticated chat still lands chat_sessions writes after hoist (no regression)",
  ignore: true, // live-only — see 14.3-05 Q6
  fn: async () => {},
})

Deno.test({
  name: "tool_start SSE event emitted before tool_result",
  ignore: true,
  fn: async () => {},
})

Deno.test({
  name: "jsonBuffer accumulates input_json_delta correctly",
  ignore: true,
  fn: async () => {},
})

Deno.test({
  name: "multi-tool turn resets buffer between tools",
  ignore: true,
  fn: async () => {},
})

Deno.test({
  name: "tool_result contains parsed JSON not raw string",
  ignore: true,
  fn: async () => {},
})
