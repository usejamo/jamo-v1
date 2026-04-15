import React, { useRef, useEffect, useCallback, useState } from 'react'
import { SectionEditorBlock } from './SectionEditorBlock'
import { SectionNavPanel } from './SectionNavPanel'
import { VersionHistoryOverlay } from './VersionHistoryOverlay'
import { ConsistencyCheckBanner } from './ConsistencyCheckBanner'
import { SectionWorkspaceProvider, useSectionWorkspace } from '../../context/SectionWorkspaceContext'
import { SECTION_NAMES, SECTION_WAVE_MAP } from '../../types/generation'
import type { SectionEditorHandle, SectionEditorState, ComplianceFlag, ConsistencyFlag } from '../../types/workspace'
import { useComplianceCheck } from '../../hooks/useComplianceCheck'
import { supabase } from '../../lib/supabase'

interface SectionWorkspaceProps {
  proposalId: string
  sections: Array<{
    section_key: string
    content: string
    is_locked: boolean
    status: string
    last_saved_content: string | null
    compliance_flags?: ComplianceFlag[] | null
  }>
  orgId: string
  editorRefsRef?: React.MutableRefObject<Map<string, SectionEditorHandle>>
  onActiveSectionChange?: (sectionKey: string | null) => void
  externalScrollRef?: React.RefObject<HTMLDivElement>
  consistencyCheckRef?: React.MutableRefObject<(() => void) | null>
}

