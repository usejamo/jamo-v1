// src/chat/__tests__/activeTaskShape.test.ts
// Un-skipped in Plan 03 — asserts the pure shape-builder (extracted from chat-with-jamo edge).
//
// Invariant (b): needs-value ask_user dispatch produces an ActiveTask object with
//   status:'active', stage:'gathering_inputs', and all required fields — structurally
//   identical to set_focus's write.
// Tag: 14.2.4-shape-01

import { describe, it, expect } from 'vitest'
import type { ActiveTask, OriginatingActionSnapshot } from '../../types/chat'
import { buildNeedsValueActiveTask, resolveSectionTitle } from '../activeTaskBuilder'

describe('activeTask shape — needs-value ask_user path (14.2.4 D-01)', () => {
  it('14.2.4-shape-01: needs-value ask_user dispatch produces ActiveTask with status:active, stage:gathering_inputs, originating_snapshot set', () => {
    const snapshot: OriginatingActionSnapshot = {
      id: 'act-1',
      section_key: 'scope',
      finding_type: 'gap',
      title: 'Scope section has placeholder',
      description: 'Uses descriptive-noun placeholders ("CRO legal entity name")',
    }

    const task = buildNeedsValueActiveTask({
      section_key: 'scope',
      section_title: 'Scope of Work',
      action_id: 'act-1',
      snapshot,
    })

    // Type check — must satisfy ActiveTask
    const _typeCheck: ActiveTask = task

    // All 12 required fields present
    expect(task.type).toBe('walkthrough')
    expect(task.status).toBe('active')
    expect(task.section_key).toBe('scope')
    // D-10: section_title must be the REAL resolved title, NOT section_key
    expect(task.section_title).toBe('Scope of Work')
    expect(task.section_title).not.toBe(task.section_key)
    expect(task.stage).toBe('gathering_inputs')
    expect(task.collected_inputs).toEqual({})
    expect(task.pending_paragraph_ids).toEqual([])
    expect(task.accepted_paragraph_ids).toEqual([])
    expect(task.content_hash).toBe('')
    expect(typeof task.started_at).toBe('string')
    expect(typeof task.last_updated).toBe('string')
    // Risk B: originating_snapshot must be persisted
    expect(task.originating_snapshot).toBeDefined()
    expect(task.originating_snapshot!.id).toBe('act-1')
    expect(task.originating_snapshot!.section_key).toBe('scope')
    expect(task.originating_snapshot!.finding_type).toBe('gap')
    // source_action_item_id from action_id arg
    expect(task.source_action_item_id).toBe('act-1')
  })

  it('14.2.4-shape-01b: resolveSectionTitle returns real title from target_section match', () => {
    const title = resolveSectionTitle(
      'scope',
      { key: 'scope', title: 'Scope of Work' },
      []
    )
    expect(title).toBe('Scope of Work')
  })

  it('14.2.4-shape-01c: resolveSectionTitle returns real title from other_sections match', () => {
    const title = resolveSectionTitle(
      'budget',
      { key: 'scope', title: 'Scope of Work' },
      [
        { key: 'budget', title: 'Budget Overview' },
        { key: 'timeline', title: 'Project Timeline' },
      ]
    )
    expect(title).toBe('Budget Overview')
  })

  it('14.2.4-shape-01d: resolveSectionTitle falls back to section_key when no match', () => {
    const title = resolveSectionTitle(
      'unknown_section',
      { key: 'scope', title: 'Scope of Work' },
      []
    )
    expect(title).toBe('unknown_section')
  })
})
