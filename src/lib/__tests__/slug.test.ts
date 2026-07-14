import { describe, it, expect } from 'vitest'
import { baseSlug } from '../slug'

describe('baseSlug', () => {
  it('converts spaces to hyphens', () => {
    expect(baseSlug('Acme Corp')).toBe('acme-corp')
  })

  it('lowercases uppercase input', () => {
    expect(baseSlug('ACME CORP')).toBe('acme-corp')
  })

  it('strips punctuation, collapsing it into a single hyphen', () => {
    expect(baseSlug('Acme, Inc.')).toBe('acme-inc')
  })

  it('trims leading and trailing hyphens', () => {
    expect(baseSlug('--Acme Corp--')).toBe('acme-corp')
  })

  it('trims leading/trailing whitespace before slugifying', () => {
    expect(baseSlug('  Acme Corp  ')).toBe('acme-corp')
  })

  it('caps length at 60 characters with no trailing hyphen', () => {
    const longName = 'A'.repeat(80) + ' Corp'
    const slug = baseSlug(longName)
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('collapses multiple consecutive non-alphanumeric characters into one hyphen', () => {
    expect(baseSlug('Acme   &   Sons!!')).toBe('acme-sons')
  })
})
