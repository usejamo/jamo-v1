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
    exclude: ['**/node_modules/**', '**/e2e/**'],
    globals: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=4096'],
      },
    },
  },
})
