// supabase/functions/analyze-proposal-gaps/__tests__/salvage-truncated.test.ts
// Regression: Haiku output truncated at max_tokens mid-array dropped ALL findings
// (JSON.parse threw → raw=[] → analyzer "went silent"). salvageTruncatedFindings
// recovers every complete object. See index.ts max_tokens bump + salvage backstop.

import { describe, it, expect } from 'vitest'
import { salvageTruncatedFindings } from '../index.ts'

describe('salvageTruncatedFindings (truncation backstop)', () => {
  it('recovers complete objects from an array truncated mid-object', () => {
    // Two complete findings, then a third cut off at max_tokens (the real failure shape).
    const truncated = `[
  { "type": "gap", "section_key": "section-1", "title": "A", "cta_tool": "ask_user" },
  { "type": "gap", "section_key": "section-2", "title": "B", "cta_tool": "ask_user" },
  { "type": "gap", "section_key": "section-3", "title": "C cut off here",
    "priority": 3,
    `
    const salvaged = salvageTruncatedFindings(truncated)
    expect(salvaged).not.toBeNull()
    expect(salvaged!.length).toBe(2)
    expect((salvaged![0] as { section_key: string }).section_key).toBe('section-1')
    expect((salvaged![1] as { section_key: string }).section_key).toBe('section-2')
  })

  it('returns a parsed array unchanged when already complete', () => {
    const complete = `[{ "type": "gap", "section_key": "s1", "title": "A" }]`
    const salvaged = salvageTruncatedFindings(complete)
    expect(salvaged).not.toBeNull()
    expect(salvaged!.length).toBe(1)
  })

  it('returns null when there is no complete object to recover', () => {
    expect(salvageTruncatedFindings('[')).toBeNull()
    expect(salvageTruncatedFindings('not json at all')).toBeNull()
    expect(salvageTruncatedFindings('')).toBeNull()
  })
})
