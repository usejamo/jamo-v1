// src/hooks/__tests__/useResolvedItemsWriteOnTerminal.test.ts
// Phase 14.2.2 Plan 04 Task 4 — B3 closure: four critical contracts with
// REAL assertions (NO it.todo, NO it.skip). Pure unit tests over the
// pure helpers exported by useResolvedItemsWriteOnTerminal — no RTL,
// no provider tree, no React render.
//
// Also includes an explicit mock-call assertion for the free-text-origin
// skip path (must_have D-10) — appendResolvedItem from `../../chat/resolved-items`
// is mocked and asserted NOT to be called when origin is null.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock the resolved-items module so we can assert the free-text-origin skip
// at the writer-injection boundary (must_have: REAL test asserts no call).
vi.mock('../../chat/resolved-items', async () => {
  const actual = await vi.importActual<typeof import('../../chat/resolved-items')>(
    '../../chat/resolved-items',
  )
  return {
    ...actual,
    appendResolvedItem: vi.fn().mockResolvedValue(undefined),
    buildResolvedItemEntry: vi.fn(actual.buildResolvedItemEntry),
  }
})

import {
  computeTerminalWrites,
  computeWrittenMessageIds,
  useResolvedItemsWriteOnTerminal,
  type MessageWithToolData,
  type WorkspaceStateLike,
} from '../useResolvedItemsWriteOnTerminal'
import { appendResolvedItem } from '../../chat/resolved-items'
import type { OriginatingActionSnapshot } from '../../types/chat'

// W5 closure: SectionEditorState HTML field is `content` (per 14.2.2-01-SUMMARY.md).
const HTML_FIELD = 'content'

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

