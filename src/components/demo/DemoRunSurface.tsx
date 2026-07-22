import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { resolveIsDemoOrg } from '../../lib/demoOrg'
import { useDemoRun } from '../../hooks/useDemoRun'
import { WizardStepIndicator } from '../wizard/WizardStepIndicator'
import { Step2DocumentUpload } from '../wizard/Step2DocumentUpload'
import { Step3AssumptionReview } from '../wizard/Step3AssumptionReview'
import { Step4Generate } from '../wizard/Step4Generate'
import { WIZARD_STEPS } from '../../types/wizard'

// ── DemoRunSurface (16-08, D-01/D-02/D-03) ───────────────────────────────────
//
// The presenter's entry point. It reuses the REAL wizard steps
// (Step2DocumentUpload / Step3AssumptionReview / Step4Generate) driven by
// useDemoRun, so what the audience sees is the product, not a mock of it.
//
// This component and useDemoRun are the ONLY places demo-aware logic may live.
// Once the paced reveal finishes, the presenter is handed to the ordinary
// proposal page and every downstream feature — retrieval, the editor, chat,
// rewrite, regeneration, export — runs unbranched production code
// (SPEC Req 6, fenced by no-demo-branch-below-population.test.ts).
//
// GATE (cosmetic): a super_admin whose OWN org is the demo org, resolved at
// runtime by flag/slug, never a hardcoded UUID. Two super_admins exist. The
// authoritative gate is demo-run-start itself, which re-reads the caller's role
// and org server-side and 403s otherwise; this hides an affordance, it does not
// enforce anything.
//
// Navigation on completion deliberately omits `?generate=true`: that query flag
// is what makes ProposalDetail run a real generation. The demo's sections are
// already written, so the proposal page must open in its ordinary "already
// generated" state — the same state a finished real draft opens in.

export interface DemoRunSurfaceProps {
  /** Test seam: override the per-section reveal delay. */
  sectionDelayMs?: number
}

export function DemoRunSurface({ sectionDelayMs }: DemoRunSurfaceProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [inDemoOrg, setInDemoOrg] = useState(false)
  const [gateResolved, setGateResolved] = useState(false)

  const isSuperAdmin = profile?.role === 'super_admin'
  const orgId = profile?.org_id ?? null

  const {
    phase,
    run,
    error,
    wizardState,
    wizardDispatch,
    generationState,
    startRun,
    populate,
  } = useDemoRun(sectionDelayMs === undefined ? {} : { sectionDelayMs })

  useEffect(() => {
    if (!isSuperAdmin || !orgId) {
      setInDemoOrg(false)
      setGateResolved(true)
      return
    }
    let cancelled = false
    resolveIsDemoOrg(orgId)
      .then((result) => {
        if (!cancelled) {
          setInDemoOrg(result)
          setGateResolved(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInDemoOrg(false)
          setGateResolved(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isSuperAdmin, orgId])

  if (!gateResolved) return null
  if (!isSuperAdmin || !inDemoOrg) return null

  const revealed = Object.values(generationState.sections).sort((a, b) => a.position - b.position)

  return (
    <div className="mx-auto max-w-3xl px-6 py-10" data-testid="demo-run-surface">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Demo run</h1>
        <p className="mt-1 text-sm text-gray-500">
          A fresh, isolated draft in the demo org, replayed from the captured fixture.
        </p>
        {run && (
          <p className="mt-2 text-xs text-gray-400" data-testid="demo-run-meta">
            Fixture {run.fixtureVersion !== null ? `v${run.fixtureVersion}` : 'active'} ·{' '}
            {run.sectionCount} sections · {run.assumptionCount} assumptions ·{' '}
            {run.rfpChunkCount} indexed RFP chunks
          </p>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <p className="font-medium">Demo run could not start</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs text-red-600">
            If no fixture has been captured yet, generate one proposal in the demo org and use
            “Save as demo fixture” on it first.
          </p>
        </div>
      )}

      {(phase === 'idle' || phase === 'starting' || phase === 'error') && (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-8 text-center">
          <p className="text-sm text-gray-600">
            Start the demo by adding the RFP. Nothing is created until you do.
          </p>
          <button
            type="button"
            data-testid="demo-add-rfp"
            onClick={startRun}
            disabled={phase === 'starting'}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-jamo-500 px-5 py-2 text-sm font-medium text-white hover:bg-jamo-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {phase === 'starting' ? 'Starting…' : 'Add demo RFP'}
          </button>
        </div>
      )}

      {phase === 'wizard' && (
        <div data-testid="demo-wizard">
          <WizardStepIndicator
            steps={WIZARD_STEPS}
            currentStep={wizardState.step}
            onStepClick={() => {
              /* locked: the demo walks forward through the real steps */
            }}
          />
          <div className="py-4">
            {wizardState.step <= 1 && (
              <Step2DocumentUpload state={wizardState} dispatch={wizardDispatch} />
            )}
            {wizardState.step === 2 && (
              <Step3AssumptionReview state={wizardState} dispatch={wizardDispatch} />
            )}
            {wizardState.step === 3 && (
              <Step4Generate
                state={wizardState}
                dispatch={wizardDispatch}
                onGenerate={populate}
                demoMode
              />
            )}
          </div>
        </div>
      )}

      {(phase === 'populating' || phase === 'complete') && (
        <div data-testid="demo-populate">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              {phase === 'populating' ? 'Generating proposal…' : 'Proposal ready'}
            </p>
            <p className="text-xs text-gray-400">
              {generationState.completedCount} / {generationState.totalCount}
            </p>
          </div>
          <ol className="space-y-2">
            {revealed.map((section) => (
              <li
                key={section.id}
                data-testid={`demo-section-${section.status}`}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors ${
                  section.status === 'complete'
                    ? 'border-jamo-200 bg-jamo-50 text-gray-900'
                    : 'border-gray-200 bg-white text-gray-400'
                }`}
              >
                <span>{section.name}</span>
                <span className="text-xs">
                  {section.status === 'complete' ? 'Complete' : 'Pending'}
                </span>
              </li>
            ))}
          </ol>

          {phase === 'complete' && run && (
            <button
              type="button"
              data-testid="demo-open-proposal"
              onClick={() => navigate(`/proposals/${run.proposalId}`)}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-jamo-500 px-5 py-2 text-sm font-medium text-white hover:bg-jamo-600"
            >
              Open proposal
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default DemoRunSurface
