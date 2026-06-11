/**
 * activeTaskBuilder.ts — pure shape-builder for needs-value ask_user active_task writes.
 *
 * This module is the CLIENT-SIDE source of truth for the ActiveTask shape used in the
 * needs-value ask_user dispatch path (D-01 condition 1 — structurally identical to
 * set_focus's write). The edge function (chat-with-jamo/index.ts) replicates the same
 * logic inline (Deno edge runtime cannot resolve src/ imports at deploy time).
 *
 * Keeping this file lets vitest unit-test the shape invariant (14.2.4-shape-01) without
 * needing the Deno runtime.
 */

import type { ActiveTask, OriginatingActionSnapshot } from '../types/chat'

export interface BuildNeedsValueActiveTaskArgs {
  section_key: string
  /** The REAL resolved title from target_section/other_sections — NOT section_key (D-10) */
  section_title: string
  /** PendingActionItem.id that triggered this walkthrough */
  action_id?: string
  /** Originating finding snapshot for ask-then-fill attribution (Risk B) */
  snapshot?: OriginatingActionSnapshot
}

/**
 * Build the 12-field ActiveTask object for the needs-value ask_user dispatch path.
 *
 * Shape is structurally identical to set_focus's active_task write (D-01 condition 1),
 * plus two attribution fields: source_action_item_id + originating_snapshot (Risk B).
 *
 * D-10: section_title MUST be the real resolved title, never section_key.
 */
export function buildNeedsValueActiveTask(args: BuildNeedsValueActiveTaskArgs): ActiveTask {
  const now = new Date().toISOString()
  return {
    type: 'walkthrough',
    status: 'active',
    section_key: args.section_key,
    section_title: args.section_title,  // D-10: real title, NOT section_key
    stage: 'gathering_inputs',
    collected_inputs: {},
    pending_paragraph_ids: [],
    accepted_paragraph_ids: [],
    content_hash: '',
    started_at: now,
    last_updated: now,
    source_action_item_id: args.action_id,
    originating_snapshot: args.snapshot,
  }
}

export interface SectionRef {
  key: string
  title: string
}

/**
 * Resolve the real display title for a section key.
 *
 * Lookup order:
 *  1. target_section.key match → return target_section.title
 *  2. other_sections[].key match → return that section's title
 *  3. Fallback → return section_key (snake_case as last resort)
 *
 * D-10: used by both the edge (inlined) and the client (imported here).
 */
export function resolveSectionTitle(
  sectionKey: string,
  targetSection: SectionRef | null | undefined,
  otherSections: SectionRef[]
): string {
  if (targetSection?.key === sectionKey) {
    return targetSection.title
  }
  const match = otherSections.find(s => s.key === sectionKey)
  if (match) {
    return match.title
  }
  return sectionKey
}
