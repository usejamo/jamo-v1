# Phase 12: Salesforce Integration — Research

**Researched:** 2026-05-06
**Domain:** Salesforce OAuth 2.0 PKCE, Supabase Vault, Deno Edge Functions
**Confidence:** MEDIUM-HIGH

---

## Summary

Phase 12 delivers a Salesforce OAuth 2.0 Authorization Code + PKCE connection layer. All implementation decisions are locked in CONTEXT.md (D-01 through D-16). Research focuses on the exact APIs, call signatures, and patterns needed to execute those decisions.

The three core technical domains are: (1) Supabase Vault — the first Vault usage in this codebase, requiring SQL wrapper functions called via RPC from Edge Functions; (2) Salesforce OAuth PKCE flow — endpoint URLs, exact parameter names, token response shape, userinfo response shape, and revoke endpoint; (3) Deno crypto patterns — generating PKCE verifier/challenge using `crypto.subtle` without any external library.

**Primary recommendation:** Use SQL SECURITY DEFINER wrapper functions in the `private` schema (already established in this codebase) to wrap all `vault.*` calls, then invoke them via `supabase.rpc()` with the service role client from Edge Functions. Never call `vault.create_secret()` directly via RPC — the vault schema is not exposed to PostgREST by default.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: OAuth 2.0 Authorization Code flow with PKCE — NOT JWT Bearer Token
- D-02: Production → `login.salesforce.com`; Sandbox → `test.salesforce.com`. Admin radio toggle (default Production).
- D-03: PKCE code verifier + challenge generated server-side in `salesforce-oauth-initiate`. State = signed `org_id + nonce`. Both stored in `oauth_pending` with 5-min TTL.
- D-04: Human prereqs before E2E testing — Connected App with scopes `api refresh_token offline_access`, PKCE enabled, callback URL registered, secrets `SALESFORCE_CONSUMER_KEY` and `SALESFORCE_CONSUMER_SECRET` set. Implementation must surface clear startup error if secrets are missing.
- D-05: Three Edge Functions: `salesforce-oauth-initiate`, `salesforce-oauth-callback`, `salesforce-oauth-disconnect`
- D-06: Token refresh helper as shared utility (not standalone Edge Function)
- D-07: Two new tables per exact SQL in CONTEXT.md (`salesforce_connections`, `oauth_pending`)
- D-08: Vault payload shape: `{ access_token, refresh_token, token_type, issued_at, expires_at }`
- D-09: Secrets never in `salesforce_connections` or logs
- D-10: Replace hardcoded Salesforce `IntegrationCard` in Settings; keep `IntegrationCard` component
- D-11: Disconnected state = Production/Sandbox radio + "Connect Salesforce" button
- D-12: Connected state = SF org name + username + "Disconnect" button
- D-13: OAuth failure → redirect to Settings with `sf_error` query param; inline dismissible error inside `SalesforceConnection` (not toast)
- D-14: Five error codes with exact user-facing copy (see CONTEXT.md)
- D-15: Frontend removes `sf_error` from URL after reading it
- D-16: Missing/failed SF connection must never block proposal creation

### Claude's Discretion
- Exact placement of `SalesforceConnection` within the Integrations tab layout
- Cleanup strategy for expired `oauth_pending` rows (cron vs. on-read TTL check)
- Loading/spinner states during OAuth redirect

