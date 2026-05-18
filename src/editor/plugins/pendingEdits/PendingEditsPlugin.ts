import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet } from '@tiptap/pm/view'
import type { PendingEdit, WorkspaceAction } from '../../../types/workspace'
import { buildDecorations, unregisterGhostContent, collectFutureAnchorIds } from './decorations'

export const PendingEditsPluginKey = new PluginKey<DecorationSet>('pendingEdits')

export interface PendingEditsOptions {
  sectionKey: string
  getState: () => PendingEdit[]
  dispatch: (action: WorkspaceAction) => void
}

export const PendingEditsPlugin = Extension.create<PendingEditsOptions>({
  name: 'pendingEdits',

  addOptions() {
    return { sectionKey: '', getState: () => [], dispatch: () => {} }
  },

  addProseMirrorPlugins() {
    const { sectionKey, getState, dispatch } = this.options

    return [
      new Plugin<DecorationSet>({
        key: PendingEditsPluginKey,

        state: {
          init(_, editorState) {
            const pending = getState()
            if (pending.length === 0) return DecorationSet.empty
            return buildDecorations(pending, editorState.doc, dispatch, sectionKey)
          },

          apply(tr, oldDecoSet, _oldState, newState) {
            // Always map first — keeps decoration positions alive through user edits
            const mapped = oldDecoSet.map(tr.mapping, newState.doc)

            // Skip rebuild during Accept/Batch transaction (content being committed).
            // T-14.2-03-04: setMeta('skip-refresh') prevents decoration rebuild during mutation.
            if (tr.getMeta(PendingEditsPluginKey) === 'skip-refresh') {
              return mapped
            }

            // Workspace state changed (SET_PENDING_EDITS, ACCEPT, REJECT etc.) — rebuild from scratch
            if (tr.getMeta(PendingEditsPluginKey) === 'refresh') {
              const all = getState()
              // Resolved edits are no longer pending ghosts — drop them from the
              // leak-detection registry so a later edit to the same paragraph is
              // not falsely blocked by ghostContentLeakDetected.
              for (const c of all) {
                if (c.resolution !== 'pending' && c.after_html) unregisterGhostContent(c.after_html)
              }
              const pending = all.filter((c) => c.resolution === 'pending')
              if (pending.length === 0) return DecorationSet.empty
              return buildDecorations(pending, newState.doc, dispatch, sectionKey)
            }

            // Staleness detection — only when doc changed AND pending edits exist.
            // T-14.2-03-03: Walk gated on tr.docChanged && pending.length > 0 (~0.1ms cost).
            if (tr.docChanged) {
              const allEdits = getState()
              const pending = allEdits.filter((c) => c.resolution === 'pending')
              if (pending.length > 0) {
                // A pending edit anchored to an id that a still-live sibling's
                // after_html will create is "chained", not stale. Once that
                // sibling is rejected the id leaves this set, so the chained
                // edit then correctly becomes stale.
                const futureIds = collectFutureAnchorIds(allEdits)
                const staleIds: string[] = []
                for (const change of pending) {
                  if (!change.paragraph_id) continue
                  let found = false
                  newState.doc.descendants((node) => {
                    if (node.attrs?.id === change.paragraph_id) {
                      found = true
                      return false
                    }
                  })
                  if (!found && !futureIds.has(change.paragraph_id)) staleIds.push(change.paragraph_id)
                }

                if (staleIds.length > 0) {
                  // CRITICAL: dispatch is deferred via queueMicrotask — NEVER called inline inside apply().
                  // T-14.2-03-02: Defer React dispatch outside ProseMirror's transaction commit cycle.
                  // SectionEditorBlock effect layer (Plan 05) also watches plugin state for stale_ids.
                  queueMicrotask(() => {
                    dispatch({
                      type: 'AUTO_REJECT_STALE_EDITS',
                      payload: { section_key: sectionKey, stale_ids: staleIds },
                    })
                  })

                  const withoutStale = pending.filter(
                    (c) => !staleIds.includes(c.paragraph_id)
                  )
                  if (withoutStale.length === 0) return DecorationSet.empty
                  return buildDecorations(withoutStale, newState.doc, dispatch, sectionKey)
                }
              }
            }

            return mapped
          },
        },

        props: {
          decorations(state) {
            return PendingEditsPluginKey.getState(state)
          },
        },
      }),
    ]
  },
})
