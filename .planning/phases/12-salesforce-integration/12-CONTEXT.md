# Phase 12: Salesforce Integration — Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 12 delivers the Salesforce **OAuth connection layer only** — no Salesforce reads.

A CRO admin can connect their Salesforce org to Jamo via OAuth 2.0 Authorization Code + PKCE, see connection status (org name, username) in Settings → Integrations, and disconnect cleanly. All future Salesforce operations (reading Opportunities/Accounts, wizard pre-fill, status write-back) are deferred to Phase 12.1.

**Scope restructure note:** The original roadmap scoped Phase 12 to include reads and status write-back. This phase now covers connection only. Phase 12.1 will handle reads, wizard pre-fill, and status write-back.

</domain>

<decisions>
## Implementation Decisions

### OAuth Flow

- **D-01:** Use **OAuth 2.0 Authorization Code flow with PKCE** — NOT the JWT Bearer Token flow mentioned in earlier planning. Reason: PKCE is the industry standard for multi-tenant B2B SaaS Salesforce integrations; ~20 seconds of admin friction vs. ~15 minutes for JWT Bearer; a single Jamo-owned Connected App serves all customer orgs.
- **D-02:** Production routes to `login.salesforce.com`; Sandbox routes to `test.salesforce.com`. Admin selects via radio toggle (defaulting to Production) before clicking Connect.
- **D-03:** PKCE code verifier + challenge generated server-side in `salesforce-oauth-initiate`. State parameter is signed and contains `org_id + nonce`. Both stored in `oauth_pending` table with 5-minute TTL.

### Prerequisite (Human Setup — Not Agent)

- **D-04:** Before this phase can be tested end-to-end, a human must:
  1. Create a Connected App in a Jamo-owned Salesforce org with scopes: `api`, `refresh_token`, `offline_access`
  2. Enable PKCE in Connected App settings
  3. Register callback URL: `https://fuuvdcvbliijffogjnwg.supabase.co/functions/v1/salesforce-oauth-callback`
  4. Add `SALESFORCE_CONSUMER_KEY` and `SALESFORCE_CONSUMER_SECRET` as Edge Function secrets

  **The implementation agent must check for these secrets at startup and surface a clear error (not a silent failure) if they are missing.**

### Edge Functions

- **D-05:** Three new Edge Functions:
  - `salesforce-oauth-initiate` — generates PKCE + state, stores in `oauth_pending`, returns Salesforce auth URL to frontend
  - `salesforce-oauth-callback` — verifies state, retrieves PKCE verifier, exchanges code for tokens, fetches `/services/oauth2/userinfo`, stores tokens in Vault, writes `salesforce_connections` row, redirects to Settings
  - `salesforce-oauth-disconnect` — calls Salesforce revoke endpoint, deletes Vault entry, deletes `salesforce_connections` row

- **D-06:** Build a **token refresh helper** (server-side only) now. Retrieves tokens from Vault, checks expiry, refreshes via Salesforce token endpoint if needed, updates Vault. Used by all future Salesforce API calls (Phase 12.1+). Not exposed as its own Edge Function — it's a shared utility.

### Data Model

- **D-07:** Two new tables:

```sql
-- Non-secret connection metadata
create table salesforce_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  sf_org_id text not null,
  sf_username text not null,
  instance_url text not null,
  is_sandbox boolean not null default false,
  vault_secret_id uuid not null,
  connected_at timestamptz not null default now(),
  unique(org_id)
);
-- RLS: org members can read/delete; only service role writes via Edge Functions.

-- Short-lived OAuth state
create table oauth_pending (
  state text primary key,
  org_id uuid not null,
  code_verifier text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
-- Periodic cleanup of expired rows.
```

