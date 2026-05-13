import type { Tool } from "npm:@anthropic-ai/sdk/resources/messages"

export interface ComplianceIssue {
  severity: "critical" | "warning" | "info"
  message: string
  rule_reference?: string
}

export interface CheckComplianceInput {
  section_key: string
  passes: boolean
  issues: ComplianceIssue[]
  summary: string
}

export const checkRegulatoryComplianceTool: Tool = {
  name: "check_regulatory_compliance",
  description: "Check a proposal section against retrieved regulatory guidelines. Return specific issues with severity levels. Call when the user asks about compliance, regulatory requirements, or whether a section meets standards.",
  input_schema: {
    type: "object" as const,
    properties: {
      section_key: { type: "string" },
      passes: { type: "boolean", description: "true if no critical issues found; false if critical issues exist" },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["critical", "warning", "info"] },
            message: { type: "string", description: "Specific issue description with rule reference where possible" },
            rule_reference: { type: "string", description: "e.g. 'ICH E6(R3) §5.1.1'" },
          },
          required: ["severity", "message"],
        },
      },
      summary: { type: "string", description: "One-sentence overall compliance summary" },
    },
    required: ["section_key", "passes", "issues", "summary"],
  },
}

export function handleCheckCompliance(
  input: CheckComplianceInput,
  retrievedChunkIds: Set<string>
) {
  // Guardrail: override passes to null if retrieval returned nothing (empty context = unreliable result)
  const hasRetrievedContext = retrievedChunkIds.size > 0
  const effectivePasses = hasRetrievedContext ? input.passes : null
  return {
    section_key: input.section_key,
    passes: effectivePasses,
    issues: input.issues,
    summary: input.summary,
    retrieval_warning: hasRetrievedContext
      ? undefined
      : "No regulatory documents retrieved — this result is based on model training data only. Manual verification required.",
  }
}
