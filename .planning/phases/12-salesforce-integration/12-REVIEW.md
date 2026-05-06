---
phase: 12-salesforce-integration
reviewed: 2026-05-06T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - supabase/functions/_shared/salesforce-crypto.ts
  - supabase/functions/_shared/salesforce-token-refresh.ts
  - supabase/functions/salesforce-oauth-initiate/index.ts
  - supabase/functions/salesforce-oauth-callback/index.ts
  - supabase/functions/salesforce-oauth-disconnect/index.ts
  - supabase/migrations/20260506000026_salesforce_integration.sql
  - src/components/SalesforceConnection.tsx
  - src/pages/Settings.tsx
  - tests/salesforce-pkce.test.ts
  - tests/salesforce-state.test.ts
  - tests/SalesforceConnection.test.tsx
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-05-06T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This phase implements the Salesforce OAuth PKCE connection layer. The overall architecture is sound: PKCE is correctly implemented with SHA-256 and base64url encoding, tokens are stored exclusively in Vault (never in plain columns), state tokens use HMAC-SHA-256, the callback strips tokens from logs, and the React component maps `sf_error` through a hardcoded copy dictionary (no raw SF data rendered). RLS is enabled on both new tables.

Two critical issues require fixes before merge: the state verification in `salesforce-crypto.ts` uses string equality instead of a timing-safe comparison (HMAC oracle risk), and the callback function reflects an arbitrary Salesforce-supplied `errorParam` value into the redirect URL without whitelisting it (open redirect / reflected parameter injection). Four warnings cover reliability gaps: the `is_sandbox` heuristic is fragile, a double-decode bug when Salesforce URL-encodes the state token, an unhandled `null` orgId path in the React connect handler, and the `oauth_pending` insert error going unchecked. Three informational items round out minor quality concerns.

---

## Critical Issues

### CR-01: Non-timing-safe HMAC state comparison allows timing oracle

**File:** `supabase/functions/_shared/salesforce-crypto.ts:71`

**Issue:** `verifyState` reconstructs the expected token and compares with `expectedToken !== stateToken` — a plain JavaScript string equality check. String comparison short-circuits on the first differing byte, leaking timing information. An attacker who can make repeated requests to the callback endpoint and measure response latency could use this as an HMAC oracle to forge state tokens without knowing the secret, undermining the CSRF protection for the OAuth flow.

**Fix:** Compare the HMAC signatures byte-by-byte using `crypto.subtle.verify` rather than reconstructing the full token and comparing strings. Restructure `verifyState` to re-sign only the extracted payload and then verify with the Web Crypto API:

```typescript
export async function verifyState(
  stateToken: string,
  secret: string
): Promise<{ orgId: string; nonce: string } | null> {
  const dotIndex = stateToken.indexOf('.')
  if (dotIndex === -1) return null

  const payloadB64 = stateToken.substring(0, dotIndex)
  const sigB64 = stateToken.substring(dotIndex + 1)
  if (!payloadB64 || !sigB64) return null

  const padded = payloadB64 + '=='.slice(0, (4 - (payloadB64.length % 4)) % 4)
  let payload: string
  try {
    payload = atob(padded)
  } catch {
    return null
  }

  const colonIndex = payload.indexOf(':')
  if (colonIndex === -1) return null

  const orgId = payload.substring(0, colonIndex)
  const nonce = payload.substring(colonIndex + 1)

  // Timing-safe verify using Web Crypto
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  )

  // Decode the received signature back to bytes
  let sigBytes: Uint8Array
  try {
    const sigPadded = sigB64 + '=='.slice(0, (4 - (sigB64.length % 4)) % 4)
    // re-add standard base64 chars before decoding
    const sigStd = sigPadded.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(sigStd)
    sigBytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  } catch {
    return null
  }

  const valid = await crypto.subtle.verify(
    'HMAC', key, sigBytes, encoder.encode(`${orgId}:${nonce}`)
  )
  if (!valid) return null

  return { orgId, nonce }
}
```

---

### CR-02: Arbitrary Salesforce error value reflected into redirect URL

**File:** `supabase/functions/salesforce-oauth-callback/index.ts:29-33`

**Issue:** The `errorParam` value read directly from Salesforce's redirect (`url.searchParams.get('error')`) is compared only against the literal string `'access_denied'`. Any other Salesforce error value (e.g., `'redirect_uri_mismatch'`, `'invalid_client_id'`, or an attacker-injected value via a crafted link) falls through to the `!code || !stateToken` branch and gets the generic `state_mismatch` error — that part is safe. However the check at line 29 only routes `access_denied` to a known safe redirect. The `error` and `error_description` query parameters from Salesforce are not sanitised at all, and while they are not currently appended to the redirect URL, the pattern creates a fragile safety assumption. More concretely: an attacker who can control the Salesforce error response (e.g., via a crafted auth request) could cause `SETTINGS_URL` itself to be a partially-controlled value if `SETTINGS_REDIRECT_URL` is misconfigured. Additionally, `SETTINGS_URL` is constructed by appending `&sf_error=...` string literals — if `SETTINGS_URL` already contains a fragment (`#`) the appended parameter would appear after the fragment and be silently ignored by the browser, potentially swallowing error state.

