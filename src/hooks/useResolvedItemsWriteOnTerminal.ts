// src/hooks/useResolvedItemsWriteOnTerminal.ts
// Phase 14.2.2 — pure hook for once-per-message terminal-state writer.
// Extracted from AIChatPanel.tsx so the four critical contracts can be
// unit-tested WITHOUT a React Testing Library provider tree (B3 closure).
//
// Sources:
//   - RESEARCH §Pattern 3 (all-terminal selector + once-per-message guard)
//   - PATTERNS §NEW 5 (selector-vs-reducer rationale — selector wins)
//   - CONTEXT D-10, D-12, D-13, D-14, D-15, D-16, D-23

import { useEffect, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  OriginatingActionSnapshot,
  ResolvedItem,
  ToolDataEnvelope,
  AcceptanceSummary,
} from '../types/chat'

const TERMINAL_RESOLUTIONS = new Set<string>([
  'accepted',
  'rejected',
  'auto_rejected_stale',
])

export type MessageWithToolData = {
  id: string
  role: 'assistant' | 'user' | string
  toolData?: ToolDataEnvelope
}

export type PendingEditLike = {
  message_id: string
  resolution: string
  change_summary?: string
  change_index?: number
}

export type WorkspaceSectionLike = {
  // Verified field name per 14.2.2-01-SUMMARY.md (W5 closure): `content`.
  // Intentionally minimal — only the fields the pure selector reads.
  pending_edits?: PendingEditLike[]
}

// Permissive workspace shape — accepts the real SectionWorkspaceContext
// `WorkspaceState` (sections: Record<string, SectionEditorState>) WITHOUT
// requiring callers to cast. Section value typed as `unknown` and narrowed
// inside the pure functions; this avoids forcing an index-signature on the
// concrete SectionEditorState interface.
export type WorkspaceStateLike = {
  sections: Record<string, unknown>
}

export type TerminalWrite = {
  messageId: string
  snapshot: OriginatingActionSnapshot
  resolutionSummary: AcceptanceSummary
  acceptedEditsInDocOrder: { change_summary: string }[]
  sectionHtml: string
}

type BuildEntryFn = (args: {
  snapshot: OriginatingActionSnapshot
  resolutionSummary: AcceptanceSummary
  acceptedEditsInDocOrder: { change_summary: string }[]
  sectionHtml: string
}) => Promise<ResolvedItem>

type AppendFn = (args: {
  proposalId: string
  userId: string
  orgId: string
  entry: ResolvedItem
  client: SupabaseClient
}) => Promise<void>

/**
 * PURE selector. Given the current messages + workspace state + the verified
 * HTML field name + a Set of message ids already written, returns the list of
 * terminal-state writes to dispatch (or [] if none).
 *
 * Free-text-origin propose_edits (originating_action === null) intentionally
 * produce NO write (D-10). The companion `computeWrittenMessageIds` still
 * surfaces those message ids so the caller can mark them written and prevent
 * re-dispatch on subsequent renders (Pitfall 7).
 *
 * NEVER calls React, NEVER calls the Supabase client. B3 closure: unit-testable
 * in isolation.
 */
