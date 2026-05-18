import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Node as PMNode } from '@tiptap/pm/model'
import { CHANGE_TYPE_LABELS } from '../../../types/chat'
import type { PendingEdit, WorkspaceAction } from '../../../types/workspace'

// Registry of known ghost HTML strings — populated when buildDecorations materializes a ghost.
// ghostContentLeakDetected checks against this registry instead of raw substring search,
// which prevents false positives when proposed text naturally exists in the document.
const ghostRegistry = new Set<string>()

export function registerGhostContent(html: string): void {
  if (html) ghostRegistry.add(html)
}

export function unregisterGhostContent(html: string): void {
  ghostRegistry.delete(html)
}

export function ghostContentLeakDetected(editorHtml: string, _pending: PendingEdit[]): boolean {
  for (const ghost of ghostRegistry) {
    if (ghost && editorHtml.includes(ghost.slice(0, 40))) return true
  }
  return false
}

// For insert_after without paragraph_id: anchor to last paragraph in doc
function findLastParagraphPos(doc: PMNode): { pos: number; end: number } | null {
  let lastPos: { pos: number; end: number } | null = null
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      lastPos = { pos, end: pos + node.nodeSize }
    }
  })
  return lastPos
}

// Simple deterministic hash (djb2 variant — synchronous, no Web Crypto needed)
function computeAnchorHash(paragraphNode: PMNode, paragraphId: string): string {
  const normalizedText = (paragraphNode.textContent ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  // Use textContent as rawHtml approximation in node context
  const rawHtml = paragraphNode.textContent ?? ''
  const combined = normalizedText + '|' + paragraphId + '|' + rawHtml
  let h = 5381
  for (let i = 0; i < combined.length; i++) {
    h = ((h << 5) + h) ^ combined.charCodeAt(i)
  }
  return (h >>> 0).toString(16).slice(0, 8)
}

function buildGhostWidget(
  change: PendingEdit,
  dispatch: (action: WorkspaceAction) => void,
  sectionKey: string,
): HTMLElement {
  // Register ghost content in registry when widget is created
  if (change.after_html) registerGhostContent(change.after_html)

  const label = CHANGE_TYPE_LABELS[change.operation]

  const container = document.createElement('div')
  container.className =
    'pending-edit-ghost border border-dashed border-jamo-300 bg-jamo-50/40 rounded p-2 my-1'
  container.setAttribute('aria-label', label.aria)

  const badge = document.createElement('span')
  badge.className = 'text-[10px] font-normal tracking-wide uppercase'
  badge.textContent = label.badge
  container.appendChild(badge)

  // Proposed content preview — the user must see WHAT is being proposed.
  // DOMParser does not execute scripts, so this is XSS-safe even though
  // after_html is LLM-generated.
  if (change.after_html) {
    const preview = document.createElement('div')
    preview.className = 'text-sm text-gray-700 mt-1 whitespace-pre-wrap'
    const parsed = new DOMParser().parseFromString(change.after_html, 'text/html')
    preview.textContent = parsed.body.textContent ?? ''
    container.appendChild(preview)
  }

  const buttonRow = document.createElement('div')
  buttonRow.className = 'flex gap-2 mt-1 items-center'

  const acceptBtn = document.createElement('button')
  acceptBtn.className =
    'text-xs font-normal text-white bg-gray-900 hover:bg-gray-700 px-3 py-1 rounded-lg min-h-[44px]'
  acceptBtn.textContent = 'Accept'
  acceptBtn.setAttribute('aria-label', label.aria)
  acceptBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    dispatch({
      type: 'ACCEPT_PENDING_EDIT',
      payload: { section_key: sectionKey, paragraph_id: change.paragraph_id },
    })
  })

  const rejectBtn = document.createElement('button')
  rejectBtn.className =
    'text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100 min-h-[44px]'
  rejectBtn.textContent = 'Reject'
  rejectBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    dispatch({
      type: 'REJECT_PENDING_EDIT',
      payload: { section_key: sectionKey, paragraph_id: change.paragraph_id },
    })
  })

  buttonRow.appendChild(acceptBtn)
  buttonRow.appendChild(rejectBtn)
  container.appendChild(buttonRow)

  return container
}

export function buildDecorations(
  pending: PendingEdit[],
  doc: PMNode,
  dispatch: (action: WorkspaceAction) => void,
  sectionKey: string,
): DecorationSet {
  const decorations: Decoration[] = []

  for (const change of pending) {
    const { operation, paragraph_id } = change

    // For replace/delete: paragraph_id is required — skip gracefully if missing
    if (operation !== 'insert_after' && !paragraph_id) {
      continue
    }

    let anchorPos: number | null = null
    let anchorEnd: number | null = null

    if (paragraph_id) {
      // Find the paragraph node by its id attribute
      doc.descendants((node, pos) => {
        if (node.attrs?.id === paragraph_id) {
          anchorPos = pos
          anchorEnd = pos + node.nodeSize
          return false
        }
      })

      // Paragraph not found — skip gracefully
      if (anchorPos === null) {
        continue
      }
    } else {
      // insert_after without paragraph_id — anchor to last paragraph (append to end)
      const lastPara = findLastParagraphPos(doc)
      if (!lastPara) continue
      anchorPos = lastPara.pos
      anchorEnd = lastPara.end
    }

    // Detect if anchor paragraph is inside a table cell
    const $anchor = doc.resolve(anchorPos + 1)
    const isTableCell =
      $anchor.parent.type.name === 'tableCell' ||
      $anchor.parent.type.name === 'table_cell'

    // For replace/delete: add Decoration.inline for anchor range highlight
    if (operation === 'replace' || operation === 'delete') {
      const inlineFrom = anchorPos + 1 // inside paragraph open tag
      const inlineTo = anchorEnd! - 1  // before paragraph close tag

      if (inlineFrom < inlineTo) {
        const inlineClass = isTableCell
          ? 'pending-edit-source inline-replace'
          : operation === 'replace'
            ? 'pending-edit-source pending-edit-modify border-l-4 border-amber-400 bg-amber-50 opacity-75'
            : 'pending-edit-source pending-edit-delete border-l-4 border-red-400 bg-red-50 opacity-75'

        decorations.push(
          Decoration.inline(inlineFrom, inlineTo, { class: inlineClass })
        )
      }
    }

    // For table cell paragraphs: skip ghost widget (Pitfall 7)
    if (isTableCell) continue

    // Decoration.widget for accept/reject buttons (positioned after anchor paragraph)
    const widgetPos = anchorEnd!

    decorations.push(
      Decoration.widget(
        widgetPos,
        () => buildGhostWidget(change, dispatch, sectionKey),
        {
          side: 1,
          key: `ghost-${change.paragraph_id}-${change.change_index}`,
        }
      )
    )

    // Store computed anchor positions back on change for staleness checks
    // (runtime_only fields — not persisted)
    ;(change as PendingEdit).anchorFrom = anchorPos + 1
    ;(change as PendingEdit).anchorTo = anchorEnd! - 1
  }

  if (decorations.length === 0) return DecorationSet.empty

  return DecorationSet.create(doc, decorations)
}

// Re-export computeAnchorHash for use in staleness detection (PendingEditsPlugin)
export { computeAnchorHash }
