import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import proposals from '../data/proposals.json'
import type { Proposal, ProposalStatus } from '../types/proposal'

const allProposals = proposals as Proposal[]

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

// Matches the updated Dashboard values
const LAST_ACTIVITY: Record<string, string> = {
  'prop-001': '3 days ago',
  'prop-002': '2h ago',
  'prop-003': '2 days ago',
  'prop-004': '3 days ago',
  'prop-005': '4 days ago',
  'prop-006': '3 days ago',
  'prop-007': '3h ago',
  'prop-008': '1 week ago',
  'prop-009': '2h ago',
  'prop-010': '5h ago',
}

const TA_FILTERS = [
  'All',
  ...Array.from(new Set(allProposals.map(p => p.therapeuticArea))).sort(),
]

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

  const [taFilter,     setTaFilter]     = useState('All')
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | null>(null)

  const filtered = allProposals
    .filter(p => taFilter === 'All' || p.therapeuticArea === taFilter)
    .filter(p => !statusFilter || p.status === statusFilter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const filtersActive = taFilter !== 'All' || statusFilter !== null

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proposals</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length === allProposals.length
              ? `${allProposals.length} total proposals`
              : `${filtered.length} of ${allProposals.length} proposals`}
          </p>
        </div>
        <button className="flex items-center gap-2 bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Proposal
        </button>
      </div>

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

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Proposal</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Therapeutic Area</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Activity</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due Date</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400">
                  No proposals match the current filters.
                </td>
              </tr>
            )}
            {filtered.map(p => {
              const urgency = getUrgencyTag(p.dueDate)
              return (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/proposals/${p.id}`)}
                  className="group hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{p.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{p.studyType}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-700">{p.client}</td>
                  <td className="px-6 py-4 text-gray-700">{p.therapeuticArea}</td>
                  <td className="px-6 py-4 text-xs text-gray-400">{LAST_ACTIVITY[p.id] ?? '—'}</td>
                  <td className="px-6 py-4">
                    {urgency.urgent ? (
                      <span className="inline-flex text-xs font-medium bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100">
                        {urgency.label}
                      </span>
                    ) : (
                      <span className="text-gray-500">{formatDate(p.dueDate)}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(p.value)}</td>
                  <td className="px-6 py-4">
                    {/* Status badge ↔ hover actions */}
                    <div className="relative">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full transition-opacity group-hover:opacity-0 ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                      <div className="absolute inset-y-0 left-0 flex items-center gap-2.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                        {['Edit', 'Duplicate', 'Archive'].map(action => (
                          <button
                            key={action}
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-md transition-colors"
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}