**Fix:** Whitelist the `errorParam` values that are acted upon, and validate `SETTINGS_URL` is a known safe origin at startup:

```typescript
// At function startup — validate SETTINGS_URL is a trusted origin
const ALLOWED_SETTINGS_ORIGINS = [
  'https://app.usejamo.com',
  'http://localhost:5173',
]
const parsedSettings = (() => {
  try { return new URL(SETTINGS_URL) } catch { return null }
})()
if (!parsedSettings || !ALLOWED_SETTINGS_ORIGINS.includes(parsedSettings.origin)) {
  // Fail safe — redirect to a hardcoded fallback or return 400
  return new Response('Misconfigured redirect URL', { status: 500 })
}

// For the error branch — whitelist known Salesforce error values
const KNOWN_SF_ERRORS = new Set(['access_denied', 'invalid_request', 'unauthorized_client'])
if (errorParam && KNOWN_SF_ERRORS.has(errorParam)) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${SETTINGS_URL}&sf_error=user_denied` },
  })
}
```

---

## Warnings

### WR-01: Double-decode of state token may cause lookup miss for URL-encoded states

**File:** `supabase/functions/salesforce-oauth-callback/index.ts:62,74`

**Issue:** The `stateToken` variable is taken directly from `url.searchParams.get('state')`, which already performs URL-decoding (the `URLSearchParams` API decodes percent-encoding automatically). Then at lines 62 and 74 the code passes `decodeURIComponent(stateToken)` to the Supabase query. If Salesforce returns a state value that contains characters which were percent-encoded once (e.g., `+` encoded as `%2B`), `URLSearchParams.get()` decodes it to `+`, and then `decodeURIComponent` leaves `+` as-is — these will match. However, if Salesforce double-encodes, the second `decodeURIComponent` produces a different string from what was stored at insert time (line 61 stores the raw `state` from `signState`, which never contains `%`-sequences). This is fragile and the comment on line 57 acknowledges it without fully resolving it. The HMAC verification at line 44 runs on the un-decoded `stateToken`, and the DB lookup at line 62 runs on the decoded value — these must be the same string for both checks to be coherent.

**Fix:** Remove `decodeURIComponent` from the DB queries since `URLSearchParams.get()` already decodes, and verify the HMAC against the same string passed to the DB lookup:

```typescript
// stateToken is already decoded by URLSearchParams.get()
// Use it directly for both HMAC verification and DB lookup
const stateData = await verifyState(stateToken, consumerSecret)

const { data: pending } = await supabase
  .from('oauth_pending')
  .select('code_verifier, org_id')
  .eq('state', stateToken)           // not decodeURIComponent(stateToken)
  .gt('expires_at', new Date().toISOString())
  .single()

// ...same for delete:
await supabase.from('oauth_pending').delete().eq('state', stateToken)
```

---

### WR-02: `is_sandbox` detection heuristic is incomplete and can misclassify orgs

**File:** `supabase/functions/salesforce-oauth-callback/index.ts:148-150`

**Issue:** The sandbox detection at lines 148–150 checks for the substring `'sandbox'` or `'test.salesforce.com'` in `tokens.instance_url`, and whether `tokens.id` starts with `https://test.salesforce.com`. Salesforce scratch orgs and developer edition orgs hosted on `*.scratch.salesforce.com` or `*.develop.salesforce.com` will not match any of these patterns and will be incorrectly classified as production. Additionally, the original `is_sandbox` flag submitted by the client in `oauth_pending` is not stored in the table and is therefore lost — the callback must re-derive it from the response, which is fragile.

**Fix:** Store `is_sandbox` in the `oauth_pending` table at initiation time and read it back in the callback, using the instance_url check only as a secondary confirmation:

```sql
-- In migration: add is_sandbox to oauth_pending
alter table oauth_pending add column is_sandbox boolean not null default false;
```

```typescript
// In salesforce-oauth-initiate/index.ts — store is_sandbox
await supabase.from('oauth_pending').insert({
  state,
  org_id,
  code_verifier: codeVerifier,
  is_sandbox: is_sandbox,   // persist the client-supplied flag
  expires_at: expiresAt,
})
```

```typescript
// In salesforce-oauth-callback/index.ts — read it back
const { data: pending } = await supabase
  .from('oauth_pending')
  .select('code_verifier, org_id, is_sandbox')
  // ...

const isSandbox = pending.is_sandbox
```

---

### WR-03: `handleConnect` sends `undefined` as `org_id` when profile is not yet loaded

**File:** `src/components/SalesforceConnection.tsx:67-68`

