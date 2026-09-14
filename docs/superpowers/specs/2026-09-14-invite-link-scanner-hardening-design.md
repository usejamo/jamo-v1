# Invite & recovery links must survive corporate email scanners

**Date:** 2026-09-14
**Status:** Design approved, not yet implemented
**Scope:** Frontend + email templates + one auth config value. No edge-function change.

## Problem

During the first client onboarding (BioDuro, 2026-09-14) the invited user clicked his
invitation and was told it had expired, roughly two minutes after it was sent. A
password-reset link sent as a workaround failed the same way within 73 seconds. The
onboarding had to be salvaged by creating a second organisation and handing the client
an account under an internal Jamo email address.

This was not a configuration mistake and not a token-lifetime problem. It will happen
again with every client whose email is protected by a link scanner, which in practice
means most pharma and CRO customers.

## Root cause

A Supabase invite link **is** the verification endpoint:

```
https://<ref>.supabase.co/auth/v1/verify?token=<one-time>&type=invite&redirect_to=<app>
```

A plain `GET` on that URL consumes the one-time token server-side, marks the user
confirmed, mints a session, and 302-redirects to the app with the session in the URL
*fragment*. Microsoft Defender for Office 365 Safe Links (and Mimecast, Proofpoint et al)
fetch every URL in an inbound email to scan it. The scanner's fetch therefore:

1. spends the token,
2. receives the redirect and discards the fragment (fragments are never sent to a server),
3. leaves the human's later click with nothing to verify.

The app then renders `AcceptInvite.tsx`'s "This invite link is invalid or has expired."

### Evidence

Session rows for the invited user (`auth.sessions`):

| time | IP | user agent |
|---|---|---|
| 17:06:56 — token consumed | `57.155.170.192` (Microsoft Azure) | **Windows NT 10.0**, Chrome 142 |
| 17:13:52, 17:15:10 — the human | `134.199.71.49` | **macOS**, Chrome |

The invited user was on a Mac. The fetch that consumed his invitation came from a Windows
client in a Microsoft IP range, 61 seconds after the email was sent and before he clicked.

Corroborating: `recovery_sent_at` was 73 seconds old while `recovery_token` was already
cleared — the reset link was consumed the same way. And the account showed
`email_confirmed_at`, `last_sign_in_at` and a live session for a user who, correctly,
reported never having set a password.

Both affected pages share one mechanism, so one fix covers both:
`AcceptInvite.tsx:24` and `ResetPassword.tsx:21` each call `supabase.auth.getSession()`
on mount and depend on `detectSessionInUrl` having parsed a fragment the scanner ate.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| When is the token spent | On password submit (one step) | The request that spends the token carries a user-typed password. A scanner cannot fabricate one, even if it executes JavaScript and clicks buttons. An "Accept" button interstitial is weaker on exactly that point. |
| `mailer_otp_exp` | 3600 → 86400 (24h) | Covers a client opening the email next morning. It is a single global setting, so reset links also live 24h; acceptable because reset still requires inbox access. |
| 6-digit OTP fallback | Not now | Keeps one clear CTA and avoids a new screen plus a second path into the same auth state while the primary fix is still unproven in the field. Documented as a follow-up. |

## Design

### Flow

```
email → https://app.usejamo.com/accept-invite?token_hash=<hash>&type=invite
page load → inert: no verify, no session, no side effect
user types name + password → submit
  → verifyOtp({ token_hash, type: 'invite' })      ← token spent here, and only here
  → updateUser({ password })
  → invoke('accept-invite')                         (unchanged)
  → refreshProfile() → navigate('/')
```

Recovery is identical with `type=recovery` against `/reset-password`, minus the name
field and the `accept-invite` call.

### Files

| File | Change |
|---|---|
| `supabase/templates/invite.html` | CTA + fallback URL → `{{ .SiteURL }}/accept-invite?token_hash={{ .TokenHash }}&type=invite` |
| `supabase/templates/recovery.html` | → `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery` |
| `src/pages/AcceptInvite.tsx` | Read `token_hash`/`type` from query; verify on submit; new error states |
| `src/pages/ResetPassword.tsx` | Same treatment |
| Supabase auth config (remote) | `mailer_otp_exp` → 86400 |

**No edge-function change.** `{{ .TokenHash }}` and `{{ .SiteURL }}` are template-native,
so `_shared/invites.ts` keeps calling `inviteUserByEmail(email, { redirectTo })` unchanged
and nothing deploys to Supabase Functions. `redirectTo` becomes unused by the email (it
only feeds `{{ .ConfirmationURL }}`, which we stop referencing) but is harmless and stays.

### Input handling — three cases per page

1. **Session already present** (old-style link still in flight) → skip `verifyOtp`, behave
   exactly as today. This is what keeps already-sent invites working through the change.
2. **`token_hash` present, no session** → the new path; verify on submit.
3. **Neither** → invalid-link message, no form.

After a successful verify, strip `token_hash` from the URL with `history.replaceState` so
it cannot leak via referrer headers or analytics.

### Error handling

Once this ships, a *used* token and an *expired* token are indistinguishable — both are
simply absent server-side. Rather than guess, the copy covers both and offers two exits:

