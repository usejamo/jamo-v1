// Phase 11.1 Plan 04 — inspectDocxStyles tests
// D-05: inspectDocxStyles returns { found: string[], missing: string[] }
// D-06: returns null for malformed ZIP

import JSZip from 'https://esm.sh/jszip@3.10.1'
import { inspectDocxStyles } from './index.ts'

Deno.test({
  name: 'inspectDocxStyles returns correct found/missing arrays for a valid DOCX',
  ignore: false,
  fn: async () => {
    // Build a minimal DOCX ZIP with styles.xml containing Normal and Heading 1 only
    const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:styleId="Heading1"><w:name w:val="Heading 1"/></w:style>
</w:styles>`
    const zip = new JSZip()
    zip.file('word/styles.xml', stylesXml)
    const blob = await zip.generateAsync({ type: 'blob' })
    const buffer = await blob.arrayBuffer()

    const result = await inspectDocxStyles(buffer)
    if (!result) throw new Error('Expected non-null result')
    if (!result.found.includes('Normal')) throw new Error(`Expected Normal in found, got: ${JSON.stringify(result.found)}`)
    if (!result.found.includes('Heading 1')) throw new Error(`Expected Heading 1 in found, got: ${JSON.stringify(result.found)}`)
    if (!result.missing.includes('Heading 2')) throw new Error(`Expected Heading 2 in missing, got: ${JSON.stringify(result.missing)}`)
    if (!result.missing.includes('Heading 3')) throw new Error(`Expected Heading 3 in missing, got: ${JSON.stringify(result.missing)}`)
  },
})

Deno.test({
  name: 'inspectDocxStyles returns null for a malformed/non-ZIP buffer',
  ignore: false,
  fn: async () => {
    const buffer = new TextEncoder().encode('not a zip at all').buffer
    const result = await inspectDocxStyles(buffer)
    if (result !== null) throw new Error(`Expected null, got: ${JSON.stringify(result)}`)
  },
})
