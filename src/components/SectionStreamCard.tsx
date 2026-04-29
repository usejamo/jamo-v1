import React from 'react'
import type { SectionState } from '../types/generation'
import { markdownToHtml } from '../lib/markdownToHtml'
import { StatusBadge, STATUS_CONFIG } from './StatusBadge'

interface SectionStreamCardProps {
  section: SectionState
  onRegenerate?: () => void
  onRetry?: () => void
}

/**
 * Splits text into JSX segments, wrapping [PLACEHOLDER: ...] markers in amber marks.
 * Exported for unit testing.
 */
export function highlightPlaceholders(text: string): React.ReactElement {
  const regex = /\[PLACEHOLDER:\s*([^\]]+)\]/g
  const parts: (string | React.ReactElement)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(
      <mark
        key={match.index}
        className="bg-amber-100 text-amber-800 rounded px-0.5"
      >
        {match[0]}
      </mark>
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return <>{parts}</>
}

export function SectionStreamCard({ section, onRegenerate, onRetry }: SectionStreamCardProps) {
  const { status, name, liveText, finalContent, error } = section
  const statusLabel = STATUS_CONFIG[status].label

  return (
    <div
      id={section.id}
      className="border border-gray-200 rounded-lg bg-white p-4 mb-4 transition-shadow duration-200"
      aria-label={`${name} — ${statusLabel}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-bold text-gray-900">{name}</h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Live text area — visible while generating */}
      {status === 'generating' && (
        <div className="font-mono text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-md p-3 mt-3 min-h-[80px] max-h-[400px] overflow-y-auto">
          {liveText}
          <span className="animate-pulse">|</span>
        </div>
      )}

      {/* Final content — visible when complete */}
      {status === 'complete' && finalContent && (
        <div
          className="prose prose-sm max-w-none font-sans text-sm text-gray-700 leading-relaxed bg-white p-3 mt-3 transition-opacity duration-150"
          dangerouslySetInnerHTML={{
            __html: markdownToHtml(finalContent).replace(
              /\[PLACEHOLDER:\s*([^\]]+)\]/g,
              '<mark class="bg-amber-100 text-amber-800 rounded px-0.5">[$1]</mark>'
            ),
          }}
        />
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="mt-2">
          <p className="text-sm text-red-600">
            Generation failed — {name} could not be completed.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {error ?? 'This may be a temporary issue. Click Retry to try again.'}
          </p>
          {onRetry && (
            <button
              className="text-sm text-red-600 underline hover:no-underline mt-2"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Regenerate button — shown for complete or error */}
      {(status === 'complete' || status === 'error') && onRegenerate && (
        <div className="mt-3">
          <button
            className="text-sm text-gray-600 hover:text-gray-900 min-h-[44px]"
            onClick={onRegenerate}
          >
            Regenerate
          </button>
        </div>
      )}
    </div>
  )
}

export default SectionStreamCard
