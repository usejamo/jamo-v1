import { TOOL_STATUS_LABELS } from '../../types/chat'
import type { ToolName } from '../../types/chat'

interface ToolStatusLabelProps {
  toolName: string | null
}

export function ToolStatusLabel({ toolName }: ToolStatusLabelProps) {
  if (!toolName) return null
  const label = TOOL_STATUS_LABELS[toolName as ToolName] ?? 'Working...'
  return (
    <span className="text-jamo-500 text-xs font-semibold">{label}</span>
  )
}
