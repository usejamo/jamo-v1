import { useState, useEffect } from 'react'
import jamoLogo from '../assets/jamo_logo.png'
import type { DraftSection } from '../types/draft'

interface Props {
  sections: DraftSection[]
  generated: boolean
}

export default function ProposalContentsSidebar({ sections, generated }: Props) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '')

  // Re-run observer whenever sections become visible in DOM (generated toggles)
  useEffect(() => {
    if (!generated) return
    const observers: IntersectionObserver[] = []
    sections.forEach(s => {
      const el = document.getElementById(s.id)
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveId(s.id) },
        // top offset: condensed header ~50px + main padding; bottom collapses dead zone
        { rootMargin: '-8% 0px -65% 0px', threshold: 0 }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [sections, generated])

  // Reset active to first section when draft is regenerated/re-shown
  useEffect(() => {
    if (generated) setActiveId(sections[0]?.id ?? '')
  }, [generated, sections])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen z-30">

      {/* Brand */}
      <div className="p-6 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <img src={jamoLogo} alt="jamo" className="h-10 w-10" />
          <span className="text-xl font-bold text-gray-900">jamo</span>
        </div>
      </div>

      {/* Section nav */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-3">
          Contents
        </p>

        <ul className={`space-y-0.5 transition-opacity duration-300 ${generated ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {sections.map(section => {
            const isActive = activeId === section.id
            const label = section.title.replace(/^\d+\.\s*/, '')
            return (
              <li key={section.id}>
                <button
                  onClick={() => scrollTo(section.id)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors leading-snug ${
                    isActive
                      ? 'bg-jamo-50 text-jamo-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {label}
                </button>
                {section.subsections && isActive && (
                  <ul className="mt-0.5 mb-1 ml-3 space-y-0.5 border-l border-gray-100 pl-2.5">
                    {section.subsections.map(sub => (
                      <li key={sub.id}>
                        <button
                          onClick={() => scrollTo(sub.id)}
                          className="w-full text-left text-xs px-2 py-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors leading-snug"
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

        {!generated && (
          <p className="text-xs text-gray-400 px-3 mt-3 leading-relaxed">
            Generate the AI draft to enable section navigation.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 shrink-0">
        <p className="text-xs text-gray-400 px-3">jamo Demo v0.1.0</p>
      </div>

    </aside>
  )
}
