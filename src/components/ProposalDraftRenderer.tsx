import { useState, useEffect, useRef } from 'react'
import type { DraftSection, Segment, ContentBlock, Annotation, AnnotationSourceType } from '../types/draft'

const SOURCE_META: Record<AnnotationSourceType, { dot: string; badge: string; badgeText: string; quoteBorder: string; label: string }> = {
  rfp:      { dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700',  badgeText: 'text-amber-700',  quoteBorder: 'border-amber-300',  label: 'RFP' },
  kickoff:  { dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700',    badgeText: 'text-blue-700',   quoteBorder: 'border-blue-300',   label: 'Kick-off Call' },
  template: { dot: 'bg-purple-400', badge: 'bg-purple-50 text-purple-700',badgeText: 'text-purple-700', quoteBorder: 'border-purple-300', label: 'Template' },
  other:    { dot: 'bg-green-400',  badge: 'bg-green-50 text-green-700',  badgeText: 'text-green-700',  quoteBorder: 'border-green-300',  label: 'Document' },
}

const HIGHLIGHT: Record<AnnotationSourceType, string> = {
  rfp:      'bg-amber-100 border-b-2 border-amber-400 cursor-pointer hover:bg-amber-200',
  kickoff:  'bg-blue-100 border-b-2 border-blue-400 cursor-pointer hover:bg-blue-200',
  template: 'bg-purple-100 border-b-2 border-purple-400 cursor-pointer hover:bg-purple-200',
  other:    'bg-green-100 border-b-2 border-green-400 cursor-pointer hover:bg-green-200',
}

interface PopoverState {
  annotation: Annotation
  anchorRect: DOMRect
}

function AnnotationPopover({ state, onClose }: { state: PopoverState; onClose: () => void }) {
  const meta = SOURCE_META[state.annotation.sourceType]
  const ref = useRef<HTMLDivElement>(null)
  const POPOVER_WIDTH = 320
  const GAP = 8

  // Place just below the anchor; clamp to viewport edges
  const rawTop = state.anchorRect.bottom + GAP
  const rawLeft = state.anchorRect.left
  const clampedLeft = Math.min(rawLeft, window.innerWidth - POPOVER_WIDTH - 16)

  // Flip above if too close to bottom
  const [top, setTop] = useState(rawTop)
  useEffect(() => {
    if (ref.current) {
      const popRect = ref.current.getBoundingClientRect()
      if (popRect.bottom > window.innerHeight - 16) {
        setTop(state.anchorRect.top - popRect.height - GAP)
      }
    }
  }, [state.anchorRect.top, state.anchorRect.bottom])

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
      style={{ width: POPOVER_WIDTH, top, left: clampedLeft }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
            {meta.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-300 hover:text-gray-500 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5 mb-3">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-xs font-medium text-gray-600 truncate">{state.annotation.sourceDoc}</p>
        </div>
        <blockquote className={`text-xs text-gray-600 leading-relaxed border-l-2 pl-3 italic ${meta.quoteBorder}`}>
          "{state.annotation.quote}"
        </blockquote>
      </div>
    </div>
  )
}

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
  const [popover, setPopover] = useState<PopoverState | null>(null)

  useEffect(() => {
    const close = () => setPopover(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  function handleAnnotationClick(e: React.MouseEvent<HTMLSpanElement>, annotation: Annotation) {
    e.stopPropagation()
    const anchorRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPopover({ annotation, anchorRect })
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
