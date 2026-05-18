import type { SectionStatus } from './generation'

export type EditorMode = 'editing' | 'streaming' | 'preview' | 'locked'

export type AIActionType = 'generate' | 'expand' | 'condense' | 'rewrite'

export interface VersionEntry {
  id: string
  proposal_id: string
  org_id: string
  section_key: string
  content: string
  action_label: string
  created_at: string
}

export interface ComplianceFlag {
  id: string
  section_key: string
  type: 'warning' | 'fail'
  message: string
  source: 'rule' | 'haiku'
}

/** Shape stored in proposal_sections.compliance_flags JSONB column. Same as ComplianceFlag. */
export type ComplianceFlagDB = Pick<ComplianceFlag, 'id' | 'section_key' | 'type' | 'message' | 'source'>

export interface ConsistencyFlag {
  id: string
  message: string
  sections_involved: string[]
}

export type IssueCategory = 'placeholder' | 'compliance' | 'typo' | 'cross-section'

export interface SectionIssue {
  id: string
  label: string
  message?: string
}

// ── Pending edit types (Phase 14.2) ────────────────────────────────────────────

export type ChangeOperation = 'replace' | 'insert_after' | 'delete'

export type ChangeResolution = 'accepted' | 'rejected' | 'auto_rejected_stale' | 'not_reached' | 'pending'

export interface PendingEdit {
  /** Stable UUID identity for this edit — generated at materialization time */
  id: string
  /** Matches ProposeEditChange.paragraph_id — existing node data-id */
  paragraph_id: string
  /** Which section this edit targets — required for cross-section safety checks */
  section_key: string
  /**
   * Direct from ProposeEditChange.operation — no field rename.
   * Field mapping: ProposeEditChange.operation → PendingEdit.operation (same field name, same type)
   */
  operation: ChangeOperation
  /**
   * Direct from ProposeEditChange.before_html — no field rename.
   * Field mapping: ProposeEditChange.before_html → PendingEdit.before_html (same field name)
   */
  before_html?: string   // replace only
  /**
   * Direct from ProposeEditChange.after_html — no field rename.
   * Field mapping: ProposeEditChange.after_html → PendingEdit.after_html (same field name)
   */
  after_html?: string    // replace and insert_after
  change_summary: string
  resolution: ChangeResolution
  /**
   * SHA-256 (first 8 chars) of anchor paragraph innerHTML at materialization time — D-06
   * Staleness hash is computed as: normalizedText(paragraph) + '|' + paragraphId + '|' + originalHtml
   * where normalizedText strips leading/trailing whitespace and collapses internal whitespace sequences
   */
  anchor_hash?: string
  /** Source chat message ID — links edit to the proposal_chats row for persistResolutions */
  message_id: string
  /** Index within the ProposeEditPayload.changes array — for tally ordering */
  change_index: number
  /** ISO timestamp when this edit was materialized into the editor */
  created_at: string

  /** ProseMirror resolved position of anchor start — computed at decoration time.
   *  @runtime_only Not persisted — recalculated each time decorations are built. */
  anchorFrom?: number
  /** ProseMirror resolved position of anchor end — computed at decoration time.
   *  @runtime_only Not persisted — recalculated each time decorations are built. */
  anchorTo?: number
}

export interface SectionEditorState {
  section_key: string
  name: string
  content: string
  last_saved_content: string | null
  is_locked: boolean
  status: SectionStatus | 'needs-review' | 'missing'
  autosave_status: 'idle' | 'saving' | 'saved'
  compliance_flags: ComplianceFlag[]
  compliance_checking: boolean
  issues: Partial<Record<IssueCategory, SectionIssue[]>>
  ai_action: {
    type: AIActionType
    streaming: boolean
    preview_content: string
    snapshot_before: string
  } | null
  pending_edits: PendingEdit[]
}

