import type { Citation } from '../../types/chat'

interface CitationsBlockProps {
  citations: Citation[]
}

export function CitationsBlock({ citations }: CitationsBlockProps) {
  if (!citations || citations.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((citation, i) => (
        <span
          key={i}
          title={citation.passage}
          className="text-[10px] text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-full px-2 py-0.5 cursor-default"
        >
          {citation.source}
        </span>
      ))}
    </div>
  )
}
