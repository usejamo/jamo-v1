// src/components/chat/__tests__/AskUserCard.skip.test.tsx
// Wave 0 stub — un-skipped + wired in Plan 04 (add onSkip prop to AskUserCard).
//
// AC-9: skip button renders when onSkip is provided, calls onSkip on click,
//       and does NOT render when onSkip is undefined.
// Tag: 14.2.4-AC9-card
//
// Plan 04 wiring instructions:
//   1. Add optional `onSkip?: () => void` prop to AskUserCard interface
//   2. Render a "I don't have this yet" button inside the unanswered branch when onSkip truthy
//   3. Un-skip these tests and wire the render/fireEvent assertions:
//
//   it('14.2.4-AC9-card-01', () => {
//     render(<AskUserCard payload={mockPayload} onAnswer={vi.fn()} onSkip={vi.fn()} />)
//     expect(screen.getByText("I don't have this yet")).toBeInTheDocument()
//   })
//
//   it('14.2.4-AC9-card-02', () => {
//     const onSkip = vi.fn()
//     render(<AskUserCard payload={mockPayload} onAnswer={vi.fn()} onSkip={onSkip} />)
//     fireEvent.click(screen.getByText("I don't have this yet"))
//     expect(onSkip).toHaveBeenCalledTimes(1)
//   })
//
//   it('14.2.4-AC9-card-03', () => {
//     render(<AskUserCard payload={mockPayload} onAnswer={vi.fn()} />)
//     expect(screen.queryByText("I don't have this yet")).not.toBeInTheDocument()
//   })

import { describe, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AskUserCard } from '../AskUserCard'

// AskUserCard and testing-library imports resolve now.
// The onSkip prop does not exist yet — assertions stay skipped until Plan 04.

// Suppress unused-import lint until un-skipped:
void render
void screen
void fireEvent
void AskUserCard

describe('AskUserCard — skip affordance (14.2.4 D-09)', () => {
  it.skip('14.2.4-AC9-card-01: skip button renders when onSkip prop is provided', () => {
    // Wave 0 stub — implemented in Plan 04
  })

  it.skip('14.2.4-AC9-card-02: skip button calls onSkip when clicked', () => {
    // Wave 0 stub — implemented in Plan 04
  })

  it.skip('14.2.4-AC9-card-03: skip button does NOT render when onSkip is undefined', () => {
    // Wave 0 stub — implemented in Plan 04
  })
})

// Suppress vi unused lint:
void vi
