// scripts/seed-regulatory.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ManifestEntry } from './regulatory-starter-manifest'

// Mock the reused ingest exports so no real embedding/network call is ever made from this suite, and
// so the "no embedding on invalid batch" assertion can spy on embedBatch.
vi.mock('./ingest-regulatory', () => ({
  embedBatch: vi.fn(async (texts: string[]) => texts.map(() => Array(1536).fill(0.1))),
  EMBED_BATCH_SIZE: 100,
}))

import { validateManifest, main } from './seed-regulatory'
import { embedBatch } from './ingest-regulatory'

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'reg-manifest-'))
}

function makeDocFolder(root: string, folder: string, pdfName = 'doc.pdf') {
  const dir = join(root, folder)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, pdfName), 'stub pdf content')
}

describe('validateManifest', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = makeTmpRoot()
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('fails with a duplicate-key error when documentKey repeats', () => {
    makeDocFolder(tmpRoot, 'DOC-A')
    const entries: ManifestEntry[] = [
      { documentKey: 'DOC-A', title: 'Doc A', agency: 'ICH', geography: ['GLOBAL'] },
      { documentKey: 'DOC-A', title: 'Doc A (dup)', agency: 'ICH', geography: ['GLOBAL'] },
    ]

    const result = validateManifest(entries, tmpRoot)

    expect(result.ok).toBe(false)
    expect(result.order).toEqual([])
    expect(result.errors.some((e) => /duplicate documentKey/i.test(e))).toBe(true)
  })

  it('fails with a missing-folder error when the referenced folder does not exist', () => {
    const entries: ManifestEntry[] = [
      { documentKey: 'DOC-MISSING', title: 'Missing Doc', agency: 'ICH', geography: ['GLOBAL'] },
    ]

    const result = validateManifest(entries, tmpRoot)

    expect(result.ok).toBe(false)
    expect(result.order).toEqual([])
    expect(result.errors.some((e) => /missing folder/i.test(e))).toBe(true)
  })

  it('fails with a missing-target error when a supersedes target is absent from the manifest', () => {
    makeDocFolder(tmpRoot, 'DOC-A')
    const entries: ManifestEntry[] = [
      {
        documentKey: 'DOC-A',
        title: 'Doc A',
        agency: 'ICH',
        geography: ['GLOBAL'],
        supersedes: 'DOC-DOES-NOT-EXIST',
      },
    ]

    const result = validateManifest(entries, tmpRoot)

    expect(result.ok).toBe(false)
    expect(result.order).toEqual([])
    expect(result.errors.some((e) => /supersedes target not found/i.test(e))).toBe(true)
  })

  it('fails with a cycle error when the supersedes graph is cyclic', () => {
    makeDocFolder(tmpRoot, 'DOC-A')
    makeDocFolder(tmpRoot, 'DOC-B')
    const entries: ManifestEntry[] = [
      { documentKey: 'DOC-A', title: 'Doc A', agency: 'ICH', geography: ['GLOBAL'], supersedes: 'DOC-B' },
      { documentKey: 'DOC-B', title: 'Doc B', agency: 'ICH', geography: ['GLOBAL'], supersedes: 'DOC-A' },
    ]

    const result = validateManifest(entries, tmpRoot)

    expect(result.ok).toBe(false)
    expect(result.order).toEqual([])
    expect(result.errors.some((e) => /cycle/i.test(e))).toBe(true)
  })

  it('rejects a folder value containing path separators or ".." as a validation error', () => {
    const entries: ManifestEntry[] = [
      {
        documentKey: 'DOC-A',
        title: 'Doc A',
        agency: 'ICH',
        geography: ['GLOBAL'],
        folder: '../escape',
      },
    ]

    const result = validateManifest(entries, tmpRoot)

    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => /must not contain path separators/i.test(e))).toBe(true)
  })

  it('returns ok:true with the supersedes target ordered before the entry that supersedes it', () => {
    makeDocFolder(tmpRoot, 'DOC-A')
    makeDocFolder(tmpRoot, 'DOC-B')
    // Deliberately out of dependency order in the source array: B (which supersedes A) listed first.
    const entries: ManifestEntry[] = [
      { documentKey: 'DOC-B', title: 'Doc B', agency: 'ICH', geography: ['GLOBAL'], supersedes: 'DOC-A' },
      { documentKey: 'DOC-A', title: 'Doc A', agency: 'ICH', geography: ['GLOBAL'] },
    ]

    const result = validateManifest(entries, tmpRoot)

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    const orderedKeys = result.order.map((e) => e.documentKey)
    expect(orderedKeys).toContain('DOC-A')
    expect(orderedKeys).toContain('DOC-B')
    expect(orderedKeys.indexOf('DOC-A')).toBeLessThan(orderedKeys.indexOf('DOC-B'))
  })
})

describe('main --validate-only', () => {
  let tmpRoot: string
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpRoot = makeTmpRoot()
    vi.clearAllMocks()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
      throw new Error(`process.exit(${_code})`)
    }) as never)
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
    exitSpy.mockRestore()
  })

  it('exits non-zero WITHOUT calling embedBatch when the manifest is invalid', async () => {
    const invalidEntries: ManifestEntry[] = [
      { documentKey: 'DOC-MISSING', title: 'Missing Doc', agency: 'ICH', geography: ['GLOBAL'] },
    ]

    await expect(main(['--validate-only'], invalidEntries, tmpRoot)).rejects.toThrow('process.exit(1)')

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(embedBatch).not.toHaveBeenCalled()
  })

  it('exits zero WITHOUT calling embedBatch when the manifest is valid (validate-only never embeds)', async () => {
    makeDocFolder(tmpRoot, 'DOC-A')
    const validEntries: ManifestEntry[] = [
      { documentKey: 'DOC-A', title: 'Doc A', agency: 'ICH', geography: ['GLOBAL'] },
    ]

    await expect(main(['--validate-only'], validEntries, tmpRoot)).rejects.toThrow('process.exit(0)')

    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(embedBatch).not.toHaveBeenCalled()
  })
})
