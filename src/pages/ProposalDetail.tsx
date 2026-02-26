import { useParams, useNavigate } from 'react-router-dom'
import { useState, useRef, useCallback, useEffect } from 'react'
import proposals from '../data/proposals.json'
import allDocuments from '../data/documents.json'
import type { Proposal, ProposalStatus } from '../types/proposal'
import type { PendingSuggestion } from '../types/draft'
import { generateProposalDraft } from '../data/proposalDraftData'
import ProposalDraftRenderer from '../components/ProposalDraftRenderer'
import AIChatPanel from '../components/AIChatPanel'

const allProposals = proposals as Proposal[]
const docsByProposal = allDocuments as Record<string, MockDoc[]>

interface MockDoc {
  id: string
  type: 'rfp' | 'kickoff' | 'template' | 'other'
  name: string
  size: string
  uploadedAt: string
}

const DOC_TYPE_LABELS: Record<MockDoc['type'], string> = {
  rfp: 'RFP',
  kickoff: 'Kick-off Call',
  template: 'Proposal Template',
  other: 'Supporting Document',
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function getFileExt(name: string) {
  return name.split('.').pop()?.toUpperCase() ?? 'FILE'
}

function DocIcon({ type }: { type: MockDoc['type'] }) {
  if (type === 'rfp') return (
    <svg className="w-6 h-6 text-jamo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
  if (type === 'kickoff') return (
    <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
  )
  if (type === 'template') return (
    <svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0 1 18 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C6 8.496 6.504 9 7.125 9h9.75c.621 0 1.125-.504 1.125-1.125V6.375c0-.621-.504-1.125-1.125-1.125H7.125C6.504 5.25 6 5.754 6 6.375v1.5" />
    </svg>
  )
  return (
    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
    </svg>
  )
}


// ── Export dropdown ────────────────────────────────────────────────────────────
// Clean, professional — no aurora or glassmorphism.

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
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null)
  const [lastResolution, setLastResolution] = useState<'accepted' | 'declined' | null>(null)

  const proposal = allProposals.find(p => p.id === id)
  const existingDocs: MockDoc[] = id ? (docsByProposal[id] ?? []) : []

  const rfpDoc = existingDocs.find(d => d.type === 'rfp')?.name ?? 'RFP Document'
  const kickoffDoc = existingDocs.find(d => d.type === 'kickoff')?.name ?? null
  const otherDoc = existingDocs.find(d => d.type === 'other')?.name ?? null
  const draftSections = proposal ? generateProposalDraft(proposal, rfpDoc, kickoffDoc, otherDoc) : []

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
    setGenerating(true)
    setTimeout(() => {
      setGenerating(false)
      setGenerated(true)
    }, 2200)
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    setUploadedFiles(prev => [...prev, ...Array.from(files)])
  }

  function removeUpload(index: number) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSuggestionAccepted = useCallback(() => {
    setPendingSuggestion(null)
    setLastResolution('accepted')
  }, [])

  const handleSuggestionDeclined = useCallback(() => {
    setPendingSuggestion(null)
    setLastResolution('declined')
  }, [])

  const handleResolutionConsumed = useCallback(() => {
    setLastResolution(null)
  }, [])

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* Back */}
      <button
        onClick={() => navigate('/proposals')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4 shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to Proposals
      </button>

      {/* Two-pane */}
      <div className="flex gap-5 flex-1 min-h-0">

        {/* ── Left: scrollable content ── */}
        <div className="flex-1 overflow-y-auto min-w-0 space-y-5 pr-1">

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
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
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(proposal.value)}</p>
            <p className="text-xs text-gray-400 mt-0.5">Proposal value</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Therapeutic Area</p>
            <p className="text-sm text-gray-800 mt-1">{proposal.therapeuticArea}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Due Date</p>
            <p className="text-sm text-gray-800 mt-1">{formatDate(proposal.dueDate)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Created</p>
            <p className="text-sm text-gray-800 mt-1">{formatDate(proposal.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Context & Documents */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-gray-900">Context & Documents</h2>
            <p className="text-xs text-gray-500 mt-0.5">All inputs used to generate this proposal</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 text-sm font-medium text-jamo-500 hover:text-jamo-600 border border-jamo-200 hover:border-jamo-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Upload Document
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
        </div>

        {/* Existing documents */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {existingDocs.map(doc => (
            <div key={doc.id} className="flex items-start gap-3 p-4 border border-gray-100 rounded-lg hover:border-gray-200 hover:bg-gray-50 transition-colors group">
              <div className="mt-0.5 shrink-0">
                <DocIcon type={doc.type} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{DOC_TYPE_LABELS[doc.type]}</span>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400">{doc.size}</span>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400">{getFileExt(doc.name)}</span>
                </div>
              </div>
              <button className="text-xs text-jamo-500 hover:text-jamo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                View
              </button>
            </div>
          ))}
        </div>

        {/* Uploaded files */}
        {uploadedFiles.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {uploadedFiles.map((file, i) => (
              <div key={i} className="flex items-start gap-3 p-4 border border-jamo-100 bg-jamo-50 rounded-lg group">
                <div className="mt-0.5 shrink-0">
                  <svg className="w-6 h-6 text-jamo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-jamo-400">Just uploaded</span>
                    <span className="text-jamo-200">·</span>
                    <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
                  </div>
                </div>
                <button
                  onClick={() => removeUpload(i)}
                  className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-jamo-400 bg-jamo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <svg className={`w-7 h-7 mx-auto mb-2 ${dragOver ? 'text-jamo-400' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm text-gray-400">
            Drop files here or <span className="text-jamo-500 font-medium">browse</span>
          </p>
          <p className="text-xs text-gray-300 mt-1">PDF, DOCX, XLSX, TXT supported</p>
        </div>
      </div>

      {/* AI Generation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">AI-Generated Proposal Draft</h2>
            <p className="text-xs text-gray-500 mt-0.5">Based on RFP context and your template</p>
          </div>
          {!generated && (
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
          {generated && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Generated
              </span>
              <ExportDropdown />
            </div>
          )}
        </div>

        {!generated && !generating && (
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-12 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p className="text-sm text-gray-400">Click "Generate with AI" to draft this proposal</p>
          </div>
        )}

        {generating && (
          <div className="border border-gray-100 rounded-lg p-8 text-center">
            <svg className="w-8 h-8 text-jamo-400 mx-auto mb-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm text-gray-500">Analyzing RFP context and drafting proposal…</p>
          </div>
        )}

        {generated && (
          <div className="border border-gray-100 rounded-lg p-6 bg-white">
            <ProposalDraftRenderer
              sections={draftSections}
              pendingSuggestion={pendingSuggestion}
              onSuggestionAccepted={handleSuggestionAccepted}
              onSuggestionDeclined={handleSuggestionDeclined}
            />
          </div>
        )}
      </div>

        </div>{/* end left pane */}

        {/* ── Right: AI chat panel (self-sizing) ── */}
        <AIChatPanel
            draftGenerated={generated}
            onCommand={setPendingSuggestion}
            onSuggestionResolved={handleResolutionConsumed}
            lastResolution={lastResolution}
          />

      </div>{/* end two-pane */}
    </div>
  )
}
