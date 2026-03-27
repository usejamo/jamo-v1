import type { SectionStatus } from './generation'

export type EditorMode = 'editing' | 'streaming' | 'preview' | 'locked'

export type AIActionType = 'generate' | 'regenerate' | 'expand' | 'condense' | 'rewrite'

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

export interface ConsistencyFlag {
  id: string
  message: string
  sections_involved: string[]
}

export interface SectionEditorState {
  section_key: string
  content: string
  last_saved_content: string | null
  is_locked: boolean
  status: SectionStatus | 'needs-review' | 'missing'
  autosave_status: 'idle' | 'saving' | 'saved'
  compliance_flags: ComplianceFlag[]
  compliance_checking: boolean
  ai_action: {
    type: AIActionType
    streaming: boolean
    preview_content: string
    snapshot_before: string
  } | null
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
  | { type: 'OPEN_VERSION_HISTORY'; payload: string }
  | { type: 'CLOSE_VERSION_HISTORY' }

export interface WorkspaceState {
  sections: Record<string, SectionEditorState>
  active_section: string
  version_history_open: string | null
  consistency_flags: ConsistencyFlag[]
  consistency_dismissed: boolean
}

export interface SectionEditorHandle {
  insertContentAt: (pos: number, content: string) => void
  setContent: (html: string) => void
  getContent: () => string
}

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  sections: {},
  active_section: '',
  version_history_open: null,
  consistency_flags: [],
  consistency_dismissed: false,
}