### Deferred Ideas (OUT OF SCOPE)
- Any Salesforce read operations (Opportunities, Accounts)
- Field mapping from SF objects to Jamo proposal context
- Wizard pre-fill from Salesforce data
- Proposal status write-back to Salesforce
- HubSpot / Workday full CRM suite
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-12.1 | Salesforce OAuth — handled in Edge Function | PKCE flow endpoints documented below |
| REQ-12.2 | Salesforce private key (tokens) stored in Supabase Vault | Vault API patterns documented below |
| REQ-12.5 | Integration configured per-org in Settings → Integrations tab | SalesforceConnection component replaces INTEGRATIONS array Salesforce entry |
| REQ-12.6 | Graceful degradation — SF failure does not block proposal creation | D-16; component renders independently of proposal flows |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PKCE generation + state signing | API (Edge Function) | — | Secret-bearing; must never run in browser |
| OAuth redirect to Salesforce | API (Edge Function) | Browser follows redirect | Edge Function builds URL, browser navigates |
| OAuth callback + token exchange | API (Edge Function) | — | Receives authorization code; exchanges for tokens server-side |
| Token storage (Vault) | Database (Vault) | API writes via SQL wrapper | Encrypted at rest; API writes, never browser |
| Connection metadata display | Frontend | reads from `salesforce_connections` via RLS | Non-secret; safe to expose to org members |
| Disconnect / token revoke | API (Edge Function) | — | Must call Salesforce revoke endpoint + clean Vault |
| Token refresh helper | API (shared utility) | — | Used by Phase 12.1+ Edge Functions |
| Error display | Frontend (inline) | — | `SalesforceConnection` component owns inline error state |
| `oauth_pending` cleanup | Database (pg_cron or on-read) | — | TTL enforcement; see recommendation below |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | `^2` (existing) | Service role client in Edge Functions | Already in project deno.json import maps |
| Deno built-in `crypto` | Runtime built-in | PKCE verifier/challenge generation | No external dep needed; `crypto.subtle.digest` available in Deno |
| Supabase Vault (`vault.*`) | Built into Supabase | Encrypted token storage | Only sanctioned encrypted-secret store in this project |
| pg_cron | Supabase built-in extension | Scheduled cleanup of `oauth_pending` | Already available on Supabase hosted projects |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `https://deno.land/std@0.168.0/http/server.ts` | `0.168.0` (existing) | Edge Function `serve()` entrypoint | Match version used in all existing functions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg_cron` for oauth_pending cleanup | On-read TTL check in callback | pg_cron cleaner; on-read check is simpler, zero extra infrastructure. Recommendation: on-read TTL check (see Pitfall 3) |
| SQL wrapper for Vault | Direct `vault.create_secret()` via RPC | Direct call fails — vault schema not PostgREST-exposed. Wrapper is required. |

**Installation:** No new npm packages required. All dependencies are either Deno built-ins or already in existing deno.json import maps.

---

## Salesforce OAuth PKCE Flow

### Endpoints

| Endpoint | URL | Method |
|----------|-----|--------|
| Authorization | `https://login.salesforce.com/services/oauth2/authorize` (prod) or `https://test.salesforce.com/services/oauth2/authorize` (sandbox) | GET (browser redirect) |
| Token exchange | `https://login.salesforce.com/services/oauth2/token` (prod) | POST `application/x-www-form-urlencoded` |
| Identity / userinfo | Value of `id` field in token response (e.g. `https://login.salesforce.com/id/{orgId}/{userId}`) | GET with `Authorization: Bearer {access_token}` |
| Token revoke | `https://login.salesforce.com/services/oauth2/revoke` | POST `application/x-www-form-urlencoded` |
| Token refresh | `https://login.salesforce.com/services/oauth2/token` | POST with `grant_type=refresh_token` |