> This invitation link is no longer valid — it may have already been used, or it may have
> expired.
> **Already set a password? Sign in.** · **Otherwise, ask your admin to resend.**

This replaces the current dead-end wording, which is what led to resending an invite for
an account that already existed — which then failed, because `inviteUserByEmail` rejects
an already-registered address and the helper's compensating revoke marks the new row
revoked.

A failed `verifyOtp` must surface its error and **must not** proceed to `updateUser`.

## Testing

Unit (Vitest, alongside the existing `AcceptInvite.test.tsx`, which must stay green):

- `token_hash` in URL, no session → submit calls `verifyOtp` then `updateUser`, in that order
- session present, no `token_hash` → submit skips `verifyOtp` (back-compat)
- `verifyOtp` fails → error rendered, `updateUser` never called
- neither input → invalid-link message, no form rendered
- `token_hash` removed from the URL after a successful verify
- equivalents for `ResetPassword`

Not unit-testable: the scanner itself. The real proof is a live invite to a mailbox behind
Microsoft 365, checking the token is still unconsumed before a human clicks (no session row
and `confirmation_token` still set). That test is the acceptance criterion for this work —
everything else only proves we did not break the happy path.

## Rollout order

1. **Deploy the frontend first.** It accepts both link shapes, so this is safe while the
   live templates still send old-style links.
2. **Then apply the email templates** — and note `public/email-logo-wordmark.png` must be
   deployed before or with them, or the emails render a broken image. Applying templates is
   a `PATCH /v1/projects/<ref>/config/auth` sending **only** `mailer_templates_*` and
   `mailer_subjects_*` keys; never include `uri_allow_list` in a partial payload, and
   re-read ~20s later because that endpoint's reads lag writes.
3. **Then `mailer_otp_exp` → 86400.**

Templates before frontend would break every new invite.

## Reproduced without Microsoft — 2026-09-14

A link scanner is not special: it is an HTTP GET on the URL before the human. That is
reproducible with `fetch`, so **no Microsoft 365 mailbox is needed** to demonstrate the
bug or to test the fix. Neither is an inbox: `POST /auth/v1/admin/generate_link` returns
the link without sending mail.

Run against the live project, one plain GET with no redirect following and no JavaScript:

| | before the GET | after |
|---|---|---|
| `confirmed_at` | null | **set** |
| `last_sign_in_at` | null | **set** |
| `confirmation_token` | present | **cleared** |
| `auth.sessions` | 0 | **1** |

The response was a 303 to `https://app.usejamo.com/...#access_token=…`. This is exactly
the state the real client's account was in at 17:06:56. **The diagnosis is demonstrated,
not inferred.**

`generate_link` also settled the other open question: it returns `hashed_token` (so
`{{ .TokenHash }}` is real and populated) and `email_otp` (so the deferred 6-digit
fallback is available whenever it is wanted). `action_link` is
`https://<ref>.supabase.co/auth/v1/verify`, confirming the link is the verify endpoint.

### How to test the fix (replaces the "live Microsoft 365 test")

Replay the scanner synthetically at three escalating fidelities against the NEW flow:

1. **Plain GET** on the emailed URL — what most scanners do. This is the exact request
   proven above to burn the old link.
2. **GET following redirects** — the full chain.
3. **Headless browser page load (Playwright)** — covers a scanner sandbox that renders the
   page and executes our JavaScript.

Pass condition for all three: the token is still unspent afterwards (`confirmed_at` null,
0 sessions, `confirmation_token` still present), and a subsequent real form submit works.

Level 3 is a *stronger* guarantee than a real Safe Links check, because it proves the
token survives even a scanner that runs our JS — which a `curl`-level test cannot show.

## Risks and open questions

- **Residual gap: link rewriting and stripping.** The synthetic scanner models fetching,
  redirect-following and JS execution, which is the mechanism. It does not model a gateway
  that *rewrites* links (Safe Links wraps them in `safelinks.protection.outlook.com`) or
  strips them entirely. Rewriting does not defeat this design — the wrapped URL still
  lands on our page — but a gateway that removes links altogether would, and that is the
  standing argument for eventually adding the `email_otp` fallback. Not closed by this
  work; recorded here so nobody assumes it is.
- The first real enterprise invite after this ships should still be watched: confirm the
  token is unspent before the client clicks, using the same query as the synthetic test.
- `uri_allow_list` already contains `https://app.usejamo.com/accept-invite` and
  `/reset-password`. Query parameters do not affect allow-list matching, so no change is
  needed — but worth re-checking if links ever 400.
- Raising `mailer_otp_exp` lengthens the reset-link window to 24h. Accepted above.

## Out of scope / follow-ups

- 6-digit OTP fallback for gateways that strip links entirely (see Decisions).
- Personalising the invite with org and inviter name — todo #28, needs the edge-function
  change this design deliberately avoids.
- The cleanup of the `Bioduro US` workaround org and `max@usejamo.com` is deliberately
  deferred: the client may keep using that account for a while, and nothing is deleted
  until he has moved to `matt.troskey@bioduro.com`.
