// ── extractInvokeErrorMessage ────────────────────────────────────────────────
//
// Shared across every `supabase.functions.invoke` call site (16-07 capture,
// 16-08 demo run, 16-09 reset). Extracted from SaveAsDemoFixtureButton once a
// second caller appeared.
//
// supabase-js collapses EVERY non-2xx edge response into a FunctionsHttpError
// whose `.message` is the useless "Edge Function returned a non-2xx status
// code"; the real body sits unread on `.context` as a Response. Our edge
// functions all answer with `{ error: message }` (see _shared/auth.ts's
// jsonError), and those messages are the actionable ones — e.g.
// "no active demo fixture for the standard template",
// "source proposal has ungenerated section(s): Budget",
// "demo runs are only permitted from the demo org".
// Reading `error.message` throws all of that away.

const DEFAULT_FALLBACK = 'Request failed. Please try again.'

/**
 * Pull the edge function's own message out of a functions.invoke error.
 *
 * @param err      The error from `functions.invoke` (either the returned
 *                 `error` field or a thrown value).
 * @param fallback Message to use when neither the response body nor the error
 *                 carries usable text.
 */
export async function extractInvokeErrorMessage(
  err: unknown,
  fallback: string = DEFAULT_FALLBACK
): Promise<string> {
  const context = (err as { context?: unknown } | null)?.context
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json()
      const serverMessage = (body as { error?: unknown } | null)?.error
      if (typeof serverMessage === 'string' && serverMessage.trim()) {
        return serverMessage
      }
    } catch {
      // Body was not JSON / already consumed — fall back to the error message.
    }
  }
  const message = (err as { message?: unknown } | null)?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}
