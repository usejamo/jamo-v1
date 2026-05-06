// REQ-12.1 state HMAC sign/verify unit tests
import { describe, it, expect } from 'vitest'
import {
  signState,
  verifyState,
} from '../supabase/functions/_shared/salesforce-crypto.ts'

describe('state HMAC sign/verify', () => {
  const TEST_SECRET = 'test-secret-key-for-unit-tests'
  const ORG_ID = 'org-uuid-1234'
  const NONCE = 'nonce-abcd-5678'

  it('signState returns a string containing exactly one dot separator', async () => {
    const token = await signState(ORG_ID, NONCE, TEST_SECRET)
    const dots = (token.match(/\./g) || []).length
    expect(dots).toBe(1)
  })

  it('signState encodes org_id and nonce in the payload section', async () => {
    const token = await signState(ORG_ID, NONCE, TEST_SECRET)
    const [payloadB64] = token.split('.')
    // Restore padding and decode
    const padded = payloadB64 + '=='.slice(0, (4 - (payloadB64.length % 4)) % 4)
    const payload = atob(padded)
    expect(payload).toBe(`${ORG_ID}:${NONCE}`)
  })

  it('verifyState returns orgId and nonce when signature is valid', async () => {
    const token = await signState(ORG_ID, NONCE, TEST_SECRET)
    const result = await verifyState(token, TEST_SECRET)
    expect(result).not.toBeNull()
    expect(result!.orgId).toBe(ORG_ID)
    expect(result!.nonce).toBe(NONCE)
  })

  it('verifyState returns null when signature has been tampered', async () => {
    const token = await signState(ORG_ID, NONCE, TEST_SECRET)
    const [payload, sig] = token.split('.')
    // Flip last character of signature
    const tamperedSig = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')
    const tamperedToken = `${payload}.${tamperedSig}`
    const result = await verifyState(tamperedToken, TEST_SECRET)
    expect(result).toBeNull()
  })

  it('verifyState returns null when state token has wrong format (no dot)', async () => {
    const result = await verifyState('nodotinhere', TEST_SECRET)
    expect(result).toBeNull()
  })

  it('signState + verifyState round-trip returns original orgId and nonce', async () => {
    const token = await signState(ORG_ID, NONCE, TEST_SECRET)
    const result = await verifyState(token, TEST_SECRET)
    expect(result).not.toBeNull()
    expect(result!.orgId).toBe(ORG_ID)
    expect(result!.nonce).toBe(NONCE)
  })
})
