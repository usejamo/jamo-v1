import type { Tool } from "npm:@anthropic-ai/sdk/resources/messages"

export interface AskUserInput {
  question: string
  context?: string
}

export const askUserTool: Tool = {
  name: "ask_user",
  description: "Ask the user a clarifying question when the request is ambiguous and a wrong assumption would produce a poor edit. Use sparingly — only when you genuinely cannot proceed without the answer.",
  input_schema: {
    type: "object" as const,
    properties: {
      question: { type: "string", description: "The clarifying question to ask the user" },
      context: { type: "string", description: "Optional brief explanation of why this information is needed" },
    },
    required: ["question"],
  },
}

export function handleAskUser(input: AskUserInput) {
  return { question: input.question, context: input.context }
}
