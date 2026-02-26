import { useNavigate } from 'react-router-dom'
import proposals from '../data/proposals.json'
import type { Proposal, ProposalStatus } from '../types/proposal'

const allProposals = proposals as Proposal[]

const PIPELINE_STAGES: { label: string; statuses: ProposalStatus[] }[] = [
  { label: 'RFP Received', statuses: ['draft'] },
  { label: 'In Review', statuses: ['in_review'] },
  { label: 'Submitted', statuses: ['submitted'] },
  { label: 'Won', statuses: ['won'] },
  { label: 'Lost', statuses: ['lost'] },
]

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
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getStats() {
  const active = allProposals.filter(p => p.status !== 'lost').length
  const decided = allProposals.filter(p => p.status === 'won' || p.status === 'lost').length
  const won = allProposals.filter(p => p.status === 'won').length
  const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0
  const pipeline = allProposals
    .filter(p => p.status !== 'lost')
    .reduce((sum, p) => sum + p.value, 0)
  return { active, winRate, pipeline }
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-1">
      <span className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>{label}</span>
      <span className="text-3xl font-bold text-gray-900">{value}</span>
      <span className="text-sm text-gray-500">{sub}</span>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const stats = getStats()
  const recent = [...allProposals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{today}</p>
        </div>
        <button className="flex items-center gap-2 bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Proposal
        </button>
      </div>

      {/* KPI Cards */}
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
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Recent Proposals */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Proposals</h2>
            <button onClick={() => navigate('/proposals')} className="text-sm text-jamo-500 hover:text-jamo-600 font-medium">View all</button>
          </div>
          <div className="divide-y divide-gray-50">
            {recent.map(p => (
              <div key={p.id} onClick={() => navigate(`/proposals/${p.id}`)} className="px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.client} · {p.therapeuticArea}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium text-gray-700">{formatCurrency(p.value)}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">Due {formatDate(p.dueDate)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Pipeline</h2>
          </div>
          <div className="p-6 space-y-4">
            {PIPELINE_STAGES.map(stage => {
              const count = allProposals.filter(p => stage.statuses.includes(p.status)).length
              const value = allProposals
                .filter(p => stage.statuses.includes(p.status))
                .reduce((sum, p) => sum + p.value, 0)
              const max = allProposals.length
              const pct = Math.round((count / max) * 100)
              return (
                <div key={stage.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{stage.label}</span>
                    <span className="text-gray-500">{count} · {formatCurrency(value)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-jamo-400 rounded-full"
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
