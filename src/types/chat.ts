export interface Citation {
  source: string        // document name
  passage: string       // short quoted text
  chunkId: string       // chunk/section identifier
}

export interface ChatEditProposal {
  sectionKey: string
  proposedContent: string  // HTML string
  isStreaming: boolean
  status: 'pending' | 'accepted' | 'rejected'
}

export type ChatMessageType = 'chat' | 'gap' | 'explain' | 'edit-proposal'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isThinking?: boolean
  citations?: Citation[]
  editProposal?: ChatEditProposal
  messageType?: ChatMessageType
}

export interface GapResult {
  sectionKey: string
  sectionTitle: string
  reason: 'placeholder' | 'thin' | 'error'
  detail: string         // e.g. the placeholder text, or "Section is only 150 chars"
}

export type ChatIntent = 'rag' | 'explain' | 'edit' | 'general'

export interface ChatWithJamoRequest {
  proposal_id: string
  org_id: string
  user_message: string
  target_section: {
    key: string
    title: string
    content: string     // full plain text, HTML stripped client-side
  }
  other_sections: Array<{
    key: string
    title: string
    summary: string     // first 200 chars
  }>
  chat_history: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  intent_hint?: ChatIntent | null
}

// For persisting to proposal_chats table
export interface ChatRow {
  id?: string
  proposal_id: string
  org_id: string
  role: 'user' | 'assistant'
  content: string
  section_target_id: string | null
  message_type: ChatMessageType
  created_at?: string
}
