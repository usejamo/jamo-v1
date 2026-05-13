// src/types/chat.ts

export interface Citation {
  source: string        // document name
  passage: string       // short quoted text
  chunkId: string       // chunk/section identifier
}

export interface GapResult {
  sectionKey: string
  sectionTitle: string
  reason: 'placeholder' | 'thin' | 'error'
  detail: string
}

// ── Tool name union ────────────────────────────────────────────────────────────

export type ToolName =
  | 'propose_edit'
  | 'answer_with_citations'
  | 'check_regulatory_compliance'
  | 'ask_user'
  | 'set_focus'

// ── Tool status labels — present-progressive, implied first-person (D-05) ─────
// Add a new entry here whenever a new tool is added to ToolName.
export const TOOL_STATUS_LABELS: Record<ToolName, string> = {
  propose_edit: 'Drafting your edit...',
  answer_with_citations: 'Finding sources...',
  check_regulatory_compliance: 'Checking compliance...',
  ask_user: 'Working...',
  set_focus: 'Working...',
}

// ── Message types ──────────────────────────────────────────────────────────────

export type ChatMessageType =
  | 'chat'
  | 'gap'
  | 'tool-propose-edit'
  | 'tool-answer-cited'
  | 'tool-compliance'
  | 'tool-ask-user'
  | 'tool-set-focus'

// ── Tool payload interfaces (stored in tool_data.payload) ─────────────────────

export interface ProposeEditChange {
  paragraph_id: string             // existing node ID from TipTap doc; omit for new paragraphs
  operation: 'replace' | 'insert_after' | 'delete'
  before_html?: string             // present for replace; absent for insert_after/delete
  after_html?: string              // present for replace/insert_after; absent for delete
  change_summary: string
}

export interface ProposeEditPayload {
  section_key: string
  overall_summary: string
  changes: ProposeEditChange[]
}

export interface AnswerWithCitationsPayload {
  answer: string
  citations: Citation[]
}

export interface ComplianceIssue {
  severity: 'critical' | 'warning' | 'info'
  message: string
  rule_reference?: string
}

export interface CompliancePayload {
  section_key: string
  passes: boolean | null           // null = inconclusive (empty retrieval — see guardrail)
  issues: ComplianceIssue[]
  summary: string
  retrieval_warning?: string       // populated when passes overridden to null
}

export interface AskUserPayload {
  question: string
  context?: string
}

export interface SetFocusPayload {
  section_key: string
}

// ── Tool data envelope (D-07) — version field is non-negotiable ───────────────

export type ToolPayload =
  | ProposeEditPayload
  | AnswerWithCitationsPayload
  | CompliancePayload
  | AskUserPayload
  | SetFocusPayload

export interface ToolDataEnvelope {
  tool: ToolName
  version: 1                       // increment when tool schema changes; loader must handle all versions
  payload: ToolPayload
  state: Record<string, unknown>   // mutable: per-paragraph accept/reject, dismissed issues, answered prompts
}

// ── Per-paragraph accept/reject state (within ToolDataEnvelope.state) ─────────

export interface ProposeEditState {
  resolutions: Record<string, 'accepted' | 'rejected' | 'pending'>
  stale_ids: string[]
}

// ── Chat message ───────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string                  // human-readable summary / plain text
  isThinking?: boolean
  citations?: Citation[]           // populated for tool-answer-cited
  toolData?: ToolDataEnvelope      // populated for all tool-* message types
  messageType?: ChatMessageType
}

// ── Request payload to chat-with-jamo edge function ───────────────────────────

export interface ChatWithJamoRequest {
  proposal_id: string
  org_id: string
  user_message: string
  session_id?: string              // chat_sessions.id — created by client on first message
  target_section: {
    key: string
    title: string                  // human-readable (from sectionTitles map — D-06)
    content: string                // HTML with paragraph data-id attributes intact (NOT stripped)
  }
  other_sections: Array<{
    key: string
    title: string                  // human-readable
    summary: string                // first 200 chars plain text
  }>
  chat_history: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

// ── DB row shape ───────────────────────────────────────────────────────────────

export interface ChatRow {
  id?: string
  proposal_id: string
  org_id: string
  role: 'user' | 'assistant'
  content: string
  section_target_id: string | null
  message_type: ChatMessageType
  tool_data?: ToolDataEnvelope | null
  created_at?: string
}