export type WorkspaceAction =
  | { type: 'SET_SECTIONS'; payload: Record<string, SectionEditorState> }
  | { type: 'SET_ACTIVE_SECTION'; payload: string }
  | { type: 'UPDATE_CONTENT'; payload: { section_key: string; content: string } }
  | { type: 'SET_LOCKED'; payload: { section_key: string; is_locked: boolean } }
  | { type: 'SET_AUTOSAVE_STATUS'; payload: { section_key: string; status: 'idle' | 'saving' | 'saved' } }
  | { type: 'START_AI_ACTION'; payload: { section_key: string; action_type: AIActionType; snapshot: string } }
  | { type: 'UPDATE_AI_PREVIEW'; payload: { section_key: string; content: string } }
  | { type: 'COMPLETE_AI_STREAM'; payload: { section_key: string } }
  | { type: 'ACCEPT_AI_ACTION'; payload: { section_key: string } }
  | { type: 'REJECT_AI_ACTION'; payload: { section_key: string } }
  | { type: 'SET_COMPLIANCE_FLAGS'; payload: { section_key: string; flags: ComplianceFlag[] } }
  | { type: 'SET_COMPLIANCE_CHECKING'; payload: { section_key: string; checking: boolean } }
  | { type: 'SET_CONSISTENCY_FLAGS'; payload: ConsistencyFlag[] }
  | { type: 'DISMISS_CONSISTENCY' }
  | { type: 'SET_CONSISTENCY_CHECK_RAN'; payload: boolean }
  | { type: 'UPDATE_SECTION_ISSUES'; payload: { section_key: string; category: IssueCategory; issues: SectionIssue[] } }
  | { type: 'OPEN_VERSION_HISTORY'; payload: string }
  | { type: 'CLOSE_VERSION_HISTORY' }
  | { type: 'SET_PENDING_EDITS'; payload: { section_key: string; message_id: string; edits: PendingEdit[] } }
  | { type: 'ACCEPT_PENDING_EDIT'; payload: { section_key: string; paragraph_id: string } }
  | { type: 'REJECT_PENDING_EDIT'; payload: { section_key: string; paragraph_id: string } }
  | { type: 'CLEAR_PENDING_EDITS'; payload: { section_key: string } }
  | { type: 'AUTO_REJECT_STALE_EDITS'; payload: { section_key: string; stale_ids: string[] } }
  /**
   * D-03: Batch Accept fires a single ProseMirror transaction wrapping all ghost commits.
   * Payload carries the full edits array so SectionEditorBlock can iterate once and build
   * one chained chain().deleteRange().insertContentAt()...run() — one undo step, not N.
   * Only pending edits (resolution === 'pending') are processed; already-resolved edits are
   * silently skipped (not an error).
   */
  | { type: 'BATCH_ACCEPT_PENDING_EDITS'; payload: { section_key: string; edits: PendingEdit[] } }

export interface WorkspaceState {
  sections: Record<string, SectionEditorState>
  active_section: string
  version_history_open: string | null
  consistency_flags: ConsistencyFlag[]
  consistency_dismissed: boolean
  consistency_check_ran: boolean
}

export interface PatchResult {
  applied: number       // count of successfully applied changes
  stale: string[]       // paragraph_ids that were not found in the doc
  newParagraphId?: string  // ID of the most recently inserted paragraph (insert_after only)
}

export interface SectionEditorHandle {
  insertContentAt: (pos: number, content: string) => void
  setContent: (html: string) => void
  getContent: () => string
  applyParagraphPatch: (changes: import('./chat').ProposeEditChange[]) => PatchResult
  /** Dispatches SET_PENDING_EDITS to workspace reducer, triggering PendingEditsPlugin refresh.
   *  Runs ghostContentLeakDetected guard before dispatch — blocks and logs if ghost leak detected.
   *  Both initial propose_edit arrival AND 'Review in editor →' use this as the single entry point. */
  materializePendingEdits: (messageId: string, edits: PendingEdit[]) => void
}

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  sections: {},
  active_section: '',
  version_history_open: null,
  consistency_flags: [],
  consistency_dismissed: false,
  consistency_check_ran: false,
}
