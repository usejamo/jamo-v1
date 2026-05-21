import { useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Refuse to persist HTML that has no visible content. TipTap emits `<p></p>` for an
// empty editor; a freshly-mounted editor may briefly fire onUpdate with that value
// before its real content arrives, which would otherwise wipe a section whose row
// happens to be empty in this render (e.g. a section whose generation failed and
// is about to be retried). Trade-off: a user cannot autosave a section down to
// truly empty — they have to leave at least one visible character.
function isEffectivelyEmpty(html: string): boolean {
  const stripped = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, '')
  return stripped.length === 0
}

export function useAutosave(
  proposalId: string,
  sectionKey: string,
  onStatusChange: (status: 'idle' | 'saving' | 'saved') => void
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerAutosave = useCallback(
    (html: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (isEffectivelyEmpty(html)) {
        onStatusChange('idle')
        return
      }
      timerRef.current = setTimeout(async () => {
        onStatusChange('saving')
        const { error } = await supabase
          .from('proposal_sections')
          .update({ content: html, updated_at: new Date().toISOString() })
          .eq('proposal_id', proposalId)
          .eq('section_key', sectionKey)
        onStatusChange(error ? 'idle' : 'saved')
      }, 1500) // 1500ms debounce per UI-SPEC
    },
    [proposalId, sectionKey, onStatusChange]
  )

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const saveNow = useCallback(
    async (html: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (isEffectivelyEmpty(html)) {
        onStatusChange('idle')
        return
      }
      onStatusChange('saving')
      const { error } = await supabase
        .from('proposal_sections')
        .update({ content: html, updated_at: new Date().toISOString() })
        .eq('proposal_id', proposalId)
        .eq('section_key', sectionKey)
      onStatusChange(error ? 'idle' : 'saved')
    },
    [proposalId, sectionKey, onStatusChange]
  )

  return { triggerAutosave, cancel, saveNow }
}
