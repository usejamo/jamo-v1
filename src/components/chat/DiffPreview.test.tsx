import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiffPreview } from './DiffPreview'
import type { ProposeEditChange } from '../../types/chat'

const makeChange = (id: string, before?: string, after?: string): ProposeEditChange => ({
  paragraph_id: id,
  operation: 'replace',
  before_html: before,
  after_html: after,
  change_summary: `Summary for ${id}`,
})

describe('DiffPreview', () => {
  it('renders one row per change item', () => {
    const changes = [
      makeChange('p1', '<p>Old text</p>', '<p>New text</p>'),
      makeChange('p2', '<p>Another old</p>', '<p>Another new</p>'),
    ]
    render(
      <DiffPreview
        changes={changes}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    )
    // Two accept buttons = two rows
    const acceptBtns = screen.getAllByRole('button', { name: /accept-edit/i })
    expect(acceptBtns).toHaveLength(2)
  })

  it('accept button calls onAccept with paragraph id', () => {
    const onAccept = vi.fn()
    const change = makeChange('p1', '<p>Old</p>', '<p>New</p>')
    render(
      <DiffPreview
        changes={[change]}
        onAccept={onAccept}
        onReject={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /accept-edit/i }))
    expect(onAccept).toHaveBeenCalledWith('p1', change)
  })

  it('reject button calls onReject with paragraph id', () => {
    const onReject = vi.fn()
    const change = makeChange('p1', '<p>Old</p>', '<p>New</p>')
    render(
      <DiffPreview
        changes={[change]}
        onAccept={vi.fn()}
        onReject={onReject}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /reject edit/i }))
    expect(onReject).toHaveBeenCalledWith('p1')
  })

  it('accepted row shows emerald background and Accepted label', () => {
    const change = makeChange('p1', '<p>Old</p>', '<p>New</p>')
    const { container } = render(
      <DiffPreview
        changes={[change]}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        acceptedIds={['p1']}
      />
    )
    // Accepted label shown instead of buttons
    expect(screen.getByText('Accepted')).toBeTruthy()
    // Accept/reject buttons should not be present
    expect(screen.queryByRole('button', { name: /accept-edit/i })).toBeNull()
    // Row has emerald class
    const row = container.querySelector('.bg-emerald-50\\/50')
    expect(row).toBeTruthy()
  })

  it('stale paragraph row shows amber border and discard copy', () => {
    const change = makeChange('p1', '<p>Old</p>', '<p>New</p>')
    const { container } = render(
      <DiffPreview
        changes={[change]}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        staleIds={['p1']}
      />
    )
    expect(screen.getByText(/This paragraph was removed/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Discard suggestion/i })).toBeTruthy()
    const staleRow = container.querySelector('.border-amber-400')
    expect(staleRow).toBeTruthy()
  })
})
