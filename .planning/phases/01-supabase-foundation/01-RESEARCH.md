# Phase 1: Supabase Foundation — Research

**Researched:** 2026-03-05
**Domain:** Supabase (Postgres, Auth, Storage, RLS, pgvector) + React Context migration
**Confidence:** HIGH (core stack patterns verified against official Supabase docs)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REQ-7.1 | Supabase Postgres as primary database | Client singleton, migration files, TypeScript types generation |
| REQ-7.2 | Core tables: organizations, user_profiles, proposals, proposal_sections, proposal_documents, document_extracts, proposal_chats, proposal_assumptions | Full schema design in §Architecture Patterns |
| REQ-7.3 | RLS on every table — all queries scoped to org_id | get_user_org_id() helper + per-table policy SQL in §Architecture Patterns |
| REQ-7.4 | org_id denormalized onto every table | Schema design; every CREATE TABLE includes org_id NOT NULL |
| REQ-7.5 | Supabase Storage — private documents bucket with RLS on org_id path prefix | storage.foldername() helper pattern in §Architecture Patterns |
| REQ-7.6 | pgvector extension enabled; regulatory_chunks table created | CREATE EXTENSION + HNSW index SQL in §Architecture Patterns |
| REQ-7.7 | Regulatory knowledge base seeding (deferred to Phase 4) | Table schema in place this phase; data load in Phase 4 |
| REQ-7.8 | Chunking + OpenAI embeddings for pgvector (deferred to Phase 4) | regulatory_chunks table + vector(1536) column created this phase |
| REQ-7.9 | Usage tracking from day one | usage_events table design in §Architecture Patterns |
| REQ-7.10 | Feature flag column structure on organizations table | JSONB feature_flags column design in §Architecture Patterns |
</phase_requirements>

---

## Summary

Phase 1 installs Supabase as the backbone of the entire application. It has three distinct sub-domains: (1) infrastructure — the Supabase project itself, CLI wiring, env vars, and TypeScript client singleton; (2) database — schema creation with RLS, pgvector, usage tracking, and feature flags; and (3) React migration — swapping the three in-memory Context providers (ProposalsContext, DeletedContext, ArchivedContext) from JSON-backed state to Supabase-backed async state.

Supabase's JS client v2 (`@supabase/supabase-js`) uses a simple singleton pattern and `import.meta.env` for Vite projects. New projects in 2025 use a `sb_publishable_...` key instead of the legacy `anon` JWT key, but both work identically in `createClient()`. TypeScript types are generated via `supabase gen types typescript` and passed as the `Database` generic to `createClient<Database>()`.

RLS is the critical correctness guarantee. Every table gets `org_id NOT NULL`, and all policies call a `get_user_org_id()` security-definer helper function that is wrapped in a `SELECT` for Postgres optimizer caching. The Context migration requires introducing a `loading: boolean` and `error: string | null` state slot alongside each data array, since Supabase queries are async whereas the current in-memory state is synchronous.

**Primary recommendation:** Set up CLI + migrations folder first, write all DDL as numbered migration files, then wire the React client and migrate contexts one at a time starting with ProposalsContext.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.x (latest) | Supabase client — queries, auth, storage, realtime | Official client, ships full TypeScript types |
| Supabase CLI | latest | Migrations, type generation, local dev | Official tool; `supabase gen types` is the only way to get schema types |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` / Vite env | built-in | `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` | Required for Vite env injection |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase CLI migrations | Raw SQL in Supabase dashboard | Dashboard SQL is fine for one-off exploration but not reproducible; migrations are required for team/CI |
| `sb_publishable_...` key | Legacy `anon` JWT key | Both work; publishable key is the new standard for projects created after Nov 2025 |

**Installation:**
```bash
npm install @supabase/supabase-js
npm install -g supabase   # or: npx supabase
```

---

## Architecture Patterns

### Recommended Project Structure Additions

```
jamo-v1/
├── supabase/
│   ├── config.toml            # Created by: supabase init
│   ├── seed.sql               # Optional: test org + user seed data
│   └── migrations/
│       ├── 20260305000001_extensions.sql
│       ├── 20260305000002_organizations.sql
│       ├── 20260305000003_user_profiles.sql
│       ├── 20260305000004_proposals.sql
│       ├── 20260305000005_proposal_sections.sql
│       ├── 20260305000006_proposal_documents.sql
│       ├── 20260305000007_document_extracts.sql
│       ├── 20260305000008_proposal_assumptions.sql
│       ├── 20260305000009_proposal_chats.sql
│       ├── 20260305000010_regulatory_chunks.sql
│       ├── 20260305000011_usage_events.sql
│       ├── 20260305000012_rls_helper_functions.sql
│       ├── 20260305000013_rls_policies.sql
│       └── 20260305000014_storage_policies.sql
├── src/
│   ├── lib/
│   │   └── supabase.ts        # Singleton client + Database type import
│   ├── types/
│   │   └── database.types.ts  # Generated by: supabase gen types typescript
│   └── context/
│       ├── AuthContext.tsx    # NEW: session + user_profile
│       ├── ProposalsContext.tsx   # UPDATED: Supabase-backed
│       ├── DeletedContext.tsx     # UPDATED: Supabase soft-delete
│       └── ArchivedContext.tsx    # UPDATED: Supabase is_archived flag
└── .env.local                 # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
```

---

### Pattern 1: Supabase Client Singleton

**What:** Module-level singleton so the client is created once, reused everywhere.
**When to use:** Always — never call `createClient()` inside a component render.

```typescript
// src/lib/supabase.ts
// Source: https://supabase.com/docs/guides/getting-started/quickstarts/reactjs
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase env vars. Check .env.local.')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
```

**Note on env var name:** New Supabase projects (post-Nov 2025) use `VITE_SUPABASE_PUBLISHABLE_KEY`. Older projects may use `VITE_SUPABASE_ANON_KEY`. Both point to a low-privilege public key — use whichever your project dashboard shows.

---

### Pattern 2: TypeScript Type Generation

**What:** Generate full type safety from the live schema.
**When to use:** After each migration is pushed to the remote project.

```bash
# Generate types from remote project (run after schema changes)
npx supabase gen types typescript \
  --project-id <your-project-ref> \
  > src/types/database.types.ts

