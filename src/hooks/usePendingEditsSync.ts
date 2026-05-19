import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { PendingEdit } from '../types/workspace'
import { buildResolutionMap } from '../context/SectionWorkspaceContext'

interface UsePendingEditsSyncProps {
  /** The pending_edits array from workspace state for a specific section */
  pendingEdits: PendingEdit[]
}

/**
 * Observes pending_edits state changes and persists resolutions to proposal_chats.tool_data
 * using read-modify-write to avoid blind overwrites of concurrent state.
 *
 * Edits are grouped by their own message_id so each EditSummaryCard's resolutions land on
 * its own proposal_chats row — a section can hold edits from multiple propose_edit messages,
 * and each card reads resolutions from its own row.
 *
 * D-14: one DB write per Accept/Reject (fingerprint ref batches rapid changes)
 * D-15: fire-and-forget — silent fail, no toast here (toast lives in AIChatPanel)
 */
export function usePendingEditsSync({ pendingEdits }: UsePendingEditsSyncProps): void {
  const lastSyncedRef = useRef<string>('')

  useEffect(() => {
    if (pendingEdits.length === 0) return

    // Compute a fingerprint of current resolutions to detect changes
    const fingerprint = pendingEdits.map((e) => `${e.id}:${e.resolution}`).join(',')
    if (fingerprint === lastSyncedRef.current) return
    lastSyncedRef.current = fingerprint

    // Only sync if there's at least one non-pending resolution
    const hasResolved = pendingEdits.some((e) => e.resolution !== 'pending')
    if (!hasResolved) return

    // Group edits by their source message — each card persists to its own row
    const byMessage = new Map<string, PendingEdit[]>()
    for (const edit of pendingEdits) {
      if (!edit.message_id) continue
      const group = byMessage.get(edit.message_id)
      if (group) group.push(edit)
      else byMessage.set(edit.message_id, [edit])
    }

    // Read-modify-write per message: fetch current tool_data, merge resolutions, write back.
    // This prevents clobbering payload/version fields that other processes may have written.
    void (async () => {
      for (const [messageId, edits] of byMessage) {
        try {
          const { data } = await supabase
            .from('proposal_chats')
            .select('tool_data')
            .eq('id', messageId)
            .maybeSingle()

          if (!data?.tool_data) continue

          const toolData = data.tool_data as Record<string, unknown> & {
            state?: { resolutions?: Record<string, string> }
          }
          const prevState = toolData.state ?? {}
          const updatedToolData = {
            ...toolData,
            state: {
              ...prevState,
              resolutions: {
                ...(prevState.resolutions ?? {}),
                ...buildResolutionMap(edits),
              },
            },
          }

          await supabase
            .from('proposal_chats')
            .update({ tool_data: updatedToolData })
            .eq('id', messageId)
        } catch {
          // D-15: fire-and-forget — silent fail
        }
      }
    })()
  }, [pendingEdits])
}
