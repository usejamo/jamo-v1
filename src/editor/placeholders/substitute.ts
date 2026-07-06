// Pure, deterministic placeholder substitution primitives — Phase 14.4 Wave 0.
//
// No editor instance, no SSE, no React: strings/structs in, strings/structs out.
// Downstream consumers (AIChatPanel fan-out, SectionEditorBlock materialize) treat
// the output of this module as ordinary paragraph replaces (D-07/D-08/D-09).

import type { PendingEdit, ChangeResolution } from '../../types/workspace'

// ── Locate ──────────────────────────────────────────────────────────────────

/** Result of resolving a single `data-placeholder-id` span to its containing
 *  `data-id` paragraph. Null when the id is absent from the section HTML
 *  (no fuzzy fallback — R2) or when the span has no `data-id` ancestor. */
export interface PlaceholderLocation {
  paragraph_id: string
  paragraphOuterHtml: string
  label: string | null
}

/** A resolved target carries the section + placeholder identity alongside the
 *  location, so it can be grouped across multiple targets in one section. */
export interface ResolvedTarget extends PlaceholderLocation {
  section_key: string
  placeholder_id: string
}

/** A group of targets sharing one containing paragraph — collapses N spans in
 *  the same `<p data-id>` into a single composed after_html (D-09). */
export interface ParagraphGroup {
  section_key: string
  paragraph_id: string
  paragraphOuterHtml: string
  placeholderIds: string[]
  labels: string[]
}

/** Model-proposed decision for one placeholder target: fill it (single-value)
 *  or skip it (heterogeneous / multi-part — cannot be satisfied by one value). */
export type SubstituteDecision = 'substitute' | 'skip'

export interface SubstituteTarget {
  section_key: string
  placeholder_id: string
  decision: SubstituteDecision
  skip_reason?: string
}

/** Finds the span matching `placeholder_id` anywhere in `sectionHtml` and
 *  returns its containing `data-id` paragraph + label. Returns null when the
 *  id is not present in the live doc (R2 — client is authoritative, D-04) or
 *  when the matched span has no `data-id` ancestor (Pitfall 2). Never a blind
 *  write — the caller turns a null into a client skip. */
export function resolvePlaceholderTarget(
  sectionHtml: string,
  placeholder_id: string
): PlaceholderLocation | null {
  const doc = new DOMParser().parseFromString(sectionHtml, 'text/html')
  const span = Array.from(doc.querySelectorAll('[data-placeholder-id]')).find(
    (el) => el.getAttribute('data-placeholder-id') === placeholder_id
  )
  if (!span) return null

  const paragraph = span.closest('[data-id]')
  if (!paragraph) return null

  return {
    paragraph_id: paragraph.getAttribute('data-id') as string,
    paragraphOuterHtml: paragraph.outerHTML,
    label: span.getAttribute('data-placeholder-label'),
  }
}

/** Collapses resolved targets sharing a (section_key, paragraph_id) pair into
 *  one group carrying all of that paragraph's placeholder ids (D-09 — two
 *  placeholders in one paragraph produce ONE composed after_html). */
export function groupTargetsByParagraph(resolvedTargets: ResolvedTarget[]): ParagraphGroup[] {
  const groups = new Map<string, ParagraphGroup>()

  for (const target of resolvedTargets) {
    const key = `${target.section_key}::${target.paragraph_id}`
    let group = groups.get(key)
    if (!group) {
      group = {
        section_key: target.section_key,
        paragraph_id: target.paragraph_id,
        paragraphOuterHtml: target.paragraphOuterHtml,
        placeholderIds: [],
        labels: [],
      }
      groups.set(key, group)
    }
    group.placeholderIds.push(target.placeholder_id)
    if (target.label) group.labels.push(target.label)
  }

  return Array.from(groups.values())
}

// ── Substitute ──────────────────────────────────────────────────────────────

/** Replaces each `placeholderIds` span's content inside `paragraphOuterHtml`
 *  with a plain text node carrying `value` (mark stripped, D-10), and returns
 *  the full outerHTML of the containing paragraph (data-id preserved, D-07 —
 *  accept does deleteRange+insertContentAt over the whole paragraph).
 *  `value` is inserted via `createTextNode` — never parsed as HTML (T-14.4-02,
 *  XSS mitigation: angle brackets/scripts are escaped by the DOM, not markup).
 *  Byte-identical on repeat given identical inputs (R3). */
