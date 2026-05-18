import React from 'react'
import type { ProposeEditPayload, ProposeEditState } from '../../types/chat'

export interface EditSummaryCardProps {
  payload: ProposeEditPayload
  state: ProposeEditState
  sectionKey: string
  message_id: string  // Required for persistResolutions hook to target correct proposal_chats row
  onReviewInEditor: () => void
  onAcceptAll: () => void
  onRejectAll: () => void
  onUpdateResolution?: (changeId: string, resolution: 'accepted' | 'rejected') => void
}

// Stub — implemented in Plan 05
export function EditSummaryCard(_props: EditSummaryCardProps): React.ReactElement | null {
  return null
}
