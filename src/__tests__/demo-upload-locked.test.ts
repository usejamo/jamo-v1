// Phase 16 (16-REVIEW WR-05) — the demo surface must never expose a live upload control.
//
// The demo's RFP is materialized by demo-run-start and its chunks are CLONED from the
// fixture. An upload on that surface would run the real parse + embed pipeline and spend
// tokens mid-demo, defeating the phase's single defining invariant. Step4Generate already
// locks the template for the same class of reason; the upload step did not, until now.
//
// These are source assertions rather than a mount test on purpose: Step2DocumentUpload
// pulls in useAuth + supabase + FileUpload + DocumentList, and the repo's existing fences
// (demoSweepParity, no-demo-branch-below-population) already establish this pattern for
// invariants that must hold in the committed bytes.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')

const SURFACE = 'src/components/demo/DemoRunSurface.tsx'
const STEP2 = 'src/components/wizard/Step2DocumentUpload.tsx'

describe('demo surface upload lock (WR-05)', () => {
  it('DemoRunSurface passes demoMode to Step2DocumentUpload', () => {
    const src = read(SURFACE)
    const usage = src.match(/<Step2DocumentUpload[^>]*>/s)
    expect(usage, 'DemoRunSurface should render Step2DocumentUpload').not.toBeNull()
    expect(usage![0]).toMatch(/demoMode/)
  })

  it('Step2DocumentUpload accepts a demoMode prop', () => {
    const src = read(STEP2)
    expect(src).toMatch(/demoMode\?: boolean/)
    expect(src).toMatch(/demoMode = false/)
  })

  it('Step2DocumentUpload renders FileUpload only when NOT in demo mode', () => {
    const src = read(STEP2)
    // FileUpload must sit on the false branch of a demoMode ternary. If someone later
    // renders it unconditionally again, this fails.
    expect(src).toMatch(/demoMode \?[\s\S]*?:\s*\(\s*<FileUpload/)
  })

  it('the guard-the-guard case: an unconditional FileUpload would be caught', () => {
    // Proves the assertion above is not vacuous — it fails on source that renders
    // FileUpload with no demoMode branch at all.
    const unguarded = `{state.proposalId ? (<div><FileUpload proposalId={x} /></div>) : null}`
    expect(unguarded).not.toMatch(/demoMode \?[\s\S]*?:\s*\(\s*<FileUpload/)
  })

  it('Step2DocumentUpload does NOT branch its extraction trigger on demoMode', () => {
    // The extract-assumptions trigger is fixed ABOVE the boundary (useDemoRun seeds
    // extractionStatus='complete'), not by a demo branch inside the shared step. demoMode
    // here is presentational only — if it ever gates the trigger, the fix has drifted back
    // into the shared wizard code this phase deliberately kept demo-agnostic.
    const src = read(STEP2)
    const triggerLine = src.split('\n').find((l) => l.includes("extractionStatus === 'idle'"))
    expect(triggerLine, 'extraction trigger should still exist').toBeTruthy()
    expect(triggerLine).not.toMatch(/demoMode/)
  })
})
