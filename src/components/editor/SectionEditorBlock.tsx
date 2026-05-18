import { forwardRef, useImperativeHandle, useCallback, useEffect, useRef } from 'react'
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
import type { PatchResult, PendingEdit } from '../../types/workspace'
import { PendingEditsPlugin, PendingEditsPluginKey } from '../../editor/plugins/pendingEdits/PendingEditsPlugin'
import { ghostContentLeakDetected } from '../../editor/plugins/pendingEdits/decorations'
import { usePendingEditsSync } from '../../hooks/usePendingEditsSync'

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
    const { state: workspaceState, dispatch: workspaceDispatch } = useSectionWorkspace()
    const { checkCompliance } = useComplianceCheck(proposalId, orgId)
    const { triggerAction } = useSectionAIAction(proposalId, sectionKey, orgId)

    // Keep backward-compat alias for existing code that uses `dispatch`
    const dispatch = workspaceDispatch

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
        PendingEditsPlugin.configure({
          sectionKey: sectionKey,
          getState: () => workspaceState.sections[sectionKey]?.pending_edits ?? [],
          dispatch: workspaceDispatch,
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

    // ── usePendingEditsSync: fire read-modify-write after resolution state changes ──
    const pendingEdits = workspaceState.sections[sectionKey]?.pending_edits ?? []
    const activeMessageId = pendingEdits[0]?.message_id ?? null
    usePendingEditsSync({ pendingEdits, messageId: activeMessageId })

    // ── Plugin refresh on pending_edits changes ────────────────────────────────────
    const pendingEditsIdsRef = useRef<string>('')

    useEffect(() => {
      if (!editor) return
      const currentIds = pendingEdits.map((e) => e.paragraph_id + e.resolution).join(',')
      if (currentIds === pendingEditsIdsRef.current) return
      pendingEditsIdsRef.current = currentIds
      editor.view.dispatch(
        editor.state.tr.setMeta(PendingEditsPluginKey, 'refresh')
      )
    }, [editor, pendingEdits])

    // ── Batch-accept PM transaction (D-03: one undo step, atomic) ─────────────────
    const prevBatchResolutionsRef = useRef<Record<string, string>>({})

    useEffect(() => {
      if (!editor) return
      const currentEdits = workspaceState.sections[sectionKey]?.pending_edits ?? []

      const newlyAccepted = currentEdits.filter((edit) => {
        const prev = prevBatchResolutionsRef.current[edit.paragraph_id]
        return prev !== 'accepted' && edit.resolution === 'accepted'
      })

      // Only handle when 2+ edits accepted simultaneously (batch case)
      if (newlyAccepted.length < 2) {
        prevBatchResolutionsRef.current = Object.fromEntries(currentEdits.map((e) => [e.paragraph_id, e.resolution]))
        return
      }

      const editsWithPos: Array<{ edit: typeof newlyAccepted[0]; anchorFrom: number; anchorTo: number }> = []
      for (const edit of newlyAccepted) {
        let anchorFrom = -1; let anchorTo = -1
        editor.state.doc.descendants((node, pos) => {
          if (node.attrs?.id === edit.paragraph_id) { anchorFrom = pos; anchorTo = pos + node.nodeSize; return false }
        })
        if (anchorFrom !== -1) editsWithPos.push({ edit, anchorFrom, anchorTo })
      }

      if (editsWithPos.length === 0) {
        prevBatchResolutionsRef.current = Object.fromEntries(currentEdits.map((e) => [e.paragraph_id, e.resolution]))
        return
      }

      // Sort descending — process end of doc to start to preserve positions
      editsWithPos.sort((a, b) => b.anchorFrom - a.anchorFrom)

      try {
        let chain = editor.chain().command(({ tr }) => {
          tr.setMeta('aiApplied', true)
          tr.setMeta('addToHistory', true)
          tr.setMeta(PendingEditsPluginKey, 'skip-refresh')
          return true
        })

        for (const { edit, anchorFrom, anchorTo } of editsWithPos) {
          if (edit.operation === 'delete') {
            chain = chain.deleteRange({ from: anchorFrom, to: anchorTo })
          } else {
            const newHtml = edit.after_html ?? ''
            if (newHtml) {
              chain = chain.deleteRange({ from: anchorFrom, to: anchorTo }).insertContentAt(anchorFrom, newHtml)
            }
          }
        }

        chain.run()  // ONE run() = one ProseMirror transaction = one undo step (D-03)
      } catch (err) {
        // Accept All atomicity: if PM transaction throws, ProseMirror has already aborted it.
        // Surface error toast. State remains unchanged (reducer already applied, but PM didn't commit).
        console.error('[PendingEdits] Batch accept transaction failed — state unchanged', err)
      }

      prevBatchResolutionsRef.current = Object.fromEntries(currentEdits.map((e) => [e.paragraph_id, e.resolution]))
    }, [editor, workspaceState.sections[sectionKey]?.pending_edits]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Single-edit Accept PM transaction (ACCEPT_PENDING_EDIT path) ──────────────
    const prevResolutionsRef = useRef<Record<string, string>>({})

    useEffect(() => {
      if (!editor) return
      const currentEdits = workspaceState.sections[sectionKey]?.pending_edits ?? []

      for (const edit of currentEdits) {
        const prevRes = prevResolutionsRef.current[edit.paragraph_id]
        if (prevRes !== 'accepted' && edit.resolution === 'accepted') {
          // Only handle single-accept here; batch (2+) handled above
          let anchorFrom = -1; let anchorTo = -1
          editor.state.doc.descendants((node, pos) => {
            if (node.attrs?.id === edit.paragraph_id) { anchorFrom = pos; anchorTo = pos + node.nodeSize; return false }
          })
          if (anchorFrom === -1) continue  // Stale anchor — skip

          try {
            if (edit.operation === 'delete') {
              editor.chain()
                .command(({ tr }) => { tr.setMeta('aiApplied', true); tr.setMeta('addToHistory', true); tr.setMeta(PendingEditsPluginKey, 'skip-refresh'); return true })
                .deleteRange({ from: anchorFrom, to: anchorTo })
                .run()
            } else {
              const newHtml = edit.after_html ?? ''
              if (!newHtml) continue
              editor.chain()
                .command(({ tr }) => { tr.setMeta('aiApplied', true); tr.setMeta('addToHistory', true); tr.setMeta(PendingEditsPluginKey, 'skip-refresh'); return true })
                .deleteRange({ from: anchorFrom, to: anchorTo })
                .insertContentAt(anchorFrom, newHtml)
                .run()
            }
          } catch (err) {
            console.error('[PendingEdits] Single accept transaction failed', err)
          }
        }
      }
      prevResolutionsRef.current = Object.fromEntries(currentEdits.map((e) => [e.paragraph_id, e.resolution]))
    }, [editor, workspaceState.sections[sectionKey]?.pending_edits]) // eslint-disable-line react-hooks/exhaustive-deps

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

    const materializePendingEdits = useCallback((messageId: string, edits: PendingEdit[]) => {
      // Error path 1: editor not mounted
      if (!editor) {
        console.warn('[PendingEdits] materializePendingEdits called but editor not mounted', { sectionKey, messageId })
        return
      }

      // Error path 2: section not active (no-op)
      const section = workspaceState.sections[sectionKey]
      if (!section) return

      // Idempotency guard: if these edits are already in plugin state (same edit IDs), skip
      const existingIds = new Set(section.pending_edits.map((e) => e.id))
      const allAlreadyPresent = edits.every((e) => existingIds.has(e.id))
      if (allAlreadyPresent && edits.length === section.pending_edits.length) {
        return  // No-op — same edits already materialized
      }

      // Error path 3: validate each edit before applying — skip stale paragraph IDs
      const validEdits = edits.filter((edit) => {
        if (!edit.paragraph_id) {
          // insert_after without paragraph_id is valid — it anchors to last paragraph
          return edit.operation === 'insert_after'
        }
        let found = false
        editor.state.doc.descendants((node) => {
          if (node.attrs?.id === edit.paragraph_id) { found = true; return false }
        })
        if (!found) {
          console.warn('[PendingEdits] Skipping edit — paragraph_id not found in doc', { edit, sectionKey })
          return false
        }
        return true
      })

      // Error path 4: malformed tool payload (basic shape validation)
      const validatedEdits = validEdits.filter((edit) => {
        if (!edit.id || !edit.operation || !edit.message_id) {
          console.warn('[PendingEdits] Skipping malformed edit', { edit })
          return false
        }
        return true
      })

      if (validatedEdits.length === 0) return

      // Ghost isolation guard (AI-SPEC online guardrail 1)
      const html = editor.getHTML()
      if (ghostContentLeakDetected(html, validatedEdits)) {
        console.error('[PendingEdits] Ghost isolation violation — blocking SET_PENDING_EDITS', { sectionKey, messageId })
        return
      }

      workspaceDispatch({
        type: 'SET_PENDING_EDITS',
        payload: { section_key: sectionKey, message_id: messageId, edits: validatedEdits },
      })

      // Scroll this section into view
      const editorEl = editor.view.dom
      editorEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, [editor, workspaceState, workspaceDispatch, sectionKey]) // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(ref, (): SectionEditorHandle => ({
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
      materializePendingEdits,
    }), [materializePendingEdits]) // eslint-disable-line react-hooks/exhaustive-deps

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
