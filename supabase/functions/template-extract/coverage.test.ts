import { describe, it, expect } from 'vitest'
import { isCoverageComplete } from './coverage.ts'

describe('isCoverageComplete', () => {
  it('true when every section name is a key, including present-with-null (a real "no match")', () => {
    expect(isCoverageComplete(['A', 'B'], { A: 'budget', B: null })).toBe(true)
  })
  it('false when a section name is absent (never answered — what {} produces)', () => {
    expect(isCoverageComplete(['A', 'B'], { A: 'budget' })).toBe(false)
    expect(isCoverageComplete(['A', 'B'], {})).toBe(false)
  })
})
