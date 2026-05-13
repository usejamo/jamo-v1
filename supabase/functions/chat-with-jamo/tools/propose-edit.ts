import type { Tool } from "npm:@anthropic-ai/sdk/resources/messages"

export interface ProposeEditChange {
  paragraph_id: string
  operation: "replace" | "insert_after" | "delete"
  before_html?: string
  after_html?: string
  change_summary: string
}

export interface ProposeEditInput {
  section_key: string
  overall_summary: string
  changes: ProposeEditChange[]
}

export const proposeEditTool: Tool = {
  name: "propose_edit",
  description: "Return a paragraph-level diff for a proposal section. Call when the user asks to expand, rewrite, shorten, change tone, or add/remove content. Use the paragraph data-id attributes from the section HTML to reference specific paragraphs. Never invent paragraph IDs — only use IDs present in the section content.",
  input_schema: {
    type: "object" as const,
    properties: {
      section_key: { type: "string", description: "The section key being edited" },
      overall_summary: { type: "string", description: "One sentence summarizing all changes made" },
      changes: {
        type: "array",
        description: "Array of per-paragraph changes",
        items: {
          type: "object",
          properties: {
            paragraph_id: { type: "string", description: "data-id value of the target paragraph. Omit for new paragraphs (insert_after operations)." },
            operation: { type: "string", enum: ["replace", "insert_after", "delete"], description: "replace: update existing paragraph. insert_after: add new paragraph after target. delete: remove paragraph." },
            before_html: { type: "string", description: "Current HTML content (present for replace; omit for insert_after and delete)" },
            after_html: { type: "string", description: "New HTML content (present for replace and insert_after; omit for delete)" },
            change_summary: { type: "string", description: "One phrase describing this specific change" },
          },
          required: ["operation", "change_summary"],
        },
      },
    },
    required: ["section_key", "overall_summary", "changes"],
  },
}

export function handleProposeEdit(input: ProposeEditInput) {
  // Validation: for replace/delete, paragraph_id is required
  const invalidChanges = input.changes.filter(
    (c) => (c.operation === "replace" || c.operation === "delete") && !c.paragraph_id
  )
  if (invalidChanges.length > 0) {
    console.warn(`[propose_edit] ${invalidChanges.length} changes missing paragraph_id — they will be ignored client-side`)
  }
  // Handler returns the payload directly — client applies the diff
  return {
    section_key: input.section_key,
    overall_summary: input.overall_summary,
    changes: input.changes,
  }
}
