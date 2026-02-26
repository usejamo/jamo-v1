import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DEMO_COMMANDS, matchCommand } from '../data/demoCommands'
import type { PendingSuggestion } from '../types/draft'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isThinking?: boolean
}

interface Props {
  draftGenerated: boolean
  onCommand: (suggestion: PendingSuggestion) => void
  onSuggestionResolved: () => void
  lastResolution: 'accepted' | 'declined' | null
}

const GREETING: ChatMessage = {
  id: 'greeting',
  role: 'assistant',
  content: "Hi — I'm jamo AI. I can help you refine this proposal. Try one of the quick edits below, or type your own instruction.",
}

// ── Icons ────────────────────────────────────────────────────────────────────

function PanelCloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m4.5-11.25 3.75 3.75-3.75 3.75M3.75 19.5h16.5a1.5 1.5 0 0 0 1.5-1.5v-13.5a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v13.5a1.5 1.5 0 0 0 1.5 1.5Z" />
    </svg>
  )
}

function PanelOpenIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 4.5v15M10.5 8.25 6.75 12l3.75 3.75M20.25 19.5H3.75a1.5 1.5 0 0 1-1.5-1.5v-13.5a1.5 1.5 0 0 1 1.5-1.5h16.5a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-1.5 1.5Z" />
    </svg>
  )
}

function SparkleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  )
}

// ── Aurora border wrapper ─────────────────────────────────────────────────────

function AuroraBorder({ children, fast, className = '' }: {
  children: React.ReactNode
  fast: boolean
  className?: string
}) {
  return (
    <div className={`relative rounded-2xl ${className}`}>
      {/* Gradient border layer */}
      <div
        className={`absolute inset-0 rounded-2xl ${fast ? 'jamo-aurora-fast' : 'jamo-aurora'}`}
        style={{ padding: '1.5px', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }}
      />
      {children}
    </div>
  )
}

// ── Rail (collapsed) view ────────────────────────────────────────────────────

function Rail({ onExpand, processing }: { onExpand: () => void; processing: boolean }) {
  return (
    <div className="flex flex-col items-center h-full py-3 gap-3">
      <button
        onClick={onExpand}
        title="Open jamo AI (⌘J)"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors"
      >
        <PanelOpenIcon />
      </button>

      <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
        <SparkleIcon className="w-3.5 h-3.5 text-white" />
      </div>

      {/* Pulsing dot shows AI is active */}
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

export default function AIChatPanel({ draftGenerated, onCommand, onSuggestionResolved, lastResolution }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING])
  const [input, setInput] = useState('')
  const [processing, setProcessing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when expanding
  useEffect(() => {
    if (expanded) setTimeout(() => inputRef.current?.focus(), 320)
  }, [expanded])

  // Resolution acknowledgement
  useEffect(() => {
    if (!lastResolution) return
    addAssistant(
      lastResolution === 'accepted'
        ? 'Change applied. The proposal has been updated.'
        : 'No problem — the original content has been kept.'
    )
    onSuggestionResolved()
  }, [lastResolution, onSuggestionResolved])

  function addAssistant(content: string) {
    setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content }])
  }

  const handleSubmit = useCallback((text: string) => {
    if (!text.trim() || processing) return

    setMessages(prev => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: text.trim() },
      { id: 'thinking', role: 'assistant', content: '', isThinking: true },
    ])
    setInput('')
    setProcessing(true)

    setTimeout(() => {
      setMessages(prev => prev.filter(m => m.id !== 'thinking'))

      if (!draftGenerated) {
        addAssistant("Please generate the proposal draft first — I need the content loaded before I can make edits.")
        setProcessing(false)
        return
      }

      const command = matchCommand(text)
      if (command) {
        addAssistant(command.assistantMessage)
        const el = document.getElementById(command.targetId)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })

        setTimeout(() => {
          onCommand({
            commandKey: command.key,
            targetId: command.targetId,
            explanation: command.explanation,
            suggestedPreview: command.suggestedPreview,
            status: 'pending',
          })
          setProcessing(false)
        }, 600)
      } else {
        addAssistant("I didn't catch that. Try one of the quick actions below, or rephrase your request.")
        setProcessing(false)
      }
    }, 950)
  }, [processing, draftGenerated, onCommand])

  return (
    // Outer shell: drives the width animation and acts as the aurora border host
    <motion.div
      animate={{ width: expanded ? 350 : 60 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="shrink-0 h-full"
      style={{ minWidth: expanded ? 350 : 60 }}
    >
      <AuroraBorder fast={processing} className="h-full">
        {/* Glass inner panel */}
        <div className="h-full rounded-2xl bg-white/92 backdrop-blur-md overflow-hidden flex flex-col"
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
                <Rail onExpand={() => setExpanded(true)} processing={processing} />
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
                  <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
                    <SparkleIcon className="w-3.5 h-3.5 text-white" />
                  </div>
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
                      className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
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
                        transition={{ duration: 0.22, delay: msg.id === 'greeting' ? i * 0.04 : 0 }}
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
                  <div ref={bottomRef} />
                </div>

                {/* Quick chips */}
                <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
                  {DEMO_COMMANDS.map(cmd => (
                    <button
                      key={cmd.key}
                      onClick={() => handleSubmit(cmd.label)}
                      disabled={processing}
                      className="text-xs text-gray-600 bg-white/70 hover:bg-white border border-gray-200 hover:border-gray-300 px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                    >
                      {cmd.label}
                    </button>
                  ))}
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
                      disabled={processing}
                    />
                    <button
                      onClick={() => handleSubmit(input)}
                      disabled={!input.trim() || processing}
                      className="w-6 h-6 rounded-lg bg-gray-900 hover:bg-gray-700 disabled:opacity-30 flex items-center justify-center transition-colors shrink-0"
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
