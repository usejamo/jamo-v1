import { useState, useEffect, useRef } from 'react'
import type { DraftSection, Segment, ContentBlock, Annotation, AnnotationSourceType } from '../types/draft'

const SOURCE_STYLES: Record<AnnotationSourceType, { bg: string; text: string; border: string; label: string }> = {
  rfp:      { bg: 'bg-amber-50',  text: 'text-amber-900', border: 'border-amber-200', label: 'RFP' },
  kickoff:  { bg: 'bg-blue-50',   text: 'text-blue-900',  border: 'border-blue-200',  label: 'Kick-off Call' },
  template: { bg: 'bg-purple-50', text: 'text-purple-900',border: 'border-purple-200',label: 'Template' },
  other:    { bg: 'bg-green-50',  text: 'text-green-900', border: 'border-green-200', label: 'Document' },
}

const HIGHLIGHT: Record<AnnotationSourceType, string> = {
  rfp:      'bg-amber-100 border-b-2 border-amber-400 cursor-pointer hover:bg-amber-200',
  kickoff:  'bg-blue-100 border-b-2 border-blue-400 cursor-pointer hover:bg-blue-200',
  template: 'bg-purple-100 border-b-2 border-purple-400 cursor-pointer hover:bg-purple-200',
  other:    'bg-green-100 border-b-2 border-green-400 cursor-pointer hover:bg-green-200',
}

interface PopoverState {
  annotation: Annotation
  top: number
  left: number
}

function AnnotationPopover({ state, onClose }: { state: PopoverState; onClose: () => void }) {
  const style = SOURCE_STYLES[state.annotation.sourceType]
  const ref = useRef<HTMLDivElement>(null)

  // Adjust left so popover doesn't overflow viewport
  const [adjustedLeft, setAdjustedLeft] = useState(state.left)
  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const overflow = rect.right - window.innerWidth + 16
      if (overflow > 0) setAdjustedLeft(l => l - overflow)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`fixed z-50 w-80 rounded-xl border shadow-xl ${style.bg} ${style.border} p-4`}
      style={{ top: state.top, left: adjustedLeft, transform: 'translateY(-100%) translateY(-8px)' }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
          Source: {style.label}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className={`text-xs font-medium mb-2 truncate ${style.text}`}>{state.annotation.sourceDoc}</p>
      <blockquote className={`text-xs leading-relaxed border-l-2 pl-3 italic ${style.text} ${style.border} opacity-80`}>
        "{state.annotation.quote}"
      </blockquote>
    </div>
  )
}

let annotationCounter = 0

function RenderSegment({
  seg,
  onAnnotationClick,
}: {
  seg: Segment
  onAnnotationClick: (e: React.MouseEvent<HTMLSpanElement>, annotation: Annotation) => void
}) {
  if ('plain' in seg) return <>{seg.plain}</>
  const { text, annotation } = seg
  return (
    <span
      className={`rounded-sm px-0.5 transition-colors ${HIGHLIGHT[annotation.sourceType]}`}
      onClick={e => onAnnotationClick(e, annotation)}
      title={`Source: ${annotation.sourceDoc}`}
    >
      {text}
    </span>
  )
}

function RenderBlock({
  block,
  onAnnotationClick,
}: {
  block: ContentBlock
  onAnnotationClick: (e: React.MouseEvent<HTMLSpanElement>, annotation: Annotation) => void
}) {
  if (block.kind === 'p') {
    return (
      <p className="text-sm text-gray-700 leading-relaxed mb-3">
        {block.segments.map((seg, i) => (
          <RenderSegment key={i} seg={seg} onAnnotationClick={onAnnotationClick} />
        ))}
      </p>
    )
  }

  if (block.kind === 'ul') {
    return (
      <ul className="list-disc list-outside ml-5 space-y-1 mb-3">
        {block.items.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 leading-relaxed">
            {item.map((seg, j) => (
              <RenderSegment key={j} seg={seg} onAnnotationClick={onAnnotationClick} />
            ))}
          </li>
        ))}
      </ul>
    )
  }

  if (block.kind === 'table') {
    return (
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              {block.headers.map((h, i) => (
                <th key={i} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border border-gray-200">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 text-gray-700 border border-gray-200 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return null
}

interface Props {
  sections: DraftSection[]
}

export default function ProposalDraftRenderer({ sections }: Props) {
  annotationCounter = 0
  const [popover, setPopover] = useState<PopoverState | null>(null)

  useEffect(() => {
    const close = () => setPopover(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  function handleAnnotationClick(e: React.MouseEvent<HTMLSpanElement>, annotation: Annotation) {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPopover({ annotation, top: rect.top + window.scrollY, left: rect.left })
  }

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-5 pb-4 border-b border-gray-100">
        <span className="text-xs text-gray-400 font-medium">Source highlights:</span>
        {(['rfp', 'kickoff', 'other'] as AnnotationSourceType[]).map(type => (
          <span key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className={`inline-block w-3 h-3 rounded-sm ${HIGHLIGHT[type].split(' ')[0]}`} />
            {SOURCE_STYLES[type].label}
          </span>
        ))}
      </div>

      {/* Sections */}
      {sections.map(section => (
        <div key={section.id} className="mb-8">
          <h3 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-100">
            {section.title}
          </h3>
          {section.blocks.map((block, i) => (
            <RenderBlock key={i} block={block} onAnnotationClick={handleAnnotationClick} />
          ))}
          {section.subsections?.map(sub => (
            <div key={sub.id} className="mt-4 ml-2">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">{sub.title}</h4>
              {sub.blocks.map((block, i) => (
                <RenderBlock key={i} block={block} onAnnotationClick={handleAnnotationClick} />
              ))}
            </div>
          ))}
        </div>
      ))}

      {/* Popover */}
      {popover && (
        <AnnotationPopover state={popover} onClose={() => setPopover(null)} />
      )}
    </div>
  )
}
