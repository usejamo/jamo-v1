import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

// Sidecar Vitest config for testing supabase edge function pure helpers.
// The root vitest.config.ts excludes `supabase/**` because most edge code is
// Deno-runtime. This config is used for tests of EXPORTED pure helpers that
// can be imported without executing Deno-specific runtime code.
//
// Usage:
//   npx vitest run -c vitest.supabase.config.ts
//
// Notes:
//   - `denoSpecifierStubPlugin` stubs `npm:` and `jsr:` imports so Vite can
//     resolve them at import time.
//   - `setupFiles` polyfills `Deno.serve` to a no-op so module-level calls in
//     index.ts (e.g. `Deno.serve(async (req) => ...)`) don't throw at import.

function denoSpecifierStubPlugin(): Plugin {
  return {
    name: 'deno-specifier-stub',
    resolveId(id) {
      if (id.startsWith('jsr:') || id.startsWith('npm:')) {
        return `\0deno-stub:${id}`
      }
    },
    load(id) {
      if (id.startsWith('\0deno-stub:')) {
        // Return a permissive stub that satisfies common usage patterns.
        return `
          const noop = () => ({})
          const chainable = new Proxy(function () {}, {
            get: () => chainable,
            apply: () => chainable,
          })
          export default chainable
          export const createClient = () => chainable
          export const parseArgs = noop
          export const walk = async function* () {}
          export const z = chainable
        `
      }
    },
  }
}

export default defineConfig({
  plugins: [denoSpecifierStubPlugin()],
  test: {
    include: ['supabase/functions/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
    setupFiles: ['./supabase/functions/__tests__/setup.ts'],
    globals: true,
  },
})
