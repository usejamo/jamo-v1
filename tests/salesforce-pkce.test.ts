// Wave 0 stubs — REQ-12.1 PKCE generation
import { describe, it } from 'vitest'

describe('PKCE generation', () => {
  it.skip('generateCodeVerifier returns a 43-character base64url string', () => {})
  it.skip('generateCodeVerifier output contains only base64url chars (A-Z a-z 0-9 - _)', () => {})
  it.skip('generateCodeChallenge produces S256 challenge: base64url(SHA-256(verifier))', () => {})
  it.skip('generateCodeChallenge challenge is different from verifier', () => {})
  it.skip('base64URLEncode strips = padding characters', () => {})
  it.skip('base64URLEncode replaces + with - and / with _', () => {})
})
