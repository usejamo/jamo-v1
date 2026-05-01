import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { applyTemplateStyles } from './applyTemplateStyles'

async function buildMinimalDocx(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content)
  }
  return zip.generateAsync({ type: 'blob' })
}

describe('applyTemplateStyles', () => {
  it('returns a Blob with styles.xml, theme1.xml, and numbering.xml swapped from template', async () => {
    const generated = await buildMinimalDocx({
      'word/styles.xml': '<styles>generated</styles>',
      'word/theme/theme1.xml': '<theme>generated</theme>',
      'word/numbering.xml': '<numbering>generated</numbering>',
      '[Content_Types].xml': '<Types/>',
    })
    const template = await buildMinimalDocx({
      'word/styles.xml': '<styles>template</styles>',
      'word/theme/theme1.xml': '<theme>template</theme>',
      'word/numbering.xml': '<numbering>template</numbering>',
    })
    const result = await applyTemplateStyles(generated, template)
    const zip = await JSZip.loadAsync(result)
    const stylesXml = await zip.file('word/styles.xml')!.async('text')
    expect(stylesXml).toBe('<styles>template</styles>')
    const themeXml = await zip.file('word/theme/theme1.xml')!.async('text')
    expect(themeXml).toBe('<theme>template</theme>')
    const numXml = await zip.file('word/numbering.xml')!.async('text')
    expect(numXml).toBe('<numbering>template</numbering>')
  })

  it('returns the original Blob when template has no word/styles.xml', async () => {
    const generated = await buildMinimalDocx({ 'word/styles.xml': '<styles>generated</styles>' })
    const template = await buildMinimalDocx({ 'word/document.xml': '<document/>' })
    const result = await applyTemplateStyles(generated, template)
    // Result should be the original generated Blob (same content)
    const genZip = await JSZip.loadAsync(generated)
    const resZip = await JSZip.loadAsync(result)
    const genStyles = await genZip.file('word/styles.xml')!.async('text')
    const resStyles = await resZip.file('word/styles.xml')!.async('text')
    expect(resStyles).toBe(genStyles)
  })

  it('skips numbering.xml gracefully and returns styled Blob when template has styles.xml and theme1.xml but no numbering.xml', async () => {
    const generated = await buildMinimalDocx({
      'word/styles.xml': '<styles>generated</styles>',
      'word/numbering.xml': '<numbering>generated</numbering>',
    })
    const template = await buildMinimalDocx({
      'word/styles.xml': '<styles>template</styles>',
      'word/theme/theme1.xml': '<theme>template</theme>',
    })
    const result = await applyTemplateStyles(generated, template)
    const zip = await JSZip.loadAsync(result)
    const stylesXml = await zip.file('word/styles.xml')!.async('text')
    expect(stylesXml).toBe('<styles>template</styles>')
    // numbering.xml should remain from generated (not null-overwritten)
    const numXml = await zip.file('word/numbering.xml')!.async('text')
    expect(numXml).toBe('<numbering>generated</numbering>')
  })

  it('catches all exceptions and returns the original Blob when template is not a valid ZIP', async () => {
    const generated = await buildMinimalDocx({ 'word/styles.xml': '<styles>generated</styles>' })
    const notAZip = new Blob(['not a zip at all'], { type: 'application/octet-stream' })
    const result = await applyTemplateStyles(generated, notAZip)
    // Should not throw; result should be the original generated Blob
    const zip = await JSZip.loadAsync(result)
    const stylesXml = await zip.file('word/styles.xml')!.async('text')
    expect(stylesXml).toBe('<styles>generated</styles>')
  })
})
