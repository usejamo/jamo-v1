import { Mark, mergeAttributes } from '@tiptap/core'
import type { MarkType } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { Plugin } from '@tiptap/pm/state'

// ---------------------------------------------------------------------------
// Helper: collect all ranges for each placeholder ID in [from, to]
// ---------------------------------------------------------------------------
function collectPlaceholderRanges(
  doc: any,
  markType: MarkType,
  touchedIds: Set<string>
): Map<string, Array<{ from: number; to: number }>> {
  const rangeMap = new Map<string, Array<{ from: number; to: number }>>()
  doc.nodesBetween(0, doc.content.size, (node: { marks: { type: MarkType; attrs: Record<string, string> }[] }, pos: number) => {
    const mark = node.marks.find((m: { type: MarkType }) => m.type === markType)
    if (!mark) return
    const id: string = mark.attrs.id
    if (!touchedIds.has(id)) return
    const ranges = rangeMap.get(id) ?? []
    ranges.push({ from: pos, to: pos + node.nodeSize })
    rangeMap.set(id, ranges)
  })
  return rangeMap
}

// ---------------------------------------------------------------------------
// Resolution plugin — removes placeholder mark when text inside is edited
// ---------------------------------------------------------------------------
function resolutionPlugin(markType: MarkType): Plugin {
  return new Plugin({
    appendTransaction(transactions: readonly Transaction[], _oldState: any, newState: any) {
      const docChanged = transactions.some((tr: Transaction) => tr.docChanged)
      if (!docChanged) return null

      // Collect IDs of placeholders touched by any transaction
      const touchedIds = new Set<string>()
      for (const tr of transactions) {
        if (!tr.docChanged) continue
        try {
          tr.mapping.maps.forEach((stepMap: any, i: number) => {
            const stepDoc = i === 0 ? tr.before : (tr as any).docs?.[i - 1] ?? tr.before
            stepMap.forEach((oldStart: number, oldEnd: number) => {
              const from = Math.min(oldStart, stepDoc.content.size)
              // Use oldStart+1 as minimum to handle pure insertions (oldStart === oldEnd)
              const to = Math.min(Math.max(oldEnd, oldStart + 1), stepDoc.content.size)
              if (from >= to) return
              stepDoc.nodesBetween(from, to, (node: any) => {
                const mark = node.marks?.find((m: any) => m.type === markType)
                if (mark) touchedIds.add(mark.attrs.id)
              })
            })
          })
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[PlaceholderMark] resolution plugin coordinate mismatch (partial resolution):', e)
          }
        }
      }

      if (touchedIds.size === 0) return null

      // Build remove transaction
      let tr: Transaction | null = null
      try {
        const rangeMap = collectPlaceholderRanges(newState.doc, markType, touchedIds)

        // Dev-only: warn on non-contiguous ranges for same ID
        if (process.env.NODE_ENV !== 'production') {
          for (const [id, ranges] of rangeMap) {
            if (ranges.length > 1) {
              console.warn(`[PlaceholderMark] Non-contiguous ranges for placeholder id=${id}:`, ranges)
            }
          }
        }

        const boldMark = newState.schema.marks['bold']
        const italicMark = newState.schema.marks['italic']

        for (const [, ranges] of rangeMap) {
          for (const { from, to } of ranges) {
            if (!tr) tr = newState.tr
            tr.removeMark(from, to, markType)
            if (boldMark) tr.removeMark(from, to, boldMark)
            if (italicMark) tr.removeMark(from, to, italicMark)
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[PlaceholderMark] resolution plugin remove-mark error (partial resolution):', e)
        }
        return null
      }

      return tr
    },
  })
}

// ---------------------------------------------------------------------------
// PlaceholderMark TipTap extension
// ---------------------------------------------------------------------------
export const PlaceholderMark = Mark.create({
  name: 'placeholder',

  spanning: true,
  inclusive: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-placeholder-id'),
        renderHTML: (attributes: { id: string }) => ({ 'data-placeholder-id': attributes.id }),
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-placeholder-label'),
        renderHTML: (attributes: { label: string }) => ({ 'data-placeholder-label': attributes.label }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-placeholder-id]' }]
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'bg-amber-100 text-amber-800 rounded px-0.5',
      }),
      0,
    ]
  },

  addProseMirrorPlugins() {
    return [resolutionPlugin(this.type)]
  },
})
