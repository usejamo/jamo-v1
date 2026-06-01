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

// ── Change type labels for ghost decorations (D-10) ───────────────────────────
// ChangeType uses the same string values as ProposeEditChange.operation (direct assignability).
// Mapping: 'replace' → badge 'EDIT', 'insert_after' → badge 'INSERT', 'delete' → badge 'DELETE'
// Operation→ChangeType alignment: operation: 'replace' → ChangeType 'replace' (badge: 'EDIT')
//                                  operation: 'insert_after' → ChangeType 'insert_after' (badge: 'INSERT')
//                                  operation: 'delete' → ChangeType 'delete' (badge: 'DELETE')
export type ChangeType = 'replace' | 'insert_after' | 'delete'

export const CHANGE_TYPE_LABELS: Record<ChangeType, { badge: string; aria: string }> = {
  replace:      { badge: 'EDIT',   aria: 'Proposed edit replacing the following paragraph' },
  insert_after: { badge: 'INSERT', aria: 'Proposed new paragraph to insert here' },
  delete:       { badge: 'DELETE', aria: 'Proposed deletion of the following paragraph' },
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
  /** Optional proposed fix — compliance cards with fixes materialize ghosts via SET_PENDING_EDITS */
  changes?: ProposeEditChange[]
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
  // Phase 14.2.2 — snapshot of the originating PendingActionItem (D-19). May be null
  // for free-text / user-initiated tool calls that have no upstream action item.
  originating_action?: OriginatingActionSnapshot | null
}

// ── Per-paragraph accept/reject state (within ToolDataEnvelope.state) ─────────

export interface ProposeEditState {
  resolutions: Record<string, 'accepted' | 'rejected' | 'auto_rejected_stale' | 'not_reached' | 'pending'>
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
    content: string                // full HTML with paragraph data-id attributes
  }>
  chat_history: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  // When the user clicks an ActionQueue CTA, we force the server to use exactly
  // that tool via `tool_choice: { type: 'tool', name: forced_tool }` so Sonnet
  // cannot substitute set_focus or any other tool. Omitted for free-form chat.
  forced_tool?: ActionItemCtaTool
}

// ── DB row shape ───────────────────────────────────────────────────────────────

export interface ChatRow {
  id?: string
  proposal_id: string
  org_id: string
  role: 'user' | 'assistant'
  content: string
  // D-49: must be set on ALL messages including walkthrough-driven and queue-triggered messages.
  section_target_id: string | null
  message_type: ChatMessageType
  tool_data?: ToolDataEnvelope | null
  created_at?: string
}

// ── Action queue item (chat_sessions.pending_actions JSONB) ───────────────────

export type ActionItemType = 'gap' | 'conflict' | 'compliance' | 'missing'

export type ActionItemCtaTool = 'propose_edit' | 'check_regulatory_compliance' | 'answer_with_citations'

export interface PendingActionItem {
  id: string
  type: ActionItemType
  /** Must match a section_key in the workspace — D-29: section name visible in item text */
  section_key: string
  /** Which proposal this action item belongs to — for de-duplication across runs */
  proposal_id: string
  /** Run ID from analyze-proposal-gaps — D-34: only latest run's results are shown */
  run_id: string
  title: string          // format: "[Section Name] — [description]" per D-29
  description: string
  /** 1 = compliance (highest), 2 = conflict, 3 = gap, 4 = missing — D-18 fixed priority */
  priority: 1 | 2 | 3 | 4
  cta_label: string
  cta_tool: ActionItemCtaTool
  cta_payload: Record<string, unknown>
  /** Why Haiku flagged this issue — surfaced in drill-down if present */
  rationale?: string
  /** Haiku confidence 0–1 — used for internal sorting before priority caps are applied */
  confidence?: number
  /** ISO timestamp when this item was first generated */
  created_at: string
  /** ISO timestamp of last update (e.g., after resurfacing) */
  updated_at: string
  dismissed?: boolean
  resurfaced?: boolean
  /** Hash of relevant content at dismiss time — D-22 */
  content_hash?: string
}

// ── Active walkthrough task (chat_sessions.active_task JSONB) ─────────────────

export type WalkthroughStage = 'gathering_inputs' | 'drafting' | 'complete' | 'discarded'

/** Terminal states for queue items */
export type QueueItemTerminalState = 'dismissed' | 'completed' | 'skipped'

export interface ActiveTask {
  type: 'walkthrough'
  /** Task lifecycle status */
  status: 'active' | 'completed' | 'discarded'
  section_key: string
  section_title: string
  stage: WalkthroughStage
  collected_inputs: Record<string, string>
  /** Change IDs (paragraph_id values) not yet resolved by the user */
  pending_paragraph_ids: string[]
  /** Change IDs the user has accepted */
  accepted_paragraph_ids: string[]
  /** SHA-256 (first 8 chars) of section content at walkthrough start — D-38 drift detection */
  content_hash: string
  /** ISO timestamp when this walkthrough task was started */
  started_at: string
  /** ISO timestamp when task reached 'completed' or 'discarded' state */
  completed_at?: string
  /** The PendingActionItem.id that triggered this walkthrough — for back-linking */
  source_action_item_id?: string
  last_updated: string
}

// ── Phase 14.2.2 — resolved_items memory types ────────────────────────────────

/**
 * Finding type for resolved/originating action items. Matches the existing
 * PendingActionItem.type / ActionItemType union (kept in lockstep — if one changes,
 * update both).
 */
export type FindingType = 'gap' | 'conflict' | 'compliance' | 'missing'

/** Walkthrough acceptance tally — D-14. Optional on ResolvedItem. */
export type AcceptanceSummary = {
  accepted: number
  rejected: number
  stale: number
}

/**
 * Minimal snapshot of the PendingActionItem that triggered a tool call. Persisted
 * inside ToolDataEnvelope.originating_action so downstream consumers can reconstruct
 * the originating action even after the pending_actions list churns (D-19).
 */
export type OriginatingActionSnapshot = {
  id: string
  section_key: string
  finding_type: FindingType
  title: string
  description: string
}

/**
 * Persisted entry in chat_sessions.resolved_items[] — one per fixed/dismissed action.
 * Cap = RESOLVED_ITEMS_CAP (25), enforced inside the append_resolved_item RPC under
 * FOR UPDATE lock (D-27, D-29, D-30).
 *
 * originating_action_id is nullable to allow free-text origins (D-10/D-19) where the
 * user invoked the tool directly without an upstream pending action.
 */
export type ResolvedItem = {
  originating_action_id: string | null
  section_key: string
  finding_type: FindingType
  title: string
  description: string
  user_action: 'fixed' | 'dismissed'
  /** Concatenated + truncated to APPLIED_CHANGES_MAX_CHARS (200) — D-16. */
  applied_changes: string
  /** SHA-256 hex of section's TipTap HTML at the moment of action — drift detection. */
  section_content_hash_at_action: string
  /** ISO 8601 timestamp — used for cap-eviction ordering inside the RPC (DESC). */
  timestamp: string
  acceptance_summary?: AcceptanceSummary
}
