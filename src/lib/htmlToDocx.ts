import {
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
} from 'docx'

export interface PlaceholderSentinel {
  __type: 'placeholder'
  id: string
  label: string
}

export type DocxChild = Paragraph | Table

/**
 * Scans raw HTML for unresolved placeholder spans.
 * Returns array of { id, label, sectionName } for each [data-placeholder-id] found.
 */
export function scanForPlaceholders(
  html: string,
  sectionName: string
): Array<{ id: string; label: string; sectionName: string }> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const spans = doc.querySelectorAll('[data-placeholder-id]')
  return Array.from(spans).map(el => ({
    id: el.getAttribute('data-placeholder-id') ?? '',
    label: el.getAttribute('data-placeholder-label') ?? '(unknown)',
    sectionName,
  }))
}

/**
 * Converts a TipTap HTML string to an array of docx Paragraph/Table children.
 * @param force - if true, placeholders render as yellow-highlight TextRuns;
 *                if false, placeholders are skipped (caller must pre-scan and block)
 */
export function htmlToDocxChildren(html: string, force = false): DocxChild[] {
  if (!html || html.trim() === '') return [new Paragraph({ children: [] })]

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const results: DocxChild[] = []

  function inlineRuns(el: Element): TextRun[] {
    const runs: TextRun[] = []
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        if (text) runs.push(new TextRun({ text }))
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node as Element
        const tag = child.tagName.toLowerCase()
        if (child.hasAttribute('data-placeholder-id')) {
          if (force) {
            const label = child.getAttribute('data-placeholder-label') ?? '(unknown)'
            runs.push(new TextRun({ text: `⚠ MISSING: ${label}`, highlight: 'yellow', bold: true }))
          }
          // blocked mode: skip — caller already showed modal
        } else if (tag === 'strong' || tag === 'b') {
          child.childNodes.forEach(n => {
            if (n.nodeType === Node.TEXT_NODE && n.textContent)
              runs.push(new TextRun({ text: n.textContent, bold: true }))
          })
        } else if (tag === 'em' || tag === 'i') {
          child.childNodes.forEach(n => {
            if (n.nodeType === Node.TEXT_NODE && n.textContent)
              runs.push(new TextRun({ text: n.textContent, italics: true }))
          })
        } else if (tag === 'br') {
          runs.push(new TextRun({ break: 1 }))
        } else {
          const inner = inlineRuns(child)
          runs.push(...inner)
        }
      }
    })
    return runs
  }

  function walkNode(node: Element) {
    const tag = node.tagName.toLowerCase()
    if (tag === 'h1') {
      results.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: inlineRuns(node) }))
    } else if (tag === 'h2') {
      results.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: inlineRuns(node) }))
    } else if (tag === 'h3') {
      results.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: inlineRuns(node) }))
    } else if (tag === 'p') {
      results.push(new Paragraph({ children: inlineRuns(node) }))
    } else if (tag === 'ul') {
      node.querySelectorAll('li').forEach(li => {
        results.push(new Paragraph({
          numbering: { reference: 'bullet-list', level: 0 },
          children: inlineRuns(li),
        }))
      })
    } else if (tag === 'ol') {
      node.querySelectorAll('li').forEach(li => {
        results.push(new Paragraph({
          numbering: { reference: 'number-list', level: 0 },
          children: inlineRuns(li),
        }))
      })
    } else if (tag === 'table') {
      // zero-row guard — new Table({ rows: [] }) crashes docx (GitHub issue #856)
      const trEls = node.querySelectorAll('tr')
      if (trEls.length === 0) {
        results.push(new Paragraph({ children: [] }))
        return
      }
      const rows = Array.from(trEls).map(tr => {
        const cells = Array.from(tr.querySelectorAll('td, th')).map(td =>
          new TableCell({ children: [new Paragraph({ children: inlineRuns(td) })] })
        )
        return new TableRow({ children: cells })
      })
      results.push(new Table({ rows }))
    } else {
      // div, section, article, etc — recurse into children
      node.childNodes.forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) walkNode(child as Element)
      })
    }
  }

  doc.body.childNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) walkNode(node as Element)
  })

  return results.length > 0 ? results : [new Paragraph({ children: [] })]
}
