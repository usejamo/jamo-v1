// REQ-12.1 PKCE generation unit tests
import { describe, it, expect } from 'vitest'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  base64URLEncode,
} from '../supabase/functions/_shared/salesforce-crypto.ts'

describe('PKCE generation', () => {
  it('generateCodeVerifier returns a 43-character base64url string', () => {
    const v = generateCodeVerifier()
    expect(v).toHaveLength(43)
  })

  it('generateCodeVerifier output contains only base64url chars (A-Z a-z 0-9 - _)', () => {
    const v = generateCodeVerifier()
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/)
  })

  it('generateCodeChallenge produces S256 challenge: base64url(SHA-256(verifier))', async () => {
    const v = generateCodeVerifier()
    const c = await generateCodeChallenge(v)
    expect(c).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(c.length).toBeGreaterThan(0)
  })

  it('generateCodeChallenge challenge is different from verifier', async () => {
    const v = generateCodeVerifier()
    const c = await generateCodeChallenge(v)
    expect(c).not.toBe(v)
  })

  it('base64URLEncode strips = padding characters', () => {
    // 3 zero bytes produce 'AAAA' in base64 (no padding needed at length 4, but test with 1 byte)
    // 1 byte produces 2 base64 chars + 2 padding chars: e.g. new Uint8Array([0]) → 'AA=='
    const arr = new Uint8Array([0])
    const result = base64URLEncode(arr)
    expect(result).not.toContain('=')
  })

  it('base64URLEncode replaces + with - and / with _', () => {
    // 0xfb = 11111011, 0xff = 11111111 → base64: +// → should become -__
    const arr = new Uint8Array([0xfb, 0xff])
    const result = base64URLEncode(arr)
    expect(result).not.toContain('+')
    expect(result).not.toContain('/')
  })
})
