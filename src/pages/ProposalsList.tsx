import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Proposal, ProposalStatus } from '../types/proposal'
import { useArchived } from '../context/ArchivedContext'
import { useProposals } from '../context/ProposalsContext'
import { useDeleted, isWithin30Days } from '../context/DeletedContext'
import { useProposalModal } from '../context/ProposalModalContext'
import { supabase } from '../lib/supabase'

const DEMO_NOW = new Date('2026-02-26T12:00:00')

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft:     'Draft',
  in_review: 'In Review',
  submitted: 'Submitted',
  won:       'Won',
  lost:      'Lost',
}

const STATUS_COLORS: Record<ProposalStatus, string> = {
  draft:     'bg-gray-100 text-gray-600',
  in_review: 'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  won:       'bg-green-100 text-green-700',
  lost:      'bg-red-100 text-red-600',
}


const STATUS_FILTER_OPTIONS: { label: string; value: ProposalStatus | null }[] = [
  { label: 'All Statuses', value: null },
  { label: 'Draft',        value: 'draft' },
  { label: 'In Review',    value: 'in_review' },
  { label: 'Submitted',    value: 'submitted' },
  { label: 'Won',          value: 'won' },
  { label: 'Lost',         value: 'lost' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getUrgencyTag(dueDate: string) {
  const diffH = (new Date(dueDate).getTime() - DEMO_NOW.getTime()) / 3_600_000
  if (diffH >= 0 && diffH <= 72) {
    const days = Math.ceil(diffH / 24)
    return { urgent: true, label: `Due in ${days} day${days !== 1 ? 's' : ''}` }
  }
  return { urgent: false, label: '' }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProposalsList() {
  const navigate = useNavigate()

  const [taFilter,              setTaFilter]              = useState('All')
  const [statusFilter,          setStatusFilter]          = useState<ProposalStatus | null>(null)
  const [view,                  setView]                  = useState<'active' | 'archived' | 'deleted'>('active')
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Proposal | null>(null)

  const { archivedIds, archive, restore } = useArchived()
  const { proposals, permanentlyDelete } = useProposals()
  const { deletedAt, deletedIds, deleteProposal, restoreFromTrash, purgeFromTrash } = useDeleted()
  const { openModal, showToast } = useProposalModal()

  const [templateNames, setTemplateNames] = useState<Record<string, string>>({})

  useEffect(() => {
    const templateIds = [...new Set(
      proposals
        .map(p => (p as any).selected_template_id)
        .filter(Boolean)
    )]
    if (templateIds.length === 0) return

    supabase
      .from('templates')
      .select('id, name')
      .in('id', templateIds)
      .then(({ data }) => {
        if (!data) return
        const names: Record<string, string> = {}
        for (const t of data) names[t.id] = t.name
        setTemplateNames(names)
      })
  }, [proposals])

  // Escape closes the permanent-delete confirmation
  useEffect(() => {
    if (!permanentDeleteTarget) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPermanentDeleteTarget(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [permanentDeleteTarget])

  const TA_FILTERS = useMemo(
    () => ['All', ...Array.from(new Set(proposals.map(p => p.therapeuticArea))).sort()],
    [proposals]
  )

  const viewProposals = proposals.filter(p => {
    if (view === 'deleted')  return deletedIds.has(p.id) && isWithin30Days(new Date(deletedAt[p.id]))
    if (view === 'archived') return archivedIds.has(p.id) && !deletedIds.has(p.id)
    return !archivedIds.has(p.id) && !deletedIds.has(p.id)
  })

  const filtered = viewProposals
    .filter(p => taFilter === 'All' || p.therapeuticArea === taFilter)
    .filter(p => !statusFilter || p.status === statusFilter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const filtersActive = taFilter !== 'All' || statusFilter !== null

  const rowActions =
    view === 'archived' ? ['Edit', 'Duplicate', 'Restore'] :
    view === 'deleted'  ? ['Restore', 'Permanently Delete'] :
    ['Edit', 'Duplicate', 'Archive']

  return (
    <>
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proposals</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <button
              onClick={() => setView('active')}
              className={`text-sm font-medium transition-colors ${
                view === 'active' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >Active</button>
            <span className="text-gray-200 select-none text-sm">|</span>
            <button
              onClick={() => setView('archived')}
              className={`text-sm font-medium transition-colors ${
                view === 'archived' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >Archived</button>
            <span className="text-gray-200 select-none text-sm">|</span>
            <button
              onClick={() => setView('deleted')}
              className={`text-sm font-medium transition-colors ${
                view === 'deleted' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >Deleted</button>
            <span className="text-sm text-gray-400">
              {filtered.length === viewProposals.length
                ? `${viewProposals.length} proposals`
                : `${filtered.length} of ${viewProposals.length}`}
            </span>
          </div>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Proposal
        </button>
      </div>

      {/* ── Deleted disclaimer ── */}
      {view === 'deleted' && (
        <div className="text-xs text-gray-400 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5">
          Items in Trash will be permanently deleted after 30 days.
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3.5 flex items-center gap-6">

        {/* TA chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {TA_FILTERS.map(ta => {
            const isActive = taFilter === ta
            return (
              <button
                key={ta}
                onClick={() => setTaFilter(ta)}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  isActive
                    ? 'bg-jamo-50 text-jamo-600 border-jamo-200 font-semibold'
                    : 'text-gray-500 border-gray-200 hover:text-gray-700'
                }`}
              >
                {ta}
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 shrink-0" />

        {/* Status pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTER_OPTIONS.map(opt => {
            const isActive = statusFilter === opt.value
            return (
              <button
                key={opt.label}
                onClick={() => setStatusFilter(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white border-gray-900 font-semibold'
                    : 'text-gray-500 border-gray-200 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Clear */}
        {filtersActive && (
          <button
            onClick={() => { setTaFilter('All'); setStatusFilter(null) }}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors shrink-0"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Rows ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Header — mirrors Tier 2 column widths exactly */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center">
          <div className="flex-1 min-w-0 flex items-center gap-6">
            <div className="flex-1 min-w-0 text-xs font-semibold text-gray-500 uppercase tracking-wide">Proposal</div>
            <div className="w-[140px] shrink-0 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sponsor</div>
          </div>
          <div className="flex items-center shrink-0 pl-8">
            <div className="w-36 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due Date</div>
            <div className="w-20 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</div>
            <div className="w-24 pl-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</div>
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            No proposals match the current filters.
          </div>
        )}

        {/* Data rows */}
        <div className="divide-y divide-gray-50">
          {filtered.map(p => {
            const urgency = getUrgencyTag(p.dueDate)
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/proposals/${p.id}`)}
                className="group flex items-center px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                {/* Tier 1 — static, never moves */}
                <div className="flex-1 min-w-0 flex items-center gap-6">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{p.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{p.therapeuticArea} · {p.studyType}</p>
                    {(p as any).selected_template_id && templateNames[(p as any).selected_template_id] && (
                      <span className="text-xs text-gray-400">
                        {templateNames[(p as any).selected_template_id]}
                      </span>
                    )}
                  </div>
                  <div className="w-[140px] shrink-0">
                    <span className="block truncate text-sm text-gray-700">{p.client}</span>
                  </div>
                </div>

                {/*
                  Right zone — fixed intrinsic width set by Tier 2 in normal flow.
                  Actions overlay absolutely on top; both layers crossfade via opacity only.
                  No width animation = Tier 1 never shifts.
                */}
                <div className="relative shrink-0 pl-8 flex items-center">

                  {/* Tier 2: Due Date + Value + Status — fades out on hover */}
                  <div className="flex items-center transition-opacity duration-200 opacity-100 group-hover:opacity-0 pointer-events-auto group-hover:pointer-events-none">
                    <div className="w-36">
                      {urgency.urgent ? (
                        <span className="inline-flex text-xs font-medium bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100">
                          {urgency.label}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">{formatDate(p.dueDate)}</span>
                      )}
                    </div>
                    <div className="w-20 text-right">
                      <span className="text-sm font-medium text-gray-900 tabular-nums">{formatCurrency(p.value)}</span>
                    </div>
                    <div className="w-24 pl-4 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>
                  </div>

                  {/* Actions — absolute overlay on the same lane, fades in on hover */}
                  <div className="absolute inset-0 flex items-center justify-end transition-opacity duration-200 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto z-10">
                    <div className="flex items-center gap-1.5">
                      {rowActions.map(action => {
                        const isRestore   = action === 'Restore'
                        const isPermanent = action === 'Permanently Delete'
                        const colorClass  = isRestore
                          ? 'text-jamo-500 hover:text-jamo-600'
                          : isPermanent
                            ? 'text-red-400 hover:text-red-600'
                            : 'text-gray-400 hover:text-gray-700'
                        return (
                          <button
                            key={action}
                            onClick={e => {
                              e.stopPropagation()
                              if (action === 'Edit') {
                                openModal(p)
                              } else if (action === 'Archive') {
                                archive(p.id)
                                showToast('Proposal Archived')
                              } else if (action === 'Restore' && view === 'archived') {
                                restore(p.id)
                                showToast('Proposal Restored')
                              } else if (action === 'Restore' && view === 'deleted') {
                                restoreFromTrash(p.id)
                                showToast('Proposal Restored')
                              } else if (action === 'Delete') {
                                deleteProposal(p.id)
                                showToast('Proposal moved to Trash')
                              } else if (action === 'Permanently Delete') {
                                setPermanentDeleteTarget(p)
                              }
                            }}
                            className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${colorClass}`}
                          >
                            {action}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                </div>
              </div>
            )
          })}
        </div>

      </div>

    </div>

    {/* ── Permanent delete confirmation ── */}

    {permanentDeleteTarget && (
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={() => setPermanentDeleteTarget(null)}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5"
          onClick={e => e.stopPropagation()}
        >
          {/* Icon + heading */}
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Delete Forever?</h2>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                This action cannot be undone. All data for{' '}
                <span className="font-medium text-gray-700">{permanentDeleteTarget.title}</span>{' '}
                will be permanently removed from jamo.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setPermanentDeleteTarget(null)}
              className="inline-flex items-center text-sm font-medium text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                permanentlyDelete(permanentDeleteTarget.id)
                purgeFromTrash(permanentDeleteTarget.id)
                showToast('Proposal permanently deleted')
                setPermanentDeleteTarget(null)
              }}
              className="inline-flex items-center text-sm font-medium text-white bg-red-500 px-3 py-1.5 rounded-lg transition-colors"
            >
              Delete Forever
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
