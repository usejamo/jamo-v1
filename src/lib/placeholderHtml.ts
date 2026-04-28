import { escapeHtml } from './escapeHtml'

export function placeholderPatternToSpan(label: string, id: string): string {
  const escaped = escapeHtml(label.trim())
  return `<span data-placeholder-id="${id}" data-placeholder-label="${escaped}">${escaped}</span>`
}
