import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import allDocuments from '../data/documents.json'

import type { PendingSuggestion } from '../types/draft'
import { generateProposalDraft } from '../data/proposalDraftData'
import { COMMAND_MAP } from '../data/demoCommands'
import type { ContentBlock } from '../types/draft'
import ProposalDraftRenderer from '../components/ProposalDraftRenderer'
import AIChatPanel from '../components/AIChatPanel'
import { FileUpload } from '../components/FileUpload'
import { DocumentList } from '../components/DocumentList'
import { useProposals } from '../context/ProposalsContext'
import { useProposalModal } from '../context/ProposalModalContext'
import { useAuth } from '../context/AuthContext'
import { useSidebar } from '../context/SidebarContext'
import Sidebar from '../components/Sidebar'
import { useGeneration } from '../context/GenerationContext'
import { derivePhase, hasContent, rowToSectionState } from '../lib/generationProgress'
import { GenerationHeader } from '../components/GenerationHeader'
import { GenerationControls } from '../components/GenerationControls'
import type { GenerateSectionPayloadV2 } from '../types/generation'
import type { SectionEditorHandle, ComplianceFlag } from '../types/workspace'
import SectionWorkspace from '../components/editor/SectionWorkspace'
import { SectionWorkspaceProvider } from '../context/SectionWorkspaceContext'
import { supabase } from '../lib/supabase'

import { exportDocx, ExportBlockedError } from '../lib/exportDocx'
import type { ExportSection, PlaceholderItem } from '../lib/exportDocx'
import { ExportBlockedModal } from '../components/ExportBlockedModal'

const docsByProposal = allDocuments as Record<string, MockDoc[]>

interface MockDoc {
  id: string
  type: 'rfp' | 'kickoff' | 'template' | 'other'
  name: string
  size: string
  uploadedAt: string
}

