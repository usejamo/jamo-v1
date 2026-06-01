// Phase 14.2.2 Plan 05 Task 2 — snapshot/golden test for buildResolvedBlock.
// Pins the RESOLVED_ITEMS prompt construction shape so future edits to the 5
// instructions or 2 worked examples surface in code review diffs.

import { describe, it, expect } from 'vitest'
import { buildResolvedBlock } from '../analyze-proposal-gaps/index.ts'

describe('buildResolvedBlock (Phase 14.2.2 Pattern 4)', () => {
  it('returns empty string when no resolved items (D-34)', () => {
    expect(buildResolvedBlock([])).toBe('')
  })

  it('includes RESOLVED_ITEMS header, instructions, and both worked examples when non-empty', () => {
    const block = buildResolvedBlock([
      {
        originating_action_id: 'a1',
        section_key: 'exec',
        finding_type: 'gap',
        title: 'Missing pricing',
        description: 'desc',
        user_action: 'fixed',
        applied_changes: 'Added Q3 timeline',
        section_content_hash_at_action: 'abc',
        timestamp: '2026-05-28T00:00:00Z',
        acceptance_summary: { accepted: 1, rejected: 0, stale: 0 },
        content_status: 'content_changed_since_action',
      },
      {
        originating_action_id: 'a2',
        section_key: 'scope',
        finding_type: 'compliance',
        title: 'Scope lacks ISO citation',
        description: 'desc2',
        user_action: 'dismissed',
        applied_changes: '',
        section_content_hash_at_action: 'def',
        timestamp: '2026-05-29T00:00:00Z',
        content_status: 'content_unchanged_since_action',
      },
    ])
    // RESOLVED_ITEMS header + both entries serialized
    expect(block).toContain('RESOLVED_ITEMS:')
    expect(block).toContain('"section_key": "exec"')
    expect(block).toContain('"section_key": "scope"')
    // Both content_status flags present (one of each)
    expect(block).toContain('content_changed_since_action')
    expect(block).toContain('content_unchanged_since_action')
    // 5 evolve/skip/refine instructions — anchor on key phrases
    expect(block).toContain('describe what REMAINS rather than repeating')
    expect(block).toContain('you may re-surface — but acknowledge what was previously done')
    expect(block).toContain('do not re-surface that finding')
    expect(block).toContain('acceptance_summary field is present')
    expect(block).toContain('Findings should evolve, not repeat.')
    // 2 worked examples
    expect(block).toContain('EVOLVED-FINDING EXAMPLES')
    expect(block).toContain('Example 1 — partial fix')
    expect(block).toContain('Example 2 — dismissed with unchanged content')
    expect(block).toContain('still needs pricing detail (timeline added in prior pass)')
    expect(block).toContain('do not re-flag')
  })

  it('includes acceptance_summary ratio instruction even when entry lacks the field (static text — D-17)', () => {
    const block = buildResolvedBlock([
      {
        originating_action_id: null,
        section_key: 's',
        finding_type: 'compliance',
        title: 't',
        description: 'd',
        user_action: 'dismissed',
        applied_changes: '',
        section_content_hash_at_action: 'x',
        timestamp: '2026-05-28T00:00:00Z',
        content_status: 'content_unchanged_since_action',
      },
    ])
    expect(block).toContain('acceptance_summary')
    expect(block).toContain('ratio')
    // No accidental empty-block: single entry still produces full block
    expect(block).toContain('RESOLVED_ITEMS:')
    expect(block.length).toBeGreaterThan(0)
  })

  it('mixed unchanged+changed annotations both round-trip into serialized JSON', () => {
    const block = buildResolvedBlock([
      {
        originating_action_id: 'a1',
        section_key: 'one',
        finding_type: 'gap',
        title: 't1',
        description: 'd1',
        user_action: 'fixed',
        applied_changes: 'did it',
        section_content_hash_at_action: 'hash1',
        timestamp: '2026-05-28T00:00:00Z',
        content_status: 'content_unchanged_since_action',
      },
      {
        originating_action_id: 'a2',
        section_key: 'two',
        finding_type: 'missing',
        title: 't2',
        description: 'd2',
        user_action: 'dismissed',
        applied_changes: '',
        section_content_hash_at_action: 'hash2',
        timestamp: '2026-05-29T00:00:00Z',
        content_status: 'content_changed_since_action',
      },
    ])
    // Both annotations are present in the serialized JSON
    const occurrencesUnchanged = (block.match(/content_unchanged_since_action/g) ?? []).length
    const occurrencesChanged = (block.match(/content_changed_since_action/g) ?? []).length
    expect(occurrencesUnchanged).toBeGreaterThanOrEqual(1)
    expect(occurrencesChanged).toBeGreaterThanOrEqual(1)
  })
})
