import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

// ── Req 6 invariant guard (16-08, Task 1) ────────────────────────────────────
//
// SPEC Req 6: "Once populated, the demo proposal is structurally identical to a
// real draft. Chat, rewrites, section regeneration, and export run the NORMAL
// production code paths with NO demo-aware conditional below the population
// step." Acceptance: "A code search finds no demo branch in
// chat/rewrite/regenerate/export paths."
//
// That requirement is what makes the demo evidence about the real product
// rather than a parallel mock of it. It is also the single easiest thing to
// erode: one `if (isDemo)` inside retrieve-context or the editor and the demo
// stops proving anything, silently, with every test still green.
//
// So this file is a FENCE, not a description. It reads the committed bytes of
// every below-population production path and fails the suite if any of them
// mentions the demo at all. If you are here because this test failed, the fix
// is NOT to widen the allow-list: it is to move the behaviour ABOVE the
// population boundary — into what `demo-run-start` materializes, or into
// useDemoRun/DemoRunSurface, which are the only places demo logic may live.
//
// Verified non-vacuous: a demo branch was temporarily inserted into
// retrieve-context/index.ts and this test failed naming the file and line;
// the branch was then removed. A structural test nobody has seen fail proves
// nothing.

const REPO_ROOT = resolve(__dirname, '..', '..')

/**
 * A demo-aware conditional anywhere in these files is a Req 6 violation.
 *
 * Anchored with `\b` at the START and a trailing `\w*`, NOT `\b` at both ends:
 * `_` is a word character, so `/\bdemo_run\b/` does NOT match `demo_run_id`,
 * `demo_fixture_sections` or `is_demo_org` — i.e. the obvious both-ends-bounded
 * pattern would have missed the exact identifiers the demo tables actually use.
 * (Caught by the guard-the-guard case below, which is why it is there.)
 * `demonstrate` still does not match: none of the four alternatives is a prefix
 * of it, and `demoMode` is case-sensitive.
 */
const FORBIDDEN = /\b(is_demo|demo_run|demo_fixture|demoMode)\w*/

/**
 * The five below-population paths named by SPEC Req 6 / 16-08 Task 1.
 * Every one of these MUST exist — a rename that silently drops a file from the
 * fence would leave the invariant unguarded while the suite still passed.
 */
const REQUIRED_PATHS = [
  'supabase/functions/generate-proposal-section/index.ts',
  'supabase/functions/retrieve-context/index.ts',
  'supabase/functions/chat-with-jamo/index.ts',
  'supabase/functions/section-ai-action/index.ts',
  'src/lib/exportDocx.ts',
]

/**
 * Client-side below-population paths. Section regeneration and post-generation
 * chat run through these on a demo proposal exactly as on a real draft.
 */
const REQUIRED_CLIENT_PATHS = [
  'src/hooks/useProposalGeneration.ts',
  'src/components/AIChatPanel.tsx',
]

/**
 * Whole edge-function directories are swept too, so a branch hidden in a helper
 * module (e.g. chat-with-jamo/rag.ts, tools/*) is caught as well as one in
 * index.ts. Deno test files are excluded: a test may legitimately assert the
 * ABSENCE of demo behaviour and would otherwise trip its own fence.
 */
const SWEPT_DIRS = [
  'supabase/functions/generate-proposal-section',
  'supabase/functions/retrieve-context',
  'supabase/functions/chat-with-jamo',
  'supabase/functions/section-ai-action',
]

function listSourceFiles(dir: string): string[] {
  const abs = join(REPO_ROOT, dir)
  if (!existsSync(abs)) return []
  const out: string[] = []
  for (const entry of readdirSync(abs)) {
    const rel = `${dir}/${entry}`
    if (statSync(join(REPO_ROOT, rel)).isDirectory()) {
      out.push(...listSourceFiles(rel))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (/(^|\.)test\.tsx?$/.test(entry)) continue
    out.push(rel)
  }
  return out
}

/** Returns `null` when clean, or a "line N: <text>" description of the first offence. */
function findDemoBranch(relPath: string): string | null {
  const source = readFileSync(join(REPO_ROOT, relPath), 'utf8')
  if (!FORBIDDEN.test(source)) return null
  const lines = source.split(/\r?\n/)
  const index = lines.findIndex((line) => FORBIDDEN.test(line))
  return `line ${index + 1}: ${lines[index]?.trim()}`
}

describe('Req 6 — no demo-aware branch below the population step', () => {
  it('fences every path SPEC Req 6 names (none may be missing)', () => {
    const missing = [...REQUIRED_PATHS, ...REQUIRED_CLIENT_PATHS].filter(
      (p) => !existsSync(join(REPO_ROOT, p))
    )
    expect(missing, 'below-population path(s) moved or renamed — update the fence').toEqual([])
  })

  it('forbids is_demo / demo_run / demo_fixture / demoMode', () => {
    // Guard the guard: the pattern must actually reject a real violation.
    expect(FORBIDDEN.test('if (proposal.is_demo) { return demoChunks }')).toBe(true)
    expect(FORBIDDEN.test('const demoRunId = ctx.demo_run_id')).toBe(true)
    expect(FORBIDDEN.test("supabase.from('demo_fixture_sections')")).toBe(true)
    expect(FORBIDDEN.test('if (org.is_demo_org) skipRetrieval()')).toBe(true)
    expect(FORBIDDEN.test('<Step4Generate demoMode />')).toBe(true)
    // …and must not reject innocent prose.
    expect(FORBIDDEN.test('this demonstrates the retrieval path')).toBe(false)
    expect(FORBIDDEN.test('// democratize the retrieval budget')).toBe(false)
  })

  for (const relPath of [...REQUIRED_PATHS, ...REQUIRED_CLIENT_PATHS]) {
    it(`${relPath} contains no demo branch`, () => {
      const offence = findDemoBranch(relPath)
      expect(
        offence,
        `${relPath} references the demo below the population step (Req 6). ` +
          `Move it above the boundary — into demo-run-start's materialization or ` +
          `useDemoRun/DemoRunSurface — instead of branching here.`
      ).toBeNull()
    })
  }

  it('sweeps every module in the below-population edge functions, not just index.ts', () => {
    const swept = SWEPT_DIRS.flatMap(listSourceFiles)
    // Non-vacuity: the sweep must actually be reading files.
    expect(swept.length).toBeGreaterThanOrEqual(REQUIRED_PATHS.length - 1)

    const offences = swept
      .map((p) => ({ path: p, offence: findDemoBranch(p) }))
      .filter((r) => r.offence !== null)
      .map((r) => `${r.path} ${r.offence}`)

    expect(offences, 'demo branch found below the population step (Req 6)').toEqual([])
  })
})
