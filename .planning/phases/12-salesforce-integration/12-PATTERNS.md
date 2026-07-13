# Phase 12: Salesforce Integration — Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/functions/salesforce-oauth-initiate/index.ts` | Edge Function (request-response) | request-response | `supabase/functions/extract-document/index.ts` | role-match |
| `supabase/functions/salesforce-oauth-callback/index.ts` | Edge Function (redirect handler) | request-response | `supabase/functions/extract-document/index.ts` | role-match |
| `supabase/functions/salesforce-oauth-disconnect/index.ts` | Edge Function (mutation) | request-response | `supabase/functions/extract-document/index.ts` | role-match |
| `supabase/functions/_shared/salesforce-token-refresh.ts` | Shared utility | request-response | `supabase/functions/extract-document/index.ts` (supabase client pattern) | partial |
| `supabase/migrations/20260506000026_salesforce_integration.sql` | Migration | CRUD | `supabase/migrations/20260418000023_templates.sql` | exact |
| `src/components/SalesforceConnection.tsx` | Component (stateful) | request-response | `src/pages/Settings.tsx` — `IntegrationCard` + Settings page patterns | role-match |
| `src/pages/Settings.tsx` | Page (modified) | request-response | `src/pages/Settings.tsx` (self) | exact |

---

## Pattern Assignments

### `supabase/functions/salesforce-oauth-initiate/index.ts` (Edge Function, request-response)

**Analog:** `supabase/functions/extract-document/index.ts`

**Imports pattern** (lines 1-2):
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'supabase'
```

**CORS + OPTIONS pattern** (lines 75-84):
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders })
}
```

**Service role client pattern** (lines 91-94):
```typescript
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
```

**DB write pattern** (lines 149-155):
```typescript
await supabase.from('document_extracts').insert({
  document_id: documentId,
  org_id: doc.org_id,
  content: extractedText,
  // ...
})
```

**Success response pattern** (lines 167-177):
```typescript
return new Response(JSON.stringify({
  success: true,
  // ...
}), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
})
```

**Error response pattern** (lines 229-235):
```typescript
return new Response(JSON.stringify({
  success: false,
  error: error.message
}), {
  status: 500,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
})
```

**Secret-missing check pattern** — not in analog; use D-04 pattern from RESEARCH.md:
```typescript
const consumerKey = Deno.env.get('SALESFORCE_CONSUMER_KEY')
const consumerSecret = Deno.env.get('SALESFORCE_CONSUMER_SECRET')
if (!consumerKey || !consumerSecret) {
  return new Response(JSON.stringify({ error: 'Salesforce Connected App not configured. Set SALESFORCE_CONSUMER_KEY and SALESFORCE_CONSUMER_SECRET.' }), { status: 503, headers: corsHeaders })
}
```

**Note on import map:** `extract-document` uses `import { createClient } from 'supabase'` (import map alias). `template-extract` uses `https://esm.sh/@supabase/supabase-js@2` directly. **Use the import map alias `'supabase'`** — matches the majority pattern and deno.json import maps.

---

### `supabase/functions/salesforce-oauth-callback/index.ts` (Edge Function, redirect handler)

**Analog:** `supabase/functions/extract-document/index.ts`

**Imports pattern** — same as initiate (lines 1-2 above).

**Redirect response pattern** (no analog in codebase — use RESEARCH.md verified pattern):
```typescript
return new Response(null, {
  status: 302,
  headers: {
    'Location': `${SETTINGS_URL}&sf_error=state_mismatch`,
  }
})
```

**Note:** Callback is a browser redirect target (GET from Salesforce), NOT a JSON API. Do NOT add CORS headers or return JSON. Only 302 responses (success to Settings, error to Settings with `sf_error` param). See RESEARCH.md Pitfall 6.

**DB select + TTL check pattern** — copy from extract-document lines 97-105:
```typescript
const { data: pending, error: fetchError } = await supabase
  .from('oauth_pending')
  .select('code_verifier')
  .eq('state', decodeURIComponent(stateToken))
  .gt('expires_at', new Date().toISOString())
  .single()

if (fetchError || !pending) {
  return new Response(null, { status: 302, headers: { Location: `${SETTINGS_URL}&sf_error=state_mismatch` } })
}
```

**Upsert pattern** — use `.upsert({ ... }, { onConflict: 'org_id' })` for `salesforce_connections` (one connection per org, D-07).

**Vault RPC pattern** (from RESEARCH.md — no existing analog):
```typescript
const { data: secretId, error } = await supabase.rpc('vault_store_sf_tokens', {
  p_payload: JSON.stringify(vaultPayload),
  p_name: `sf_tokens_${orgId}`
})
```

