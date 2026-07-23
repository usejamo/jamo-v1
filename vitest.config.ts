import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Stub out Deno-only specifiers (jsr: and npm:) so Vitest can import
// scripts that use these at runtime without Vite failing to resolve them.
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
        return 'export default {}; export const parseArgs = () => ({}); export const walk = async function* () {}; export const createClient = () => ({})'
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), denoSpecifierStubPlugin()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    // supabase/** holds Deno-runtime edge functions with their own Deno.test suites
    // (test.ts, __tests__/*.test.ts) that cannot run under Vitest/Node — exclude the
    // tree broadly, but carve out promptAssembly.test.ts and truncationSignal.test.ts,
    // which are pure Vitest specs for the Node-importable pure modules
    // (promptAssembly.ts, truncationSignal.ts) in generate-proposal-section, and
    // coverage.test.ts, a pure Vitest spec for coverage.ts in template-extract.
    exclude: [
      '**/node_modules/**',
      '**/e2e/**',
      'supabase/migrations/**',
      'supabase/tests/**',
      'supabase/functions/!(generate-proposal-section|template-extract)/**',
      'supabase/functions/generate-proposal-section/!(promptAssembly.test|truncationSignal.test).*',
      'supabase/functions/template-extract/!(coverage.test).*',
    ],
    globals: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=4096'],
      },
    },
    // Run test FILES one at a time. Several suites are timing-sensitive — they mix
    // fake timers (vi.advanceTimersByTimeAsync) with real-async work that fake timers
    // can't drive (crypto.subtle.digest in useGapAnalysisTrigger, React act() render
    // flushes in SectionWorkspace, document parse-status polling). With fileParallelism
    // on, other files' async work interleaves on the shared event loop and starves those
    // drain loops, so exact-count assertions flake nondeterministically (the failing set
    // varies run-to-run and even spreads across files). Files pass reliably in isolation;
    // serializing them removes the interleaving. Full-run cost ~10s → ~56s; watch mode only
    // re-runs changed files, so local feedback stays fast. See fix/test-flakiness debug.
    fileParallelism: false,
  },
})
