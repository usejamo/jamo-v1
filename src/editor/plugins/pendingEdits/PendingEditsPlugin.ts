import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet } from '@tiptap/pm/view'

export const PendingEditsPluginKey = new PluginKey<DecorationSet>('pendingEdits')

export interface PendingEditsOptions {
  sectionKey: string
  getState: () => any[]
  dispatch: (action: any) => void
}

// Stub — implemented in Plan 03
export const PendingEditsPlugin = Extension.create<PendingEditsOptions>({
  name: 'pendingEdits',
  addOptions() {
    return { sectionKey: '', getState: () => [], dispatch: () => {} }
  },
  addProseMirrorPlugins() {
    return [new Plugin({ key: PendingEditsPluginKey })]
  },
})
