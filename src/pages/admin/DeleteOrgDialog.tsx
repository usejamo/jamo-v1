import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ── Delete-org dialog (same overlay/button-row shape as RevokeInviteDialog) ──

interface OrgPreviewCounts {
  members: number
  proposals: number
  invites: number
  chat_sessions: number
}

interface DeleteOrgPreviewResponse {
  preview: true
  org: { id: string; name: string }
  counts: OrgPreviewCounts
  blocked: string | null
}

interface DeleteOrgResult {
  deleted: {
    org: string
    members: number
    proposals: number
    invites: number
    chat_sessions: number
  }
  member_failures: { user_id: string; error: string }[]
}

/** Best-effort extraction of the `{ error }` JSON body an admin-* edge fn
 * returns via jsonError (_shared/auth.ts) — falls back to a generic message
 * if the response can't be parsed (network failure, non-JSON body, etc).
 * Duplicated from AdminPanel.tsx's extractServerError (same contract, kept
 * local so this dialog has no import cycle back into AdminPanel). */
async function extractServerError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response } | null | undefined)?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body && typeof body.error === 'string' && body.error.trim()) {
        return body.error
      }
    } catch {
      // fall through to fallback
    }
  }
  return fallback
}

export default function DeleteOrgDialog({
  org,
  onCancel,
  onDeleted,
}: {
  org: { id: string; name: string }
  onCancel: () => void
  onDeleted: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  const [loadingPreview, setLoadingPreview] = useState(true)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [counts, setCounts] = useState<OrgPreviewCounts | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)

  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [memberFailures, setMemberFailures] = useState<{ user_id: string; error: string }[] | null>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadPreview() {
      setLoadingPreview(true)
      setPreviewError(null)
      const { data, error } = await supabase.functions.invoke('admin-delete-org', {
        // No confirm_name: preview reports the standing state of the org
        // (counts, and whether a super_admin member blocks it). The name is a
        // submit-time gate — sending the empty box here made the server answer
        // "Name does not match" on open, which hid the real reason and left
        // the confirm button permanently unrendered.
        body: { org_id: org.id, preview: true },
      })
      if (cancelled) return
      if (error) {
        setPreviewError(await extractServerError(error, "Couldn't load organization details. Please try again."))
      } else {
        const result = data as DeleteOrgPreviewResponse
        setCounts(result.counts)
        setBlocked(result.blocked)
      }
      setLoadingPreview(false)
    }
    loadPreview()
    return () => {
      cancelled = true
    }
    // Preview is only fetched once on open — it does not need to re-run as
    // the user types the confirmation name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id])

  const canConfirm = !loadingPreview && !previewError && !blocked && typed.trim() === org.name

  async function handleConfirm() {
    if (!canConfirm) return
    setDeleting(true)
    setDeleteError(null)

    const { data, error } = await supabase.functions.invoke('admin-delete-org', {
      body: { org_id: org.id, confirm_name: typed },
    })

    if (error) {
      setDeleteError(await extractServerError(error, "Couldn't delete the organization. Please try again."))
      setDeleting(false)
      return
    }

    const result = data as DeleteOrgResult
    if (result?.member_failures && result.member_failures.length > 0) {
      setMemberFailures(result.member_failures)
      setDeleting(false)
      return
    }

    setDeleting(false)
    onDeleted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 mb-2">Delete organization?</h2>
        <p className="text-sm text-gray-600 mb-4">
          This permanently deletes <span className="font-medium text-gray-800">{org.name}</span> and cannot be undone.
        </p>

        {loadingPreview ? (
          <p className="text-sm text-gray-400 italic mb-4">Loading…</p>
        ) : previewError ? (
          <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
            {previewError}
          </div>
        ) : blocked ? (
          <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
            {blocked}
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 mb-4">
              This will permanently delete {counts?.members ?? 0} members, {counts?.proposals ?? 0} proposals,{' '}
              {counts?.invites ?? 0} invites, and {counts?.chat_sessions ?? 0} chat sessions. Members'{' '}
              <span className="font-medium">login accounts will be deleted</span>, not just their membership.
            </div>

            {memberFailures ? (
              <div role="alert" className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
                The organization was deleted, but {memberFailures.length}{' '}
                {memberFailures.length === 1 ? 'member account' : 'member accounts'} failed to delete:{' '}
                {memberFailures.map(f => f.user_id).join(', ')}.
              </div>
            ) : (
              <div className="mb-4">
                <label htmlFor="delete-org-confirm-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Type the organization name to confirm
                </label>
                <input
                  id="delete-org-confirm-name"
                  type="text"
                  aria-label="Organization name"
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
                  placeholder={org.name}
                  disabled={deleting}
                />
              </div>
            )}

            {deleteError && (
              <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
                {deleteError}
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={memberFailures ? onDeleted : onCancel}
            className="text-sm font-medium text-gray-700 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {memberFailures ? 'Close' : 'Cancel'}
          </button>
          {!blocked && !previewError && !memberFailures && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm || deleting}
              className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete Organization'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
