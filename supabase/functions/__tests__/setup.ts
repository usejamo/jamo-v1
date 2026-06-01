// Phase 14.2.2 Plan 05 — Vitest setup for supabase edge function unit tests.
// Polyfills Deno globals so test files can import edge function modules whose
// top-level code references `Deno.serve(...)` or `Deno.env.get(...)`.

const denoStub = {
  serve: (_handler: unknown) => ({}),
  env: {
    get: (_key: string) => undefined,
    toObject: () => ({}),
  },
} as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).Deno = (globalThis as any).Deno ?? denoStub
