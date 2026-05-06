import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'supabase'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  signState,
} from '../_shared/salesforce-crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fixed callback URL — must match Connected App registered redirect URI
const CALLBACK_URL = 'https://fuuvdcvbliijffogjnwg.supabase.co/functions/v1/salesforce-oauth-callback'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // D-04: Verify required secrets are configured at startup
  const consumerKey = Deno.env.get('SALESFORCE_CONSUMER_KEY')
  const consumerSecret = Deno.env.get('SALESFORCE_CONSUMER_SECRET')
  if (!consumerKey || !consumerSecret) {
    return new Response(
      JSON.stringify({
        error: 'Salesforce Connected App not configured. Set SALESFORCE_CONSUMER_KEY and SALESFORCE_CONSUMER_SECRET.',
      }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { org_id, is_sandbox } = await req.json() as { org_id: string; is_sandbox: boolean }

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: 'org_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const baseUrl = is_sandbox ? 'https://test.salesforce.com' : 'https://login.salesforce.com'

    // Generate PKCE pair
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)

    // Generate signed state (CSRF protection — D-03)
    const nonce = crypto.randomUUID()
    const state = await signState(org_id, nonce, consumerSecret)

    // 5-minute TTL for oauth_pending row
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Store pending OAuth state — code_verifier must be raw (not re-encoded) to match at token exchange
    const { error: insertError } = await supabase.from('oauth_pending').insert({
      state,
      org_id,
      code_verifier: codeVerifier,
      expires_at: expiresAt,
    })

    // WR-04: If insert fails, do not return auth_url — callback would fail with state_mismatch
    if (insertError) {
      return new Response(
        JSON.stringify({ error: 'Failed to store OAuth state. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build Salesforce authorization URL
    const authUrl = new URL(`${baseUrl}/services/oauth2/authorize`)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', consumerKey)
    authUrl.searchParams.set('redirect_uri', CALLBACK_URL)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('scope', 'api refresh_token offline_access')

    return new Response(
      JSON.stringify({ auth_url: authUrl.toString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
