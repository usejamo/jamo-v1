import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import type { ChatMessage, ProposeEditPayload, ProposeEditState, AnswerWithCitationsPayload, CompliancePayload, AskUserPayload } from '../types/chat'
import type { ToolDataEnvelope, ChatMessageType } from '../types/chat'
import type { PendingActionItem, ActiveTask } from '../types/chat'
import type { Json } from '../types/database.types'
import { ComplianceCard } from './chat/ComplianceCard'
import { AskUserCard } from './chat/AskUserCard'
import { InlineMarkdown } from './chat/InlineMarkdown'
import type { SectionEditorHandle, PendingEdit, ChangeResolution } from '../types/workspace'
import { buildContextPayload } from '../utils/chatContext'
import { EditSummaryCard } from './chat/EditSummaryCard'
import { CitationsBlock } from './chat/CitationsBlock'
import { ToolStatusLabel } from './chat/ToolStatusLabel'
import { useSectionWorkspace } from '../context/SectionWorkspaceContext'
import { ActionQueue } from './chat/ActionQueue'
import { WalkthroughProgress } from './chat/WalkthroughProgress'
import { useAuth } from '../context/AuthContext'

interface Props {
  proposalId: string
  orgId: string
  draftGenerated: boolean                        // keep — gate for "generate first" message
  sections: Array<{ section_key: string; content: string; title?: string }>
  editorRefs: React.MutableRefObject<Map<string, SectionEditorHandle>>
  activeSectionKey?: string | null
  onEditAccepted?: () => void
  sectionTitles: Record<string, string>
  onSectionFocusChange?: (key: string | null) => void
  /** Callback to expose pendingActions count to parent (for Sidebar badge) */
  onPendingActionsCountChange?: (count: number) => void
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

function SpectrumSparkle({ onToggle, pendingActionsCount }: { onToggle: () => void; pendingActionsCount?: number }) {
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
      {pendingActionsCount != null && pendingActionsCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center px-1 animate-pulse">
          {pendingActionsCount}
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

function Rail({ onExpand, processing, pendingActionsCount }: { onExpand: () => void; processing: boolean; pendingActionsCount: number }) {
  return (
    <div
      onClick={onExpand}
      title="Open jamo AI (⌘J)"
      className="flex flex-col items-center h-full pt-4 pb-3 gap-3 cursor-pointer hover:bg-black/[0.03] transition-colors"
    >
      <SpectrumSparkle onToggle={onExpand} pendingActionsCount={pendingActionsCount} />

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
  onEditAccepted: _onEditAccepted,
  sectionTitles,
  onSectionFocusChange: _onSectionFocusChange,
  onPendingActionsCountChange,
}: Props) {
  const { state: workspaceState, dispatch: workspaceDispatch } = useSectionWorkspace()
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [expanded, setExpanded] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentToolName, setCurrentToolName] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastMessageCountRef = useRef<number>(0)

  // ── Part B state ───────────────────────────────────────────────────────────
  const [pendingActions, setPendingActions] = useState<PendingActionItem[]>([])
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [crossTabUpdate, setCrossTabUpdate] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Notify parent of pendingActions count changes (for Sidebar badge)
  useEffect(() => {
    const activeCount = pendingActions.filter(a => !a.dismissed).length
    onPendingActionsCountChange?.(activeCount)
  }, [pendingActions, onPendingActionsCountChange])

  // ── Mount fetch from chat_sessions (direct column, D-45) ──────────────────
  useEffect(() => {
    if (!proposalId || !userId) return
    supabase
      .from('chat_sessions')
      .select('pending_actions, active_task')  // active_task is a DIRECT column (not metadata->active_task)
      .eq('proposal_id', proposalId)
      .eq('user_id', userId)  // D-45: per-user session
      .maybeSingle()
      .then(({ data }) => {
        if (data?.pending_actions) setPendingActions(data.pending_actions as unknown as PendingActionItem[])
        if (data?.active_task) setActiveTask(data.active_task as unknown as ActiveTask)
      })
  }, [proposalId, userId])

  // ── Realtime subscription contract ────────────────────────────────────────
  // Table: chat_sessions
  // Filter: proposal_id=eq.${proposalId} (server-side filter)
  // Event: UPDATE only
  // Auth: Supabase client uses user's JWT — RLS enforces row-level isolation
  // Client-side guard: if (row.user_id && row.user_id !== userId) return (belt-and-suspenders)
  // Cleanup: supabase.removeChannel(channel) on component unmount
  // Reconnect: Supabase client handles automatically
  useEffect(() => {
    if (!proposalId || !userId) return

    const channel = supabase
      .channel(`chat_sessions:${proposalId}:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_sessions',
        filter: `proposal_id=eq.${proposalId}`,  // server-side filter
      }, (payload) => {
        const row = payload.new as {
          pending_actions?: PendingActionItem[]
          active_task?: ActiveTask | null
          user_id?: string
        }

        // Belt-and-suspenders: discard updates for other users in same org
        if (row.user_id && row.user_id !== userId) return

        if (row.pending_actions !== undefined) setPendingActions(row.pending_actions ?? [])

        if ('active_task' in row) {
          const newTask = row.active_task ?? null
          // Cross-tab update: if active_task changed and we didn't initiate it, show banner
          setActiveTask((prev) => {
            if (prev?.last_updated !== newTask?.last_updated && newTask !== null) {
              setCrossTabUpdate(true)
            }
            return newTask
          })
        }
      })
      .subscribe()

    // Cleanup: unsubscribe on unmount — Supabase client handles reconnect automatically
    return () => { void supabase.removeChannel(channel) }
  }, [proposalId, userId])

  // ── In-flight analysis guard (is_analyzing) ───────────────────────────────
  const triggerAnalysis = useCallback(async (sectionSummaries: Array<{ section_key: string; content: string }>) => {
    if (isAnalyzing) return  // In-flight guard — prevents overlapping runs
    setIsAnalyzing(true)
    try {
      await supabase.functions.invoke('analyze-proposal-gaps', {
        body: { proposal_id: proposalId, sections: sectionSummaries, run_id: globalThis.crypto.randomUUID() }
        // Note: user_id NOT in body — edge function derives from JWT
      })
    } finally {
      setIsAnalyzing(false)
    }
  }, [isAnalyzing, proposalId])

  // Expose triggerAnalysis for potential future use (suppresses unused warning)
  void triggerAnalysis

  // Load chat history from Supabase on mount
  useEffect(() => {
    if (!proposalId) return
    supabase
      .from('proposal_chats')
      .select('id, role, content, message_type, created_at, section_target_id, tool_data')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data?.length) return
        setMessages((data as any[]).map((row: any) => ({
          id: row.id,
          role: row.role as ChatMessage['role'],
          content: row.content,
          messageType: (row.message_type ?? 'chat') as ChatMessage['messageType'],
          // Reconstruct toolData from DB — null if not a tool message (backward compat)
          toolData: row.tool_data ? (() => {
            const td = row.tool_data as ToolDataEnvelope
            // Guard: only process version 1 envelopes
            if (td.version !== 1) return undefined
            return td
          })() : undefined,
        })))
      })
  }, [proposalId])

  // Keyboard shortcut: Cmd/Ctrl + J
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        setExpanded(prev => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Auto-scroll only when message count increases (scroll bug fix — D-scroll)
  useEffect(() => {
    if (messages.length <= lastMessageCountRef.current) return
    lastMessageCountRef.current = messages.length
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-scroll during streaming
  useEffect(() => {
    if (streamingContent) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamingContent])

  // Scroll to bottom when panel expands — delayed so messages are rendered first
  useEffect(() => {
    if (expanded) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 350)
  }, [expanded])

  // Focus input when expanding
  useEffect(() => {
    if (expanded) setTimeout(() => inputRef.current?.focus(), 320)
  }, [expanded])

  // ── Persist tool_data state mutations back to DB ───────────────────────────

  const persistToolDataState = useCallback(async (messageId: string, newState: Record<string, unknown>) => {
    const msg = messages.find(m => m.id === messageId)
    if (!msg?.toolData) return
    try {
      await supabase
        .from('proposal_chats')
        .update({
          tool_data: { ...msg.toolData, state: newState } as unknown as Json,
        })
        .eq('id', messageId)
    } catch {
      // Silent fail per D-07 convention
    }
  }, [messages])

  // ── Live streaming handleSendMessage ──────────────────────────────────────

  const handleSendMessage = useCallback(async (messageText?: string, _ctaPayload?: Record<string, unknown>) => {
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
    // D-49: section_target_id must be set on ALL messages — walkthrough-driven and queue-triggered messages must include this field.
    const { error: userInsertError } = await supabase.from('proposal_chats').insert({
      proposal_id: proposalId,
      org_id: orgId,
      role: 'user',
      content: text,
      section_target_id: activeSectionKey ?? null,
      message_type: 'chat',
    })
    if (userInsertError) console.error('[AIChatPanel] Failed to persist user message:', userInsertError)

    // Build context payload
    const payload = buildContextPayload({
      proposalId,
      orgId,
      userMessage: text,
      targetSectionKey: activeSectionKey ?? (sections[0]?.section_key ?? ''),
      sections,
      chatHistory: messages,
      sectionTitles,
    })

    let fullContent = ''

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
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`Edge function error: ${response.status}`)

      // response.body is the raw ReadableStream for SSE
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      // New SSE event loop
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '))
        for (const line of lines) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            // Finalize streaming message
            if (fullContent.trim()) {
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: fullContent,
                messageType: 'chat' as ChatMessageType,
              }])
            }
            setStreamingContent('')
            setIsStreaming(false)
            setCurrentToolName(null)
            break
          }
          try {
            const event = JSON.parse(data)
            if (event.type === 'tool_start') {
              setCurrentToolName(event.tool)
            } else if (event.type === 'text_delta') {
              fullContent += event.text
              setStreamingContent(fullContent)
            } else if (event.type === 'tool_result') {
              const toolData: ToolDataEnvelope = {
                tool: event.tool,
                version: 1,
                payload: event.result,
                state: {},
              }
              // Determine message type from tool name
              const toolMsgTypeMap: Record<string, ChatMessageType> = {
                propose_edit: 'tool-propose-edit',
                answer_with_citations: 'tool-answer-cited',
                check_regulatory_compliance: 'tool-compliance',
                ask_user: 'tool-ask-user',
                set_focus: 'tool-set-focus',
              }
              const messageType: ChatMessageType = toolMsgTypeMap[event.tool] ?? 'chat'
              const toolResultContent = event.result?.overall_summary ?? event.result?.answer ?? event.result?.summary ?? event.result?.question ?? ''
              const newMsgId = crypto.randomUUID()
              setMessages(prev => [...prev, {
                id: newMsgId,
                role: 'assistant',
                content: toolResultContent,
                messageType,
                toolData,
              }])

              // Initial propose_edit arrival — route through materializePendingEdits (BLOCKER 5).
              // materializePendingEdits runs ghostContentLeakDetected + stale paragraph check before dispatch.
              // IMPORTANT: Do NOT dispatch SET_PENDING_EDITS directly here.
              if (event.tool === 'propose_edit' && event.result?.section_key) {
                const propPayload = event.result as ProposeEditPayload
                const edits: PendingEdit[] = propPayload.changes.map((c, i) => ({
                  id: `${newMsgId}-${i}`,
                  paragraph_id: c.paragraph_id,
                  section_key: propPayload.section_key,
                  operation: c.operation,
                  before_html: c.before_html,
                  after_html: c.after_html,
                  change_summary: c.change_summary,
                  resolution: 'pending' as ChangeResolution,
                  message_id: newMsgId,
                  change_index: i,
                  created_at: new Date().toISOString(),
                }))
                const handle = editorRefs.current?.get(propPayload.section_key)
                handle?.materializePendingEdits(newMsgId, edits)
              }

              // Persist tool result message to DB (fire-and-forget, silent fail)
              // D-49: section_target_id must be set on ALL messages — walkthrough-driven and queue-triggered messages must include this field.
              supabase.from('proposal_chats').insert({
                id: newMsgId,
                proposal_id: proposalId,
                org_id: orgId,
                role: 'assistant' as const,
                content: toolResultContent,
                message_type: messageType,
                section_target_id: activeSectionKey ?? null,
                tool_data: toolData as unknown as Json,
              }).then(({ error }) => {
                if (error) console.warn('[AIChatPanel] Failed to persist tool result:', error.message)
              })
              setCurrentToolName(null)
            } else if (event.type === 'error') {
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: 'Something went wrong. Try again.',
                messageType: 'chat' as ChatMessageType,
              }])
              setIsStreaming(false)
              setCurrentToolName(null)
            }
          } catch {
            // Ignore parse errors on malformed SSE lines
          }
        }
      }
    } catch (err) {
      console.error('chat-with-jamo error:', err)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        messageType: 'chat' as ChatMessageType,
      }])
      setStreamingContent('')
      setIsStreaming(false)
      setCurrentToolName(null)
    }

    // Persist assistant message (plain text — tool results persisted inline in tool_result handler)
    if (fullContent) {
      const { error: assistantInsertError } = await supabase.from('proposal_chats').insert({
        proposal_id: proposalId,
        org_id: orgId,
        role: 'assistant',
        content: fullContent,
        section_target_id: activeSectionKey ?? null,
        message_type: 'chat',
        tool_data: null,  // explicit null for plain text messages
      })
      if (assistantInsertError) console.error('[AIChatPanel] Failed to persist assistant message:', assistantInsertError)
    }
  }, [input, isStreaming, draftGenerated, proposalId, orgId, activeSectionKey, sections, messages, sectionTitles])

  const pendingActionsCount = pendingActions.filter(a => !a.dismissed).length

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
                <Rail onExpand={() => setExpanded(true)} processing={isStreaming} pendingActionsCount={pendingActionsCount} />
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
                  <SpectrumSparkle onToggle={() => setExpanded(false)} pendingActionsCount={pendingActionsCount} />
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

                {/* Active walkthrough header */}
                {activeTask && activeTask.status === 'active' && (
                  <WalkthroughProgress
                    activeTask={activeTask}
                    onStopWalkthrough={() => {
                      setActiveTask(null)
                      void supabase.from('chat_sessions')
                        .update({ active_task: { ...activeTask, status: 'discarded', stage: 'discarded', completed_at: new Date().toISOString() } as unknown as Json })
                        .eq('proposal_id', proposalId)
                        .eq('user_id', userId)  // D-45
                    }}
                  />
                )}

                {/* Cross-tab update banner */}
                {crossTabUpdate && (
                  <div className="bg-blue-50 border-b border-blue-200 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs text-blue-700">Walkthrough updated in another tab.</span>
                    <button
                      className="text-[10px] text-blue-500 hover:text-blue-700"
                      onClick={() => setCrossTabUpdate(false)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Action Queue — above chat history */}
                <ActionQueue
                  actions={pendingActions.filter(a => !a.dismissed)}
                  activeTaskSectionTitle={activeTask?.section_title ?? null}
                  isWalkthroughActive={!!activeTask && activeTask.status === 'active'}
                  onCtaClick={(action) => {
                    handleSendMessage(`[Action: ${action.cta_tool}] ${action.title}`, action.cta_payload)
                  }}
                  onDismiss={(actionId) => {
                    setPendingActions(prev => prev.map(a => a.id === actionId ? { ...a, dismissed: true } : a))
                  }}
                  onUndoDismiss={(actionId) => {
                    setPendingActions(prev => prev.map(a => a.id === actionId ? { ...a, dismissed: false } : a))
                  }}
                  onContinueWalkthrough={() => {
                    const lastAskUserMsg = [...messages].reverse().find(m => m.messageType === 'tool-ask-user')
                    if (lastAskUserMsg) {
                      document.getElementById(`msg-${lastAskUserMsg.id}`)?.scrollIntoView({ behavior: 'smooth' })
                    }
                  }}
                />

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-0">
                  <AnimatePresence initial={false}>
                    {messages.map((msg, i) => (
                      <motion.div
                        key={msg.id}
                        id={`msg-${msg.id}`}
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
                        ) : msg.role === 'assistant' && msg.messageType?.startsWith('tool-') && msg.toolData ? (
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 max-w-[88%]">
                            {msg.messageType === 'tool-propose-edit' && (
                              (() => {
                                const payload = msg.toolData.payload as ProposeEditPayload
                                const persistedState: ProposeEditState = (msg.toolData.state as unknown as ProposeEditState) ?? { resolutions: {}, stale_ids: [] }
                                // When this message's edits are live in workspace state, derive
                                // resolutions from them so Accept/Reject updates the card tally
                                // in-session (not just after a reload from persisted tool_data).
                                const liveEdits = (workspaceState.sections[payload.section_key]?.pending_edits ?? []).filter((e) => e.message_id === msg.id)
                                const editState: ProposeEditState = liveEdits.length > 0
                                  ? { ...persistedState, resolutions: { ...persistedState.resolutions, ...Object.fromEntries(liveEdits.map((e) => [e.id, e.resolution])) } }
                                  : persistedState
                                // This message's edits with stable ids (`${msg.id}-${index}`).
                                const buildEdits = (): PendingEdit[] => payload.changes.map((c, i) => ({
                                  id: `${msg.id}-${i}`,
                                  paragraph_id: c.paragraph_id,
                                  section_key: payload.section_key,
                                  operation: c.operation,
                                  before_html: c.before_html,
                                  after_html: c.after_html,
                                  change_summary: c.change_summary,
                                  resolution: ((editState.resolutions?.[`${msg.id}-${i}`] ?? 'pending') as ChangeResolution),
                                  message_id: msg.id,
                                  change_index: i,
                                  created_at: new Date().toISOString(),
                                }))
                                const editIds = payload.changes.map((_c, i) => `${msg.id}-${i}`)
                                return (
                                  <EditSummaryCard
                                    payload={payload}
                                    state={editState}
                                    sectionKey={payload.section_key}
                                    message_id={msg.id}
                                    onReviewInEditor={() => {
                                      editorRefs.current?.get(payload.section_key)?.materializePendingEdits(msg.id, buildEdits())
                                    }}
                                    onAcceptAll={() => {
                                      // Materialize this message's edits if not already live, then
                                      // accept only this message's edit ids (not the whole section).
                                      if (liveEdits.length === 0) {
                                        editorRefs.current?.get(payload.section_key)?.materializePendingEdits(msg.id, buildEdits())
                                      }
                                      workspaceDispatch({
                                        type: 'BATCH_ACCEPT_PENDING_EDITS',
                                        payload: { section_key: payload.section_key, edit_ids: editIds },
                                      })
                                    }}
                                    onRejectAll={() => {
                                      if (liveEdits.length === 0) {
                                        editorRefs.current?.get(payload.section_key)?.materializePendingEdits(msg.id, buildEdits())
                                      }
                                      for (const id of editIds) {
                                        workspaceDispatch({
                                          type: 'REJECT_PENDING_EDIT',
                                          payload: { section_key: payload.section_key, edit_id: id },
                                        })
                                      }
                                    }}
                                    onUpdateResolution={(changeId, resolution) => {
                                      workspaceDispatch({
                                        type: resolution === 'accepted' ? 'ACCEPT_PENDING_EDIT' : 'REJECT_PENDING_EDIT',
                                        payload: { section_key: payload.section_key, edit_id: changeId },
                                      })
                                      // Persist resolution to DB (fire-and-forget)
                                      const prevState = (msg.toolData?.state ?? {}) as { resolutions?: Record<string, string> }
                                      persistToolDataState(msg.id, {
                                        ...prevState,
                                        resolutions: { ...(prevState.resolutions ?? {}), [changeId]: resolution },
                                      })
                                    }}
                                  />
                                )
                              })()
                            )}
                            {msg.messageType === 'tool-answer-cited' && (
                              (() => {
                                const payload = msg.toolData.payload as AnswerWithCitationsPayload
                                return (
                                  <>
                                    <p className="text-xs text-gray-800 leading-relaxed">{payload.answer}</p>
                                    <CitationsBlock citations={payload.citations} />
                                  </>
                                )
                              })()
                            )}
                            {msg.messageType === 'tool-compliance' && (
                              (() => {
                                const payload = msg.toolData!.payload as CompliancePayload
                                const state = msg.toolData!.state as { dismissed_indices?: number[] }
                                return (
                                  <ComplianceCard
                                    payload={payload}
                                    dismissedIndices={state.dismissed_indices ?? []}
                                    onDismiss={(idx) => {
                                      const prevState = (msg.toolData?.state ?? {}) as { dismissed_indices?: number[] }
                                      const prevDismissed = prevState.dismissed_indices ?? []
                                      const newDismissed = prevDismissed.includes(idx) ? prevDismissed : [...prevDismissed, idx]
                                      setMessages(prev => prev.map(m => {
                                        if (m.id !== msg.id) return m
                                        return {
                                          ...m,
                                          toolData: m.toolData ? {
                                            ...m.toolData,
                                            state: {
                                              ...prevState,
                                              dismissed_indices: newDismissed,
                                            },
                                          } : m.toolData,
                                        }
                                      }))
                                      // Persist dismissed_indices to DB (fire-and-forget)
                                      persistToolDataState(msg.id, {
                                        ...prevState,
                                        dismissed_indices: newDismissed,
                                      })
                                    }}
                                  />
                                )
                              })()
                            )}
                            {msg.messageType === 'tool-ask-user' && (
                              (() => {
                                const payload = msg.toolData!.payload as AskUserPayload
                                const state = msg.toolData!.state as { answered?: string }
                                return (
                                  <AskUserCard
                                    payload={payload}
                                    answered={state.answered}
                                    onAnswer={(text) => {
                                      // Mark this ask_user card as answered (collapses its input).
                                      setMessages(prev => prev.map(m => {
                                        if (m.id !== msg.id) return m
                                        return {
                                          ...m,
                                          toolData: m.toolData ? {
                                            ...m.toolData,
                                            state: { ...(m.toolData.state ?? {}), answered: text },
                                          } : m.toolData,
                                        }
                                      }))
                                      // Persist answered state to DB (fire-and-forget)
                                      persistToolDataState(msg.id, {
                                        ...(msg.toolData?.state ?? {}),
                                        answered: text,
                                      })
                                      // Send the answer to the AI so it actually continues the
                                      // task — handleSendMessage adds the user message, persists
                                      // it, and invokes the model.
                                      void handleSendMessage(text)
                                    }}
                                  />
                                )
                              })()
                            )}
                          </div>
                        ) : (
                          <div
                            className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-gray-900 text-white rounded-tr-sm'
                                : 'bg-gray-100/80 backdrop-blur-sm text-gray-700 rounded-tl-sm'
                            }`}
                          >
                            <InlineMarkdown text={msg.content} />
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
                      <div className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed bg-gray-100/80 backdrop-blur-sm text-gray-700 rounded-tl-sm">
                        <InlineMarkdown text={streamingContent} />
                      </div>
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
                        {currentToolName ? (
                          <ToolStatusLabel toolName={currentToolName} />
                        ) : (
                          <>
                            {[0, 1, 2].map(j => (
                              <motion.span
                                key={j}
                                className="w-1.5 h-1.5 rounded-full bg-gray-400"
                                animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                                transition={{ duration: 0.9, repeat: Infinity, delay: j * 0.18 }}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}

                  <div ref={bottomRef} />
                </div>

                {/* Quick chips */}
                <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
                  {activeSectionKey && (
                    <button
                      onClick={() => handleSendMessage('Explain this section')}
                      disabled={isStreaming}
                      className="text-xs text-gray-600 bg-white/70 hover:bg-white border border-gray-200 hover:border-gray-300 px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                    >
                      Explain this section
                    </button>
                  )}
                  <button
                    onClick={() => handleSendMessage('What gaps should I address?')}
                    disabled={isStreaming}
                    className="text-xs text-gray-600 bg-white/70 hover:bg-white border border-gray-200 hover:border-gray-300 px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                  >
                    Review gaps
                  </button>
                  <button
                    onClick={() => handleSendMessage('How can I strengthen this proposal?')}
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
                      onKeyDown={e => { if (e.key === 'Enter') handleSendMessage(input) }}
                      disabled={isStreaming}
                    />
                    <button
                      onClick={() => handleSendMessage(input)}
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
