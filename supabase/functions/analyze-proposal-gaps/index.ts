import { createClient } from "npm:@supabase/supabase-js@2"
import { z } from "npm:zod@^3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// D-32: 30s per-proposal server-side cooldown (distinct from D-30 client-side 3s debounce)
// Server-side cooldown is durable — survives page reload, unlike client-side debounce
const PROPOSAL_COOLDOWN_MS = 30_000

// ── Request schema validation ──────────────────────────────────────────────────
// user_id is NOT in the request body — derived from JWT only
const RequestSchema = z.object({
  proposal_id: z.string().uuid(),
  // user_id intentionally absent — always derived from JWT via supabase.auth.getUser()
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // ── Step 1: Create user-scoped client using the request's JWT ──────────────
  // CRITICAL: Use anon key + user JWT (not service role key) for data reads.
  // Service role bypasses RLS — must never be used to read user data.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Missing Authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  // ── Step 2: Derive userId from JWT — NEVER from request body ──────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  const userId = user.id  // Canonical identity — JWT-derived, not client-supplied

  // ── Step 3: Validate request body ─────────────────────────────────────────
  let proposalId: string
  try {
    const body = await req.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    proposalId = parsed.data.proposal_id
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Step 4: Verify proposal ownership via user-scoped client ──────────────
  // RLS on proposals ensures this query returns nothing if user doesn't own it
  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select('id')
    .eq('id', proposalId)
    .single()

  if (proposalError || !proposal) {
    return new Response(
      JSON.stringify({ error: 'Proposal not found or access denied' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Step 5: Server-side rate limit — 30s per-proposal cooldown (D-32) ─────
  // This is durable (survives page reload). Client-side debounce (D-30) is a UX optimization only.
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('last_updated')
    .eq('proposal_id', proposalId)
    .eq('user_id', userId)  // D-45: per-user session
    .single()

  if (session?.last_updated) {
    const ageMs = Date.now() - new Date(session.last_updated).getTime()
    if (ageMs < PROPOSAL_COOLDOWN_MS) {
      return new Response(null, { status: 429, headers: corsHeaders })
    }
  }

  // ── Step 6: Persistence stub — write empty pending_actions ────────────────
  // LLM analysis (Plan 06b) will replace this with real results.
  // Upsert uses composite conflict target (proposal_id, user_id) per D-45.
  const run_id = globalThis.crypto.randomUUID()

  await supabase
    .from('chat_sessions')
    .upsert(
      {
        proposal_id: proposalId,
        user_id: userId,
        pending_actions: [],  // Plan 06b fills this with Haiku results
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'proposal_id,user_id' }  // D-45: composite PK
    )

  return new Response(
    JSON.stringify({ ok: true, run_id, action_count: 0, stub: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
