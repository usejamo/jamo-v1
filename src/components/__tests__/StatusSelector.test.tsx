import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StatusSelector } from '../StatusSelector'

// The status menu was an `absolute` child of the selector, so it was clipped by
// the nearest scrolling ancestor: the app shell renders <main> as
// `flex-1 overflow-y-auto` inside `h-screen overflow-hidden`. A trigger near the
// bottom of the viewport opened a menu that ran past that container and was cut
// off — measured in the browser at menu bottom 846px vs container bottom 730px,
// leaving 116px invisible and unclickable.
//
// It is now portalled to <body> with fixed coordinates measured from the
// trigger, which escapes both the overflow clip and any ancestor stacking
// context. jsdom does no layout, so these tests pin the portal contract and the
// interactions the portal could plausibly break (click-outside now has to check
// a node that is NOT inside the component's own subtree). The geometry itself
// was verified in a real browser.

const setup = (props: Partial<React.ComponentProps<typeof StatusSelector>> = {}) => {
  const onChange = vi.fn().mockResolvedValue(undefined)
  const utils = render(
    <StatusSelector status="draft" onChange={onChange} variant="compact" {...props} />
  )
  return { onChange, ...utils }
}

describe('StatusSelector menu portal', () => {
  it('renders the menu outside the component subtree, into document.body', () => {
    const { container } = setup()
    fireEvent.click(screen.getByText('Draft'))
    const menu = document.querySelector('[data-testid="status-menu"]')
    expect(menu).toBeTruthy()
    // The whole point: it must NOT be a descendant of the selector, or an
    // ancestor's overflow would clip it again.
    expect(container.contains(menu)).toBe(false)
    expect(document.body.contains(menu!)).toBe(true)
  })

  it('positions the menu with fixed coordinates rather than absolute flow', () => {
    setup()
    fireEvent.click(screen.getByText('Draft'))
    const menu = document.querySelector('[data-testid="status-menu"]') as HTMLElement
    expect(menu.className).toContain('fixed')
    expect(menu.className).not.toContain('absolute')
  })

  it('still selects a status when a menu item is clicked', async () => {
    // Regression guard: the menu is outside the selector's ref, so a naive
    // click-outside handler would close the menu before the item's onClick ran.
    const { onChange } = setup()
    fireEvent.click(screen.getByText('Draft'))
    fireEvent.click(screen.getByText('Submitted'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('submitted'))
  })

  it('does not close when clicking inside the portalled menu', () => {
    setup()
    fireEvent.click(screen.getByText('Draft'))
    const menu = document.querySelector('[data-testid="status-menu"]') as HTMLElement
    fireEvent.mouseDown(menu)
    expect(document.querySelector('[data-testid="status-menu"]')).toBeTruthy()
  })

  it('closes when clicking outside both the trigger and the menu', () => {
    setup()
    fireEvent.click(screen.getByText('Draft'))
    expect(document.querySelector('[data-testid="status-menu"]')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(document.querySelector('[data-testid="status-menu"]')).toBeFalsy()
  })

  it('offers every status option', () => {
    setup()
    fireEvent.click(screen.getByText('Draft'))
    const menu = document.querySelector('[data-testid="status-menu"]') as HTMLElement
    const labels = Array.from(menu.querySelectorAll('button')).map(b => b.textContent?.trim())
    expect(labels).toEqual(['Draft', 'Submitted', 'Won', 'Lost'])
  })

  it('unmounts the portalled menu when the trigger is toggled closed', () => {
    // Target the trigger explicitly: once the menu is open, the text "Draft"
    // also matches the menu's own Draft option.
    const { container } = setup()
    const trigger = container.querySelector('button') as HTMLElement
    fireEvent.click(trigger)
    expect(document.querySelector('[data-testid="status-menu"]')).toBeTruthy()
    fireEvent.click(trigger)
    expect(document.querySelector('[data-testid="status-menu"]')).toBeFalsy()
  })

  it('does not open at all when disabled', () => {
    setup({ disabled: true })
    fireEvent.click(screen.getByText('Draft'))
    expect(document.querySelector('[data-testid="status-menu"]')).toBeFalsy()
  })
})
