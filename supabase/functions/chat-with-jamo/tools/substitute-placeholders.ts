import type { Tool } from "npm:@anthropic-ai/sdk/resources/messages"

export interface SubstitutePlaceholdersTarget {
  section_key: string
  placeholder_id: string
  decision: 'substitute' | 'skip'
  skip_reason?: string
}

export interface SubstitutePlaceholdersInput {
  value: string
  targets: SubstitutePlaceholdersTarget[]
}

export const substitutePlaceholdersTool: Tool = {
  name: "substitute_placeholders",
  description: "Call when the user supplies ONE literal value to fill a NAMED placeholder across one, several, or all sections (e.g. 'replace every section's investigational product name with albacore'). This tool carries CLASSIFICATION/ROUTING ONLY — never generate any edit content or diff payload of any kind. The client performs the actual substitution deterministically. For each target, set decision:'substitute' only when the single supplied value fully satisfies the placeholder's label. If unsure a single value satisfies a multi-part placeholder label (e.g. a label asking for several distinct facts), set decision:'skip' with a short skip_reason — never substitute when uncertain.",
  input_schema: {
    type: "object" as const,
    properties: {
      value: { type: "string", description: "The single literal value to substitute into every matching single-value placeholder." },
      targets: {
        type: "array",
        description: "One entry per matching placeholder span across the relevant sections.",
        items: {
          type: "object",
          properties: {
            section_key: { type: "string", description: "The section key containing this placeholder." },
            placeholder_id: { type: "string", description: "matches data-placeholder-id" },
            decision: { type: "string", enum: ["substitute", "skip"], description: "substitute: the value fully satisfies this placeholder. skip: uncertain or multi-part label — do not substitute." },
            skip_reason: { type: "string", description: "present when decision is skip" },
          },
          required: ["section_key", "placeholder_id", "decision"],
        },
      },
    },
    required: ["value", "targets"],
  },
}

export function handleSubstitutePlaceholders(input: SubstitutePlaceholdersInput) {
  // Pure pass-through — classification/routing only, NO generated edit content
  // of any kind (D-03). The client re-validates and performs the substitution.
  return input
}
