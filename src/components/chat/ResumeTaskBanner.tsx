import React from 'react'

export interface ResumeTaskBannerProps {
  activeTask: any
  currentSectionContent: string
  onContinue: () => void
  onStartOver: () => void
  onRestart: () => void
  onDiscard: () => void
}

// Stub — implemented in Plan 07
export function ResumeTaskBanner(_props: ResumeTaskBannerProps): React.ReactElement | null {
  return null
}
