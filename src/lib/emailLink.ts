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
