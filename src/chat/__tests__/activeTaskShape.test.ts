// src/chat/__tests__/activeTaskShape.test.ts
// Wave 0 stub — un-skipped + wired in Plan 03 (extract pure shape-builder from chat-with-jamo edge).
//
// Invariant (b): needs-value ask_user dispatch produces an ActiveTask object passing
//   ActiveTask constraints with status:'active', stage:'gathering_inputs', and all
//   required fields — structurally identical to set_focus's write.
// Tag: 14.2.4-shape-01
//
// Plan 03 wiring instructions:
//   Extract the active_task shape-building logic from chat-with-jamo/index.ts into a
//   pure function (e.g., buildAskUserActiveTask). Test it here with no edge runtime needed.
//
//   Assert all 12 required fields are present:
//     type, status, section_key, section_title, stage, collected_inputs,
//     pending_paragraph_ids, accepted_paragraph_ids, content_hash,
//     started_at, last_updated, originating_snapshot
//
//   Example assertion shape:
//     expect(task.type).toBe('walkthrough')
//     expect(task.status).toBe('active')
//     expect(task.stage).toBe('gathering_inputs')
//     expect(task.originating_snapshot).not.toBeNull()
//     expect(task.originating_snapshot.id).toBe('act-1')
//     expect(task.section_title).not.toBe(task.section_key) // D-10: real title resolved

import { describe, it } from 'vitest'
import type { ActiveTask } from '../../types/chat'

// Type-only import — resolves now. The originating_snapshot field arrives in Plan 02.
// No module-scope field access on ActiveTask that would fail tsc before Plan 02.

describe('activeTask shape — needs-value ask_user path (14.2.4 D-01)', () => {
  it.skip('14.2.4-shape-01: needs-value ask_user dispatch produces ActiveTask with status:active, stage:gathering_inputs, originating_snapshot set', () => {
    // Wave 0 stub — implemented in Plan 03
    //
    // Extract pure shape-builder from chat-with-jamo/index.ts; call it here.
    // Assert all required fields present:
    //   type: 'walkthrough'
    //   status: 'active'
    //   section_key: <string>
    //   section_title: <resolved title, not section_key> (D-10)
    //   stage: 'gathering_inputs'
    //   collected_inputs: {}
    //   pending_paragraph_ids: []
    //   accepted_paragraph_ids: []
    //   content_hash: ''
    //   started_at: <ISO string>
    //   last_updated: <ISO string>
    //   originating_snapshot: { id, section_key, finding_type, title, description }
    //
    // Satisfies D-01 condition 1: ask_user dispatch writes ActiveTask identical
    // in shape to set_focus's write.

    // Suppress unused-import lint until un-skipped:
    void (undefined as unknown as ActiveTask)
  })
})
