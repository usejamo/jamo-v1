// supabase/functions/admin-create-org/index.ts
// super_admin-only, cross-org: creates an organization with a unique
// auto-generated slug (req 3). Service-role edge function — asserts
// super_admin from the VERIFIED JWT (D-08/D-10/T-15-12), never from the panel
// or the request body.
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Duplicated from src/lib/slug.ts (unit-tested there) — the Deno edge runtime
// cannot resolve src/lib/ imports at deploy time. Keep in sync manually.
function baseSlug(name: string): string {
  const collapsed = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return collapsed.slice(0, 60).replace(/-+$/g, '')
}

const VALID_PLANS = ['trial', 'paid']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    let userId: string
    try {
      ({ userId } = await getAuthedUserAndOrg(req, corsHeaders))
    } catch (e) {
      if (e instanceof Response) return e
      throw e
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // T-15-12/D-08: super_admin asserted from the verified JWT's user_profiles
    // row, never implied by merely reaching this endpoint.
    const { data: callerProfile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('user_id', userId)
      .single()
    if (callerProfile?.role !== 'super_admin') {
      return jsonError(403, 'super_admin required', corsHeaders)
    }

    const { name, plan } = (await req.json()) as { name?: string; plan?: string }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return jsonError(400, 'name is required', corsHeaders)
    }
    if (!plan || !VALID_PLANS.includes(plan)) {
      return jsonError(400, "plan must be one of: 'trial', 'paid'", corsHeaders)
    }

    const base = baseSlug(name)
    if (!base) {
      return jsonError(400, 'name must contain at least one alphanumeric character', corsHeaders)
    }

    // T-15-15: the DB UNIQUE constraint on organizations.slug is the source of
    // truth — insert, catch Postgres 23505 (unique violation), retry with a
    // numbered suffix. Deliberately NOT a pre-check-then-insert (race window).
    // T-15-16: bounded to 6 attempts, then a clear 409 (no unbounded loop).
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
      const { data: org, error } = await admin
        .from('organizations')
        .insert({ name, slug: candidate, plan })
        .select()
        .single()
      if (!error) {
        return new Response(JSON.stringify({ org }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (error.code !== '23505') {
        return jsonError(500, error.message, corsHeaders)
      }
      // else: unique violation on this candidate — loop and retry the next suffix.
    }

    return jsonError(
      409,
      'This organization name is already taken. Try a slightly different name.',
      corsHeaders
    )
  } catch (_error) {
    return jsonError(500, 'Internal server error', corsHeaders)
  }
})
