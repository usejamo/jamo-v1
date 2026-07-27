import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DemoRunSurface } from '../demo/DemoRunSurface'
import { Step4Generate } from '../wizard/Step4Generate'
import { DEFAULT_WIZARD_STATE } from '../../types/wizard'
import { STANDARD_TEMPLATE_ID } from '../../hooks/useDemoRun'

// 16-08 Task 3. Covers D-02 (standard template pre-selected AND locked) and the
// run-start invocation. Inline vi.mock per repo convention — never a dynamic
// import, which resolves the full supabase-js module and OOMs.

const DEMO_ORG = 'demo-org-uuid'
const REAL_ORG = 'real-org-uuid'
const STANDARD = { id: STANDARD_TEMPLATE_ID, name: 'Standard Proposal', description: null, source: 'prebuilt', parse_status: 'ready', is_default: true }
const OTHER = { id: 'template-other', name: 'Oncology Template', description: null, source: 'uploaded', parse_status: 'ready', is_default: false }

/** Per-table results the chainable query mock resolves to. */
const tableResults: Record<string, { data: unknown; error: unknown }> = {}

function makeQuery(table: string) {
  const result = () => tableResults[table] ?? { data: [], error: null }
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.order = () => q
  q.maybeSingle = () => Promise.resolve(result())
  q.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(onOk, onErr)
  return q
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => makeQuery(table)),
    functions: { invoke: vi.fn() },
  },
}))

const mockProfile: { id: string; role: string; org_id: string } = {
  id: 'presenter-1',
  role: 'super_admin',
  org_id: DEMO_ORG,
}
// FileUpload (rendered inside the reused Step2) throws without both.
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'presenter-1' }, profile: mockProfile }),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

// useDemoRun refetches ProposalsContext after demo-run-start (so ProposalDetail's
// proposals.find(id) resolves the server-created proposal). Provide a stub here.
vi.mock('../../context/ProposalsContext', () => ({
  useProposals: () => ({
    proposals: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    createProposal: vi.fn(),
    updateProposal: vi.fn(),
    updateStatus: vi.fn(),
    permanentlyDelete: vi.fn(),
  }),
}))

function setOrg(org: { slug: string; feature_flags: Record<string, unknown> } | null) {
  tableResults.organizations = { data: org ? { id: DEMO_ORG, ...org } : null, error: null }
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockProfile.role = 'super_admin'
  mockProfile.org_id = DEMO_ORG
  setOrg({ slug: 'jamo-demo', feature_flags: { is_demo: true } })
  tableResults.templates = { data: [STANDARD, OTHER], error: null }
  tableResults.template_sections = { data: [], error: null }
  tableResults.proposal_assumptions = { data: [], error: null }
  // demo-run-start materializes the RFP document row ALREADY parsed. That is
  // exactly the state that arms Step2DocumentUpload's live extract-assumptions
  // trigger, so the zero-model-call test below must run against it — with an
  // empty list the test would pass vacuously.
  tableResults.proposal_documents = {
    data: [
      {
        id: 'doc-1',
        parse_status: 'complete',
        filename: 'canonical-demo-rfp.pdf',
        mime_type: 'application/pdf',
        file_size: 1024,
        created_at: '2026-07-21T00:00:00Z',
        storage_path: 'demo/canonical-demo-rfp.pdf',
      },
    ],
    error: null,
  }
  tableResults.proposal_sections = { data: [], error: null }
  const { supabase } = await import('../../lib/supabase')
  ;(supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { proposal_id: 'p-1', demo_run_id: 'run-1', fixture_version: 2, sections: 3 },
    error: null,
  })
})

// ── D-02: standard template pre-selected AND locked ──────────────────────────

