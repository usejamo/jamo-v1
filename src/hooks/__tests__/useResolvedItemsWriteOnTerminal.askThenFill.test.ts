// src/hooks/__tests__/useResolvedItemsWriteOnTerminal.askThenFill.test.ts
// Wave 0 stub — un-skipped + wired in Plan 03 (hook attribution) and Plan 04 (onSkip path).
//
// AC-4: resolved_items entry references originating placeholder finding after fill
//       (snapshot via active_task.originating_snapshot)
// AC-9: no resolved_items write when onSkip called (no pending_edits created)
// Tag: 14.2.4-AC4
//
// Plan 03 wiring instructions (AC-4):
//   - Mock activeTask with originating_snapshot field set
//   - Call computeTerminalWrites with a message whose toolData.originating_action
//     comes from activeTask.originating_snapshot (two-step lookup)
//   - Assert the resulting write has non-null originating_action
//
// Plan 04 wiring instructions (AC-9):
//   - Call computeTerminalWrites with empty pending_edits (onSkip path)
//   - Assert result is [] (no writes produced)

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { computeTerminalWrites } from '../useResolvedItemsWriteOnTerminal'
import type { OriginatingActionSnapshot } from '../../types/chat'

// snap() helper — matches the pattern from the analog test file
function snap(overrides?: Partial<OriginatingActionSnapshot>): OriginatingActionSnapshot {
  return {
    id: 'act-1',
    section_key: 'scope',
    finding_type: 'gap',
    title: 'T',
    description: 'd',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useResolvedItemsWriteOnTerminal — ask-then-fill (14.2.4)', () => {
  it('14.2.4-AC4: resolved_items entry has originating_action set when active_task.originating_snapshot present', () => {
    // Risk B read path: active_task.originating_snapshot was embedded by Plan 03 edge write.
    // AIChatPanel two-step lookup (Plan 04 Site 2) stamps it onto toolData.originating_action
    // BEFORE enqueueing the message. This test asserts that computeTerminalWrites produces a
    // write with non-null snapshot — verifying the end-to-end attribution chain.
    const activeTaskSnapshot = snap({ id: 'act-ask-1', section_key: 'study_design' })
    const messages = [{
      id: 'msg-ask',
      role: 'assistant',
      toolData: { tool: 'propose_edit', version: 1, payload: {}, state: {}, originating_action: activeTaskSnapshot },
    }]
    const workspaceState = {
      sections: {
        study_design: {
          content: '<p>filled</p>',
          pending_edits: [
            { message_id: 'msg-ask', resolution: 'accepted', change_summary: 'filled placeholder', change_index: 0 },
          ],
        },
      },
    }
    const writes = computeTerminalWrites({ messages, workspaceState, htmlFieldName: 'content', alreadyWritten: new Set() })
    expect(writes).toHaveLength(1)
    expect(writes[0].snapshot).not.toBeNull()
    expect(writes[0].snapshot.id).toBe('act-ask-1')
    expect(writes[0].snapshot.section_key).toBe('study_design')
  })

  it.skip('14.2.4-AC9: no resolved_items write when onSkip called (no pending_edits created)', () => {
    // Wave 0 stub — implemented in Plan 04
    //
    // Assert computeTerminalWrites with empty pending_edits returns [].
    // onSkip path: active_task is set to discarded, no edits were created.
    //
    // const messages = [{
    //   id: 'msg-skip',
    //   role: 'assistant',
    //   toolData: { version: 1, originating_action: snap() },
    // }]
    // const workspaceState = {
    //   sections: {
    //     scope: {
    //       content: '<p>unchanged</p>',
    //       pending_edits: [],
    //     },
    //   },
    // }
    // const writes = computeTerminalWrites({ messages, workspaceState, htmlFieldName: 'content', alreadyWritten: new Set() })
    // expect(writes).toHaveLength(0)
  })
})
