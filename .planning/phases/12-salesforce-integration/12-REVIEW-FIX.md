---
phase: 12-salesforce-integration
fixed_at: 2026-05-06T00:00:00Z
review_path: .planning/phases/12-salesforce-integration/12-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 5
skipped: 1
status: partial
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-05-06T00:00:00Z
**Source review:** .planning/phases/12-salesforce-integration/12-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 5
- Skipped: 1

## Fixed Issues

### CR-01: Non-timing-safe HMAC state comparison allows timing oracle

**Files modified:** `supabase/functions/_shared/salesforce-crypto.ts`
**Commit:** c2106a5
**Applied fix:** Replaced `signState` re-sign + string equality check with `crypto.subtle.importKey` (usage: `['verify']`) + `crypto.subtle.verify()`. The received base64url signature is decoded to bytes and verified in constant time against the payload `orgId:nonce`. The function signature is unchanged.

---

### CR-02: Arbitrary Salesforce error value reflected into redirect URL

**Files modified:** `supabase/functions/salesforce-oauth-callback/index.ts`
**Commit:** d2333d7
**Applied fix:** Added origin allowlist validation of `SETTINGS_REDIRECT_URL` at handler startup (`ALLOWED_SETTINGS_ORIGINS = ['https://app.usejamo.com', 'http://localhost:5173']`). If origin is not in the allowlist, logs a warning and falls back to the localhost default. Also replaced the bare `errorParam === 'access_denied'` check with a `KNOWN_SF_ERRORS` Set containing `access_denied`, `invalid_request`, and `unauthorized_client` — only these whitelisted values trigger the user_denied redirect.

---

### WR-01: Double-decode of state token may cause lookup miss for URL-encoded states

**Files modified:** `supabase/functions/salesforce-oauth-callback/index.ts`
**Commit:** d2333d7
**Applied fix:** Removed both `decodeURIComponent(stateToken)` wrappers (select `.eq('state', ...)` and delete `.eq('state', ...)`). `stateToken` is now used directly since `URLSearchParams.get()` already URL-decodes. Updated the comment to reflect this. CR-02 and WR-01 were applied in a single atomic commit since both touch the same file.

---

### WR-03: `handleConnect` sends `undefined` as `org_id` when profile is not yet loaded

**Files modified:** `src/components/SalesforceConnection.tsx`
**Commit:** 2aead92
**Applied fix:** Added `if (!orgId) return` guard at the top of `handleConnect`. Updated the Connect button's `disabled` prop to `loading || fetchLoading || !orgId` and applied the same condition to the opacity class, preventing clicks before auth context resolves.

---

### WR-04: `oauth_pending` insert error is silently swallowed in the initiate function

**Files modified:** `supabase/functions/salesforce-oauth-initiate/index.ts`
**Commit:** 205b5cf
**Applied fix:** Destructured `{ error: insertError }` from the `.insert()` call. If `insertError` is truthy, returns HTTP 500 with `{ error: 'Failed to store OAuth state. Please try again.' }` before building or returning `auth_url`.

---

## Skipped Issues

### WR-02: `is_sandbox` detection heuristic is incomplete and can misclassify orgs

**File:** `supabase/functions/salesforce-oauth-callback/index.ts:148-150`
**Reason:** deferred — requires migration. The fix requires adding an `is_sandbox` column to the `oauth_pending` table (ALTER TABLE migration), updating `salesforce-oauth-initiate` to store the flag, and updating the callback to read it back. Applying the callback read without the migration would produce a runtime error (column does not exist). This must be done as a coordinated schema + code change. The current heuristic (`instance_url.includes('sandbox') || instance_url.includes('test.salesforce.com') || tokens.id.startsWith('https://test.salesforce.com')`) remains in place.
**Original issue:** Sandbox scratch orgs on `*.scratch.salesforce.com` or `*.develop.salesforce.com` are not matched by the current heuristic and will be misclassified as production. The original `is_sandbox` client flag is lost after initiate.

---

_Fixed: 2026-05-06T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
