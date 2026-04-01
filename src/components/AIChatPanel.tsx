import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import type { ChatMessage, GapResult } from '../types/chat'
import type { SectionEditorHandle } from '../types/workspace'
import { buildContextPayload, detectGaps } from '../utils/chatContext'

interface Props {
  proposalId: string
  orgId: string
  draftGenerated: boolean                        // keep — gate for "generate first" message
  sections: Array<{ section_key: string; content: string; title?: string }>
  editorRefs: React.MutableRefObject<Map<string, SectionEditorHandle>>
  activeSectionKey?: string | null
  gapCount: number
  onGapsConsumed: () => void
}

// ── ChatEditPreview sub-component ──────────────────────────────────────────────

function ChatEditPreview({
  content,
  isStreaming,
  onAccept,
  onReject,
}: {
  content: string
  isStreaming: boolean
  onAccept: () => void
  onReject: () => void
}) {
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-3 text-sm">
      <div
        className="prose prose-invert prose-sm max-w-none mb-3"
        dangerouslySetInnerHTML={{ __html: content }}
      />
      {!isStreaming && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={onAccept}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
          >
            Accept
          </button>
          <button
            onClick={onReject}
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70 text-xs"
          >
            Reject
          </button>
        </div>
      )}
      {isStreaming && (
        <p className="text-white/40 text-xs mt-1">Generating…</p>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PanelCloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m4.5-11.25 3.75 3.75-3.75 3.75M3.75 19.5h16.5a1.5 1.5 0 0 0 1.5-1.5v-13.5a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v13.5a1.5 1.5 0 0 0 1.5 1.5Z" />
    </svg>
  )
}

function SparkleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="-3 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  )
}

// ── Spectrum sparkle button (ROYGBIV pulse) ───────────────────────────────────

