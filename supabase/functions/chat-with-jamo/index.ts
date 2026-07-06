import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "npm:@supabase/supabase-js@2"
import { getAuthedUserAndOrg } from "../_shared/auth.ts"
import { proposeEditTool, handleProposeEdit } from "./tools/propose-edit.ts"
import { answerWithCitationsTool, handleAnswerWithCitations } from "./tools/answer-with-citations.ts"
import { checkRegulatoryComplianceTool, handleCheckCompliance } from "./tools/check-regulatory-compliance.ts"
import { askUserTool, handleAskUser } from "./tools/ask-user.ts"
import { setFocusTool, handleSetFocus } from "./tools/set-focus.ts"
import { buildSystemPrompt, buildHistory, buildActiveTaskContext } from "./context.ts"
import { fetchRagContext, RAG_K, DEFAULT_RAG_K } from "./rag.ts"

// ── Pure helpers (mirrored from src/chat/activeTaskBuilder.ts — Deno cannot import src/) ──

interface SectionRef { key: string; title: string }
interface OriginatingActionSnapshot {
  id: string
  section_key: string
  finding_type: string
  title: string
  description: string
}

/**
 * Resolve the real display title for a section key (D-10).
 * Order: target_section match → other_sections match → fallback to section_key.
 */
function resolveSectionTitle(
  sectionKey: string,
  targetSection: SectionRef | null | undefined,
  otherSections: SectionRef[]
): string {
  if (targetSection?.key === sectionKey) return targetSection.title
  const match = otherSections.find((s) => s.key === sectionKey)
  if (match) return match.title
  return sectionKey
}

/**
 * Build the 12-field ActiveTask for the needs-value ask_user dispatch (D-01 cond 1).
 * Shape is structurally identical to set_focus's write plus two attribution fields.
 * D-10: section_title MUST be the real resolved title, never section_key.
 */
