import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "npm:@supabase/supabase-js@2"
import { proposeEditTool, handleProposeEdit } from "./tools/propose-edit.ts"
import { answerWithCitationsTool, handleAnswerWithCitations } from "./tools/answer-with-citations.ts"
import { checkRegulatoryComplianceTool, handleCheckCompliance } from "./tools/check-regulatory-compliance.ts"
import { askUserTool, handleAskUser } from "./tools/ask-user.ts"
import { setFocusTool, handleSetFocus } from "./tools/set-focus.ts"
import { buildSystemPrompt, buildHistory } from "./context.ts"
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
      target_section,
      other_sections = [],
      chat_history = [],
    } = body

    if (!user_message || !target_section) {
      return new Response(
        JSON.stringify({ error: "user_message and target_section are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // RAG retrieval runs in parallel with message assembly (AI-SPEC async-first pattern)
    // Use DEFAULT_RAG_K initially — model decides tool; K is for context richness, not routing
    const [ragContext] = await Promise.all([
      fetchRagContext(org_id, user_message, DEFAULT_RAG_K),
    ])

    const systemPrompt = ragContext.ragBlock
      ? `${buildSystemPrompt(tools)}\n\n${ragContext.ragBlock}`
      : buildSystemPrompt(tools)

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" })

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      tool_choice: { type: "auto" },
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
                    break
                  case "answer_with_citations":
                    toolResult = handleAnswerWithCitations(
                      toolInput as Parameters<typeof handleAnswerWithCitations>[0],
                      ragContext.retrievedChunkIds
                    )
                    break
                  case "check_regulatory_compliance":
                    toolResult = handleCheckCompliance(
                      toolInput as Parameters<typeof handleCheckCompliance>[0],
                      ragContext.retrievedChunkIds
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
