// src/hooks/useGapAnalysisTrigger.ts
//
// Encapsulates the Part B gap-analysis trigger logic from phase 14.2.1.
//
// Two trigger paths:
//   D-35: On mount, if no `chat_sessions` row exists for (proposal_id, user_id),
//         fire `analyze-proposal-gaps` once with the current section summaries.
//   D-30: Subscribe to Supabase Realtime UPDATE events on `proposal_sections`
//         filtered by proposal_id. Debounce 3000ms after the last event, then
//         fetch the FULL current sections from the DB (never read payload.new
//         for content), compute a stable content hash, skip if unchanged,
//         otherwise invoke `analyze-proposal-gaps` with a fresh run_id.
//
// The server enforces a 30s-per-proposal cooldown and returns HTTP 429
// (empty body) when throttled. We treat 429 as expected silence — no toast,
// no console.error, no retry.
//
// Wiring into AIChatPanel happens in Plan 02. This hook is fire-and-forget.

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { rebuildFilterSet, identityKey } from '../chat/resolved-items'
import type { ResolvedItem, FindingType } from '../types/chat'

const DEBOUNCE_MS = 3000
// The edge function enforces a 30s per-proposal cooldown keyed off
// pending_actions_generated_at and returns HTTP 429 when throttled. Mirror that
// window here so a 429'd run can wake itself once, just after it expires.
// RETRY_BUFFER_MS pads for clock skew between the browser and Postgres now() so
// the retry lands AFTER the server reopens the window (not a millisecond early,
// which would just earn a second 429).
const COOLDOWN_MS = 30_000
const RETRY_BUFFER_MS = 1500

// Shape matches analyze-proposal-gaps RequestSchema (index.ts: { key, title, content }).
type SectionSummary = { key: string; title: string; content: string }

export async function computeHash(summaries: SectionSummary[]): Promise<string> {
  // Sort for determinism — Realtime ordering should not change the hash.
  const sorted = [...summaries].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  )
  const json = JSON.stringify(sorted)
  const buf = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(json)
  )
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Detect server responses that should be treated as expected silence — no toast,
 * no console.error. Covers:
 *  - 429: per-proposal cooldown (analyze-proposal-gaps/index.ts:158)
 *  - 402: insufficient credits — surfaced for the foreground generator banner,
 *         not for this background trigger (the gap-analysis call is fire-and-forget;
 *         if there are no credits the user will already see the banner from a
 *         failed generate-proposal-section call).
 */
function isSilentStatus(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { context?: { status?: number }; status?: number; message?: string }
  const status = e.context?.status ?? e.status
  if (status === 429 || status === 402) return true
  if (typeof e.message === 'string' && /\b(429|402)\b/.test(e.message)) return true
  return false
}

/**
 * Narrowly detect a 429 (per-proposal cooldown) — distinct from isSilentStatus,
 * which also matches 402 (no credits). Only a 429 should schedule a cooldown
 * retry; a 402 means there is nothing to retry until the user buys credits, so
 * re-arming would just burn a retry on another guaranteed failure.
 */
function is429(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { context?: { status?: number }; status?: number; message?: string }
  const status = e.context?.status ?? e.status
  if (status === 429) return true
  if (typeof e.message === 'string' && /\b429\b/.test(e.message)) return true
  return false
}

