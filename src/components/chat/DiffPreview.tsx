import type { ProposeEditChange } from '../../types/chat'

interface DiffPreviewProps {
  changes: ProposeEditChange[]
  onAccept: (paragraphId: string, change: ProposeEditChange) => void
  onReject: (paragraphId: string) => void
  acceptedIds?: string[]
  rejectedIds?: string[]
  staleIds?: string[]
}

export function DiffPreview({
  changes,
  onAccept,
  onReject,
  acceptedIds = [],
  rejectedIds = [],
  staleIds = [],
}: DiffPreviewProps) {
  if (changes.length === 0) return null

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {changes.map((change, i) => {
        const id = change.paragraph_id
        const isAccepted = id && acceptedIds.includes(id)
        const isRejected = id && rejectedIds.includes(id)
        const isStale = id && staleIds.includes(id)

        if (isStale) {
          return (
            <div
              key={i}
              className="border-b border-gray-100 last:border-0 px-3 py-2.5 bg-amber-50 border-l-2 border-amber-400"
            >
              <p className="text-xs text-gray-600 leading-relaxed">
                This paragraph was removed — discard suggestion?
              </p>
              <button
                onClick={() => id && onReject(id)}
                aria-label="Discard suggestion"
                className="mt-1 text-xs text-red-500 hover:text-red-700"
              >
                Discard suggestion
              </button>
            </div>
          )
        }

        return (
          <div
            key={i}
            className={[
              'border-b border-gray-100 last:border-0 px-3 py-2.5',
              isAccepted ? 'bg-emerald-50/50' : '',
              isRejected ? 'opacity-40' : '',
            ].filter(Boolean).join(' ')}
          >
            {change.before_html && (
              <p
                className="text-xs text-gray-400 line-through leading-relaxed"
                dangerouslySetInnerHTML={{ __html: change.before_html }}
              />
            )}
            {change.after_html && (
              <p
                className="text-xs text-gray-800 leading-relaxed mt-1"
                dangerouslySetInnerHTML={{ __html: change.after_html }}
              />
            )}
            {!change.before_html && !change.after_html && (
              <p className="text-xs text-gray-500 leading-relaxed">{change.change_summary}</p>
            )}
            <div className="flex gap-2 mt-1.5">
              {isAccepted ? (
                <span className="text-xs text-emerald-600 font-medium">Accepted</span>
              ) : (
                <>
                  <button
                    onClick={() => id && onAccept(id, change)}
                    aria-label="accept-edit"
                    className="text-xs font-medium text-jamo-600 hover:text-jamo-700 px-2 py-0.5 rounded bg-jamo-50 hover:bg-jamo-100 transition-colors"
                  >
                    Accept edit
                  </button>
                  <button
                    onClick={() => id && onReject(id)}
                    aria-label="Reject edit"
                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100 transition-colors"
                  >
                    Reject edit
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
