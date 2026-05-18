import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { PendingEdit } from '../types/workspace'
import { buildResolutionMap } from '../context/SectionWorkspaceContext'

interface UsePendingEditsSyncProps {
  /** The pending_edits array from workspace state for a specific section */
  pendingEdits: PendingEdit[]
  /** The message_id to target in proposal_chats */
  messageId: string | null
}

/**
 * Observes pending_edits state changes and persists resolutions to proposal_chats.tool_data
 * using read-modify-write to avoid blind overwrites of concurrent state.
 *
 * D-14: one DB write per Accept/Reject (fingerprint ref batches rapid changes)
 * D-15: fire-and-forget — silent fail, no toast here (toast lives in AIChatPanel)
 */
export function usePendingEditsSync({ pendingEdits, messageId }: UsePendingEditsSyncProps): void {
  const lastSyncedRef = useRef<string>('')

  useEffect(() => {
    if (!messageId || pendingEdits.length === 0) return

    // Compute a fingerprint of current resolutions to detect changes
    const fingerprint = pendingEdits.map((e) => `${e.paragraph_id}:${e.resolution}`).join(',')
    if (fingerprint === lastSyncedRef.current) return
    lastSyncedRef.current = fingerprint

    // Only sync if there's at least one non-pending resolution
    const hasResolved = pendingEdits.some((e) => e.resolution !== 'pending')
    if (!hasResolved) return

    // Read-modify-write: fetch current tool_data, merge resolutions, write back
    // This prevents clobbering payload/version fields that other processes may have written
    void (async () => {
      try {
        const { data } = await supabase
          .from('proposal_chats')
          .select('tool_data')
          .eq('id', messageId)
          .maybeSingle()

        if (!data?.tool_data) return

        const resolutions = buildResolutionMap(pendingEdits)
        const updatedToolData = {
          ...data.tool_data,
          state: {
            ...(data.tool_data.state ?? {}),
            resolutions,
          },
        }

        await supabase
          .from('proposal_chats')
          .update({ tool_data: updatedToolData })
          .eq('id', messageId)
      } catch {
        // D-15: fire-and-forget — silent fail
      }
    })()
  }, [pendingEdits, messageId])
}
