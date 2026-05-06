import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'supabase'
import { verifyState } from '../_shared/salesforce-crypto.ts'

// Fixed callback URL — must match Connected App registered redirect URI
const CALLBACK_URL = 'https://fuuvdcvbliijffogjnwg.supabase.co/functions/v1/salesforce-oauth-callback'

// No CORS headers on this function — it is a browser redirect target, never fetched programmatically (Pitfall 6)

serve(async (req) => {
  // D-04: Verify required secrets
  const consumerKey = Deno.env.get('SALESFORCE_CONSUMER_KEY')
  const consumerSecret = Deno.env.get('SALESFORCE_CONSUMER_SECRET')
  const SETTINGS_URL = Deno.env.get('SETTINGS_REDIRECT_URL') ?? 'http://localhost:5173/settings?tab=Integrations'

  if (!consumerKey || !consumerSecret) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SETTINGS_URL}&sf_error=unknown` },
    })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateToken = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  // User denied access on Salesforce side
  if (errorParam === 'access_denied') {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SETTINGS_URL}&sf_error=user_denied` },
    })
  }

  if (!code || !stateToken) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SETTINGS_URL}&sf_error=state_mismatch` },
    })
  }

  // Verify HMAC-signed state (T-12-02 mitigation)
  const stateData = await verifyState(stateToken, consumerSecret)
  if (!stateData) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SETTINGS_URL}&sf_error=state_mismatch` },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Fetch oauth_pending row — decodeURIComponent handles Salesforce URL-encoding (Pitfall 5)
  // Also verify not expired (T-12-05 mitigation)
  const { data: pending } = await supabase
    .from('oauth_pending')
    .select('code_verifier, org_id')
    .eq('state', decodeURIComponent(stateToken))
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!pending) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SETTINGS_URL}&sf_error=state_mismatch` },
    })
  }

  // Delete oauth_pending row immediately — single-use nonce (T-12-02 mitigation)
  await supabase.from('oauth_pending').delete().eq('state', decodeURIComponent(stateToken))

  // Determine base URL from org_id — we stored is_sandbox in oauth_pending indirectly;
  // derive from instance_url after token exchange (use login.salesforce.com for initial exchange)
  // The isSandbox flag is determined from is_sandbox stored or inferred from instance_url post-exchange
  // For token exchange, always use login.salesforce.com first; sandbox orgs redirect automatically
  const tokenBaseUrl = 'https://login.salesforce.com'

  // Token exchange — code_verifier sent verbatim (Pitfall 3)
  let tokenRes: Response
  try {
    tokenRes = await fetch(`${tokenBaseUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: consumerKey,
        client_secret: consumerSecret,
        redirect_uri: CALLBACK_URL,
        code_verifier: pending.code_verifier,
      }),
    })
  } catch {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SETTINGS_URL}&sf_error=token_exchange_failed` },
    })
  }

  if (!tokenRes.ok) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SETTINGS_URL}&sf_error=token_exchange_failed` },
    })
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    token_type: string
    issued_at: string
    instance_url: string
    id: string
    scope: string
  }

  // Fetch identity URL for org metadata (Pitfall 2: use instance_url for API calls)
  let identityRes: Response
  try {
    identityRes = await fetch(tokens.id, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
  } catch {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SETTINGS_URL}&sf_error=userinfo_failed` },
    })
  }

  if (!identityRes.ok) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SETTINGS_URL}&sf_error=userinfo_failed` },
    })
  }

  const identity = await identityRes.json() as {
    organization_id: string
    username: string
    display_name: string
  }

  // Determine sandbox from instance_url (test.salesforce.com = sandbox)
  const isSandbox = tokens.instance_url.includes('sandbox') ||
    tokens.instance_url.includes('test.salesforce.com') ||
    tokens.id.startsWith('https://test.salesforce.com')

  // D-08: Vault payload shape — D-09: never log token values
  const vaultPayload = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    issued_at: tokens.issued_at,
    expires_at: new Date(parseInt(tokens.issued_at) + 2 * 3600 * 1000).toISOString(),
  }

  try {
    // Store tokens in Vault via SECURITY DEFINER wrapper (T-12-03 mitigation)
    const { data: secretId, error: vaultError } = await supabase.rpc('vault_store_sf_tokens', {
      p_payload: JSON.stringify(vaultPayload),
      p_name: `sf_tokens_${stateData.orgId}`,
    })

    if (vaultError || !secretId) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${SETTINGS_URL}&sf_error=unknown` },
      })
    }

    // Upsert salesforce_connections — D-09: no token values in this table
    // Log only non-secret metadata
    console.log(`Salesforce connected: sf_org_id=${identity.organization_id}, sf_username=${identity.username}`)

    const { error: upsertError } = await supabase.from('salesforce_connections').upsert(
      {
        org_id: stateData.orgId,
        sf_org_id: identity.organization_id,
        sf_username: identity.username,
        instance_url: tokens.instance_url,
        is_sandbox: isSandbox,
        vault_secret_id: secretId,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

    if (upsertError) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${SETTINGS_URL}&sf_error=unknown` },
      })
    }

    // Success — redirect back to Settings (no sf_error)
    return new Response(null, {
      status: 302,
      headers: { Location: SETTINGS_URL },
    })
  } catch {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SETTINGS_URL}&sf_error=unknown` },
    })
  }
})
