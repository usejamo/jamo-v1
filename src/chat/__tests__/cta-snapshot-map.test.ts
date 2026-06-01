import { describe, it, expect } from 'vitest'
import {
  makeCtaKey,
  captureSnapshot,
  takeSnapshot,
  type CtaActionLike,
} from '../ctaSnapshotMap'
import type { OriginatingActionSnapshot } from '../../types/chat'

function makeAction(overrides?: Partial<CtaActionLike>): CtaActionLike {
  return {
    id: 'act-1',
    section_key: 'executive_summary',
    type: 'gap',
    title: 'Missing pricing',
    description: 'add Q3 pricing',
    cta_tool: 'propose_edit',
    ...overrides,
  }
}

describe('ctaSnapshotMap (W1 closure — free-text branch coverage)', () => {
  it('makeCtaKey produces a stable colon-separated pair', () => {
    expect(makeCtaKey({ section_key: 's', cta_tool: 'propose_edit' })).toBe('s:propose_edit')
  })

  it('captureSnapshot stores a snapshot keyed by section_key:cta_tool (D-9)', () => {
    const map = new Map<string, OriginatingActionSnapshot>()
    const action = makeAction()
    const snap = captureSnapshot(map, action)
    expect(snap).toEqual({
      id: 'act-1',
      section_key: 'executive_summary',
      finding_type: 'gap',
      title: 'Missing pricing',
      description: 'add Q3 pricing',
    })
    expect(map.size).toBe(1)
    expect(map.get('executive_summary:propose_edit')).toEqual(snap)
  })

  it('captureSnapshot coerces null description to empty string', () => {
    const map = new Map<string, OriginatingActionSnapshot>()
    const snap = captureSnapshot(map, makeAction({ description: null }))
    expect(snap.description).toBe('')
  })

  it('takeSnapshot returns snapshot AND deletes the entry on hit (D-9 → tool_data merge)', () => {
    const map = new Map<string, OriginatingActionSnapshot>()
    captureSnapshot(map, makeAction())
    const taken = takeSnapshot(map, 'executive_summary', 'propose_edit')
    expect(taken).not.toBeNull()
    expect(taken!.id).toBe('act-1')
    // Now drained.
    expect(map.has('executive_summary:propose_edit')).toBe(false)
    expect(map.size).toBe(0)
  })

  it('takeSnapshot returns null when no snapshot was captured (D-10 free-text branch)', () => {
    const map = new Map<string, OriginatingActionSnapshot>()
    // Simulates a free-text propose_edit: no preceding CTA click → no Map entry.
    const taken = takeSnapshot(map, 'scope', 'propose_edit')
    expect(taken).toBeNull()
    // And it stayed empty.
    expect(map.size).toBe(0)
  })

  it('takeSnapshot is idempotent: second call returns null', () => {
    const map = new Map<string, OriginatingActionSnapshot>()
    captureSnapshot(map, makeAction())
    expect(takeSnapshot(map, 'executive_summary', 'propose_edit')).not.toBeNull()
    expect(takeSnapshot(map, 'executive_summary', 'propose_edit')).toBeNull()
  })

  it('last-click-wins when same section+tool clicked twice (NEW 4 T-14.2.2-15)', () => {
    const map = new Map<string, OriginatingActionSnapshot>()
    captureSnapshot(map, makeAction({ id: 'act-first', title: 'A' }))
    captureSnapshot(map, makeAction({ id: 'act-second', title: 'B' }))
    const taken = takeSnapshot(map, 'executive_summary', 'propose_edit')
    expect(taken!.id).toBe('act-second')
  })
})
