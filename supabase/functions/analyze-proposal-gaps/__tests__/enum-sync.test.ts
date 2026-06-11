// supabase/functions/analyze-proposal-gaps/__tests__/enum-sync.test.ts
// Wave 0 stub — un-skipped + wired in Plan 02 (enum widen + export const).
//
// AC-3: PendingActionSchema must accept cta_tool:'ask_user' after Plan 02 widens the enum.
// Tag: 14.2.4-AC3
//
// Plan 02 wiring instructions:
//   1. In analyze-proposal-gaps/index.ts: change `const PendingActionSchema` → `export const PendingActionSchema`
//   2. In PendingActionSchema.shape.cta_tool: add 'ask_user' to the z.enum([...]) list
//   3. Remove the it.skip and wire the safeParse body below
//
// Intended import (DO NOT un-comment until Plan 02 exports PendingActionSchema):
// import { PendingActionSchema } from '../index.ts'

import { describe, it } from 'vitest'

describe('analyze-proposal-gaps — enum sync (AC-3)', () => {
  it.skip('14.2.4-AC3-01: PendingActionSchema accepts cta_tool: ask_user', () => {
    // Wave 0 stub — implemented in Plan 02
    //
    // const result = PendingActionSchema.safeParse({
    //   id: crypto.randomUUID(),
    //   type: 'gap',
    //   section_key: 'study_design',
    //   title: 'Study Design — placeholder',
    //   description: 'Uses descriptive-noun placeholders.',
    //   priority: 3,
    //   cta_label: 'Provide info',
    //   cta_tool: 'ask_user',
    //   cta_payload: {},
    // })
    // expect(result.success).toBe(true)
  })

  it.skip('14.2.4-AC3-02: PendingActionSchema rejects unknown cta_tool value', () => {
    // Wave 0 stub — implemented in Plan 02
    //
    // const result = PendingActionSchema.safeParse({
    //   id: crypto.randomUUID(),
    //   type: 'gap',
    //   section_key: 'study_design',
    //   title: 'Unknown tool test',
    //   description: 'Should fail validation.',
    //   priority: 3,
    //   cta_label: 'Bad label',
    //   cta_tool: 'unknown_tool',
    //   cta_payload: {},
    // })
    // expect(result.success).toBe(false)
  })
})
