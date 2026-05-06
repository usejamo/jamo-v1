// Shared PKCE and state signing utilities for Salesforce OAuth
// Used by salesforce-oauth-initiate and unit tests
// No Deno-specific imports — pure Web Crypto API (works in both Deno and happy-dom/vitest)

export function base64URLEncode(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64URLEncode(new Uint8Array(digest))
}

export async function signState(orgId: string, nonce: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const payload = `${orgId}:${nonce}`
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const sigB64 = base64URLEncode(new Uint8Array(sig))
  // Encode payload as base64url (strip padding)
  const payloadB64 = btoa(payload).replace(/=/g, '')
  return `${payloadB64}.${sigB64}`
}

export async function verifyState(
  stateToken: string,
  secret: string
): Promise<{ orgId: string; nonce: string } | null> {
  const dotIndex = stateToken.indexOf('.')
  if (dotIndex === -1) return null

  const payloadB64 = stateToken.substring(0, dotIndex)
  const sigB64 = stateToken.substring(dotIndex + 1)
  if (!payloadB64 || !sigB64) return null

  // Restore base64 padding before decoding
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

  // Re-sign to verify
  const expectedToken = await signState(orgId, nonce, secret)
  if (expectedToken !== stateToken) return null

  return { orgId, nonce }
}
