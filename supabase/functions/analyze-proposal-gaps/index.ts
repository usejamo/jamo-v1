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
const QUEUE_CAP = 10
const TIER_CAPS = { compliance: 4, conflict: 2, gap: 4, missing: 4 } as const

// ── PendingAction Zod schema — validates Haiku output before DB write ──────────
export const PendingActionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['gap', 'conflict', 'compliance', 'missing']),
  section_key: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  cta_label: z.string().min(1),
  cta_tool: z.enum(['propose_edit', 'check_regulatory_compliance', 'answer_with_citations', 'ask_user']),
  cta_payload: z.record(z.unknown()),
})

// ── Phase 14.2.2 — Pattern 4 RESOLVED_ITEMS types + helpers ───────────────────
type ResolvedItem = {
  originating_action_id: string | null
  section_key: string
  finding_type: 'gap' | 'conflict' | 'compliance' | 'missing'
  title: string
  description: string
  user_action: 'fixed' | 'dismissed'
  applied_changes: string
  section_content_hash_at_action: string
  timestamp: string
  acceptance_summary?: { accepted: number; rejected: number; stale: number }
}

type AnnotatedResolvedItem = ResolvedItem & {
  content_status: 'content_unchanged_since_action' | 'content_changed_since_action'
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Phase 14.2.2 Pattern 4 — pure helper, EXPORTED for snapshot test (Plan 05 Task 2).
 * Returns empty string when annotatedResolved is empty (no block injected).
 *
 * Phase 14.2.3 — TERSE/DEMOTED rewrite. The previous verbose form (8 full JSON
 * entries + 5 suppression rules + 3 examples) made Haiku go GLOBALLY silent —
 * it returned [] even for untouched, placeholder-laden sections (confirmed by an
 * A/B where removing the block took a proposal 0 → 5 findings). The fix keeps
 * per-item dedup but as a compact, low-prominence appendix placed AFTER the main
 * analysis instructions, so detection dominates and memory does not suppress.
 */
export function buildResolvedBlock(
  annotatedResolved: AnnotatedResolvedItem[],
): string {
  if (annotatedResolved.length === 0) return ''
  const lines = annotatedResolved
    .map((it) => {
      const changed = it.content_status === 'content_changed_since_action'
      return `- ${it.section_key} | ${it.finding_type} | "${it.title}" | ${it.user_action}${changed ? ' | section CHANGED since' : ''}`
    })
    .join('\n')
  return `

---
ALREADY-ADDRESSED (dedup hints only — this list must NOT reduce how much you analyze):
${lines}

Rules: do NOT re-emit one of the EXACT findings above while its section is unchanged. If a listed line is marked "section CHANGED since" and the issue still remains, you may re-surface it. Analyze EVERY section on its merits and surface all OTHER and NEW issues — including different issues in the same sections that appear above. A long list here does NOT mean the proposal is finished; after prior fixes the right number of findings is usually NOT zero.`
}

/**
 * Salvage a truncated JSON array of finding objects. If Haiku hits max_tokens
 * mid-array, the output is invalid JSON (unterminated object / trailing comma)
 * and JSON.parse rejects the WHOLE payload — dropping every finding. This keeps
 * all COMPLETE objects by slicing to the last balanced `}` and closing the array.
 * Returns null when nothing is salvageable.
 */
export function salvageTruncatedFindings(stripped: string): unknown[] | null {
  const start = stripped.indexOf('[')
  const lastBrace = stripped.lastIndexOf('}')
  if (start === -1 || lastBrace === -1 || lastBrace < start) return null
  try {
    const parsed = JSON.parse(stripped.slice(start, lastBrace + 1) + ']')
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

const ANALYSIS_SYSTEM_PROMPT = `You are a CRO proposal quality analyst. You receive a JSON array of proposal section summaries and return a JSON array of quality issues.

Return ONLY a valid JSON array. No explanation, no markdown. Each item must match:
{
  "id": "<uuid>",
  "type": "gap" | "conflict" | "compliance" | "missing",
  "section_key": "<key from input>",
  "title": "<Section Name> — <short issue description>",
  "description": "<one sentence explaining the issue>",
  "priority": 1 | 2 | 3 | 4,
  "cta_label": "Fix it" | "Draft it" | "Check it" | "Provide info" | "Fill in",
  "cta_tool": "propose_edit" | "check_regulatory_compliance" | "answer_with_citations" | "ask_user",
  "cta_payload": {}
}

Ask-vs-fill routing (D-06 — deterministic, no model discretion): Emit cta_tool 'ask_user' for ALL gap and missing findings (unfilled placeholders / unstarted content — only the user has the value). Use 'propose_edit' only for conflict and compliance findings the AI can resolve from regulatory context. Use the matching label: "Provide info" for gap findings, "Fill in" for missing findings.

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

Truncation (D-1): if an excerpt ends with "[…section truncated for length…]", that marker is meta — it is NOT a quality issue. Judge the section on its visible content only; do not infer anything about the unseen tail and do not flag the marker itself.

Placeholder detection (D-2 — critical): unfilled template text that should have been replaced with real content is a finding. Recognize it by SEMANTIC FAMILY, not by an exhaustive literal list — recognize the general pattern, not only the exact strings shown below. Decision boundary: a section with substantive content that still carries some placeholders is a "gap"; a section that is predominantly placeholders/scaffolding is "missing". The families below are category representatives.

Family 1 — Bracket placeholders (e.g. [CRO Name], [CLIENT NAME], [DATE]).
INPUT: [{"key":"cover_letter","title":"Cover Letter","excerpt":"[CRO Name] is pleased to submit this proposal for the Phase III oncology program. Our team brings 18 years of late-phase experience across 40 countries and a dedicated medical monitoring group. We look forward to partnering on this study."}]
OUTPUT: [{"id":"...","type":"gap","section_key":"cover_letter","title":"Cover Letter — sponsor/CRO name placeholder unfilled","description":"The letter has substantive narrative but still opens with the bracket placeholder [CRO Name] in place of the real entity name.","priority":3,"cta_label":"Provide info","cta_tool":"ask_user","cta_payload":{"section_key":"cover_letter"}}]
Rationale: substantive prose plus an unfilled bracket placeholder, so it is a gap because the section is real content with a hole, not an empty section.

Family 2 — Descriptive-noun placeholders (e.g. CRO legal entity name, investigational product name, study drug name).
INPUT: [{"key":"study_design","title":"Study Design","excerpt":"This randomized, double-blind, placebo-controlled trial will enroll 480 participants across 60 sites. Subjects will receive the investigational product name at the protocol-defined dose, sponsored by CRO legal entity name, with the primary endpoint assessed at week 24."}]
OUTPUT: [{"id":"...","type":"gap","section_key":"study_design","title":"Study Design — descriptive-noun placeholders for product and sponsor","description":"The design is detailed but uses descriptive-noun placeholders ('investigational product name', 'CRO legal entity name') where real names belong.","priority":3,"cta_label":"Provide info","cta_tool":"ask_user","cta_payload":{"section_key":"study_design"}}]
Rationale: a detailed paragraph with descriptive-noun placeholders standing in for specific names is a gap because the surrounding content is otherwise complete.

Family 3 — Incomplete contact/address details (e.g. mailing address, Name and title of RFP contact at ..., full corporate address).
INPUT: [{"key":"contacts","title":"Key Contacts","excerpt":"Name and title of RFP contact at Vericel BioPharma, Inc. mailing address full corporate address telephone and email to follow."}]
OUTPUT: [{"id":"...","type":"missing","section_key":"contacts","title":"Key Contacts — contact block is unfilled scaffolding","description":"The contacts section is predominantly placeholder labels ('mailing address', 'full corporate address', 'Name and title of RFP contact') with no actual contact details.","priority":4,"cta_label":"Fill in","cta_tool":"ask_user","cta_payload":{"section_key":"contacts"}}]
Rationale: predominantly multi-field placeholder labels with almost no real content is missing because the section is scaffolding rather than drafted material.

Family 4 — Explicit incompleteness markers (e.g. TBD, TODO, to be determined, [insert ...]).
INPUT: [{"key":"eligibility","title":"Eligibility Criteria","excerpt":"TBD — to be determined."}]
OUTPUT: [{"id":"...","type":"missing","section_key":"eligibility","title":"Eligibility Criteria — section not started","description":"Eligibility Criteria section is an explicit incompleteness marker ('TBD'/'to be determined') and must be drafted before submission.","priority":4,"cta_label":"Fill in","cta_tool":"ask_user","cta_payload":{"section_key":"eligibility"}}]
Rationale: an explicit incompleteness marker standing in for the entire section is missing because there is no substantive content to evolve.`

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
  // Whole-proposal content hash (D-3). Advisory cache metadata — persisted alongside
  // pending_actions so the client mount gate can skip a redundant analysis when unchanged.
  content_hash: z.string().optional(),
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

  // ── Step 2b: Resolve org_id — chat_sessions has org_id NOT NULL + RLS WITH CHECK
  // requiring org_id = auth.jwt()->>'org_id'. The JWT doesn't reliably carry org_id,
  // so look it up from user_profiles before the upsert.
  const { data: profileRow, error: profileErr } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', userId)
    .single()
  if (profileErr || !profileRow?.org_id) {
    console.error('[analyze-proposal-gaps] org_id lookup failed', profileErr)
    return new Response(
      JSON.stringify({ error: 'org_id not found for user' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  const orgId = profileRow.org_id as string

  // ── Step 3: Validate request body ─────────────────────────────────────────
  let proposalId: string
  let sections: Array<{ key: string; title: string; content: string }>
  let clientRunId: string | undefined
  let contentHash: string | undefined
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
    contentHash = parsed.data.content_hash
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
    .select('last_updated, resolved_items')
    .eq('proposal_id', proposalId)
    .eq('user_id', userId)  // D-45: per-user session
    .single()

  if (session?.last_updated) {
    const ageMs = Date.now() - new Date(session.last_updated).getTime()
    if (ageMs < PROPOSAL_COOLDOWN_MS) {
      return new Response(null, { status: 429, headers: corsHeaders })
    }
  }

  // ── Phase 14.2.2 — annotate resolved_items with content_status flag (D-33) ─
  // Empty/null array is treated identically as no prior context (D-34).
  const resolvedItems: ResolvedItem[] =
    (session?.resolved_items as ResolvedItem[] | null) ?? []

  const sectionHashes: Record<string, string> = {}
  if (resolvedItems.length > 0) {
    for (const s of sections) {
      sectionHashes[s.key] = await sha256Hex(s.content)
    }
  }
  const annotatedResolved: AnnotatedResolvedItem[] = resolvedItems.map((item) => ({
    ...item,
    content_status:
      sectionHashes[item.section_key] === item.section_content_hash_at_action
        ? 'content_unchanged_since_action'
        : 'content_changed_since_action',
  }))

  // ── Step 6: LLM analysis — Haiku ONLY (AI-SPEC: never Sonnet) ────────────
  const run_id = clientRunId ?? globalThis.crypto.randomUUID()

  // Build section summaries — full content up to a 5000-char per-section ceiling
  // (D-1: stop hiding section bodies from Haiku; the 300-char slice was the root
  // cause of zero placeholder findings). Over-ceiling sections (rare) are cut at
  // 5000 chars with a clearly-meta end-marker so the model reads real content
  // first, then learns the tail is incomplete. The marker is phrased to read as
  // meta — it must NOT look like unfilled placeholder scaffolding (Decision 1 risk).
  const CONTENT_CEILING = 5000
  const TRUNCATION_MARKER = ' […section truncated for length…]'
  const summaries = sections.map((s) => {
    const cleaned = s.content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    const excerpt =
      cleaned.length > CONTENT_CEILING
        ? cleaned.slice(0, CONTENT_CEILING) + TRUNCATION_MARKER
        : cleaned
    return { key: s.key, title: s.title, excerpt }
  })

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

  let pendingActions: z.infer<typeof PendingActionSchema>[] = []
  // ── TEMP DIAGNOSTIC (14.2.3 session-3) — REVERT after. Capture the Haiku→dedup boundary
  // to diagnose the 0-findings result. ────────────────────────────────────────────────
  let dbgRaw = '(no text)'
  let dbgValidated = -1
  let dbgDeduped = -1
  let dbgPromptChars = 0
  let dbgDismissed = ''
  try {
    // Phase 14.2.2 — append RESOLVED_ITEMS block only when annotatedResolved is non-empty.
    // Phase 14.2.3 — block is now a terse, demoted dedup appendix (see buildResolvedBlock).
    const systemPromptForCall = ANALYSIS_SYSTEM_PROMPT + buildResolvedBlock(annotatedResolved)
    dbgPromptChars = systemPromptForCall.length
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',  // AI-SPEC: Haiku ONLY — NEVER Sonnet
      // 8192 (was 2048): placeholder-heavy proposals produce 10-15 findings; the
      // verbose ask_user few-shots (14.2.4) pushed typical output past 2048 tokens,
      // truncating the JSON array mid-object → JSON.parse threw → 0 findings (the
      // analyzer "went silent" symptom). 8192 gives ample headroom; salvageTruncatedFindings
      // below is the defense-in-depth backstop if a future proposal still overflows.
      max_tokens: 8192,
      temperature: 0,
      system: systemPromptForCall,
      messages: [{ role: 'user', content: JSON.stringify(summaries) }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    dbgRaw = (textBlock as { text?: string } | undefined)?.text ?? '(no text block)'
    // Haiku occasionally wraps its JSON in ```json …``` fences despite the system
    // prompt forbidding it. Strip a leading fence and any trailing fence/whitespace
    // before parsing so we don't lose the entire payload to a JSON.parse exception.
    const stripped = (textBlock?.text ?? '[]')
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()
    let raw: unknown
    try {
      raw = JSON.parse(stripped || '[]')
    } catch (parseErr) {
      // Truncation backstop: recover every complete finding from a payload that
      // Haiku cut off at max_tokens, instead of losing all of them to one throw.
      const salvaged = salvageTruncatedFindings(stripped)
      if (salvaged && salvaged.length > 0) {
        console.warn('[analyze-proposal-gaps] salvaged truncated Haiku output —', salvaged.length, 'findings recovered')
        raw = salvaged
      } else {
        console.error('[analyze-proposal-gaps] Haiku output JSON.parse failed', parseErr, 'raw:', textBlock?.text?.slice(0, 500))
        raw = []
      }
    }

    const validated = z.array(PendingActionSchema).safeParse(raw)
    if (validated.success) {
      // 14.2.3 — drop findings the user already RESOLVED (fixed OR dismissed) whose section
      // content is UNCHANGED since that resolution, BEFORE tier-capping. At temperature 0
      // Haiku deterministically re-mints the identical finding every run; without this filter
      // a just-fixed or just-dismissed finding refills the (e.g. 4-gap) cap and re-appears in
      // the queue (the user's "I fix it and it comes back" / "dismiss and nothing new appears"
      // reports). The resolved-item hash is captured AFTER the fix's edit applies (flush-then-
      // hash), so immediately post-fix content_unchanged holds ⇒ the finding is dropped and
      // stays gone; if the section later REGRESSES (content changes) the finding is allowed to
      // re-surface (D-33). Dropping fixed+dismissed identically also keeps stored pending_actions
      // == the visible set, so the mount gate and render never desync. Identity =
      // section_key|type|title (Haiku mints fresh uuids each run; id-matching is meaningless).
      const resolvedUnchanged = new Set(
        annotatedResolved
          .filter((r) => r.content_status === 'content_unchanged_since_action')
          .map((r) => `${r.section_key}|${r.finding_type}|${r.title}`)
      )
      const deduped = validated.data.filter(
        (f) => !resolvedUnchanged.has(`${f.section_key}|${f.type}|${f.title}`)
      )
      dbgValidated = validated.data.length
      dbgDeduped = deduped.length
      dbgDismissed = [...resolvedUnchanged].join(' ;; ')
      // Apply priority ordering and tier caps (D-26/D-28)
      const byPriority = (t: string) => ({ compliance: 1, conflict: 2, gap: 3, missing: 4 }[t] ?? 5)
      const sorted = deduped.sort((a, b) => byPriority(a.type) - byPriority(b.type))
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

  // ── TEMP DIAGNOSTIC insert (14.2.3 session-3) — self-swallowing; REVERT after. ──
  try {
    await supabase.from('_gap_debug').insert({
      proposal_id: proposalId,
      resolved_count: annotatedResolved.length,
      dismissed_unchanged: dbgDismissed,
      validated_count: dbgValidated,
      deduped_count: dbgDeduped,
      final_count: pendingActions.length,
      prompt_chars: dbgPromptChars,
      haiku_raw: dbgRaw.slice(0, 8000),
    })
  } catch (_dbgErr) {
    // diagnostics must never affect the function
  }

  // D-34 + D-45: Upsert with composite conflict target (proposal_id, user_id)
  // Canonical store: chat_sessions.pending_actions (NOT proposal_chats.tool_data)
  // org_id is required (NOT NULL column + RLS WITH CHECK).
  const { error: upsertErr } = await supabase
    .from('chat_sessions')
    .upsert(
      {
        proposal_id: proposalId,
        org_id: orgId,
        user_id: userId,
        pending_actions: pendingActions,
        // D-3 desync guard: written in the SAME upsert object as pending_actions so the
        // two never diverge. 14.2.3 cache-trap fix (defense in depth): NEVER cache an
        // EMPTY result. When pendingActions is empty we persist null so the next mount
        // re-runs, instead of letting "[] + matching hash" become a permanent cached
        // empty (the bug where suggestions disappeared and never came back). A genuinely
        // clean proposal therefore re-analyzes on each open (bounded by the 30s cooldown)
        // — that is intentional; do NOT "optimize" empties back into the cache.
        pending_actions_content_hash: pendingActions.length > 0 ? (contentHash ?? null) : null,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'proposal_id,user_id' }
    )
  if (upsertErr) {
    console.error('[analyze-proposal-gaps] chat_sessions upsert failed', upsertErr)
    return new Response(
      JSON.stringify({ error: 'chat_sessions upsert failed', detail: upsertErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ ok: true, run_id, action_count: pendingActions.length }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