**Issue:** `orgId` is derived as `profile?.org_id` (line 22), which is `undefined` when the auth context has not finished loading. The `handleConnect` function (line 64) does not guard against this and will invoke `salesforce-oauth-initiate` with `{ org_id: undefined, is_sandbox: ... }`. The Edge Function does check `if (!org_id)` (line 35 of the initiate function) and returns a 400, which the component catches and shows a generic error — so there is no data leak. However the UX impact is a spurious error if the user clicks "Connect Salesforce" before the profile loads, and the Connect button is not disabled during the profile fetch window.

**Fix:** Disable the Connect button while `fetchLoading` is true, or guard in the handler:

```typescript
const handleConnect = async () => {
  if (!orgId) return  // profile not yet loaded
  setLoading(true)
  // ...
}
```

And in JSX:
```tsx
<button
  onClick={handleConnect}
  disabled={loading || !orgId}
  // ...
>
```

---

### WR-04: `oauth_pending` insert error is silently swallowed in the initiate function

**File:** `supabase/functions/salesforce-oauth-initiate/index.ts:61-66`

**Issue:** The `supabase.from('oauth_pending').insert(...)` call at line 61 is `await`-ed but its return value is not destructured to check for an error. If the insert fails (e.g., unique constraint violation on `state`, RLS misconfiguration, or DB unavailability), the function proceeds to return a `auth_url` to the client. The browser then navigates to Salesforce, the user authenticates, and the callback fails with `state_mismatch` because no matching row exists — this produces a confusing error with no diagnostic path.

**Fix:** Check the insert result and return a 500 if it fails:

```typescript
const { error: insertError } = await supabase.from('oauth_pending').insert({
  state,
  org_id,
  code_verifier: codeVerifier,
  expires_at: expiresAt,
})

if (insertError) {
  return new Response(
    JSON.stringify({ error: 'Failed to initiate OAuth flow. Please try again.' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
```

---

## Info

### IN-01: `base64URLEncode` uses spread operator on large Uint8Array — potential stack overflow

**File:** `supabase/functions/_shared/salesforce-crypto.ts:6`

**Issue:** `String.fromCharCode(...array)` spreads the entire `Uint8Array` as function arguments. For the 32-byte verifier and 32-byte SHA-256 digest this is safe, but the function is exported and could be called with larger inputs in future. The spread-into-call pattern exceeds the call stack argument limit (~65k–100k args in V8/JavaScriptCore) for large arrays. This is informational given current usage sizes, but worth hardening.

**Fix:** Use a reduce or chunked approach:
```typescript
export function base64URLEncode(array: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < array.length; i++) binary += String.fromCharCode(array[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
```

---

### IN-02: `salesforce-token-refresh.ts` uses `issued_at` as milliseconds without validation

**File:** `supabase/functions/_shared/salesforce-token-refresh.ts:75`

**Issue:** `parseInt(refreshed.issued_at)` (line 75) and the equivalent in the callback (line 158) assume `issued_at` is a Unix millisecond epoch string. Salesforce's documentation states `issued_at` is Unix milliseconds, so this is correct — but if Salesforce ever returns an unexpected format (or the field is absent/`null`), `parseInt` returns `NaN`, causing `new Date(NaN + ...)` to produce `Invalid Date`, and `expires_at` in the Vault payload would be the string `"Invalid Date"`. On the next token check, `new Date("Invalid Date") < new Date(Date.now() + 60_000)` evaluates to `false` (NaN comparison), so the token would never be refreshed even when expired.

**Fix:** Add a guard:
```typescript
const issuedMs = parseInt(refreshed.issued_at, 10)
if (isNaN(issuedMs)) return null

const newPayload: VaultPayload = {
  ...tokens,
  access_token: refreshed.access_token,
  issued_at: refreshed.issued_at,
  expires_at: new Date(issuedMs + 2 * 3600 * 1000).toISOString(),
}
```

---

### IN-03: Missing test coverage for the `orgId` undefined guard path and `oauth_pending` insert failure

**File:** `tests/SalesforceConnection.test.tsx` and `tests/salesforce-pkce.test.ts`

**Issue:** There is no test that renders `SalesforceConnection` with `profile: null` (orgId undefined) and verifies the Connect button is disabled or the handler is a no-op. Additionally, there is no unit test for the `oauth_pending` insert failure path in the initiate function (WR-04 above), and no test verifies that `verifyState` rejects a token signed with a different secret (only tampered payload is tested in `salesforce-state.test.ts`). These gaps leave the most security-sensitive paths untested.

**Fix:** Add the following test cases:
- `SalesforceConnection.test.tsx`: render with `useAuth` returning `{ profile: null }`, assert Connect button is disabled or click produces no network call.
- `salesforce-state.test.ts`: add a test verifying `verifyState(token, differentSecret)` returns `null`.

---

_Reviewed: 2026-05-06T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
