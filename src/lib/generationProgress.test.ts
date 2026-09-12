import { describe, it, expect } from 'vitest'
import { hasContent, partitionSections, pickAnchorSource } from './generationProgress'
import type { SectionRow } from './generationProgress'

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
