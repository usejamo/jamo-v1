import { useRef, useEffect, useCallback } from 'react'
import { SectionEditorBlock } from './SectionEditorBlock'
import { SectionWorkspaceProvider, useSectionWorkspace } from '../../context/SectionWorkspaceContext'
import { SECTION_NAMES, SECTION_WAVE_MAP } from '../../types/generation'
import type { SectionEditorHandle, SectionEditorState } from '../../types/workspace'

interface SectionWorkspaceProps {
  proposalId: string
  sections: Array<{
    section_key: string
    content: string
    is_locked: boolean
    status: string
    last_saved_content: string | null
  }>
  orgId: string
}

// Status dot color for section nav
function statusDot(status: string): string {
  if (status === 'complete') return 'bg-green-500'
  if (status === 'needs-review') return 'bg-amber-500'
  return 'bg-gray-300'
}

function SectionWorkspaceInner({ proposalId, sections }: Omit<SectionWorkspaceProps, 'orgId'>) {
  const { state, dispatch } = useSectionWorkspace()
  const editorRefs = useRef<Map<string, SectionEditorHandle>>(new Map())
  const sectionKeys = Object.keys(SECTION_WAVE_MAP)

  // Populate workspace state from sections prop on mount
  useEffect(() => {
    const sectionsMap: Record<string, SectionEditorState> = {}
    for (const s of sections) {
      sectionsMap[s.section_key] = {
        section_key: s.section_key,
        content: s.content ?? '',
        last_saved_content: s.last_saved_content,
        is_locked: s.is_locked ?? false,
        status: (s.status as SectionEditorState['status']) ?? 'missing',
        autosave_status: 'idle',
        compliance_flags: [],
        compliance_checking: false,
        ai_action: null,
      }
    }
    // Fill any section keys not in the prop with empty state
    for (const key of sectionKeys) {
      if (!sectionsMap[key]) {
        sectionsMap[key] = {
          section_key: key,
          content: '',
          last_saved_content: null,
          is_locked: false,
          status: 'missing',
          autosave_status: 'idle',
          compliance_flags: [],
          compliance_checking: false,
          ai_action: null,
        }
      }
    }
    dispatch({ type: 'SET_SECTIONS', payload: sectionsMap })
    if (sectionKeys.length > 0) {
      dispatch({ type: 'SET_ACTIVE_SECTION', payload: sectionKeys[0] })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId])

  // Intersection observer for active section tracking
  useEffect(() => {
    const observers: IntersectionObserver[] = []
    sectionKeys.forEach((key) => {
      const el = document.getElementById(key)
      if (!el) return
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            dispatch({ type: 'SET_ACTIVE_SECTION', payload: key })
          }
        },
        { rootMargin: '-10% 0px -80% 0px', threshold: 0 }
      )
      observer.observe(el)
      observers.push(observer)
    })
    return () => observers.forEach((o) => o.disconnect())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKeys.join(',')])

  const scrollToSection = useCallback((key: string) => {
    document.getElementById(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    dispatch({ type: 'SET_ACTIVE_SECTION', payload: key })
  }, [dispatch])

  return (
    <div className="flex gap-0 h-full">
      {/* Left column — section nav */}
      <nav className="w-56 shrink-0 border-r border-gray-200 overflow-y-auto py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-3">
          Sections
        </p>
        <ul className="space-y-0.5">
          {sectionKeys.map((key) => {
            const sectionState = state.sections[key]
            const isActive = state.active_section === key
            const status = sectionState?.status ?? 'missing'
            return (
              <li key={key}>
                <button
                  onClick={() => scrollToSection(key)}
                  className={`w-full text-left text-xs px-3 py-2 flex items-center gap-2 transition-colors ${
                    isActive
                      ? 'border-l-2 border-jamo-500 bg-gray-50 text-gray-900 font-medium'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-l-2 border-transparent'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(status)}`} />
                  <span className="leading-snug">{SECTION_NAMES[key] ?? key}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Center column — TipTap editors */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {sectionKeys.map((key) => {
          const editorState = state.sections[key]
          if (!editorState) return null
          return (
            <SectionEditorBlock
              key={key}
              ref={(handle) => {
                if (handle) {
                  editorRefs.current.set(key, handle)
                } else {
                  editorRefs.current.delete(key)
                }
              }}
              sectionKey={key}
              sectionTitle={SECTION_NAMES[key] ?? key}
              proposalId={proposalId}
              editorState={editorState}
            />
          )
        })}
      </div>

      {/* Right column — Phase 9 AI chat slot (empty for now) */}
      <div className="w-80 shrink-0 border-l border-gray-200" data-slot="ai-chat-panel" />
    </div>
  )
}

export default function SectionWorkspace({ proposalId, sections, orgId }: SectionWorkspaceProps) {
  return (
    <SectionWorkspaceProvider>
      <SectionWorkspaceInner proposalId={proposalId} sections={sections} orgId={orgId} />
    </SectionWorkspaceProvider>
  )
}