describe('Step4Generate demoMode — template lock (D-02)', () => {
  const noop = async () => {}

  it('renders the standard template selected and every card disabled', async () => {
    const dispatch = vi.fn()
    render(
      <Step4Generate state={DEFAULT_WIZARD_STATE} dispatch={dispatch} onGenerate={noop} demoMode />
    )

    const cards = await screen.findAllByRole('radio')
    expect(cards).toHaveLength(2)

    const standardCard = cards.find((c) => c.textContent?.includes('Standard Proposal'))!
    const otherCard = cards.find((c) => c.textContent?.includes('Oncology Template'))!

    expect(standardCard).toHaveAttribute('aria-checked', 'true')
    expect(otherCard).toHaveAttribute('aria-checked', 'false')
    // Locked: non-interactive by attribute AND by class.
    for (const card of cards) {
      expect(card).toHaveAttribute('aria-disabled', 'true')
      expect(card.className).toContain('pointer-events-none')
    }
  })

  it('does not change selection when the presenter clicks another template', async () => {
    const dispatch = vi.fn()
    render(
      <Step4Generate state={DEFAULT_WIZARD_STATE} dispatch={dispatch} onGenerate={noop} demoMode />
    )

    const cards = await screen.findAllByRole('radio')
    const otherCard = cards.find((c) => c.textContent?.includes('Oncology Template'))!
    await userEvent.click(otherCard)

    // The only SET_TEMPLATE ever dispatched is the forced standard template.
    const templateDispatches = dispatch.mock.calls
      .map(([a]) => a)
      .filter((a: { type: string }) => a.type === 'SET_TEMPLATE')
    expect(templateDispatches.every((a: { templateId: string }) => a.templateId === STANDARD_TEMPLATE_ID)).toBe(true)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SET_TEMPLATE', templateId: OTHER.id })

    // Selection is unmoved.
    expect(screen.getAllByRole('radio').find((c) => c.textContent?.includes('Oncology'))!)
      .toHaveAttribute('aria-checked', 'false')
  })

  it('leaves non-demo template selection interactive (no regression)', async () => {
    const dispatch = vi.fn()
    render(<Step4Generate state={DEFAULT_WIZARD_STATE} dispatch={dispatch} onGenerate={noop} />)

    const cards = await screen.findAllByRole('radio')
    for (const card of cards) expect(card).not.toHaveAttribute('aria-disabled')

    const otherCard = cards.find((c) => c.textContent?.includes('Oncology Template'))!
    await userEvent.click(otherCard)
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_TEMPLATE', templateId: OTHER.id })
  })
})

// ── Gate (cosmetic; demo-run-start is the real boundary) ─────────────────────

