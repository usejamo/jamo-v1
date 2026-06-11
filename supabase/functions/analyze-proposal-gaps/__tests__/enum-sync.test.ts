// supabase/functions/analyze-proposal-gaps/__tests__/enum-sync.test.ts
// AC-3: PendingActionSchema must accept cta_tool:'ask_user' after Plan 02 widens the enum.
// Tag: 14.2.4-AC3

import { describe, it, expect } from 'vitest'
import { PendingActionSchema } from '../index.ts'

describe('analyze-proposal-gaps — enum sync (AC-3)', () => {
  it('14.2.4-AC3-01: PendingActionSchema accepts cta_tool: ask_user', () => {
    const result = PendingActionSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'gap',
      section_key: 'study_design',
      title: 'Study Design — placeholder',
      description: 'Uses descriptive-noun placeholders.',
      priority: 3,
      cta_label: 'Provide info',
      cta_tool: 'ask_user',
      cta_payload: {},
    })
    expect(result.success).toBe(true)
  })

  it('14.2.4-AC3-02: PendingActionSchema rejects unknown cta_tool value', () => {
    const result = PendingActionSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'gap',
      section_key: 'study_design',
      title: 'Unknown tool test',
      description: 'Should fail validation.',
      priority: 3,
      cta_label: 'Bad label',
      cta_tool: 'unknown_tool',
      cta_payload: {},
    })
    expect(result.success).toBe(false)
  })
})
