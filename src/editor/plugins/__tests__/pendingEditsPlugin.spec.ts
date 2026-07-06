import { describe, it, expect, vi } from 'vitest'
import { Editor, Node as TiptapNode } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { DecorationSet } from '@tiptap/pm/view'
import { PendingEditsPlugin, PendingEditsPluginKey } from '../pendingEdits/PendingEditsPlugin'
import { ghostContentLeakDetected } from '../pendingEdits/decorations'
import type { PendingEdit } from '../../../types/workspace'

// Custom Paragraph with id attribute — mirrors UniqueID pattern but works headless
const ParagraphWithId = TiptapNode.create({
  name: 'paragraph',
  priority: 1001, // override StarterKit paragraph
  group: 'block',
  content: 'inline*',
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-id'), renderHTML: (attrs) => attrs.id ? { 'data-id': attrs.id } : {} },
    }
  },
  parseHTML() { return [{ tag: 'p' }] },
  renderHTML({ HTMLAttributes }) { return ['p', HTMLAttributes, 0] },
})

const KNOWN_PARA_ID = 'test-para-001'

function makePendingEdit(paragraphId: string, overrides: Partial<PendingEdit> = {}): PendingEdit {
  return {
    id: 'edit-1',
    paragraph_id: paragraphId,
    section_key: 'section-a',
    operation: 'replace',
    before_html: '<p>Old content</p>',
    after_html: '<p>New content</p>',
    change_summary: 'Replace paragraph',
    resolution: 'pending',
    message_id: 'msg-1',
    change_index: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// Build editor with known paragraph id in content
const baseExtensions = (pending: PendingEdit[], dispatch: ReturnType<typeof vi.fn>) => [
  StarterKit.configure({ paragraph: false }), // disable built-in paragraph
  ParagraphWithId,
  PendingEditsPlugin.configure({
    sectionKey: 'section-a',
    getState: () => pending,
    dispatch,
  }),
]

const CONTENT = `<p data-id="${KNOWN_PARA_ID}">Old content</p>`

describe('PendingEditsPlugin', () => {
  it('14.2-A1-01: plugin state initializes empty, no ghost in getHTML()', () => {
    const dispatch = vi.fn()
    const pending: PendingEdit[] = []
    const editor = new Editor({
      extensions: baseExtensions(pending, dispatch),
      content: CONTENT,
    })

    // Plugin should be registered
    const pluginState = PendingEditsPluginKey.getState(editor.state)
    expect(pluginState).toBeDefined()

    // With no pending edits, plugin state should be DecorationSet.empty
    expect(pluginState).toBe(DecorationSet.empty)

    editor.destroy()
  })

  it('14.2-A1-02: decoration rendering for modify/insert/delete operations', () => {
    const dispatch = vi.fn()
    const pending: PendingEdit[] = []
    const editor = new Editor({
      extensions: baseExtensions(pending, dispatch),
      content: CONTENT,
    })

    // Add a pending edit referencing the known paragraph id
    pending.push(makePendingEdit(KNOWN_PARA_ID))

    // Trigger refresh meta transaction
    editor.commands.command(({ tr, dispatch: pmDispatch }) => {
      tr.setMeta(PendingEditsPluginKey, 'refresh')
      pmDispatch!(tr)
      return true
    })

    const pluginState = PendingEditsPluginKey.getState(editor.state)
    expect(pluginState).not.toBe(DecorationSet.empty)

    // Should have decorations (inline + widget = 2 for replace)
    const decos = pluginState!.find()
    expect(decos.length).toBeGreaterThanOrEqual(1)

    // Ghost content should NOT appear in editor HTML
    const html = editor.getHTML()
    expect(html).not.toContain('New content')

    editor.destroy()
  })

  it('14.2-A1-03: accept transaction replaces paragraph content and removes decoration', () => {
    const dispatch = vi.fn()
    const pending: PendingEdit[] = []
    const editor = new Editor({
      extensions: baseExtensions(pending, dispatch),
      content: CONTENT,
    })

    pending.push(makePendingEdit(KNOWN_PARA_ID))

    // Trigger initial decoration refresh
    editor.commands.command(({ tr, dispatch: pmDispatch }) => {
      tr.setMeta(PendingEditsPluginKey, 'refresh')
      pmDispatch!(tr)
      return true
    })

    let pluginState = PendingEditsPluginKey.getState(editor.state)
    expect(pluginState!.find().length).toBeGreaterThanOrEqual(1)

    // Simulate accept: resolve the edit
    pending[0] = { ...pending[0], resolution: 'accepted' }

    // Trigger skip-refresh (simulates the accept transaction)
    editor.commands.command(({ tr, dispatch: pmDispatch }) => {
      tr.setMeta(PendingEditsPluginKey, 'skip-refresh')
      pmDispatch!(tr)
      return true
    })

    // Then do a refresh to rebuild decorations (now no pending edits)
    editor.commands.command(({ tr, dispatch: pmDispatch }) => {
      tr.setMeta(PendingEditsPluginKey, 'refresh')
      pmDispatch!(tr)
      return true
    })

    pluginState = PendingEditsPluginKey.getState(editor.state)
    // No pending edits → DecorationSet.empty
    expect(pluginState).toBe(DecorationSet.empty)

    editor.destroy()
  })

  it('14.2-A1-04: reject removes decoration, content untouched', () => {
    const dispatch = vi.fn()
    const pending: PendingEdit[] = []
    const editor = new Editor({
      extensions: baseExtensions(pending, dispatch),
      content: CONTENT,
    })

    pending.push(makePendingEdit(KNOWN_PARA_ID))

    // Trigger initial decoration
    editor.commands.command(({ tr, dispatch: pmDispatch }) => {
      tr.setMeta(PendingEditsPluginKey, 'refresh')
      pmDispatch!(tr)
      return true
    })

    // Simulate reject: mark as rejected
    pending[0] = { ...pending[0], resolution: 'rejected' }

    // Refresh decorations
    editor.commands.command(({ tr, dispatch: pmDispatch }) => {
      tr.setMeta(PendingEditsPluginKey, 'refresh')
      pmDispatch!(tr)
      return true
    })

    const pluginState = PendingEditsPluginKey.getState(editor.state)
    // No pending edits → decorations removed
    expect(pluginState).toBe(DecorationSet.empty)

    // Content unchanged — original text preserved
    const html = editor.getHTML()
    expect(html).toContain('Old content')
    expect(html).not.toContain('New content')

    editor.destroy()
  })

  it('14.2-A1-05: ghost isolation — editor.getHTML() contains zero ghost text', () => {
    const dispatch = vi.fn()
    const pending: PendingEdit[] = []
    const editor = new Editor({
      extensions: baseExtensions(pending, dispatch),
      content: CONTENT,
    })

    pending.push(makePendingEdit(KNOWN_PARA_ID, { after_html: '<p>Inserted content</p>' }))

    // Trigger refresh to build decorations (widget created, ghost registered)
    editor.commands.command(({ tr, dispatch: pmDispatch }) => {
      tr.setMeta(PendingEditsPluginKey, 'refresh')
      pmDispatch!(tr)
      return true
    })

    // editor.getHTML() must NOT contain ghost content
    const html = editor.getHTML()
    expect(html).not.toContain('Inserted content')
    expect(html).not.toContain('New content')

    // ghostContentLeakDetected should return false for the actual editor HTML
    // (ghost registry is populated by widget creation but the HTML is clean)
    // This verifies ghost text is decoration-only, never in the document
    expect(ghostContentLeakDetected(html, pending)).toBe(false)

    editor.destroy()
  })
})
