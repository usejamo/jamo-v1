import { placeholderPatternToSpan } from './placeholderHtml'

export function migratePlaceholders(html: string): string {
  return html.replace(
    /\[PLACEHOLDER:\s*([^\]]+)\]/g,
    (_, raw) => placeholderPatternToSpan(raw, crypto.randomUUID())
  )
}
