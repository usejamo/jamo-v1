import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react'
import { type WorkspaceState, type WorkspaceAction, DEFAULT_WORKSPACE_STATE } from '../types/workspace'

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_SECTIONS':
      return { ...state, sections: action.payload }

    case 'SET_ACTIVE_SECTION':
      return { ...state, active_section: action.payload }

    case 'UPDATE_CONTENT': {
      const { section_key, content } = action.payload
      const section = state.sections[section_key]
      if (!section) return state
      return {
        ...state,
        sections: {
          ...state.sections,
          [section_key]: { ...section, content },
        },
      }
    }

    case 'SET_LOCKED': {
      const { section_key, is_locked } = action.payload
      const section = state.sections[section_key]
      if (!section) return state
      return {
        ...state,
        sections: {
          ...state.sections,
          [section_key]: { ...section, is_locked },
        },
      }
    }

    case 'SET_AUTOSAVE_STATUS': {
      const { section_key, status } = action.payload
      const section = state.sections[section_key]
      if (!section) return state
      return {
        ...state,
        sections: {
          ...state.sections,
          [section_key]: { ...section, autosave_status: status },
        },
      }
    }

    case 'START_AI_ACTION': {
      const { section_key, action_type, snapshot } = action.payload
      const section = state.sections[section_key]
      if (!section) return state
      return {
        ...state,
        sections: {
          ...state.sections,
          [section_key]: {
            ...section,
            ai_action: {
              type: action_type,
              streaming: true,
              preview_content: '',
              snapshot_before: snapshot,
            },
          },
        },
      }
    }

    case 'UPDATE_AI_PREVIEW': {
      const { section_key, content } = action.payload
      const section = state.sections[section_key]
      if (!section || !section.ai_action) return state
      return {
        ...state,
        sections: {
          ...state.sections,
          [section_key]: {
            ...section,
            ai_action: { ...section.ai_action, preview_content: content },
          },
        },
      }
    }

    case 'COMPLETE_AI_STREAM': {
      const { section_key } = action.payload
      const section = state.sections[section_key]
      if (!section || !section.ai_action) return state
      return {
        ...state,
        sections: {
          ...state.sections,
          [section_key]: {
            ...section,
            ai_action: { ...section.ai_action, streaming: false },
          },
        },
      }
    }

    case 'ACCEPT_AI_ACTION': {
      const { section_key } = action.payload
      const section = state.sections[section_key]
      if (!section || !section.ai_action) return state
      return {
        ...state,
        sections: {
          ...state.sections,
          [section_key]: {
            ...section,
            content: section.ai_action.preview_content,
            ai_action: null,
          },
        },
      }
    }

    case 'REJECT_AI_ACTION': {
      const { section_key } = action.payload
      const section = state.sections[section_key]
      if (!section) return state
      return {
        ...state,
        sections: {
          ...state.sections,
          [section_key]: { ...section, ai_action: null },
        },
      }
    }

    case 'SET_COMPLIANCE_FLAGS': {
      const { section_key, flags } = action.payload
      const section = state.sections[section_key]
      if (!section) return state
      return {
        ...state,
        sections: {
          ...state.sections,
          [section_key]: { ...section, compliance_flags: flags },
        },
      }
    }

    case 'SET_COMPLIANCE_CHECKING': {
      const { section_key, checking } = action.payload
      const section = state.sections[section_key]
      if (!section) return state
      return {
        ...state,
        sections: {
          ...state.sections,
          [section_key]: { ...section, compliance_checking: checking },
        },
      }
    }

    case 'SET_CONSISTENCY_FLAGS':
      return { ...state, consistency_flags: action.payload }

    case 'DISMISS_CONSISTENCY':
      return { ...state, consistency_dismissed: true }

    case 'OPEN_VERSION_HISTORY':
      return { ...state, version_history_open: action.payload }

    case 'CLOSE_VERSION_HISTORY':
      return { ...state, version_history_open: null }

    default:
      return state
  }
}

interface SectionWorkspaceContextValue {
  state: WorkspaceState
  dispatch: Dispatch<WorkspaceAction>
}

const SectionWorkspaceContext = createContext<SectionWorkspaceContextValue | null>(null)

export function SectionWorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, DEFAULT_WORKSPACE_STATE)

  return (
    <SectionWorkspaceContext.Provider value={{ state, dispatch }}>
      {children}
    </SectionWorkspaceContext.Provider>
  )
}

export function useSectionWorkspace(): SectionWorkspaceContextValue {
  const ctx = useContext(SectionWorkspaceContext)
  if (!ctx) throw new Error('useSectionWorkspace must be used within SectionWorkspaceProvider')
  return ctx
}