# Or from local dev database
npx supabase gen types typescript --local > src/types/database.types.ts
```

The generated file provides `Database['public']['Tables']['proposals']['Row']` etc., which flows through `createClient<Database>()` automatically. Add this command to a `package.json` script:

```json
"db:types": "supabase gen types typescript --project-id YOUR_ID > src/types/database.types.ts"
```

---

### Pattern 3: Auth Context (new — wraps Supabase session)

**What:** A new `AuthContext` that holds the Supabase session, user, and org profile. All other contexts depend on this.
**When to use:** Wrap the entire app; all other providers sit inside it.

```typescript
// src/context/AuthContext.tsx
// Source: https://supabase.com/docs/guides/auth/quickstarts/react
import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database.types'

type UserProfile = Database['public']['Tables']['user_profiles']['Row']

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    })

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) loadProfile(session.user.id)
        else { setProfile(null); setLoading(false) }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

---

### Pattern 4: Migrating an In-Memory Context to Supabase

**What:** Replace synchronous in-memory state with async Supabase queries.
**Key principle:** Keep the same public hook API surface (`useProposals()`, `useDeleted()`, `useArchived()`) so no consumer components need to change.

**Before (in-memory):**
```typescript
// Current: synchronous, resets on page refresh
const [proposals, setProposals] = useState<Proposal[]>(rawProposals as Proposal[])
```

**After (Supabase-backed):**
```typescript
// New: async, persistent, org-scoped via RLS
const [proposals, setProposals] = useState<Proposal[]>([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  const { session } = // from AuthContext — do not fetch until session exists
  if (!session) return

  supabase
    .from('proposals')
    .select('*')
    .is('deleted_at', null)         // RLS already scopes by org; this filters soft-deletes
    .order('created_at', { ascending: false })
    .then(({ data, error }) => {
      if (error) setError(error.message)
      else setProposals(data ?? [])
      setLoading(false)
    })
}, [session])
```

**What stays in Context vs. moves to DB:**

| State | Location | Reason |
|-------|----------|--------|
| `proposals[]` | DB + Context cache | Source of truth is DB; Context holds the fetched copy |
| `is_archived` flag | `proposals.is_archived` column | Persistent across sessions |
| `deleted_at` timestamp | `proposals.deleted_at` column | Soft-delete pattern; RLS SELECT policy filters nulls |
| `archivedIds` Set | Removed — no longer needed | State moved to DB column |
| `deletedMap` Map | Removed — no longer needed | State moved to DB column |
| UI loading/error | Context state | UI concern only, not persisted |
| Modal open/close state | ProposalModalContext (unchanged) | Ephemeral UI state stays in Context |

**Context nesting order update** (add AuthProvider as outermost):
```
AuthProvider          ← NEW (session, user, org)
  SidebarProvider
    ProposalsProvider
      DeletedProvider  ← simplified; delete calls supabase.from('proposals').update({deleted_at})
        ArchivedProvider ← simplified; archive calls supabase.from('proposals').update({is_archived: true})
          ProposalModalProvider
```

---

### Pattern 5: Full Database Schema

**What:** All 9 tables (8 required + regulatory_chunks) with complete column definitions.

