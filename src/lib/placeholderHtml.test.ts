import { describe, it, expect } from 'vitest'
import { placeholderPatternToSpan } from './placeholderHtml'
import { migratePlaceholders } from './migratePlaceholders'
import { escapeHtml } from './escapeHtml'

// ---------------------------------------------------------------------------
// escapeHtml unit tests
// ---------------------------------------------------------------------------
describe('escapeHtml', () => {
  it('escapes & to &amp;', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })
  it('escapes < and >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })
  it('escapes " to &quot;', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;')
  })
  it('is a no-op for plain text', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })
})

// ---------------------------------------------------------------------------
// placeholderPatternToSpan unit tests
// ---------------------------------------------------------------------------
describe('placeholderPatternToSpan', () => {
  it('produces a span with data-placeholder-id and data-placeholder-label', () => {
    const id = 'test-uuid-001'
    const result = placeholderPatternToSpan('budget figure', id)
    expect(result).toBe(
      `<span data-placeholder-id="test-uuid-001" data-placeholder-label="budget figure">budget figure</span>`
    )
  })

  it('trims whitespace from label before embedding', () => {
    const result = placeholderPatternToSpan('  sponsor name  ', 'id-002')
    expect(result).toContain('data-placeholder-label="sponsor name"')
    expect(result).toContain('>sponsor name<')
  })

  it('escapes HTML in label to prevent attribute injection', () => {
    const result = placeholderPatternToSpan('budget <amount> & "fees"', 'id-003')
    expect(result).toContain('data-placeholder-label="budget &lt;amount&gt; &amp; &quot;fees&quot;"')
  })
})

// ---------------------------------------------------------------------------
// migratePlaceholders unit tests
// ---------------------------------------------------------------------------
describe('migratePlaceholders', () => {
  it('converts [PLACEHOLDER: label] to a span with a UUID', () => {
    const input = '<p>[PLACEHOLDER: sponsor name]</p>'
    const output = migratePlaceholders(input)
    expect(output).not.toContain('[PLACEHOLDER:')
    expect(output).toContain('data-placeholder-id="')
    expect(output).toContain('data-placeholder-label="sponsor name"')
    expect(output).toContain('>sponsor name<')
  })

  it('is a no-op for content with no [PLACEHOLDER: ...] patterns', () => {
    const input = '<p>This is normal content.</p>'
    expect(migratePlaceholders(input)).toBe(input)
  })

  it('converts multiple placeholders to distinct UUIDs', () => {
    const input = '<p>[PLACEHOLDER: sponsor name] and [PLACEHOLDER: budget figure]</p>'
    const output = migratePlaceholders(input)
    // Extract all data-placeholder-id values
    const ids = [...output.matchAll(/data-placeholder-id="([^"]+)"/g)].map(m => m[1])
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('does not treat [PLACEHOLDER: ...] as a markdown link', () => {
    // Guard: migratePlaceholders works on raw HTML strings, not markdown.
    // The [PLACEHOLDER: ...] pattern must NOT pass through markdownToHtml unchanged.
    // This test confirms the pattern is consumed (converted to span) before any markdown pass.
    const input = 'Some text [PLACEHOLDER: site count] more text'
    const output = migratePlaceholders(input)
    expect(output).not.toContain('[PLACEHOLDER:')
    expect(output).toContain('data-placeholder-id=')
  })
})

// ---------------------------------------------------------------------------
// UUID roundtrip stability — §9.1 integration test
// ---------------------------------------------------------------------------
// Validates the HTML string contract: the span produced by placeholderPatternToSpan
// matches TipTap's parseHTML selector `span[data-placeholder-id]` and preserves the
// exact UUID in the data-placeholder-id attribute (no regeneration on re-parse).
describe('UUID roundtrip stability (HTML contract)', () => {
  it('span produced by placeholderPatternToSpan matches parseHTML selector span[data-placeholder-id]', () => {
    const id = 'roundtrip-uuid-abc123'
    const label = 'budget figure'
    const span = placeholderPatternToSpan(label, id)

    // The span must have data-placeholder-id attribute (matches TipTap parseHTML selector)
    expect(span).toContain(`data-placeholder-id="${id}"`)
    // The span must have data-placeholder-label attribute (TipTap attr source)
    expect(span).toContain(`data-placeholder-label="${label}"`)
    // The UUID in the span is the exact one we passed — not regenerated
    const idMatch = span.match(/data-placeholder-id="([^"]+)"/)
    expect(idMatch?.[1]).toBe(id)
  })

  it('migratePlaceholders assigns UUID once; calling again on output is a no-op (idempotency)', () => {
    const input = '<p>[PLACEHOLDER: sponsor name]</p>'
    const firstPass = migratePlaceholders(input)
    const secondPass = migratePlaceholders(firstPass)

    // Second pass must produce identical output (no new UUIDs generated)
    expect(secondPass).toBe(firstPass)

    // The UUID from first pass is preserved in second pass
    const idFromFirst = firstPass.match(/data-placeholder-id="([^"]+)"/)?.[1]
    const idFromSecond = secondPass.match(/data-placeholder-id="([^"]+)"/)?.[1]
    expect(idFromFirst).toBe(idFromSecond)
  })

  it('span tag format is exactly what TipTap parseHTML selector expects: span[data-placeholder-id]', () => {
    // Verify tag name is span (not div, mark, etc.) — critical for TipTap selector match
    const span = placeholderPatternToSpan('test label', 'uuid-check-001')
    expect(span.startsWith('<span ')).toBe(true)
    expect(span.endsWith('</span>')).toBe(true)
    // data-placeholder-id must be a direct attribute on the span element
    expect(span).toMatch(/^<span[^>]+data-placeholder-id="uuid-check-001"/)
  })
})
