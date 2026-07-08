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
  userId: string
) {
  // Persist focus whenever we have an identity to key on. chat_sessions PK is composite
  // (proposal_id, user_id) — both must be in the row AND the upsert conflict target.
  // The prior onConflict:"proposal_id" (and a payload missing user_id) always threw and
  // was silently swallowed, so current_focus_section never persisted. userId is the
  // JWT-derived identity (14.3), never the request body.
  if (proposalId && userId) {
    // Write to chat_sessions via service role (bypasses RLS — edge function has service key)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    const { error } = await supabase
      .from("chat_sessions")
      .upsert(
        {
          proposal_id: proposalId,
          user_id: userId,
          org_id: orgId,
          current_focus_section: input.section_key,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "proposal_id,user_id" }
      )
    // Non-blocking side-effect, but surface failures — the prior silent swallow hid a
    // wrong-conflict-target bug indefinitely.
    if (error) console.warn("[set_focus] chat_sessions upsert failed:", error.message)
  }
  return { section_key: input.section_key }
}
