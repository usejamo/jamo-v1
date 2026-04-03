import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useSectionWorkspace } from '../context/SectionWorkspaceContext'
import type { ComplianceFlag } from '../types/workspace'
import type { Json } from '../types/database.types'

export function useComplianceCheck(proposalId: string, _orgId: string) {
  const { dispatch } = useSectionWorkspace()

  const persistFlags = useCallback(
    async (sectionKey: string, flags: ComplianceFlag[]) => {
      try {
        await supabase
          .from('proposal_sections')
          .update({ compliance_flags: flags as unknown as Json })
          .eq('proposal_id', proposalId)
          .eq('section_key', sectionKey)
      } catch {
        // Silent fail per D-03 — compliance flags are non-blocking
      }
    },
    [proposalId]
  )

  const checkCompliance = useCallback(
    async (sectionKey: string, content: string): Promise<void> => {
      const textContent = content.replace(/<[^>]*>/g, '')
      const wordCount = textContent.trim() === '' ? 0 : textContent.trim().split(/\s+/).length

      const ruleFlags: ComplianceFlag[] = []

      // Pass 1 Rule 1: Minimum word count check
      if (wordCount < 50) {
        ruleFlags.push({
          id: crypto.randomUUID(),
          section_key: sectionKey,
          type: 'warning',
          message: `Section has only ${wordCount} words — consider expanding`,
          source: 'rule',
        })
      }

      // Pass 1 Rule 2: Placeholder detection
      const placeholderMatches = content.match(/\[PLACEHOLDER:[^\]]*\]/g)
      if (placeholderMatches) {
        placeholderMatches.forEach((match) => {
          ruleFlags.push({
            id: crypto.randomUUID(),
            section_key: sectionKey,
            type: 'warning',
            message: `Unfilled placeholder: ${match}`,
            source: 'rule',
          })
        })
      }

      // Pass 1 Rule 3: Required heading check (section-type specific keyword checks)
      const sectionKeyLower = sectionKey.toLowerCase()
      if (sectionKeyLower.includes('safety_reporting') || sectionKeyLower === 'safety_reporting') {
        const safetyKeywords = ['adverse event', 'adverse events', 'safety reporting', 'sae', 'serious adverse']
        const contentLower = textContent.toLowerCase()
        const hasSafetyKeyword = safetyKeywords.some((kw) => contentLower.includes(kw))
        if (!hasSafetyKeyword) {
          ruleFlags.push({
            id: crypto.randomUUID(),
            section_key: sectionKey,
            type: 'warning',
            message: 'Safety reporting section should address adverse event procedures',
            source: 'rule',
          })
        }
      }

      if (sectionKeyLower.includes('study_understanding') || sectionKeyLower === 'study_understanding') {
        const studyKeywords = ['therapeutic area', 'indication', 'study', 'protocol', 'phase']
        const contentLower = textContent.toLowerCase()
        const hasStudyKeyword = studyKeywords.some((kw) => contentLower.includes(kw))
        if (!hasStudyKeyword) {
          ruleFlags.push({
            id: crypto.randomUUID(),
            section_key: sectionKey,
            type: 'warning',
            message: 'Study understanding section should reference the therapeutic area',
            source: 'rule',
          })
        }
      }

      // If rule-based flags found: dispatch immediately, do NOT call Haiku
      if (ruleFlags.length > 0) {
        dispatch({
          type: 'SET_COMPLIANCE_FLAGS',
          payload: { section_key: sectionKey, flags: ruleFlags },
        })
        await persistFlags(sectionKey, ruleFlags)
        return
      }

      // Pass 2: Haiku compliance call (only if rules pass)
      dispatch({
        type: 'SET_COMPLIANCE_CHECKING',
        payload: { section_key: sectionKey, checking: true },
      })

      try {
        const { data, error } = await supabase.functions.invoke('compliance-check', {
          body: {
            section_key: sectionKey,
            content: textContent,
            proposal_id: proposalId,
          },
        })

        dispatch({
          type: 'SET_COMPLIANCE_CHECKING',
          payload: { section_key: sectionKey, checking: false },
        })

        if (error || !data) {
          const errorFlags: ComplianceFlag[] = [
            {
              id: crypto.randomUUID(),
              section_key: sectionKey,
              type: 'warning',
              message: 'Compliance check unavailable. Review manually before submitting.',
              source: 'rule',
            },
          ]
          dispatch({
            type: 'SET_COMPLIANCE_FLAGS',
            payload: { section_key: sectionKey, flags: errorFlags },
          })
          await persistFlags(sectionKey, errorFlags)
          return
        }

        const haikuFlags: ComplianceFlag[] = (data.flags ?? []).map((flagMessage: string) => ({
          id: crypto.randomUUID(),
          section_key: sectionKey,
          type: data.compliant ? 'warning' : ('fail' as 'warning' | 'fail'),
          message: flagMessage,
          source: 'haiku' as const,
        }))

        dispatch({
          type: 'SET_COMPLIANCE_FLAGS',
          payload: { section_key: sectionKey, flags: haikuFlags },
        })
        await persistFlags(sectionKey, haikuFlags)
      } catch {
        dispatch({
          type: 'SET_COMPLIANCE_CHECKING',
          payload: { section_key: sectionKey, checking: false },
        })
        const catchFlags: ComplianceFlag[] = [
          {
            id: crypto.randomUUID(),
            section_key: sectionKey,
            type: 'warning',
            message: 'Compliance check unavailable. Review manually before submitting.',
            source: 'rule',
          },
        ]
        dispatch({
          type: 'SET_COMPLIANCE_FLAGS',
          payload: { section_key: sectionKey, flags: catchFlags },
        })
        await persistFlags(sectionKey, catchFlags)
      }
    },
    [dispatch, persistFlags, proposalId]
  )

  return { checkCompliance }
}
