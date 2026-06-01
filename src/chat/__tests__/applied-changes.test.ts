import { describe, it, expect } from 'vitest'
import { concatChangeSummaries } from '../resolved-items'

describe('concatChangeSummaries (D-16)', () => {
  it('empty input returns empty string', () => {
    expect(concatChangeSummaries([])).toBe('')
  })

  it('document order preserved', () => {
    const out = concatChangeSummaries([
      { change_summary: 'Added pricing.' },
      { change_summary: 'Added timeline.' },
    ])
    expect(out).toBe('Added pricing. Added timeline.')
  })

  it('short input returned verbatim', () => {
    expect(concatChangeSummaries([{ change_summary: 'short' }])).toBe('short')
  })

  it('trims each summary and drops empties before joining', () => {
    const out = concatChangeSummaries([
      { change_summary: '  Added X.  ' },
      { change_summary: '   ' },
      { change_summary: 'Added Y.' },
    ])
    expect(out).toBe('Added X. Added Y.')
  })

  it('truncates at sentence boundary when present at >=60% of max', () => {
    const long = Array.from({ length: 8 }, (_, i) => ({
      change_summary: `Sentence number ${i} with extra padding text here.`,
    }))
    const out = concatChangeSummaries(long, 200)
    expect(out.length).toBeLessThanOrEqual(200)
    expect(out.endsWith('.')).toBe(true)
  })

  it('falls back to word boundary + ellipsis when no sentence boundary', () => {
    const big = [{ change_summary: 'word '.repeat(80).trim() }] // no punctuation
    const out = concatChangeSummaries(big, 200)
    expect(out.length).toBeLessThanOrEqual(201)
    expect(out.endsWith('…')).toBe(true)
    expect(out.endsWith(' …')).toBe(false)
  })

  it('hard-truncates with ellipsis when no whitespace', () => {
    const out = concatChangeSummaries([{ change_summary: 'a'.repeat(300) }], 200)
    expect(out.length).toBe(201)
    expect(out.endsWith('…')).toBe(true)
  })
})
