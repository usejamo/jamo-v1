import { forwardRef, useImperativeHandle, useCallback, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { SectionEditorHandle, SectionEditorState } from '../../types/workspace'
import { useAutosave } from '../../hooks/useAutosave'
import { useSectionWorkspace } from '../../context/SectionWorkspaceContext'
import { supabase } from '../../lib/supabase'
import { AIActionPreview } from './AIActionPreview'
import { RewriteDiffView } from './RewriteDiffView'

interface SectionEditorBlockProps {
  sectionKey: string
  sectionTitle: string
  proposalId: string
  orgId?: string
  editorState: SectionEditorState
}

export const SectionEditorBlock = forwardRef<SectionEditorHandle, SectionEditorBlockProps>(
  function SectionEditorBlock({ sectionKey, sectionTitle, proposalId, orgId = '', editorState }, ref) {
    const { dispatch } = useSectionWorkspace()

    const onStatusChange = useCallback(
      (status: 'idle' | 'saving' | 'saved') => {
        dispatch({ type: 'SET_AUTOSAVE_STATUS', payload: { section_key: sectionKey, status } })
      },
      [dispatch, sectionKey]
    )

    const { triggerAutosave, cancel } = useAutosave(proposalId, sectionKey, onStatusChange)

    const editor = useEditor({
      extensions: [StarterKit],
      content: editorState.content || '',
      immediatelyRender: false,
      editable: !editorState.is_locked,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML()
        dispatch({ type: 'UPDATE_CONTENT', payload: { section_key: sectionKey, content: html } })
        triggerAutosave(html)
      },
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
      editor?.commands.setContent(aiAction.preview_content, true)
      // Write post-accept version
      const actionLabel = `After ${aiAction.type.charAt(0).toUpperCase() + aiAction.type.slice(1)}`
      await supabase.from('proposal_section_versions').insert({
        proposal_id: proposalId,
        org_id: orgId,
        section_key: sectionKey,
        content: aiAction.preview_content,
        action_label: actionLabel,
      })
    }, [editorState.ai_action, dispatch, sectionKey, editor, proposalId, orgId])

    const handleDeclineAIAction = useCallback(() => {
      dispatch({ type: 'REJECT_AI_ACTION', payload: { section_key: sectionKey } })
    }, [dispatch, sectionKey])

    useImperativeHandle(ref, () => ({
      insertContentAt: (pos: number, content: string) => {
        editor?.commands.insertContentAt(pos, content)
      },
      setContent: (html: string) => {
        editor?.commands.setContent(html, true)
      },
      getContent: () => {
        return editor?.getHTML() ?? ''
      },
    }))

    if (!editor) return null

    const isEmpty = !editorState.content && !editorState.ai_action?.streaming

    return (
      <div
        id={sectionKey}
        className="bg-white border border-gray-200 rounded-lg mb-4 scroll-mt-4"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">{sectionTitle}</span>
          <div className="flex items-center gap-3">
            {/* Autosave status */}
            <span className="text-xs text-gray-400">
              {editorState.autosave_status === 'saving' && 'Saving...'}
              {editorState.autosave_status === 'saved' && 'Saved'}
            </span>
            {/* Lock icon */}
            <button
              onClick={() =>
                dispatch({
                  type: 'SET_LOCKED',
                  payload: { section_key: sectionKey, is_locked: !editorState.is_locked },
                })
              }
              className={`p-1.5 rounded-md transition-colors ${
                editorState.is_locked
                  ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={editorState.is_locked ? 'Unlock section' : 'Lock section'}
            >
              {editorState.is_locked ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 0 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              )}
            </button>
          </div>
        </div>

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

        {/* Compliance flags placeholder — rendered in Plan 04 */}
        <div data-slot="compliance-flags" />

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
                actionType={editorState.ai_action.type as 'expand' | 'condense' | 'generate' | 'regenerate'}
                onAccept={handleAcceptAIAction}
                onDecline={handleDeclineAIAction}
              />
            )}
          </div>
        )}
      </div>
    )
  }
)