```sql
-- Migration: 20260305000001_extensions.sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Migration: 20260305000002_organizations.sql
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'trial',  -- 'trial', 'starter', 'pro', 'enterprise'
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  -- Feature flags: flexible JSONB; add flags without schema migration
  feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Examples: {"ai_chat": true, "rag_enabled": false, "max_proposals": 10}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: 20260305000003_user_profiles.sql
CREATE TABLE user_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'user',  -- 'super_admin', 'admin', 'user'
  full_name     TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_org_id ON user_profiles(org_id);

-- Migration: 20260305000004_proposals.sql
CREATE TABLE proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by       UUID NOT NULL REFERENCES user_profiles(id),
  title            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft',
  -- 'draft', 'in_progress', 'in_review', 'submitted', 'won', 'lost'
  client_name      TEXT,
  therapeutic_area TEXT,
  study_phase      TEXT,
  study_type       TEXT,
  indication       TEXT,
  description      TEXT,
  due_date         DATE,
  estimated_value  NUMERIC(15,2),
  currency         TEXT NOT NULL DEFAULT 'USD',
  services_requested TEXT[],                   -- array of service strings
  is_archived      BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,               -- soft delete; NULL = active
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proposals_org_id ON proposals(org_id);
CREATE INDEX idx_proposals_deleted_at ON proposals(deleted_at) WHERE deleted_at IS NULL;

-- Migration: 20260305000005_proposal_sections.sql
CREATE TABLE proposal_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,              -- e.g., 'executive_summary', 'study_understanding'
  section_name  TEXT NOT NULL,
  content       TEXT,                      -- markdown/TipTap JSON
  status        TEXT NOT NULL DEFAULT 'pending',
  -- 'pending', 'generating', 'complete', 'error', 'needs_review'
  is_locked     BOOLEAN NOT NULL DEFAULT FALSE,
  version       INTEGER NOT NULL DEFAULT 1,
  generated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(proposal_id, section_key)          -- one row per section per proposal
);
CREATE INDEX idx_proposal_sections_proposal_id ON proposal_sections(proposal_id);

-- Migration: 20260305000006_proposal_documents.sql
-- Named "proposal_documents" per REQ-7.2 (maps to Storage objects)
CREATE TABLE proposal_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proposal_id   UUID REFERENCES proposals(id) ON DELETE SET NULL,
  uploaded_by   UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  storage_path  TEXT NOT NULL,             -- Supabase Storage object path
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT,
  doc_type      TEXT,                      -- 'rfp', 'protocol', 'transcript', 'budget', 'template'
  parse_status  TEXT NOT NULL DEFAULT 'pending',
  -- 'pending', 'extracting', 'complete', 'error'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proposal_documents_org_id ON proposal_documents(org_id);
CREATE INDEX idx_proposal_documents_proposal_id ON proposal_documents(proposal_id);

-- Migration: 20260305000007_document_extracts.sql
CREATE TABLE document_extracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES proposal_documents(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  page_count    INTEGER,
  word_count    INTEGER,
  parsed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parse_error   TEXT                       -- NULL if successful
);
CREATE INDEX idx_document_extracts_document_id ON document_extracts(document_id);

-- Migration: 20260305000008_proposal_assumptions.sql
CREATE TABLE proposal_assumptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category         TEXT NOT NULL,          -- 'sponsor_metadata', 'scope', 'timeline', 'budget', 'missing'
  content          TEXT NOT NULL,          -- assumption text
  confidence       TEXT NOT NULL DEFAULT 'medium', -- 'high', 'medium', 'low'
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'edited'
  user_edited      BOOLEAN NOT NULL DEFAULT FALSE,
  source_document  UUID REFERENCES proposal_documents(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proposal_assumptions_proposal_id ON proposal_assumptions(proposal_id);

-- Migration: 20260305000009_proposal_chats.sql
CREATE TABLE proposal_chats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,             -- 'user' or 'assistant'
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proposal_chats_proposal_id ON proposal_chats(proposal_id);

-- Migration: 20260305000010_regulatory_chunks.sql
-- No org_id: shared platform knowledge base, not per-org
CREATE TABLE regulatory_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name TEXT NOT NULL,            -- e.g., 'ICH E6(R2) GCP Guidelines'
  document_type TEXT NOT NULL,            -- 'ICH', 'FDA', 'EMA'
  section_ref   TEXT,                     -- e.g., 'Section 5.18.3'
  content       TEXT NOT NULL,
  embedding     extensions.vector(1536),  -- OpenAI text-embedding-3-small
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- HNSW index: available in pgvector >= 0.5.0 (all current Supabase projects)
-- Build immediately; no training phase required unlike IVFFlat
CREATE INDEX idx_regulatory_chunks_embedding
  ON regulatory_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Migration: 20260305000011_usage_events.sql
CREATE TABLE usage_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  -- 'proposal_generated', 'section_generated', 'document_processed',
  -- 'ai_chat_message', 'rag_query', 'export_generated'
  proposal_id   UUID REFERENCES proposals(id) ON DELETE SET NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Examples: {"model": "claude-sonnet-4-5", "tokens_in": 1200, "tokens_out": 4500}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_usage_events_org_id ON usage_events(org_id);
CREATE INDEX idx_usage_events_created_at ON usage_events(created_at);
-- Partitioning by month is V2; for MVP, a partial index on recent rows is sufficient
```

