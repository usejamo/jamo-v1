import { SECTION_NAMES } from '../types/generation'
import type { GapResult, ChatWithJamoRequest, ChatMessage } from '../types/chat'

/**
 * Strip HTML tags from a string and trim whitespace.
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/**
 * Detect content gaps in proposal sections.
 * Returns a GapResult for each section that has a placeholder, is thin (<200 chars), or errored.
 */
export function detectGaps(
  sections: Array<{ section_key: string; content: string; status: string }>
): GapResult[] {
  const gaps: GapResult[] = []

  for (const section of sections) {
    const sectionTitle = SECTION_NAMES[section.section_key] ?? section.section_key

    // Check for placeholder text
    const placeholderIdx = section.content.indexOf('[PLACEHOLDER')
    if (placeholderIdx !== -1) {
      const end = section.content.indexOf(']', placeholderIdx)
      const detail = end !== -1
        ? section.content.slice(placeholderIdx, end + 1)
        : section.content.slice(placeholderIdx, placeholderIdx + 80)
      gaps.push({ sectionKey: section.section_key, sectionTitle, reason: 'placeholder', detail })
      continue
    }

    // Check for error status
    if (section.status === 'error') {
      gaps.push({ sectionKey: section.section_key, sectionTitle, reason: 'error', detail: 'Section failed to generate' })
      continue
    }

    // Check for thin content
    const plainText = stripHtml(section.content)
    if (plainText.length < 200) {
      gaps.push({
        sectionKey: section.section_key,
        sectionTitle,
        reason: 'thin',
        detail: `Section is only ${plainText.length} characters`,
      })
    }
  }

  return gaps
}

/**
 * Build a sliding window of chat history that fits within a character budget.
 * Walks messages backwards, includes whole messages, returns in original order.
 */
export function buildSlidingWindow(
  messages: Array<{ role: string; content: string }>,
  budgetChars = 8000
): Array<{ role: string; content: string }> {
  const collected: Array<{ role: string; content: string }> = []
  let used = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const cost = msg.content.length
    if (used + cost > budgetChars) break
    collected.push(msg)
    used += cost
  }

  return collected.reverse()
}

/**
 * Build a structured context payload for the chat-with-jamo edge function.
 */
export function buildContextPayload(args: {
  proposalId: string
  orgId: string
  userMessage: string
  targetSectionKey: string
  sections: Array<{ section_key: string; content: string }>
  chatHistory: ChatMessage[]
}): ChatWithJamoRequest {
  const { proposalId, orgId, userMessage, targetSectionKey, sections, chatHistory } = args

  const targetSection = sections.find(s => s.section_key === targetSectionKey)
  const targetPlainText = targetSection ? stripHtml(targetSection.content) : ''
  const targetTitle = SECTION_NAMES[targetSectionKey] ?? targetSectionKey

  const otherSections = sections
    .filter(s => s.section_key !== targetSectionKey)
    .map(s => ({
      key: s.section_key,
      title: SECTION_NAMES[s.section_key] ?? s.section_key,
      summary: stripHtml(s.content).slice(0, 200),
    }))

  const historyForWindow = chatHistory.map(m => ({ role: m.role, content: m.content }))
  const slidingHistory = buildSlidingWindow(historyForWindow)

  return {
    proposal_id: proposalId,
    org_id: orgId,
    user_message: userMessage,
    target_section: {
      key: targetSectionKey,
      title: targetTitle,
      content: targetPlainText,
    },
    other_sections: otherSections,
    chat_history: slidingHistory,
  }
}