function SectionWorkspaceInner({ proposalId, sections, orgId, editorRefsRef, onActiveSectionChange, externalScrollRef, consistencyCheckRef }: SectionWorkspaceProps) {
  const { state, dispatch } = useSectionWorkspace()
  const localEditorRefs = useRef<Map<string, SectionEditorHandle>>(new Map())
  const editorRefs = editorRefsRef ?? localEditorRefs
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [dbLoaded, setDbLoaded] = useState(false)
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
        compliance_flags: Array.isArray(s.compliance_flags) ? s.compliance_flags : [],
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

  // Load persisted consistency flags and consistency_check_ran from DB on mount
  useEffect(() => {
    if (!proposalId) {
      setDbLoaded(true)
      return
    }
    supabase
      .from('proposals')
      .select('consistency_flags, consistency_check_ran')
      .eq('id', proposalId)
      .single()
      .then(({ data }) => {
        if (!data) {
          setDbLoaded(true)
          return
        }
        if (Array.isArray(data.consistency_flags) && data.consistency_flags.length > 0) {
          dispatch({
            type: 'SET_CONSISTENCY_FLAGS',
            payload: (data.consistency_flags as Array<{ id?: string; message: string; sections_involved: string[] }>).map((f) => ({
              ...f,
              id: f.id ?? crypto.randomUUID(),
            })),
          })
        }
        if (data.consistency_check_ran) {
          dispatch({ type: 'SET_CONSISTENCY_CHECK_RAN', payload: true })
        }
        setDbLoaded(true)
      }, () => {
        setDbLoaded(true)  // unblock auto-trigger even if DB load fails
      })
  }, [proposalId])

  // D-02: Background re-check — silently refresh flags after mount
  const { checkCompliance } = useComplianceCheck(proposalId, orgId)
  useEffect(() => {
    const sectionEntries = Object.values(state.sections)
    if (sectionEntries.length === 0) return
    const timer = setTimeout(() => {
      for (const s of sectionEntries) {
        if (s.content && s.content.trim().length > 0) {
          checkCompliance(s.section_key, s.content)
        }
      }
    }, 500) // Small delay to let UI render with cached flags first
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId])

  // Scroll listener for active section tracking
  useEffect(() => {
    const container = externalScrollRef?.current ?? scrollContainerRef.current
    if (!container || Object.keys(state.sections).length === 0) return

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top
      let activeKey = sectionKeys[0]
      for (const key of sectionKeys) {
        const el = document.getElementById(key)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.top - containerTop <= 80) {
          activeKey = key
        }
      }
      dispatch({ type: 'SET_ACTIVE_SECTION', payload: activeKey })
    }

    container.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => container.removeEventListener('scroll', handleScroll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKeys.join(','), Object.keys(state.sections).length])

  // Named callback for consistency check — used by auto-trigger and parent ref (D-12)
  const runConsistencyCheck = useCallback(() => {
    const sectionInputs = Object.entries(state.sections).map(([key, s]) => ({
      section_key: key,
      content: s.content,
    }))
    dispatch({ type: 'SET_CONSISTENCY_CHECK_RAN', payload: true })

    supabase.functions
      .invoke('consistency-check', { body: { sections: sectionInputs } })
      .then(({ data }) => {
        const flags: ConsistencyFlag[] = (data?.flags ?? []).map(
          (f: { id?: string; message: string; sections_involved: string[] }) => ({
            ...f,
            id: f.id ?? crypto.randomUUID(),
          })
        )
        dispatch({ type: 'SET_CONSISTENCY_FLAGS', payload: flags })
        // Persist both flags and ran=true together, only on success
        supabase
          .from('proposals')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ consistency_flags: flags as any, consistency_check_ran: true })
          .eq('id', proposalId)
          .then()
      })
      .catch(() => {
        // Edge function failed — reset ran flag in state so auto-trigger can retry
        dispatch({ type: 'SET_CONSISTENCY_CHECK_RAN', payload: false })
      })
  }, [state.sections, proposalId, dispatch])

  // Auto-trigger consistency check after all sections reach 'complete' status (D-12)
  useEffect(() => {
    if (!dbLoaded) return
    const sectionValues = Object.values(state.sections)
    if (sectionValues.length === 0) return
    const allComplete = sectionValues.every((s) => s.status === 'complete')
    if (allComplete && !state.consistency_check_ran) {
      runConsistencyCheck()
    }
  }, [dbLoaded, state.sections, state.consistency_check_ran, runConsistencyCheck])

  // Wire consistencyCheckRef so parent can trigger a manual run
  useEffect(() => {
    if (consistencyCheckRef) {
      consistencyCheckRef.current = runConsistencyCheck
    }
    return () => {
      if (consistencyCheckRef) consistencyCheckRef.current = null
    }
  }, [consistencyCheckRef, runConsistencyCheck])

  // Notify parent when active section changes (for AIChatPanel activeSectionKey)
  useEffect(() => {
    if (onActiveSectionChange) {
      onActiveSectionChange(state.active_section ?? null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.active_section])

  const handleSelectSection = useCallback((key: string) => {
    dispatch({ type: 'SET_ACTIVE_SECTION', payload: key })
    document.getElementById(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [dispatch])

  // D-11 restore flow: snapshot pre-restore state, inject via setContent, close overlay
  const handleRestore = useCallback(async (sectionKey: string, restoredContent: string, _label: string) => {
    const currentSection = state.sections[sectionKey]
    const currentContent = currentSection?.content ?? ''

    // Snapshot current content as "Before Restore" (skip if orgId not yet available)
    if (orgId) {
      await supabase.from('proposal_section_versions').insert({
        proposal_id: proposalId,
        org_id: orgId,
        section_key: sectionKey,
        content: currentContent,
        action_label: 'Before Restore',
      })
    }

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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl mx-auto">
        {/* Consistency check banner — appears after full generation, dismissible */}
        {state.consistency_flags.length > 0 && !state.consistency_dismissed && (
          <ConsistencyCheckBanner
            flags={state.consistency_flags}
            onDismiss={() => dispatch({ type: 'DISMISS_CONSISTENCY' })}
          />
        )}
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
              orgId={orgId}
              editorState={editorState}
              onFocus={() => dispatch({ type: 'SET_ACTIVE_SECTION', payload: key })}
            />
          )
        })}
        </div>
      </div>

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

export default function SectionWorkspace({ proposalId, sections, orgId, editorRefsRef, onActiveSectionChange, externalScrollRef, consistencyCheckRef }: SectionWorkspaceProps) {
  return (
    <SectionWorkspaceProvider>
      <SectionWorkspaceInner proposalId={proposalId} sections={sections} orgId={orgId} editorRefsRef={editorRefsRef} onActiveSectionChange={onActiveSectionChange} externalScrollRef={externalScrollRef} consistencyCheckRef={consistencyCheckRef} />
    </SectionWorkspaceProvider>
  )
}