---

### Pattern 6: RLS Helper Functions + Policies

**Order:** Create helper functions first, then enable RLS on tables, then create policies.

```sql
-- Migration: 20260305000012_rls_helper_functions.sql
-- Source: https://supabase.com/docs/guides/database/postgres/row-level-security

-- Store functions in a non-exposed schema to prevent API access
-- SECURITY DEFINER bypasses RLS when reading user_profiles
-- Wrapped in SELECT: Postgres optimizer caches result per statement (major performance win)

CREATE OR REPLACE FUNCTION private.get_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM user_profiles WHERE user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.get_user_role()
RETURNS TEXT
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_profiles WHERE user_id = (SELECT auth.uid());
$$;

-- Migration: 20260305000013_rls_policies.sql

ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_sections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extracts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_chats       ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events         ENABLE ROW LEVEL SECURITY;
-- Note: regulatory_chunks has NO RLS — it's a shared platform resource

-- ORGANIZATIONS: Users see only their own org
CREATE POLICY "orgs_select" ON organizations
  FOR SELECT TO authenticated
  USING (id = (SELECT private.get_user_org_id()));

-- Super admin reads all orgs
CREATE POLICY "orgs_super_admin" ON organizations
  FOR ALL TO authenticated
  USING ((SELECT private.get_user_role()) = 'super_admin');

-- AUTH TRIGGER: auto-create user_profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO user_profiles (user_id, org_id, role, full_name)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'org_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- USER_PROFILES: org-scoped select; own-row update
CREATE POLICY "profiles_select" ON user_profiles
  FOR SELECT TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "profiles_update" ON user_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- PROPOSALS: full org CRUD; soft-delete via deleted_at
CREATE POLICY "proposals_select" ON proposals
  FOR SELECT TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()) AND deleted_at IS NULL);

CREATE POLICY "proposals_insert" ON proposals
  FOR INSERT TO authenticated
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "proposals_update" ON proposals
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()));

-- Deleted proposals (trash view): admins can see these
CREATE POLICY "proposals_select_deleted" ON proposals
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT private.get_user_org_id())
    AND deleted_at IS NOT NULL
    AND (SELECT private.get_user_role()) IN ('admin', 'super_admin')
  );

-- All child tables follow the same single-policy pattern:
CREATE POLICY "proposal_sections_all" ON proposal_sections
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "proposal_documents_all" ON proposal_documents
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "document_extracts_all" ON document_extracts
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "proposal_assumptions_all" ON proposal_assumptions
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "proposal_chats_all" ON proposal_chats
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "usage_events_all" ON usage_events
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));
```

---

### Pattern 7: Storage Bucket + RLS

**What:** Private `documents` bucket with org-scoped path prefix.
**Path convention:** `{org_id}/{proposal_id}/{filename}` — org_id is always the first folder segment.

```sql
-- Migration: 20260305000014_storage_policies.sql
-- Source: https://supabase.com/docs/guides/storage/security/access-control

-- Bucket is created via dashboard or CLI (not SQL)
-- Bucket name: 'documents' (private by default)

-- Upload: only to own org's folder
CREATE POLICY "storage_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT (private.get_user_org_id())::text
    )
  );

-- Read: only from own org's folder
CREATE POLICY "storage_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT (private.get_user_org_id())::text
    )
  );

-- Update/delete: only own org's folder
CREATE POLICY "storage_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT (private.get_user_org_id())::text
    )
  );

CREATE POLICY "storage_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT (private.get_user_org_id())::text
    )
  );
```

**Client-side upload (React):**
```typescript
// Source: RESEARCH-backend.md §2.5
const { data, error } = await supabase.storage
  .from('documents')
  .upload(`${orgId}/${proposalId}/${file.name}`, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
// data.path contains the storage_path to save in proposal_documents table
```

---

### Pattern 8: Feature Flags on Organizations Table

**What:** JSONB column for per-org feature gating.
**Design decision:** JSONB chosen over a separate `feature_flags` table because:
- Flags are always accessed together with the org record (no join cost)
- Adding a new flag requires no schema migration
- Flag values can be boolean, integer (limits), or string (tier names)

