// AIChatPanel test stubs — component not yet implemented (Phase 9 Plan 01+)
// Using it.skip per the stub test pattern (Vite resolves imports at transform time)
import { describe, it } from 'vitest'

describe('AIChatPanel', () => {
  it.skip('renders gap badge count on rail when gapCount > 0', () => {
    // Expect a badge showing the number of detected gaps
  })

  it.skip('hides gap badge when gapCount is 0', () => {
    // Expect no badge rendered when there are no gaps
  })

  it.skip('calls insertContentAt on accept of edit proposal', () => {
    // Expect SectionEditorHandle.insertContentAt called with proposed content
  })

  it.skip('streams content into message bubble without layout thrash', () => {
    // Expect streaming tokens accumulate in existing bubble, not new renders
  })

  it.skip('shows explain chip when activeSectionKey is set', () => {
    // Expect "Explain this section" quick action chip visible
  })

  it.skip('hides explain chip when no section targeted', () => {
    // Expect explain chip absent when activeSectionKey is null/undefined
  })

  it.skip('persists messages to proposal_chats on send', () => {
    // Expect Supabase insert called with correct role/content/section_target_id
  })

  it.skip('displays citations in explain response', () => {
    // Expect citation pills rendered when assistant message has citations array
  })
})
