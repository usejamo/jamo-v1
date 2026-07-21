// Phase 16 (Plan 04) — Req 7: a fixture whose section schema has drifted from the
// current standard template must abort the demo run BEFORE any write, with an error
// that names the offending section. This is the pure half of that guarantee.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateFixtureAgainstTemplate } from '../demoFixtureValidation'

const SHARED_MARKER = '// ==== SHARED LOGIC — byte-identical in both copies below this line ===='

const template = [
  { role: 'executive_summary', position: 1, name: 'Executive Summary' },
  { role: 'scope_of_work', position: 2, name: 'Scope of Work' },
  { role: 'clinical_operations', position: 3, name: 'Clinical Operations Plan' },
]

const matchingFixture = [
  { role: 'executive_summary', position: 1, section_name: 'Executive Summary' },
  { role: 'scope_of_work', position: 2, section_name: 'Scope of Work' },
  { role: 'clinical_operations', position: 3, section_name: 'Clinical Operations Plan' },
]

describe('validateFixtureAgainstTemplate', () => {
  it('returns ok for a fixture whose (role, position) set matches the template', () => {
    expect(validateFixtureAgainstTemplate(template, matchingFixture)).toEqual({ ok: true })
  })

  it('ignores row ordering — the diff is by (role, position), not array index', () => {
    const shuffled = [matchingFixture[2], matchingFixture[0], matchingFixture[1]]
    expect(validateFixtureAgainstTemplate(template, shuffled)).toEqual({ ok: true })
  })

  it('names the missing template section when the fixture lacks a role', () => {
    const result = validateFixtureAgainstTemplate(
      template,
      matchingFixture.filter((s) => s.role !== 'clinical_operations')
    )
    expect(result.ok).toBe(false)
    // The presenter must be able to tell WHICH section is missing, by name.
    expect(result.ok === false && result.error).toContain('Clinical Operations Plan')
  })

  it('names every missing section when several roles are absent', () => {
    const result = validateFixtureAgainstTemplate(template, [matchingFixture[0]])
    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error).toContain('Scope of Work')
      expect(result.error).toContain('Clinical Operations Plan')
    }
  })

  it('fails on position drift — same roles, different position mapping', () => {
    const drifted = [
      { role: 'executive_summary', position: 2, section_name: 'Executive Summary' },
      { role: 'scope_of_work', position: 1, section_name: 'Scope of Work' },
      { role: 'clinical_operations', position: 3, section_name: 'Clinical Operations Plan' },
    ]
    const result = validateFixtureAgainstTemplate(template, drifted)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/position/i)
  })

  it('fails on an extra fixture role that the template does not define', () => {
    const extra = [
      ...matchingFixture,
      { role: 'legacy_appendix', position: 4, section_name: 'Legacy Appendix' },
    ]
    const result = validateFixtureAgainstTemplate(template, extra)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('Legacy Appendix')
  })

  it('fails closed on an empty fixture', () => {
    const result = validateFixtureAgainstTemplate(template, [])
    expect(result.ok).toBe(false)
  })

  it('fails closed on an empty template rather than silently approving', () => {
    const result = validateFixtureAgainstTemplate([], matchingFixture)
    expect(result.ok).toBe(false)
  })

  it('fails closed when a template section has a null/blank role', () => {
    const result = validateFixtureAgainstTemplate(
      [{ role: null, position: 1, name: 'Unroled Section' }],
      [{ role: 'executive_summary', position: 1, section_name: 'Executive Summary' }]
    )
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('Unroled Section')
  })

  it('fails closed when a fixture section has a null/blank role', () => {
    const result = validateFixtureAgainstTemplate(
      [{ role: 'executive_summary', position: 1, name: 'Executive Summary' }],
      [{ role: '  ', position: 1, section_name: 'Executive Summary' }]
    )
    expect(result.ok).toBe(false)
  })

  it('fails closed when the fixture repeats a role', () => {
    const dup = [
      { role: 'executive_summary', position: 1, section_name: 'Executive Summary' },
      { role: 'executive_summary', position: 2, section_name: 'Executive Summary (copy)' },
      { role: 'clinical_operations', position: 3, section_name: 'Clinical Operations Plan' },
    ]
    const result = validateFixtureAgainstTemplate(template, dup)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/duplicate/i)
  })

  it('fails closed on a non-integer position', () => {
    const result = validateFixtureAgainstTemplate(
      [{ role: 'executive_summary', position: 1, name: 'Executive Summary' }],
      [{ role: 'executive_summary', position: null as unknown as number, section_name: 'Executive Summary' }]
    )
    expect(result.ok).toBe(false)
  })
})

// The Deno edge runtime cannot import src/lib/, so the module is duplicated into
// supabase/functions/_shared/. This guards the ONE failure mode that duplication invites:
// the two copies silently drifting so that demo-run-start validates by different rules
// than the ones tested above.
describe('src <-> _shared copy parity', () => {
  const sharedBlock = (relPath: string): string => {
    const text = readFileSync(resolve(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n')
    const i = text.indexOf(SHARED_MARKER)
    expect(i, `${relPath} is missing the SHARED LOGIC marker`).toBeGreaterThan(-1)
    return text.slice(i)
  }

  it('the Deno copy is byte-identical to the src copy below the SHARED LOGIC marker', () => {
    expect(sharedBlock('supabase/functions/_shared/demoFixtureValidation.ts')).toBe(
      sharedBlock('src/lib/demoFixtureValidation.ts')
    )
  })

  it('the Deno copy exports validateFixtureAgainstTemplate', () => {
    const deno = readFileSync(
      resolve(process.cwd(), 'supabase/functions/_shared/demoFixtureValidation.ts'),
      'utf8'
    )
    expect(deno).toContain('export function validateFixtureAgainstTemplate')
  })
})
