# Invite & Recovery Link Scanner Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop corporate email scanners (Microsoft Safe Links et al) from consuming one-time invite and password-reset tokens before the human clicks.

**Architecture:** Emails stop linking to Supabase's `/auth/v1/verify` endpoint — a GET there spends the token. Instead they link to our own page carrying `{{ .TokenHash }}`. That page is inert on load and calls `verifyOtp` only when the user submits the password form, so the token is spent only by a request carrying a user-typed password. A shared `src/lib/emailLink.ts` module holds the parsing/verifying/stripping logic; `AcceptInvite` and `ResetPassword` both consume it.

**Tech Stack:** React 18 + TypeScript + Vite, react-router-dom, `@supabase/supabase-js` ^2.98.0, Vitest + @testing-library/react, Supabase auth email templates (Go template syntax).

**Spec:** `docs/superpowers/specs/2026-09-14-invite-link-scanner-hardening-design.md`

## Global Constraints

- Both pages MUST accept **either** input shape: an existing session (old-style links still in flight) **or** `token_hash` in the query string. Never break invites already sent.
- `verifyOtp` failure MUST surface an error and MUST NOT proceed to `updateUser`.
- `token_hash` MUST be removed from the URL after a successful verify (`history.replaceState`), so it cannot leak via referrer or analytics.
- Invalid-link copy is exactly: `This link is no longer valid — it may have already been used, or it may have expired.` (em dash, not a hyphen) plus a sign-in exit.
- A *used* and an *expired* token are indistinguishable server-side. Never write copy that claims to know which.
- No edge-function change. `_shared/invites.ts` is NOT touched by this plan.
- Existing `src/pages/AcceptInvite.test.tsx` must stay green — its three tests mock `getSession` as returning a session, i.e. they exercise the back-compat path.
- Baselines to compare against, not to fix: `npx vitest run` = 671 passed / 16 skipped. `npx tsc --noEmit` = 303 pre-existing errors.
- Rollout order is frontend → templates → `mailer_otp_exp`. Templates before frontend breaks every new invite.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/emailLink.ts` (new) | Read `token_hash`/`type` from a query string, verify via `verifyOtp`, strip the params. The single place this logic lives. |
| `src/lib/emailLink.test.ts` (new) | Unit tests for the above, no React. |
| `src/pages/AcceptInvite.tsx` | Consumes the module; verify-on-submit; invalid-link state. |
| `src/pages/AcceptInvite.test.tsx` | Existing 3 tests keep passing; new tests for the token_hash path. |
| `src/pages/ResetPassword.tsx` | Same treatment, `type=recovery`, no name field. |
| `src/pages/ResetPassword.test.tsx` (new) | Mirrors the AcceptInvite tests. |
| `supabase/templates/invite.html` | CTA + fallback URL point at our page. |
| `supabase/templates/recovery.html` | Same, recovery. |

---

### Task 1: ~~Confirm `{{ .TokenHash }}` actually renders~~ — DONE 2026-09-14

**This task is already complete. Do not redo it. Read this and move to Task 2.**

`POST /auth/v1/admin/generate_link` (service-role key, `{type:'invite', email}`) was run
against the live project and returned:

- `hashed_token` — populated. This is what `{{ .TokenHash }}` renders, so the design's
  core assumption holds.
- `email_otp` — populated, so the deferred 6-digit fallback is available if ever wanted.
- `action_link` — `https://fuuvdcvbliijffogjnwg.supabase.co/auth/v1/verify?...`,
  confirming the emailed link IS the verify endpoint.

**The bug was also reproduced deterministically in the same run.** One plain `fetch` GET
on `action_link` (no redirect following, no JavaScript) flipped the user from
`confirmed_at: null` / 0 sessions / token present to `confirmed_at` set / 1 session /
token cleared, answering 303 to `app.usejamo.com/...#access_token=…`. That is the exact
state the real client's account was in. The diagnosis is demonstrated, not inferred.

The probe user and invite row were deleted; no residue.

**Two consequences for the rest of this plan:**
1. No human and no inbox are needed anywhere. `generate_link` produces links without
   sending mail.
2. The old "invite a Microsoft 365 mailbox" acceptance test is replaced by a synthetic
   scanner replay — see Task 6 Step 5. Aaron has no Safe Links mailbox, and one is not
   needed: a scanner is just a GET.

