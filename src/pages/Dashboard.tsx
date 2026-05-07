import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Proposal, ProposalStatus } from '../types/proposal'
import { useArchived } from '../context/ArchivedContext'
import { useProposals } from '../context/ProposalsContext'
import { useDeleted } from '../context/DeletedContext'
import { useProposalModal } from '../context/ProposalModalContext'
import { STATUS_LABELS, STATUS_COLORS } from '../components/StatusSelector'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const PIPELINE_STAGES: { label: string; statuses: ProposalStatus[] }[] = [
  { label: 'RFP Received', statuses: ['draft'] },
  { label: 'In Progress', statuses: ['in_progress'] },
  { label: 'Submitted',   statuses: ['submitted'] },
  { label: 'Won',         statuses: ['won'] },
  { label: 'Lost',        statuses: ['lost'] },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function formatDate(s: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(date: string | Date | undefined): string {
  if (!date) return '—'
  const diff = Date.now() - new Date(date).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getUrgencyTag(dueDate: string) {
  const diffH = (new Date(dueDate).getTime() - new Date().getTime()) / 3_600_000
  if (diffH >= 0 && diffH <= 72) {
    const days = Math.ceil(diffH / 24)
    return { urgent: true, label: `Due in ${days} day${days !== 1 ? 's' : ''}` }
  }
  return { urgent: false, label: '' }
}

/** A proposal is urgent if it's active AND (due within 72h OR inactive ≥48h) */
function isUrgent(p: Proposal): boolean {
  if (p.status === 'won' || p.status === 'lost') return false
  const diffH = (new Date(p.dueDate).getTime() - new Date().getTime()) / 3_600_000
  if (diffH >= 0 && diffH <= 72) return true
  const inactiveHours = p.updatedAt ? (Date.now() - new Date(p.updatedAt).getTime()) / 3_600_000 : 0
  return inactiveHours >= 48
}

function getStats(proposals: Proposal[]) {
  const active   = proposals.filter(p => p.status !== 'lost').length
  const pipeline = proposals.filter(p => p.status !== 'lost').reduce((s, p) => s + p.value, 0)
  return { active, pipeline }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, weighted, source, weightedBadge }: {
  label: string; value: string; sub: string; accent: string
  weighted?: string; source?: string; weightedBadge?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-1">
      <span className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>{label}</span>
      <span className="text-3xl font-bold text-gray-900">{value}</span>
      <span className="text-sm text-gray-500">{sub}</span>
      {source && (
        <span className="text-[10px] text-gray-400 mt-0.5">{source}</span>
      )}
      {weighted && (
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-gray-400 font-medium">{weighted}</span>
          {weightedBadge && (
            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-medium">
              {weightedBadge}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { archivedIds, archive } = useArchived()
  const { proposals } = useProposals()
  const { deletedIds } = useDeleted()
  const { openModal } = useProposalModal()
  const { session, profile } = useAuth()

  const [generatedCount, setGeneratedCount] = useState(0)
  const [aiCallCount, setAiCallCount] = useState(0)

  useEffect(() => {
    if (!session || !profile?.org_id) return
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    supabase
      .from('usage_events')
      .select('id, event_type')
      .eq('org_id', profile.org_id)
      .gte('created_at', startOfMonth)
      .then(({ data, error }) => {
        if (error || !data) return
        setGeneratedCount(data.filter(e => e.event_type === 'proposal_generated').length)
        setAiCallCount(data.filter(e => e.event_type === 'ai_section_call').length)
      })
  }, [session, profile?.org_id])

  const visibleProposals = proposals.filter(p => !archivedIds.has(p.id) && !deletedIds.has(p.id))
  const stats = getStats(visibleProposals)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  // Priority Focus: urgent proposals sorted by due date, capped at 4
  const priorityItems = visibleProposals
    .filter(isUrgent)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 4)

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{today}</p>
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

      {/* ── jamo Pulse — triage summary ── */}
      <div className="bg-purple-50/50 border border-purple-100 rounded-xl px-5 py-3.5">
        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">jamo Pulse</span>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-semibold text-gray-800">jamo Insight:</span>{' '}
          {`${priorityItems.length} proposal${priorityItems.length !== 1 ? 's' : ''} require${priorityItems.length === 1 ? 's' : ''} immediate attention — review the Priority Focus list below.`}
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
          label="Generated This Month"
          value={String(generatedCount)}
          sub={aiCallCount > 0 ? `${aiCallCount} AI calls made` : 'No AI calls yet this month'}
          accent="text-purple-600"
        />
        <StatCard
          label="Pipeline Value"
          value={formatCurrency(stats.pipeline)}
          sub="excl. lost proposals"
          accent="text-blue-600"
        />
      </div>

      {/* ── Main content ── */}
      <div className="grid grid-cols-3 gap-6">

        {/* Priority Focus */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Priority Focus</h2>
              <p className="text-xs text-gray-400 mt-0.5">Due within 72 h or inactive ≥ 48 h</p>
            </div>
            <button
              onClick={() => navigate('/proposals')}
              className="inline-flex items-center text-sm text-jamo-500 hover:text-jamo-600 font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              View all
            </button>
          </div>

          {/* Column headers */}
          <div className="px-6 pt-2.5 pb-1 grid grid-cols-[1fr_auto] gap-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            <span>Proposal</span>
            <div className="flex items-center">
              <span className="text-right w-[5.5rem] mr-3">Last Activity</span>
              <span className="text-right w-16 mr-3">Value</span>
              <span className="text-right w-36">Status</span>
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {priorityItems.length === 0 && (
              <p className="px-6 py-8 text-sm text-gray-400 text-center">No urgent proposals at this time.</p>
            )}
            {priorityItems.map(p => {
              const urgency = getUrgencyTag(p.dueDate)
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/proposals/${p.id}`)}
                  className="group px-6 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.client} · {p.therapeuticArea}</p>
                    </div>
                    <div className="flex items-center">
                      {/* Last Activity — collapses on hover to free space */}
                      <span className="text-right text-xs text-gray-400 whitespace-nowrap overflow-hidden transition-all duration-200 w-[5.5rem] mr-3 group-hover:w-0 group-hover:mr-0 group-hover:opacity-0">
                        {timeAgo(p.updatedAt)}
                      </span>
                      {/* Value — collapses on hover */}
                      <span className="text-right text-sm font-medium text-gray-700 whitespace-nowrap overflow-hidden transition-all duration-200 w-16 mr-3 group-hover:w-0 group-hover:mr-0 group-hover:opacity-0">
                        {formatCurrency(p.value)}
                      </span>
                      {/* Status ↔ hover actions */}
                      <div className="relative flex items-center justify-end w-36">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full transition-opacity duration-200 group-hover:opacity-0 whitespace-nowrap ${STATUS_COLORS[p.status]}`}>
                          {STATUS_LABELS[p.status]}
                        </span>
                        <div className="absolute inset-y-0 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
                          {['Edit', 'Archive'].map(action => (
                            <button
                              key={action}
                              onClick={e => {
                                e.stopPropagation()
                                if (action === 'Edit') openModal(p)
                                else if (action === 'Archive') archive(p.id)
                              }}
                              className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-md transition-colors"
                            >
                              {action}
                            </button>
                          ))}
                        </div>
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

        {/* Pipeline — informational, no filter sync on dashboard */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Pipeline</h2>
            <p className="text-xs text-gray-400 mt-0.5">Stage breakdown</p>
          </div>
          <div className="p-6 space-y-4">
            {PIPELINE_STAGES.map(stage => {
              const count = visibleProposals.filter(p => stage.statuses.includes(p.status)).length
              const value = visibleProposals
                .filter(p => stage.statuses.includes(p.status))
                .reduce((sum, p) => sum + p.value, 0)
              const pct = visibleProposals.length > 0 ? Math.round((count / visibleProposals.length) * 100) : 0
              return (
                <div key={stage.label}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-700">{stage.label}</span>
                    <span className="text-xs text-gray-500">{count} · {formatCurrency(value)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-jamo-400 rounded-full" style={{ width: `${pct}%` }} />
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
