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
  it('14.2-A2-01: SET_PENDING_EDITS preserves incoming resolutions and merges by message_id', () => {
    // Section already holds an edit from a different message — it must survive.
    const state = makeState({
      pending_edits: [
        makePendingEdit({ id: 'old-1', paragraph_id: 'para-9', message_id: 'msg-0', resolution: 'accepted' }),
      ],
    })
    const edits: PendingEdit[] = [
      makePendingEdit({ id: 'e1', paragraph_id: 'para-1', message_id: 'msg-1', resolution: 'pending' }),
      makePendingEdit({ id: 'e2', paragraph_id: 'para-2', message_id: 'msg-1', resolution: 'rejected' }),
    ]

    const next = workspaceReducer(state, {
      type: 'SET_PENDING_EDITS',
      payload: { section_key: 'exec_summary', message_id: 'msg-1', edits },
    })

    const result = next.sections['exec_summary'].pending_edits
    // msg-0's edit is kept; msg-1's edits are added with their resolutions intact (not reset).
    expect(result).toHaveLength(3)
    expect(result.find((e) => e.id === 'old-1')?.resolution).toBe('accepted')
    expect(result.find((e) => e.id === 'e1')?.resolution).toBe('pending')
    expect(result.find((e) => e.id === 'e2')?.resolution).toBe('rejected')
  })

  it('14.2-A2-02: ACCEPT_PENDING_EDIT sets resolution to accepted by edit id', () => {
    const state = makeState({
      pending_edits: [
        makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'pending' }),
        makePendingEdit({ id: 'e2', paragraph_id: 'para-2', resolution: 'pending' }),
      ],
    })

    const next = workspaceReducer(state, {
      type: 'ACCEPT_PENDING_EDIT',
      payload: { section_key: 'exec_summary', edit_id: 'e1' },
    })

    const result = next.sections['exec_summary'].pending_edits
    expect(result[0].resolution).toBe('accepted')
    expect(result[1].resolution).toBe('pending') // unchanged
  })

  it('14.2-A2-02b: ACCEPT_PENDING_EDIT does not affect other edits sharing the same paragraph', () => {
    // Two edits anchored to the SAME paragraph but with distinct ids.
    const state = makeState({
      pending_edits: [
        makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'pending' }),
        makePendingEdit({ id: 'e2', paragraph_id: 'para-1', resolution: 'pending' }),
      ],
    })

    const next = workspaceReducer(state, {
      type: 'ACCEPT_PENDING_EDIT',
      payload: { section_key: 'exec_summary', edit_id: 'e1' },
    })

    const result = next.sections['exec_summary'].pending_edits
    expect(result[0].resolution).toBe('accepted')
    expect(result[1].resolution).toBe('pending') // same anchor, NOT accepted
  })

  it('14.2-A2-03: REJECT_PENDING_EDIT sets resolution to rejected by edit id', () => {
    const state = makeState({
      pending_edits: [
        makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'pending' }),
        makePendingEdit({ id: 'e2', paragraph_id: 'para-2', resolution: 'pending' }),
      ],
    })

    const next = workspaceReducer(state, {
      type: 'REJECT_PENDING_EDIT',
      payload: { section_key: 'exec_summary', edit_id: 'e2' },
    })

    const result = next.sections['exec_summary'].pending_edits
    expect(result[0].resolution).toBe('pending') // unchanged
    expect(result[1].resolution).toBe('rejected')
  })

  it('14.2-A2-04: BATCH_ACCEPT_PENDING_EDITS accepts the given ids, skips already-resolved', () => {
    const state = makeState({
      pending_edits: [
        makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'pending' }),
        makePendingEdit({ id: 'e2', paragraph_id: 'para-2', resolution: 'rejected' }),
        makePendingEdit({ id: 'e3', paragraph_id: 'para-3', resolution: 'pending' }),
      ],
    })

    const next = workspaceReducer(state, {
      type: 'BATCH_ACCEPT_PENDING_EDITS',
      payload: { section_key: 'exec_summary', edit_ids: ['e1', 'e2', 'e3'] },
    })

    const result = next.sections['exec_summary'].pending_edits
    expect(result[0].resolution).toBe('accepted') // was pending → accepted
    expect(result[1].resolution).toBe('rejected') // already rejected → silently skipped
    expect(result[2].resolution).toBe('accepted') // was pending → accepted
  })

  // ── buildResolutionMap tests ────────────────────────────────────────────────

  it('14.2-A2-05: buildResolutionMap — empty input returns empty object', () => {
    expect(buildResolutionMap([])).toEqual({})
  })

  it('14.2-A2-06: buildResolutionMap — keyed by edit id, mixed resolutions', () => {
    const edits: PendingEdit[] = [
      makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'accepted' }),
      makePendingEdit({ id: 'e2', paragraph_id: 'para-2', resolution: 'pending' }),
    ]
    const result = buildResolutionMap(edits)
    expect(result).toEqual({ e1: 'accepted', e2: 'pending' })
  })

  it('14.2-A2-07: buildResolutionMap — edits sharing a paragraph keep distinct entries', () => {
    const edits: PendingEdit[] = [
      makePendingEdit({ id: 'e1', paragraph_id: 'para-1', resolution: 'accepted' }),
      makePendingEdit({ id: 'e2', paragraph_id: 'para-1', resolution: 'rejected' }), // same anchor, distinct edit
    ]
    const result = buildResolutionMap(edits)
    expect(result['e1']).toBe('accepted')
    expect(result['e2']).toBe('rejected')
    expect(Object.keys(result)).toHaveLength(2)
  })
})