function SpectrumSparkle({ onToggle, gapCount }: { onToggle: () => void; gapCount?: number }) {
  return (
    <div className="relative">
      <motion.div
        onClick={onToggle}
        className="roygbiv-spin p-[1.5px] rounded-lg shrink-0 cursor-pointer"
        style={{
          background: 'linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00cc44, #0066ff, #4b0082, #8b00ff)',
          boxShadow: '0 0 8px 2px rgba(255, 80, 80, 0.35)',
        }}
        whileHover={{
          scale: 1.08,
          boxShadow: '0 0 16px 5px rgba(255, 80, 80, 0.55)',
        }}
        whileTap={{ scale: 0.93 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      >
        <div className="w-7 h-7 rounded-[6px] bg-white flex items-center justify-center">
          <SparkleIcon className="w-3.5 h-3.5 text-red-500" />
        </div>
      </motion.div>
      {gapCount != null && gapCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center px-1 animate-pulse">
          {gapCount}
        </span>
      )}
    </div>
  )
}

// ── Aurora border wrapper ─────────────────────────────────────────────────────

function AuroraBorder({ children, fast, className = '' }: {
  children: React.ReactNode
  fast: boolean
  className?: string
}) {
  return (
    <div className={`p-[1.5px] rounded-2xl ${fast ? 'jamo-aurora-fast' : 'jamo-aurora'} ${className}`}>
      {children}
    </div>
  )
}

// ── Rail (collapsed) view ─────────────────────────────────────────────────────

function Rail({ onExpand, processing, gapCount }: { onExpand: () => void; processing: boolean; gapCount: number }) {
  return (
    <div
      onClick={onExpand}
      title="Open jamo AI (⌘J)"
      className="flex flex-col items-center h-full pt-4 pb-3 gap-3 cursor-pointer hover:bg-black/[0.03] transition-colors"
    >
      <SpectrumSparkle onToggle={onExpand} gapCount={gapCount} />

      {/* Pulsing dot + label */}
      <div className="mt-auto mb-2 flex flex-col items-center gap-1.5">
        <motion.div
          className={`w-2 h-2 rounded-full ${processing ? 'bg-emerald-400' : 'bg-emerald-400/60'}`}
          animate={{ scale: processing ? [1, 1.4, 1] : [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: processing ? 0.8 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="text-[9px] text-gray-400 font-medium tracking-wide" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          jamo AI
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AIChatPanel({
  proposalId,
  orgId,
  draftGenerated,
  sections,
  editorRefs,
  activeSectionKey,
  gapCount,
  onGapsConsumed,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentIntent, setCurrentIntent] = useState<string>('general')
  const [gapMessagesInjected, setGapMessagesInjected] = useState(false)
  const prevGapCountRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load chat history from Supabase on mount
  useEffect(() => {
    if (!proposalId) return
    supabase
      .from('proposal_chats')
      .select('id, role, content, message_type, created_at')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data?.length) return
        setMessages((data as any[]).map((row: any) => ({
          id: row.id,
          role: row.role as ChatMessage['role'],
          content: row.content,
          // edit-proposal is ephemeral — on reload show as plain chat (decision already made)
          messageType: row.message_type === 'edit-proposal' ? 'chat' : (row.message_type ?? 'chat') as ChatMessage['messageType'],
        })))
      })
  }, [proposalId])

  // Keyboard shortcut: Cmd/Ctrl + J
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        handlePanelToggle()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new message or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Scroll to bottom when panel expands — delayed so messages are rendered first
  useEffect(() => {
    if (expanded) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 350)
  }, [expanded])

  // Focus input when expanding
  useEffect(() => {
    if (expanded) setTimeout(() => inputRef.current?.focus(), 320)
  }, [expanded])

  // Reset injection flag when gapCount increases (new gaps after re-generation)
  useEffect(() => {
    if (gapCount > 0 && gapCount !== prevGapCountRef.current) {
      setGapMessagesInjected(false)
    }
    prevGapCountRef.current = gapCount
  }, [gapCount])

  // Inject gap messages immediately if panel is already open when gaps are detected
  useEffect(() => {
    if (expanded && gapCount > 0 && !gapMessagesInjected) {
      injectGapMessages()
      setGapMessagesInjected(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, gapCount, gapMessagesInjected])

  // ── Gap message injection ──────────────────────────────────────────────────

  function formatGapMessage(gap: GapResult): string {
    if (gap.reason === 'placeholder') {
      return `**${gap.sectionTitle}** has an unfilled placeholder: "${gap.detail}". What should go here?`
    }
    if (gap.reason === 'thin') {
      return `**${gap.sectionTitle}** looks thin (${gap.detail}). Want me to expand it?`
    }
    return `**${gap.sectionTitle}** failed to generate. Want me to try again?`
  }

  function injectGapMessages() {
    const gaps = detectGaps(
      sections.map(s => ({ section_key: s.section_key, content: s.content, status: '' }))
    )
    if (gaps.length === 0) return

    const capped = gaps.slice(0, 2)
    const hasMore = gaps.length > 2

    const gapMsgs: ChatMessage[] = capped.map((gap, i) => ({
      id: `gap-${i}`,
      role: 'assistant' as const,
      content: formatGapMessage(gap),
      messageType: 'gap' as const,
    }))

    if (hasMore) {
      const remainCount = gaps.length - 2
      gapMsgs.push({
        id: 'gap-consolidate',
        role: 'assistant' as const,
        content: `There ${remainCount === 1 ? 'is' : 'are'} also ${remainCount} smaller gap${remainCount === 1 ? '' : 's'} — want me to walk through those next?`,
        messageType: 'gap' as const,
      })
    }

    const openingMessage: ChatMessage = {
      id: 'gap-intro',
      role: 'assistant' as const,
      content: `I found ${gaps.length} thing${gaps.length === 1 ? '' : 's'} worth addressing before you finalize this.`,
      messageType: 'gap' as const,
    }

    setMessages(prev => [...prev, openingMessage, ...gapMsgs])
    onGapsConsumed()
  }

  function handlePanelToggle() {
    setExpanded(prev => {
      const next = !prev
      if (next && gapCount > 0 && !gapMessagesInjected) {
        // Schedule gap injection after state update
        setTimeout(() => {
          injectGapMessages()
          setGapMessagesInjected(true)
        }, 0)
      }
      return next
    })
  }

  function handlePanelOpen() {
    if (gapCount > 0 && !gapMessagesInjected) {
      injectGapMessages()
      setGapMessagesInjected(true)
    }
    setExpanded(true)
  }

  // ── Accept/Reject edit proposals ───────────────────────────────────────────

  const handleAcceptEdit = useCallback((messageId: string, content: string) => {
    // Use active section, or fall back to first available editor
    const targetKey = activeSectionKey ?? [...editorRefs.current.keys()][0]
    if (!targetKey) {
      console.warn('No editor section available to apply edit')
      return
    }
    const handle = editorRefs.current.get(targetKey)
    if (!handle) {
      console.warn('Editor handle not found for section:', targetKey)
      return
    }
    handle.setContent(content)
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, messageType: 'chat' as const } : m
    ))
  }, [activeSectionKey, editorRefs])

  // ── Live streaming handleSubmit ────────────────────────────────────────────

  const handleSubmit = useCallback(async (messageText?: string) => {
    const text = messageText ?? input.trim()
    if (!text || isStreaming) return
    setInput('')

    if (!draftGenerated) {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: 'Please generate the proposal draft first — I need the content loaded before I can make edits.',
        messageType: 'chat',
      }])
      return
    }

    // Add user message to display
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      messageType: 'chat',
    }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)
    setStreamingContent('')

    // Persist user message
    await supabase.from('proposal_chats').insert({
      proposal_id: proposalId,
      org_id: orgId,
      role: 'user',
      content: text,
      section_target_id: activeSectionKey ?? null,
      message_type: 'chat',
    })

    // Build context payload
    const payload = buildContextPayload({
      proposalId,
      orgId,
      userMessage: text,
      targetSectionKey: activeSectionKey ?? (sections[0]?.section_key ?? ''),
      sections,
      chatHistory: messages,
    })

    // Detect explain intent for chip shortcut
    const intentHint = text.toLowerCase().includes('explain') ? 'explain' : null

    let fullContent = ''
    let intent = 'general'

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const response = await fetch(`${supabaseUrl}/functions/v1/chat-with-jamo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: JSON.stringify({ ...payload, intent_hint: intentHint }),
      })
      if (!response.ok) throw new Error(`Edge function error: ${response.status}`)

      // response.body is the raw ReadableStream for SSE
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const raw = line.slice(6)
          if (raw === '[DONE]') break
          try {
            const event = JSON.parse(raw)
            // Intent metadata event (emitted first by Edge Function)
            if (event.type === 'intent') {
              intent = event.intent
              setCurrentIntent(event.intent)
              continue
            }
            // Anthropic SDK content_block_delta event
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              fullContent += event.delta.text
              setStreamingContent(fullContent)
            }
          } catch {
            // Non-JSON line — skip
          }
        }
      }
    } catch (err) {
      console.error('chat-with-jamo error:', err)
      fullContent = 'Sorry, something went wrong. Please try again.'
    }

    // Merge streamed content into messages
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: fullContent,
      messageType: intent === 'edit' ? 'edit-proposal' : (intent as ChatMessage['messageType']),
    }
    setMessages(prev => [...prev, assistantMsg])
    setStreamingContent('')
    setIsStreaming(false)

    // Persist assistant message — edit-proposal stored as 'chat' so history never re-shows Accept/Reject
    await supabase.from('proposal_chats').insert({
      proposal_id: proposalId,
      org_id: orgId,
      role: 'assistant',
      content: fullContent,
      section_target_id: activeSectionKey ?? null,
      message_type: 'chat',
    })
  }, [input, isStreaming, draftGenerated, proposalId, orgId, activeSectionKey, sections, messages])

  // currentIntent used in rendering to determine streaming bubble style
  const _currentIntent = currentIntent

  return (
    // Outer shell: drives the width animation and acts as the aurora border host
    <motion.div
      animate={{ width: expanded ? 350 : 60 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="shrink-0 h-full"
      style={{ minWidth: expanded ? 350 : 60 }}
    >
      <AuroraBorder fast={isStreaming} className="h-full">
        {/* Glass inner panel */}
        <div className="h-full rounded-[14px] bg-white/92 backdrop-blur-md overflow-hidden flex flex-col"
          style={{ boxShadow: 'inset 0 0 0 0 transparent' }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {!expanded ? (
              <motion.div
                key="rail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <Rail onExpand={handlePanelOpen} processing={isStreaming} gapCount={gapCount} />
              </motion.div>
            ) : (
              <motion.div
                key="panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col h-full min-w-0"
              >
                {/* Header */}
                <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/60 shrink-0">
                  <SpectrumSparkle onToggle={() => setExpanded(false)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-none">jamo AI</p>
                    <p className="text-xs text-gray-400 mt-0.5">Proposal assistant</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <motion.span
                        className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <span className="text-xs text-gray-400">Live</span>
                    </div>
                    <button
                      onClick={() => setExpanded(false)}
                      title="Collapse (⌘J)"
                      className="w-6 h-6 p-0 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
                    >
                      <PanelCloseIcon />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-0">
                  <AnimatePresence initial={false}>
                    {messages.map((msg, i) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, delay: i === 0 ? 0 : 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {msg.isThinking ? (
                          <div className="bg-gray-100/80 backdrop-blur-sm rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1.5">
                            {[0, 1, 2].map(j => (
                              <motion.span
                                key={j}
                                className="w-1.5 h-1.5 rounded-full bg-gray-400"
                                animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                                transition={{ duration: 0.9, repeat: Infinity, delay: j * 0.18 }}
                              />
                            ))}
                          </div>
                        ) : msg.role === 'assistant' && msg.messageType === 'edit-proposal' ? (
                          <div className="max-w-[88%]">
                            <ChatEditPreview
                              content={msg.content}
                              isStreaming={false}
                              onAccept={() => handleAcceptEdit(msg.id, msg.content)}
                              onReject={() => setMessages(prev => prev.map(m =>
                                m.id === msg.id ? { ...m, messageType: 'chat' as const } : m
                              ))}
                            />
                          </div>
                        ) : (
                          <div
                            className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-gray-900 text-white rounded-tr-sm'
                                : 'bg-gray-100/80 backdrop-blur-sm text-gray-700 rounded-tl-sm'
                            }`}
                          >
                            {msg.content}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Streaming bubble */}
                  {isStreaming && streamingContent && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      {_currentIntent === 'edit' ? (
                        <div className="max-w-[88%]">
                          <ChatEditPreview
                            content={streamingContent}
                            isStreaming={true}
                            onAccept={() => {}}
                            onReject={() => {}}
                          />
                        </div>
                      ) : (
                        <div className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed bg-gray-100/80 backdrop-blur-sm text-gray-700 rounded-tl-sm">
                          {streamingContent}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Thinking indicator when streaming but no content yet */}
                  {isStreaming && !streamingContent && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="bg-gray-100/80 backdrop-blur-sm rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1.5">
                        {[0, 1, 2].map(j => (
                          <motion.span
                            key={j}
                            className="w-1.5 h-1.5 rounded-full bg-gray-400"
                            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                            transition={{ duration: 0.9, repeat: Infinity, delay: j * 0.18 }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}

                  <div ref={bottomRef} />
                </div>

                {/* Quick chips */}
                <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
                  {activeSectionKey && (
                    <button
                      onClick={() => handleSubmit('Explain this section')}
                      disabled={isStreaming}
                      className="text-xs text-gray-600 bg-white/70 hover:bg-white border border-gray-200 hover:border-gray-300 px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                    >
                      Explain this section
                    </button>
                  )}
                  <button
                    onClick={() => handleSubmit('What gaps should I address?')}
                    disabled={isStreaming}
                    className="text-xs text-gray-600 bg-white/70 hover:bg-white border border-gray-200 hover:border-gray-300 px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                  >
                    Review gaps
                  </button>
                  <button
                    onClick={() => handleSubmit('How can I strengthen this proposal?')}
                    disabled={isStreaming}
                    className="text-xs text-gray-600 bg-white/70 hover:bg-white border border-gray-200 hover:border-gray-300 px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                  >
                    Strengthen proposal
                  </button>
                </div>

                {/* Input */}
                <div className="px-3 pb-3 shrink-0">
                  <div className="flex items-center gap-2 bg-white/70 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-gray-400 focus-within:bg-white transition-all">
                    <input
                      ref={inputRef}
                      className="flex-1 bg-transparent text-xs text-gray-700 placeholder-gray-400 outline-none"
                      placeholder="Ask jamo to edit..."
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSubmit(input) }}
                      disabled={isStreaming}
                    />
                    <button
                      onClick={() => handleSubmit(input)}
                      disabled={!input.trim() || isStreaming}
                      className="w-6 h-6 p-0 rounded-lg bg-gray-900 hover:bg-gray-700 disabled:opacity-30 flex items-center justify-center transition-colors shrink-0"
                    >
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-center text-[10px] text-gray-300 mt-1.5">⌘J to toggle panel</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </AuroraBorder>
    </motion.div>
  )
}
