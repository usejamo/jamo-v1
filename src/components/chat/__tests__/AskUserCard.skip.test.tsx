// src/components/chat/__tests__/AskUserCard.skip.test.tsx
// Wave 0 stub — un-skipped + wired in Plan 04 (add onSkip prop to AskUserCard).
//
// AC-9: skip button renders when onSkip is provided, calls onSkip on click,
//       and does NOT render when onSkip is undefined.
// Tag: 14.2.4-AC9-card

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AskUserCard } from '../AskUserCard'

const mockPayload = { question: 'What is the CRO legal entity name?' }

describe('AskUserCard — skip affordance (14.2.4 D-09)', () => {
  it('14.2.4-AC9-card-01: skip button renders when onSkip prop is provided', () => {
    render(<AskUserCard payload={mockPayload} onAnswer={vi.fn()} onSkip={vi.fn()} />)
    expect(screen.getByText("I don't have this yet")).toBeInTheDocument()
  })

  it('14.2.4-AC9-card-02: skip button calls onSkip when clicked', () => {
    const onSkip = vi.fn()
    render(<AskUserCard payload={mockPayload} onAnswer={vi.fn()} onSkip={onSkip} />)
    fireEvent.click(screen.getByText("I don't have this yet"))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('14.2.4-AC9-card-03: skip button does NOT render when onSkip is undefined', () => {
    render(<AskUserCard payload={mockPayload} onAnswer={vi.fn()} />)
    expect(screen.queryByText("I don't have this yet")).not.toBeInTheDocument()
  })
})