The steps below are retained only as the reproducible recipe, e.g. if you need a fresh
probe link while developing. Note `invites.invited_by` FKs to `auth.users(id)` — NOT
`user_profiles.id` — and a pending `invites` row must exist first or the
`handle_new_user` trigger rejects the user with `no pending invite for <email>`.

**Files:** none (verification only)

**Interfaces:**
- Consumes: nothing
- Produces: a confirmed-working template variable name for Task 5

#### Recipe: make a probe invite link without sending email

Used by Task 6 Step 5. Needs `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ACCESS_TOKEN` from `.env`.

```js
// 1. a pending invites row must exist first, or handle_new_user rejects the user
//    with "no pending invite for <email>". invited_by FKs to auth.users(id) and is
//    nullable — omit it rather than passing a user_profiles.id.
await sql(`delete from invites where email='${EMAIL}';`)
await sql(`insert into invites (email, org_id, role, status)
           values ('${EMAIL}','00000000-0000-0000-0000-000000000001','user','pending');`)

// 2. generate the link. This does NOT send an email.
const link = await (await fetch(`${URL}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'invite', email: EMAIL }),
})).json()
// link.hashed_token  -> what {{ .TokenHash }} renders
// link.email_otp     -> the 6-digit code, if the fallback is ever added
// link.action_link   -> the OLD-style verify URL

// 3. state probe, before and after whatever you are testing
const q = `select confirmed_at, last_sign_in_at, (confirmation_token<>'') as token_present,
  (select count(*) from auth.sessions s where s.user_id=u.id) as sessions
  from auth.users u where email='${EMAIL}';`

// 4. ALWAYS clean up: delete the auth user (profile cascades), then the invite row
const [u] = await sql(`select id from auth.users where email='${EMAIL}';`)
await fetch(`${URL}/auth/v1/admin/users/${u.id}`,
  { method: 'DELETE', headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } })
await sql(`delete from invites where email='${EMAIL}';`)
```

Use an address that cannot reach a real person (`scanner-probe@example.com` was used on 2026-09-14). Verify cleanup left no residue: zero matching `auth.users`, zero `invites`, and zero orphaned `user_profiles`.

---

### Task 2: Shared email-link module

**Files:**
- Create: `src/lib/emailLink.ts`
- Test: `src/lib/emailLink.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`
- Produces — Tasks 3 and 4 import exactly these:
  - `type EmailLinkType = 'invite' | 'recovery'`
  - `LINK_NO_LONGER_VALID: string`
  - `readEmailLinkParams(search: string): { tokenHash: string | null; type: EmailLinkType | null }`
  - `stripEmailLinkParams(): void`
  - `verifyEmailLink(tokenHash: string, type: EmailLinkType): Promise<{ ok: true } | { ok: false; message: string }>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/emailLink.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyOtp = vi.fn()
vi.mock('./supabase', () => ({
  supabase: { auth: { verifyOtp: (a: unknown) => verifyOtp(a) } },
}))

import {
  readEmailLinkParams,
  stripEmailLinkParams,
  verifyEmailLink,
  LINK_NO_LONGER_VALID,
} from './emailLink'

describe('readEmailLinkParams', () => {
  it('reads token_hash and an invite type', () => {
    expect(readEmailLinkParams('?token_hash=abc123&type=invite')).toEqual({
      tokenHash: 'abc123',
      type: 'invite',
    })
  })

  it('reads a recovery type', () => {
    expect(readEmailLinkParams('?token_hash=xyz&type=recovery')).toEqual({
      tokenHash: 'xyz',
      type: 'recovery',
    })
  })

  it('rejects an unrecognised type rather than trusting the URL', () => {
    // A caller must never hand an arbitrary string to verifyOtp.
    expect(readEmailLinkParams('?token_hash=abc&type=signup')).toEqual({
      tokenHash: 'abc',
      type: null,
    })
  })

  it('returns nulls for an empty query string', () => {
    expect(readEmailLinkParams('')).toEqual({ tokenHash: null, type: null })
  })
})

