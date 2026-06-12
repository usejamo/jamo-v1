import { describe, it, expect } from 'vitest'
import { detectGaps, buildSlidingWindow, stripHtml, buildContextPayload } from '../chatContext'
import type { ChatMessage } from '../../types/chat'

describe('stripHtml', () => {
  it('removes tags and trims whitespace', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('collapses extra whitespace', () => {
    expect(stripHtml('<p>  hello   world  </p>')).toBe('hello   world')
  })

  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('')
  })
})

describe('detectGaps', () => {
  // detectGaps() is @deprecated (Phase 14.2) — guarded by VITE_ENABLE_CLIENT_GAPS feature flag.
  // In production (flag absent), all calls return []. Tests verify the feature-flag-off behavior.
  // Detailed gap-detection behavior is now covered by analyze-proposal-gaps edge function tests.

  it('returns empty array when VITE_ENABLE_CLIENT_GAPS is not set (default production behavior)', () => {
    // Flag is not set in test env — function should return [] immediately
    const sections = [
      { section_key: 'understanding', content: '[PLACEHOLDER: Add study details]', status: 'complete' },
    ]
    const gaps = detectGaps(sections)
    expect(gaps).toHaveLength(0)
  })

  it('returns empty array for healthy sections (flag off)', () => {
    const healthyContent = 'A'.repeat(300)
    const sections = [
      { section_key: 'understanding', content: healthyContent, status: 'complete' },
    ]
    const gaps = detectGaps(sections)
    expect(gaps).toHaveLength(0)
  })
})

describe('buildSlidingWindow', () => {
  it('includes recent messages within budget', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]
    const result = buildSlidingWindow(messages, 8000)
    expect(result).toHaveLength(2)
  })

  it('drops oldest messages when over budget', () => {
    const bigContent = 'A'.repeat(5000)
    const messages = [
      { role: 'user', content: bigContent },
      { role: 'assistant', content: bigContent },
    ]
    // Budget of 6000 chars — first message (5000) + second (5000) = 10000 > 6000
    // Walking backwards: second fits (5000 < 6000), first does not (total 10000 > 6000)
    const result = buildSlidingWindow(messages, 6000)
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('assistant')
  })

  it('never truncates mid-message', () => {
    const messages = [
      { role: 'user', content: 'Short' },
      { role: 'assistant', content: 'A'.repeat(9000) }, // over budget alone
    ]
    // Budget 8000 — second message (9000) > budget, so nothing fits
    const result = buildSlidingWindow(messages, 8000)
    // Only second message is walked first; it exceeds budget on its own, stop
    expect(result.every(m => typeof m.content === 'string')).toBe(true)
  })

  it('returns messages in original (chronological) order', () => {
    const messages = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]
    const result = buildSlidingWindow(messages, 8000)
    expect(result[0].content).toBe('First')
    expect(result[result.length - 1].content).toBe('Third')
  })
})

describe('buildContextPayload', () => {
  it('returns correct target vs summary structure', () => {
    const sections = [
      { section_key: 'understanding', content: '<p>Full understanding content here.</p>' },
      { section_key: 'budget', content: '<p>' + 'Budget detail '.repeat(20) + '</p>' },
    ]
    const chatHistory: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Tell me about the budget' },
    ]
    const payload = buildContextPayload({
      proposalId: 'prop-1',
      orgId: 'org-1',
      userId: 'user-1',
      userMessage: 'Explain the budget',
      targetSectionKey: 'understanding',
      sections,
      chatHistory,
    })

    expect(payload.proposal_id).toBe('prop-1')
    expect(payload.org_id).toBe('org-1')
    // Regression: edge derives user_id from the BODY (D-45); omitting it silently skips all
    // chat_sessions writes (active_task / resolved_items). It MUST be in the request payload.
    expect(payload.user_id).toBe('user-1')
    expect(payload.user_message).toBe('Explain the budget')
    expect(payload.target_section.key).toBe('understanding')
    // target_section.content is HTML with paragraph IDs intact (NOT stripped) — AI uses these IDs for propose_edit
    expect(payload.target_section.content).toContain('<p>')
    expect(payload.other_sections).toHaveLength(1)
    expect(payload.other_sections[0].key).toBe('budget')
    // other_sections.content is full HTML with paragraph IDs — AI may propose edits to any section
    expect(typeof payload.other_sections[0].content).toBe('string')
    expect(payload.chat_history).toHaveLength(1)
  })
})
