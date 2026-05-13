import type { CompliancePayload } from '../../types/chat'

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

interface ComplianceCardProps {
  payload: CompliancePayload
  onDismiss?: (issueIndex: number) => void
  dismissedIndices?: number[]
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-400',
  info: 'bg-blue-400',
}

export function ComplianceCard({ payload, onDismiss, dismissedIndices = [] }: ComplianceCardProps) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      {payload.retrieval_warning && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
          <p className="text-[10px] text-amber-700">{payload.retrieval_warning}</p>
        </div>
      )}
      {payload.summary && (
        <div className="px-3 py-2 border-b border-gray-100">
          <p className="text-xs text-gray-600">{payload.summary}</p>
        </div>
      )}
      {payload.issues.map((issue, i) => {
        const isDismissed = dismissedIndices.includes(i)
        return (
          <div
            key={i}
            className={`flex items-start gap-2 px-3 py-2 border-b border-gray-100 last:border-0 ${isDismissed ? 'opacity-40' : ''}`}
          >
            <span
              className={`w-2 h-2 rounded-full mt-1 shrink-0 ${SEVERITY_DOT[issue.severity] ?? 'bg-gray-400'}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-700 leading-relaxed">{issue.message}</p>
              {issue.rule_reference && (
                <p className="text-[10px] text-gray-400 mt-0.5">{issue.rule_reference}</p>
              )}
            </div>
            {onDismiss && (
              <button
                onClick={() => onDismiss(i)}
                aria-label="Dismiss flag"
                className="shrink-0 mt-0.5"
              >
                <XIcon className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 cursor-pointer" />
              </button>
            )}
          </div>
        )
      })}
      {payload.issues.length === 0 && payload.passes === true && (
        <div className="px-3 py-2">
          <p className="text-xs text-emerald-600">No compliance issues found.</p>
        </div>
      )}
    </div>
  )
}
