import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CitationsBlock } from './CitationsBlock'
import type { Citation } from '../../types/chat'

const makeCitation = (source: string, passage: string): Citation => ({
  source,
  passage,
  chunkId: `chunk-${source}`,
})

describe('CitationsBlock', () => {
  it('renders one chip per citation', () => {
    const citations = [
      makeCitation('ICH E6', 'Good clinical practice'),
      makeCitation('FDA Guidance', 'Safety requirements'),
    ]
    render(<CitationsBlock citations={citations} />)
    expect(screen.getByText('ICH E6')).toBeTruthy()
    expect(screen.getByText('FDA Guidance')).toBeTruthy()
  })

  it('chip shows source and passage excerpt', () => {
    const citations = [makeCitation('ICH E6', 'Good clinical practice guidelines')]
    render(<CitationsBlock citations={citations} />)
    const chip = screen.getByText('ICH E6')
    expect(chip).toBeTruthy()
    // passage is in title attribute
    expect(chip.getAttribute('title')).toBe('Good clinical practice guidelines')
  })

  it('renders nothing when citations array is empty', () => {
    const { container } = render(<CitationsBlock citations={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