import { StatusSelector, STATUS_LABELS } from '../components/StatusSelector'
import { ProposalReferenceControl } from '../components/ProposalReferenceControl'
// D-04 capture entry point. The action lives in its own component (invoking
// `demo-capture-fixture`) so it is unit-testable — ProposalDetail itself is too
// heavy to mount. It self-hides unless the caller is a super_admin in the demo
// org; the edge function remains the authoritative gate.
import { SaveAsDemoFixtureButton } from '../components/SaveAsDemoFixtureButton'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function formatDate(dateStr: string | undefined | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Export dropdown ────────────────────────────────────────────────────────────

interface ExportDropdownProps {
  getSections: () => ExportSection[]
  proposalTitle: string
  templateFilePath?: string | null
}

function ExportDropdown({ getSections, proposalTitle, templateFilePath }: ExportDropdownProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [blockedPlaceholders, setBlockedPlaceholders] = useState<PlaceholderItem[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [nudgeVisible, setNudgeVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function fetchTemplateBlob(filePath: string): Promise<Blob | null> {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 3600)
      if (error || !data?.signedUrl) {
        console.error('[fetchTemplateBlob] could not sign', filePath, error)
        return null
      }
      const resp = await fetch(data.signedUrl)
      if (!resp.ok) {
        console.error('[fetchTemplateBlob] fetch failed', filePath, resp.status)
        return null
      }
      return await resp.blob()
    } catch (err) {
      console.error('[fetchTemplateBlob] network error', filePath, err)
      return null  // D-03: network error falls through to unstyled export
    }
  }

  function handleNudgeDismiss() {
    localStorage.setItem('template_nudge_dismissed', 'true')
    setNudgeVisible(false)
  }

  async function handleExport() {
    setOpen(false)
    setExporting(true)
    try {
      let templateBlob: Blob | undefined
      if (templateFilePath) {
        templateBlob = await fetchTemplateBlob(templateFilePath) ?? undefined
      }
      await exportDocx({ sections: getSections(), proposalTitle, templateBlob })
      setToastVisible(true)
      setTimeout(() => setToastVisible(false), 3000)
      // D-14: show one-time promotional nudge if no template configured and never dismissed
      if (
        !templateFilePath &&
        localStorage.getItem('template_nudge_dismissed') !== 'true'
      ) {
        setNudgeVisible(true)
      }
    } catch (err) {
      if (err instanceof ExportBlockedError) {
        setBlockedPlaceholders(err.placeholders)
        setModalOpen(true)
      } else {
        console.error('Export failed:', err)
      }
    } finally {
      setExporting(false)
    }
  }

  async function handleForceExport() {
    setModalOpen(false)
    setExporting(true)
    try {
      let templateBlob: Blob | undefined
      if (templateFilePath) {
        templateBlob = await fetchTemplateBlob(templateFilePath) ?? undefined
      }
      await exportDocx({ sections: getSections(), proposalTitle, force: true, templateBlob })
      setToastVisible(true)
      setTimeout(() => setToastVisible(false), 3000)
      // D-14: show one-time promotional nudge if no template configured and never dismissed
      if (
        !templateFilePath &&
        localStorage.getItem('template_nudge_dismissed') !== 'true'
      ) {
        setNudgeVisible(true)
      }
    } catch (err) {
      console.error('Force export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => !exporting && setOpen(prev => !prev)}
          disabled={exporting}
          className="text-sm font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
        >
          {exporting ? 'Exporting...' : 'Export'}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-lg shadow-md z-10 overflow-hidden py-1">
            <button
              onClick={handleExport}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Export to Word
            </button>
          </div>
        )}
      </div>

      {toastVisible && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg shadow-xl z-50 pointer-events-none whitespace-nowrap">
          Proposal exported successfully.
        </div>
      )}

      {nudgeVisible && (
        <div
          role="dialog"
          aria-label="Template branding tip"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Match your firm's branding</p>
              <p className="mt-1 text-sm text-gray-600">
                Want exports to match your firm's formatting? Upload a Word template in Settings
                and every export will use your styles automatically.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => {
                    handleNudgeDismiss()
                    navigate('/settings?tab=Templates')
                  }}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Open Settings
                </button>
                <button
                  onClick={handleNudgeDismiss}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Maybe later
                </button>
              </div>
            </div>
            <button
              onClick={handleNudgeDismiss}
              aria-label="Dismiss"
              className="text-gray-400 hover:text-gray-600 shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <ExportBlockedModal
          placeholders={blockedPlaceholders}
          onClose={() => setModalOpen(false)}
          onForce={handleForceExport}
          onResolve={(item) => {
            setModalOpen(false)
            const target =
              document.querySelector<HTMLElement>(`[data-placeholder-id="${item.id}"]`) ??
              document.getElementById(item.section_key)
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
        />
      )}
    </>
  )
}

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const OVERRIDES_KEY = `draft-overrides-${id}`
  const [generating] = useState(false)
  const [_acceptedOverrides, setAcceptedOverrides] = useState<Record<string, ContentBlock[]>>(() => {
    try {
      const stored = sessionStorage.getItem(`draft-overrides-${id}`)
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })
  const [_flashSectionId, setFlashSectionId] = useState<string | null>(null)
  const [isCondensed, setIsCondensed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null)
  const [_lastResolution, setLastResolution] = useState<'accepted' | 'declined' | null>(null)

  const { proposals, loading: proposalsLoading, updateStatus } = useProposals()
  const { openModal, showToast } = useProposalModal()
  const { profile, user } = useAuth()
  const { setSidebarNode } = useSidebar()
  const proposal = proposals.find(p => p.id === id)

  // Fetch proposal_sections from Supabase for SectionWorkspace
  const [proposalSections, setProposalSections] = useState<Array<{
    id: string
    section_key: string
    name: string | null
    position: number | null
    content: string
    is_locked: boolean
    status: string
    last_saved_content: string | null
    compliance_flags: ComplianceFlag[] | null
  }>>([])
  const [sectionsLoaded, setSectionsLoaded] = useState(false)
  const [templateName, setTemplateName] = useState<string | null>(null)
  const [templateFilePath, setTemplateFilePath] = useState<string | null>(null)
  // Latches true the first time proposal_sections come back with any non-empty content.
  // Drives a key prop on SectionWorkspace so it remounts cleanly when content arrives —
  // necessary because SectionWorkspace's own init effect only re-runs on proposalId change
  // (see SectionWorkspace.tsx init effect dep array), and React 18 sometimes batches the
  // post-generation refetch's setSectionsLoaded(false→true) so the conditional render
  // never flickers, leaving editors stuck with their empty initial content.
  const [contentLatched, setContentLatched] = useState(false)
  useEffect(() => {
    if (contentLatched) return
    if (proposalSections.some(s => (s.content ?? '').trim().length > 0)) {
      setContentLatched(true)
    }
  }, [proposalSections, contentLatched])

  // Fetch-race guard: proposal_sections is read from both this mount-effect and
  // refetchSections below. Without a sequence guard, an out-of-order network response
  // from an earlier fetch could land AFTER a later one and overwrite proposalSections
  // with stale data — including data from before an accepted edit. Only the response
  // matching the CURRENT sequence number is applied.
  const sectionsFetchSeqRef = useRef(0)

  useEffect(() => {
    if (!id) return
    setSectionsLoaded(false)
    const seq = ++sectionsFetchSeqRef.current
    supabase
      .from('proposal_sections')
      .select('id, section_key, name, position, content, is_locked, status, last_saved_content, compliance_flags')
      .eq('proposal_id', id)
      .order('position', { ascending: true })
      .then(({ data }) => {
        if (seq !== sectionsFetchSeqRef.current) return  // superseded by a newer fetch
        if (data && data.length > 0) {
          setProposalSections(data as any)
        }
        setSectionsLoaded(true)
      })
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      // The wizard writes selected_template_id with a direct UPDATE that never reaches
      // ProposalsContext, so the context row is still null when we land here straight
      // from Generate. Fall back to reading the column off the proposal row itself —
      // otherwise the whole style-swap step is skipped silently on that path.
      let templateId = (proposal as any)?.selected_template_id as string | null | undefined
      if (!templateId) {
        const { data, error } = await supabase
          .from('proposals')
          .select('selected_template_id')
          .eq('id', id)
          .single()
        if (error) {
          console.error('[ProposalDetail] failed to read selected_template_id:', error)
          return
        }
        templateId = data?.selected_template_id
      }
      if (!templateId || cancelled) return

      const { data, error } = await supabase
        .from('templates')
        .select('name, file_path, source')
        .eq('id', templateId)
        .single()
      if (cancelled) return
      if (error) {
        console.error('[ProposalDetail] failed to load template', templateId, error)
        return
      }
      if (data?.name) setTemplateName(data.name)
      // D-11: only uploaded DOCX templates are eligible for style extraction
      if (
        data?.source === 'uploaded' &&
        data?.file_path?.toLowerCase().endsWith('.docx')
      ) {
        setTemplateFilePath(data.file_path)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, (proposal as any)?.selected_template_id])

  // Phase 9: editor refs for chat injection
  const editorRefsMap = useRef<Map<string, SectionEditorHandle>>(new Map())
  const consistencyCheckRef = useRef<(() => void) | null>(null)
  const [pendingActionsCount, setPendingActionsCount] = useState(0)
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null)

  // Wire pendingActionsCount into Sidebar badge via SidebarContext
  useEffect(() => {
    setSidebarNode(<Sidebar pendingActionsCount={pendingActionsCount} />)
    return () => setSidebarNode(null)
  }, [pendingActionsCount, setSidebarNode])

  const { activeProposalId, claimGeneration, generatingProposalId, generation } = useGeneration()
  const {
    state: genState,
    dispatch: genDispatch,
    generateAll,
    regenerateSection,
    stopGeneration,
    resumeGeneration,
    sortedSections: sortedGenSections,
  } = generation

  // Bind the shared instance to this proposal. This MUST live in an effect, not in
  // render or a useMemo — claimGeneration sets state in the provider, and calling it
  // during render triggers "Cannot update a component while rendering a different
  // component".
  // `generatingProposalId` is in the deps so a REFUSED claim is retried. claimGeneration
  // returns false while a different proposal is mid-generation, and without this the
  // refusal was permanent for the life of the page: the effect would not re-run, so this
  // proposal could never take the binding even after the other generation finished. A
  // re-claim by the proposal that already holds it is a no-op (`prev === proposalId`).
  useEffect(() => {
    if (id) claimGeneration(id)
  }, [id, claimGeneration, generatingProposalId])

  // Refused only while a *different* proposal is mid-generation.
  const hasClaim = !generatingProposalId || generatingProposalId === id

  const sectionTitles = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of proposalSections) {
      map[s.section_key] = s.name ?? s.section_key.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }
    return map
  }, [proposalSections])

  const getLiveSections = useCallback((): ExportSection[] => {
    return proposalSections.map(s => ({
      name: s.name,
      section_key: s.section_key,
      content: editorRefsMap.current.get(s.section_key)?.getContent() ?? s.content,
    }))
  }, [proposalSections])

  // Targeted in-memory sync — called after an accepted edit persists so `proposalSections`
  // (the seed source SectionWorkspace re-seeds editors from on remount) never goes stale.
  // Deliberately NOT a refetch: a DB read here could race the autosave debounce and read
  // stale content, clobbering the very update we're trying to preserve.
  const handleSectionContentPersisted = useCallback((sectionKey: string, html: string) => {
    setProposalSections(prev =>
      prev.map(s => (s.section_key === sectionKey ? { ...s, content: html } : s))
    )
  }, [])

  const refetchSections = useCallback(() => {
    if (!id) return
    const seq = ++sectionsFetchSeqRef.current
    supabase
      .from('proposal_sections')
      .select('id, section_key, name, position, content, is_locked, status, last_saved_content, compliance_flags')
      .eq('proposal_id', id)
      .order('position', { ascending: true })
      .then(({ data }) => {
        if (seq !== sectionsFetchSeqRef.current) return  // superseded by a newer fetch
        if (data && data.length > 0) {
          setProposalSections(data as any)
        }
        setSectionsLoaded(true)
      })
  }, [id])

  // Re-fetch sections from Supabase after generation completes — gate SectionWorkspace off until fresh data arrives
  useEffect(() => {
    if (!id || genState?.isGenerating || genState?.completedCount === 0) return
    setSectionsLoaded(false)
    refetchSections()
  }, [id, genState?.completedCount, genState?.isGenerating, refetchSections])

  // ── Which section data THIS proposal's view is derived from ──────────────────
  //
  // The shared generation state belongs to `activeProposalId`. Opening proposal B while
  // A is mid-generation leaves B's claim refused (GenerationContext.claimGeneration),
  // and the claim only ever runs post-render anyway — so reading genState unconditionally
  // made B render A's phase: B's Export and workspace hidden behind a "generating" header
  // describing work that is not B's. Spec D-4 requires a proposal opened while another
  // generates to render its OWN data-derived view, so when the shared state isn't ours we
  // fall back to this proposal's locally fetched rows with isGenerating false. Same
  // content test either way (rowToSectionState/derivePhase both key off content).
  const ownsGenerationState = activeProposalId === id
  // The single predicate every generation entry point gates on.
  //
  // The three guards on this branch were each added to close the defect in front of it,
  // so they diverged: the auto-trigger tested binding identity (`ownsGenerationState`)
  // while Generate and Resume tested global busy-ness (`hasClaim`). The two agree in
  // every steady state, and the window where they disagree is sub-frame — but "agree in
  // practice" is not the same property as "cannot disagree", and a later reader has no
  // way to tell which term was the load-bearing one at each site. Both terms are needed:
  // `ownsGenerationState` says the shared instance is bound HERE (so `generateAll` will
  // fetch this proposal's rows), `hasClaim` says nothing else is mid-run.
  const canDriveGeneration = ownsGenerationState && hasClaim
  const localSectionStates = useMemo(
    () => proposalSections.map(s => rowToSectionState({ ...s, role: null })),
    [proposalSections]
  )
  const viewSections = ownsGenerationState ? sortedGenSections : localSectionStates
  // The reducer state this view renders from: the shared one when it is ours, otherwise a
  // content-derived stand-in built from this proposal's own rows, so nothing downstream —
  // header, controls, or the streaming renderer — can display another proposal's sections.
  const viewGenState = useMemo(
    () =>
      ownsGenerationState
        ? genState
        : {
            ...genState,
            isGenerating: false,
            sections: Object.fromEntries(localSectionStates.map(s => [s.id, s])),
            completedCount: localSectionStates.filter(s => hasContent(s.finalContent)).length,
            totalCount: localSectionStates.length,
          },
    [ownsGenerationState, genState, localSectionStates]
  )
  const viewTotalCount = viewGenState.totalCount

  const phase = derivePhase(viewGenState.isGenerating, viewSections, viewTotalCount)
  // Progress for the generating/paused header. NOT genState.completedCount: hydration
  // dispatches START_GENERATION (which hardcodes completedCount: 0) then
  // GENERATION_COMPLETE (which never restores it), so after any reload a paused proposal
  // announced "0 of 9 sections — 0%" next to its Resume button while derivePhase — which
  // reads finalContent — correctly reported paused. Content is the truthful source.
  // During an active generation this is identical to genState.completedCount: both move
  // on SECTION_COMPLETE.
  const completedSectionCount = viewSections.filter(s => hasContent(s.finalContent)).length
  // Equivalent to `ownsGenerationState && genState.isGenerating` (derivePhase returns
  // 'generating' exactly when its first argument is true), stated via phase so the header
  // can never show A's Stop button over B.
  const isGeneratingHere = phase === 'generating'
  // Derived from section content, not from a per-tab sessionStorage flag. The old flag
  // was set true whenever section ROWS existed — regardless of whether any of them had
  // content — which is why a stopped proposal reloaded announcing itself as "Generated"
  // with 8 of 9 sections empty and Export as its only control.
  const generated = phase === 'complete'
  // What the chat panel actually needs to know: is there written content to edit? Gating
  // it on `generated` (complete only) made AIChatPanel refuse every message in the paused
  // phase with "generate the proposal draft first" — false for a proposal with real
  // written sections, and the panel renders in that phase regardless.
  const draftHasWrittenContent = phase === 'complete' || phase === 'paused'
  // Widened from `genState.isGenerating` alone. stopGeneration dispatches
  // GENERATION_COMPLETE, so without 'paused' the entire header — Resume included —
  // unmounts the instant Stop is pressed.
  const isStreamingMode = phase === 'generating' || phase === 'paused'
  const existingDocs: MockDoc[] = id ? (docsByProposal[id] ?? []) : []

  const rfpDoc = existingDocs.find(d => d.type === 'rfp')?.name ?? 'RFP Document'
  const kickoffDoc = existingDocs.find(d => d.type === 'kickoff')?.name ?? null
  const otherDoc = existingDocs.find(d => d.type === 'other')?.name ?? null
  const draftSections = useMemo(
    () => proposal ? generateProposalDraft(proposal, rfpDoc, kickoffDoc, otherDoc) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  )

