import { describe, it, expect } from 'vitest'
import {
  buildSectionPendingEdits,
  reconcileOutcome,
  composeChatSummary,
  type ParagraphGroup,
  type SkipEntry,
} from '../substitute'

const groupA: ParagraphGroup = {
  section_key: 'scope',
  paragraph_id: 'para-1',
  paragraphOuterHtml:
    '<p data-id="para-1">Sponsor: <span data-placeholder-id="p1" data-placeholder-label="sponsor name">sponsor name</span>.</p>',
  placeholderIds: ['p1'],
  labels: ['sponsor name'],
}

describe('buildSectionPendingEdits', () => {
  it('emits one section-namespaced PendingEdit per group, never setting anchor_hash', () => {
    const edits = buildSectionPendingEdits('bulk-1', 'scope', [groupA], 'Acme Pharma')
    expect(edits).toHaveLength(1)
    expect(edits[0].id).toBe('bulk-1-scope-0')
    expect(edits[0].operation).toBe('replace')
    expect(edits[0].paragraph_id).toBe('para-1')
    expect(edits[0].section_key).toBe('scope')
    expect(edits[0].after_html).toContain('Acme Pharma')
    expect(edits[0].after_html).not.toContain('data-placeholder-id')
    expect(edits[0].resolution).toBe('pending')
    expect(edits[0].message_id).toBe('bulk-1')
    expect(edits[0].change_index).toBe(0)
    expect((edits[0] as Record<string, unknown>).anchor_hash).toBeUndefined()
  })
})

describe('reconcileOutcome', () => {
  it('full-success: all resolved and applied -> outcome full', () => {
    const result = reconcileOutcome({
      proposedTargets: [{ section_key: 'scope', placeholder_id: 'p1', decision: 'substitute' }],
      resolvedSubstitutions: [
        { section_key: 'scope', placeholder_id: 'p1', paragraph_id: 'para-1', paragraphOuterHtml: groupA.paragraphOuterHtml, label: 'sponsor name' },
      ],
      modelSkips: [],
      clientSkips: [],
      appliedCount: 1,
    })
    expect(result.outcome).toBe('full')
    expect(result.applied).toBe(1)
    expect(result.skipped).toHaveLength(0)
  })

  it('partial: one genuine model multi-part skip -> outcome partial, skip enumerated', () => {
    const modelSkip: SkipEntry = { section_key: 'budget', label: 'timeline range', reason: 'multi-part value cannot be satisfied by one literal' }
    const result = reconcileOutcome({
      proposedTargets: [
        { section_key: 'scope', placeholder_id: 'p1', decision: 'substitute' },
        { section_key: 'budget', placeholder_id: 'p9', decision: 'skip', skip_reason: modelSkip.reason },
      ],
      resolvedSubstitutions: [
        { section_key: 'scope', placeholder_id: 'p1', paragraph_id: 'para-1', paragraphOuterHtml: groupA.paragraphOuterHtml, label: 'sponsor name' },
      ],
      modelSkips: [modelSkip],
      clientSkips: [],
      appliedCount: 1,
    })
    expect(result.outcome).toBe('partial')
    expect(result.applied).toBe(1)
    expect(result.skipped).toContainEqual(modelSkip)
  })

  it('D-15: a proposed-substitute target the client could not resolve moves to skipped(unresolvable), applied decremented', () => {
    const clientSkip: SkipEntry = { section_key: 'scope', label: 'sponsor name', reason: 'unresolvable' }
    const result = reconcileOutcome({
      proposedTargets: [{ section_key: 'scope', placeholder_id: 'p1', decision: 'substitute' }],
      resolvedSubstitutions: [], // client could not locate it in the live doc
      modelSkips: [],
      clientSkips: [clientSkip],
      appliedCount: 1, // caller naively counted it as applied before reconciliation
    })
    expect(result.applied).toBe(0)
    expect(result.skipped).toContainEqual(clientSkip)
  })

  it('zero-match: nothing applied and every skip is client-unresolvable (no genuine model skip)', () => {
    const clientSkip: SkipEntry = { section_key: 'scope', label: 'not a placeholder', reason: 'unresolvable' }
    const result = reconcileOutcome({
      proposedTargets: [{ section_key: 'scope', placeholder_id: 'ghost', decision: 'substitute' }],
      resolvedSubstitutions: [],
      modelSkips: [],
      clientSkips: [clientSkip],
      appliedCount: 0,
    })
    expect(result.outcome).toBe('zero-match')
    expect(result.applied).toBe(0)
  })
})

describe('composeChatSummary', () => {
  it('full outcome -> "Substituted "value" in N sections."', () => {
    const summary = composeChatSummary('Acme Pharma', { applied: 2, skipped: [], outcome: 'full' }, 'sponsor name')
    expect(summary).toBe('Substituted "Acme Pharma" in 2 sections.')
  })

  it('partial outcome -> "Substituted in N sections, skipped M."', () => {
    const summary = composeChatSummary(
      'Acme Pharma',
      { applied: 2, skipped: [{ section_key: 'budget', label: 'timeline range', reason: 'multi-part' }], outcome: 'partial' },
      'sponsor name'
    )
    expect(summary).toBe('Substituted in 2 sections, skipped 1.')
  })

  it('zero-match outcome -> "isn\'t a fillable placeholder" message', () => {
    const summary = composeChatSummary('Acme Pharma', { applied: 0, skipped: [], outcome: 'zero-match' }, 'random text')
    expect(summary).toContain('isn\'t a fillable placeholder')
    expect(summary).toContain('random text')
  })
})
