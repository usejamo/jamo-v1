import { describe, it, expect } from 'vitest'
import { buildResolvedItemEntry } from '../resolved-items'

const snapshot = {
  id: 'act-1',
  section_key: 'scope',
  finding_type: 'gap' as const,
  title: 'Scope missing detail',
  description: 'desc',
}

describe('buildResolvedItemEntry (D-13, D-14)', () => {
  it('accepted=1 → user_action="fixed" + applied_changes from concat', async () => {
    const e = await buildResolvedItemEntry({
      snapshot,
      resolutionSummary: { accepted: 1, rejected: 0, stale: 0 },
      acceptedEditsInDocOrder: [{ change_summary: 'Added X.' }],
      sectionHtml: '<p>hi</p>',
    })
    expect(e.user_action).toBe('fixed')
    expect(e.applied_changes).toBe('Added X.')
    expect(e.acceptance_summary).toEqual({ accepted: 1, rejected: 0, stale: 0 })
    expect(e.originating_action_id).toBe('act-1')
    expect(e.section_key).toBe('scope')
    expect(e.finding_type).toBe('gap')
    expect(e.title).toBe('Scope missing detail')
    expect(e.description).toBe('desc')
  })

  it('accepted=0, rejected=1 → user_action="dismissed" + applied_changes=""', async () => {
    const e = await buildResolvedItemEntry({
      snapshot,
      resolutionSummary: { accepted: 0, rejected: 1, stale: 0 },
      acceptedEditsInDocOrder: [],
      sectionHtml: '<p>hi</p>',
    })
    expect(e.user_action).toBe('dismissed')
    expect(e.applied_changes).toBe('')
    expect(e.acceptance_summary).toEqual({ accepted: 0, rejected: 1, stale: 0 })
  })

  it('stale-only resolution → user_action="dismissed"', async () => {
    const e = await buildResolvedItemEntry({
      snapshot,
      resolutionSummary: { accepted: 0, rejected: 0, stale: 1 },
      acceptedEditsInDocOrder: [],
      sectionHtml: '<p>hi</p>',
    })
    expect(e.user_action).toBe('dismissed')
    expect(e.applied_changes).toBe('')
    expect(e.acceptance_summary).toEqual({ accepted: 0, rejected: 0, stale: 1 })
  })

  it('section_content_hash_at_action is 64-char hex and timestamp is ISO', async () => {
    const e = await buildResolvedItemEntry({
      snapshot,
      resolutionSummary: { accepted: 1, rejected: 0, stale: 0 },
      acceptedEditsInDocOrder: [{ change_summary: 's' }],
      sectionHtml: '<p>hi</p>',
    })
    expect(e.section_content_hash_at_action).toMatch(/^[0-9a-f]{64}$/)
    expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
