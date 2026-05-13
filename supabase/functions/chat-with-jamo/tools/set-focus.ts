import type { Tool } from "npm:@anthropic-ai/sdk/resources/messages"
import { createClient } from "npm:@supabase/supabase-js@2"

export interface SetFocusInput {
  section_key: string
}

export const setFocusTool: Tool = {
  name: "set_focus",
  description: "Switch the active working section when the user asks to work on a different section. Call this before propose_edit when the target section differs from the current focus.",
  input_schema: {
    type: "object" as const,
    properties: {
      section_key: { type: "string", description: "The section key to focus on" },
    },
    required: ["section_key"],
  },
}

export async function handleSetFocus(
  input: SetFocusInput,
  proposalId: string,
  orgId: string,
  sessionId?: string
) {
  if (sessionId) {
    // Write to chat_sessions via service role (bypasses RLS — edge function has service key)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    await supabase
      .from("chat_sessions")
      .upsert(
        {
          proposal_id: proposalId,
          org_id: orgId,
          current_focus_section: input.section_key,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "proposal_id" }
      )
      .select()
      // Silent fail — set_focus side-effect is non-blocking
  }
  return { section_key: input.section_key }
}
