import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "npm:@supabase/supabase-js@2"
import { z } from "npm:zod@^3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// D-32: 30s per-proposal server-side cooldown (distinct from D-30 client-side 3s debounce)
// Server-side cooldown is durable — survives page reload, unlike client-side debounce
const PROPOSAL_COOLDOWN_MS = 30_000

// ── Cap constants (D-28: tunable in one place) ────────────────────────────────
const QUEUE_CAP = 8
const TIER_CAPS = { compliance: 4, conflict: 2, gap: 2, missing: 2 } as const

// ── PendingAction Zod schema — validates Haiku output before DB write ──────────
const PendingActionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['gap', 'conflict', 'compliance', 'missing']),
  section_key: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  cta_label: z.string().min(1),
  cta_tool: z.enum(['propose_edit', 'check_regulatory_compliance', 'answer_with_citations']),
  cta_payload: z.record(z.unknown()),
})

const ANALYSIS_SYSTEM_PROMPT = `You are a CRO proposal quality analyst. You receive a JSON array of proposal section summaries and return a JSON array of quality issues.

Return ONLY a valid JSON array. No explanation, no markdown. Each item must match:
{
  "id": "<uuid>",
  "type": "gap" | "conflict" | "compliance" | "missing",
  "section_key": "<key from input>",
  "title": "<Section Name> — <short issue description>",
  "description": "<one sentence explaining the issue>",
  "priority": 1 | 2 | 3 | 4,
  "cta_label": "Fix it" | "Draft it" | "Check it",
  "cta_tool": "propose_edit" | "check_regulatory_compliance" | "answer_with_citations",
  "cta_payload": {}
}

Priority rules (D-18 — fixed, not Haiku-scored):
- compliance issues: priority 1
- conflict issues: priority 2
- gap issues: priority 3
- missing issues: priority 4

Type definitions (D-20 — distinction is mandatory):
- "gap": section exists but content is incomplete or thin
- "missing": a required section that has not been started (empty/absent)
- "conflict": cross-section inconsistency (numbers, dates, scope)
- "compliance": regulatory language concern

Title format (D-29): "[Section Name] — [description]". Section name must be visible.

Few-shot examples:
INPUT: [{"key":"eligibility","title":"Eligibility Criteria","excerpt":"TBD"}]
OUTPUT: [{"id":"...","type":"missing","section_key":"eligibility","title":"Eligibility Criteria — section not started","description":"Eligibility Criteria section has no content and must be drafted before submission.","priority":4,"cta_label":"Draft it","cta_tool":"propose_edit","cta_payload":{"section_key":"eligibility"}}]`

// ── Request schema validation ──────────────────────────────────────────────────
// user_id is NOT in the request body — derived from JWT only
const RequestSchema = z.object({
  proposal_id: z.string().uuid(),
  sections: z.array(z.object({
    key: z.string(),
    title: z.string(),
    content: z.string(),
  })).optional().default([]),
  run_id: z.string().optional(),
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
  let sections: Array<{ key: string; title: string; content: string }>
  let clientRunId: string | undefined
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
    sections = parsed.data.sections
    clientRunId = parsed.data.run_id
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

  // ── Step 6: LLM analysis — Haiku ONLY (AI-SPEC: never Sonnet) ────────────
  const run_id = clientRunId ?? globalThis.crypto.randomUUID()

  // Build truncated section summaries (AI-SPEC: 300 chars max per section)
  const summaries = sections.map((s) => ({
    key: s.key,
    title: s.title,
    excerpt: s.content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300),
  }))

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

  let pendingActions: z.infer<typeof PendingActionSchema>[] = []
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',  // AI-SPEC: Haiku ONLY — NEVER Sonnet
      max_tokens: 1024,
      temperature: 0,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(summaries) }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const raw = JSON.parse(textBlock?.text ?? '[]')

    const validated = z.array(PendingActionSchema).safeParse(raw)
    if (validated.success) {
      // Apply priority ordering and tier caps (D-26/D-28)
      const byPriority = (t: string) => ({ compliance: 1, conflict: 2, gap: 3, missing: 4 }[t] ?? 5)
      const sorted = validated.data.sort((a, b) => byPriority(a.type) - byPriority(b.type))
      const counts = { compliance: 0, conflict: 0, gap: 0, missing: 0 }
      pendingActions = sorted.filter((item) => {
        const tier = item.type as keyof typeof TIER_CAPS
        if (counts[tier] >= TIER_CAPS[tier]) return false
        counts[tier]++
        return true
      }).slice(0, QUEUE_CAP)
    } else {
      // Validation failure: return empty array, log error (D-34: safe fallback)
      console.error('[analyze-proposal-gaps] Haiku output failed Zod validation', validated.error.flatten())
      pendingActions = []
    }
  } catch (err) {
    // Surface "credit balance is too low" as 402 so the client can show a dedicated banner
    // instead of silently producing an empty queue (which would mask the real outage).
    const msg = err instanceof Error ? err.message : String(err)
    if (/credit balance is too low/i.test(msg)) {
      console.error('[analyze-proposal-gaps] insufficient credits', msg)
      return new Response(
        JSON.stringify({ error: 'insufficient_credits', detail: msg }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // LLM call failed: return empty array (not crash)
    console.error('[analyze-proposal-gaps] Haiku call failed', err)
    pendingActions = []
  }

  // D-34 + D-45: Upsert with composite conflict target (proposal_id, user_id)
  // Canonical store: chat_sessions.pending_actions (NOT proposal_chats.tool_data)
  await supabase
    .from('chat_sessions')
    .upsert(
      {
        proposal_id: proposalId,
        user_id: userId,
        pending_actions: pendingActions,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'proposal_id,user_id' }
    )

  return new Response(
    JSON.stringify({ ok: true, run_id, action_count: pendingActions.length }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
