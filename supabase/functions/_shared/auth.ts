// Shared JWT-auth helper — canonical "who is calling" (JWT) vs "what they may touch" (org)
// derivation used by every edge function that trusts identity from the request.
// No Deno-specific top-level imports beyond createClient (Pattern A) — keeps this module
// loadable in both the Deno edge runtime and plain test runners.
import { createClient } from 'supabase'

/**
 * Detects internal service-role callers (e.g. chat-with-jamo → retrieve-context,
 * see chat-with-jamo/rag.ts:41) by comparing the bearer token to the
 * SUPABASE_SERVICE_ROLE_KEY env secret. This is unspoofable by a client — it is
 * never sent to the browser and cannot be set via a request header from outside.
 * Missing Authorization header → false (not internal).
 */
export function isInternalServiceRoleCall(req: Request): boolean {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  return token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

/**
 * Consistent JSON error response shape used by every edge function in this repo:
 * { error: message } with the given status and CORS headers merged in.
 */
export function jsonError(
  status: number,
  message: string,
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Resolves { userId, orgId } from the verified JWT on the incoming request.
 * NEVER trusts org_id/user_id from the request body.
 *
 * Two-client derivation (Pattern B):
 *  - `userClient` (anon key + caller's Authorization header) is used ONLY to verify
 *    identity via `auth.getUser()` — this validates the JWT signature server-side.
 *  - `supabase` (service-role key) is used to look up the caller's org_id from
 *    user_profiles, keyed by the verified user.id.
 *
 * IMPORTANT: org_id is NOT present in the JWT. It always comes from the
 * user_profiles lookup keyed by user.id (see analyze-proposal-gaps/index.ts:226-228).
 * Never derive org_id from JWT claims or request body — always from this lookup.
 *
 * Throws (does not return) a Response on any failure:
 *  - missing Authorization header → 401
 *  - authError || !user (invalid/expired JWT) → 401
 *  - user_profiles has no org_id → 401 (Pitfall 5 — NEVER return a null org)
 *
 * Callers MUST wrap this in try/catch and, when the caught value is
 * `instanceof Response`, return it directly:
 *
 *   try {
 *     const { userId, orgId } = await getAuthedUserAndOrg(req, corsHeaders)
 *     ...
 *   } catch (e) {
 *     if (e instanceof Response) return e
 *     throw e
 *   }
 */
export async function getAuthedUserAndOrg(
  req: Request,
  corsHeaders: Record<string, string> = {}
): Promise<{ userId: string; orgId: string }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw jsonError(401, 'Missing Authorization header', corsHeaders)
  }

  // Identity ONLY — anon key + caller's JWT. Never used for privileged reads/writes.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()
  if (authError || !user) {
    throw jsonError(401, 'Unauthorized', corsHeaders)
  }

  // Privileged lookup — service-role client, org_id resolved by verified user.id.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  const orgId: string | null = profile?.org_id ?? null
  if (!orgId) {
    // Pitfall 5 — NEVER pass a null org into a caller's org filter. Fail closed.
    throw jsonError(401, 'No org for user', corsHeaders)
  }

  return { userId: user.id, orgId }
}