export function useGapAnalysisTrigger(params: {
  proposalId: string | null | undefined
  userId: string | null | undefined
}): void {
  const { proposalId, userId } = params

  const hashRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAnalyzingRef = useRef(false)

  // Reset session-scoped state when the proposal changes so a new proposal
  // starts with a clean hash and no leaked debounce timer.
  useEffect(() => {
    hashRef.current = null
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // Supersession: a proposal switch cancels any retry armed for the old proposal.
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [proposalId])

  useEffect(() => {
    if (!proposalId || !userId) return

    let cancelled = false

    async function fetchSummaries(): Promise<SectionSummary[]> {
      const { data, error } = await supabase
        .from('proposal_sections')
        .select('section_key, name, content')
        .eq('proposal_id', proposalId as string)
        .order('position', { ascending: true })
      if (error || !data) return []
      return data.map((row) => ({
        key: row.section_key,
        title: row.name ?? row.section_key,
        content: row.content ?? '',
      }))
    }

    async function runAnalysis(
      summaries: SectionSummary[],
      opts: { force?: boolean; isRetry?: boolean } = {}
    ): Promise<void> {
      if (isAnalyzingRef.current) return
      if (summaries.length === 0 && !opts.force) return

      // Skip if any section content is empty — generation may still be in flight
      // (Realtime UPDATEs land one section at a time). The Realtime debounce will
      // retry once all sections populate. Without this gate, Haiku reports
      // "section X not generated yet" — useless noise the user already knows.
      if (summaries.some((s) => !s.content || s.content.trim().length === 0)) {
        return
      }

      const hash = await computeHash(summaries)
      if (!opts.force && hash === hashRef.current) return
      hashRef.current = hash

      isAnalyzingRef.current = true
      try {
        const { error } = await supabase.functions.invoke('analyze-proposal-gaps', {
          body: {
            proposal_id: proposalId,
            sections: summaries,
            run_id: globalThis.crypto.randomUUID(),
            // D-3: persist the whole-proposal hash so the next mount can gate on it.
            content_hash: hash,
          },
        })
        if (error) {
          if (isSilentStatus(error)) {
            // Expected silence — server cooldown (429) or no-credits (402). Do NOT log.
            // A 429 means the 30s per-proposal cooldown rejected THIS run; arm one
            // retry just past expiry so the user's latest edit still gets analyzed
            // without them touching the doc again. isRetry runs never re-arm — that
            // would be an infinite 429 loop.
            if (!opts.isRetry && is429(error)) void scheduleCooldownRetry()
            return
          }
          // Background trigger — debug only, no toast.
          console.debug('[useGapAnalysisTrigger] invoke error:', error)
        }
      } catch (err) {
        if (!isSilentStatus(err)) {
          console.debug('[useGapAnalysisTrigger] invoke threw:', err)
        } else if (!opts.isRetry && is429(err)) {
          void scheduleCooldownRetry()
        }
      } finally {
        isAnalyzingRef.current = false
      }
    }

    function clearRetryTimer(): void {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }

    // After a 429, wake once just past the server's per-proposal cooldown and
    // re-run with force (the in-memory hash already matches the rejected run, so
    // without force the retry would no-op on the hash gate). Only ONE retry is ever
    // pending: clearRetryTimer() first supersedes any prior, and the retry itself
    // runs with isRetry so a second 429 will not re-arm (no loop). A newer content
    // edit, a proposal switch, or unmount all cancel the pending retry.
    async function scheduleCooldownRetry(): Promise<void> {
      clearRetryTimer()
      const { data: sessionRow } = await supabase
        .from('chat_sessions')
        .select('pending_actions_generated_at')
        .eq('proposal_id', proposalId as string)
        .eq('user_id', userId as string)
        .maybeSingle()
      if (cancelled) return
      const generatedAt = sessionRow?.pending_actions_generated_at ?? null
      const genMs = generatedAt ? new Date(generatedAt).getTime() : 0
      const remaining = Math.max(0, genMs + COOLDOWN_MS - Date.now())
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null
        void (async () => {
          if (cancelled) return
          const summaries = await fetchSummaries()
          if (cancelled) return
          await runAnalysis(summaries, { force: true, isRetry: true })
        })()
      }, remaining + RETRY_BUFFER_MS)
    }

    // On-mount fire. Originally this only ran when the chat_sessions row did NOT
    // exist (D-35 "initial population"). That silenced legitimate re-analysis
    // after section content materially changed (e.g., generation completed
    // between mount and the next Realtime event). We now always attempt on
    // mount and rely on three layered gates to prevent spam:
    //   - in-memory hash skip inside runAnalysis (skips identical re-runs)
    //   - the empty-content gate inside runAnalysis (skips while sections settle)
    //   - the edge function's durable 30s per-proposal cooldown (cross-session)
    void (async () => {
      if (cancelled) return
      const summaries = await fetchSummaries()
      if (cancelled) return
      // D-3 precedence: client hash gate FIRST. Read the persisted whole-proposal
      // hash; if it equals the current content hash, the cached pending_actions are
      // still valid — skip the invoke entirely (the 30s server cooldown is only the
      // backstop). A null persisted hash (no row / never analyzed) ⇒ run, the same
      // code path as a mismatch.
      const currentHash = await computeHash(summaries)
      const { data: sessionRow } = await supabase
        .from('chat_sessions')
        .select('pending_actions, pending_actions_content_hash, resolved_items')
        .eq('proposal_id', proposalId as string)
        .eq('user_id', userId as string)
        .maybeSingle()
      if (cancelled) return
      const persisted = sessionRow?.pending_actions_content_hash ?? null
      // 14.2.3 cache-trap + visible-empty fix: skip ONLY when the hash matches AND there
      // is at least one VISIBLE cached finding. Two ways the cache can be effectively empty:
      //   1. pending_actions is [] / null (the original cache trap), or
      //   2. pending_actions is non-empty but EVERY finding has been dismissed — onDismiss
      //      writes resolved_items but never prunes pending_actions, so the stored array
      //      stays non-empty while nothing is actually shown. Measuring the raw length here
      //      let the gate skip re-analysis forever, so dismissing every finding left the queue
      //      stuck empty across reloads (root cause confirmed via DB + edge logs, 2026-06-05).
      // We therefore apply the SAME dismissed-only resolved-items filter the render uses
      // (rebuildFilterSet/identityKey) and gate on the visible count. A null persisted hash,
      // a mismatch, OR zero visible findings ⇒ re-run. This un-traps stuck rows on next mount.
      // A genuinely clean proposal re-analyzes on every open, bounded by the 30s server
      // cooldown — intentional; do NOT cache empties to "optimize" it away.
      const cached = sessionRow?.pending_actions as
        | Array<{ id?: string; type?: string; section_key?: string; title?: string; dismissed?: boolean }>
        | null
        | undefined
      const resolved = (sessionRow?.resolved_items as ResolvedItem[] | null | undefined) ?? []
      const filterSet = rebuildFilterSet(resolved)
      const visibleCount = Array.isArray(cached)
        ? cached.filter((a) => {
            if (!a || a.dismissed) return false
            if (a.id && filterSet.has(`id:${a.id}`)) return false
            if (
              a.section_key && a.type && a.title &&
              filterSet.has(
                `ik:${identityKey({
                  section_key: a.section_key,
                  finding_type: a.type as FindingType,
                  title: a.title,
                })}`,
              )
            ) {
              return false
            }
            return true
          }).length
        : 0
      if (persisted !== null && persisted === currentHash && visibleCount > 0) {
        // Seed the in-memory gate so the Realtime path agrees and does not re-fire.
        hashRef.current = currentHash
        return
      }
      await runAnalysis(summaries, {})
    })()

    // D-30: Realtime subscription with 3s debounce.
    const channel = supabase
      .channel(`gap_analysis_sections:${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proposal_sections',
          filter: `proposal_id=eq.${proposalId}`,
        },
        (_payload) => {
          // Intentionally ignore _payload.new — we re-fetch full sections from
          // the DB before each invoke so the analysis sees whole-proposal context.
          // Supersession: a newer content change cancels any pending cooldown retry;
          // the debounced run below will cover the latest state instead.
          clearRetryTimer()
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => {
            void (async () => {
              if (cancelled) return
              const summaries = await fetchSummaries()
              if (cancelled) return
              await runAnalysis(summaries, {})
            })()
          }, DEBOUNCE_MS)
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      clearRetryTimer()
      void supabase.removeChannel(channel)
    }
  }, [proposalId, userId])
}
