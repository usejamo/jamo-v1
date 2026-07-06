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
import type { PendingEdit, MaterializeResult } from '../../types/workspace'
import { PendingEditsPlugin, PendingEditsPluginKey } from '../../editor/plugins/pendingEdits/PendingEditsPlugin'
import { ghostContentLeakDetected, collectFutureAnchorIds, computeAnchorHash } from '../../editor/plugins/pendingEdits/decorations'
import { usePendingEditsSync } from '../../hooks/usePendingEditsSync'
import { DOMParser as PMDOMParser, type Schema, type Node as PMNode } from '@tiptap/pm/model'

/**
 * ProseMirror content size that an after_html fragment occupies once inserted.
 * Used to position consecutive single-accepts of insert_after edits anchored to
 * the same paragraph — data-id matching is unreliable because the model often
 * omits data-id attributes and UniqueID then assigns fresh ones on insert.
 */
function estimateContentSize(html: string | undefined, schema: Schema): number {
  if (!html) return 0
  try {
    const body = new DOMParser().parseFromString(html, 'text/html').body
    return PMDOMParser.fromSchema(schema).parseSlice(body).content.size
  } catch {
    return 0
  }
}

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

    // Live ref to workspace state. The PendingEditsPlugin's getState closure is
    // captured once at editor creation; without this ref it would permanently
    // read the mount-time state (empty pending_edits) and never render ghosts.
    const workspaceStateRef = useRef(workspaceState)
    workspaceStateRef.current = workspaceState

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
          getState: () => workspaceStateRef.current.sections[sectionKey]?.pending_edits ?? [],
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
    usePendingEditsSync({ pendingEdits })

    // ── Plugin refresh on pending_edits changes ────────────────────────────────────
    const pendingEditsIdsRef = useRef<string>('')

    useEffect(() => {
      if (!editor) return
      const currentIds = pendingEdits.map((e) => e.id + e.resolution).join(',')
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
        const prev = prevBatchResolutionsRef.current[edit.id]
        return prev !== 'accepted' && edit.resolution === 'accepted'
      })

      // Only handle when 2+ edits accepted simultaneously (batch case)
      if (newlyAccepted.length < 2) {
        prevBatchResolutionsRef.current = Object.fromEntries(currentEdits.map((e) => [e.id, e.resolution]))
        return
      }

      // Apply in the model's intended order (change_index). Anchors are
      // re-resolved against the evolving transaction so chained inserts — where
      // edit N+1 is anchored to a paragraph edit N creates — apply correctly.
      const ordered = [...newlyAccepted].sort(
        (a, b) => (a.change_index ?? 0) - (b.change_index ?? 0)
      )

      try {
        editor.chain()
          .command(({ tr }) => {
            tr.setMeta('aiApplied', true)
            tr.setMeta('addToHistory', true)
            tr.setMeta(PendingEditsPluginKey, 'skip-refresh')
            return true
          })
          .command(({ tr, commands }) => {
            // cursor tracks the end of the last inserted content, so multiple
            // edits anchored at the same paragraph stack in change_index order
            // instead of reversing.
            let cursor = -1
            for (const edit of ordered) {
              let from = -1; let to = -1
              tr.doc.descendants((node, pos) => {
                if (node.attrs?.id === edit.paragraph_id) { from = pos; to = pos + node.nodeSize; return false }
              })
              if (edit.operation === 'delete') {
                if (from !== -1) commands.deleteRange({ from, to })
                continue
              }
              const newHtml = edit.after_html ?? ''
              if (!newHtml) continue
              if (edit.operation === 'insert_after') {
                // Insert AFTER the anchor — never delete it. Advance past any
                // content already inserted in this batch so order is preserved;
                // fall back to the document end when the anchor is not found.
                const anchorPos = to !== -1 ? to : tr.doc.content.size
                const insertAt = cursor !== -1 ? Math.max(anchorPos, cursor) : anchorPos
                const sizeBefore = tr.doc.content.size
                commands.insertContentAt(insertAt, newHtml)
                cursor = insertAt + (tr.doc.content.size - sizeBefore)
              } else {
                // replace — swap the anchor paragraph's content in place
                if (from !== -1) {
                  commands.deleteRange({ from, to })
                  commands.insertContentAt(from, newHtml)
                }
              }
            }
            return true
          })
          .run()  // ONE run() = one ProseMirror transaction = one undo step (D-03)
      } catch (err) {
        // Accept All atomicity: if the PM transaction throws, ProseMirror has
        // already aborted it. State remains unchanged.
        console.error('[PendingEdits] Batch accept transaction failed — state unchanged', err)
      }

      // Rebuild decorations against the post-accept doc — the plugin-refresh
      // effect ran before this accept committed, so any edit whose anchor was
      // just created would otherwise never get its ghost widget.
      editor.view.dispatch(editor.state.tr.setMeta(PendingEditsPluginKey, 'refresh'))
      prevBatchResolutionsRef.current = Object.fromEntries(currentEdits.map((e) => [e.id, e.resolution]))
    }, [editor, workspaceState.sections[sectionKey]?.pending_edits]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Single-edit Accept PM transaction (ACCEPT_PENDING_EDIT path) ──────────────
    const prevResolutionsRef = useRef<Record<string, string>>({})

    useEffect(() => {
      if (!editor) return
      const currentEdits = workspaceState.sections[sectionKey]?.pending_edits ?? []

      const newlyAccepted = currentEdits.filter((edit) => {
        const prev = prevResolutionsRef.current[edit.id]
        return prev !== 'accepted' && edit.resolution === 'accepted'
      })

      // Batch case (2+) is handled by the batch-accept effect above — skip here
      // so edits are not applied twice.
      if (newlyAccepted.length >= 2) {
        prevResolutionsRef.current = Object.fromEntries(currentEdits.map((e) => [e.id, e.resolution]))
        return
      }

      for (const edit of newlyAccepted) {
        let anchorFrom = -1; let anchorTo = -1
        editor.state.doc.descendants((node, pos) => {
          if (node.attrs?.id === edit.paragraph_id) { anchorFrom = pos; anchorTo = pos + node.nodeSize; return false }
        })

        try {
          if (edit.operation === 'delete') {
            if (anchorFrom === -1) continue  // Stale anchor — skip
            editor.chain()
              .command(({ tr }) => { tr.setMeta('aiApplied', true); tr.setMeta('addToHistory', true); tr.setMeta(PendingEditsPluginKey, 'skip-refresh'); return true })
              .deleteRange({ from: anchorFrom, to: anchorTo })
              .run()
          } else {
            const newHtml = edit.after_html ?? ''
            if (!newHtml) continue
            if (edit.operation === 'insert_after') {
              // Insert AFTER the anchor — never delete it. Fall back to the end
              // of the document when the anchor cannot be found.
              let insertAt = anchorTo !== -1 ? anchorTo : editor.state.doc.content.size
              if (anchorTo !== -1) {
                // Single accepts are separate transactions, so advance past content
                // already inserted by lower-change_index sibling insert_after edits
                // anchored to the same paragraph — otherwise accepting one at a time
                // stacks them in reverse order. Offset by the inserted size of each
                // such sibling (summing only lower change_index keeps it correct
                // regardless of the order the user accepts in).
                let offset = 0
                for (const sib of currentEdits) {
                  if (sib.id === edit.id) continue
                  if (sib.operation !== 'insert_after') continue
                  if (sib.paragraph_id !== edit.paragraph_id) continue
                  if (sib.resolution !== 'accepted') continue
                  if ((sib.change_index ?? 0) >= (edit.change_index ?? 0)) continue
                  offset += estimateContentSize(sib.after_html, editor.schema)
                }
                insertAt = anchorTo + offset
              }
              editor.chain()
                .command(({ tr }) => { tr.setMeta('aiApplied', true); tr.setMeta('addToHistory', true); tr.setMeta(PendingEditsPluginKey, 'skip-refresh'); return true })
                .insertContentAt(insertAt, newHtml)
                .run()
            } else {
              // replace — swap the anchor paragraph's content in place
              if (anchorFrom === -1) continue  // Stale anchor — skip
              editor.chain()
                .command(({ tr }) => { tr.setMeta('aiApplied', true); tr.setMeta('addToHistory', true); tr.setMeta(PendingEditsPluginKey, 'skip-refresh'); return true })
                .deleteRange({ from: anchorFrom, to: anchorTo })
                .insertContentAt(anchorFrom, newHtml)
                .run()
            }
          }
        } catch (err) {
          console.error('[PendingEdits] Single accept transaction failed', err)
        }
      }
      if (newlyAccepted.length > 0) {
        // Rebuild decorations against the post-accept doc so a chained edit whose
        // anchor was just created gets its ghost widget.
        editor.view.dispatch(editor.state.tr.setMeta(PendingEditsPluginKey, 'refresh'))
      }
      prevResolutionsRef.current = Object.fromEntries(currentEdits.map((e) => [e.id, e.resolution]))
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

    const materializePendingEdits = useCallback((messageId: string, edits: PendingEdit[]): MaterializeResult => {
      // Error path 1: editor not mounted
      if (!editor) {
        console.warn('[PendingEdits] materializePendingEdits called but editor not mounted', { sectionKey, messageId })
        return { ok: false, reason: 'editor-not-mounted' }
      }

      // Error path 2: section not active (no-op)
      const section = workspaceState.sections[sectionKey]
      if (!section) return { ok: false, reason: 'section-not-active' }

      // Idempotency guard: if these edits are already in plugin state (same edit IDs), skip
      const existingIds = new Set(section.pending_edits.map((e) => e.id))
      const allAlreadyPresent = edits.every((e) => existingIds.has(e.id))
      if (allAlreadyPresent && edits.length === section.pending_edits.length) {
        return { ok: true, applied: section.pending_edits.length }  // No-op — same edits already materialized
      }

      // Error path 3: validate each edit before applying — skip stale paragraph IDs.
      // Chained edits anchor to a paragraph an earlier edit in the same batch
      // creates, so an anchor missing from the doc is still valid when a sibling
      // edit's after_html declares that data-id.
      const futureIds = collectFutureAnchorIds(edits)
      const validEdits = edits.filter((edit) => {
        if (!edit.paragraph_id) {
          // insert_after without paragraph_id is valid — it anchors to last paragraph
          return edit.operation === 'insert_after'
        }
        let found = false
        editor.state.doc.descendants((node) => {
          if (node.attrs?.id === edit.paragraph_id) { found = true; return false }
        })
        if (found) return true
        if (futureIds.has(edit.paragraph_id)) return true  // chained — anchor created by a sibling edit
        console.warn('[PendingEdits] Skipping edit — paragraph_id not found in doc', { edit, sectionKey })
        return false
      })

      // Error path 4: malformed tool payload (basic shape validation)
      const validatedEdits = validEdits.filter((edit) => {
        if (!edit.id || !edit.operation || !edit.message_id) {
          console.warn('[PendingEdits] Skipping malformed edit', { edit })
          return false
        }
        return true
      })

      if (validatedEdits.length === 0) return { ok: false, reason: 'no-valid-edits' }

      // Capture each anchor paragraph's content hash at materialization time so
      // staleness detection can later tell if the user edited it before review.
      // Edits whose anchor isn't in the doc yet (chained edits) get their hash
      // on a later materialization once the anchor exists.
      const editsWithHash = validatedEdits.map((edit) => {
        if (!edit.paragraph_id) return edit
        let anchorNode: PMNode | null = null
        editor.state.doc.descendants((node) => {
          if (anchorNode) return false
          if (node.attrs?.id === edit.paragraph_id) { anchorNode = node; return false }
        })
        if (!anchorNode) return edit
        return { ...edit, anchor_hash: computeAnchorHash(anchorNode, edit.paragraph_id) }
      })

      // Ghost isolation guard (AI-SPEC online guardrail 1)
      const html = editor.getHTML()
      if (ghostContentLeakDetected(html, editsWithHash)) {
        console.error('[PendingEdits] Ghost isolation violation — blocking SET_PENDING_EDITS', { sectionKey, messageId })
        return { ok: false, reason: 'ghost-leak' }
      }

      workspaceDispatch({
        type: 'SET_PENDING_EDITS',
        payload: { section_key: sectionKey, message_id: messageId, edits: editsWithHash },
      })

      // Scroll this section into view
      const editorEl = editor.view.dom
      editorEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })

      return { ok: true, applied: editsWithHash.length }
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
      saveNow: (html: string) => saveNow(html),
      materializePendingEdits,
    }), [saveNow, materializePendingEdits]) // eslint-disable-line react-hooks/exhaustive-deps

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