function buildNeedsValueActiveTask(args: {
  section_key: string
  section_title: string
  action_id?: string
  snapshot?: OriginatingActionSnapshot
}) {
  const now = new Date().toISOString()
  return {
    type: 'walkthrough' as const,
    status: 'active' as const,
    section_key: args.section_key,
    section_title: args.section_title,
    stage: 'gathering_inputs' as const,
    collected_inputs: {},
    pending_paragraph_ids: [] as string[],
    accepted_paragraph_ids: [] as string[],
    content_hash: '',
    started_at: now,
    last_updated: now,
    source_action_item_id: args.action_id,
    originating_snapshot: args.snapshot,
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const tools = [
  proposeEditTool,
  answerWithCitationsTool,
  checkRegulatoryComplianceTool,
  askUserTool,
  setFocusTool,
]

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const {
      proposal_id,
      user_message,
      session_id,
      target_section,
      other_sections = [],
      chat_history = [],
      forced_tool,
      cta_payload,
      // NOTE: body may still send legacy user_id/org_id fields (D-04 backward
      // compat) but they are intentionally NOT destructured here — identity is
      // ALWAYS derived from the JWT below, never trusted from the request body.
    } = body

    if (!user_message || !target_section) {
      return new Response(
        JSON.stringify({ error: "user_message and target_section are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ── JWT-derived identity (REQ-1) — HOISTED before the first chat_sessions
    // read. Closes the cross-tenant impersonation vector: body-supplied
    // user_id/org_id are never used to scope any read/write/RAG call below.
    let userId: string, orgId: string
    try {
      ({ userId, orgId } = await getAuthedUserAndOrg(req, corsHeaders))
    } catch (e) {
      if (e instanceof Response) return e
      throw e
    }

    // User-scoped supabase client (anon key + caller's JWT) — used for every
    // chat_sessions read/write below. Replaces the prior headerless anon client
    // (T-14.3-07) so RLS is enforced under the caller's own identity.
    const authHeader = req.headers.get("Authorization")!
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // ── Read active_task from chat_sessions — D-45: include user_id filter ──
    // active_task is a DIRECT column on chat_sessions (NOT metadata->active_task)
    let effectiveActiveTask: Record<string, unknown> | null = null
    if (proposal_id && userId) {
      const { data: sessionData } = await supabase
        .from('chat_sessions')
        .select('pending_actions, active_task, last_updated')  // active_task is a direct column, NOT metadata->active_task
        .eq('proposal_id', proposal_id)
        .eq('user_id', userId)  // D-45: per-user session — required; JWT-derived
        .single()

      const activeTask = (sessionData?.active_task as Record<string, unknown> | null) ?? null

      // Auto-expire stale active_task (>7 days)
      effectiveActiveTask = activeTask
      if (activeTask?.last_updated) {
        const ageDays = (Date.now() - new Date(activeTask.last_updated as string).getTime()) / (1000 * 60 * 60 * 24)
        if (ageDays > 7) {
          effectiveActiveTask = null
          void supabase
            .from('chat_sessions')
            .update({ active_task: null })
            .eq('proposal_id', proposal_id)
            .eq('user_id', userId)  // D-45
        }
      }
    }

    // RAG retrieval runs in parallel with message assembly (AI-SPEC async-first pattern)
    // Use DEFAULT_RAG_K initially — model decides tool; K is for context richness, not routing
    const [ragContext] = await Promise.all([
      fetchRagContext(orgId, user_message, DEFAULT_RAG_K),
    ])

    const activeTaskBlock = buildActiveTaskContext(effectiveActiveTask)
    const baseSystemPrompt = buildSystemPrompt(tools, target_section, other_sections)
    const systemPrompt = [
      baseSystemPrompt,
      activeTaskBlock,
      ragContext.ragBlock,
    ].filter(Boolean).join("\n\n")

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" })

    // (User-scoped `supabase` client for session reads/writes was built above,
    // immediately after JWT identity derivation — reused here for all writes.)

    // If the client supplies forced_tool and it matches a registered tool, force Sonnet's
    // hand. This is how ActionQueue CTAs work — the user clicked "Fix it" / "Draft it" /
    // "Check it", so the intent is unambiguous and we don't want Sonnet to substitute
    // set_focus or anything else.
    const forcedToolValid = typeof forced_tool === "string" && tools.some((t) => t.name === forced_tool)
    const toolChoice = forcedToolValid
      ? { type: "tool" as const, name: forced_tool as string }
      : { type: "auto" as const }

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      tool_choice: toolChoice,
      messages: buildHistory(chat_history, user_message),
    })

    const encoder = new TextEncoder()

    function sendSSE(controller: ReadableStreamDefaultController, data: unknown) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
    }

    const readable = new ReadableStream({
      async start(controller) {
        let currentToolName: string | null = null
        let jsonBuffer = ""

        try {
          for await (const event of stream) {
            if (event.type === "content_block_start") {
              if (event.content_block.type === "tool_use") {
                currentToolName = event.content_block.name
                jsonBuffer = ""
                // Forward tool name immediately so client can show status label (D-04)
                sendSSE(controller, { type: "tool_start", tool: currentToolName })
              }
            }

            // Truncation guard: if the model hit the output-token ceiling mid-response,
            // the tool JSON is incomplete and would otherwise be dropped silently (the
            // blank-bubble failure). Surface a user-visible error instead of a 200 with
            // no result. A clean multi-tool turn ends with stop_reason "tool_use", not this.
            if (event.type === "message_delta" && event.delta.stop_reason === "max_tokens") {
              console.error("[chat-with-jamo] Response truncated — stop_reason=max_tokens")
              sendSSE(controller, {
                type: "error",
                message: "That request was too large to finish in one response. Try narrowing it — for example, editing one section at a time.",
              })
            }

            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                // Plain text response (no tool call) — forward as simplified event
                sendSSE(controller, { type: "text_delta", text: event.delta.text })
              } else if (event.delta.type === "input_json_delta") {
                // Accumulate JSON — NEVER forward partial JSON
                jsonBuffer += event.delta.partial_json
              }
            }

            if (event.type === "content_block_stop" && currentToolName !== null) {
              // Safe to parse — full JSON accumulated
              let toolInput: Record<string, unknown>
              try {
                toolInput = JSON.parse(jsonBuffer)
              } catch {
                console.error(`[chat-with-jamo] Failed to parse tool input for ${currentToolName}`)
                // Don't drop silently — tell the client the action couldn't be applied.
                sendSSE(controller, {
                  type: "error",
                  message: `The ${currentToolName} response was cut off or malformed and couldn't be applied. Try a smaller request.`,
                })
                currentToolName = null
                jsonBuffer = ""
                continue
              }

              // Dispatch to tool handler
              let toolResult: unknown
              try {
                switch (currentToolName) {
                  case "propose_edit":
                    toolResult = handleProposeEdit(toolInput as Parameters<typeof handleProposeEdit>[0])
                    // Update active_task stage to 'drafting' during walkthrough (fire-and-forget)
                    if (effectiveActiveTask && effectiveActiveTask.stage === 'gathering_inputs' && proposal_id && userId) {
                      void supabase.from('chat_sessions')
                        .update({
                          active_task: { ...effectiveActiveTask, stage: 'drafting', last_updated: new Date().toISOString() },
                        })
                        .eq('proposal_id', proposal_id)
                        .eq('user_id', userId)  // D-45
                    }
                    break
                  case "answer_with_citations":
                    toolResult = handleAnswerWithCitations(
                      toolInput as Parameters<typeof handleAnswerWithCitations>[0],
                      ragContext.retrievedChunkIds
                    )
                    break
                  case "check_regulatory_compliance":
                    toolResult = await handleCheckCompliance(
                      toolInput as Parameters<typeof handleCheckCompliance>[0],
                      ragContext.retrievedChunkIds,
                      proposal_id,
                      orgId
                    )
                    break
                  case "ask_user":
                    toolResult = handleAskUser(toolInput as Parameters<typeof handleAskUser>[0])
                    // Needs-value path: mirror set_focus active_task write (D-01) + embed snapshot (Risk B)
                    // Guard: presence of cta_payload.originating_snapshot IS the needs-value flag (no separate boolean)
                    if (proposal_id && userId && cta_payload?.originating_snapshot) {
                      const snapshot = cta_payload.originating_snapshot as OriginatingActionSnapshot
                      // D-10: resolve real title from request body sections, never use section_key raw
                      const resolvedTitle = resolveSectionTitle(
                        toolInput.section_key as string,
                        target_section as SectionRef | null,
                        other_sections as SectionRef[]
                      )
                      const newTask = buildNeedsValueActiveTask({
                        section_key: toolInput.section_key as string,
                        section_title: resolvedTitle,
                        action_id: snapshot.id,
                        snapshot,
                      })
                      // AWAIT — load-bearing resume state (D-01 condition 3, NOT void)
                      await supabase.from('chat_sessions')
                        .update({ active_task: newTask as unknown as Record<string, unknown> })
                        .eq('proposal_id', proposal_id)
                        .eq('user_id', userId)  // D-45: both filters required
                    }
                    break
                  case "set_focus":
                    toolResult = await handleSetFocus(
                      toolInput as Parameters<typeof handleSetFocus>[0],
                      proposal_id,
                      orgId,
                      session_id
                    )
                    // Write active_task on set_focus dispatch (fire-and-forget)
                    if (proposal_id && userId) {
                      const newTask = {
                        type: 'walkthrough',
                        status: 'active',
                        section_key: toolInput.section_key,
                        section_title: resolveSectionTitle(  // D-10: real title (was: toolInput.section_key)
                          toolInput.section_key as string,
                          target_section as SectionRef | null,
                          other_sections as SectionRef[]
                        ),
                        stage: 'gathering_inputs',
                        collected_inputs: {},
                        pending_paragraph_ids: [],
                        accepted_paragraph_ids: [],
                        content_hash: '',
                        started_at: new Date().toISOString(),
                        last_updated: new Date().toISOString(),
                      }
                      void supabase.from('chat_sessions')
                        .update({ active_task: newTask })  // direct column, not metadata
                        .eq('proposal_id', proposal_id)
                        .eq('user_id', userId)  // D-45
                    }
                    break
                  default:
                    toolResult = toolInput
                }
              } catch (err) {
                console.error(`[chat-with-jamo] Tool handler error for ${currentToolName}:`, err)
                toolResult = { error: "Tool execution failed" }
              }

              sendSSE(controller, { type: "tool_result", tool: currentToolName, result: toolResult })

              // Reset for next potential tool block (multi-tool turn support)
              currentToolName = null
              jsonBuffer = ""
            }
          }
        } catch (err) {
          console.error("[chat-with-jamo] Stream error:", err)
          sendSSE(controller, { type: "error", message: "Stream interrupted" })
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
