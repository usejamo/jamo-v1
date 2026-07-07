import type { GapResult, ChatWithJamoRequest } from '../types/chat'
import type { ChatMessage } from '../types/chat'

/**
 * Strip HTML tags from a string and trim whitespace.
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/**
 * Convert a snake_case section key to a human-readable Title Case title.
 * If the key exists in the optional map, that value takes precedence.
 *
 * @example
 * sectionKeyToTitle('study_understanding') // → 'Study Understanding'
 * sectionKeyToTitle('cover_letter', { cover_letter: 'Cover Letter (Customized)' }) // → 'Cover Letter (Customized)'
 */
export function sectionKeyToTitle(
  key: string,
  titleMap?: Record<string, string>
): string {
  if (titleMap && titleMap[key]) return titleMap[key]
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * @deprecated Replaced by server-side `analyze-proposal-gaps` edge function in Phase 14.2.
 * Kept behind VITE_ENABLE_CLIENT_GAPS=true feature flag.
 * detectGaps() call sites found in:
 *   - src/components/AIChatPanel.tsx (injectGapMessages — removed in Plan 07)
 *   - src/pages/ProposalDetail.tsx (gap analysis useEffect — removed in Plan 07)
 * Remove in Phase 14.3+ after server-side detection is proven stable.
 */
export function detectGaps(
  sections: Array<{ section_key: string; content: string; status: string }>
): GapResult[] {
  if (import.meta.env.VITE_ENABLE_CLIENT_GAPS !== 'true') return []
  const gaps: GapResult[] = []

  for (const section of sections) {
    const sectionTitle = section.section_key

    const placeholderIdx = section.content.indexOf('[PLACEHOLDER')
    if (placeholderIdx !== -1) {
      const end = section.content.indexOf(']', placeholderIdx)
      const detail = end !== -1
        ? section.content.slice(placeholderIdx, end + 1)
        : section.content.slice(placeholderIdx, placeholderIdx + 80)
      gaps.push({ sectionKey: section.section_key, sectionTitle, reason: 'placeholder', detail })
      continue
    }

    if (section.status === 'error') {
      gaps.push({ sectionKey: section.section_key, sectionTitle, reason: 'error', detail: 'Section failed to generate' })
      continue
    }

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
 * Build a sliding window of chat history within a token-estimate budget.
 * Token estimate: chars / 3.5 (fast approximation — no tokenizer needed).
 * Default budget targets ~12k tokens = 42000 chars.
 * Walks messages backwards, includes whole messages, returns in original order.
 */
export function buildSlidingWindow(
  messages: Array<{ role: string; content: string }>,
  budgetChars = 42000
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
 * Overlay live editor content onto the section snapshot so the model classifies
 * against the SAME placeholder ids the client will later resolve against (D-04).
 *
 * Without this, the chat context is built from the `proposalSections` DB snapshot
 * (only refreshed on load / post-generation), while substitute_placeholders
 * resolution reads the live editor via `handle.getContent()`. When a section is
 * edited in-session, the snapshot's `data-placeholder-id`s go stale — the model
 * emits dead ids and every target reports "placeholder not found in this section".
 * Mirrors ProposalDetail.getLiveSections (used for export) — same single-source-of-
 * truth rule, now applied to the chat context too. See Phase 14.4 substitution debug.
 *
 * Falls back to the snapshot content only when no live handle exists (unmounted
 * editor), matching getLiveSections' `?? s.content` semantics.
 */
export function resolveLiveSections<T extends { section_key: string; content: string }>(
  sections: T[],
  getLiveContent: (sectionKey: string) => string | undefined
): T[] {
  return sections.map((s) => {
    const live = getLiveContent(s.section_key)
    return live != null ? { ...s, content: live } : s
  })
}

/**
 * Build a structured context payload for the chat-with-jamo edge function.
 *
 * IMPORTANT: target_section.content is HTML with paragraph data-id attributes intact.
 * Do NOT strip HTML here — the AI needs paragraph IDs to use propose_edit correctly.
 * Only other_sections summaries are stripped (they are context-only, not edit targets).
 */
export function buildContextPayload(args: {
  proposalId: string
  orgId: string
  userId: string   // edge derives user_id from body (D-45) — required for all chat_sessions writes
  userMessage: string
  targetSectionKey: string
  sections: Array<{ section_key: string; content: string }>
  chatHistory: ChatMessage[]
  sectionTitles?: Record<string, string>   // D-06 — from Sidebar useMemo
  forcedTool?: import('../types/chat').ActionItemCtaTool   // when set, server forces tool_choice
  ctaPayload?: Record<string, unknown>   // ask_user CTA snapshot — edge persists into active_task (Risk B)
}): ChatWithJamoRequest {
  const { proposalId, orgId, userId, userMessage, targetSectionKey, sections, chatHistory, sectionTitles, forcedTool, ctaPayload } = args

  const targetSection = sections.find(s => s.section_key === targetSectionKey)

  const otherSections = sections
    .filter(s => s.section_key !== targetSectionKey)
    .map(s => ({
      key: s.section_key,
      title: sectionKeyToTitle(s.section_key, sectionTitles),
      content: s.content,   // full HTML with paragraph IDs — Claude may propose edits to any section
    }))

  const historyForWindow = chatHistory.map(m => ({ role: m.role, content: m.content }))
  const slidingHistory = buildSlidingWindow(historyForWindow)

  return {
    proposal_id: proposalId,
    org_id: orgId,
    user_id: userId,
    user_message: userMessage,
    target_section: {
      key: targetSectionKey,
      title: sectionKeyToTitle(targetSectionKey, sectionTitles),
      content: targetSection?.content ?? '',   // HTML with paragraph IDs — NOT stripped
    },
    other_sections: otherSections,
    chat_history: slidingHistory as Array<{ role: 'user' | 'assistant'; content: string }>,
    ...(forcedTool ? { forced_tool: forcedTool } : {}),
    ...(ctaPayload ? { cta_payload: ctaPayload } : {}),
  }
}
