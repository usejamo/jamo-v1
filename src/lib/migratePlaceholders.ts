import { placeholderPatternToSpan } from './placeholderHtml'

export function migratePlaceholders(html: string): string {
  // Primary: [PLACEHOLDER: label] — the intended AI format
  // Secondary: [MULTI WORD ALL CAPS] — AI sometimes omits the PLACEHOLDER: prefix
  return html
    .replace(
      /\[PLACEHOLDER:\s*([^\]]+)\]/g,
      (_, raw) => placeholderPatternToSpan(raw.trim(), crypto.randomUUID())
    )
    .replace(
      /\[([A-Z][A-Z0-9]*(?:\s+[A-Z][A-Z0-9]*){1,})\]/g,
      (_, raw) => placeholderPatternToSpan(raw.trim(), crypto.randomUUID())
    )
}
