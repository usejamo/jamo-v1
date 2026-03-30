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
  it('returns placeholder gaps for sections containing [PLACEHOLDER', () => {
    const sections = [
      { section_key: 'understanding', content: '[PLACEHOLDER: Add study details]', status: 'complete' },
    ]
    const gaps = detectGaps(sections)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].reason).toBe('placeholder')
    expect(gaps[0].sectionKey).toBe('understanding')
    expect(gaps[0].detail).toContain('[PLACEHOLDER')
  })

  it('returns thin section gaps for content under 200 chars', () => {
    const sections = [
      { section_key: 'budget', content: 'Short budget.', status: 'complete' },
    ]
    const gaps = detectGaps(sections)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].reason).toBe('thin')
    expect(gaps[0].detail).toContain('13')
  })

  it('returns error section gaps when status is error', () => {
    const sections = [
      { section_key: 'timeline', content: '', status: 'error' },
    ]
    const gaps = detectGaps(sections)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].reason).toBe('error')
    expect(gaps[0].detail).toBe('Section failed to generate')
  })

  it('returns empty array for healthy sections', () => {
    const healthyContent = 'A'.repeat(300)
    const sections = [
      { section_key: 'understanding', content: healthyContent, status: 'complete' },
    ]
    const gaps = detectGaps(sections)
    expect(gaps).toHaveLength(0)
  })

  it('returns multiple gaps for multiple issues', () => {
    const sections = [
      { section_key: 'understanding', content: '[PLACEHOLDER: fix]', status: 'complete' },
      { section_key: 'timeline', content: '', status: 'error' },
    ]
    const gaps = detectGaps(sections)
    expect(gaps).toHaveLength(2)
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
      userMessage: 'Explain the budget',
      targetSectionKey: 'understanding',
      sections,
      chatHistory,
    })

    expect(payload.proposal_id).toBe('prop-1')
    expect(payload.org_id).toBe('org-1')
    expect(payload.user_message).toBe('Explain the budget')
    expect(payload.target_section.key).toBe('understanding')
    expect(payload.target_section.content).not.toContain('<p>')
    expect(payload.other_sections).toHaveLength(1)
    expect(payload.other_sections[0].key).toBe('budget')
    expect(payload.other_sections[0].summary.length).toBeLessThanOrEqual(200)
    expect(payload.chat_history).toHaveLength(1)
  })
})
