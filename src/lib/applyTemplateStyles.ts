import JSZip from 'jszip'

const FILES_TO_SWAP = [
  'word/styles.xml',
  'word/theme/theme1.xml',
  'word/numbering.xml',
] as const

/**
 * Post-processes a generated DOCX blob by replacing its styles, theme, and
 * numbering XML with equivalents from the org's uploaded template DOCX.
 *
 * D-03: Any failure returns the original generated blob unchanged — this
 * function must NEVER cause the export to fail.
 */
export async function applyTemplateStyles(
  generated: Blob,
  template: Blob
): Promise<Blob> {
  try {
    const [genZip, tplZip] = await Promise.all([
      JSZip.loadAsync(generated),
      JSZip.loadAsync(template),
    ])

    // D-03 guard: if template has no styles.xml, there is nothing to swap
    if (!tplZip.file('word/styles.xml')) {
      return generated
    }

    for (const path of FILES_TO_SWAP) {
      const tplFile = tplZip.file(path)
      if (!tplFile) continue  // numbering.xml is optional — skip gracefully (Pitfall 1)
      const content = await tplFile.async('uint8array')
      genZip.file(path, content)
    }

    return await genZip.generateAsync({ type: 'blob' })
  } catch (err) {
    console.error('[applyTemplateStyles] failed, returning original:', err)
    return generated  // D-03: never fail the export
  }
}