```sql
-- Already included in organizations table above:
feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb

-- Example flag structure:
-- {
--   "ai_chat_enabled": true,
--   "rag_enabled": false,
--   "max_proposals_per_month": 10,
--   "salesforce_integration": false,
--   "export_docx": true
-- }

-- Querying a flag in application code:
SELECT feature_flags->>'ai_chat_enabled' FROM organizations WHERE id = $1;

-- Updating a flag (admin operation via service role):
UPDATE organizations
SET feature_flags = feature_flags || '{"ai_chat_enabled": true}'::jsonb
WHERE id = $1;
```

**In React (after loading org profile via AuthContext):**
```typescript
const isAiChatEnabled = profile?.organizations?.feature_flags?.ai_chat_enabled ?? false
```

---

### Pattern 9: Usage Tracking Events

**What:** Append-only event log. One row per trackable action.
**Design decision:** Event log (vs. aggregate counters) because:
- Counters can't be corrected if code has a bug
- Raw events enable any future aggregation query
- Postgres can aggregate efficiently with a date index

```typescript
// Utility function to log usage (call after each tracked operation)
// src/lib/trackUsage.ts
import { supabase } from './supabase'

export async function trackUsage(
  orgId: string,
  userId: string | null,
  eventType: string,
  metadata: Record<string, unknown> = {},
  proposalId?: string
): Promise<void> {
  await supabase.from('usage_events').insert({
    org_id: orgId,
    user_id: userId,
    event_type: eventType,
    proposal_id: proposalId ?? null,
    metadata,
  })
  // Non-blocking: fire and forget — don't await in hot paths
}

// Example call after generating a proposal section:
trackUsage(orgId, userId, 'section_generated', {
  model: 'claude-sonnet-4-5',
  section_key: 'executive_summary',
  tokens_in: 1200,
  tokens_out: 4500,
}, proposalId)
```

---

### Anti-Patterns to Avoid

- **Calling `createClient()` inside a React component:** Creates a new connection on every render. Use the module-level singleton from `src/lib/supabase.ts`.
- **Using `service_role` key in the React client:** The service role bypasses all RLS. It belongs only in Supabase Edge Functions. Never put it in `VITE_` env vars.
- **Relying on application-layer org scoping instead of RLS:** If a developer forgets to add `.eq('org_id', orgId)` to a query, RLS is the safety net. Without RLS, that's a data leak.
- **Writing RLS policies with direct subqueries (not wrapped in SELECT):** `USING (org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()))` — the `SELECT` wrapper is required for Postgres query plan caching. Without it, the subquery re-runs per row.
- **Storing `is_archived` and `deleted_at` only in React Context:** These must live in the DB so they survive page refresh and are visible to other users in the same org.
- **Creating the documents Storage bucket after writing RLS policies:** Bucket must exist before storage policies are evaluated. Create bucket first (via dashboard or CLI), then apply SQL policies.
- **Fetching proposals in ProposalsProvider before the auth session loads:** The session is async; always gate DB fetches on `session !== null` from AuthContext.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session persistence + refresh | Custom JWT store | Supabase `persistSession: true` (default) | Token refresh, storage, and PKCE handled automatically |
| Multi-tenant data isolation | App-layer org_id filter on every query | RLS policies | RLS enforced at DB level; app filters can be forgotten |
| TypeScript DB types | Manual type definitions for each table | `supabase gen types typescript` | Generated from live schema; always accurate |
| Auth state reactivity | Polling `getSession()` | `onAuthStateChange()` subscription | Event-driven, no polling overhead |
| Storage signed URLs | Custom URL signing | `supabase.storage.from().createSignedUrl()` | Handles expiry, permissions, CDN integration |

**Key insight:** Supabase's client handles auth, session, and RLS automatically. The most dangerous thing you can do is work around these mechanisms.

---

## Common Pitfalls

### Pitfall 1: `get_user_org_id()` not in `private` schema

**What goes wrong:** If the helper function is in the `public` schema, Supabase's API exposes it as an RPC endpoint, which is a security risk. Any caller can invoke it to discover org IDs.
**Why it happens:** Tutorials often use `public` schema for convenience.
**How to avoid:** Create the function in a `private` schema (or `auth` schema). The `private` schema is not in Supabase's exposed schema list by default.
**Warning signs:** Supabase Security Advisor flags "security_definer_view" or "exposed function" warnings.

### Pitfall 2: New API Key Format (publishable vs. anon)

**What goes wrong:** Env var named `VITE_SUPABASE_ANON_KEY` but project uses new `sb_publishable_...` format, or vice versa.
**Why it happens:** Supabase migrated away from JWT-based anon keys in late 2025. New projects have `sb_publishable_...` keys; older projects have JWT `anon` keys.
**How to avoid:** Check your project's API settings to determine which format you have. Use `VITE_SUPABASE_PUBLISHABLE_KEY` for new projects, `VITE_SUPABASE_ANON_KEY` for old. Both work identically in `createClient()`.
**Warning signs:** 401 errors on first API call; `createClient()` throws at module load.