// Condense header once user scrolls 100px into the content area
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setIsCondensed(el.scrollTop > 100)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const buildProposalInput = useCallback((): GenerateSectionPayloadV2['proposalContext'] => {
    // services is stored as JSON in proposal.description by the wizard.
    // geography (countries) now comes from the real proposals.geography column (Phase 14.5);
    // the legacy description.regions blob key is retired.
    const meta: { services?: string[]; investigationalProduct?: string; investigationalProductUndisclosed?: boolean } = (() => {
      try { return JSON.parse(proposal?.description ?? '{}') } catch { return {} }
    })()
    return {
      studyInfo: {
        sponsorName: proposal?.client ?? '',
        therapeuticArea: proposal?.therapeuticArea ?? '',
        indication: proposal?.indication ?? '',
        investigationalProduct: meta.investigationalProduct ?? '',
        investigationalProductUndisclosed: meta.investigationalProductUndisclosed ?? false,
        studyPhase: proposal?.studyType ?? '',
        countries: proposal?.geography ?? [],
        dueDate: proposal?.dueDate ?? '',
        services: meta.services ?? [],
      },
      assumptions: [],
      services: meta.services ?? [],
    }
  }, [proposal])

  // Auto-trigger generation when navigated from wizard with ?generate=true
  // Must be before early returns to satisfy Rules of Hooks
  useEffect(() => {
    // `canDriveGeneration`'s ownership term is the load-bearing guard, not a nicety.
    // `generateAll` closes
    // over the provider's `activeProposalId`, so until the claim for THIS proposal has
    // committed it is still bound to whichever proposal was viewed before. Firing then
    // fetched that proposal's rows and streamed this proposal's study context into them —
    // overwriting sections it had already completed. The gate and the callback are read
    // from the same render, so the trigger can only fire on a render where `generateAll`
    // is bound here; it does not depend on this effect running after the claim effect.
    //
    // A refused claim (another proposal genuinely generating) skips the whole block,
    // ?generate=true included — the intent is held in the URL, not swallowed, and the
    // claim effect above retries when that generation ends.
    if (canDriveGeneration && searchParams.get('generate') === 'true' && proposal && !genState.isGenerating && genState.completedCount === 0) {
      const input = buildProposalInput()
      generateAll(input)
      // Clear ?generate=true through the router (NOT window.history.replaceState, which
      // does not update react-router's searchParams — leaving this guard permanently
      // satisfied and letting dependency-identity changes re-fire the trigger). The
      // hook's own re-entrancy guard is the primary defence; this is defence-in-depth.
      setSearchParams({}, { replace: true })
    }
  }, [canDriveGeneration, proposal, searchParams, setSearchParams, buildProposalInput, generateAll, genState.isGenerating, genState.completedCount])

  const handleSuggestionAccepted = useCallback((commandKey: string) => {
    const command = COMMAND_MAP[commandKey]
    if (command) {
      setAcceptedOverrides(prev => {
        const next = { ...prev, [command.targetId]: command.acceptedBlocks }
        try { sessionStorage.setItem(OVERRIDES_KEY, JSON.stringify(next)) } catch { /* ignore */ }
        return next
      })
      setFlashSectionId(command.targetId)
      setTimeout(() => setFlashSectionId(null), 1200)
    }
    setPendingSuggestion(null)
    setLastResolution('accepted')
    showToast('Draft updated')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [OVERRIDES_KEY])

  const handleSuggestionDeclined = useCallback(() => {
    setPendingSuggestion(null)
    setLastResolution('declined')
  }, [])


  if (proposalsLoading) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Proposal not found.</p>
        <button onClick={() => navigate('/proposals')} className="mt-4 text-jamo-500 hover:underline text-sm">
          Back to proposals
        </button>
      </div>
    )
  }

  function handleGenerate() {
    const input = buildProposalInput()
    generateAll(input)
  }

  function handleRegenerate(sectionId: string) {
    const input = buildProposalInput()
    regenerateSection(sectionId, input)
  }

  // Never regenerate a section that has content: Start-over confirms before
  // overwriting written work; Resume (wired separately) does not need to, since it
  // only ever loops over the still-empty sections.
  function handleGenerateOrStartOver() {
    if (!canDriveGeneration) {
      window.alert(
        'Another proposal is still generating. Stop it before starting generation here.'
      )
      return
    }
    if (phase === 'paused' || phase === 'complete') {
      const ok = window.confirm(
        'Start over? This regenerates every section and replaces the ones already written. Use Resume to keep them.'
      )
      if (!ok) return
    }
    handleGenerate()
  }

  return (
    <SectionWorkspaceProvider>
    {genState.creditsExhausted && (
      <div role="alert" className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-300 text-red-900 px-4 py-2.5 rounded-lg shadow-md text-sm flex items-center gap-3 max-w-xl">
        <svg className="w-5 h-5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <div>
          <p className="font-semibold">AI credits exhausted</p>
          <p className="text-red-800">Proposal generation paused. An admin needs to top up the Anthropic account before you can continue.</p>
        </div>
      </div>
    )}
    <div data-testid="proposal-detail" className="flex gap-5 flex-1 min-h-0" style={{ height: 'calc(100vh - 4rem)' }}>

      {/* ── Left: flex-col wrapper so header sits above the scroll area ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">

        {/* ── Condensing header — lives outside the scroll container ── */}
        <div className={`shrink-0 bg-white z-10 rounded-lg border border-gray-100 transition-all duration-300 ${
          isCondensed ? 'shadow-md' : ''
        }`}>

          {/* Condensed bar: single horizontal row, fades in on scroll */}
          <div className={`flex items-center gap-3 px-6 overflow-hidden transition-all duration-300 ${
            isCondensed ? 'max-h-16 py-3.5 opacity-100' : 'max-h-0 py-0 opacity-0 pointer-events-none'
          }`}>
            <button
              onClick={() => navigate('/proposals')}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors shrink-0 px-2 py-1.5 rounded-lg"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Back
            </button>
            <span className="w-px h-4 bg-gray-200 shrink-0" />
            <span className="flex-1 text-sm font-semibold text-gray-900 truncate min-w-0">
              {proposal.title}
            </span>
            <span className="text-sm font-bold text-gray-900 shrink-0 tabular-nums">
              {formatCurrency(proposal.value)}
            </span>
            <button
              onClick={() => openModal(proposal)}
              className="inline-flex items-center text-xs font-medium text-gray-500 bg-white border border-gray-200 hover:border-gray-300 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
            >
              Edit Proposal
            </button>
          </div>

          {/* Expanded header: Back link + full metadata, fades out on scroll */}
          <div className={`transition-all duration-300 ${
            isCondensed ? 'max-h-0 opacity-0 pointer-events-none overflow-hidden' : 'max-h-96 opacity-100 overflow-visible'
          }`}>
            {/* Back row */}
            <div className="px-6 pt-4 pb-1">
              <button
                onClick={() => navigate('/proposals')}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors px-3 py-1.5 rounded-lg"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
                Back to Proposals
              </button>
            </div>

            {/* Metadata row */}
            <div className="px-6 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <StatusSelector
                      status={proposal.status}
                      onChange={async (next) => {
                        await updateStatus(proposal.id, next)
                        showToast(`Status updated to ${STATUS_LABELS[next]}`)
                      }}
                      variant="labeled"
                    />
                    <ProposalReferenceControl
                      proposalId={proposal.id}
                      status={proposal.status}
                      value={proposal.reference_override ?? null}
                      disabled={!(profile?.role === 'admin' || profile?.role === 'super_admin')}
                    />
                    {profile?.role === 'super_admin' && (
                      <SaveAsDemoFixtureButton
                        proposalId={proposal.id}
                        role={profile?.role ?? null}
                        orgId={profile?.org_id ?? null}
                      />
                    )}
                    <span className="text-xs text-gray-400">{proposal.id.toUpperCase()}</span>
                  </div>
                  <h1 className="text-xl font-bold text-gray-900">{proposal.title}</h1>
                  <p className="text-sm text-gray-500 mt-1">{proposal.client} · {proposal.studyType}</p>
                </div>
                <div className="flex flex-col items-end gap-3 shrink-0">
                  <button
                    onClick={() => openModal(proposal)}
                    className="inline-flex items-center text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Edit Proposal
                  </button>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(proposal.value)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Proposal value</p>
                  </div>
                </div>
              </div>

              {/* TA / Due Date / Created */}
              <div className="flex items-center gap-5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                <span>
                  <span className="font-semibold text-gray-400 uppercase tracking-wide text-[10px] mr-1.5">TA</span>
                  {proposal.therapeuticArea}
                </span>
                <span>
                  <span className="font-semibold text-gray-400 uppercase tracking-wide text-[10px] mr-1.5">Due</span>
                  {formatDate(proposal.dueDate)}
                </span>
                <span>
                  <span className="font-semibold text-gray-400 uppercase tracking-wide text-[10px] mr-1.5">Created</span>
                  {formatDate(proposal.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* end condensing header */}

        {/* ── Scroll area: fills remaining height in the flex-col ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-w-0 pr-1">

          {/* Context & Documents */}
          <div className="mt-5 bg-white rounded-xl border border-gray-200 p-6">
            <div className="mb-5">
              <h2 className="font-semibold text-gray-900">Context & Documents</h2>
              <p className="text-xs text-gray-500 mt-0.5">All inputs used to generate this proposal</p>
            </div>
            {id && (
              <>
                <FileUpload proposalId={id} />
                <div className="mt-4">
                  <DocumentList proposalId={id} />
                </div>
              </>
            )}
          </div>

          {/* AI Generation */}
          <div className="mt-5 bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">AI-Generated Proposal Draft</h2>
                <p className="text-xs text-gray-500 mt-0.5">Based on RFP context and your template</p>
              </div>
              {!isStreamingMode && !generated && (
                <button
                  onClick={handleGenerateOrStartOver}
                  disabled={generating}
                  className="flex items-center gap-2 bg-jamo-500 hover:bg-jamo-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {generating ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                      </svg>
                      Generate with AI
                    </>
                  )}
                </button>
              )}
              {generated && !isStreamingMode && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    Generated
                  </span>
                  <ExportDropdown getSections={getLiveSections} proposalTitle={proposal?.title ?? ''} templateFilePath={templateFilePath} />
                  <button
                    onClick={() => consistencyCheckRef.current?.()}
                    className="text-sm font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Run consistency check
                  </button>
                </div>
              )}
            </div>

            {/* Streaming mode: GenerationHeader + GenerationControls + streaming renderer */}
            {isStreamingMode && (
              <>
                <GenerationHeader
                  isGenerating={isGeneratingHere}
                  phase={phase}
                  completedCount={completedSectionCount}
                  totalCount={viewTotalCount}
                  onStop={stopGeneration}
                  onResume={() => {
                    if (!canDriveGeneration) {
                      window.alert('Another proposal is still generating. Stop it first.')
                      return
                    }
                    resumeGeneration(buildProposalInput())
                  }}
                />
                <GenerationControls
                  tone={genState.tone}
                  onToneChange={(tone) => genDispatch({ type: 'SET_TONE', tone })}
                  isGenerating={isGeneratingHere}
                  // Tone is the one control that reads and writes the SHARED reducer
                  // directly. `isGeneratingHere` is false on a page that does not own the
                  // run, so without the ownership term the toggle stayed live on proposal
                  // B while A generated — and state.tone is a streamSection dependency
                  // that goes into the payload, so flipping it here restyled A's
                  // remaining sections mid-run.
                  toneDisabled={isGeneratingHere || !ownsGenerationState}
                  onGenerate={handleGenerateOrStartOver}
                  hasCompleted={completedSectionCount === viewTotalCount && !isGeneratingHere}
                />
                <ProposalDraftRenderer
                  mode="streaming"
                  sections={draftSections}
                  generationState={viewGenState}
                  onRegenerate={handleRegenerate}
                  onRetry={handleRegenerate}
                  hideNav={false}
                  pendingSuggestion={pendingSuggestion}
                  onSuggestionAccepted={handleSuggestionAccepted}
                  onSuggestionDeclined={handleSuggestionDeclined}
                  scrollMarginClass="scroll-mt-4"
                />
              </>
            )}

            {!isStreamingMode && !generated && !generating && (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-12 text-center">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <p className="text-sm text-gray-400">Click "Generate with AI" to draft this proposal</p>
              </div>
            )}

            {!isStreamingMode && generating && (
              <div className="border border-gray-100 rounded-lg p-8 text-center">
                <svg className="w-8 h-8 text-jamo-400 mx-auto mb-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-sm text-gray-500">Analyzing RFP context and drafting proposal…</p>
              </div>
            )}

            {!isStreamingMode && generated && sectionsLoaded && (
              <div className="border border-gray-100 rounded-lg bg-white">
                {templateName && (
                  <div className="px-4 pt-3 pb-1 border-b border-gray-100">
                    <span className="text-xs text-gray-400 font-medium">
                      Template: <span className="text-gray-500">{templateName}</span>
                    </span>
                  </div>
                )}
                <SectionWorkspace
                  key={contentLatched ? 'loaded' : 'empty'}
                  proposalId={id ?? ''}
                  sections={proposalSections.map(s => ({
                    id: s.id,
                    section_key: s.section_key,
                    content: s.content ?? '',
                    is_locked: s.is_locked ?? false,
                    status: s.status ?? 'missing',
                    last_saved_content: s.last_saved_content ?? null,
                    compliance_flags: s.compliance_flags ?? null,
                    name: s.name ?? s.section_key,
                    position: s.position ?? 99,
                  }))}
                  orgId={profile?.org_id ?? user?.user_metadata?.org_id ?? ''}
                  editorRefsRef={editorRefsMap}
                  onActiveSectionChange={setActiveSectionKey}
                  externalScrollRef={scrollRef as React.RefObject<HTMLDivElement>}
                  consistencyCheckRef={consistencyCheckRef}
                  onSectionContentPersisted={handleSectionContentPersisted}
                />
              </div>
            )}
          </div>

          <div className="h-8" />
        </div>
        {/* end scroll area */}

      </div>
      {/* end left column */}

      {/* ── Right: AI chat panel (self-sizing) ── */}
      <AIChatPanel
        draftGenerated={draftHasWrittenContent}
        proposalId={id ?? ''}
        orgId={profile?.org_id ?? user?.user_metadata?.org_id ?? ''}
        sections={proposalSections ?? []}
        editorRefs={editorRefsMap}
        activeSectionKey={activeSectionKey}
        onEditAccepted={handleSectionContentPersisted}
        onPendingActionsCountChange={setPendingActionsCount}
        sectionTitles={sectionTitles}
        onSectionFocusChange={setActiveSectionKey}
      />

    </div>
    </SectionWorkspaceProvider>
  )
}