describe('verifyEmailLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/accept-invite?token_hash=abc123&type=invite')
  })

  it('calls verifyOtp with the token hash and type', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    const result = await verifyEmailLink('abc123', 'invite')
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'invite' })
    expect(result).toEqual({ ok: true })
  })

  it('strips token_hash and type from the URL after a successful verify', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    await verifyEmailLink('abc123', 'invite')
    expect(window.location.search).not.toContain('token_hash')
    expect(window.location.search).not.toContain('type=invite')
    expect(window.location.pathname).toBe('/accept-invite')
  })

  it('returns the shared message on failure and leaves the URL alone', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    const result = await verifyEmailLink('abc123', 'invite')
    expect(result).toEqual({ ok: false, message: LINK_NO_LONGER_VALID })
    // Left in place so a reload can retry; nothing was consumed.
    expect(window.location.search).toContain('token_hash')
  })

  it('never leaks the raw Supabase error text to the user', async () => {
    // "Token has expired or is invalid" would claim to know which case it was.
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    const result = await verifyEmailLink('abc123', 'invite')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).not.toMatch(/token/i)
  })
})

describe('stripEmailLinkParams', () => {
  it('keeps other query parameters', () => {
    window.history.replaceState({}, '', '/reset-password?token_hash=a&type=recovery&next=%2Fteam')
    stripEmailLinkParams()
    expect(window.location.search).toBe('?next=%2Fteam')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/emailLink.test.ts`
Expected: FAIL — `Failed to resolve import "./emailLink"`.

- [ ] **Step 3: Write the module**

Create `src/lib/emailLink.ts`:

```ts
// Shared by AcceptInvite and ResetPassword.
//
// Why this exists: a Supabase invite link IS the verify endpoint, so a plain GET on it
// spends the one-time token. Corporate link scanners (Microsoft Safe Links and friends)
// fetch every URL in an inbound email, so the scanner spent the token and the real user
// got "expired" — this broke the first client onboarding on 2026-09-14.
//
// The emails now link to our own pages carrying token_hash, and the token is spent ONLY
// by verifyEmailLink, which pages call on password submit. A scanner can GET the page,
// follow redirects and even run JavaScript; it cannot produce a typed password.
import { supabase } from './supabase'

export type EmailLinkType = 'invite' | 'recovery'

// A consumed token and an expired token are both simply absent server-side, so we
// cannot tell them apart. This copy deliberately covers both; pages add the exits.
export const LINK_NO_LONGER_VALID =
  'This link is no longer valid — it may have already been used, or it may have expired.'

export function readEmailLinkParams(search: string): {
  tokenHash: string | null
  type: EmailLinkType | null
} {
  const params = new URLSearchParams(search)
  const rawType = params.get('type')
  return {
    tokenHash: params.get('token_hash'),
    // Allow-list rather than a cast: never hand an arbitrary URL string to verifyOtp.
    type: rawType === 'invite' || rawType === 'recovery' ? rawType : null,
  }
}

/** Remove the single-use token from the address bar so it cannot leak via referrer
 *  headers, analytics, or a shared screenshot. Other query params are preserved. */
export function stripEmailLinkParams(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  const url = new URL(window.location.href)
  url.searchParams.delete('token_hash')
  url.searchParams.delete('type')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

export async function verifyEmailLink(
  tokenHash: string,
  type: EmailLinkType
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) {
    // Deliberately not surfacing error.message: it says "expired or invalid", which
    // implies we know which, and it is the wording that sent an admin resending an
    // invite for an account that already existed.
    return { ok: false, message: LINK_NO_LONGER_VALID }
  }
  stripEmailLinkParams()
  return { ok: true }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/emailLink.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/emailLink.ts src/lib/emailLink.test.ts
git commit -m "feat(auth): shared email-link verification that spends tokens only on submit"
```

---

### Task 3: AcceptInvite verifies on submit

**Files:**
- Modify: `src/pages/AcceptInvite.tsx`
- Test: `src/pages/AcceptInvite.test.tsx` (existing file, add cases)

**Interfaces:**
- Consumes: `readEmailLinkParams`, `verifyEmailLink`, `LINK_NO_LONGER_VALID` from `src/lib/emailLink`
- Produces: nothing other tasks depend on

- [ ] **Step 1: Add the failing tests**

Two edits to `src/pages/AcceptInvite.test.tsx`.

First, add the `verifyOtp` spy beside the existing spies (after the `getSession` line) and replace the whole existing `vi.mock('../lib/supabase', ...)` block with this one — the only change is the added `verifyOtp` line:

```ts
const verifyOtp = vi.fn().mockResolvedValue({ error: null })

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      updateUser: (a: unknown) => updateUser(a),
      verifyOtp: (a: unknown) => verifyOtp(a),
    },
    functions: { invoke: (name: string, opts: unknown) => invoke(name, opts) },
  },
}))
```

Second, add this import beside the other imports so the new block can render the component directly (the existing tests use a dynamic `await import`, which is fine to leave as-is):

```ts
import AcceptInviteCmp from './AcceptInvite'
```

Then append:

```ts
describe('AcceptInvite — token_hash link (scanner-safe path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoke.mockResolvedValue({ error: null })
    updateUser.mockResolvedValue({ error: null })
    verifyOtp.mockResolvedValue({ error: null })
    refreshProfile.mockResolvedValue(undefined)
  })

  function renderWithToken() {
    return render(
      <MemoryRouter initialEntries={['/accept-invite?token_hash=tok123&type=invite']}>
        <AcceptInviteCmp />
      </MemoryRouter>
    )
  }

  it('verifies the token on submit, not on page load', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    renderWithToken()
    const name = await screen.findByLabelText(/full name/i)

    // The whole point: merely opening the page must not spend the token.
    expect(verifyOtp).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok123', type: 'invite' })
    )
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'secret123' }))
  })

  it('does not set a password when the token is already spent', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    renderWithToken()

    const name = await screen.findByLabelText(/full name/i)
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await screen.findByText(/no longer valid/i)
    expect(updateUser).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('skips verifyOtp when a session already exists (old-style link)', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(
      <MemoryRouter initialEntries={['/accept-invite']}>
        <AcceptInviteCmp />
      </MemoryRouter>
    )
    const name = await screen.findByLabelText(/full name/i)
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => expect(updateUser).toHaveBeenCalled())
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('shows the invalid-link state with a sign-in exit when there is neither session nor token', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <MemoryRouter initialEntries={['/accept-invite']}>
        <AcceptInviteCmp />
      </MemoryRouter>
    )
    await screen.findByText(/no longer valid/i)
    expect(screen.queryByLabelText(/full name/i)).toBeNull()
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/AcceptInvite.test.tsx`
Expected: FAIL — the new cases fail because the page never calls `verifyOtp` and renders the old "invalid or has expired" copy.

- [ ] **Step 3: Update the page**

In `src/pages/AcceptInvite.tsx`:

Replace the import block's router import and add the module:

```ts
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { readEmailLinkParams, verifyEmailLink, LINK_NO_LONGER_VALID } from '../lib/emailLink'
```

Inside the component, after `const navigate = useNavigate()`:

```ts
  const { search } = useLocation()
  // Read once per render from the URL; the page does NOT act on it until submit.
  const { tokenHash, type } = readEmailLinkParams(search)
  const hasInviteToken = tokenHash !== null && type === 'invite'
  // Either input shape gets the form: a session (old-style link already in flight) or a
  // token we can spend on submit.
  const canSetPassword = hasSession || hasInviteToken
```

In `handleSubmit`, immediately after `setLoading(true)` and inside the `try`, before `updateUser`:

```ts
      // Spend the one-time token HERE — only ever as part of a submit carrying a
      // password the user typed. A link scanner cannot reach this.
      if (!hasSession && tokenHash) {
        const verified = await verifyEmailLink(tokenHash, 'invite')
        if (!verified.ok) {
          setError(verified.message)
          setLoading(false)
          return
        }
      }
```

Replace the `!hasSession ?` branch of the JSX with `!canSetPassword ?` and swap its body for:

```tsx
          <>
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">Set Your Password</h1>
            <p className="text-sm text-gray-700">{LINK_NO_LONGER_VALID}</p>
            <p className="text-sm text-gray-700 mt-3">
              Already set a password?{' '}
              <Link to="/login" className="text-jamo-600 hover:text-jamo-700">
                Sign in
              </Link>
              . Otherwise ask your admin to resend your invitation.
            </p>
          </>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/AcceptInvite.test.tsx`
Expected: PASS — all 7 tests, including the 3 pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AcceptInvite.tsx src/pages/AcceptInvite.test.tsx
git commit -m "fix(auth): accept invites via token_hash spent on submit, not on page load"
```

---

### Task 4: ResetPassword verifies on submit

`ResetPassword.tsx` is structurally identical to `AcceptInvite.tsx` (same `getSession()` on mount at line 21, same implicit-flow assumption) and its links burn the same way — proven live on 2026-09-14, where `recovery_token` was already cleared 73 seconds after send.

**Files:**
- Modify: `src/pages/ResetPassword.tsx`
- Create: `src/pages/ResetPassword.test.tsx`

**Interfaces:**
- Consumes: `readEmailLinkParams`, `verifyEmailLink`, `LINK_NO_LONGER_VALID` from `src/lib/emailLink`
- Produces: nothing

- [ ] **Step 1: Write the failing tests**

Create `src/pages/ResetPassword.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const updateUser = vi.fn().mockResolvedValue({ error: null })
const verifyOtp = vi.fn().mockResolvedValue({ error: null })
const getSession = vi.fn().mockResolvedValue({ data: { session: null } })
const navigate = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      updateUser: (a: unknown) => updateUser(a),
      verifyOtp: (a: unknown) => verifyOtp(a),
    },
  },
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

import ResetPassword from './ResetPassword'

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'newsecret1' } })
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newsecret1' } })
  fireEvent.click(screen.getByRole('button', { name: /set new password/i }))
}

describe('ResetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateUser.mockResolvedValue({ error: null })
    verifyOtp.mockResolvedValue({ error: null })
  })

  it('does not verify the token on page load', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <MemoryRouter initialEntries={['/reset-password?token_hash=rec123&type=recovery']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByLabelText('Password')
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('verifies with type recovery on submit, then sets the password', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <MemoryRouter initialEntries={['/reset-password?token_hash=rec123&type=recovery']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByLabelText('Password')
    fillAndSubmit()

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'rec123', type: 'recovery' })
    )
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'newsecret1' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
  })

  it('does not set a password when the token is already spent', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    render(
      <MemoryRouter initialEntries={['/reset-password?token_hash=rec123&type=recovery']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByLabelText('Password')
    fillAndSubmit()

    await screen.findByText(/no longer valid/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('skips verifyOtp when a session already exists (old-style link)', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByLabelText('Password')
    fillAndSubmit()

    await waitFor(() => expect(updateUser).toHaveBeenCalled())
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('shows the invalid-link state with a request-new-link exit', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByText(/no longer valid/i)
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/ResetPassword.test.tsx`
Expected: FAIL — the page never calls `verifyOtp` and renders the old "invalid or has expired" copy.

- [ ] **Step 3: Update the page**

In `src/pages/ResetPassword.tsx`:

```ts
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { readEmailLinkParams, verifyEmailLink, LINK_NO_LONGER_VALID } from '../lib/emailLink'
```

After `const navigate = useNavigate()`:

```ts
  const { search } = useLocation()
  const { tokenHash, type } = readEmailLinkParams(search)
  const hasRecoveryToken = tokenHash !== null && type === 'recovery'
  const canSetPassword = hasSession || hasRecoveryToken
```

In `handleSubmit`, inside the `try`, before `updateUser`:

```ts
      if (!hasSession && tokenHash) {
        const verified = await verifyEmailLink(tokenHash, 'recovery')
        if (!verified.ok) {
          setError(verified.message)
          setLoading(false)
          return
        }
      }
```

Change the JSX branch from `!hasSession ?` to `!canSetPassword ?` and replace its paragraph with:

```tsx
            <p className="text-sm text-gray-700">{LINK_NO_LONGER_VALID}</p>
```

Keep the existing `<Link to="/forgot-password">Request a new link</Link>` exactly as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/ResetPassword.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npx vitest run` — expected **689 passed / 16 skipped** (671 baseline + 9 from Task 2 + 4 added in Task 3 + 5 here). If the number differs, reconcile before continuing rather than assuming it drifted.
Run: `npx tsc --noEmit` — expected 303 errors, none in the files you touched. Check with:
`npx tsc --noEmit 2>&1 | grep -E "emailLink|AcceptInvite|ResetPassword"` — expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ResetPassword.tsx src/pages/ResetPassword.test.tsx
git commit -m "fix(auth): reset password via token_hash spent on submit, not on page load"
```

---

### Task 5: Point the email templates at our own pages

**Files:**
- Modify: `supabase/templates/invite.html`
- Modify: `supabase/templates/recovery.html`

**Interfaces:**
- Consumes: the `token_hash`/`type` contract from Task 2, and the route paths used in Tasks 3 and 4
- Produces: the link shape Task 6 applies to the live project

- [ ] **Step 1: Update invite.html**

There are two occurrences of `{{ .ConfirmationURL }}` used as an href, plus one printed as text. Replace ALL THREE with the new URL. The CTA anchor becomes:

```html
                      <a href="{{ .SiteURL }}/accept-invite?token_hash={{ .TokenHash }}&type=invite" target="_blank"
```

The pasteable fallback block becomes:

```html
                <p style="margin:0 0 6px 0;">If the button doesn't work, paste this link into your browser:</p>
                <p style="margin:0; word-break:break-all;">
                  <a href="{{ .SiteURL }}/accept-invite?token_hash={{ .TokenHash }}&type=invite" style="color:#6c29df; text-decoration:underline;">{{ .SiteURL }}/accept-invite?token_hash={{ .TokenHash }}&type=invite</a>
                </p>
```

Then update the file's header comment: the block currently says the available variables are `.ConfirmationURL, .SiteURL, .Email, .Token, .TokenHash, .RedirectTo`. Add a line explaining that `.ConfirmationURL` is deliberately NOT used because it is the Supabase verify endpoint and a link scanner spends it — reference the spec path.

- [ ] **Step 2: Update recovery.html**

Same three replacements, pointing at the reset route:

```html
{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery
```

Add the same explanatory comment line.

- [ ] **Step 3: Verify the rendered output**

Re-render both templates with sample values and confirm no `{{ }}` tags remain unresolved and the URLs are well-formed:

```js
const fs = require('fs')
for (const f of ['invite', 'recovery']) {
  let html = fs.readFileSync(`supabase/templates/${f}.html`, 'utf8')
  html = html
    .split('{{ .SiteURL }}').join('https://app.usejamo.com')
    .split('{{ .TokenHash }}').join('abc123hash')
    .split('{{ .Email }}').join('someone@example.com')
  const unresolved = html.match(/\{\{[^}]*\}\}/g) || []
  const urls = [...html.matchAll(/https:\/\/app\.usejamo\.com\/[a-z-]+\?[^"< ]*/g)].map(m => m[0])
  console.log(f, '| unresolved:', unresolved, '| urls:', [...new Set(urls)])
}
```

Expected: `unresolved: []` for both; invite URLs all `…/accept-invite?token_hash=abc123hash&type=invite`; recovery URLs all `…/reset-password?token_hash=abc123hash&type=recovery`.

Note `&` is correct inside an HTML attribute here; do not "fix" it to `&amp;` — Supabase renders these templates as-is and the app parses the raw query string.

- [ ] **Step 4: Commit**

```bash
git add supabase/templates/invite.html supabase/templates/recovery.html
git commit -m "feat(email): link invites and resets to our own pages, not the verify endpoint"
```

---

### Task 6: Roll out in order and prove it against a replayed scanner

Order matters: the frontend accepts both link shapes, so it is safe to ship first. Templates before frontend would break every new invite.

**Files:** none (deployment + live config)

**Interfaces:**
- Consumes: everything above
- Produces: the working live behaviour

- [ ] **Step 1: Deploy the frontend**

Push to `origin/master` and confirm Netlify has actually built. This repo has a history of prod running stale — verify by fetching the live bundle and grepping for a string unique to this work:

```js
const html = await (await fetch('https://app.usejamo.com/')).text()
const asset = html.match(/\/assets\/[^"]+\.js/)[0]
const js = await (await fetch('https://app.usejamo.com' + asset)).text()
console.log('deployed:', js.includes('no longer valid'))
```

Expected: `deployed: true`. Do not proceed until it is.

This deploy also ships `public/email-logo-wordmark.png`, which the templates reference. Confirm it resolves:

```js
console.log((await fetch('https://app.usejamo.com/email-logo-wordmark.png')).status) // expect 200
```

- [ ] **Step 2: Apply the email templates to the live project**

PATCH `mailer_templates_invite_content`, `mailer_templates_recovery_content`, and the matching `mailer_subjects_*` values from `supabase/config.toml`. Send ONLY `mailer_*` keys — never `uri_allow_list` in a partial payload.

```js
const fs = require('fs')
const tok = fs.readFileSync('.env','utf8').split(/\r?\n/)
  .find(l => l.startsWith('SUPABASE_ACCESS_TOKEN=')).split('=')[1].trim()
const REF = 'fuuvdcvbliijffogjnwg'
const body = {
  mailer_subjects_invite: "You're invited to Jamo",
  mailer_templates_invite_content: fs.readFileSync('supabase/templates/invite.html','utf8'),
  mailer_subjects_recovery: 'Reset your Jamo password',
  mailer_templates_recovery_content: fs.readFileSync('supabase/templates/recovery.html','utf8'),
  mailer_subjects_confirmation: 'Confirm your Jamo account',
  mailer_templates_confirmation_content: fs.readFileSync('supabase/templates/confirmation.html','utf8'),
  mailer_subjects_email_change: 'Confirm your email change',
  mailer_templates_email_change_content: fs.readFileSync('supabase/templates/email-change.html','utf8'),
}
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
console.log('status', r.status)
```

- [ ] **Step 3: Verify the write landed**

Wait ~20 seconds — reads lag writes on this endpoint — then re-read and assert:

```js
const cur = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`,
  { headers: { Authorization: `Bearer ${tok}` } })).json()
