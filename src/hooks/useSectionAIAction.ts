import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useSectionWorkspace } from '../context/SectionWorkspaceContext'
import { readSSEStream } from './useProposalGeneration'
import type { AIActionType } from '../types/workspace'

export function useSectionAIAction(proposalId: string, sectionKey: string, orgId: string) {
  const { dispatch } = useSectionWorkspace()

  const triggerAction = useCallback(
    async (actionType: AIActionType, currentContent: string, userInstructions?: string): Promise<void> => {
      // D-02: Take snapshot before action (skip if orgId not yet available)
      if (orgId) {
        await supabase.from('proposal_section_versions').insert({
          proposal_id: proposalId,
          org_id: orgId,
          section_key: sectionKey,
          content: currentContent,
          action_label: `Before ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`,
        })
      }

      // Prune old versions: keep at most 20
      const { data: versions } = await supabase
        .from('proposal_section_versions')
        .select('id, created_at')
        .eq('proposal_id', proposalId)
        .eq('section_key', sectionKey)
        .order('created_at', { ascending: true })

      if (versions && versions.length > 20) {
        const toDelete = versions.slice(0, versions.length - 20).map((v: { id: string }) => v.id)
        await supabase
          .from('proposal_section_versions')
          .delete()
          .in('id', toDelete)
      }

      // Dispatch START_AI_ACTION
      dispatch({
        type: 'START_AI_ACTION',
        payload: { section_key: sectionKey, action_type: actionType, snapshot: currentContent },
      })

      // SSE streaming via raw fetch
      let response: Response
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/section-ai-action`
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            proposal_id: proposalId,
            section_key: sectionKey,
            action: actionType,
            existing_content: actionType !== 'generate' ? currentContent : undefined,
            user_instructions: userInstructions || undefined,
          }),
        })
      } catch (err) {
        console.error('[useSectionAIAction] fetch error:', err)
        dispatch({ type: 'REJECT_AI_ACTION', payload: { section_key: sectionKey } })
        return
      }

      if (!response.ok || !response.body) {
        const errText = await response.text()
        console.error('[useSectionAIAction] response error:', errText)
        dispatch({ type: 'REJECT_AI_ACTION', payload: { section_key: sectionKey } })
        return
      }

      // Read SSE stream and accumulate preview content
      let accumulated = ''
      try {
        await readSSEStream(response, (token: string) => {
          accumulated += token
          dispatch({
            type: 'UPDATE_AI_PREVIEW',
            payload: { section_key: sectionKey, content: accumulated },
          })
        })
      } catch (err) {
        console.error('[useSectionAIAction] stream error:', err)
        dispatch({ type: 'REJECT_AI_ACTION', payload: { section_key: sectionKey } })
        return
      }

      // Stream complete
      dispatch({ type: 'COMPLETE_AI_STREAM', payload: { section_key: sectionKey } })
    },
    [proposalId, sectionKey, orgId, dispatch]
  )

  return { triggerAction }
}
