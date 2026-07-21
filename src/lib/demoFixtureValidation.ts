// Phase 16 (Plan 04) — SPEC Req 7: pre-population must fail LOUDLY, never silently
// render a blank section mid-demo. This is the pure diff of a captured demo fixture's
// section schema against the template it was captured from.
//
// DUPLICATED (not imported) at supabase/functions/_shared/demoFixtureValidation.ts —
// the Deno edge runtime cannot resolve src/lib/ imports at deploy time (same convention
// as src/lib/slug.ts <-> admin-create-org, per 14.6-PATTERNS).
// KEEP BOTH COPIES IN SYNC. src/lib/__tests__/demoFixtureValidation.test.ts asserts the
// two files are byte-identical below their respective header comments, so a drift in
// either copy fails `npm run test:run`.
//
// Pure function: no I/O, no Supabase client, no model call.

// ==== SHARED LOGIC — byte-identical in both copies below this line ====
export interface TemplateSectionShape {
  role: string | null | undefined
  position: number | null | undefined
  name: string | null | undefined
}

export interface FixtureSectionShape {
  role: string | null | undefined
  position: number | null | undefined
  section_name: string | null | undefined
}

export type FixtureValidationResult = { ok: true } | { ok: false; error: string }

function normRole(role: string | null | undefined): string | null {
  if (typeof role !== 'string') return null
  const trimmed = role.trim()
  return trimmed === '' ? null : trimmed
}

function label(name: string | null | undefined, position: number | null | undefined): string {
  if (typeof name === 'string' && name.trim() !== '') return name.trim()
  return `position ${position ?? '?'}`
}

function isPosition(position: number | null | undefined): position is number {
  return typeof position === 'number' && Number.isInteger(position)
}

/**
 * Diffs the current template's sections against a captured fixture's sections by
 * (role, position). Fails closed on anything ambiguous — a null/blank role, a
 * non-integer position, a duplicated role, an empty template, or an empty fixture.
 *
 * Returns `{ ok: true }` only when every template role is present in the fixture at the
 * same position, and the fixture defines no roles the template does not.
 */
export function validateFixtureAgainstTemplate(
  templateSections: TemplateSectionShape[],
  fixtureSections: FixtureSectionShape[]
): FixtureValidationResult {
  const template = Array.isArray(templateSections) ? templateSections : []
  const fixture = Array.isArray(fixtureSections) ? fixtureSections : []

  if (template.length === 0) {
    return { ok: false, error: 'Template has no sections — cannot validate the demo fixture.' }
  }
  if (fixture.length === 0) {
    return { ok: false, error: 'Fixture has no sections — nothing to pre-populate.' }
  }

  // --- Fail closed on unusable rows before diffing anything --------------------
  const unroledTemplate = template.filter((t) => normRole(t.role) === null)
  if (unroledTemplate.length > 0) {
    return {
      ok: false,
      error: `Template section(s) have no role and cannot be matched to a fixture: ${unroledTemplate
        .map((t) => label(t.name, t.position))
        .join(', ')}`,
    }
  }
  const badTemplatePositions = template.filter((t) => !isPosition(t.position))
  if (badTemplatePositions.length > 0) {
    return {
      ok: false,
      error: `Template section(s) have no valid position: ${badTemplatePositions
        .map((t) => label(t.name, t.position))
        .join(', ')}`,
    }
  }

  const unroledFixture = fixture.filter((f) => normRole(f.role) === null)
  if (unroledFixture.length > 0) {
    return {
      ok: false,
      error: `Fixture section(s) have no role and cannot be matched to the template: ${unroledFixture
        .map((f) => label(f.section_name, f.position))
        .join(', ')}`,
    }
  }
  const badFixturePositions = fixture.filter((f) => !isPosition(f.position))
  if (badFixturePositions.length > 0) {
    return {
      ok: false,
      error: `Fixture section(s) have no valid position: ${badFixturePositions
        .map((f) => label(f.section_name, f.position))
        .join(', ')}`,
    }
  }

  // --- Index by role; a repeated role makes the mapping ambiguous --------------
  const fixtureByRole = new Map<string, FixtureSectionShape>()
  const duplicateFixtureRoles: string[] = []
  for (const f of fixture) {
    const role = normRole(f.role) as string
    if (fixtureByRole.has(role)) duplicateFixtureRoles.push(role)
    else fixtureByRole.set(role, f)
  }
  if (duplicateFixtureRoles.length > 0) {
    return {
      ok: false,
      error: `Fixture has duplicate section role(s): ${duplicateFixtureRoles.join(', ')}`,
    }
  }

  const templateByRole = new Map<string, TemplateSectionShape>()
  const duplicateTemplateRoles: string[] = []
  for (const t of template) {
    const role = normRole(t.role) as string
    if (templateByRole.has(role)) duplicateTemplateRoles.push(role)
    else templateByRole.set(role, t)
  }
  if (duplicateTemplateRoles.length > 0) {
    return {
      ok: false,
      error: `Template has duplicate section role(s): ${duplicateTemplateRoles.join(', ')}`,
    }
  }

  // --- Missing template roles (named, so the presenter knows WHAT broke) -------
  const missing = template.filter((t) => !fixtureByRole.has(normRole(t.role) as string))
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Fixture missing section(s): ${missing.map((t) => label(t.name, t.position)).join(', ')}`,
    }
  }

  // --- Extra fixture roles the template no longer defines ---------------------
  const extra = fixture.filter((f) => !templateByRole.has(normRole(f.role) as string))
  if (extra.length > 0) {
    return {
      ok: false,
      error: `Fixture has section(s) not in the template: ${extra
        .map((f) => label(f.section_name, f.position))
        .join(', ')}`,
    }
  }

  // --- Position drift: same roles, different ordering -------------------------
  const drifted = template.filter((t) => {
    const f = fixtureByRole.get(normRole(t.role) as string)
    return !f || f.position !== t.position
  })
  if (drifted.length > 0) {
    return {
      ok: false,
      error: `Fixture section position drift: ${drifted
        .map((t) => {
          const f = fixtureByRole.get(normRole(t.role) as string)
          return `${label(t.name, t.position)} (template position ${t.position}, fixture position ${
            f?.position ?? '?'
          })`
        })
        .join(', ')}`,
    }
  }

  return { ok: true }
}
