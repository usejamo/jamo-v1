import { describe, it, expect } from 'vitest'
import {
  resolvePlaceholderTarget,
  groupTargetsByParagraph,
  buildSubstitutedParagraphHtml,
  type ResolvedTarget,
} from '../substitute'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const singleSpanParagraph =
  '<p data-id="para-1">Sponsor: <span data-placeholder-id="p1" data-placeholder-label="sponsor name" class="bg-amber-100 text-amber-800 rounded px-0.5">sponsor name</span>.</p>'

const twoSpanParagraph =
  '<p data-id="para-2">From <span data-placeholder-id="p1" data-placeholder-label="sponsor name" class="bg-amber-100 text-amber-800 rounded px-0.5">sponsor name</span> to <span data-placeholder-id="p2" data-placeholder-label="sponsor name" class="bg-amber-100 text-amber-800 rounded px-0.5">sponsor name</span>.</p>'

const noDataIdAncestorParagraph =
  '<p>No id here: <span data-placeholder-id="p3" data-placeholder-label="orphan" class="bg-amber-100">orphan</span>.</p>'

describe('buildSubstitutedParagraphHtml', () => {
  it('replaces a single placeholder span with the literal value and strips the mark', () => {
    const result = buildSubstitutedParagraphHtml(singleSpanParagraph, ['p1'], 'Acme Pharma')
    expect(result).toContain('Acme Pharma')
    expect(result).not.toContain('data-placeholder-id')
    expect(result).toContain('data-id="para-1"')
  })

  it('fills two placeholders in one paragraph into ONE composed after_html', () => {
    const result = buildSubstitutedParagraphHtml(twoSpanParagraph, ['p1', 'p2'], 'Acme Pharma')
    const occurrences = result.split('Acme Pharma').length - 1
    expect(occurrences).toBe(2)
    expect(result).not.toContain('data-placeholder-id')
    expect(result).toContain('data-id="para-2"')
  })

  it('is byte-identical when run twice on the same input', () => {
    const first = buildSubstitutedParagraphHtml(singleSpanParagraph, ['p1'], 'Acme Pharma')
    const second = buildSubstitutedParagraphHtml(singleSpanParagraph, ['p1'], 'Acme Pharma')
    expect(first).toBe(second)
  })
})

describe('resolvePlaceholderTarget', () => {
  it('resolves a span to its containing data-id paragraph + label', () => {
    const resolved = resolvePlaceholderTarget(singleSpanParagraph, 'p1')
    expect(resolved).not.toBeNull()
    expect(resolved?.paragraph_id).toBe('para-1')
    expect(resolved?.label).toBe('sponsor name')
    expect(resolved?.paragraphOuterHtml).toContain('data-id="para-1"')
  })

  it('returns null when the span has no data-id ancestor', () => {
    const resolved = resolvePlaceholderTarget(noDataIdAncestorParagraph, 'p3')
    expect(resolved).toBeNull()
  })

  it('returns null when the placeholder id is absent (no fuzzy fallback)', () => {
    const resolved = resolvePlaceholderTarget(singleSpanParagraph, 'does-not-exist')
    expect(resolved).toBeNull()
  })
})

describe('groupTargetsByParagraph', () => {
  it('collapses multiple targets sharing a paragraph_id into one group', () => {
    const targets: ResolvedTarget[] = [
      { section_key: 'scope', placeholder_id: 'p1', paragraph_id: 'para-2', paragraphOuterHtml: twoSpanParagraph, label: 'sponsor name' },
      { section_key: 'scope', placeholder_id: 'p2', paragraph_id: 'para-2', paragraphOuterHtml: twoSpanParagraph, label: 'sponsor name' },
    ]
    const groups = groupTargetsByParagraph(targets)
    expect(groups).toHaveLength(1)
    expect(groups[0].placeholderIds).toEqual(['p1', 'p2'])
    expect(groups[0].section_key).toBe('scope')
    expect(groups[0].paragraph_id).toBe('para-2')
  })

  it('keeps targets in different paragraphs as separate groups', () => {
    const targets: ResolvedTarget[] = [
      { section_key: 'scope', placeholder_id: 'p1', paragraph_id: 'para-1', paragraphOuterHtml: singleSpanParagraph, label: 'sponsor name' },
      { section_key: 'scope', placeholder_id: 'p2', paragraph_id: 'para-2', paragraphOuterHtml: twoSpanParagraph, label: 'sponsor name' },
    ]
    const groups = groupTargetsByParagraph(targets)
    expect(groups).toHaveLength(2)
  })
})