---

### `supabase/functions/salesforce-oauth-disconnect/index.ts` (Edge Function, mutation)

**Analog:** `supabase/functions/extract-document/index.ts`

**Imports + CORS + service role client** — identical to initiate pattern above.

**DB select then delete pattern** (lines 97-105, 149-155 of analog):
```typescript
// Read connection first to get vault_secret_id
const { data: conn } = await supabase
  .from('salesforce_connections')
  .select('vault_secret_id, instance_url')
  .eq('org_id', orgId)
  .single()

// Delete after revoke
await supabase.from('salesforce_connections').delete().eq('org_id', orgId)
```

**External fetch pattern** — copy from extract-document's pattern of `await fetch(...)` with error check:
```typescript
const revokeRes = await fetch(`https://login.salesforce.com/services/oauth2/revoke`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ token: tokens.refresh_token })
})
// HTTP 400 = already revoked; treat as success (don't block disconnect)
```

---

### `supabase/functions/_shared/salesforce-token-refresh.ts` (shared utility)

**Analog:** Pattern derived from `supabase/functions/extract-document/index.ts` service role client + DB query patterns.

**Note:** No existing `_shared/` utility files exist in the codebase — this is the first. It is imported by future Phase 12.1 Edge Functions, not a standalone serve() function.

**Export pattern** (no analog — new pattern for this project):
```typescript
// No serve() call — exported function only
export async function getValidSalesforceTokens(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ access_token: string; instance_url: string } | null> {
  // ...
}
```

**SupabaseClient type import** — use:
```typescript
import { SupabaseClient } from 'supabase'
```

---

### `supabase/migrations/20260506000026_salesforce_integration.sql` (Migration)

**Analog:** `supabase/migrations/20260418000023_templates.sql`

**Table + FK + unique constraint pattern** (lines 8-19 of analog):
```sql
CREATE TABLE salesforce_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- ... other columns ...
  UNIQUE(org_id)
);
ALTER TABLE salesforce_connections ENABLE ROW LEVEL SECURITY;
```

**RLS policy pattern** (lines 43-68 of analog — role-based SELECT/INSERT/DELETE):
```sql
-- SELECT: org members can read their own row
CREATE POLICY "salesforce_connections_select" ON salesforce_connections FOR SELECT
  USING (org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

-- INSERT/UPDATE/DELETE: service_role only (Edge Functions write via service role; no anon/authenticated write)
-- Achieved by: no INSERT/UPDATE policy for authenticated role; service_role bypasses RLS
```

**Private schema helper function pattern** (from `20260305000012_rls_helper_functions.sql` lines 6-13):
```sql
CREATE OR REPLACE FUNCTION private.vault_store_sf_tokens(
  p_payload jsonb,
  p_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  -- ...
$$;
REVOKE ALL ON FUNCTION private.vault_store_sf_tokens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vault_store_sf_tokens TO service_role;
```

**pg_cron cleanup pattern** (from RESEARCH.md — no existing analog):
```sql
SELECT cron.schedule(
  'cleanup-oauth-pending',
  '*/5 * * * *',
  $$DELETE FROM oauth_pending WHERE expires_at < now()$$
);
```

**Migration header comment pattern** (line 1-3 of analog):
```sql
-- Migration: 20260506000026_salesforce_integration.sql
-- Creates salesforce_connections and oauth_pending tables with RLS, Vault wrappers, pg_cron cleanup
-- Phase 12: Salesforce Integration
```

---

### `src/components/SalesforceConnection.tsx` (Component, request-response)

**Analog:** `src/pages/Settings.tsx` — `IntegrationCard` component (lines 209-244) + Settings page `useSearchParams` usage (lines 460-466)

**Card visual pattern** (lines 212-243 of Settings.tsx):
```tsx
<div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4 transition-all hover:shadow-sm hover:border-gray-300">
  <div className="flex items-center gap-3">
    {/* logo + name + connected badge */}
    {connected && (
      <span className="flex items-center gap-1 text-[11px] font-medium text-green-600">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
        Connected
      </span>
    )}
  </div>
  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
    {connected ? (
      <button className="... text-gray-600 hover:text-gray-800 border border-gray-200 ...">
        Manage {/* → replace with "Disconnect" */}
      </button>
    ) : (
      <button className="... text-jamo-600 hover:text-jamo-700 border border-jamo-200 ...">
        Connect {/* → replace with "Connect Salesforce" */}
      </button>
    )}
  </div>
</div>
```

**useSearchParams + tab init pattern** (lines 462-466 of Settings.tsx):
```tsx
const [searchParams, setSearchParams] = useSearchParams()
// Read sf_error on mount, then remove from URL (D-15)
useEffect(() => {
  const sfError = searchParams.get('sf_error')
  if (sfError) {
    setError(SF_ERROR_COPY[sfError] ?? SF_ERROR_COPY.unknown)
    // Remove from URL without re-render trigger
    const next = new URLSearchParams(searchParams)
    next.delete('sf_error')
    setSearchParams(next, { replace: true })
  }
}, []) // run once on mount only
```

**Auth hook pattern** (line 461 of Settings.tsx):
```tsx
const { profile } = useAuth()
// Use profile.org_id when calling salesforce-oauth-initiate
```

**Supabase client import** — use existing `src/lib/supabase.ts`:
```tsx
import { supabase } from '../lib/supabase'
```

**Inline error pattern** — no exact analog in codebase; use dismissible inline block (not toast):
```tsx
{error && (
  <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
    <p className="flex-1">{error}</p>
    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
  </div>
)}
```

---

### `src/pages/Settings.tsx` (Page, modified)

**Analog:** `src/pages/Settings.tsx` (self — targeted edits only)

**INTEGRATIONS array change** (lines 44-66): Remove the `Salesforce` entry. Keep `HubSpot` and `Workday` entries. Array shrinks from 3 to 2 items.

**Integrations tab render change** (lines 502-516): Add `<SalesforceConnection />` before the `INTEGRATIONS.map()` grid. Update grid from `grid-cols-3` to `grid-cols-2` (2 remaining demo cards):
```tsx
{activeTab === 'Integrations' && (
  <div className="space-y-5">
    <div>
      <p className="text-sm font-semibold text-gray-800">Connected platforms</p>
      <p className="text-xs text-gray-500 mt-0.5">
        Manage the tools jamo syncs with to keep your proposal data up to date.
      </p>
    </div>
    {/* Real Salesforce connection component */}
    <SalesforceConnection />
    {/* Demo cards (HubSpot, Workday) */}
    <div className="grid grid-cols-2 gap-5">
      {INTEGRATIONS.map(integration => (
        <IntegrationCard key={integration.name} integration={integration} />
      ))}
    </div>
  </div>
)}
```

**Import addition**: Add `import { SalesforceConnection } from '../components/SalesforceConnection'` at top of file.

---

## Shared Patterns

### Service Role Supabase Client
**Source:** `supabase/functions/extract-document/index.ts` lines 91-94
**Apply to:** All three Edge Functions
```typescript
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
```

### CORS Headers Block
**Source:** `supabase/functions/extract-document/index.ts` lines 77-82
**Apply to:** `salesforce-oauth-initiate`, `salesforce-oauth-disconnect` (JSON API endpoints only — NOT `salesforce-oauth-callback` which is a redirect target)
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders })
}
```

### Private Schema SECURITY DEFINER Pattern
**Source:** `supabase/migrations/20260305000012_rls_helper_functions.sql` lines 6-13
**Apply to:** All four Vault wrapper functions in `20260506000026_salesforce_integration.sql`
```sql
CREATE OR REPLACE FUNCTION private.<name>(...)
RETURNS <type>
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public   -- note: vault in path for Vault wrappers
AS $$ ... $$;
REVOKE ALL ON FUNCTION private.<name> FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.<name> TO service_role;
```

### RLS org_id Scoping Pattern
**Source:** `supabase/migrations/20260418000023_templates.sql` lines 43-68
**Apply to:** `salesforce_connections` SELECT policy
```sql
CREATE POLICY "<table>_select" ON <table> FOR SELECT
  USING (org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));
```

### useAuth() org_id Access
**Source:** `src/pages/Settings.tsx` line 461
**Apply to:** `SalesforceConnection.tsx`
```tsx
const { profile } = useAuth()
// profile.org_id — send in POST body to salesforce-oauth-initiate
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `supabase/functions/_shared/salesforce-token-refresh.ts` | Shared utility | request-response | First `_shared/` utility file in codebase — no existing pattern to copy from; use exported function without `serve()` |

---

## Metadata

**Analog search scope:** `supabase/functions/*/index.ts`, `supabase/migrations/*.sql`, `src/pages/Settings.tsx`, `src/components/`
**Files scanned:** 9 Edge Functions, 25 migrations, Settings.tsx, rls_helper_functions.sql
**Pattern extraction date:** 2026-05-06
