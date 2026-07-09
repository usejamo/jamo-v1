import { describe, it, expect } from 'vitest'
import { buildSectionPrompt, buildSectionPromptV2 } from './promptAssembly.ts'

// These specs import the ACTUAL runtime builders — index.ts re-exports the exact
// same symbols from ./promptAssembly.ts and the request handler calls them
// directly, so there is no divergent test-only helper.

const REG_CHUNK = { content: 'REG-CONTENT-ABC', source: 'ICH-E6R3' }
const PROP_CHUNK = { content: 'PROP-CONTENT-XYZ', source: 'proposal:acme' }

function countOccurrences(haystack: string, needle: string): number {
  return (haystack.match(new RegExp(needle, 'g')) ?? []).length
}

describe('buildSectionPromptV2 (primary runtime path)', () => {
  it('regulatoryCount === 0: zero ICH-GCP references anywhere in the prompt, plus the no-grounding marker', () => {
    const { system } = buildSectionPromptV2({
      sectionId: 'regulatory_strategy',
      sectionName: 'Regulatory Strategy',
      sectionDescription: null,
      sectionRole: 'regulatory_strategy',
      tone: 'formal',
      regulatoryChunks: [],
      proposalChunks: [PROP_CHUNK],
      regulatoryCount: 0,
      priorSections: [],
      proposalContext: {},
    })

    expect(countOccurrences(system, 'ICH-GCP')).toBe(0)
    expect(system).toContain('No regulatory grounding available')
  })

  it('regulatoryCount === 0: proposal chunk content appears only under [PROPOSAL HISTORY], never under [REGULATORY CONTEXT]', () => {
    const { system } = buildSectionPromptV2({
      sectionId: 'understanding',
      sectionName: 'Understanding of the Study',
      sectionDescription: null,
      sectionRole: null,
      tone: 'formal',
      regulatoryChunks: [],
      proposalChunks: [PROP_CHUNK],
      regulatoryCount: 0,
      priorSections: [],
      proposalContext: {},
    })

    const propHistoryBlock = system.slice(system.indexOf('[PROPOSAL HISTORY]'), system.indexOf('[/PROPOSAL HISTORY]'))
    const regContextBlock = system.slice(system.indexOf('[REGULATORY CONTEXT]'), system.indexOf('[/REGULATORY CONTEXT]'))

    expect(propHistoryBlock).toContain('PROP-CONTENT-XYZ')
    expect(regContextBlock).not.toContain('PROP-CONTENT-XYZ')
    expect(regContextBlock).toContain('(No relevant regulatory context found)')
  })

  it('regulatoryCount > 0: ICH-GCP reference present, [REGULATORY CONTEXT] populated, no no-grounding marker', () => {
    const { system } = buildSectionPromptV2({
      sectionId: 'regulatory_strategy',
      sectionName: 'Regulatory Strategy',
      sectionDescription: null,
      sectionRole: 'regulatory_strategy',
      tone: 'formal',
      regulatoryChunks: [REG_CHUNK],
      proposalChunks: [],
      regulatoryCount: 1,
      priorSections: [],
      proposalContext: {},
    })

    expect(system).toContain('ICH-GCP')
    const regContextBlock = system.slice(system.indexOf('[REGULATORY CONTEXT]'), system.indexOf('[/REGULATORY CONTEXT]'))
    expect(regContextBlock).toContain('REG-CONTENT-ABC')
    expect(system).not.toContain('No regulatory grounding available')
  })
})

describe('buildSectionPrompt (v1)', () => {
  it('regulatoryCount === 0: separate headers, proposal content only under [PROPOSAL HISTORY], marker present', () => {
    const { system } = buildSectionPrompt({
      sectionId: 'understanding',
      tone: 'formal',
      regulatoryChunks: [],
      proposalChunks: [PROP_CHUNK],
      regulatoryCount: 0,
      anchor: '',
      proposalInput: {},
    })

    expect(system).toContain('[REGULATORY CONTEXT]')
    expect(system).toContain('[PROPOSAL HISTORY]')
    const propHistoryBlock = system.slice(system.indexOf('[PROPOSAL HISTORY]'), system.indexOf('[/PROPOSAL HISTORY]'))
    const regContextBlock = system.slice(system.indexOf('[REGULATORY CONTEXT]'), system.indexOf('[/REGULATORY CONTEXT]'))
    expect(propHistoryBlock).toContain('PROP-CONTENT-XYZ')
    expect(regContextBlock).not.toContain('PROP-CONTENT-XYZ')
    expect(countOccurrences(system, 'ICH-GCP')).toBe(0)
    expect(system).toContain('No regulatory grounding available')
  })

  it('regulatoryCount > 0: populated [REGULATORY CONTEXT] and compliance clause present', () => {
    const { system } = buildSectionPrompt({
      sectionId: 'understanding',
      tone: 'formal',
      regulatoryChunks: [REG_CHUNK],
      proposalChunks: [],
      regulatoryCount: 1,
      anchor: '',
      proposalInput: {},
    })

    expect(system).toContain('compliant with ICH-GCP')
    const regContextBlock = system.slice(system.indexOf('[REGULATORY CONTEXT]'), system.indexOf('[/REGULATORY CONTEXT]'))
    expect(regContextBlock).toContain('REG-CONTENT-ABC')
    expect(system).not.toContain('No regulatory grounding available')
  })
})
