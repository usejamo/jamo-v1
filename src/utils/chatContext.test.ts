import { describe, it } from 'vitest'
import { buildSlidingWindow, sectionKeyToTitle } from './chatContext'

describe('buildSlidingWindow — token budget', () => {
  it.skip('fits messages within ~12k token estimate (chars/3.5)', () => {})
  it.skip('excludes message that would exceed budget', () => {})
  it.skip('returns messages in original chronological order', () => {})
})

describe('sectionKeyToTitle', () => {
  it.skip('converts snake_case to Title Case', () => {})
  it.skip('falls back to humanized key when not in map', () => {})
})