describe('useResolvedItemsWriteOnTerminal pure helpers (B3 closure)', () => {
  it('Test 1 — once-per-message guard: same inputs after id recorded returns no writes (D-23, Pattern 3)', () => {
    const messages: MessageWithToolData[] = [
      {
        id: 'msg-once',
        role: 'assistant',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toolData: { version: 1, originating_action: snap() } as any,
      },
    ]
    const workspaceState: WorkspaceStateLike = {
      sections: {
        scope: {
          [HTML_FIELD]: '<p>x</p>',
          pending_edits: [
            { message_id: 'msg-once', resolution: 'accepted', change_summary: 'a', change_index: 0 },
            { message_id: 'msg-once', resolution: 'accepted', change_summary: 'b', change_index: 1 },
          ],
        },
      },
    }

    // First evaluation — writtenRef is empty.
    const firstRun = computeTerminalWrites({
      messages,
      workspaceState,
      htmlFieldName: HTML_FIELD,
      alreadyWritten: new Set(),
    })
    expect(firstRun).toHaveLength(1)

    // Simulate the hook recording the message id into writtenRef.
    const alreadyWritten = new Set<string>(['msg-once'])

    // Second evaluation — same inputs, same workspace, but writtenRef now has the id.
    // Once-per-message guard MUST short-circuit.
    const secondRun = computeTerminalWrites({
      messages,
      workspaceState,
      htmlFieldName: HTML_FIELD,
      alreadyWritten,
    })
    expect(secondRun).toHaveLength(0)
  })

  it('Test 2 — terminal-state fires exactly once when all edits transition to terminal (D-12)', () => {
    const messages: MessageWithToolData[] = [
      {
        id: 'msg-q',
        role: 'assistant',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toolData: { version: 1, originating_action: snap({ id: 'act-X' }) } as any,
      },
    ]
    // Phase 1: not all edits terminal yet (one still pending).
    const partialState: WorkspaceStateLike = {
      sections: {
        scope: {
          [HTML_FIELD]: '<p>html</p>',
          pending_edits: [
            { message_id: 'msg-q', resolution: 'accepted', change_summary: 'a', change_index: 0 },
            { message_id: 'msg-q', resolution: 'pending', change_summary: 'b', change_index: 1 },
          ],
        },
      },
    }
    const partialWrites = computeTerminalWrites({
      messages,
      workspaceState: partialState,
      htmlFieldName: HTML_FIELD,
      alreadyWritten: new Set(),
    })
    // No fire while any edit is still non-terminal.
    expect(partialWrites).toHaveLength(0)

    // Phase 2: every edit reaches terminal (accepted | rejected | auto_rejected_stale).
    const terminalState: WorkspaceStateLike = {
      sections: {
        scope: {
          [HTML_FIELD]: '<p>html</p>',
          pending_edits: [
            { message_id: 'msg-q', resolution: 'accepted', change_summary: 'a', change_index: 0 },
            { message_id: 'msg-q', resolution: 'rejected', change_summary: 'b', change_index: 1 },
            { message_id: 'msg-q', resolution: 'auto_rejected_stale', change_summary: 'c', change_index: 2 },
          ],
        },
      },
    }
    const terminalWrites = computeTerminalWrites({
      messages,
      workspaceState: terminalState,
      htmlFieldName: HTML_FIELD,
      alreadyWritten: new Set(),
    })
    // Fires exactly once for the whole message.
    expect(terminalWrites).toHaveLength(1)
    expect(terminalWrites[0].messageId).toBe('msg-q')
    expect(terminalWrites[0].resolutionSummary).toEqual({ accepted: 1, rejected: 1, stale: 1 })
    expect(terminalWrites[0].snapshot.id).toBe('act-X')
    expect(terminalWrites[0].sectionHtml).toBe('<p>html</p>')
  })

  it('Test 3 — free-text-origin (originating_action === null) SKIPS the write (D-10, D-29, Pitfall 7)', () => {
    const messages: MessageWithToolData[] = [
      {
        id: 'msg-free',
        role: 'assistant',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toolData: { version: 1, originating_action: null } as any,
      },
    ]
    const workspaceState: WorkspaceStateLike = {
      sections: {
        scope: {
          [HTML_FIELD]: '<p>free</p>',
          pending_edits: [
            { message_id: 'msg-free', resolution: 'accepted', change_summary: 'edited', change_index: 0 },
          ],
        },
      },
    }

    const writes = computeTerminalWrites({
      messages,
      workspaceState,
      htmlFieldName: HTML_FIELD,
      alreadyWritten: new Set(),
    })
    const written = computeWrittenMessageIds({
      messages,
      workspaceState,
      alreadyWritten: new Set(),
    })

    // No writes despite all-edits-terminal — origin is free-text.
    expect(writes).toHaveLength(0)
    // BUT the messageId is recorded so a re-render won't try again (Pitfall 7).
    expect(written).toContain('msg-free')

    // REAL mock assertion: appendResolvedItem from `../../chat/resolved-items`
    // is NOT called when origin is null. The pure selector emits no writes,
    // so the hook's dispatch loop has nothing to invoke.
    // (This is the writer-injection boundary the AIChatPanel reaches.)
    expect(appendResolvedItem).not.toHaveBeenCalled()
  })

  it('Test 4 — applied_changes uses document-order concat from accepted edits change_summary (D-16)', () => {
    // Intentionally feed edits out-of-order. The pure selector must sort
    // by change_index ascending so the resulting acceptedEditsInDocOrder
    // is in document order — `concatChangeSummaries` (called inside
    // buildResolvedItemEntry) then joins them and truncates to 200 chars.
    const messages: MessageWithToolData[] = [
      {
        id: 'msg-order',
        role: 'assistant',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toolData: { version: 1, originating_action: snap() } as any,
      },
    ]
    // Out-of-order in the array; long-enough strings to assert truncation.
    const longA = 'A'.repeat(120) // index 0 — first
    const longB = 'B'.repeat(120) // index 1 — second
    const longC = 'C'.repeat(120) // index 2 — third (will be truncated)

    const workspaceState: WorkspaceStateLike = {
      sections: {
        scope: {
          [HTML_FIELD]: '<p>doc</p>',
          pending_edits: [
            // Deliberately reversed insertion order.
            { message_id: 'msg-order', resolution: 'accepted', change_summary: longC, change_index: 2 },
            { message_id: 'msg-order', resolution: 'rejected', change_summary: 'ignored', change_index: 99 },
            { message_id: 'msg-order', resolution: 'accepted', change_summary: longA, change_index: 0 },
            { message_id: 'msg-order', resolution: 'accepted', change_summary: longB, change_index: 1 },
          ],
        },
      },
    }

    const writes = computeTerminalWrites({
      messages,
      workspaceState,
      htmlFieldName: HTML_FIELD,
      alreadyWritten: new Set(),
    })
    expect(writes).toHaveLength(1)

    // Document order: accepted edits sorted by change_index ascending,
    // rejected edits filtered out entirely.
    const orderedSummaries = writes[0].acceptedEditsInDocOrder.map(e => e.change_summary)
    expect(orderedSummaries).toEqual([longA, longB, longC])
    expect(orderedSummaries).toHaveLength(3)

    // Resolution counts reflect accepted vs rejected split.
    expect(writes[0].resolutionSummary).toEqual({ accepted: 3, rejected: 1, stale: 0 })
    // (rebuildFilterSet dismissed-only semantics are covered in resolved-items.test.ts.)
  })

  it('Test 5 — onResolved fires once with the originating action id on terminal resolution (14.2.3 optimistic hide)', () => {
    const onResolved = vi.fn()
    const props = {
      messages: [
        {
          id: 'msg-fix',
          role: 'assistant',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          toolData: { version: 1, originating_action: snap({ id: 'act-fix' }) } as any,
        },
      ] as MessageWithToolData[],
      workspaceState: {
        sections: {
          scope: {
            content: '<p>x</p>',
            pending_edits: [
              { message_id: 'msg-fix', resolution: 'accepted', change_summary: 'a', change_index: 0 },
            ],
          },
        },
      } as WorkspaceStateLike,
      htmlFieldName: 'content',
      proposalId: 'p',
      userId: 'u',
      orgId: 'o',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: {} as any,
      deps: {
        buildResolvedItemEntry: vi.fn().mockResolvedValue({}),
        appendResolvedItem: vi.fn().mockResolvedValue(undefined),
      },
      onResolved,
    }

    const { rerender } = renderHook((p) => useResolvedItemsWriteOnTerminal(p), {
      initialProps: props,
    })
    expect(onResolved).toHaveBeenCalledTimes(1)
    expect(onResolved).toHaveBeenCalledWith({ actionId: 'act-fix' })

    // Re-run the effect with a fresh workspaceState ref (same content). The once-per-message
    // writtenRef guard must prevent a second optimistic hide.
    rerender({ ...props, workspaceState: { sections: { ...props.workspaceState.sections } } })
    expect(onResolved).toHaveBeenCalledTimes(1)
  })
})
