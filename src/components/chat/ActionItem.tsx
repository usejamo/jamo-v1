import React from 'react'

export interface ActionItemProps {
  action: any
  onCtaClick: (action: any) => void
  onDismiss: (actionId: string) => void
  onUndoDismiss: (actionId: string) => void
}

// Stub — implemented in Plan 07
export function ActionItem(_props: ActionItemProps): React.ReactElement | null {
  return null
}