### Pitfall 3: RLS blocks the `user_profiles` INSERT on signup

**What goes wrong:** The `handle_new_user()` trigger fires but fails silently because RLS on `user_profiles` has no INSERT policy allowing the trigger to write. The trigger runs as the triggering user, not as a superuser.
**Why it happens:** The trigger function needs `SECURITY DEFINER` and an explicit `SET search_path = public` to run with elevated privileges.
**How to avoid:** Ensure `handle_new_user()` is `SECURITY DEFINER`. Add `SET search_path = public` to prevent search path injection attacks.
**Warning signs:** User signs up successfully but `user_profiles` has no row for them; all subsequent RLS queries return 0 rows.

### Pitfall 4: Proposals query fires before session is loaded

**What goes wrong:** ProposalsContext `useEffect` runs immediately on mount. If `supabase.auth.getSession()` hasn't resolved yet, the query runs as an unauthenticated user and returns nothing (or throws a 401). The context sets `proposals = []` and `loading = false`, so the UI appears empty forever.
**Why it happens:** React `useEffect` fires synchronously after first render; Supabase session loading is async.
**How to avoid:** Gate the proposals fetch on `session !== null`:
```typescript
const { session } = useAuth()
useEffect(() => {
  if (!session) return  // Wait for auth before querying
  // ... fetch proposals
}, [session])
```
**Warning signs:** App loads empty on refresh even though data exists in DB.

### Pitfall 5: Storage `foldername()` returns text not UUID

**What goes wrong:** RLS policy compares `storage.foldername(name)[1]` (TEXT) to the result of `get_user_org_id()` (UUID). Postgres type mismatch — policy never matches, all uploads fail.
**Why it happens:** `storage.foldername()` always returns text. `get_user_org_id()` returns UUID.
**How to avoid:** Always cast the UUID to text in the comparison:
```sql
(storage.foldername(name))[1] = (SELECT (private.get_user_org_id())::text)
```
**Warning signs:** Storage uploads return 403 even for own org's folder.

### Pitfall 6: `deleted_at IS NOT NULL` proposals leak through in standard select

**What goes wrong:** A query that does not explicitly filter on `deleted_at` will return soft-deleted proposals. The RLS SELECT policy for normal users already adds `AND deleted_at IS NULL`, but if a query runs via service role (bypassing RLS), soft-deletes become visible.
**Why it happens:** Service role bypasses all RLS.
**How to avoid:** In Edge Functions that use service role, always add `.is('deleted_at', null)` explicitly for any proposals query meant to return active proposals.

### Pitfall 7: `private` schema must be created before migration runs

**What goes wrong:** `CREATE FUNCTION private.get_user_org_id()` fails because the `private` schema doesn't exist yet.
**Why it happens:** Supabase Postgres doesn't have a `private` schema by default.
**How to avoid:** Add `CREATE SCHEMA IF NOT EXISTS private;` as the first line in the RLS helper functions migration.

---

## Code Examples

### Fetching proposals with full type safety

```typescript
// src/context/ProposalsContext.tsx (updated pattern)
import type { Database } from '../types/database.types'
import { supabase } from '../lib/supabase'

type ProposalRow = Database['public']['Tables']['proposals']['Row']

const { data, error } = await supabase
  .from('proposals')
  .select('*')
  .is('deleted_at', null)
  .eq('is_archived', false)
  .order('created_at', { ascending: false })

// data is typed as ProposalRow[] automatically
```

### Creating a proposal

```typescript
const { data, error } = await supabase
  .from('proposals')
  .insert({
    org_id: profile.org_id,       // from AuthContext
    created_by: profile.id,        // from AuthContext
    title: formData.title,
    status: 'draft',
    client_name: formData.clientName,
    therapeutic_area: formData.therapeuticArea,
    due_date: formData.dueDate,
    estimated_value: formData.value,
  })
  .select()
  .single()
// Returns typed ProposalRow
```

### Soft-deleting a proposal (replaces permanentlyDelete in the interim)

```typescript
// DeletedContext equivalent: mark deleted_at instead of filtering from array
await supabase
  .from('proposals')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', proposalId)
  // RLS ensures only own org's proposals can be updated
```

### Archiving a proposal

```typescript
// ArchivedContext equivalent
await supabase
  .from('proposals')
  .update({ is_archived: true })
  .eq('id', proposalId)
```

### Realtime subscription (for Phase 4+, but wire the pattern now)

```typescript
// Source: RESEARCH-backend.md §1.4
useEffect(() => {
  const channel = supabase
    .channel(`proposals:${orgId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'proposals',
      filter: `org_id=eq.${orgId}`,
    }, (payload) => {
      // Refresh local cache on remote change
      if (payload.eventType === 'INSERT') {
        setProposals(prev => [payload.new as ProposalRow, ...prev])
      }
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [orgId])
```

---

## Order of Operations

This is the critical dependency chain. Each step depends on the previous.

```
1. Create Supabase project (dashboard)
   └── Copy URL + publishable key

