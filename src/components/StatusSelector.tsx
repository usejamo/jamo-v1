import { useState, useRef, useEffect } from 'react'
import type { ProposalStatus } from '../types/proposal'

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft:     'Draft',
  submitted: 'Submitted',
  won:       'Won',
  lost:      'Lost',
}

export const STATUS_COLORS: Record<ProposalStatus, string> = {
  draft:     'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  won:       'bg-green-100 text-green-700',
  lost:      'bg-red-100 text-red-600',
}

export interface StatusSelectorProps {
  status: ProposalStatus
  onChange: (next: ProposalStatus) => Promise<void>
  variant: 'compact' | 'labeled'
  disabled?: boolean
}

const ALL_STATUSES: ProposalStatus[] = ['draft', 'submitted', 'won', 'lost']
const TERMINAL_STATUSES: ProposalStatus[] = ['won', 'lost']

export function StatusSelector({ status, onChange, variant, disabled }: StatusSelectorProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<ProposalStatus | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleSelect(next: ProposalStatus) {
    if (TERMINAL_STATUSES.includes(next)) {
      setConfirmTarget(next)
      setOpen(false)
      return
    }
    setPending(true)
    try {
      await onChange(next)
    } finally {
      setPending(false)
      setOpen(false)
    }
  }

  async function handleConfirm() {
    if (!confirmTarget) return
    setPending(true)
    try {
      await onChange(confirmTarget)
    } finally {
      setPending(false)
      setConfirmTarget(null)
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      {variant === 'compact' ? (
        <button
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status]} ${disabled || pending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
          onClick={() => !disabled && !pending && setOpen(o => !o)}
          disabled={disabled || pending}
        >
          {STATUS_LABELS[status]}
        </button>
      ) : (
        <button
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium ${STATUS_COLORS[status]} ${disabled || pending ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
          onClick={() => !disabled && !pending && setOpen(o => !o)}
          disabled={disabled || pending}
        >
          <span>Status:</span>
          <span>{STATUS_LABELS[status]}</span>
          <span className="text-xs">▾</span>
        </button>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-30 min-w-[140px]">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${s === status ? 'font-semibold' : ''}`}
              onClick={() => handleSelect(s)}
            >
              <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s].split(' ')[0]}`} />
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {confirmTarget && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Mark as {STATUS_LABELS[confirmTarget]}?
              </h3>
              <p className="text-sm text-gray-500 mt-1 whitespace-normal">
                This marks the proposal as a terminal outcome. You can change it again if needed.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setConfirmTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${confirmTarget === 'won' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-50`}
              >
                {pending ? 'Saving…' : `Mark ${STATUS_LABELS[confirmTarget]}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
