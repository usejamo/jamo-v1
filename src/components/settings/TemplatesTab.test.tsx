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

const mockReadyTemplate = {
  id: 'tpl-1',
  name: 'Standard Proposal',
  description: null,
  source: 'uploaded' as const,
  parse_status: 'ready' as const,
  low_confidence: false,
  file_path: 'org/templates/tpl-1/doc.docx',
  created_at: '2026-01-01',
  org_id: 'test-org',
  style_inspection: null,
}

const mockSections = [
  { id: 'sec-1', name: 'Executive Summary', role: 'executive_summary', position: 1, description: 'Overview of the proposal' },
  { id: 'sec-2', name: 'Scope of Work', role: 'scope_of_work', position: 2, description: null },
]

function makeMockSupabase(sectionsOverride = mockSections, sectionError: any = null) {
  return {
    supabase: {
      from: (table: string) => {
        if (table === 'templates') {
          return {
            select: () => ({
              order: () => ({
                order: () => Promise.resolve({ data: [mockReadyTemplate], error: null }),
              }),
            }),
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        if (table === 'template_sections') {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: sectionsOverride, error: sectionError }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        return { select: () => ({}) }
      },
      storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
      functions: { invoke: vi.fn() },
    },
  }
}

describe('SectionDisclosure', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../lib/supabase', () => makeMockSupabase())
  })

  it('loads and displays section names when disclosure is opened', async () => {
    const { TemplatesTab: TemplatesTabModule } = await import('./TemplatesTab')
    render(<TemplatesTabModule />)

    const toggle = await screen.findByRole('button', { name: /view detected sections/i })
    await userEvent.click(toggle)

    const items = await screen.findAllByRole('listitem')
    const itemText = items.map(i => i.textContent ?? '')
    expect(itemText.some(t => t.includes('Executive Summary'))).toBe(true)
    expect(itemText.some(t => t.includes('Scope of Work'))).toBe(true)
  })
})