2. supabase init (in project root)
   └── Creates supabase/ directory structure

3. Write migration files (in order: 000001 → 000014)
   └── Extensions first (vector), then tables, then functions, then policies

4. supabase db push (or apply migrations via dashboard)
   └── Verifies each migration file runs without error

5. Create 'documents' Storage bucket (dashboard: private, no public access)
   └── Then run migration 000014 (storage policies)

6. supabase gen types typescript --project-id <ref> > src/types/database.types.ts
   └── Generates typed client

7. Install @supabase/supabase-js
   └── npm install @supabase/supabase-js

8. Create src/lib/supabase.ts (singleton)
   └── Imports database.types.ts

9. Create src/context/AuthContext.tsx
   └── Session + user profile loading

10. Update App.tsx: wrap with AuthProvider (outermost)
    └── Other providers stay inside

11. Update ProposalsContext.tsx
    └── Switch from useState(rawProposals) to Supabase fetch

12. Update DeletedContext.tsx
    └── Switch from deletedMap to soft-delete update

13. Update ArchivedContext.tsx
    └── Switch from archivedIds Set to is_archived update

14. Add loading/error states to each provider
    └── UI components need to handle loading: true state

15. Seed test org + user via supabase/seed.sql
    └── Verify RLS: log in as user, confirm only own org's proposals visible
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `anon` JWT key in `.env` | `sb_publishable_...` key in `.env` | Nov 2025 (new projects) | Same behavior; new naming convention |
| IVFFlat vector index | HNSW vector index | pgvector 0.5.0 (2023) | HNSW builds without data; no training phase; faster queries |
| `process.env.VITE_*` | `import.meta.env.VITE_*` | Vite 3+ | process is not defined in Vite — must use import.meta.env |
| `supabase.auth.getSession()` polling | `supabase.auth.onAuthStateChange()` | Current standard | Event-driven; no polling overhead |
| In-memory React Context | Supabase-backed Context | This phase | Persistence, multi-user sync, and RLS enforcement |

**Deprecated/outdated:**
- `@supabase/auth-helpers-react`: Replaced by direct `@supabase/supabase-js` v2 patterns. Do not install.
- `supabase.auth.user()`: Removed in v2. Use `supabase.auth.getUser()` or `onAuthStateChange`.

---

## Open Questions

1. **Supabase project already exists vs. needs to be created**
   - What we know: The README and planning docs don't mention an existing Supabase project ref.
   - What's unclear: Is there an existing project, or does the developer need to create one from scratch?
   - Recommendation: Planner should add a task "Create Supabase project + record project ref in .env.local" as the first Wave 0 task.

2. **Auth flow for Phase 1 vs. Phase 2**
   - What we know: Phase 1 scope includes wiring AuthContext. REQ-8 (login page, protected routes) is presumably Phase 2.
   - What's unclear: Should Phase 1 include a minimal login page to enable manual RLS testing, or just the Supabase wiring?
   - Recommendation: Phase 1 should include the minimal auth flow (login form + session persistence) sufficient to test RLS. A full auth UI is Phase 2.

3. **Schema for `private` schema on Supabase**
   - What we know: The `private` schema must be created before helper functions.
   - What's unclear: Whether Supabase's dashboard auto-creates `private` or if it must be in a migration.
   - Recommendation: Add `CREATE SCHEMA IF NOT EXISTS private;` to migration 000012 as the first statement. Safe to include regardless.

4. **`proposal_documents` naming vs. `documents`**
   - What we know: REQ-7.2 names the table `proposal_documents`. The prior research document uses `documents`.
   - What's unclear: Will later phases (document parsing Edge Function) reference this table by one name or the other?
   - Recommendation: Use `proposal_documents` per REQ-7.2. The prior research uses `documents` as an example name only.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None currently installed — see Wave 0 gaps below |
