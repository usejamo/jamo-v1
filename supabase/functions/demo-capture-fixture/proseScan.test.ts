import { describe, it, expect } from 'vitest'
import { scanPlaceholderProse } from './proseScan.ts'

describe('scanPlaceholderProse', () => {
  it('flags the common self-instruction phrasings', () => {
    expect(scanPlaceholderProse('ranges from approximately insert validated FGF19 prevalence rate')).toContain('insert …')
    expect(scanPlaceholderProse('milestone date to be confirmed based on startup')).toContain('to be confirmed')
    expect(scanPlaceholderProse('value TBD at this stage')).toContain('TBD')
    expect(scanPlaceholderProse('see [citation needed]')).toContain('[citation')
  })
  it('does not false-positive on legitimate clinical prose', () => {
    expect(scanPlaceholderProse('biomarker sample collection and insertion of the catheter')).toEqual([])
  })
})
