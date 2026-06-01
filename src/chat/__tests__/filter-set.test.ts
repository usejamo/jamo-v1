import { describe, it, expect } from 'vitest'
import { identityKey, rebuildFilterSet } from '../resolved-items'
import type { ResolvedItem } from '../../types/chat'

function ri(overrides?: Partial<ResolvedItem>): ResolvedItem {
  return {
    originating_action_id: 'a1',
    section_key: 'scope',
    finding_type: 'gap',
    title: 'T',
    description: 'd',
    user_action: 'dismissed',
    applied_changes: '',
    section_content_hash_at_action: 'h',
    timestamp: '2026-05-28T00:00:00.000Z',
    ...overrides,
  }
}

describe('identityKey + rebuildFilterSet (D-20)', () => {
  it('identityKey is stable pipe-separated triple', () => {
    expect(identityKey({ section_key: 's', finding_type: 'gap', title: 't' })).toBe('s|gap|t')
  })

  it('rebuildFilterSet has both id and ik for non-null originating_action_id', () => {
    const s = rebuildFilterSet([ri()])
    expect(s.has('id:a1')).toBe(true)
    expect(s.has('ik:scope|gap|T')).toBe(true)
  })

  it('null originating_action_id contributes only ik key', () => {
    const s = rebuildFilterSet([ri({ originating_action_id: null })])
    expect(s.has('ik:scope|gap|T')).toBe(true)
    expect([...s].some(k => k.startsWith('id:'))).toBe(false)
  })

  it('multiple entries accumulate correctly', () => {
    const s = rebuildFilterSet([
      ri({ originating_action_id: 'a1' }),
      ri({ originating_action_id: 'a2', title: 'T2' }),
    ])
    expect(s.size).toBe(4)
    expect(s.has('id:a1')).toBe(true)
    expect(s.has('id:a2')).toBe(true)
    expect(s.has('ik:scope|gap|T')).toBe(true)
    expect(s.has('ik:scope|gap|T2')).toBe(true)
  })

  it('empty input returns empty Set', () => {
    expect(rebuildFilterSet([]).size).toBe(0)
  })
})
