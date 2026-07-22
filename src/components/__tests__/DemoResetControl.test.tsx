import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DemoResetControl } from '../demo/DemoResetControl'

// 16-09 Task 2. The control is tested in isolation, with a spy standing in for
// the driver's `resetToStart` — no renderHook (STATE.md: renderHook OOMs this
// suite) and no DemoRunSurface mount. Inline vi.mock, never dynamic import.
//
// What these assertions are protecting:
//   * D-10 — the invoke body must carry the demo_run_id the SESSION started.
//     The demo login is shared; an account-inferred run id could delete the
//     other presenter's live demo. The prop must be forwarded verbatim.
//   * D-11 — no window.location.reload. The reset is in-session. The old
//     sessionStorage.clear()+reload pattern deleted nothing server-side and
//     cost a full app boot mid-call; the reload spy below is the fence.
//   * Ordering — resetToStart must fire only AFTER the server confirms. Clearing
//     local state on a failed delete strands the rows with no handle to retry.

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}))

const DEMO_RUN_ID = '11111111-2222-3333-4444-555555555555'

const RESET_LABEL = /^reset demo$/i
const CONFIRM_LABEL = /delete and start over/i

/** Arm the two-step confirm and return the confirm button. */
async function armConfirm() {
  await userEvent.click(await screen.findByRole('button', { name: RESET_LABEL }))
  return screen.getByRole('button', { name: CONFIRM_LABEL })
}

let reloadSpy: ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.clearAllMocks()
  const { supabase } = await import('../../lib/supabase')
  ;(supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { ok: true, demo_run_id: DEMO_RUN_ID },
    error: null,
  })

  // jsdom's location.reload is not writable; replace the accessor so a
  // re-introduced reload is observable rather than a silent no-op.
  reloadSpy = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: reloadSpy },
  })
})

describe('DemoResetControl — invoke target and run scope (D-10)', () => {
  it('invokes demo-reset with the session run id after confirming', async () => {
    const { supabase } = await import('../../lib/supabase')
    render(<DemoResetControl demoRunId={DEMO_RUN_ID} onReset={vi.fn()} />)

    await userEvent.click(await armConfirm())

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('demo-reset', {
        body: { demo_run_id: DEMO_RUN_ID },
      })
    })
  })

  it('forwards a different run id verbatim — never an inferred "current" run', async () => {
    const { supabase } = await import('../../lib/supabase')
    const OTHER_RUN = '99999999-8888-7777-6666-555555555555'
    render(<DemoResetControl demoRunId={OTHER_RUN} onReset={vi.fn()} />)

    await userEvent.click(await armConfirm())

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('demo-reset', {
        body: { demo_run_id: OTHER_RUN },
      })
    })
  })

  it('sends nothing until the destructive action is confirmed', async () => {
    const { supabase } = await import('../../lib/supabase')
    render(<DemoResetControl demoRunId={DEMO_RUN_ID} onReset={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: RESET_LABEL }))

    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toBeInTheDocument()
  })

  it('cancelling the confirm sends nothing and restores the idle control', async () => {
    const { supabase } = await import('../../lib/supabase')
    render(<DemoResetControl demoRunId={DEMO_RUN_ID} onReset={vi.fn()} />)

    await armConfirm()
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: RESET_LABEL })).toBeInTheDocument()
  })
})

describe('DemoResetControl — in-session return to start (D-11)', () => {
  it('calls resetToStart on success and never reloads the page', async () => {
    // Guard the guard: an unwired spy would make every "no reload" assertion
    // below pass vacuously, which is exactly how D-11 would rot back in.
    expect(window.location.reload).toBe(reloadSpy)

    const onReset = vi.fn()
    render(<DemoResetControl demoRunId={DEMO_RUN_ID} onReset={onReset} />)

    await userEvent.click(await armConfirm())

    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1))
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('does NOT reset local state when the server refuses the delete', async () => {
    const { supabase } = await import('../../lib/supabase')
    ;(supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({ error: 'reset refused: not a resettable demo run' }),
        },
      },
    })
    const onReset = vi.fn()
    render(<DemoResetControl demoRunId={DEMO_RUN_ID} onReset={onReset} />)

    await userEvent.click(await armConfirm())

    // The server's OWN message, not supabase-js's generic non-2xx string.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'reset refused: not a resettable demo run'
    )
    expect(onReset).not.toHaveBeenCalled()
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('surfaces a thrown failure without resetting', async () => {
    const { supabase } = await import('../../lib/supabase')
    ;(supabase.functions.invoke as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Failed to fetch')
    )
    const onReset = vi.fn()
    render(<DemoResetControl demoRunId={DEMO_RUN_ID} onReset={onReset} />)

    await userEvent.click(await armConfirm())

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch')
    expect(onReset).not.toHaveBeenCalled()
  })
})

describe('DemoResetControl — in-flight state', () => {
  it('disables the confirm button while the delete is in flight and sends once', async () => {
    const { supabase } = await import('../../lib/supabase')
    let release: (value: { data: unknown; error: null }) => void = () => {}
    ;(supabase.functions.invoke as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      })
    )
    const onReset = vi.fn()
    render(<DemoResetControl demoRunId={DEMO_RUN_ID} onReset={onReset} />)

    const confirm = await armConfirm()
    await userEvent.click(confirm)

    const inFlight = await screen.findByRole('button', { name: /resetting/i })
    expect(inFlight).toBeDisabled()

    // A second click on a disabled control must not double-delete.
    await userEvent.click(inFlight)
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)

    release({ data: { ok: true }, error: null })
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1))
  })
})
