import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplatesTab } from './TemplatesTab'

// D-15/D-16: handleFileUpload rejects files over 10MB with actionable message

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => ({ order: () => ({ data: [], error: null }) }) }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    functions: { invoke: vi.fn() },
  },
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ profile: { org_id: 'test-org' } }),
}))

describe('TemplatesTab size cap', () => {
  it('shows size-cap error for a file over 10 MB', async () => {
    render(<TemplatesTab />)

    const oversizedFile = new File(
      [new ArrayBuffer(11 * 1024 * 1024)],
      'big.docx',
      { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    )

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, oversizedFile)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('11.0 MB')
    expect(alert).toHaveTextContent('compress')
  })
})