export function computeTerminalWrites(args: {
  messages: MessageWithToolData[]
  workspaceState: WorkspaceStateLike
  htmlFieldName: string
  alreadyWritten: Set<string>
}): TerminalWrite[] {
  const { messages, workspaceState, htmlFieldName, alreadyWritten } = args
  const writes: TerminalWrite[] = []

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    if (!msg.toolData) continue
    if (alreadyWritten.has(msg.id)) continue

    const editsForMessage: {
      resolution: string
      change_summary?: string
      sectionKey: string
      orderIndex: number
    }[] = []
    for (const [sectionKey, sectionRaw] of Object.entries(workspaceState.sections ?? {})) {
      const section = sectionRaw as WorkspaceSectionLike | undefined
      for (const e of section?.pending_edits ?? []) {
        if (e.message_id === msg.id) {
          editsForMessage.push({
            resolution: e.resolution,
            change_summary: e.change_summary,
            sectionKey,
            orderIndex: e.change_index ?? 0,
          })
        }
      }
    }
    if (editsForMessage.length === 0) continue
    const allTerminal = editsForMessage.every(e => TERMINAL_RESOLUTIONS.has(e.resolution))
    if (!allTerminal) continue

    // D-10 — free-text origin: explicit skip. Caller still marks written via
    // computeWrittenMessageIds to suppress duplicate dispatch attempts on re-render.
    const snapshot = msg.toolData.originating_action ?? null
    if (!snapshot) continue

    const resolutionSummary: AcceptanceSummary = {
      accepted: editsForMessage.filter(e => e.resolution === 'accepted').length,
      rejected: editsForMessage.filter(e => e.resolution === 'rejected').length,
      stale: editsForMessage.filter(e => e.resolution === 'auto_rejected_stale').length,
    }
    const acceptedEditsInDocOrder = editsForMessage
      .filter(e => e.resolution === 'accepted')
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(e => ({ change_summary: e.change_summary ?? '' }))

    const section = workspaceState.sections[snapshot.section_key] as
      | Record<string, unknown>
      | undefined
    const sectionHtml = (section?.[htmlFieldName] as string | undefined) ?? ''

    writes.push({
      messageId: msg.id,
      snapshot,
      resolutionSummary,
      acceptedEditsInDocOrder,
      sectionHtml,
    })
  }

  return writes
}

/**
 * PURE selector. Returns the list of message ids the caller should record into
 * its written-ref — INCLUDING free-text skips, INCLUDING successful writes.
 *
 * Free-text branch coverage hinges on this being separable from the writes list
 * (D-10 + Pitfall 7).
 */
export function computeWrittenMessageIds(args: {
  messages: MessageWithToolData[]
  workspaceState: WorkspaceStateLike
  alreadyWritten: Set<string>
}): string[] {
  const { messages, workspaceState, alreadyWritten } = args
  const out: string[] = []
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    if (!msg.toolData) continue
    if (alreadyWritten.has(msg.id)) continue

    let hasEdits = false
    let allTerminal = true
    for (const sectionRaw of Object.values(workspaceState.sections ?? {})) {
      const section = sectionRaw as WorkspaceSectionLike | undefined
      for (const e of section?.pending_edits ?? []) {
        if (e.message_id !== msg.id) continue
        hasEdits = true
        if (!TERMINAL_RESOLUTIONS.has(e.resolution)) {
          allTerminal = false
          break
        }
      }
      if (!allTerminal) break
    }
    if (hasEdits && allTerminal) out.push(msg.id)
  }
  return out
}

/**
 * The hook itself. Thin React shell over the pure functions above. Stores the
 * written-ref so re-renders cannot re-fire writes (D-23, Pattern 3 closure).
 */
export function useResolvedItemsWriteOnTerminal(args: {
  messages: MessageWithToolData[]
  workspaceState: WorkspaceStateLike
  htmlFieldName: string
  proposalId: string
  userId: string
  orgId: string
  client: SupabaseClient
  deps: {
    buildResolvedItemEntry: BuildEntryFn
    appendResolvedItem: AppendFn
  }
}): void {
  const writtenRef = useRef<Set<string>>(new Set())
  const {
    messages,
    workspaceState,
    htmlFieldName,
    proposalId,
    userId,
    orgId,
    client,
    deps,
  } = args

  useEffect(() => {
    const writes = computeTerminalWrites({
      messages,
      workspaceState,
      htmlFieldName,
      alreadyWritten: writtenRef.current,
    })
    const allTerminalIds = computeWrittenMessageIds({
      messages,
      workspaceState,
      alreadyWritten: writtenRef.current,
    })
    // Mark every terminal message id as written FIRST — including free-text
    // skips — so a re-render does not redo the work.
    for (const id of allTerminalIds) writtenRef.current.add(id)

    for (const w of writes) {
      void (async () => {
        const entry = await deps.buildResolvedItemEntry({
          snapshot: w.snapshot,
          resolutionSummary: w.resolutionSummary,
          acceptedEditsInDocOrder: w.acceptedEditsInDocOrder,
          sectionHtml: w.sectionHtml,
        })
        void deps.appendResolvedItem({
          proposalId,
          userId,
          orgId,
          entry,
          client,
        })
      })()
    }
  }, [messages, workspaceState, htmlFieldName, proposalId, userId, orgId, client, deps])
}
