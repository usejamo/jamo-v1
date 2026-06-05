// src/chat/resolved-items.ts
// Phase 14.2.2 — module-level writer + pure helpers for chat_sessions.resolved_items.
// Module-level (not hook-bound) so in-flight promises survive component unmount (D-24).
//
// Sources:
//   - RESEARCH §Pattern 2  (appendResolvedItem retry body)
//   - RESEARCH §Common Op 2 (concatChangeSummaries)
//   - RESEARCH §Common Op 3 (buildResolvedItemEntry)
//   - RESEARCH §Common Op 1 (identityKey + rebuildFilterSet)

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ResolvedItem,
  OriginatingActionSnapshot,
  AcceptanceSummary,
  FindingType,
} from '../types/chat'
import { APPLIED_CHANGES_MAX_CHARS } from '../constants/chat'
import { sha256OfSection } from '../utils/sectionHash'

const RETRY_DELAYS_MS = [500, 1500, 4000] as const
const MODULE_NAME = '[resolved-items]'

// ---- Writer (D-24, D-25, D-26) ----

export async function appendResolvedItem(args: {
  proposalId: string
  userId: string
  orgId: string
  entry: ResolvedItem
  client: SupabaseClient
}): Promise<void> {
  const { proposalId, userId, orgId, entry, client } = args

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { error } = await client.rpc('append_resolved_item', {
        p_proposal_id: proposalId,
        p_user_id: userId,
        p_org_id: orgId,
        p_entry: entry as unknown as Record<string, unknown>,
      })
      if (!error) return
      console.warn(`${MODULE_NAME} RPC error`, {
        proposal_id: proposalId,
        user_id: userId,
        action_id: entry.originating_action_id,
        attempt: attempt + 1,
        error: error.message,
      })
    } catch (err) {
      console.warn(`${MODULE_NAME} threw`, {
        proposal_id: proposalId,
        user_id: userId,
        action_id: entry.originating_action_id,
        attempt: attempt + 1,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (attempt < RETRY_DELAYS_MS.length - 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]))
    }
  }

  console.warn(`${MODULE_NAME} dropped after retries`, {
    proposal_id: proposalId,
    user_id: userId,
    action_id: entry.originating_action_id,
  })
}

// ---- Pure helpers ----

export function concatChangeSummaries(
  acceptedEditsInDocOrder: { change_summary: string }[],
  maxChars = APPLIED_CHANGES_MAX_CHARS,
): string {
  const joined = acceptedEditsInDocOrder
    .map(e => e.change_summary.trim())
    .filter(Boolean)
    .join(' ')
  if (joined.length <= maxChars) return joined

  const slice = joined.slice(0, maxChars)
  const sentenceEnd = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  )
  if (sentenceEnd > maxChars * 0.6) return slice.slice(0, sentenceEnd + 1)
  const wordEnd = slice.lastIndexOf(' ')
  if (wordEnd > 0) return slice.slice(0, wordEnd) + '…'
  return slice + '…'
}

export async function buildResolvedItemEntry(args: {
  snapshot: OriginatingActionSnapshot
  resolutionSummary: AcceptanceSummary
  acceptedEditsInDocOrder: { change_summary: string }[]
  sectionHtml: string
}): Promise<ResolvedItem> {
  const { snapshot, resolutionSummary, acceptedEditsInDocOrder, sectionHtml } = args
  const userAction: 'fixed' | 'dismissed' =
    resolutionSummary.accepted >= 1 ? 'fixed' : 'dismissed'

  const appliedChanges = userAction === 'fixed'
    ? concatChangeSummaries(acceptedEditsInDocOrder)
    : ''

  const hash = await sha256OfSection(sectionHtml)

  return {
    originating_action_id: snapshot.id,
    section_key: snapshot.section_key,
    finding_type: snapshot.finding_type,
    title: snapshot.title,
    description: snapshot.description,
    user_action: userAction,
    applied_changes: appliedChanges,
    section_content_hash_at_action: hash,
    timestamp: new Date().toISOString(),
    acceptance_summary: resolutionSummary,
  }
}

// ---- Filter Set helpers (D-20) ----

export function identityKey(parts: {
  section_key: string
  finding_type: FindingType
  title: string
}): string {
  return `${parts.section_key}|${parts.finding_type}|${parts.title}`
}

export function rebuildFilterSet(items: ResolvedItem[]): Set<string> {
  const s = new Set<string>()
  for (const it of items) {
    // 14.2.3 over-suppression fix: only DISMISSED items seed the hard client-side
    // filter. "Fixed" sections keep evolving, and Haiku (temperature 0) re-emits a
    // same-titled finding for what REMAINS — blanket-hiding fixed identities wrongly
    // suppressed those legitimately-still-present findings (the "5 in DB, 1 visible"
    // bug). Dedup of fixed items belongs to the edge prompt ("describe what remains"),
    // not this filter. A dismissal is a strong, durable "not an issue" signal, so it
    // stays a hard hide here.
    if (it.user_action !== 'dismissed') continue
    if (it.originating_action_id) s.add(`id:${it.originating_action_id}`)
    s.add(`ik:${identityKey({
      section_key: it.section_key,
      finding_type: it.finding_type,
      title: it.title,
    })}`)
  }
  return s
}
