// supabase/functions/analyze-proposal-gaps/index.ts
// Stub — full implementation split across Plan 06 (auth+rate limit+persistence) and Plan 06b (LLM)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Stub: return empty pending_actions. Full implementation in Plan 06 + 06b.
  return new Response(
    JSON.stringify({ ok: true, pending_actions: [] }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
