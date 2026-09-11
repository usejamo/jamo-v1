import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  // The menu is portalled to <body> and positioned with fixed coordinates taken
  // from the trigger. It used to be an `absolute` child of this component, which
  // meant the nearest scrolling ancestor clipped it: the app shell's <main> is
  // `flex-1 overflow-y-auto` inside `h-screen overflow-hidden`, so a trigger near
  // the bottom of the viewport opened a menu that ran past the scroll container
  // and was cut off. Measured before this change: menu bottom 846px against a
  // container bottom of 730px — 116px of the menu was invisible and unclickable.
  //
  // A portal also escapes any ancestor stacking context, which no z-index on an
  // in-flow element can be relied upon to do.
  const MENU_MARGIN = 4
  const positionMenu = useCallback(() => {
    const trigger = ref.current
    const menu = menuRef.current
    if (!trigger) return
    const t = trigger.getBoundingClientRect()
    const menuHeight = menu?.offsetHeight ?? 0
    const menuWidth = menu?.offsetWidth ?? 140

    // Flip above the trigger when there isn't room below.
    const roomBelow = window.innerHeight - t.bottom
    const openUp = menuHeight > 0 && roomBelow < menuHeight + MENU_MARGIN && t.top > menuHeight + MENU_MARGIN
    const top = openUp ? t.top - menuHeight - MENU_MARGIN : t.bottom + MENU_MARGIN

    // Keep it on screen horizontally too.
    const left = Math.min(Math.max(MENU_MARGIN, t.left), window.innerWidth - menuWidth - MENU_MARGIN)

    setMenuPos({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (!open) { setMenuPos(null); return }
    positionMenu()
  }, [open, positionMenu])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      // The menu lives outside this subtree now, so it must be checked separately
      // or every click on a menu item would be treated as a click-outside.
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    // Reposition rather than drift: the trigger moves under a fixed menu when any
    // ancestor scrolls, so listen in the capture phase to catch scrolls on inner
    // containers, not just the window.
    const reposition = () => positionMenu()
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, positionMenu])

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

      {open && createPortal(
        <div
          ref={menuRef}
          data-testid="status-menu"
          className="fixed bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 min-w-[140px]"
          style={{
            top: menuPos?.top ?? 0,
            left: menuPos?.left ?? 0,
            // Avoid a first-paint flash at (0,0) before the measured position lands.
            visibility: menuPos ? 'visible' : 'hidden',
          }}
        >
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
        </div>,
        document.body
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
