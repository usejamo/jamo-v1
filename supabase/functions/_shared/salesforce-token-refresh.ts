// D-06: Shared token refresh utility for Phase 12.1+ Edge Functions
// Import this directly — it is NOT a standalone Edge Function

// SupabaseClient type import — resolves via the deno.json import map in the calling function
import type { SupabaseClient } from 'supabase'

interface VaultPayload {
  access_token: string
  refresh_token: string
  token_type: string
  issued_at: string
  expires_at: string
}

/**
 * Returns a valid access_token and instance_url for the given org.
 * Automatically refreshes the token if it expires within 60 seconds.
 * Returns null on any error — callers must handle gracefully (D-16).
 */
export async function getValidSalesforceTokens(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ access_token: string; instance_url: string } | null> {
  try {
    // Fetch connection metadata
    const { data: conn } = await supabase
      .from('salesforce_connections')
      .select('vault_secret_id, instance_url')
      .eq('org_id', orgId)
      .single()

    if (!conn) return null

    // Retrieve tokens from Vault
    const { data: rawTokens } = await supabase.rpc('vault_get_sf_tokens', {
      p_secret_id: conn.vault_secret_id,
    })

    if (!rawTokens) return null

    const tokens = rawTokens as VaultPayload

    // Check if token expires within 60 seconds (refresh buffer)
    const isExpiringSoon = new Date(tokens.expires_at) < new Date(Date.now() + 60_000)

    if (!isExpiringSoon) {
      return { access_token: tokens.access_token, instance_url: conn.instance_url }
    }

    // Refresh token — always use login.salesforce.com for refresh (Pitfall 2)
    const consumerKey = Deno.env.get('SALESFORCE_CONSUMER_KEY')
    const consumerSecret = Deno.env.get('SALESFORCE_CONSUMER_SECRET')
    if (!consumerKey || !consumerSecret) return null

    const res = await fetch('https://login.salesforce.com/services/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: consumerKey,
        client_secret: consumerSecret,
        refresh_token: tokens.refresh_token,
      }),
    })

    if (!res.ok) return null

    const refreshed = await res.json() as { access_token: string; issued_at: string }

    // Update Vault with new payload — preserve refresh_token (not rotated unless Connected App configured for rotation)
    const newPayload: VaultPayload = {
      ...tokens,
      access_token: refreshed.access_token,
      issued_at: refreshed.issued_at,
      expires_at: new Date(parseInt(refreshed.issued_at) + 2 * 3600 * 1000).toISOString(),
    }

    await supabase.rpc('vault_update_sf_tokens', {
      p_secret_id: conn.vault_secret_id,
      p_payload: JSON.stringify(newPayload),
    })

    return { access_token: refreshed.access_token, instance_url: conn.instance_url }
  } catch {
    // D-16: Graceful degradation — SF failure must never block callers
    return null
  }
}
