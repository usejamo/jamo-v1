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
import { migratePlaceholders } from '../../lib/migratePlaceholders'
import { PlaceholderMark } from './extensions/PlaceholderMark'
import UniqueID from '@tiptap/extension-unique-id'
import type { ProposeEditChange } from '../../types/chat'
import type { PatchResult } from '../../types/workspace'

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

    const rawContent = markdownToHtml(editorState.content || '')
    const migratedContent = migratePlaceholders(rawContent)

    const editor = useEditor({
      extensions: [
        StarterKit,
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        PlaceholderMark,
        UniqueID.configure({
          types: ['paragraph', 'heading'],
          attributeName: 'id',           // serializes as data-id="<uuid>" in HTML
        }),
      ],
      content: migratedContent,
      immediatelyRender: false,
      editable: !editorState.is_locked,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML()
        dispatch({ type: 'UPDATE_CONTENT', payload: { section_key: sectionKey, content: html } })
        triggerAutosave(html)
      },
      onFocus: () => onFocus?.(),
    })

    // Commit migrated placeholders to DB on first load if legacy [PLACEHOLDER: ...] strings were found
    useEffect(() => {
      if (migratedContent !== rawContent && editor) {
        saveNow(migratedContent)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // run once on mount only

    // Placeholder analyzer: walk doc, collect placeholder marks, dispatch issues
    useEffect(() => {
      if (!editor) return

      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const handler = () => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          const issues: import('../../types/workspace').SectionIssue[] = []
          const seenIds = new Set<string>()
          editor.state.doc.descendants((node) => {
            const mark = node.marks.find((m) => m.type.name === 'placeholder')
            if (mark && !seenIds.has(mark.attrs.id)) {
              seenIds.add(mark.attrs.id)
              issues.push({ id: mark.attrs.id, label: mark.attrs.label ?? '' })
            }
          })
          dispatch({
            type: 'UPDATE_SECTION_ISSUES',
            payload: { section_key: sectionKey, category: 'placeholder', issues },
          })
        }, 200)
      }

      editor.on('update', handler)
      // Run once immediately on mount to populate initial state
      handler()

      return () => {
        editor.off('update', handler)
        if (timeoutId) clearTimeout(timeoutId)
      }
    }, [editor, dispatch, sectionKey])

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
      const acceptedHtml = migratePlaceholders(markdownToHtml(aiAction.preview_content))
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
      applyParagraphPatch(changes: ProposeEditChange[]): PatchResult {
        if (!editor) return { applied: 0, stale: [] }

        const stale: string[] = []
        let applied = 0

        for (const change of changes) {
          if (change.operation === 'replace' || change.operation === 'delete') {
            if (!change.paragraph_id) {
              stale.push('(missing_id)')
              continue
            }
            // Find node by data-id attribute at apply time (D-03 — never cache the reference)
            let targetPos: number | null = null
            let targetSize: number | null = null
            editor.state.doc.descendants((node, pos) => {
              if (targetPos !== null) return false
              if (node.attrs?.id === change.paragraph_id) {
                targetPos = pos
                targetSize = node.nodeSize
                return false
              }
            })

            if (targetPos === null) {
              stale.push(change.paragraph_id)
              continue
            }

            if (change.operation === 'delete') {
              const tr = editor.state.tr.delete(targetPos, targetPos + targetSize!)
              tr.setMeta('addToHistory', true)
              editor.view.dispatch(tr)
              applied++
            } else if (change.operation === 'replace' && change.after_html) {
              editor.commands.insertContentAt(
                { from: targetPos, to: targetPos + targetSize! },
                change.after_html,
                { updateSelection: false }
              )
              applied++
            }
          } else if (change.operation === 'insert_after') {
            if (!change.paragraph_id || !change.after_html) {
              // New paragraph at end of section if no anchor
              if (change.after_html) {
                editor.commands.insertContent(change.after_html)
                applied++
              }
              continue
            }
            // Find anchor node
            let anchorPos: number | null = null
            let anchorSize: number | null = null
            editor.state.doc.descendants((node, pos) => {
              if (anchorPos !== null) return false
              if (node.attrs?.id === change.paragraph_id) {
                anchorPos = pos
                anchorSize = node.nodeSize
                return false
              }
            })
            if (anchorPos === null) {
              stale.push(change.paragraph_id)
              continue
            }
            // Insert after anchor — fresh UUID assigned automatically by UniqueID extension
            editor.commands.insertContentAt(anchorPos + anchorSize!, change.after_html)
            applied++
          }
        }

        return { applied, stale }
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

        {/* Placeholder issues */}
        {Object.entries(editorState.issues ?? {}).flatMap(([category, issueList]) =>
          (issueList ?? []).map((issue) => {
            const displayLabel = category === 'placeholder'
              ? `Missing: ${issue.label}`
              : issue.label
            return (
              <div key={issue.id} className="px-4 py-1.5 text-sm text-amber-700 bg-amber-50 border-t border-amber-100">
                {displayLabel}
              </div>
            )
          })
        )}

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
