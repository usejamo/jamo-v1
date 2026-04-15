import { forwardRef, useImperativeHandle, useCallback, useEffect } from 'react'
import { markdownToHtml } from '../../lib/markdownToHtml'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import type { SectionEditorHandle, SectionEditorState } from '../../types/workspace'
import { useAutosave } from '../../hooks/useAutosave'
import { useSectionWorkspace } from '../../context/SectionWorkspaceContext'
import { supabase } from '../../lib/supabase'
import { AIActionPreview } from './AIActionPreview'
import { RewriteDiffView } from './RewriteDiffView'
import { ComplianceFlagList } from './ComplianceFlag'
import { SectionActionToolbar } from './SectionActionToolbar'
import { useComplianceCheck } from '../../hooks/useComplianceCheck'
import { useSectionAIAction } from '../../hooks/useSectionAIAction'

interface SectionEditorBlockProps {
  sectionKey: string
  sectionTitle: string
  proposalId: string
  orgId?: string
  editorState: SectionEditorState
  onFocus?: () => void
}

export const SectionEditorBlock = forwardRef<SectionEditorHandle, SectionEditorBlockProps>(
  function SectionEditorBlock({ sectionKey, sectionTitle, proposalId, orgId = '', editorState, onFocus }, ref) {
    const { dispatch } = useSectionWorkspace()
    const { checkCompliance } = useComplianceCheck(proposalId, orgId)
    const { triggerAction } = useSectionAIAction(proposalId, sectionKey, orgId)

    const onStatusChange = useCallback(
      (status: 'idle' | 'saving' | 'saved') => {
        dispatch({ type: 'SET_AUTOSAVE_STATUS', payload: { section_key: sectionKey, status } })
      },
      [dispatch, sectionKey]
    )

    const { triggerAutosave, cancel, saveNow } = useAutosave(proposalId, sectionKey, onStatusChange)

    const editor = useEditor({
      extensions: [
        StarterKit,
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content: markdownToHtml(editorState.content || ''),
      immediatelyRender: false,
      editable: !editorState.is_locked,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML()
        dispatch({ type: 'UPDATE_CONTENT', payload: { section_key: sectionKey, content: html } })
        triggerAutosave(html)
      },
      onFocus: () => onFocus?.(),
    })

    // Sync editable state when lock changes
    useEffect(() => {
      if (editor) {
        editor.setEditable(!editorState.is_locked)
      }
    }, [editor, editorState.is_locked])

    // Cancel pending autosave on unmount
    useEffect(() => {
      return () => cancel()
    }, [cancel])

    // Accept AI action: inject content via setContent (D-05), write post-accept version
    const handleAcceptAIAction = useCallback(async () => {
      const aiAction = editorState.ai_action
      if (!aiAction) return
      dispatch({ type: 'ACCEPT_AI_ACTION', payload: { section_key: sectionKey } })
      const acceptedHtml = markdownToHtml(aiAction.preview_content)
      editor?.commands.setContent(acceptedHtml, { emitUpdate: true })
      // Immediately persist accepted content so a quick refresh doesn't lose it
      await saveNow(acceptedHtml)
      // Write post-accept version (skip if orgId not yet available)
      if (orgId) {
        const actionLabel = `After ${aiAction.type.charAt(0).toUpperCase() + aiAction.type.slice(1)}`
        await supabase.from('proposal_section_versions').insert({
          proposal_id: proposalId,
          org_id: orgId,
          section_key: sectionKey,
          content: aiAction.preview_content,
          action_label: actionLabel,
        })
      }
      // Fire compliance check on accept (D-13)
      checkCompliance(sectionKey, aiAction.preview_content)
    }, [editorState.ai_action, dispatch, sectionKey, editor, proposalId, orgId, checkCompliance, saveNow])

    const handleDeclineAIAction = useCallback(() => {
      dispatch({ type: 'REJECT_AI_ACTION', payload: { section_key: sectionKey } })
    }, [dispatch, sectionKey])

    useImperativeHandle(ref, () => ({
      insertContentAt: (pos: number, content: string) => {
        editor?.commands.insertContentAt(pos, content)
      },
      setContent: (html: string) => {
        editor?.commands.setContent(html, { emitUpdate: true })
      },
      getContent: () => {
        return editor?.getHTML() ?? ''
      },
    }))

    const isEmpty = !editorState.content && !editorState.ai_action?.streaming

    return (
      <div
        id={sectionKey}
        className="bg-white border border-gray-200 rounded-lg mb-4 scroll-mt-4"
      >
        {!editor ? null : <>
        {/* Autosave status */}
        {editorState.autosave_status !== 'idle' && (
          <div className="px-4 pt-2 text-right">
            <span className="text-xs text-gray-400">
              {editorState.autosave_status === 'saving' && 'Saving...'}
              {editorState.autosave_status === 'saved' && 'Saved'}
            </span>
          </div>
        )}

        {/* Action toolbar */}
        <SectionActionToolbar
          sectionKey={sectionKey}
          sectionTitle={sectionTitle}
          hasContent={!!editorState.content}
          isLocked={editorState.is_locked}
          isStreaming={editorState.ai_action?.streaming ?? false}
          onAction={(actionType, userInstructions) => triggerAction(actionType, editor?.getHTML() ?? editorState.content, userInstructions)}
          onToggleLock={() =>
            dispatch({
              type: 'SET_LOCKED',
              payload: { section_key: sectionKey, is_locked: !editorState.is_locked },
            })
          }
          onOpenHistory={() =>
            dispatch({ type: 'OPEN_VERSION_HISTORY', payload: sectionKey })
          }
        />

        {/* Editor or empty state */}
        {isEmpty ? (
          <p className="text-gray-400 text-sm italic p-4">
            This section hasn&apos;t been generated yet. Click Generate Section to create content.
          </p>
        ) : (
          <div className="prose prose-sm max-w-none p-4">
            <EditorContent editor={editor} />
          </div>
        )}

        {/* Compliance flags */}
        <ComplianceFlagList
          flags={editorState.compliance_flags}
          checking={editorState.compliance_checking}
        />

        {/* AI action preview — rendered based on ai_action state */}
        {editorState.ai_action && (
          <div className="px-4 pb-4">
            {editorState.ai_action.type === 'rewrite' ? (
              <RewriteDiffView
                beforeContent={editorState.ai_action.snapshot_before}
                afterContent={editorState.ai_action.preview_content}
                isStreaming={editorState.ai_action.streaming}
                onApply={handleAcceptAIAction}
                onDiscard={handleDeclineAIAction}
              />
            ) : (
              <AIActionPreview
                previewContent={editorState.ai_action.preview_content}
                isStreaming={editorState.ai_action.streaming}
                actionType={editorState.ai_action.type as 'expand' | 'condense' | 'generate' | 'rewrite'}
                onAccept={handleAcceptAIAction}
                onDecline={handleDeclineAIAction}
              />
            )}
          </div>
        )}
        </>}
      </div>
    )
  }
)
