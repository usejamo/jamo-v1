# Phase 12: Salesforce Integration — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 12-salesforce-integration
**Areas discussed:** Connect flow UI, Wizard pre-fill UX, Status write-back, Graceful degradation, Phase scope restructure, OAuth error handling

---

## Phase Scope Restructure

The user provided a detailed brief mid-discussion that restructured the phase scope significantly.

**Original scope (ROADMAP.md):** OAuth connection + Salesforce reads + status write-back
**New scope (Phase 12):** OAuth connection layer only
**Deferred to Phase 12.1:** Reads (Opportunities/Accounts), wizard pre-fill, status write-back

The brief also changed the auth mechanism:

| Option | Notes | Selected |
|--------|-------|----------|
| JWT Bearer Token flow | Original plan from PROJECT.md technical decisions | |
| OAuth 2.0 Auth Code + PKCE | Industry standard for multi-tenant B2B SaaS; ~20s admin friction vs. ~15min for JWT | ✓ |

---

## Connect Flow UI

| Option | Description | Selected |
|--------|-------------|----------|
| In-app credential form | Admin pastes Consumer Key + private key into a Settings form | |
| Dev-only via Vault | Credentials set by developer directly; UI shows status only | |
| OAuth redirect flow | Admin clicks Connect → Salesforce OAuth → returns to Jamo | ✓ |

**User's choice:** OAuth 2.0 Authorization Code + PKCE redirect flow
**Notes:** User provided full spec including: Production/Sandbox radio toggle, single Jamo-owned Connected App, PKCE verifier stored in `oauth_pending` table, callback URL registered in Connected App.

---

## Wizard Pre-fill UX

| Option | Description | Selected |
|--------|-------------|----------|
| Deferred to Phase 12.1 | Reads are out of scope for this phase | ✓ |

**Notes:** User's brief explicitly deferred all Salesforce reads to Phase 12.1.

---

## Status Write-back

| Option | Description | Selected |
|--------|-------------|----------|
| Deferred to Phase 12.1 | Write-back is out of scope for this phase | ✓ |

**Notes:** User's brief explicitly deferred status write-back to Phase 12.1.

---

## Existing Salesforce Card in Settings

| Option | Description | Selected |
|--------|-------------|----------|
| Replace it entirely | Remove hardcoded Salesforce IntegrationCard; new SalesforceConnection component | ✓ |
| Rework existing card | Keep IntegrationCard structure, make data-driven | |

**User's choice:** Full UI replacement with `SalesforceConnection` component
**Notes:** Do NOT delete `IntegrationCard` component — HubSpot and Workday demo cards still use it. Only the Salesforce-specific usage is replaced.

---

## OAuth Error Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Inline dismissible error | Inside SalesforceConnection component, sf_error query param from callback | ✓ |
| Toast notification | Non-blocking toast, consistent with other app errors | |
| Claude's discretion | Claude picks based on existing patterns | |

**User's choice:** Inline dismissible error inside `SalesforceConnection`
**Notes:** Full error code table provided: `user_denied`, `state_mismatch`, `token_exchange_failed`, `userinfo_failed`, `unknown`. Frontend removes `sf_error` from URL after reading. Full error details logged server-side only.

---

## Graceful Degradation

**Decision:** Salesforce connection failure must never block proposal creation. Integration is additive.

---

## Deferred Ideas

- Salesforce reads + wizard pre-fill → Phase 12.1
- Proposal status write-back → Phase 12.1
- HubSpot / Workday → V2
