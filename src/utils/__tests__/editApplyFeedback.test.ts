import { describe, it, expect } from 'vitest'
import { formatEditApplyFailure } from '../editApplyFeedback'

describe('formatEditApplyFailure', () => {
  it('names the section and says the edit could not be applied on a ghost-leak block', () => {
    const msg = formatEditApplyFailure('ghost-leak', 'Cover Letter')
    expect(msg).toContain('Cover Letter')
    expect(msg.toLowerCase()).toContain("couldn't apply")
  })

  it('explains an unmounted section', () => {
    const msg = formatEditApplyFailure('editor-not-mounted', 'Budget & Pricing')
    expect(msg).toContain('Budget & Pricing')
    expect(msg.toLowerCase()).toMatch(/open|scroll|view/)
  })

  it('explains a stale / no-valid-edits case as content having changed', () => {
    const msg = formatEditApplyFailure('no-valid-edits', 'Timeline')
    expect(msg).toContain('Timeline')
    expect(msg.toLowerCase()).toMatch(/chang|match|no longer/)
  })

  it('always produces a non-empty message for every reason', () => {
    for (const reason of ['editor-not-mounted', 'section-not-active', 'no-valid-edits', 'ghost-leak'] as const) {
      expect(formatEditApplyFailure(reason, 'Executive Summary').length).toBeGreaterThan(0)
    }
  })
})
