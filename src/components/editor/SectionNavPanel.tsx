import type { SectionEditorState } from '../../types/workspace'

interface SectionNavPanelProps {
  sections: Record<string, SectionEditorState>
  activeSectionKey: string
  onSelectSection: (sectionKey: string) => void
}

type DotStatus = 'complete' | 'needs-review' | 'missing' | 'generating' | 'error'

function resolveStatus(editorState: SectionEditorState | undefined): DotStatus {
  if (!editorState) return 'missing'
  if (editorState.status === 'generating') return 'generating'
  if (editorState.status === 'error') return 'error'
  if (!editorState.content) return 'missing'
  if (editorState.compliance_flags.length > 0) return 'needs-review'
  if (editorState.status === 'complete') return 'complete'
  return 'missing'
}

function statusDotClass(status: DotStatus): string {
  switch (status) {
    case 'complete':      return 'bg-green-500'
    case 'needs-review':  return 'bg-amber-500'
    case 'generating':    return 'bg-blue-400 animate-pulse'
    case 'error':         return 'bg-red-500'
    case 'missing':
    default:              return 'bg-gray-300'
  }
}

export function SectionNavPanel({ sections, activeSectionKey, onSelectSection }: SectionNavPanelProps) {
  // Derive ordered section keys from workspace state (position-ordered by SectionWorkspace)
  const sectionKeys = Object.keys(sections)

  return (
    <nav className="w-56 shrink-0 border-r border-gray-200 overflow-y-auto bg-white sticky top-0 self-start max-h-screen">
      <p className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Sections
      </p>
      <ul className="space-y-0">
        {sectionKeys.map((key) => {
          const editorState = sections[key]
          const isActive = activeSectionKey === key
          const status = resolveStatus(editorState)

          return (
            <li key={key}>
              <button
                onClick={() => onSelectSection(key)}
                className={`w-full text-left flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 text-sm transition-colors ${
                  isActive
                    ? 'border-l-2 border-jamo-500 bg-gray-50 font-medium text-gray-900'
                    : 'border-l-2 border-transparent text-gray-600'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass(status)}`} />
                <span className="leading-snug">{editorState?.section_key ?? key}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
