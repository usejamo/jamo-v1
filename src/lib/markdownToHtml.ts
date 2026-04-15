import { marked } from 'marked'

/**
 * Convert content to HTML for display in TipTap or preview panels.
 *
 * Handles:
 * - Plain Markdown from AI generation
 * - HTML-wrapped Markdown like <p>## heading</p> from autosave over raw Markdown
 * - Mixed content with semantic HTML AND raw Markdown patterns
 * - AI output wrapped in ```html code fences (stripped first)
 * - Proper TipTap HTML with no Markdown residue — passed through unchanged
 */
export function markdownToHtml(content: string): string {
  if (!content) return ''

  // Strip markdown code fences (AI sometimes wraps output in ```html ... ```)
  const unfenced = content.replace(/```(?:html)?\s*([\s\S]*?)```/g, '$1').trim()
  if (!unfenced) return content

  // If no Markdown patterns remain, return as-is (already proper HTML)
  const hasMarkdown = /\*\*|\*[^*\s]|#{1,6}\s|\|[-: ]+\|/.test(unfenced)
  if (!hasMarkdown) return unfenced

  // Preserve paragraph/line breaks before stripping tags, then re-parse as Markdown
  const stripped = unfenced
    .replace(/<\/(p|h[1-6]|div|li|tr|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()

  if (!stripped) return unfenced
  return marked.parse(stripped) as string
}