console.log('invite has token_hash link:', cur.mailer_templates_invite_content.includes('/accept-invite?token_hash='))
console.log('invite still references verify endpoint:', cur.mailer_templates_invite_content.includes('ConfirmationURL'))
console.log('allow list intact:', cur.uri_allow_list)
```

Expected: `true`, `false`, and an allow list still containing all six original entries.

- [ ] **Step 4: Raise the link lifetime**

```js
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mailer_otp_exp: 86400 }),
})
console.log('status', r.status)
```

Also update `supabase/config.toml` (`[auth.email] otp_expiry`) to 86400 so the repo matches the live project, and commit:

```bash
git add supabase/config.toml
git commit -m "chore(auth): raise email link lifetime to 24h"
```

- [ ] **Step 5: THE ACCEPTANCE TEST — synthetic scanner replay**

This is the only step that actually proves the fix. Everything before it proves only that the happy path still works.

No Microsoft mailbox is needed: a scanner is an HTTP GET before the human, and that is reproducible. This exact GET was proven on 2026-09-14 to burn the OLD link (see Task 1), so this is a real regression test, not a simulation of one.

Create a probe invite with `generate_link` (recipe in Task 1), then build the NEW URL shape from the returned `hashed_token`:

```
https://app.usejamo.com/accept-invite?token_hash=<hashed_token>&type=invite
```

Replay a scanner against it at three escalating fidelities, re-checking state after each:

```js
const q = `select confirmed_at, last_sign_in_at, (confirmation_token<>'') as token_present,
  (select count(*) from auth.sessions s where s.user_id=u.id) as sessions
  from auth.users u where email='<probe address>';`