describe('DemoRunSurface — presenter gate', () => {
  it('renders nothing for a non-super_admin', async () => {
    mockProfile.role = 'admin'
    const { container } = render(<DemoRunSurface />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('renders nothing for a super_admin whose own org is not the demo org', async () => {
    // Two super_admins exist; the check must be org-scoped, not role-only.
    mockProfile.org_id = REAL_ORG
    setOrg({ slug: 'jamo-internal', feature_flags: {} })
    const { container } = render(<DemoRunSurface />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('renders for a demo-org super_admin', async () => {
    render(<DemoRunSurface />)
    expect(await screen.findByTestId('demo-add-rfp')).toBeInTheDocument()
  })
})

// ── Run start ────────────────────────────────────────────────────────────────

describe('DemoRunSurface — demo-run-start', () => {
  it('does NOT start a run merely by mounting', async () => {
    const { supabase } = await import('../../lib/supabase')
    render(<DemoRunSurface />)
    await screen.findByTestId('demo-add-rfp')
    // Navigating to the surface must not mint a proposal — otherwise every
    // visit litters the demo org with an abandoned draft for the sweep.
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('invokes demo-run-start with the standard template when the presenter adds the RFP', async () => {
    const { supabase } = await import('../../lib/supabase')
    render(<DemoRunSurface />)

    await userEvent.click(await screen.findByTestId('demo-add-rfp'))

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('demo-run-start', {
        body: { template_id: STANDARD_TEMPLATE_ID },
      })
    })
  })

  it('never invokes extract-assumptions during a demo run (zero model calls)', async () => {
    const { supabase } = await import('../../lib/supabase')
    render(<DemoRunSurface />)
    await userEvent.click(await screen.findByTestId('demo-add-rfp'))
    await screen.findByTestId('demo-wizard')

    // Step2DocumentUpload fires extract-assumptions when its documents are
    // parsed and extractionStatus is 'idle'. The driver seeds it 'complete',
    // so no model call is ever made. This is the phase's central invariant.
    const invoked = (supabase.functions.invoke as ReturnType<typeof vi.fn>).mock.calls.map(
      ([name]) => name
    )
    expect(invoked).not.toContain('extract-assumptions')
    expect(invoked).toEqual(['demo-run-start'])
  })

  it("surfaces the edge function's own message when no fixture has been captured", async () => {
    const { supabase } = await import('../../lib/supabase')
    ;(supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({ error: 'no active demo fixture for the standard template' }),
        },
      },
    })
    render(<DemoRunSurface />)

    await userEvent.click(await screen.findByTestId('demo-add-rfp'))

    // Today's real response: legible, not a hang and not a generic failure.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'no active demo fixture for the standard template'
    )
    // The start control stays available so the presenter can retry.
    expect(screen.getByTestId('demo-add-rfp')).toBeInTheDocument()
  })
})

// ── D-03: paced reveal from pre-written rows ─────────────────────────────────

describe('DemoRunSurface — paced section reveal (D-03)', () => {
  it('reveals sections from the already-written rows without calling generation', async () => {
    const { supabase } = await import('../../lib/supabase')
    tableResults.proposal_sections = {
      data: [
        { id: 's1', name: 'Study Understanding', section_name: 'Study Understanding', position: 1, role: 'intro', content: '<p>one</p>' },
        { id: 's2', name: 'Budget', section_name: 'Budget', position: 2, role: null, content: '<p>two</p>' },
      ],
      error: null,
    }

    render(<DemoRunSurface sectionDelayMs={0} />)
    await userEvent.click(await screen.findByTestId('demo-add-rfp'))
    await screen.findByTestId('demo-wizard')

    // Walk the real wizard forward: documents → assumptions → template.
    await userEvent.click(await screen.findByTestId('next-button')) // Step2 → Step3
    await userEvent.click(await screen.findByTestId('next-button')) // Step3 → Step4
    await userEvent.click(await screen.findByTestId('generate-button'))

    expect(await screen.findByText('Proposal ready')).toBeInTheDocument()
    expect(screen.getAllByTestId('demo-section-complete')).toHaveLength(2)
    expect(screen.getByText('2 / 2')).toBeInTheDocument()

    // Only demo-run-start was ever invoked — no generation, no streaming.
    const invoked = (supabase.functions.invoke as ReturnType<typeof vi.fn>).mock.calls.map(
      ([name]) => name
    )
    expect(invoked).toEqual(['demo-run-start'])
  })

  it('refuses to reveal a blank section rather than showing an empty card (Req 7)', async () => {
    tableResults.proposal_sections = {
      data: [
        { id: 's1', name: 'Study Understanding', section_name: 'Study Understanding', position: 1, role: null, content: '<p>one</p>' },
        { id: 's2', name: 'Budget', section_name: 'Budget', position: 2, role: null, content: '   ' },
      ],
      error: null,
    }

    render(<DemoRunSurface sectionDelayMs={0} />)
    await userEvent.click(await screen.findByTestId('demo-add-rfp'))
    await screen.findByTestId('demo-wizard')
    await userEvent.click(await screen.findByTestId('next-button')) // Step2 → Step3
    await userEvent.click(await screen.findByTestId('next-button')) // Step3 → Step4
    await userEvent.click(await screen.findByTestId('generate-button'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demo run aborted: empty section content for Budget.'
    )
    expect(screen.queryByTestId('demo-populate')).toBeNull()
  })
})
