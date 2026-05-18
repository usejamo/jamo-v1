import { describe, it, expect } from 'vitest'
import { workspaceReducer, buildResolutionMap } from '../SectionWorkspaceContext'
import type { WorkspaceState, SectionEditorState, PendingEdit } from '../../types/workspace'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePendingEdit(overrides: Partial<PendingEdit> = {}): PendingEdit {
  return {
    id: 'edit-1',
    paragraph_id: 'para-1',
    section_key: 'exec_summary',
    operation: 'replace',
    before_html: '<p>old</p>',
    after_html: '<p>new</p>',
    change_summary: 'Updated text',
    resolution: 'pending',
    message_id: 'msg-1',
    change_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeSection(overrides: Partial<SectionEditorState> = {}): SectionEditorState {
  return {
    section_key: 'exec_summary',
    name: 'Executive Summary',
    content: '<p>Hello</p>',
    last_saved_content: null,
    is_locked: false,
    status: 'complete',
    autosave_status: 'idle',
    compliance_flags: [],
    compliance_checking: false,
    issues: {},
    ai_action: null,
    pending_edits: [],
    ...overrides,
  }
}

function makeState(sectionOverrides: Partial<SectionEditorState> = {}): WorkspaceState {
  return {
    sections: {
      exec_summary: makeSection(sectionOverrides),
    },
    active_section: 'exec_summary',
    version_history_open: null,
    consistency_flags: [],
    consistency_dismissed: false,
    consistency_check_ran: false,
  }
}

// ── Reducer tests ─────────────────────────────────────────────────────────────

describe('workspaceReducer — pending edits actions', () => {
  it('14.2-A2-01: SET_PENDING_EDITS initializes pending_edits with resolution: pending', () => {
    const state = makeState()
    const edits: PendingEdit[] = [
      makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'accepted' }), // incoming resolution overridden to pending
      makePendingEdit({ id: 'e2', paragraph_id: 'para-2', resolution: 'rejected' }), // incoming resolution overridden to pending
    ]

    const next = workspaceReducer(state, {
      type: 'SET_PENDING_EDITS',
      payload: { section_key: 'exec_summary', message_id: 'msg-1', edits },
    })

    const result = next.sections['exec_summary'].pending_edits
    expect(result).toHaveLength(2)
    expect(result[0].resolution).toBe('pending')
    expect(result[1].resolution).toBe('pending')
  })

  it('14.2-A2-02: ACCEPT_PENDING_EDIT sets resolution to accepted', () => {
    const state = makeState({
      pending_edits: [
        makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'pending' }),
        makePendingEdit({ id: 'e2', paragraph_id: 'para-2', resolution: 'pending' }),
      ],
    })

    const next = workspaceReducer(state, {
      type: 'ACCEPT_PENDING_EDIT',
      payload: { section_key: 'exec_summary', paragraph_id: 'para-1' },
    })

    const result = next.sections['exec_summary'].pending_edits
    expect(result[0].resolution).toBe('accepted')
    expect(result[1].resolution).toBe('pending') // unchanged
  })

  it('14.2-A2-03: REJECT_PENDING_EDIT sets resolution to rejected', () => {
    const state = makeState({
      pending_edits: [
        makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'pending' }),
        makePendingEdit({ id: 'e2', paragraph_id: 'para-2', resolution: 'pending' }),
      ],
    })

    const next = workspaceReducer(state, {
      type: 'REJECT_PENDING_EDIT',
      payload: { section_key: 'exec_summary', paragraph_id: 'para-2' },
    })

    const result = next.sections['exec_summary'].pending_edits
    expect(result[0].resolution).toBe('pending') // unchanged
    expect(result[1].resolution).toBe('rejected')
  })

  it('14.2-A2-04: BATCH_ACCEPT_PENDING_EDITS skips already-resolved edits', () => {
    // State has 3 edits: pending, rejected, pending
    const state = makeState({
      pending_edits: [
        makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'pending' }),
        makePendingEdit({ id: 'e2', paragraph_id: 'para-2', resolution: 'rejected' }),
        makePendingEdit({ id: 'e3', paragraph_id: 'para-3', resolution: 'pending' }),
      ],
    })

    // Payload includes all 3, but only the pending ones should be accepted
    const edits: PendingEdit[] = [
      makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'pending' }),
      makePendingEdit({ id: 'e2', paragraph_id: 'para-2', resolution: 'rejected' }), // already resolved — SILENTLY SKIPPED
      makePendingEdit({ id: 'e3', paragraph_id: 'para-3', resolution: 'pending' }),
    ]

    const next = workspaceReducer(state, {
      type: 'BATCH_ACCEPT_PENDING_EDITS',
      payload: { section_key: 'exec_summary', edits },
    })

    const result = next.sections['exec_summary'].pending_edits
    expect(result[0].resolution).toBe('accepted') // was pending → accepted
    expect(result[1].resolution).toBe('rejected') // already rejected → silently skipped, unchanged
    expect(result[2].resolution).toBe('accepted') // was pending → accepted
  })

  // ── buildResolutionMap tests ────────────────────────────────────────────────

  it('14.2-A2-05: buildResolutionMap — empty input returns empty object', () => {
    expect(buildResolutionMap([])).toEqual({})
  })

  it('14.2-A2-06: buildResolutionMap — mixed resolutions (pending + resolved)', () => {
    const edits: PendingEdit[] = [
      makePendingEdit({ paragraph_id: 'para-1', resolution: 'accepted' }),
      makePendingEdit({ paragraph_id: 'para-2', resolution: 'pending' }),
    ]
    const result = buildResolutionMap(edits)
    expect(result).toEqual({
      'para-1': 'accepted',
      'para-2': 'pending',
    })
  })

  it('14.2-A2-07: buildResolutionMap — duplicate IDs last-write-wins', () => {
    const edits: PendingEdit[] = [
      makePendingEdit({ paragraph_id: 'para-1', resolution: 'pending' }),
      makePendingEdit({ paragraph_id: 'para-1', resolution: 'accepted' }), // last entry wins
    ]
    const result = buildResolutionMap(edits)
    expect(result['para-1']).toBe('accepted')
    expect(Object.keys(result)).toHaveLength(1)
  })
})
