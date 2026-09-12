import { describe, it, expect } from 'vitest'
import {
  hasContent,
  partitionSections,
  pickAnchorSource,
  rowToSectionState,
  derivePhase,
} from './generationProgress'
import type { SectionRow } from './generationProgress'
import type { SectionState } from '../types/generation'

function makeRow(overrides?: Partial<SectionRow>): SectionRow {
  return {
    id: 'sec-1',
    name: 'Understanding of the Study',
    section_key: null,
    description: null,
    position: 1,
    role: null,
    status: 'pending',
    content: null,
    ...overrides,
  }
}

describe('hasContent', () => {
  it('is false for null, undefined, empty string and whitespace', () => {
    expect(hasContent(null)).toBe(false)
    expect(hasContent(undefined)).toBe(false)
    expect(hasContent('')).toBe(false)
    expect(hasContent('   \n  ')).toBe(false)
  })

  it('is true for real content', () => {
    expect(hasContent('<p>Section text</p>')).toBe(true)
  })
})

describe('partitionSections', () => {
  it('classifies a content-bearing row as done even when status is generating', () => {
    // Guards the prime directive: 4 production rows carry editor-saved content
    // under status='generating'. Regenerating them would destroy user edits.
    const rows = [makeRow({ id: 'a', status: 'generating', content: '<p>edited by hand</p>' })]
    const { done, todo } = partitionSections(rows)
    expect(done.map(r => r.id)).toEqual(['a'])
    expect(todo).toEqual([])
  })

  it('classifies empty-string and null content as todo regardless of status', () => {
    const rows = [
      makeRow({ id: 'a', position: 1, status: 'generating', content: '' }),
      makeRow({ id: 'b', position: 2, status: 'complete', content: null }),
    ]
    const { done, todo } = partitionSections(rows)
    expect(done).toEqual([])
    expect(todo.map(r => r.id)).toEqual(['a', 'b'])
  })

  it('classifies error rows with no content as todo so Resume retries them', () => {
    const rows = [makeRow({ id: 'a', status: 'error', content: null })]
    const { todo } = partitionSections(rows)
    expect(todo.map(r => r.id)).toEqual(['a'])
  })

  it('orders both partitions by position, tolerating null positions', () => {
    const rows = [
      makeRow({ id: 'c', position: 3, content: '<p>x</p>' }),
      makeRow({ id: 'a', position: 1, content: '<p>x</p>' }),
      makeRow({ id: 'z', position: null, content: null }),
      makeRow({ id: 'b', position: 2, content: null }),
    ]
    const { done, todo } = partitionSections(rows)
    expect(done.map(r => r.id)).toEqual(['a', 'c'])
    expect(todo.map(r => r.id)).toEqual(['b', 'z'])
  })
})

describe('pickAnchorSource', () => {
  it('returns the content of the highest-position done section', () => {
    const done = [
      makeRow({ id: 'a', position: 1, content: 'first' }),
      makeRow({ id: 'b', position: 5, content: 'last' }),
    ]
    expect(pickAnchorSource(done)).toBe('last')
  })

  it('returns empty string when nothing is done', () => {
    expect(pickAnchorSource([])).toBe('')
  })
})

function makeSectionState(overrides?: Partial<SectionState>): SectionState {
  return {
    id: 'sec-1',
    name: 'Understanding of the Study',
    position: 1,
    role: null,
    status: 'pending',
    liveText: '',
    finalContent: null,
    error: null,
    ...overrides,
  }
}

describe('rowToSectionState', () => {
  it('normalises a stranded generating row with no content to pending', () => {
    // No loop is running behind it, so rendering it as in-progress would show a
    // spinner that never resolves.
    const state = rowToSectionState(makeRow({ status: 'generating', content: '' }))
    expect(state.status).toBe('pending')
    expect(state.finalContent).toBeNull()
  })

  it('maps a content-bearing generating row to complete', () => {
    const state = rowToSectionState(makeRow({ status: 'generating', content: '<p>kept</p>' }))
    expect(state.status).toBe('complete')
    expect(state.finalContent).toBe('<p>kept</p>')
  })

  it('maps a complete row to complete with its content', () => {
    const state = rowToSectionState(makeRow({ status: 'complete', content: '<p>done</p>' }))
    expect(state.status).toBe('complete')
    expect(state.finalContent).toBe('<p>done</p>')
  })

  it('falls back to section_key then a default for the name', () => {
    expect(rowToSectionState(makeRow({ name: null, section_key: 'budget' })).name).toBe('budget')
    expect(rowToSectionState(makeRow({ name: null, section_key: null })).name).toBe('Section')
  })

  it('defaults a null position to 99', () => {
    expect(rowToSectionState(makeRow({ position: null })).position).toBe(99)
  })
})

describe('derivePhase', () => {
  it('is generating whenever the loop is running, regardless of counts', () => {
    expect(derivePhase(true, [makeSectionState()], 1)).toBe('generating')
  })

  it('is not-started when nothing has content', () => {
    expect(derivePhase(false, [makeSectionState(), makeSectionState({ id: 'b' })], 2))
      .toBe('not-started')
  })

  it('is not-started when sections have not hydrated yet', () => {
    expect(derivePhase(false, [], 0)).toBe('not-started')
  })

  it('is paused when some but not all sections have content', () => {
    const sections = [
      makeSectionState({ id: 'a', finalContent: '<p>x</p>', status: 'complete' }),
      makeSectionState({ id: 'b' }),
    ]
    expect(derivePhase(false, sections, 2)).toBe('paused')
  })

  it('does not count liveText as done', () => {
    // A section that only ever streamed into liveText was never persisted.
    const sections = [
      makeSectionState({ id: 'a', liveText: 'half a section', finalContent: null }),
      makeSectionState({ id: 'b' }),
    ]
    expect(derivePhase(false, sections, 2)).toBe('not-started')
  })

  it('is complete when every section has content', () => {
    const sections = [
      makeSectionState({ id: 'a', finalContent: '<p>x</p>', status: 'complete' }),
      makeSectionState({ id: 'b', finalContent: '<p>y</p>', status: 'complete' }),
    ]
    expect(derivePhase(false, sections, 2)).toBe('complete')
  })
})
