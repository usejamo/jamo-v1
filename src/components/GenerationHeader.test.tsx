import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerationHeader } from './GenerationHeader'

describe('GenerationHeader', () => {
  it('shows Stop and no Resume while generating', () => {
    render(
      <GenerationHeader
        isGenerating
        phase="generating"
        completedCount={2}
        totalCount={9}
        onStop={vi.fn()}
        onResume={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
  })

  it('shows Resume and no Stop when paused, with the progress wording', () => {
    render(
      <GenerationHeader
        isGenerating={false}
        phase="paused"
        completedCount={6}
        totalCount={9}
        onStop={vi.fn()}
        onResume={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(screen.getByText(/Generation paused/)).toBeDefined()
    expect(screen.getByText(/6 of 9 sections complete/)).toBeDefined()
  })

  it('calls onResume when Resume is clicked', async () => {
    const onResume = vi.fn()
    render(
      <GenerationHeader
        isGenerating={false}
        phase="paused"
        completedCount={1}
        totalCount={9}
        onResume={onResume}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('shows neither control when generation is complete', () => {
    render(
      <GenerationHeader
        isGenerating={false}
        phase="complete"
        completedCount={9}
        totalCount={9}
        onStop={vi.fn()}
        onResume={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })
})
