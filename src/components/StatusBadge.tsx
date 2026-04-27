import type { SectionStatus } from '../types/generation'

const STATUS_CONFIG: Record<SectionStatus, { bg: string; text: string; label: string }> = {
  pending:    { bg: 'bg-gray-100',  text: 'text-gray-500',  label: 'Pending' },
  generating: { bg: 'bg-blue-50',   text: 'text-blue-600',  label: 'Generating\u2026' },
  complete:   { bg: 'bg-green-100', text: 'text-green-600', label: 'Complete' },
  error:      { bg: 'bg-red-100',   text: 'text-red-600',   label: 'Generation failed' },
}

export function StatusBadge({ status }: { status: SectionStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span
      className={`px-2 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text}`}
      role="status"
      aria-live="polite"
    >
      {config.label}
    </span>
  )
}

export { STATUS_CONFIG }
