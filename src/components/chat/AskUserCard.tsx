import { useState } from 'react'
import type { AskUserPayload } from '../../types/chat'

interface AskUserCardProps {
  payload: AskUserPayload
  onAnswer: (text: string) => void
  answered?: string
  /** D-09: defer affordance — calls the stop-walkthrough/discard path. Card hides button when undefined. */
  onSkip?: () => void
}

export function AskUserCard({ payload, onAnswer, answered, onSkip }: AskUserCardProps) {
  const [value, setValue] = useState('')

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 px-3 py-2.5">
      <p className="text-xs text-gray-800 leading-relaxed">{payload.question}</p>
      {payload.context && (
        <p className="text-[10px] text-gray-500 mt-1">{payload.context}</p>
      )}
      {answered !== undefined ? (
        <p className="mt-2 text-xs text-gray-600 italic">{answered}</p>
      ) : (
        <>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your answer..."
            rows={2}
            className="mt-2 w-full text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-jamo-400 placeholder-gray-400 resize-none"
          />
          <button
            onClick={() => {
              if (value.trim()) {
                onAnswer(value.trim())
              }
            }}
            disabled={!value.trim()}
            className="mt-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-gray-700 px-3 py-1 rounded-lg transition-colors disabled:opacity-30"
          >
            Reply
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="mt-1 text-[10px] text-gray-400 hover:text-gray-600"
            >
              I don&apos;t have this yet
            </button>
          )}
        </>
      )}
    </div>
  )
}
