import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

// Tri-state maps to proposals.reference_override: NULL=follow-settings,
// true=always-include, false=never-include (BRIEF / CONTEXT.md specifics).
export type ReferenceOverrideValue = boolean | null

export interface ProposalReferenceControlProps {
  proposalId: string
  status: string
  value: ReferenceOverrideValue
  disabled?: boolean
  onChanged?: (next: ReferenceOverrideValue) => void
}

const OPTIONS: { value: ReferenceOverrideValue; label: string }[] = [
  { value: null, label: 'Follow settings' },
  { value: true, label: 'Always include' },
  { value: false, label: 'Never include' },
]

function labelFor(value: ReferenceOverrideValue) {
  return OPTIONS.find(o => o.value === value)?.label ?? 'Follow settings'
}

// ── ProposalReferenceControl ────────────────────────────────────────────────
//
// Modeled on StatusSelector.tsx (dropdown + async onChange + pending state).
// RENDER GUARD (load-bearing, BRIEF): a draft proposal must offer NO
// include-path — the component renders null entirely when status === 'draft',
// never a disabled/greyed-out affordance.
//
// D-07: mutation is org-admin-gated. Client-side `disabled` here is UX only —
// the real boundary is the set_reference_override RPC (Plan 03), which RAISEs
// 'not authorized' for a non-admin caller regardless of this UI.

export function ProposalReferenceControl({
  proposalId,
  status,
  value,
  disabled,
  onChanged,
}: ProposalReferenceControlProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [current, setCurrent] = useState<ReferenceOverrideValue>(value)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCurrent(value)
  }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleSelect(next: ReferenceOverrideValue) {
    if (disabled || pending) return

    const previous = current
    setCurrent(next)
    setOpen(false)
    setPending(true)
    setError(null)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcError } = await (supabase as any).rpc('set_reference_override', {
        p_proposal_id: proposalId,
        p_value: next,
      })

      if (rpcError) {
        setCurrent(previous)
        setError(
          typeof rpcError.message === 'string' && rpcError.message.includes('not authorized')
            ? 'Only org admins can change this.'
            : 'Failed to save. Please try again.'
        )
      } else {
        onChanged?.(next)
      }
    } catch {
      setCurrent(previous)
      setError('Failed to save. Please try again.')
    } finally {
      setPending(false)
    }
  }

  // No draft include-path — render nothing for drafts (see module doc above).
  if (status !== 'draft') {
    return (
      <div ref={ref} className="relative inline-block">
        <button
          type="button"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 ${
            disabled || pending ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-300'
          }`}
          onClick={() => !disabled && !pending && setOpen(o => !o)}
          disabled={disabled || pending}
        >
          <span className="text-gray-400 font-normal">Use as reference:</span>
          <span>{labelFor(current)}</span>
          <span className="text-xs">▾</span>
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-30 min-w-[160px]">
            {OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${
                  opt.value === current ? 'font-semibold' : ''
                }`}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="absolute top-full left-0 mt-9 text-xs text-red-600 whitespace-nowrap z-20">
            {error}
          </p>
        )}
      </div>
    )
  }

  return null
}
