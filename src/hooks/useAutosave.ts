import { useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useAutosave(
  proposalId: string,
  sectionKey: string,
  onStatusChange: (status: 'idle' | 'saving' | 'saved') => void
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerAutosave = useCallback(
    (html: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
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

  return { triggerAutosave, cancel }
}
