// Wave 0 stubs — REQ-12.1 state HMAC sign/verify
import { describe, it } from 'vitest'

describe('state HMAC sign/verify', () => {
  it.skip('signState returns a string containing exactly one dot separator', () => {})
  it.skip('signState encodes org_id and nonce in the payload section', () => {})
  it.skip('verifyState returns orgId and nonce when signature is valid', () => {})
  it.skip('verifyState returns null when signature has been tampered', () => {})
  it.skip('verifyState returns null when state token has wrong format (no dot)', () => {})
  it.skip('signState + verifyState round-trip returns original orgId and nonce', () => {})
})
