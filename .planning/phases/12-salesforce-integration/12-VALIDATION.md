---
phase: 12
slug: salesforce-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.4 |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npm run test:run -- tests/salesforce-*.test.*` |
| **Full suite command** | `npm run test:run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run -- tests/salesforce-*.test.*`
- **After every plan wave:** Run `npm run test:run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-W0-01 | 00 | 0 | REQ-12.1 | — | N/A | stub | `npm run test:run -- tests/salesforce-pkce.test.ts` | ❌ W0 | ⬜ pending |
| 12-W0-02 | 00 | 0 | REQ-12.1 | — | N/A | stub | `npm run test:run -- tests/salesforce-state.test.ts` | ❌ W0 | ⬜ pending |
| 12-W0-03 | 00 | 0 | REQ-12.5 | — | N/A | stub | `npm run test:run -- tests/SalesforceConnection.test.tsx` | ❌ W0 | ⬜ pending |
| 12-01-01 | 01 | 1 | REQ-12.1 | T-12-01 | PKCE verifier/challenge S256 pair valid | unit | `npm run test:run -- tests/salesforce-pkce.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | REQ-12.1 | T-12-02 | State sign + verify round-trip | unit | `npm run test:run -- tests/salesforce-state.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | REQ-12.5 | — | SalesforceConnection renders disconnected state | unit | `npm run test:run -- tests/SalesforceConnection.test.tsx` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 2 | REQ-12.5 | — | SalesforceConnection renders connected state | unit | `npm run test:run -- tests/SalesforceConnection.test.tsx` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 2 | REQ-12.5 | T-12-03 | sf_error param renders correct inline error copy | unit | `npm run test:run -- tests/SalesforceConnection.test.tsx` | ❌ W0 | ⬜ pending |
| 12-02-04 | 02 | 2 | REQ-12.5 | — | sf_error param removed from URL after render | unit | `npm run test:run -- tests/SalesforceConnection.test.tsx` | ❌ W0 | ⬜ pending |
| 12-02-05 | 02 | 2 | REQ-12.6 | — | Null connection does not throw | unit | `npm run test:run -- tests/SalesforceConnection.test.tsx` | ❌ W0 | ⬜ pending |
| 12-02-06 | 02 | 2 | REQ-12.2 | T-12-04 | Vault wrappers exist and callable | manual | SQL editor: `SELECT vault_store_sf_tokens(...)` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/salesforce-pkce.test.ts` — stubs for REQ-12.1 PKCE verifier/challenge generation
- [ ] `tests/salesforce-state.test.ts` — stubs for REQ-12.1 state sign/verify round-trip
- [ ] `tests/SalesforceConnection.test.tsx` — stubs for REQ-12.5 (disconnected, connected, error states) and REQ-12.6 (graceful degradation)

*Edge Function tests (integration-level) are manual-only per established project pattern — no Deno test runner is wired into Vitest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vault wrapper SQL functions callable | REQ-12.2 | Vault schema not exposed via PostgREST; requires live DB | Run `SELECT vault_store_sf_tokens(...)` in Supabase SQL editor |
| OAuth redirect to Salesforce | REQ-12.1 | Requires live Salesforce Connected App + secrets | Click Connect, verify redirect to `login.salesforce.com` with PKCE params |
| Token exchange completes | REQ-12.1 | Requires Salesforce callback with real code | Complete OAuth flow; verify `salesforce_connections` row created |
| Disconnect revokes token | REQ-12.1 | Requires live Salesforce revoke endpoint | Click Disconnect; verify Salesforce token revoked + row deleted |
| sandbox toggle routes to test.salesforce.com | REQ-12.1 | Requires live environment | Select Sandbox, click Connect; verify redirect to `test.salesforce.com` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
