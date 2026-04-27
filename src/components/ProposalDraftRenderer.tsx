import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DraftSection, Annotation, AnnotationSourceType, PendingSuggestion, ContentBlock } from '../types/draft'
import type { GenerationState } from '../types/generation'
import { DEMO_COMMANDS } from '../data/demoCommands'
import RenderBlock from './RenderBlock'
import SuggestedChange from './SuggestedChange'
import { SectionStreamCard } from './SectionStreamCard'

const SOURCE_META: Record<AnnotationSourceType, {
  dot: string; badge: string; badgeText: string
  quoteBorder: string; quoteBar: string; label: string; sectionHint: string
}> = {
  rfp:      { dot: 'bg-amber-400',  badge: 'bg-amber-50',  badgeText: 'text-amber-700',  quoteBorder: 'border-amber-200', quoteBar: 'bg-amber-400',  label: 'RFP',           sectionHint: 'Section 2.4' },
  kickoff:  { dot: 'bg-blue-400',   badge: 'bg-blue-50',   badgeText: 'text-blue-700',   quoteBorder: 'border-blue-200',  quoteBar: 'bg-blue-400',   label: 'Kick-off Call', sectionHint: 'Call Notes' },
  template: { dot: 'bg-purple-400', badge: 'bg-purple-50', badgeText: 'text-purple-700', quoteBorder: 'border-purple-200',quoteBar: 'bg-purple-400', label: 'Template',      sectionHint: 'Section 1' },
  other:    { dot: 'bg-green-400',  badge: 'bg-green-50',  badgeText: 'text-green-700',  quoteBorder: 'border-green-200', quoteBar: 'bg-green-400',  label: 'Document',      sectionHint: 'Attachment' },
}

const HIGHLIGHT_LEGEND: Record<AnnotationSourceType, string> = {
  rfp:      'bg-amber-100',
  kickoff:  'bg-blue-100',
  template: 'bg-purple-100',
  other:    'bg-green-100',
}

const POPUP_WIDTH = 340
const GAP = 12

interface PopoverState {
  annotation: Annotation
  anchorRect: DOMRect
}

function computePosition(anchorRect: DOMRect) {
  const anchorCenterX = anchorRect.left + anchorRect.width / 2
  const idealLeft = anchorCenterX - POPUP_WIDTH / 2
  const left = Math.max(12, Math.min(idealLeft, window.innerWidth - POPUP_WIDTH - 12))

  // Prefer below; flip above if < 240px space below
  const below = window.innerHeight - anchorRect.bottom - GAP >= 240
  const top = below
    ? anchorRect.bottom + GAP
    : anchorRect.top - GAP   // will be translated up by 100% in CSS

  // Caret offset relative to popup left edge
  const caretLeft = Math.max(16, Math.min(anchorCenterX - left, POPUP_WIDTH - 16))

  return { top, left, below, caretLeft }
}

