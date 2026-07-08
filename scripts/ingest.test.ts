// scripts/ingest.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { embedBatch, parseFlags } from './ingest-regulatory'

const EMBED_BATCH_SIZE = 100

// Mock the global fetch that embedBatch now uses (raw OpenAI /v1/embeddings call).
function makeFetchMock(dims = 1536) {
  return vi.fn(async (_url: string | URL, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { input: string[] }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: body.input.map((_: string, i: number) => ({
          index: i,
          embedding: Array(dims).fill(0.1),
        })),
      }),
      text: async () => '',
    } as unknown as Response
  })
}

describe('embedBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns embeddings with 1536 dimensions per chunk', async () => {
    vi.stubGlobal('fetch', makeFetchMock(1536))
    const texts = ['chunk one', 'chunk two', 'chunk three']
    const result = await embedBatch(texts, 'test-key')
    expect(result).toHaveLength(3)
    for (const embedding of result) {
      expect(embedding).toHaveLength(1536)
    }
  })

  it('batches requests at EMBED_BATCH_SIZE chunks per call', async () => {
    const fetchMock = makeFetchMock(1536)
    vi.stubGlobal('fetch', fetchMock)
    // EMBED_BATCH_SIZE + 10 texts → should trigger 2 API calls (100 + 10)
    const texts = Array(EMBED_BATCH_SIZE + 10).fill('regulatory text chunk')
    const result = await embedBatch(texts, 'test-key')
    expect(result).toHaveLength(texts.length)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws when returned embedding dimension is not 1536', async () => {
    vi.stubGlobal('fetch', makeFetchMock(512)) // wrong dims
    await expect(embedBatch(['chunk one'], 'test-key')).rejects.toThrow(/dim/i)
  })
})

describe('parseFlags', () => {
  const validArgv = [
    '--document-key=ICH-E6R2',
    '--agency=ICH',
    '--geography=US,EU,GLOBAL',
    '--dir=./regulatory-docs/ICH-E6R2',
    '--phase=Phase 2,Phase 3',
    '--therapeutic-area=Oncology',
    '--effective-date=2016-11-09',
  ]

  it('parses all flags, comma-splitting geography/phase and defaulting status to active', () => {
    const flags = parseFlags(validArgv)
    expect(flags.documentKey).toBe('ICH-E6R2')
    expect(flags.agency).toBe('ICH')
    expect(flags.geography).toEqual(['US', 'EU', 'GLOBAL'])
    expect(flags.phase).toEqual(['Phase 2', 'Phase 3'])
    expect(flags.therapeuticArea).toBe('Oncology')
    expect(flags.effectiveDate).toBe('2016-11-09')
    expect(flags.status).toBe('active') // default when --status absent
    expect(flags.dryRun).toBe(false)
  })

  it('honors an explicit --status and --dry-run', () => {
    const flags = parseFlags([...validArgv, '--status=superseded', '--dry-run'])
    expect(flags.status).toBe('superseded')
    expect(flags.dryRun).toBe(true)
  })

  it('rejects when --document-key is missing', () => {
    const argv = validArgv.filter((a) => !a.startsWith('--document-key='))
    expect(() => parseFlags(argv)).toThrow(/--document-key/)
  })

  it('rejects when --geography is missing', () => {
    const argv = validArgv.filter((a) => !a.startsWith('--geography='))
    expect(() => parseFlags(argv)).toThrow(/--geography/)
  })

  it('parses --supersedes when present and yields null when absent', () => {
    expect(parseFlags(validArgv).supersedes).toBeNull()
    expect(parseFlags([...validArgv, '--supersedes=ICH-E6R1']).supersedes).toBe('ICH-E6R1')
  })
})
