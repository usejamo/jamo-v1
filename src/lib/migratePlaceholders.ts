import { placeholderPatternToSpan } from './placeholderHtml'

export function migratePlaceholders(html: string): string {
  // Primary: [PLACEHOLDER: label] — the intended AI format
  // Secondary: [MULTI WORD ALL CAPS] — AI sometimes omits the PLACEHOLDER: prefix
  // Tertiary: [Title Case Fill-in] — the model also emits bare capitalised fill-ins
  //   like [Company Name] / [Name of CRO]. Constraints keep this conservative so it
  //   does NOT swallow acronyms or references:
  //     - must start with a capital letter (excludes [see below])
  //     - letters/spaces only, no digits (excludes [Table 1], [Phase 2])
  //     - at least two words (excludes single acronyms [US], [EU])
  return html
    .replace(
      /\[PLACEHOLDER:\s*([^\]]+)\]/g,
      (_, raw) => placeholderPatternToSpan(raw.trim(), crypto.randomUUID())
    )
    .replace(
      /\[([A-Z][A-Z0-9]*(?:\s+[A-Z][A-Z0-9]*){1,})\]/g,
      (_, raw) => placeholderPatternToSpan(raw.trim(), crypto.randomUUID())
    )
    .replace(
      /\[([A-Z][A-Za-z]*(?:\s+[A-Za-z]+){1,})\]/g,
      (_, raw) => placeholderPatternToSpan(raw.trim(), crypto.randomUUID())
    )
}
