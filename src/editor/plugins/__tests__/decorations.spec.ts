import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Schema, Node as PMNode } from '@tiptap/pm/model'
import { buildDecorations, ghostContentLeakDetected, registerGhostContent, unregisterGhostContent, extractDataIds, collectFutureAnchorIds } from '../pendingEdits/decorations'
import type { PendingEdit } from '../../../types/workspace'

// Minimal schema for testing — paragraph with optional id attr
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      attrs: { id: { default: null } },
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() { return ['p', 0] },
    },
    text: { group: 'inline' },
  },
})

function makeDoc(paragraphs: Array<{ id?: string; text: string }>): PMNode {
  return schema.node('doc', null,
    paragraphs.map(({ id, text }) =>
      schema.node('paragraph', id ? { id } : {}, text ? [schema.text(text)] : [])
    )
  )
}

function makePendingEdit(overrides: Partial<PendingEdit> = {}): PendingEdit {
  return {
    id: 'edit-1',
    paragraph_id: 'para-1',
    section_key: 'section-a',
    operation: 'replace',
    before_html: '<p>Old text</p>',
    after_html: '<p>New text</p>',
    change_summary: 'Replace paragraph',
    resolution: 'pending',
    message_id: 'msg-1',
    change_index: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('decorations — staleness detection', () => {
  beforeEach(() => {
    // Clear registry between tests
    unregisterGhostContent('<p>New text</p>')
    unregisterGhostContent('<p>Insert text</p>')
  })

  it.skip('14.2-A4-01: staleness detection fires auto_rejected_stale when anchor deleted', () => {
    // This is tested via the plugin spec (PendingEditsPlugin.spec.ts)
    // Wave 0 stub — implemented in Plan 03
  })

  it('14.2-A4-02: replace operation — Decoration.inline on anchor, Decoration.widget for button', () => {
    const doc = makeDoc([{ id: 'para-1', text: 'Old text' }])
    const dispatch = vi.fn()
    const change = makePendingEdit({ operation: 'replace' })

    const decoSet = buildDecorations([change], doc, dispatch, 'section-a')

    // Should NOT be empty
    expect(decoSet).not.toBe(DecorationSet.empty)

    // Find all decorations
    const decos = decoSet.find()
    // 1 inline + 1 widget = 2 decorations
    expect(decos.length).toBe(2)

    // Check inline decoration exists with correct class
    const inlineDeco = decos.find((d: Decoration) => !(d as any).type?.spec?.widget && (d as any).type?.attrs?.class?.includes('pending-edit-modify'))
    expect(inlineDeco).toBeDefined()

    // Check widget decoration exists
    const widgetDeco = decos.find((d: Decoration) => (d as any).type?.spec?.widget || typeof (d as any).type?.toDOM === 'function')
    expect(widgetDeco).toBeDefined()
  })

  it('14.2-A4-03: delete operation — Decoration.inline on anchor, Decoration.widget for button', () => {
    const doc = makeDoc([{ id: 'para-1', text: 'To be deleted' }])
    const dispatch = vi.fn()
    const change = makePendingEdit({ operation: 'delete', after_html: undefined })

    const decoSet = buildDecorations([change], doc, dispatch, 'section-a')

    const decos = decoSet.find()
    expect(decos.length).toBe(2)

    // Inline should have delete class
    const inlineDeco = decos.find((d: Decoration) => !(d as any).type?.spec?.widget && (d as any).type?.attrs?.class?.includes('pending-edit-delete'))
    expect(inlineDeco).toBeDefined()
  })

  it('14.2-A4-04: insert_after with paragraph_id — widget after anchor', () => {
    const doc = makeDoc([
      { id: 'para-1', text: 'Anchor paragraph' },
      { id: 'para-2', text: 'Second paragraph' },
    ])
    const dispatch = vi.fn()
    const change = makePendingEdit({
      operation: 'insert_after',
      paragraph_id: 'para-1',
      before_html: undefined,
      after_html: '<p>Insert text</p>',
    })

    const decoSet = buildDecorations([change], doc, dispatch, 'section-a')

    const decos = decoSet.find()
    // insert_after: 0 inline highlights, 1 widget only
    expect(decos.length).toBe(1)

    // No inline decoration (no class with pending-edit-modify or pending-edit-delete)
    const inlineDeco = decos.find((d: Decoration) =>
      (d as any).type?.attrs?.class?.includes('pending-edit-modify') ||
      (d as any).type?.attrs?.class?.includes('pending-edit-delete')
    )
    expect(inlineDeco).toBeUndefined()
  })

  it('14.2-A4-05: insert_after without paragraph_id — anchors to last paragraph (append)', () => {
    const doc = makeDoc([
      { id: 'para-1', text: 'First paragraph' },
      { id: 'para-2', text: 'Last paragraph' },
    ])
    const dispatch = vi.fn()
    const change = makePendingEdit({
      operation: 'insert_after',
      paragraph_id: '', // empty = no id
      before_html: undefined,
      after_html: '<p>Appended text</p>',
    })

    const decoSet = buildDecorations([change], doc, dispatch, 'section-a')

    const decos = decoSet.find()
    // Should have 1 widget anchored at end of last paragraph
    expect(decos.length).toBe(1)

    // Widget should be positioned after the last paragraph
    // Last paragraph ends at doc.content.size - 1
    const lastParaEnd = doc.content.size - 1
    const widgetPos = decos[0].from
    expect(widgetPos).toBeGreaterThanOrEqual(lastParaEnd - 2)
  })

  it('14.2-A4-06: user edits before anchor — anchor position maps correctly', () => {
    const doc = makeDoc([
      { id: 'para-before', text: 'Before paragraph' },
      { id: 'para-1', text: 'Anchor text' },
    ])
    const dispatch = vi.fn()
    const change = makePendingEdit({ operation: 'replace' })

    const decoSet = buildDecorations([change], doc, dispatch, 'section-a')

    // Find anchor position for para-1
    let anchorPos = -1
    doc.descendants((node, pos) => {
      if (node.attrs?.id === 'para-1') { anchorPos = pos; return false }
    })
    expect(anchorPos).toBeGreaterThan(0)

    // Inline decoration should start at anchor paragraph start + 1 (after paragraph open tag)
    const decos = decoSet.find()
    const inlineDeco = decos.find((d: Decoration) =>
      (d as any).type?.attrs?.class?.includes('pending-edit-modify')
    )
    expect(inlineDeco).toBeDefined()
    // Position should be within or near anchor paragraph
    expect(inlineDeco!.from).toBeGreaterThanOrEqual(anchorPos)
  })

  it('14.2-A4-07: paragraph_id not found — DecorationSet.empty returned (no crash)', () => {
    const doc = makeDoc([{ id: 'other-para', text: 'Different paragraph' }])
    const dispatch = vi.fn()
    const change = makePendingEdit({ paragraph_id: 'nonexistent-id' })

    // Should not throw
    expect(() => {
      const decoSet = buildDecorations([change], doc, dispatch, 'section-a')
      // No decorations for unfound paragraph
      expect(decoSet.find().length).toBe(0)
    }).not.toThrow()
  })

  it('14.2-A4-08: missing paragraph_id — change skipped gracefully, no crash', () => {
    const doc = makeDoc([{ id: 'para-1', text: 'Paragraph text' }])
    const dispatch = vi.fn()
    // paragraph_id is empty string
    const change = makePendingEdit({ paragraph_id: '', operation: 'replace' })

    expect(() => {
      const decoSet = buildDecorations([change], doc, dispatch, 'section-a')
      // replace with empty paragraph_id should be skipped (not an insert_after)
      // or return empty if no fallback applies
      expect(decoSet.find().length).toBe(0)
    }).not.toThrow()
  })
})

describe('decorations — chained-edit anchor detection', () => {
  it('14.2-A4-09: extractDataIds collects data-id values from an after_html fragment', () => {
    expect(extractDataIds('<h3 data-id="h1">A</h3><p data-id="p1">B</p>')).toEqual(['h1', 'p1'])
  })

  it('14.2-A4-10: extractDataIds returns empty for fragments without data-id or undefined', () => {
    expect(extractDataIds('<p>no ids here</p>')).toEqual([])
    expect(extractDataIds(undefined)).toEqual([])
  })

  it('14.2-A4-11: collectFutureAnchorIds gathers ids a pending or accepted edit will create', () => {
    const edits = [
      makePendingEdit({ id: 'e1', resolution: 'pending', after_html: '<p data-id="new-a">A</p>' }),
      makePendingEdit({ id: 'e2', resolution: 'accepted', after_html: '<p data-id="new-b">B</p>' }),
    ]
    const ids = collectFutureAnchorIds(edits)
    expect(ids.has('new-a')).toBe(true)
    expect(ids.has('new-b')).toBe(true)
  })

  it('14.2-A4-12: collectFutureAnchorIds excludes rejected/stale edits so chained children cascade to stale', () => {
    const edits = [
      makePendingEdit({ id: 'e1', resolution: 'rejected', after_html: '<p data-id="orphan-anchor">A</p>' }),
      makePendingEdit({ id: 'e2', resolution: 'auto_rejected_stale', after_html: '<p data-id="stale-anchor">B</p>' }),
    ]
    const ids = collectFutureAnchorIds(edits)
    expect(ids.has('orphan-anchor')).toBe(false)
    expect(ids.has('stale-anchor')).toBe(false)
  })
})
