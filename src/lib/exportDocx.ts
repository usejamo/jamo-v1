import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  Table,
} from 'docx'
import { htmlToDocxChildren, scanForPlaceholders } from './htmlToDocx'

export interface ExportSection {
  name: string | null
  content: string
  section_key: string
}

export interface PlaceholderItem {
  id: string
  label: string
  sectionName: string
  section_key: string
}

export class ExportBlockedError extends Error {
  placeholders: PlaceholderItem[]
  constructor(placeholders: PlaceholderItem[]) {
    super('Export blocked: unresolved placeholders')
    this.name = 'ExportBlockedError'
    this.placeholders = placeholders
  }
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'proposal-export'
  )
}

export async function exportDocx(opts: {
  sections: ExportSection[]
  proposalTitle: string
  force?: boolean
}): Promise<void> {
  const { sections, proposalTitle, force = false } = opts

  // Scan all sections for placeholders
  const allPlaceholders: PlaceholderItem[] = sections.flatMap(s =>
    scanForPlaceholders(s.content, s.name ?? s.section_key, s.section_key)
  )

  if (allPlaceholders.length > 0 && !force) {
    throw new ExportBlockedError(allPlaceholders)
  }

  // Build document children
  const docChildren: (Paragraph | Table)[] = []

  // Force-export cover section listing unresolved placeholders
  if (force && allPlaceholders.length > 0) {
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: 'Unresolved Placeholders' })],
      })
    )
    const grouped = allPlaceholders.reduce<Record<string, string[]>>((acc, p) => {
      ;(acc[p.sectionName] ??= []).push(p.label)
      return acc
    }, {})
    Object.entries(grouped).forEach(([section, labels]) => {
      labels.forEach(label => {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: `⚠ ${section}: ${label}`, bold: true })],
          })
        )
      })
    })
  }

  // Render each section
  for (const section of sections) {
    if (!section.content) continue
    const sectionTitle = section.name ?? section.section_key
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: sectionTitle })],
      })
    )
    const children = htmlToDocxChildren(section.content, force)
    docChildren.push(...children)
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 24 }, // 12pt = 24 half-points
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'bullet-list',
          levels: [
            {
              level: 0,
              format: 'bullet',
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: 'number-list',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children: docChildren }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(proposalTitle)}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
