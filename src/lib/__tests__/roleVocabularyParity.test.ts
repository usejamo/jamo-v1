import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')

function extractKnownRoles(): string[] {
  const src = read('supabase/functions/template-extract/index.ts')
  const block = src.slice(src.indexOf('const KNOWN_ROLES'), src.indexOf('] as const'))
  // strip // comments, then pull every single-quoted token in array order
  const noComments = block.replace(/\/\/[^\n]*/g, '')
  return [...noComments.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

function extractRoleOptionValues(): string[] {
  const src = read('src/components/settings/TemplatesTab.tsx')
  const block = src.slice(src.indexOf('const ROLE_OPTIONS'), src.indexOf('\n]', src.indexOf('const ROLE_OPTIONS')))
  return [...block.matchAll(/value:\s*'([a-z_]+)'/g)].map((m) => m[1])
}

describe('role vocabulary parity (Deno/Vite duplication guard)', () => {
  it('KNOWN_ROLES equals ROLE_OPTIONS values, order included', () => {
    const known = extractKnownRoles()
    const options = extractRoleOptionValues()
    expect(known.length).toBe(21)
    expect(options).toEqual(known)
  })
})
