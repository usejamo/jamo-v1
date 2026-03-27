import { useRef, useEffect, useCallback } from 'react'
import { SectionEditorBlock } from './SectionEditorBlock'
import { SectionNavPanel } from './SectionNavPanel'
import { VersionHistoryOverlay } from './VersionHistoryOverlay'
import { SectionWorkspaceProvider, useSectionWorkspace } from '../../context/SectionWorkspaceContext'
import { SECTION_NAMES, SECTION_WAVE_MAP } from '../../types/generation'
import type { SectionEditorHandle, SectionEditorState } from '../../types/workspace'
import { supabase } from '../../lib/supabase'

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

function SectionWorkspaceInner({ proposalId, sections, orgId }: SectionWorkspaceProps) {
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

  const handleSelectSection = useCallback((key: string) => {
    dispatch({ type: 'SET_ACTIVE_SECTION', payload: key })
    document.getElementById(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [dispatch])

  // D-11 restore flow: snapshot pre-restore state, inject via setContent, close overlay
  const handleRestore = useCallback(async (sectionKey: string, restoredContent: string, _label: string) => {
    const currentSection = state.sections[sectionKey]
    const currentContent = currentSection?.content ?? ''

    // Snapshot current content as "Before Restore"
    await supabase.from('proposal_section_versions').insert({
      proposal_id: proposalId,
      org_id: orgId,
      section_key: sectionKey,
      content: currentContent,
      action_label: 'Before Restore',
    })

    // Inject restored content via command API (undoable with Cmd+Z per D-11)
    editorRefs.current.get(sectionKey)?.setContent(restoredContent)

    dispatch({ type: 'CLOSE_VERSION_HISTORY' })
  }, [state.sections, proposalId, orgId, dispatch])

  const versionHistorySectionKey = state.version_history_open

  return (
    <div className="flex gap-0 h-full">
      {/* Left column — section nav panel */}
      <SectionNavPanel
        sections={state.sections}
        activeSectionKey={state.active_section}
        onSelectSection={handleSelectSection}
      />

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

      {/* Version history overlay */}
      {versionHistorySectionKey && (
        <VersionHistoryOverlay
          proposalId={proposalId}
          orgId={orgId}
          sectionKey={versionHistorySectionKey}
          currentContent={state.sections[versionHistorySectionKey]?.content ?? ''}
          onRestore={(content, label) => handleRestore(versionHistorySectionKey, content, label)}
          onClose={() => dispatch({ type: 'CLOSE_VERSION_HISTORY' })}
        />
      )}
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
