import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "npm:@supabase/supabase-js@2"
import { proposeEditTool, handleProposeEdit } from "./tools/propose-edit.ts"
import { answerWithCitationsTool, handleAnswerWithCitations } from "./tools/answer-with-citations.ts"
import { checkRegulatoryComplianceTool, handleCheckCompliance } from "./tools/check-regulatory-compliance.ts"
import { askUserTool, handleAskUser } from "./tools/ask-user.ts"
import { setFocusTool, handleSetFocus } from "./tools/set-focus.ts"
import { buildSystemPrompt, buildHistory, buildActiveTaskContext } from "./context.ts"
import { fetchRagContext, RAG_K, DEFAULT_RAG_K } from "./rag.ts"

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
      org_id,
      user_message,
      session_id,
      user_id,
      target_section,
      other_sections = [],
      chat_history = [],
      forced_tool,
    } = body

    if (!user_message || !target_section) {
      return new Response(
        JSON.stringify({ error: "user_message and target_section are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ── Read active_task from chat_sessions — D-45: include user_id filter ──
    // active_task is a DIRECT column on chat_sessions (NOT metadata->active_task)
    let effectiveActiveTask: Record<string, unknown> | null = null
    if (proposal_id && user_id) {
      const { data: sessionData } = await createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!
      )
        .from('chat_sessions')
        .select('pending_actions, active_task, last_updated')  // active_task is a direct column, NOT metadata->active_task
        .eq('proposal_id', proposal_id)
        .eq('user_id', user_id)  // D-45: per-user session — required
        .single()

      const activeTask = (sessionData?.active_task as Record<string, unknown> | null) ?? null

      // Auto-expire stale active_task (>7 days)
      effectiveActiveTask = activeTask
      if (activeTask?.last_updated) {
        const ageDays = (Date.now() - new Date(activeTask.last_updated as string).getTime()) / (1000 * 60 * 60 * 24)
        if (ageDays > 7) {
          effectiveActiveTask = null
          void createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!
          )
            .from('chat_sessions')
            .update({ active_task: null })
            .eq('proposal_id', proposal_id)
            .eq('user_id', user_id)  // D-45
        }
      }
    }

    // RAG retrieval runs in parallel with message assembly (AI-SPEC async-first pattern)
    // Use DEFAULT_RAG_K initially — model decides tool; K is for context richness, not routing
    const [ragContext] = await Promise.all([
      fetchRagContext(org_id, user_message, DEFAULT_RAG_K),
    ])

    const activeTaskBlock = buildActiveTaskContext(effectiveActiveTask)
    const baseSystemPrompt = buildSystemPrompt(tools, target_section, other_sections)
    const systemPrompt = [
      baseSystemPrompt,
      activeTaskBlock,
      ragContext.ragBlock,
    ].filter(Boolean).join("\n\n")

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" })

    // Create user-scoped supabase client for session writes (needs auth header if available)
    const authHeader = req.headers.get("Authorization")
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    )

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
                    if (effectiveActiveTask && effectiveActiveTask.stage === 'gathering_inputs' && proposal_id && user_id) {
                      void supabase.from('chat_sessions')
                        .update({
                          active_task: { ...effectiveActiveTask, stage: 'drafting', last_updated: new Date().toISOString() },
                        })
                        .eq('proposal_id', proposal_id)
                        .eq('user_id', user_id)  // D-45
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
                      org_id
                    )
                    break
                  case "ask_user":
                    toolResult = handleAskUser(toolInput as Parameters<typeof handleAskUser>[0])
                    break
                  case "set_focus":
                    toolResult = await handleSetFocus(
                      toolInput as Parameters<typeof handleSetFocus>[0],
                      proposal_id,
                      org_id,
                      session_id
                    )
                    // Write active_task on set_focus dispatch (fire-and-forget)
                    if (proposal_id && user_id) {
                      const newTask = {
                        type: 'walkthrough',
                        status: 'active',
                        section_key: toolInput.section_key,
                        section_title: toolInput.section_key,  // Plan 07 will resolve title from proposal sections
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
                        .eq('user_id', user_id)  // D-45
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
