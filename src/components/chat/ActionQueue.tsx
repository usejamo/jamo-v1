import React from 'react'

export interface ActionQueueProps {
  actions: any[]
  activeTaskSectionTitle?: string | null
  isWalkthroughActive: boolean
  onCtaClick: (action: any) => void
  onDismiss: (actionId: string) => void
  onUndoDismiss: (actionId: string) => void
  onContinueWalkthrough: () => void
}

// Stub — implemented in Plan 07
export function ActionQueue(_props: ActionQueueProps): React.ReactElement | null {
  return null
}