export function buildSubstitutedParagraphHtml(
  paragraphOuterHtml: string,
  placeholderIds: string[],
  value: string
): string {
  const doc = new DOMParser().parseFromString(paragraphOuterHtml, 'text/html')
  const para = doc.body.firstElementChild
  if (!para) return paragraphOuterHtml

  for (const id of placeholderIds) {
    const span = Array.from(para.querySelectorAll('[data-placeholder-id]')).find(
      (el) => el.getAttribute('data-placeholder-id') === id
    )
    if (span) {
      span.replaceWith(doc.createTextNode(value))
    }
  }

  return para.outerHTML
}

// ── Edit-builder ──────────────────────────────────────────────────────────────

/** Builds one synthetic `replace` PendingEdit per paragraph group. Ids are
 *  namespaced `${bulkMsgId}-${section_key}-${i}` so they stay globally unique
 *  across the whole fan-out (Pitfall 4). Never sets anchor_hash / anchorFrom /
 *  anchorTo — anchor_hash is added by materialize, the anchorFrom/anchorTo
 *  fields are runtime-only decoration state. */
export function buildSectionPendingEdits(
  bulkMsgId: string,
  section_key: string,
  groups: ParagraphGroup[],
  value: string
): PendingEdit[] {
  return groups.map((group, i) => ({
    id: `${bulkMsgId}-${section_key}-${i}`,
    paragraph_id: group.paragraph_id,
    section_key,
    operation: 'replace' as const,
    before_html: group.paragraphOuterHtml,
    after_html: buildSubstitutedParagraphHtml(group.paragraphOuterHtml, group.placeholderIds, value),
    change_summary: `filled ${group.labels[0] ?? 'placeholder'} placeholder`,
    resolution: 'pending' as ChangeResolution,
    message_id: bulkMsgId,
    change_index: i,
    created_at: new Date().toISOString(),
  }))
}

// ── Reconciler ──────────────────────────────────────────────────────────────

export interface SkipEntry {
  section_key: string
  label: string
  reason: string
}

export type ReconcileOutcomeKind = 'full' | 'partial' | 'zero-match'

export interface ReconciledOutcome {
  applied: number
  skipped: SkipEntry[]
  outcome: ReconcileOutcomeKind
}

export interface ReconcileInput {
  /** The model's full claimed target list (substitute + skip decisions) — an
   *  untrusted CLAIM, not the source of truth (D-04). */
  proposedTargets: SubstituteTarget[]
  /** Targets the client successfully resolved against the live doc. */
  resolvedSubstitutions: ResolvedTarget[]
  /** Genuine model-declared skips — e.g. multi-part values one literal can't
   *  satisfy. Distinct from client-side resolution failures. */
  modelSkips: SkipEntry[]
  /** Proposed-substitute targets the client could NOT resolve from the live
   *  doc (absent id / no data-id ancestor) — D-15: these move from applied
   *  into skipped(unresolvable), never a blind write. */
  clientSkips: SkipEntry[]
  /** Count of edits actually applied (e.g. via materialize/accept). Clamped
   *  to resolvedSubstitutions.length so an unresolved target can never be
   *  double-counted as applied (D-15). */
  appliedCount: number
}

/** Reconciles the model's proposed targets against what the client could
 *  actually resolve/apply into an honest applied/skipped tally + outcome.
 *  outcome='zero-match' only when nothing applied AND every skip is a client
 *  resolution failure (never a genuine model multi-part skip) — R7. */
export function reconcileOutcome(input: ReconcileInput): ReconciledOutcome {
  const { resolvedSubstitutions, modelSkips, clientSkips, appliedCount } = input

  const applied = Math.max(0, Math.min(appliedCount, resolvedSubstitutions.length))
  const skipped: SkipEntry[] = [...modelSkips, ...clientSkips]

  let outcome: ReconcileOutcomeKind
  if (applied === 0 && modelSkips.length === 0 && clientSkips.length > 0) {
    outcome = 'zero-match'
  } else if (skipped.length > 0) {
    outcome = 'partial'
  } else {
    outcome = 'full'
  }

  return { applied, skipped, outcome }
}

/** Composes the one chat one-liner for a bulk-substitute outcome (R7). */
export function composeChatSummary(
  value: string,
  reconciled: ReconciledOutcome,
  targetLabel: string
): string {
  if (reconciled.outcome === 'zero-match') {
    return `"${targetLabel}" isn't a fillable placeholder — nothing to substitute.`
  }
  if (reconciled.outcome === 'partial') {
    return `Substituted in ${reconciled.applied} sections, skipped ${reconciled.skipped.length}.`
  }
  return `Substituted "${value}" in ${reconciled.applied} sections.`
}
