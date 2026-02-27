import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import proposals from '../data/proposals.json'
import type { Proposal, ProposalStatus } from '../types/proposal'

const allProposals = proposals as Proposal[]

// Fixed demo date for urgency calculations
const DEMO_NOW = new Date('2026-02-26T12:00:00')

// Weighted pipeline multiplier (matches the computed 67% win rate from data)
const WIN_RATE = 0.67

const PIPELINE_STAGES: { label: string; statuses: ProposalStatus[] }[] = [
  { label: 'RFP Received', statuses: ['draft'] },
  { label: 'In Review',   statuses: ['in_review'] },
  { label: 'Submitted',   statuses: ['submitted'] },
  { label: 'Won',         statuses: ['won'] },
  { label: 'Lost',        statuses: ['lost'] },
]

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

// Mock last-activity labels per proposal
const LAST_ACTIVITY: Record<string, string> = {
  'prop-001': '3 days ago',
  'prop-002': '2h ago',
  'prop-003': '1h ago',
  'prop-004': 'Yesterday',
  'prop-005': '4 days ago',
  'prop-006': 'Yesterday',
  'prop-007': '3h ago',
  'prop-008': '1 week ago',
  'prop-009': '2h ago',
  'prop-010': '5h ago',
}

// Dynamic TA filter tabs derived from data
const TA_FILTERS = [
  'All',
  ...Array.from(new Set(allProposals.map(p => p.therapeuticArea))).sort(),
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function getUrgencyTag(dueDate: string) {
  const due    = new Date(dueDate)
  const diffMs = due.getTime() - DEMO_NOW.getTime()
  const diffH  = diffMs / 3_600_000
  if (diffH >= 0 && diffH <= 72) {
    const days = Math.ceil(diffH / 24)
    return { urgent: true, label: `Due in ${days} day${days !== 1 ? 's' : ''}` }
  }
  return { urgent: false, label: '' }
}

function getStats() {
  const active   = allProposals.filter(p => p.status !== 'lost').length
  const decided  = allProposals.filter(p => p.status === 'won' || p.status === 'lost').length
  const won      = allProposals.filter(p => p.status === 'won').length
  const winRate  = decided > 0 ? Math.round((won / decided) * 100) : 0
  const pipeline = allProposals.filter(p => p.status !== 'lost').reduce((s, p) => s + p.value, 0)
  const weighted = Math.round(pipeline * WIN_RATE)
  return { active, winRate, pipeline, weighted }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, weighted }: {
  label: string; value: string; sub: string; accent: string; weighted?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-1">
      <span className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>{label}</span>
      <span className="text-3xl font-bold text-gray-900">{value}</span>
      <span className="text-sm text-gray-500">{sub}</span>
      {weighted && <span className="text-xs text-gray-400 font-medium mt-0.5">{weighted}</span>}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const stats = getStats()

  const [taFilter,     setTaFilter]     = useState('All')
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | null>(null)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  const filtered = allProposals
    .filter(p => taFilter === 'All' || p.therapeuticArea === taFilter)
    .filter(p => !statusFilter || p.status === statusFilter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const filtersActive = taFilter !== 'All' || statusFilter !== null

  function toggleStatusFilter(statuses: ProposalStatus[]) {
    const s = statuses[0]
    setStatusFilter(prev => (prev === s ? null : s))
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{today}</p>
        </div>
        <button className="flex items-center gap-2 bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Proposal
        </button>
      </div>

      {/* ── jamo Pulse ── */}
      <div className="bg-purple-50/50 border border-purple-100 rounded-xl px-5 py-3.5">
        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">jamo Pulse</span>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-semibold text-gray-800">jamo Insight:</span>{' '}
          You have 3 proposals due this week. 'Rare Disease' needs 15% more source context for benchmark compliance.
        </p>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-3 gap-5">
        <StatCard
          label="Active Proposals"
          value={String(stats.active)}
          sub="across all stages"
          accent="text-jamo-500"
        />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate}%`}
          sub="of decided proposals"
          accent="text-green-600"
        />
        <StatCard
          label="Pipeline Value"
          value={formatCurrency(stats.pipeline)}
          sub="excl. lost proposals"
          accent="text-blue-600"
          weighted={`Weighted: ${formatCurrency(stats.weighted)}`}
        />
      </div>

      {/* ── Main content ── */}
      <div className="grid grid-cols-3 gap-6">

        {/* Recent Proposals */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200">

          {/* Card header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-900">Recent Proposals</h2>
              {filtersActive && (
                <button
                  onClick={() => { setTaFilter('All'); setStatusFilter(null) }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
                >
                  Clear filter
                </button>
              )}
            </div>
            <button
              onClick={() => navigate('/proposals')}
              className="text-sm text-jamo-500 hover:text-jamo-600 font-medium"
            >
              View all
            </button>
          </div>

          {/* TA filter chips */}
          <div className="px-6 py-2.5 flex items-center gap-1.5 flex-wrap border-b border-gray-50">
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

          {/* Column headers */}
          <div className="px-6 pt-2.5 pb-1 grid grid-cols-[1fr_5.5rem_4rem_9rem] gap-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            <span>Proposal</span>
            <span className="text-right">Last Activity</span>
            <span className="text-right">Value</span>
            <span className="text-right">Status</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <p className="px-6 py-8 text-sm text-gray-400 text-center">
                No proposals match the current filter.
              </p>
            )}
            {filtered.map(p => {
              const urgency = getUrgencyTag(p.dueDate)
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/proposals/${p.id}`)}
                  className="group px-6 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="grid grid-cols-[1fr_5.5rem_4rem_9rem] gap-3 items-center">

                    {/* Title + meta */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.client} · {p.therapeuticArea}</p>
                    </div>

                    {/* Last Activity */}
                    <span className="text-right text-xs text-gray-400">
                      {LAST_ACTIVITY[p.id] ?? '—'}
                    </span>

                    {/* Value */}
                    <span className="text-right text-sm font-medium text-gray-700">
                      {formatCurrency(p.value)}
                    </span>

                    {/* Status badge ↔ hover actions */}
                    <div className="relative flex justify-end">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full transition-opacity group-hover:opacity-0 ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                      <div className="absolute inset-y-0 right-0 flex items-center gap-2.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                        {['Edit', 'Duplicate', 'Archive'].map(action => (
                          <button
                            key={action}
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Due date / urgency */}
                  <div className="mt-1">
                    {urgency.urgent ? (
                      <span className="inline-flex text-xs font-medium bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100">
                        {urgency.label}
                      </span>
                    ) : (
                      <p className="text-xs text-gray-400">Due {formatDate(p.dueDate)}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Pipeline ── */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Pipeline</h2>
            <p className="text-xs text-gray-400 mt-0.5">Click a stage to filter</p>
          </div>

          <div className="p-6 space-y-4">
            {PIPELINE_STAGES.map(stage => {
              const count = allProposals.filter(p => stage.statuses.includes(p.status)).length
              const value = allProposals
                .filter(p => stage.statuses.includes(p.status))
                .reduce((sum, p) => sum + p.value, 0)
              const pct      = Math.round((count / allProposals.length) * 100)
              const isActive = statusFilter !== null && stage.statuses.includes(statusFilter)

              return (
                <div
                  key={stage.label}
                  onClick={() => toggleStatusFilter(stage.statuses)}
                  className={`-mx-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    isActive ? 'bg-jamo-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between mb-1.5">
                    <span className={`text-sm font-medium ${isActive ? 'text-jamo-600' : 'text-gray-700'}`}>
                      {stage.label}
                    </span>
                    <span className="text-xs text-gray-500">{count} · {formatCurrency(value)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-colors ${isActive ? 'bg-jamo-500' : 'bg-jamo-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
