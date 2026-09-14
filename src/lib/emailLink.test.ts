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