- **D-08:** Vault payload shape per connection:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "issued_at": "...",
  "expires_at": "..."
}
```

- **D-09:** Secrets are **never** stored in `salesforce_connections` or logs. Only non-secret metadata goes in the table. `vault_secret_id` is a reference pointer only.

### Settings UI

- **D-10:** Remove the hardcoded Salesforce `IntegrationCard` usage from Settings → Integrations. Replace with a new **`SalesforceConnection`** component. Do **not** delete the `IntegrationCard` component itself — HubSpot and Workday demo cards still use it.

- **D-11:** `SalesforceConnection` disconnected state shows:
  - Production / Sandbox radio toggle (Production default)
  - "Connect Salesforce" button

- **D-12:** `SalesforceConnection` connected state shows:
  - Connected SF org name + username (from `salesforce_connections`)
  - "Disconnect" button

### Error Handling

- **D-13:** On OAuth failure, `salesforce-oauth-callback` redirects to Settings → Integrations with a `sf_error` query parameter. Frontend maps error codes to user-facing copy and renders an **inline dismissible error message inside `SalesforceConnection`** (not a toast).

- **D-14:** Required error codes and their user-facing copy:

| Code | User-facing message |
|------|-------------------|
| `user_denied` | "Salesforce authorization was cancelled. Please try again." |
| `state_mismatch` | "The connection request expired or was tampered with. Please try again." |
| `token_exchange_failed` | "Could not complete the Salesforce connection. Please try again or contact support." |
| `userinfo_failed` | "Connected to Salesforce but could not retrieve org details. Please try again." |
| `unknown` | "Something went wrong connecting to Salesforce. Please try again." |

- **D-15:** After reading the `sf_error` param, the frontend removes it from the URL (no re-trigger on refresh). Full error details are logged server-side only — raw Salesforce error responses never surfaced to the user.

### Graceful Degradation

- **D-16:** A missing or failed Salesforce connection must never block proposal creation. The integration is additive — all existing flows continue to work without it.

### Out of Scope (Deferred to Phase 12.1)

- Any Salesforce read operations (Opportunities, Accounts, etc.)
- Field mapping from SF objects to Jamo proposal context
- Wizard pre-fill from Salesforce data
- Proposal status write-back to Salesforce

### Claude's Discretion

- Exact placement of `SalesforceConnection` within the Integrations tab layout
- Cleanup strategy for expired `oauth_pending` rows (cron vs. on-read TTL check)
- Loading/spinner states during OAuth redirect

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §M1-12 — REQ-12.1 through REQ-12.6 (note: REQ-12.3 and REQ-12.4 are deferred to Phase 12.1)

### Existing UI
- `src/pages/Settings.tsx` — Integrations tab, `IntegrationCard` component, `INTEGRATIONS` array (Salesforce entry to be replaced)

### Architecture
- `.planning/PROJECT.md` §Architecture Principles — "Modular integrations" principle applies here; new CRM connectors must be swappable

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `IntegrationCard` component in `src/pages/Settings.tsx` — keep for HubSpot/Workday demo cards; Salesforce-specific usage replaced by `SalesforceConnection`
- Existing Edge Function pattern in `supabase/functions/` — all functions use TypeScript/Deno; follow same structure as `extract-document`, `chat-with-jamo` etc.
- Supabase client already configured in `src/lib/supabase.ts`

### Established Patterns
- Edge Functions use Deno with `supabase-js` service role client for DB writes
- RLS scoped to `org_id` on every table — follow same pattern for `salesforce_connections`
- Auth context available via `useAuth()` hook in frontend

### Integration Points
- Settings → Integrations tab: `src/pages/Settings.tsx` — replace hardcoded Salesforce `IntegrationCard` with `SalesforceConnection` component
- Supabase Vault: no existing usage in codebase — this is the first Vault integration
- New `salesforce_connections` table connects to `organizations` table (FK on `org_id`)

</code_context>

<specifics>
## Specific Ideas

- The `salesforce-oauth-callback` URL is fixed: `https://fuuvdcvbliijffogjnwg.supabase.co/functions/v1/salesforce-oauth-callback`
- One Salesforce connection per Jamo org enforced by `unique(org_id)` constraint — reconnecting overwrites the existing connection cleanly
- Token refresh helper is a shared utility for Phase 12.1+ to import, not a standalone endpoint

</specifics>

<deferred>
## Deferred Ideas

- **Salesforce reads (Phase 12.1):** Opportunities + Accounts read, field mapping, wizard Step 1 pre-fill
- **Status write-back (Phase 12.1):** proposal status → Salesforce Opportunity PATCH
- **HubSpot / Workday (V2):** Full CRM suite after MVP ships

</deferred>

---

*Phase: 12-salesforce-integration*
*Context gathered: 2026-05-06*
