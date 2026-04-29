import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import allDocuments from '../data/documents.json'
import type { ProposalStatus } from '../types/proposal'
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
import { useProposalGeneration } from '../hooks/useProposalGeneration'
import { GenerationHeader } from '../components/GenerationHeader'
import { GenerationControls } from '../components/GenerationControls'
import type { GenerateSectionPayloadV2 } from '../types/generation'
import type { SectionEditorHandle, ComplianceFlag } from '../types/workspace'
import SectionWorkspace from '../components/editor/SectionWorkspace'
import { supabase } from '../lib/supabase'
import { detectGaps } from '../utils/chatContext'

const docsByProposal = allDocuments as Record<string, MockDoc[]>

interface MockDoc {
  id: string
  type: 'rfp' | 'kickoff' | 'template' | 'other'
  name: string
  size: string
  uploadedAt: string
}

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
}

const STATUS_COLORS: Record<ProposalStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  in_review: 'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-600',
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function formatDate(dateStr: string | undefined | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Export dropdown ────────────────────────────────────────────────────────────

function ExportDropdown() {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleExport() {
    setOpen(false)
    setExporting(true)
    setTimeout(() => {
      setExporting(false)
      setToastVisible(true)
      setTimeout(() => setToastVisible(false), 3000)
    }, 1200)
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
            <button
              onClick={handleExport}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Export to PowerPoint
            </button>
          </div>
        )}
      </div>

      {toastVisible && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg shadow-xl z-50 pointer-events-none whitespace-nowrap">
          Proposal exported successfully.
        </div>
      )}
    </>
  )
}

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const DRAFT_KEY = `draft-generated-${id}`
  const OVERRIDES_KEY = `draft-overrides-${id}`
  const [generating] = useState(false)
  const [generated, setGenerated] = useState(() => !!sessionStorage.getItem(DRAFT_KEY))
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

  const { proposals, loading: proposalsLoading } = useProposals()
  const { openModal, showToast } = useProposalModal()
  const { profile, user } = useAuth()
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

  useEffect(() => {
    if (!id) return
    setSectionsLoaded(false)
    supabase
      .from('proposal_sections')
      .select('id, section_key, name, position, content, is_locked, status, last_saved_content, compliance_flags')
      .eq('proposal_id', id)
      .order('position', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setProposalSections(data as any)
          setGenerated(true)
        }
        setSectionsLoaded(true)
      })
  }, [id])

  useEffect(() => {
    const templateId = (proposal as any)?.selected_template_id
    if (!templateId) return
    supabase
      .from('templates')
      .select('name')
      .eq('id', templateId)
      .single()
      .then(({ data }) => {
        if (data?.name) setTemplateName(data.name)
      })
  }, [(proposal as any)?.selected_template_id])

  // Phase 9: editor refs for chat injection
  const editorRefsMap = useRef<Map<string, SectionEditorHandle>>(new Map())
  const consistencyCheckRef = useRef<(() => void) | null>(null)
  const [gapCount, setGapCount] = useState(0)
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null)

  const { state: genState, dispatch: genDispatch, generateAll, regenerateSection, stopGeneration } = useProposalGeneration(id ?? '')

  const refetchSections = useCallback(() => {
    if (!id) return
    supabase
      .from('proposal_sections')
      .select('id, section_key, name, position, content, is_locked, status, last_saved_content, compliance_flags')
      .eq('proposal_id', id)
      .order('position', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setProposalSections(data as any)
          setGenerated(true)
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

  // Gap analysis — fires whenever proposalSections updates (after load or after regen)
  useEffect(() => {
    if (genState?.isGenerating) return
    if (!proposalSections?.length) return

    const sections = proposalSections.map(s => ({
      section_key: s.section_key,
      content: s.content ?? '',
      status: s.status ?? '',
    }))
    const gaps = detectGaps(sections)
    setGapCount(gaps.length)
  }, [genState?.isGenerating, proposalSections])

  const isStreamingMode = genState.isGenerating
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

  // Auto-trigger generation when navigated from wizard with ?generate=true
  // Must be before early returns to satisfy Rules of Hooks
  useEffect(() => {
    if (searchParams.get('generate') === 'true' && proposal && !genState.isGenerating && genState.completedCount === 0) {
      const input = buildProposalInput()
      generateAll(input)
      window.history.replaceState({}, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, searchParams])

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

  function buildProposalInput(): GenerateSectionPayloadV2['proposalContext'] {
    // services and regions are stored as JSON in proposal.description by the wizard
    const meta: { services?: string[]; regions?: string[] } = (() => {
      try { return JSON.parse(proposal?.description ?? '{}') } catch { return {} }
    })()
    return {
      studyInfo: {
        sponsorName: proposal?.client ?? '',
        therapeuticArea: proposal?.therapeuticArea ?? '',
        indication: proposal?.indication ?? '',
        studyPhase: proposal?.studyType ?? '',
        countries: meta.regions ?? [],
        dueDate: proposal?.dueDate ?? '',
        services: meta.services ?? [],
      },
      assumptions: [],
      services: meta.services ?? [],
    }
  }

  function handleGenerate() {
    const input = buildProposalInput()
    generateAll(input)
  }

  function handleRegenerate(sectionId: string) {
    const input = buildProposalInput()
    regenerateSection(sectionId, input)
  }

  return (
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
          <div className={`overflow-hidden transition-all duration-300 ${
            isCondensed ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-96 opacity-100'
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
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[proposal.status]}`}>
                      {STATUS_LABELS[proposal.status]}
                    </span>
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
                  onClick={handleGenerate}
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
                  <ExportDropdown />
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
                  isGenerating={genState.isGenerating}
                  completedCount={genState.completedCount}
                  totalCount={genState.totalCount}
                  onStop={stopGeneration}
                />
                <GenerationControls
                  tone={genState.tone}
                  onToneChange={(tone) => genDispatch({ type: 'SET_TONE', tone })}
                  isGenerating={genState.isGenerating}
                  onGenerate={handleGenerate}
                  hasCompleted={genState.completedCount === genState.totalCount && !genState.isGenerating}
                />
                <ProposalDraftRenderer
                  mode="streaming"
                  sections={draftSections}
                  generationState={genState}
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
        draftGenerated={generated}
        proposalId={id ?? ''}
        orgId={profile?.org_id ?? user?.user_metadata?.org_id ?? ''}
        sections={proposalSections ?? []}
        editorRefs={editorRefsMap}
        activeSectionKey={activeSectionKey}
        gapCount={gapCount}
        onGapsConsumed={() => setGapCount(0)}
        onEditAccepted={refetchSections}
      />

    </div>
  )
}