[CITED: https://sfdcprep.com/oauth-flows-youll-actually-use-auth-code-pkce-jwt-bearer-device-flow-and-token-refresh/]
[CITED: https://developer.salesforce.com/blogs/developer-relations/2011/11/revoking-oauth-2-0-access-tokens-and-refresh-tokens]

### Authorization Request Parameters

```
GET /services/oauth2/authorize
  ?response_type=code
  &client_id={SALESFORCE_CONSUMER_KEY}
  &redirect_uri=https://fuuvdcvbliijffogjnwg.supabase.co/functions/v1/salesforce-oauth-callback
  &code_challenge={base64url(SHA-256(code_verifier))}
  &code_challenge_method=S256
  &state={signed_state_token}
  &scope=api%20refresh_token%20offline_access
```

**Note:** Salesforce only supports `S256` — `plain` is NOT supported. [CITED: https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_pkce.htm]

### Token Exchange Request

```
POST /services/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&client_id={SALESFORCE_CONSUMER_KEY}
&client_secret={SALESFORCE_CONSUMER_SECRET}
&redirect_uri=https://fuuvdcvbliijffogjnwg.supabase.co/functions/v1/salesforce-oauth-callback
&code_verifier={original_code_verifier}
```

### Token Response Shape

```json
{
  "access_token": "00D2v000001XKxi...",
  "refresh_token": "5Aep861dlMxAL...",
  "token_type": "Bearer",
  "issued_at": "1570030000198",
  "instance_url": "https://ap15.salesforce.com",
  "id": "https://login.salesforce.com/id/00D2vKxiEAG/0045Q09vAAL",
  "scope": "refresh_token api",
  "signature": "..."
}
```

[CITED: https://sfdcpulse.wordpress.com/2024/02/05/salesforce-rest-api-access-and-refresh-tokens/]

**Note:** `instance_url` from the token response is needed for subsequent API calls. The `id` field is the identity URL — call it (GET with Bearer token) to get `organization_id`, `username`, `display_name`.

### Identity URL Response Shape (key fields)

```json
{
  "user_id": "0045Q000000...",
  "organization_id": "00D2v000001...",
  "username": "admin@myorg.salesforce.com",
  "display_name": "Admin User",
  "email": "admin@myorg.com"
}
```

[CITED: https://developer.salesforce.com/docs/platform/mobile-sdk/guide/oauth-using-identity-urls.html]

**Note:** There is no `organization_name` field in the identity URL response. To display org name in the UI (D-12), use the `instance_url` domain (e.g., `ap15.salesforce.com`) or query `/services/data/vNN.0/sobjects/Organization` with the access token — but this is deferred complexity. For Phase 12, `sf_username` from the identity URL is sufficient for the connected state display. [ASSUMED — org name field availability not verified against live Salesforce API in this session]

### Token Revoke Request

```
POST /services/oauth2/revoke
Content-Type: application/x-www-form-urlencoded

token={refresh_token}
```

Returns HTTP 200 on success, HTTP 400 on error. [CITED: https://developer.salesforce.com/blogs/developer-relations/2011/11/revoking-oauth-2-0-access-tokens-and-refresh-tokens]

### Token Refresh Request

```
POST /services/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id={SALESFORCE_CONSUMER_KEY}
&client_secret={SALESFORCE_CONSUMER_SECRET}
&refresh_token={refresh_token}
```

Returns a new `access_token` and updated `issued_at`. The `refresh_token` itself is not rotated unless the Connected App is configured with token rotation enabled.

---

## Supabase Vault API

### Function Signatures

```sql
-- Create a new secret; returns the UUID of the new secret
SELECT vault.create_secret(
  'secret_value_here',    -- required: the secret text
  'unique_name',          -- optional: unique name for lookup
  'human description'     -- optional: description
);
-- Returns: uuid

-- Update an existing secret by UUID
SELECT vault.update_secret(
  'existing-uuid-here',   -- required: the UUID from create_secret
  'new_secret_value',     -- optional: new secret text
  'new_unique_name',      -- optional: new name
  'new description'       -- optional: new description
);

-- Delete a secret by UUID
DELETE FROM vault.secrets WHERE id = 'existing-uuid-here';
-- (No dedicated delete function; use direct DELETE with service role)

-- Read decrypted secrets
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'unique_name';
-- Or by UUID:
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE id = 'existing-uuid-here';
```

[CITED: https://supabase.com/docs/guides/database/vault]
[CITED: https://github.com/supabase/vault/blob/main/README.md]

### Critical: Vault Schema is NOT PostgREST-Exposed

`vault.create_secret()` cannot be called directly via `supabase.rpc('vault.create_secret', ...)` from Edge Functions — the vault schema is not in the PostgREST schema cache. [VERIFIED: answeroverflow.com community thread confirming this limitation]

**Required pattern:** Wrap all Vault calls in SQL functions in the `private` schema (already established in this codebase — see `migration 001`) with `SECURITY DEFINER` and grant execute to `service_role` only. Then call them via `supabase.rpc('function_name', params)`.

### SQL Wrapper Pattern (matches existing codebase `private` schema)

```sql
-- In a new migration file:

-- Store tokens for a Salesforce connection
CREATE OR REPLACE FUNCTION private.vault_store_sf_tokens(
  p_payload jsonb,
  p_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT vault.create_secret(p_payload::text, p_name, 'Salesforce OAuth tokens')
  INTO v_secret_id;
  RETURN v_secret_id;
END;
$$;
REVOKE ALL ON FUNCTION private.vault_store_sf_tokens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vault_store_sf_tokens TO service_role;

-- Update existing tokens
CREATE OR REPLACE FUNCTION private.vault_update_sf_tokens(
  p_secret_id uuid,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
BEGIN
  PERFORM vault.update_secret(p_secret_id, p_payload::text);
END;
$$;
REVOKE ALL ON FUNCTION private.vault_update_sf_tokens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vault_update_sf_tokens TO service_role;

-- Retrieve tokens
CREATE OR REPLACE FUNCTION private.vault_get_sf_tokens(
  p_secret_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = p_secret_id;
  RETURN v_secret::jsonb;
END;
$$;
REVOKE ALL ON FUNCTION private.vault_get_sf_tokens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vault_get_sf_tokens TO service_role;

-- Delete tokens
CREATE OR REPLACE FUNCTION private.vault_delete_sf_tokens(
  p_secret_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$$;
REVOKE ALL ON FUNCTION private.vault_delete_sf_tokens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vault_delete_sf_tokens TO service_role;
```

[CITED: https://makerkit.dev/blog/tutorials/supabase-vault]
[CITED: https://supabase.com/docs/guides/database/vault]

### Calling from Edge Function

```typescript
// Source: existing Edge Function pattern (extract-document/index.ts)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Store tokens
const { data: secretId, error } = await supabase.rpc('vault_store_sf_tokens', {
  p_payload: JSON.stringify(tokenPayload),
  p_name: `sf_tokens_${orgId}`
})

// Retrieve tokens
const { data: payload, error } = await supabase.rpc('vault_get_sf_tokens', {
  p_secret_id: vaultSecretId
})
const tokens = payload as { access_token: string; refresh_token: string; expires_at: string }
```

**Important:** The `rpc()` call uses the function name without the `private.` schema prefix — PostgREST resolves by function name. If the name collides with a public-schema function, prefix the schema in the grant. Since all existing `private` schema functions are called this way, match the pattern.

---

## Deno PKCE Implementation

### Generate Verifier + Challenge

```typescript
// Source: crypto.subtle Web Crypto API — standard in Deno runtime
// [VERIFIED: Deno runtime supports crypto.getRandomValues and crypto.subtle.digest]

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64URLEncode(new Uint8Array(digest))
}

function base64URLEncode(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}
```

[CITED: https://datatracker.ietf.org/doc/html/rfc7636 — RFC 7636 PKCE spec]
[VERIFIED: Multiple community sources confirm this exact pattern works in Deno]

### State Parameter Signing

The state parameter must bind `org_id + nonce` to prevent CSRF. Since no JWT library is needed for a simple HMAC, use `crypto.subtle.sign`:

```typescript
async function signState(orgId: string, nonce: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const payload = `${orgId}:${nonce}`
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const sigB64 = base64URLEncode(new Uint8Array(sig))
  return `${btoa(payload).replace(/=/g, '')}.${sigB64}`
}

async function verifyState(stateToken: string, secret: string): Promise<{ orgId: string; nonce: string } | null> {
  const [payloadB64, sigB64] = stateToken.split('.')
  if (!payloadB64 || !sigB64) return null
  const payload = atob(payloadB64 + '==')  // restore padding
  const [orgId, nonce] = payload.split(':')
  const expectedToken = await signState(orgId, nonce, secret)
  if (expectedToken !== stateToken) return null
  return { orgId, nonce }
}
```

[ASSUMED — specific state-signing implementation; HMAC pattern is standard but exact padding handling needs verification in Deno runtime]

### Redirect Response from Edge Function

```typescript
// Redirect to Salesforce authorization URL (salesforce-oauth-initiate returns JSON, browser navigates)
// salesforce-oauth-callback issues the actual redirect back to Settings

return new Response(null, {
  status: 302,
  headers: {
    'Location': `${settingsUrl}?sf_error=state_mismatch`,
    ...corsHeaders
  }
})
```

[VERIFIED: Standard HTTP redirect pattern; confirmed works in Supabase Edge Functions]

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Settings page)
  │
  │ 1. POST /salesforce-oauth-initiate  { org_id, is_sandbox }
  ▼
salesforce-oauth-initiate (Edge Function)
  │ generates: code_verifier, code_challenge, nonce, state
  │ writes: oauth_pending row (state, org_id, code_verifier, expires_at)
  │ returns: { auth_url: "https://login.salesforce.com/..." }
  │
Browser navigates to Salesforce → User grants consent
  │
  │ Salesforce redirects to:
  ▼
salesforce-oauth-callback (Edge Function)   ← GET ?code=xxx&state=yyy
  │ verifies: state signature + nonce
  │ reads: oauth_pending (code_verifier)
  │ deletes: oauth_pending row
  │ exchanges: code + code_verifier → access_token + refresh_token
  │ GET: Salesforce identity URL → username, organization_id
  │ writes: vault_store_sf_tokens → vault_secret_id
  │ upserts: salesforce_connections row
  │ redirects: https://app/settings?tab=Integrations
  │
Browser (Settings page re-renders — SalesforceConnection fetches salesforce_connections)
  │
  │ On "Disconnect":
  │ POST /salesforce-oauth-disconnect  { org_id }
  ▼
salesforce-oauth-disconnect (Edge Function)
  │ reads: salesforce_connections (vault_secret_id, instance_url)
  │ reads: vault_get_sf_tokens → access_token
  │ POST: Salesforce /services/oauth2/revoke
  │ deletes: vault entry (vault_delete_sf_tokens)
  │ deletes: salesforce_connections row
  └─ returns: { success: true }
```

### Recommended Project Structure

```
supabase/
├── functions/
│   ├── salesforce-oauth-initiate/
│   │   ├── index.ts          # serve(); PKCE gen, state sign, oauth_pending write
│   │   └── deno.json         # imports: supabase
│   ├── salesforce-oauth-callback/
│   │   ├── index.ts          # state verify, token exchange, Vault store, redirect
│   │   └── deno.json
│   ├── salesforce-oauth-disconnect/
│   │   ├── index.ts          # revoke, Vault delete, DB delete
│   │   └── deno.json
│   └── _shared/
│       └── salesforce-token-refresh.ts   # D-06 shared utility
├── migrations/
│   └── 20260506000026_salesforce_integration.sql   # tables + vault wrappers + RLS + pg_cron
src/
├── components/
│   └── SalesforceConnection.tsx   # replaces Salesforce IntegrationCard
```

### Pattern: Edge Function deno.json (match existing)

```json
{
  "imports": {
    "supabase": "npm:@supabase/supabase-js@2"
  },
  "compilerOptions": {
    "lib": ["deno.window", "deno.ns"],
    "strict": true
  }
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encrypted token storage | Custom encryption in DB column | Supabase Vault (`vault.*`) | AEAD encryption, key rotation, audit trail built-in |
| PKCE challenge generation | External npm library | Deno built-in `crypto.subtle` | No deps needed; `crypto.getRandomValues` + `SHA-256` is the spec |
| Token revocation | Skip the revoke call | Salesforce `/services/oauth2/revoke` | Leaked refresh tokens persist indefinitely without revocation |
| State CSRF protection | Storing state only in DB | HMAC-signed state + DB nonce | DB-only state is vulnerable to timing attacks; HMAC provides cryptographic binding |

**Key insight:** Vault's `SECURITY DEFINER` wrapper pattern is the only way to call `vault.*` from Edge Functions — do not attempt direct RPC calls to the vault schema.

---

## oauth_pending Cleanup Strategy (Claude's Discretion)

**Recommendation: on-read TTL check** (simpler, no extra infrastructure).

In `salesforce-oauth-callback`, before using the `oauth_pending` row:

```sql
SELECT state, code_verifier FROM oauth_pending
WHERE state = $1 AND expires_at > now();
```

If the row is not found or expired, return `state_mismatch` error. Then delete the row after use.

Add a periodic cleanup as a safety net using pg_cron (available on Supabase hosted):

```sql
SELECT cron.schedule(
  'cleanup-oauth-pending',
  '*/5 * * * *',   -- every 5 minutes
  $$DELETE FROM oauth_pending WHERE expires_at < now()$$
);
```

[CITED: https://supabase.com/docs/guides/database/extensions/pg_cron]

This approach: zero load on the callback path, auto-cleanup every 5 min, no orphaned rows accumulating.

---

## Common Pitfalls

### Pitfall 1: Calling vault.* Directly via RPC
**What goes wrong:** `supabase.rpc('vault.create_secret', ...)` returns "function not found in schema cache"
**Why it happens:** The `vault` schema is not in the PostgREST schema search path
**How to avoid:** Always use `private.` schema wrapper functions with `SECURITY DEFINER`
**Warning signs:** 404 or "Could not find the function" errors from supabase.rpc

### Pitfall 2: Salesforce instance_url Scope
**What goes wrong:** Using `login.salesforce.com` for token endpoint after auth when the org has a custom domain
**Why it happens:** Salesforce orgs with My Domain use their custom instance URL for API calls
**How to avoid:** Use `instance_url` from the token response for all subsequent API calls (not the base `login.salesforce.com`). Only the initial auth and token exchange use `login.salesforce.com` (or `test.salesforce.com`).
**Warning signs:** 302 redirects or "instance not found" errors on API calls

### Pitfall 3: Missing PKCE `code_verifier` at Token Exchange
**What goes wrong:** Token exchange fails with `invalid_grant`
**Why it happens:** `code_verifier` must exactly match what was used to generate `code_challenge`. Any URL-encoding differences break the match.
**How to avoid:** Store the raw `code_verifier` (pre-base64url) in `oauth_pending`; retrieve and send it verbatim in the token exchange body.
**Warning signs:** `{ "error": "invalid_grant", "error_description": "code verifier does not match" }`

### Pitfall 4: Salesforce Requires `offline_access` Scope for Refresh Token
**What goes wrong:** Token exchange succeeds but no `refresh_token` is returned
**Why it happens:** Refresh tokens require `offline_access` scope in the authorization request and the Connected App must have "Refresh Token Policy" set appropriately
**How to avoid:** Always include `offline_access` in the `scope` parameter of the authorization URL (D-04 covers this)
**Warning signs:** Token response has `access_token` but no `refresh_token`

### Pitfall 5: State Parameter URL Encoding
**What goes wrong:** State mismatch on callback because Salesforce URL-encodes the state parameter
**Why it happens:** Special characters in the state token are percent-encoded by Salesforce
**How to avoid:** Use URL-safe base64 (base64url) for all state components; use `decodeURIComponent` when reading state from the callback query string
**Warning signs:** State verify fails on valid flows

### Pitfall 6: CORS on Callback Redirect
**What goes wrong:** The OAuth callback Edge Function returns a 302 — browsers follow it without CORS issues, but if anything fetches it programmatically it may fail
**Why it happens:** The callback is a browser redirect target, not a JSON API
**How to avoid:** The callback function should never return JSON — only 302 redirects (success) or 302 to error URL. Do not add CORS headers — this is not a fetch-able endpoint.

### Pitfall 7: Re-Triggering sf_error on Refresh
**What goes wrong:** User sees the error banner again on page refresh
**Why it happens:** `sf_error` param stays in URL
**How to avoid:** D-15 is locked — after reading the param, remove it using `useSearchParams` setter or `window.history.replaceState`
**Warning signs:** Error banner re-appears on refresh

---

## Code Examples

### salesforce-oauth-initiate: Core Logic

```typescript
// Source: D-03, D-05 + Deno crypto pattern verified above
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Check required secrets at startup (D-04)
  const consumerKey = Deno.env.get('SALESFORCE_CONSUMER_KEY')
  const consumerSecret = Deno.env.get('SALESFORCE_CONSUMER_SECRET')
  if (!consumerKey || !consumerSecret) {
    return new Response(JSON.stringify({ error: 'Salesforce Connected App not configured. Set SALESFORCE_CONSUMER_KEY and SALESFORCE_CONSUMER_SECRET.' }), { status: 503 })
  }

  const { org_id, is_sandbox } = await req.json()
  const baseUrl = is_sandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com'

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const nonce = crypto.randomUUID()
  const state = await signState(org_id, nonce, consumerSecret)
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  await supabase.from('oauth_pending').insert({ state, org_id, code_verifier: codeVerifier, expires_at: expiresAt })

  const authUrl = new URL(`${baseUrl}/services/oauth2/authorize`)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', consumerKey)
  authUrl.searchParams.set('redirect_uri', CALLBACK_URL)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('scope', 'api refresh_token offline_access')

  return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
```

### salesforce-oauth-callback: Token Exchange + Vault Store

```typescript
// GET request from Salesforce browser redirect
serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateToken = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')
  const SETTINGS_URL = 'https://your-app.com/settings?tab=Integrations'

  if (errorParam === 'access_denied') {
    return new Response(null, { status: 302, headers: { Location: `${SETTINGS_URL}&sf_error=user_denied` } })
  }

  // Verify state
  const stateData = await verifyState(stateToken, Deno.env.get('SALESFORCE_CONSUMER_SECRET')!)
  if (!stateData) {
    return new Response(null, { status: 302, headers: { Location: `${SETTINGS_URL}&sf_error=state_mismatch` } })
  }

  // Fetch oauth_pending
  const supabase = createClient(...)
  const { data: pending } = await supabase.from('oauth_pending')
    .select('code_verifier').eq('state', decodeURIComponent(stateToken)).gt('expires_at', new Date().toISOString()).single()
  if (!pending) {
    return new Response(null, { status: 302, headers: { Location: `${SETTINGS_URL}&sf_error=state_mismatch` } })
  }
  await supabase.from('oauth_pending').delete().eq('state', stateToken)

  // Token exchange
  const tokenRes = await fetch(`${baseUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code, client_id: consumerKey, client_secret: consumerSecret,
      redirect_uri: CALLBACK_URL,
      code_verifier: pending.code_verifier
    })
  })
  if (!tokenRes.ok) {
    return new Response(null, { status: 302, headers: { Location: `${SETTINGS_URL}&sf_error=token_exchange_failed` } })
  }
  const tokens = await tokenRes.json()

  // Identity URL
  const identityRes = await fetch(tokens.id, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
  if (!identityRes.ok) {
    return new Response(null, { status: 302, headers: { Location: `${SETTINGS_URL}&sf_error=userinfo_failed` } })
  }
  const identity = await identityRes.json()

  // Vault store (D-08 payload)
  const vaultPayload = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    issued_at: tokens.issued_at,
    expires_at: new Date(parseInt(tokens.issued_at) + 2 * 3600 * 1000).toISOString()
  }
  const { data: secretId } = await supabase.rpc('vault_store_sf_tokens', {
    p_payload: JSON.stringify(vaultPayload),
    p_name: `sf_tokens_${stateData.orgId}`
  })

  // Upsert salesforce_connections
  await supabase.from('salesforce_connections').upsert({
    org_id: stateData.orgId,
    sf_org_id: identity.organization_id,
    sf_username: identity.username,
    instance_url: tokens.instance_url,
    is_sandbox: isSandbox,
    vault_secret_id: secretId,
    connected_at: new Date().toISOString()
  }, { onConflict: 'org_id' })

  return new Response(null, { status: 302, headers: { Location: SETTINGS_URL } })
})
```

### Token Refresh Helper (D-06 shared utility)

```typescript
// supabase/functions/_shared/salesforce-token-refresh.ts
// Used by Phase 12.1+ functions — import directly
export async function getValidSalesforceTokens(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ access_token: string; instance_url: string } | null> {
  const { data: conn } = await supabase.from('salesforce_connections')
    .select('vault_secret_id, instance_url').eq('org_id', orgId).single()
  if (!conn) return null

  const { data: rawTokens } = await supabase.rpc('vault_get_sf_tokens', { p_secret_id: conn.vault_secret_id })
  const tokens = rawTokens as VaultPayload
  const isExpired = new Date(tokens.expires_at) < new Date(Date.now() + 60_000)

  if (!isExpired) return { access_token: tokens.access_token, instance_url: conn.instance_url }

  // Refresh
  const res = await fetch(`https://login.salesforce.com/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('SALESFORCE_CONSUMER_KEY')!,
      client_secret: Deno.env.get('SALESFORCE_CONSUMER_SECRET')!,
      refresh_token: tokens.refresh_token
    })
  })
  if (!res.ok) return null
  const refreshed = await res.json()

  const newPayload = { ...tokens, access_token: refreshed.access_token, issued_at: refreshed.issued_at,
    expires_at: new Date(parseInt(refreshed.issued_at) + 2 * 3600 * 1000).toISOString() }
  await supabase.rpc('vault_update_sf_tokens', { p_secret_id: conn.vault_secret_id, p_payload: JSON.stringify(newPayload) })

  return { access_token: refreshed.access_token, instance_url: conn.instance_url }
}
```

### SalesforceConnection Component Skeleton

```typescript
// src/components/SalesforceConnection.tsx
// Replaces the Salesforce entry in INTEGRATIONS array
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const SF_ERROR_COPY: Record<string, string> = {
  user_denied: 'Salesforce authorization was cancelled. Please try again.',
  state_mismatch: 'The connection request expired or was tampered with. Please try again.',
  token_exchange_failed: 'Could not complete the Salesforce connection. Please try again or contact support.',
  userinfo_failed: 'Connected to Salesforce but could not retrieve org details. Please try again.',
  unknown: 'Something went wrong connecting to Salesforce. Please try again.',
}

// Component renders connected or disconnected state based on salesforce_connections row
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JWT Bearer Token (was in REQUIREMENTS.md) | OAuth 2.0 PKCE (D-01) | Phase 12 discussion | PKCE is the correct multi-tenant B2B SaaS pattern |
| pgsodium standalone extension | Supabase Vault (stable API over pgsodium) | Supabase 2024 | pgsodium pending deprecation; Vault API stable |

**Deprecated/outdated:**
- JWT Bearer Token for multi-tenant SaaS Salesforce: Requires per-customer key management. PKCE handles it with one Connected App.
- Calling `vault.*` directly via PostgREST RPC: Never worked; wrapper functions required.

---

## Existing Codebase Integration Points

### Settings.tsx Changes Required

The Integrations tab renders from the static `INTEGRATIONS` array (line 44–66). The Salesforce entry is hardcoded with `status: 'connected'` and fake detail text. Required changes:

1. Remove the `Salesforce` entry from `INTEGRATIONS` array (keep HubSpot and Workday entries)
2. In the `activeTab === 'Integrations'` render block (line 502–516), add `<SalesforceConnection />` before the `INTEGRATIONS.map()` grid
3. The grid is currently `grid-cols-3` with 3 items — after removing Salesforce it will be 2 items; adjust to `grid-cols-2` or keep 3-col and let it wrap naturally

### Edge Function Structure

All existing functions follow this structure — match exactly:
- `serve()` from `https://deno.land/std@0.168.0/http/server.ts`
- `createClient` from `"supabase"` (import map alias to `npm:@supabase/supabase-js@2`)
- CORS headers block at top, OPTIONS early return
- Service role client: `createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)`
- No `import.meta.url` or module patterns — single `index.ts` with all logic

### Migration Numbering

Latest migration is `20260429000025_style_inspection.sql`. Next should be `20260506000026_salesforce_integration.sql`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Vault | Token storage | Assumed ✓ | Built-in to Supabase hosted | — |
| pg_cron | oauth_pending cleanup | Assumed ✓ | Built-in to Supabase hosted | On-read TTL check only (still works) |
| `SALESFORCE_CONSUMER_KEY` | All 3 Edge Functions | ✗ (human setup D-04) | — | Clear startup error required |
| `SALESFORCE_CONSUMER_SECRET` | All 3 Edge Functions | ✗ (human setup D-04) | — | Clear startup error required |
| Salesforce Connected App | E2E testing | ✗ (human setup D-04) | — | Unit tests can mock; E2E blocked until setup |

**Missing dependencies with no fallback:**
- `SALESFORCE_CONSUMER_KEY` and `SALESFORCE_CONSUMER_SECRET` — must be set by human before any E2E testing. Implementation must surface a `503` with clear message if missing (D-04).

**Missing dependencies with fallback:**
- pg_cron — on-read TTL check in callback serves as fallback if cron job is not set up.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `instance_url` domain is sufficient for org display in connected state (no `organization_name` in identity URL response) | Salesforce OAuth PKCE Flow / Identity URL | Low — `sf_username` is sufficient per D-12; org name is nice-to-have |
| A2 | HMAC state signing uses `btoa`/`atob` with manual padding restoration for base64url decode | Deno PKCE Implementation | Medium — if `atob` fails on url-safe chars, use `TextDecoder` + `Uint8Array` hex decode instead |
| A3 | Supabase Vault is enabled on the project's Supabase instance | Supabase Vault API | Medium — Vault is enabled by default on all Supabase projects; verify in dashboard before migration |
| A4 | Access token TTL is ~2 hours (standard Salesforce default) for the `expires_at` calculation | Token Refresh Helper | Low — actual TTL varies by Connected App settings; token refresh helper checks expiry before use |
| A5 | `private.` schema RPC calls work without schema prefix in `supabase.rpc()` | Vault wrapper pattern | Low — confirmed by existing codebase patterns in phase planning docs |

---

## Open Questions

1. **org_id claim in JWT for initiate function**
   - What we know: Edge Functions verify the auth JWT to get `org_id`; the `useAuth()` hook has `profile.org_id`
   - What's unclear: Does `salesforce-oauth-initiate` receive `org_id` from the request body (frontend sends it) or from the JWT claims?
   - Recommendation: Frontend sends `org_id` in POST body (matches existing pattern from other functions); Edge Function validates it matches the authenticated user's org from the JWT

2. **Vault enable status**
   - What we know: Vault is built into Supabase hosted projects
   - What's unclear: Whether it needs explicit enabling via dashboard or SQL migration
   - Recommendation: Check `SELECT * FROM vault.secrets LIMIT 1` in SQL editor before creating migration; if it errors, enable Vault in Supabase dashboard → Database → Vault

3. **Settings page redirect URL**
   - What we know: Callback redirects to `https://app.com/settings?tab=Integrations`
   - What's unclear: The production app URL is not documented in the codebase
   - Recommendation: Add `SETTINGS_REDIRECT_URL` as an Edge Function secret, or derive from `SUPABASE_URL` environment pattern

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.4 |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npm run test:run` |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-12.1 | PKCE verifier/challenge generation produces valid S256 pair | unit | `npm run test:run -- tests/salesforce-pkce.test.ts` | ❌ Wave 0 |
| REQ-12.1 | State sign + verify round-trip | unit | `npm run test:run -- tests/salesforce-state.test.ts` | ❌ Wave 0 |
| REQ-12.2 | Vault wrapper SQL functions exist and are callable | manual | SQL editor verify | — |
| REQ-12.5 | `SalesforceConnection` renders disconnected state with radio + button | unit | `npm run test:run -- tests/SalesforceConnection.test.tsx` | ❌ Wave 0 |
| REQ-12.5 | `SalesforceConnection` renders connected state with org + username | unit | same | ❌ Wave 0 |
| REQ-12.5 | `sf_error` param renders correct inline error copy | unit | same | ❌ Wave 0 |
| REQ-12.5 | `sf_error` param removed from URL after render | unit | same | ❌ Wave 0 |
| REQ-12.6 | Graceful degradation — null connection does not throw | unit | `npm run test:run -- tests/SalesforceConnection.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:run -- tests/salesforce-*.test.*`
- **Per wave merge:** `npm run test:run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/salesforce-pkce.test.ts` — covers REQ-12.1 PKCE unit tests
- [ ] `tests/salesforce-state.test.ts` — covers REQ-12.1 state sign/verify
- [ ] `tests/SalesforceConnection.test.tsx` — covers REQ-12.5, REQ-12.6

**Note:** Edge Function tests (integration-level) are manual-only per established project pattern — no Deno test runner is wired into Vitest.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth JWT on all Edge Function calls |
| V3 Session Management | yes | oauth_pending TTL 5 min; state nonce prevents replay |
| V4 Access Control | yes | RLS on `salesforce_connections` (org members read, service_role writes) |
| V5 Input Validation | yes | `org_id` validated against authenticated user's JWT claims |
| V6 Cryptography | yes | Vault AEAD encryption; HMAC-SHA256 for state; SHA-256 for PKCE |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF via forged state parameter | Spoofing | HMAC-signed state with org_id + nonce |
| Authorization code replay | Elevation of Privilege | PKCE code_verifier; oauth_pending row deleted on first use |
| Token leakage via DB log | Information Disclosure | D-09: tokens only in Vault; no logging of token values |
| Cross-org token access | Elevation of Privilege | RLS on `salesforce_connections`; `unique(org_id)` constraint |
| Expired state replay | Elevation of Privilege | 5-min TTL on `oauth_pending`; `expires_at > now()` check |
| Disconnect without revoke | Repudiation | `salesforce-oauth-disconnect` calls Salesforce revoke endpoint before deleting |

---

## Sources

### Primary (HIGH confidence)
- [Supabase Vault Docs](https://supabase.com/docs/guides/database/vault) — create_secret, update_secret, decrypted_secrets, wrapper pattern
- [Supabase Vault GitHub README](https://github.com/supabase/vault/blob/main/README.md) — function signatures
- [RFC 7636 PKCE Spec](https://datatracker.ietf.org/doc/html/rfc7636) — code_verifier, code_challenge, S256

### Secondary (MEDIUM confidence)
- [Salesforce PKCE Guide - Daily SFDC](https://dailysfdc.com/web-server-flow-with-pkce/) — authorization endpoint parameters, S256 requirement
- [Salesforce Token Revoke](https://developer.salesforce.com/blogs/developer-relations/2011/11/revoking-oauth-2-0-access-tokens-and-refresh-tokens) — revoke endpoint URL and behavior
- [Salesforce OAuth Token Response](https://sfdcpulse.wordpress.com/2024/02/05/salesforce-rest-api-access-and-refresh-tokens/) — token response fields
- [Salesforce Identity URL](https://developer.salesforce.com/docs/platform/mobile-sdk/guide/oauth-using-identity-urls.html) — identity response fields
- [MakerKit Vault Tutorial](https://makerkit.dev/blog/tutorials/supabase-vault) — SECURITY DEFINER wrapper pattern
- [pg_cron Supabase Docs](https://supabase.com/docs/guides/database/extensions/pg_cron) — cron.schedule() syntax

### Tertiary (LOW confidence)
- Community threads (answeroverflow.com) confirming vault schema not PostgREST-exposed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing dependencies
- Salesforce OAuth endpoints: HIGH — cited from official Salesforce docs
- Vault API signatures: HIGH — cited from official Supabase docs
- Deno PKCE crypto: HIGH — standard Web Crypto API, multiple cross-verified sources
- State signing implementation: MEDIUM — HMAC pattern standard; exact Deno atob/btoa edge cases assumed
- Identity URL response fields: MEDIUM — cited from official SDK docs; `organization_name` absence is assumed

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (Salesforce OAuth endpoints are stable; Vault API is stable)