| Config file | None — Wave 0 creates `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

No test framework is currently installed. This phase's validations are primarily **integration verifications** (manual SQL + network), not unit tests. The Wave 0 gap below installs vitest for future phases; Phase 1 deliverables are verified via the manual checklist below.

### Phase Requirements Verification Map

| Req ID | Behavior | Test Type | Verification Method |
|--------|----------|-----------|---------------------|
| REQ-7.1 | Supabase Postgres connected | smoke | Query `supabase.from('proposals').select('count')` — returns without error |
| REQ-7.2 | All 9 tables exist | smoke | `SELECT tablename FROM pg_tables WHERE schemaname = 'public'` — verify all 9 names present |
| REQ-7.3 | RLS enforced on every table | integration | Two-user cross-org test (see below) |
| REQ-7.4 | org_id on every row | schema check | `SELECT column_name FROM information_schema.columns WHERE column_name = 'org_id'` — must return 8 rows |
| REQ-7.5 | Storage bucket + RLS | smoke | Upload a file as Org A user; attempt download as Org B user — expect 403 |
| REQ-7.6 | pgvector + regulatory_chunks | schema check | `SELECT * FROM pg_extension WHERE extname = 'vector'` — must return a row |
| REQ-7.9 | Usage events insert | smoke | `trackUsage()` call inserts row into `usage_events` without error |
| REQ-7.10 | Feature flags column | schema check | `SELECT feature_flags FROM organizations LIMIT 1` — returns JSONB |

### RLS Integration Verification (manual — critical)

```sql
-- Step 1: Create two test orgs + users via seed.sql or dashboard
-- Step 2: Log in as user_a (org_a), insert a proposal
-- Step 3: Log in as user_b (org_b), run:
SELECT * FROM proposals;
-- Expected: 0 rows (cannot see org_a's proposals)

-- Step 4: Attempt direct insert with wrong org_id:
INSERT INTO proposals (org_id, ...) VALUES ('<org_b_id>', ...);
-- Expected: RLS CHECK violation error

-- Step 5: Verify soft-delete is invisible:
-- As user_a, soft-delete a proposal. SELECT * FROM proposals should not return it.
-- As admin user_a, run SELECT * FROM proposals should also not return it (admin policy needed for trash view).
```

### React Client Verification

```typescript
// Smoke test in browser console after client is wired:
import { supabase } from './src/lib/supabase'

// 1. Verify client initializes without error
console.log('Supabase URL:', supabase.supabaseUrl)

// 2. Verify session loads
const { data: { session } } = await supabase.auth.getSession()
console.log('Session:', session ? 'authenticated' : 'no session')

// 3. Verify proposals load (after login)
const { data, error } = await supabase.from('proposals').select('*')
console.log('Proposals:', data?.length, 'Error:', error?.message)
```

### Wave 0 Gaps

- [ ] `vitest` not installed — run `npm install -D vitest @vitest/ui` before writing any test files (needed by Phase 2+)
- [ ] `supabase/seed.sql` — create test org + 2 users (one admin, one standard user) for RLS verification
- [ ] `.env.local` — must be created from Supabase dashboard before any code runs

*(No automated test files needed for Phase 1 itself. Validation is schema checks + manual RLS cross-org test.)*

---

## Sources

### Primary (HIGH confidence)
- [supabase.com/docs/guides/getting-started/quickstarts/reactjs](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs) — client setup, env vars, Vite pattern
- [supabase.com/docs/guides/auth/quickstarts/react](https://supabase.com/docs/guides/auth/quickstarts/react) — onAuthStateChange, getClaims, session management
- [supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security) — RLS policy patterns, SECURITY DEFINER, performance wrapping
- [supabase.com/docs/guides/storage/security/access-control](https://supabase.com/docs/guides/storage/security/access-control) — storage RLS with foldername() helper
- [supabase.com/docs/guides/database/extensions/pgvector](https://supabase.com/docs/guides/database/extensions/pgvector) — CREATE EXTENSION, vector type, HNSW index
- [supabase.com/docs/guides/api/api-keys](https://supabase.com/docs/guides/api/api-keys) — publishable key vs. anon key migration status
- [supabase.com/docs/guides/api/rest/generating-types](https://supabase.com/docs/guides/api/rest/generating-types) — supabase gen types typescript command
- `.planning/research/RESEARCH-backend.md` — prior backend research (training-data confidence, August 2025)

### Secondary (MEDIUM confidence)
- [supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — SELECT wrapper caching recommendation
- [supabase.com/docs/guides/local-development/cli/getting-started](https://supabase.com/docs/guides/local-development/cli/getting-started) — supabase init + migrations folder

### Tertiary (LOW confidence — flag for validation)
- Multiple Medium/dev.to articles on React + Supabase patterns — not individually cited; verified against official docs above

---

## Metadata

**Confidence breakdown:**
- Client setup + TypeScript types: HIGH — verified against official quickstart docs
- Schema design: HIGH — canonical multi-tenant patterns from official RLS docs + prior research
- RLS policies: HIGH — verified against official RLS docs; performance wrapping pattern confirmed
- Storage RLS: HIGH — verified against official storage access control docs
- pgvector/HNSW: HIGH — verified against official pgvector extension docs
- Feature flags JSONB design: MEDIUM — pattern is standard; specific column structure is a design choice
- Usage tracking schema: MEDIUM — event log pattern is standard; specific event_type values are a design choice
- Context migration pattern: HIGH — React async state + useEffect + session gating is well-established

**Research date:** 2026-03-05
**Valid until:** 2026-06-05 (90 days — Supabase is active but core patterns are stable)