function AnnotationPopover({ state, onClose }: { state: PopoverState; onClose: () => void }) {
  const meta = SOURCE_META[state.annotation.sourceType]
  const { top, left, below, caretLeft } = computePosition(state.anchorRect)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: below ? -6 : 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: below ? -6 : 6 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'fixed',
        width: POPUP_WIDTH,
        top: below ? top : undefined,
        bottom: below ? undefined : window.innerHeight - top,
        left,
        zIndex: 51,
        transformOrigin: below ? 'top center' : 'bottom center',
      }}
      onClick={e => e.stopPropagation()}
      className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl overflow-visible"
    >
      {/* Caret pointing toward the highlight */}
      {below ? (
        // Arrow pointing UP (popup is below the highlight)
        <span
          className="absolute -top-[9px] w-4 h-4 overflow-hidden"
          style={{ left: caretLeft - 8 }}
        >
          <span className="absolute inset-0 rotate-45 origin-bottom-left bg-white border-l border-t border-slate-200 rounded-sm translate-x-[3px] translate-y-[5px]" />
        </span>
      ) : (
        // Arrow pointing DOWN (popup is above the highlight)
        <span
          className="absolute -bottom-[9px] w-4 h-4 overflow-hidden"
          style={{ left: caretLeft - 8 }}
        >
          <span className="absolute inset-0 rotate-45 origin-top-right bg-white border-r border-b border-slate-200 rounded-sm -translate-x-[3px] -translate-y-[5px]" />
        </span>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
          <div>
            <span className={`text-xs font-semibold ${meta.badgeText}`}>
              Source: {meta.label}
            </span>
            <span className="text-xs text-slate-400 ml-1.5">· {meta.sectionHint}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Document name */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <p className="text-xs text-slate-500 truncate font-mono">{state.annotation.sourceDoc}</p>
      </div>

      {/* Quote */}
      <div className="px-4 py-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Referenced text</p>
        <div className={`flex gap-3 rounded-lg px-3 py-2.5 ${meta.badge}`}>
          <span className={`w-0.5 rounded-full shrink-0 self-stretch ${meta.quoteBar}`} />
          <p className="text-xs text-slate-700 leading-relaxed italic">
            "{state.annotation.quote}"
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function DraftNav({ sections, activeId }: { sections: DraftSection[]; activeId: string }) {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className="sticky top-8 self-start w-48 shrink-0 pr-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contents</p>
      <ul className="space-y-0.5">
        {sections.map(section => {
          const isActive = activeId === section.id
          const label = section.title.replace(/^\d+\.\s*/, '')
          return (
            <li key={section.id}>
              <button
                onClick={() => scrollTo(section.id)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors leading-snug ${
                  isActive
                    ? 'bg-jamo-50 text-jamo-600 font-semibold'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
              {section.subsections && isActive && (
                <ul className="mt-0.5 mb-1 ml-2 space-y-0.5 border-l border-gray-100 pl-2">
                  {section.subsections.map(sub => (
                    <li key={sub.id}>
                      <button
                        onClick={() => scrollTo(sub.id)}
                        className="w-full text-left text-xs px-2 py-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors leading-snug"
                      >
                        {sub.title.replace(/^\d+\.\d+\s*/, '')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

interface Props {
  sections: DraftSection[]
  acceptedOverrides?: Record<string, ContentBlock[]>
  flashSectionId?: string | null
  pendingSuggestion: PendingSuggestion | null
  onSuggestionAccepted: (commandKey: string) => void
  onSuggestionDeclined: () => void
  hideNav?: boolean
  scrollMarginClass?: string

  // Streaming mode props
  mode?: 'review' | 'streaming'
  generationState?: GenerationState
  onRegenerate?: (sectionKey: string) => void
  onRetry?: (sectionKey: string) => void
}

export default function ProposalDraftRenderer({
  sections,
  acceptedOverrides = {},
  flashSectionId = null,
  pendingSuggestion,
  onSuggestionAccepted,
  onSuggestionDeclined,
  hideNav = false,
  scrollMarginClass = 'scroll-mt-4',
  mode = 'review',
  generationState,
  onRegenerate,
  onRetry,
}: Props) {
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '')

  useEffect(() => {
    const ids = sections.map(s => s.id)
    const observers: IntersectionObserver[] = []
    ids.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveId(id) },
        { rootMargin: '-10% 0px -80% 0px', threshold: 0 }
      )
      observer.observe(el)
      observers.push(observer)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [sections])

  useEffect(() => {
    const handleClick = () => setPopover(null)
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopover(null) }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  const handleAnnotationClick = useCallback((e: React.MouseEvent<HTMLSpanElement>, annotation: Annotation) => {
    e.stopPropagation()
    const anchorRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPopover(prev =>
      prev?.annotation === annotation ? null : { annotation, anchorRect }
    )
  }, [])

  // Streaming mode render path — position-ordered (template-driven, D-08)
  if (mode === 'streaming' && generationState) {
    const sortedSections = Object.values(generationState.sections).sort(
      (a, b) => a.position - b.position
    )
    return (
      <div className="relative">
        {sortedSections.map(section => (
          <SectionStreamCard
            key={section.id}
            section={section}
            onRegenerate={() => onRegenerate?.(section.id)}
            onRetry={() => onRetry?.(section.id)}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-100">
        <span className="text-xs text-gray-400 font-medium">Source highlights:</span>
        {(['rfp', 'kickoff', 'other'] as AnnotationSourceType[]).map(type => (
          <span key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className={`inline-block w-3 h-3 rounded-sm ${HIGHLIGHT_LEGEND[type]}`} />
            {SOURCE_META[type].label}
          </span>
        ))}
      </div>

      {/* Two-column: nav + content */}
      <div className="flex gap-2">
        {!hideNav && <DraftNav sections={sections} activeId={activeId} />}

        <div className="flex-1 min-w-0">
          {sections.map(section => {
            const isSuggested = pendingSuggestion?.targetId === section.id
            const command = isSuggested
              ? DEMO_COMMANDS.find(c => c.key === pendingSuggestion!.commandKey)
              : null

            // Use accepted override blocks if this section was edited, else original
            const blocks = acceptedOverrides[section.id] ?? section.blocks
            const isFlashing = flashSectionId === section.id

            const sectionContent = (
              <>
                {blocks.map((block, i) => (
                  <RenderBlock key={i} block={block} onAnnotationClick={handleAnnotationClick} />
                ))}
                {section.subsections?.map(sub => (
                  <div key={sub.id} id={sub.id} className="mt-4 ml-2 scroll-mt-4">
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">{sub.title}</h4>
                    {sub.blocks.map((block, i) => (
                      <RenderBlock key={i} block={block} onAnnotationClick={handleAnnotationClick} />
                    ))}
                  </div>
                ))}
              </>
            )

            return (
              <div
                key={section.id}
                id={section.id}
                className={`mb-8 ${scrollMarginClass} rounded-lg transition-colors duration-700 ${
                  isFlashing ? 'bg-amber-50' : ''
                }`}
              >
                <h3 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-100">
                  {section.title}
                </h3>

                {isSuggested && command ? (
                  <SuggestedChange
                    explanation={command.explanation}
                    suggestedPreview={command.suggestedPreview}
                    acceptedBlocks={command.acceptedBlocks}
                    originalChildren={sectionContent}
                    onAccept={() => onSuggestionAccepted(command.key)}
                    onDecline={onSuggestionDeclined}
                  />
                ) : (
                  sectionContent
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Dim overlay — sits behind popup, clicks dismiss it */}
      <AnimatePresence>
        {popover && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/10 z-50"
            onClick={() => setPopover(null)}
          />
        )}
      </AnimatePresence>

      {/* Popup */}
      <AnimatePresence>
        {popover && (
          <AnnotationPopover
            key={popover.annotation.sourceDoc + popover.anchorRect.top}
            state={popover}
            onClose={() => setPopover(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
