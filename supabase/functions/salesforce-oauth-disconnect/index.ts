import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // D-04: Verify required secrets
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
    const { org_id: body_org_id } = await req.json() as { org_id?: string }

    // REQ-2/D-01/T-14.3-14: the connections lookup + Vault revoke must operate on
    // the JWT-derived org, never the request body. The body org_id (if present) is
    // only used to detect a tamper attempt — a mismatch is rejected with 403 so a
    // caller cannot disconnect another tenant's Salesforce connection.
    let orgId: string
    try {
      ({ orgId } = await getAuthedUserAndOrg(req, corsHeaders))
    } catch (e) {
      if (e instanceof Response) return e
      throw e
    }
    if (body_org_id && body_org_id !== orgId) {
      return jsonError(403, 'org mismatch', corsHeaders)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Read connection metadata
    const { data: conn } = await supabase
      .from('salesforce_connections')
      .select('vault_secret_id, instance_url')
      .eq('org_id', orgId)
      .single()

    // Idempotent — if no connection exists, return success
    if (!conn) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Retrieve tokens from Vault — D-09: tokens come from Vault, never from client
    const { data: rawTokens } = await supabase.rpc('vault_get_sf_tokens', {
      p_secret_id: conn.vault_secret_id,
    })

    const tokens = rawTokens as { refresh_token: string; access_token: string } | null

    if (tokens?.refresh_token) {
      // T-12-06: Revoke Salesforce token BEFORE deleting Vault entry
      try {
        const revokeRes = await fetch(`${conn.instance_url}/services/oauth2/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tokens.refresh_token }),
        })
        if (!revokeRes.ok) {
          // Best-effort revoke — log warning but continue with local cleanup
          console.warn(`Salesforce token revoke returned ${revokeRes.status} — continuing with local cleanup`)
        }
      } catch (revokeErr) {
        // Network error during revoke — log and continue
        console.warn('Salesforce token revoke failed:', revokeErr)
      }
    }

    // Delete Vault entry
    await supabase.rpc('vault_delete_sf_tokens', { p_secret_id: conn.vault_secret_id })

    // Delete salesforce_connections row
    await supabase.from('salesforce_connections').delete().eq('org_id', orgId)

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