// 1. plain GET — what most scanners do, and what burned the old link
await fetch(newUrl, { redirect: 'manual' })
// 2. GET following the full redirect chain
await fetch(newUrl, { redirect: 'follow' })
// 3. headless browser that RENDERS the page and runs our JavaScript
//    (Playwright: navigate to newUrl, wait for the form to appear, do NOT submit)
```

Pass condition after all three: `confirmed_at` NULL, `last_sign_in_at` NULL, `token_present` true, `sessions` 0 — nothing was spent.

Then complete the flow as a human would: load the page, fill the form, submit. Expected: it succeeds, and only now do `confirmed_at` and a session appear. Delete the probe user afterwards.

Level 3 matters most, and is a stronger guarantee than a real Safe Links test would give: it proves the token survives a scanner that executes our JavaScript, which a curl-level check cannot show.

If any level spends the token, stop and reopen the spec rather than patching.

- [ ] **Step 6: Record the result and close the todos**

Add the outcome to the spec's "Risks and open questions" section, replacing the circumstantial-diagnosis caveat with what the live test showed. Then commit:

```bash
git add docs/superpowers/specs/2026-09-14-invite-link-scanner-hardening-design.md
git commit -m "docs(spec): record the live Microsoft 365 verification result"
```

---

## Notes for the executor

- **Do not delete the `Bioduro US` org or `max@usejamo.com`.** The client may keep using that account for a while; removal is explicitly deferred and is not part of this plan.
- If Task 1 fails, nothing else in this plan is valid. Stop and say so.
- `auth.audit_log_entries` is empty on this project. Use `auth.sessions` (which carries `ip` and `user_agent`) and the `auth.users` token columns for any auth forensics.
- `supabase db push` does not work here — history diverged. Run SQL through the Management API endpoint used above.
- `.env` must contain only `KEY=VALUE` lines or the Supabase CLI fails with a confusing parse error.
