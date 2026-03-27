import type { ComplianceFlag as ComplianceFlagType } from '../../types/workspace'

interface ComplianceFlagProps {
  flag: ComplianceFlagType
}

export function ComplianceFlag({ flag }: ComplianceFlagProps) {
  const isWarning = flag.type === 'warning'

  return (
    <span
      className={
        isWarning
          ? 'inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded px-2 py-0.5'
          : 'inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded px-2 py-0.5'
      }
    >
      {/* Exclamation triangle icon */}
      <svg
        className="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>
      {flag.message}
    </span>
  )
}

interface ComplianceFlagListProps {
  flags: ComplianceFlagType[]
  checking: boolean
}

export function ComplianceFlagList({ flags, checking }: ComplianceFlagListProps) {
  if (checking) {
    return (
      <div className="px-4 pb-3 mt-1">
        <span className="text-xs text-gray-400 italic">Checking compliance...</span>
      </div>
    )
  }

  if (!flags || flags.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2 px-4 pb-3">
      {flags.map((flag) => (
        <ComplianceFlag key={flag.id} flag={flag} />
      ))}
    </div>
  )
}
