import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { extractInvokeErrorMessage } from '../../lib/invokeError'

// ── DemoResetControl (16-09, D-10/D-11/D-12) ─────────────────────────────────
//
// The presenter's mid-call re-run. One control, ONE behavior: hard-delete THIS
// run and return to "Add demo RFP". No modes, no dropdown, no bulk option.
//
// D-10 — RUN-SCOPED, not account-scoped. The demo login is shared, so two
// presenters can hold two live runs at the same moment; "reset my current run"
// is ambiguous under that login and could delete the other presenter's demo
// mid-sentence. The control therefore forwards the `demo_run_id` the session
// actually started (from useDemoRun) and never infers it. The client id is
// untrusted: `demo-reset` re-verifies demo org + `status='draft'` + demo_runs
// membership server-side and 403s otherwise (T-16-31). This is a courier, not
// a gate.
//
// D-11 — the return to start is IN-SESSION. The old pattern cleared
// sessionStorage and forced a full page reload, which deleted nothing on the
// server and cost the presenter an entire app boot (and a re-auth risk) in
// front of an audience. `onReset` dispatches the run driver back to step 1
// instead. There is deliberately no page-reload call anywhere in this file or
// in useDemoRun, and the plan's acceptance grep asserts its absence by literal
// token — which is why the token itself does not appear even in prose here
// (T-16-32).
//
// D-12 — bulk cleanup of abandoned runs belongs to the scheduled sweep (16-06),
// never here. A presenter control that could wipe other runs is a live-demo
// hazard, not a convenience.
//
// The action is destructive and irreversible, so it is two-step: the button
// arms a confirm before anything is sent. A stray click during a call must not
// cost a live demo.
//
// Rendered only inside DemoRunSurface (demo-org super_admin, run active) —
// never in the global Sidebar; the vestigial Sidebar button was removed in
// 16-07 (T-16-33).

const RESET_FALLBACK_ERROR = 'Reset failed. The demo run may still exist.'

export interface DemoResetControlProps {
  /** `demo_run_id` of the run THIS session started (D-10). */
  demoRunId: string
  /** Returns the surface to the "Add demo RFP" start in-session (D-11). */
  onReset: () => void
}

export function DemoResetControl({ demoRunId, onReset }: DemoResetControlProps) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReset() {
    if (pending) return
    setPending(true)
    setError(null)

    try {
      const { error: invokeError } = await supabase.functions.invoke('demo-reset', {
        body: { demo_run_id: demoRunId },
      })

      if (invokeError) {
        // Surface the server's own message — "reset refused: not a resettable
        // demo run" tells the presenter something true; supabase-js's generic
        // non-2xx string does not.
        setError(await extractInvokeErrorMessage(invokeError, RESET_FALLBACK_ERROR))
        return
      }

      // Only after the server confirms the delete. Clearing local state first
      // would strand the rows with no handle left to retry against.
      setConfirming(false)
      onReset()
    } catch (err) {
      setError(await extractInvokeErrorMessage(err, RESET_FALLBACK_ERROR))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-2" data-testid="demo-reset-control">
      {!confirming && (
        <button
          type="button"
          data-testid="demo-reset"
          onClick={() => {
            setError(null)
            setConfirming(true)
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300"
        >
          Reset demo
        </button>
      )}

      {confirming && (
        <>
          <span className="text-xs text-gray-500">
            Permanently delete this demo run?
          </span>
          <button
            type="button"
            data-testid="demo-reset-confirm"
            onClick={handleReset}
            disabled={pending}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors ${
              pending ? 'cursor-not-allowed opacity-50' : 'hover:border-red-300'
            }`}
          >
            {pending ? 'Resetting…' : 'Delete and start over'}
          </button>
          <button
            type="button"
            data-testid="demo-reset-cancel"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-xs text-gray-500 underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </>
      )}

      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  )
}

export default DemoResetControl
