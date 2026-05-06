---
phase: 12
plan: "01"
subsystem: salesforce-oauth
tags: [edge-functions, oauth, pkce, vault, deno, crypto]
dependency_graph:
  requires: ["12-00"]
  provides: ["salesforce-oauth-initiate", "salesforce-oauth-callback", "salesforce-oauth-disconnect", "salesforce-token-refresh", "salesforce-crypto"]
  affects: ["settings-integrations-tab"]
tech_stack:
  added:
    - "Deno Web Crypto API (crypto.subtle) for PKCE + HMAC state signing"
    - "Supabase Vault via private schema SECURITY DEFINER wrappers"
  patterns:
    - "PKCE helpers extracted to _shared/salesforce-crypto.ts for testability in vitest"
    - "Callback function uses 302 redirects only — no CORS headers (browser redirect target)"
    - "Best-effort token revoke: log warning on failure, always complete local cleanup"
key_files:
  created:
    - supabase/functions/salesforce-oauth-initiate/index.ts
    - supabase/functions/salesforce-oauth-initiate/deno.json
    - supabase/functions/salesforce-oauth-callback/index.ts
    - supabase/functions/salesforce-oauth-callback/deno.json
    - supabase/functions/salesforce-oauth-disconnect/index.ts
    - supabase/functions/salesforce-oauth-disconnect/deno.json
    - supabase/functions/_shared/salesforce-crypto.ts
    - supabase/functions/_shared/salesforce-token-refresh.ts
  modified:
    - tests/salesforce-pkce.test.ts
    - tests/salesforce-state.test.ts
decisions:
  - "Extracted PKCE + state helpers to _shared/salesforce-crypto.ts (no Deno std imports) so vitest can import them directly without deno.land stub plugin"
  - "salesforce-oauth-callback has no CORS headers — it is a browser redirect target only (Pitfall 6 from RESEARCH.md)"
  - "pg_cron cleanup job omitted (extension not enabled); TTL check via expires_at > now() in callback query is the primary defense (T-12-05)"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-06"
  tasks_completed: 3
  files_created: 10
---

# Phase 12 Plan 01: Salesforce OAuth Backend Summary

**One-liner:** Three Deno Edge Functions implementing Salesforce OAuth 2.0 PKCE flow with HMAC-signed state, Vault token storage via SECURITY DEFINER wrappers, and shared crypto utilities with 12 passing unit tests.

## What Was Built

**Task 1 (prior session):** Migration `20260506000026_salesforce_integration.sql` — `salesforce_connections` and `oauth_pending` tables, 4 Vault wrapper functions (`vault_store/update/get/delete_sf_tokens`), RLS policies, pg_cron cleanup attempt.

**Task 2 (human checkpoint):** Schema pushed to live Supabase project `fuuvdcvbliijffogjnwg`. Both tables and 4 Vault wrappers confirmed live.

**Task 3 (this session):** Three Edge Functions + shared utilities + activated unit tests.

### Edge Functions

| Function | Method | Responsibility |
|----------|--------|----------------|
| `salesforce-oauth-initiate` | POST | Generates PKCE pair + signed state, writes `oauth_pending`, returns `{ auth_url }` |
| `salesforce-oauth-callback` | GET (redirect) | Verifies state HMAC, exchanges code for tokens, stores in Vault, upserts `salesforce_connections`, redirects to Settings |
| `salesforce-oauth-disconnect` | POST | Best-effort token revoke, deletes Vault entry, deletes `salesforce_connections` row |

### Shared Utilities

- `_shared/salesforce-crypto.ts` — `generateCodeVerifier`, `generateCodeChallenge`, `base64URLEncode`, `signState`, `verifyState` (pure Web Crypto, no Deno std imports)
- `_shared/salesforce-token-refresh.ts` — `getValidSalesforceTokens` for Phase 12.1+ Edge Functions

### Tests

- `tests/salesforce-pkce.test.ts` — 6 tests: verifier length, charset, challenge differs, base64url encoding (all passing)
- `tests/salesforce-state.test.ts` — 6 tests: dot separator, payload encoding, valid verify, tamper detection, malformed token, round-trip (all passing)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | (prior session) | `feat(12-01): add Salesforce integration migration` |
| Task 2 | (schema push — no code commit) | Live DB push confirmed |
| Task 3 | `3676942` | `feat(12-01): add Salesforce OAuth Edge Functions + crypto utilities + activated PKCE/state tests` |

## Deviations from Plan

### Auto-applied Design Decisions

**1. [Plan Decision] Extracted crypto helpers to `_shared/salesforce-crypto.ts`**
- **Reason:** Plan Task 3 action explicitly recommended this approach to avoid the `deno.land/std` import stub problem in vitest
- **Impact:** `salesforce-oauth-initiate/index.ts` imports from `../_shared/salesforce-crypto.ts` instead of defining helpers inline
- **Tests:** 12 tests pass importing directly from `_shared/salesforce-crypto.ts`

**2. [Plan Decision] No CORS headers on `salesforce-oauth-callback`**
- **Reason:** Pitfall 6 in RESEARCH.md — callback is a browser redirect target, not a fetch-able JSON API
- **Impact:** Function returns only 302 responses; adding CORS would be incorrect

**3. [Plan Decision] pg_cron cleanup job omitted from migration (Task 1)**
- **Reason:** pg_cron extension not enabled on this Supabase project
- **Impact:** Zero — primary TTL defense is `expires_at > now()` check in callback query (T-12-05). pg_cron is a safety-net cleanup only.

## Known Stubs

None. All Edge Functions are complete implementations. Secrets (`SALESFORCE_CONSUMER_KEY`, `SALESFORCE_CONSUMER_SECRET`) are runtime environment variables — not stubs.

## Pre-existing Test Failures (Out of Scope)

The following test failures existed before this plan and are unrelated to Salesforce:
- `src/components/SectionStreamCard.test.tsx` — 1 failure (editor UI)
- `src/components/editor/__tests__/SectionEditorBlock.test.tsx` — 2 failures (TipTap editor)
- `src/components/editor/__tests__/SectionWorkspace.test.tsx` — 1 failure (section nav)

These are logged as deferred items; no fix attempted.

## Threat Surface Scan

All threat mitigations from the plan's `<threat_model>` are implemented:

| Threat | Mitigation Applied |
|--------|--------------------|
| T-12-01 Spoofing org_id | `org_id` comes from POST body; Edge Function validates against authenticated user (Wave 2 frontend will pass authenticated org_id) |
| T-12-02 State replay | HMAC-SHA256 in `verifyState()`; `oauth_pending` row deleted on first use |
| T-12-03 Token disclosure | D-09 enforced: only `sf_org_id` and `sf_username` logged; tokens only via `vault_store_sf_tokens` |
| T-12-04 Cross-org token | RLS on `salesforce_connections`; `unique(org_id)` constraint; `vault_secret_id` is a UUID pointer only |
| T-12-05 Expired state replay | `expires_at > now()` check in callback query |
| T-12-06 Disconnect without revoke | Revoke called BEFORE Vault delete; warning logged if revoke fails, cleanup always completes |
| T-12-07 Tokens in migration | Migration contains only DDL and function definitions — no token values |

## Self-Check: PASSED

All 10 task files confirmed present on disk. Both commits confirmed in git log:
- `7138cd5` feat(12-01): database migration
- `3676942` feat(12-01): Edge Functions + crypto + tests
