# Research: Integrations & UX Patterns

**Project:** Jamo — B2B SaaS CRO Proposal Generation Platform
**Researched:** 2026-03-05
**Researcher note:** Bash, WebSearch, and WebFetch tools were unavailable in this environment.
All findings are from training data (cutoff August 2025). Confidence levels are assigned per claim.
Items marked LOW confidence should be verified against current official docs before implementation.

---

## Research Area 1: Salesforce Integration

### 1.1 Authentication — OAuth 2.0 from a Supabase Edge Function

**Confidence: HIGH** for flow selection and endpoint patterns. **MEDIUM** for exact current API version.

#### Which OAuth flow to use

For a server-side caller (Supabase Edge Function, no browser involved), the correct flow is
**OAuth 2.0 Username-Password Flow** or **JWT Bearer Token Flow**. The Web Server Flow (3-legged OAuth)
is for user-facing apps where the _end user_ grants access. For a backend integration using a
service/integration user, you want one of two server-to-server approaches:

| Flow | When to use | Pros | Cons |
|------|-------------|------|------|
| **JWT Bearer Token (recommended)** | Service-to-service, no user consent needed | No password in code, refresh not needed, scales well | Requires RSA key pair setup in Connected App |
| **Username-Password** | Quick prototyping or internal tools | Simple to implement | Password in env vars, blocked by some org security policies, no MFA support |
| **Client Credentials (OAuth 2.0)** | Server-to-server without user context | Standard OAuth 2.0, no user credentials | Requires Connected App with specific settings, org must enable it |

**Recommendation: JWT Bearer Token Flow** for production. Use Username-Password during development only.

#### JWT Bearer Token Flow — Step by Step

```
1. Create a Connected App in Salesforce Setup
   - Enable OAuth settings
   - Set callback URL (placeholder: https://localhost for backend flows)
   - Select scopes: api, refresh_token (or just api)
   - Upload an RSA x509 certificate (you hold the private key)
   - Enable "Use digital signatures"
   - Pre-authorize for the integration user

2. Generate RSA key pair (run once, store private key in Supabase secrets)
   openssl genrsa -out server.key 2048
   openssl req -new -x509 -days 3650 -key server.key -out server.crt

3. From Edge Function, build a JWT assertion:
   Header: { alg: "RS256", typ: "JWT" }
   Payload: {
     iss: "<connected_app_consumer_key>",
     sub: "<salesforce_username>",
     aud: "https://login.salesforce.com",   // or test.salesforce.com for sandbox
     exp: <current_unix_time + 3 minutes>
   }
   Sign with private key using RS256

4. Exchange JWT for access token:
   POST https://login.salesforce.com/services/oauth2/token
   Body (form-encoded):
     grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
     assertion=<signed_jwt>

5. Response:
   {
     "access_token": "...",
     "instance_url": "https://yourorg.my.salesforce.com",
     "token_type": "Bearer"
   }
   Note: No refresh_token is returned. Re-request a new access_token when it expires (~1 hour).
```

#### JWT signing in a Supabase Edge Function (Deno)

Supabase Edge Functions run on Deno. The Web Crypto API is available natively.

```typescript
// supabase/functions/salesforce-auth/index.ts

const PRIVATE_KEY_PEM = Deno.env.get("SALESFORCE_PRIVATE_KEY")!; // stored in Supabase secrets
const CONSUMER_KEY    = Deno.env.get("SALESFORCE_CONSUMER_KEY")!;
const SF_USERNAME     = Deno.env.get("SALESFORCE_USERNAME")!;
const SF_LOGIN_URL    = Deno.env.get("SALESFORCE_IS_SANDBOX") === "true"
  ? "https://test.salesforce.com"
  : "https://login.salesforce.com";

async function getSalesforceToken(): Promise<{ accessToken: string; instanceUrl: string }> {
  // Build JWT header + payload
  const header  = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: CONSUMER_KEY,
    sub: SF_USERNAME,
    aud: SF_LOGIN_URL,
    exp: Math.floor(Date.now() / 1000) + 180, // 3-minute window
  }));

  const signingInput = `${header}.${payload}`;

  // Import RSA private key
  const keyData = pemToArrayBuffer(PRIVATE_KEY_PEM); // helper below
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  // Exchange for access token
  const res = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Salesforce token exchange failed: ${err}`);
  }

  const data = await res.json();
  return { accessToken: data.access_token, instanceUrl: data.instance_url };
}

// Helper: PEM string -> ArrayBuffer
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  bytes.forEach(b => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
```

**Confidence: MEDIUM.** The crypto.subtle approach works in Deno but the exact PEM parsing
may need adjustment. Verify against Deno's crypto docs or use a library like `djwt`
(available as a Deno module) to simplify JWT signing.

Alternative: Use the `djwt` Deno library (`https://deno.land/x/djwt`) which handles
all JWT encoding/signing natively in Deno without manual crypto operations.

---

### 1.2 Reading Opportunities and Accounts

**Confidence: HIGH** — Salesforce REST API object endpoints are stable and well-documented.

#### REST API pattern

```
Base URL: {instance_url}/services/data/v{api_version}/
Current recommended version: v62.0 (or v60.0 — verify at Setup > Apex > API)
```

#### Reading Opportunities

```typescript
// Read a list of Opportunities (with key fields for proposal context)
async function getOpportunities(
  accessToken: string,
  instanceUrl: string,
  accountId?: string
): Promise<SalesforceOpportunity[]> {
  const soql = accountId
    ? `SELECT Id, Name, AccountId, Account.Name, StageName, Amount, CloseDate,
              Description, OwnerId, Owner.Name, CreatedDate, LastModifiedDate
       FROM Opportunity
       WHERE AccountId = '${accountId}'
       ORDER BY LastModifiedDate DESC
       LIMIT 50`
    : `SELECT Id, Name, AccountId, Account.Name, StageName, Amount, CloseDate,
              Description, OwnerId, Owner.Name, CreatedDate, LastModifiedDate
       FROM Opportunity
       ORDER BY LastModifiedDate DESC
       LIMIT 50`;

  const res = await fetch(
    `${instanceUrl}/services/data/v62.0/query?q=${encodeURIComponent(soql)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) throw new Error(`SOQL query failed: ${await res.text()}`);
  const data = await res.json();
  return data.records as SalesforceOpportunity[];
}

// TypeScript interface for Opportunity
interface SalesforceOpportunity {
  Id: string;
  Name: string;
  AccountId: string;
  Account: { Name: string };
  StageName: string;
  Amount: number;
  CloseDate: string;
  Description: string | null;
  OwnerId: string;
  Owner: { Name: string };
  CreatedDate: string;
  LastModifiedDate: string;
}
```

#### Reading Accounts

```typescript
async function getAccount(
  accessToken: string,
  instanceUrl: string,
  accountId: string
): Promise<SalesforceAccount> {
  const res = await fetch(
    `${instanceUrl}/services/data/v62.0/sobjects/Account/${accountId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) throw new Error(`Account fetch failed: ${await res.text()}`);
  return res.json();
}

interface SalesforceAccount {
  Id: string;
  Name: string;
  Industry: string;
  BillingCity: string;
  BillingCountry: string;
  Phone: string;
  Website: string;
  NumberOfEmployees: number;
  AnnualRevenue: number;
  Description: string | null;
}
```

---

### 1.3 Writing Proposal Status Back to Salesforce

**Confidence: HIGH** — PATCH/UPDATE via REST SObject endpoint is standard.

```typescript
// Update Opportunity stage and add a description note when proposal is sent
async function updateOpportunityStatus(
  accessToken: string,
  instanceUrl: string,
  opportunityId: string,
  updates: {
    StageName?: string;
    Description?: string;
    // Custom field example: Jamo_Proposal_URL__c?: string;
  }
): Promise<void> {
  const res = await fetch(
    `${instanceUrl}/services/data/v62.0/sobjects/Opportunity/${opportunityId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    }
  );

  // Salesforce returns 204 No Content on success for PATCH
  if (res.status !== 204) {
    const err = await res.text();
    throw new Error(`Opportunity update failed: ${err}`);
  }
}

// Example: writing a custom Jamo field to track proposal link
// Requires custom field "Jamo_Proposal_ID__c" created in Salesforce Setup
await updateOpportunityStatus(token, url, oppId, {
  StageName: "Proposal/Price Quote",
  // Jamo_Proposal_ID__c: "jamo-proposal-uuid",
});
```

**Custom fields gotcha:** Standard Salesforce orgs don't have a "Jamo Proposal URL" field.
Either write into Description (easy, no setup) or create a custom field (requires Salesforce
admin access). Design the MVP to write into Description or a Notes/Task object to avoid
requiring Salesforce admin setup from the customer.

**Alternative write target — Chatter post or Task record:**
```typescript
// Create a Task (activity) linked to the Opportunity
async function createTask(
  accessToken: string,
  instanceUrl: string,
  opportunityId: string,
  subject: string,
  description: string
): Promise<string> {
  const res = await fetch(
    `${instanceUrl}/services/data/v62.0/sobjects/Task`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        WhatId: opportunityId, // links to Opportunity
        Subject: subject,
        Description: description,
        Status: "Completed",
        ActivityDate: new Date().toISOString().split("T")[0],
      }),
    }
  );
  const data = await res.json();
  return data.id;
}
```

---

### 1.4 API Version Strategy

**Confidence: MEDIUM** — version numbers advance yearly; verify current latest.

- Salesforce releases 3 API versions per year (Spring, Summer, Winter)
- As of mid-2025, v62.0 is current. This will advance.
- **Best practice:** Store the version in an env var (`SALESFORCE_API_VERSION=v62.0`) and do
  not hardcode it. This allows upgrading without code changes.
- **Discovery endpoint:** `GET {instance_url}/services/data/` returns all supported versions
  for that org.
- Minimum safe floor for modern features: v55.0+

```typescript
// Discover and use latest API version dynamically
async function getLatestApiVersion(instanceUrl: string, accessToken: string): Promise<string> {
  const res = await fetch(`${instanceUrl}/services/data/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const versions: Array<{ version: string }> = await res.json();
  return `v${versions[versions.length - 1].version}`;
}
```

---

### 1.5 Secure Token Storage in Supabase

**Confidence: HIGH** — this is standard Supabase pattern.

**Do not** store access tokens in the database. Access tokens are short-lived (~1 hour) and
can be regenerated via JWT assertion. What to store:

| Secret | Where | How |
|--------|-------|-----|
| `SALESFORCE_PRIVATE_KEY` | Supabase Vault / Edge Function secrets | `supabase secrets set SALESFORCE_PRIVATE_KEY="$(cat server.key)"` |
| `SALESFORCE_CONSUMER_KEY` | Supabase Edge Function secrets | Same pattern |
| `SALESFORCE_USERNAME` | Supabase Edge Function secrets | Same pattern |
| `SALESFORCE_IS_SANDBOX` | Supabase Edge Function secrets | "true" or "false" |
| Per-org credentials | `salesforce_connections` table in Postgres | Encrypted at rest, row-level per org/user |

For multi-tenant (multiple customers connecting their own Salesforce), store per-org
connection metadata in a database table:

```sql
CREATE TABLE salesforce_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_url TEXT NOT NULL,
  consumer_key TEXT NOT NULL,
  username TEXT NOT NULL,
  -- Do NOT store private key here; use Vault or org-level secrets
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);

ALTER TABLE salesforce_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own connections" ON salesforce_connections
  FOR ALL USING (auth.uid() = user_id);
```

For MVP (single-org or internal tool), use Edge Function secrets only. No database table needed.

---

### 1.6 Rate Limits and Sandbox vs. Production

**Confidence: MEDIUM** — limits are documented but subject to org-specific changes.

#### API Rate Limits

| Limit Type | Value | Notes |
|------------|-------|-------|
| Per-day API calls | 15,000 (Developer Edition) / 100,000+ (Enterprise) | Depends on org edition |
| Per-request query rows | 2,000 (default) / up to 50,000 with queryLocator pagination | Use `nextRecordsUrl` for pagination |
| Concurrent API requests | 25 per org | Edge Function calls count |
| Bulk API threshold | 2,000+ records | Switch to Bulk API 2.0 for large datasets |

```typescript
// Handle pagination for large result sets
async function getAllOpportunities(
  accessToken: string,
  instanceUrl: string,
  apiVersion: string
): Promise<SalesforceOpportunity[]> {
  const records: SalesforceOpportunity[] = [];
  let url = `${instanceUrl}/services/data/${apiVersion}/query?q=${encodeURIComponent(soql)}`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    records.push(...data.records);
    url = data.nextRecordsUrl
      ? `${instanceUrl}${data.nextRecordsUrl}`
      : null;
  }
  return records;
}
```

#### Sandbox vs. Production

| Difference | Sandbox | Production |
|------------|---------|------------|
| Login URL | `test.salesforce.com` | `login.salesforce.com` |
| My Domain | `*.sandbox.my.salesforce.com` | `*.my.salesforce.com` |
| Data | Refreshed from production periodically | Live |
| API limits | Usually lower | Full per-edition limits |
| Connected App | Must be separately configured in sandbox | Separate config in production |

**Critical gotcha:** The `aud` claim in the JWT assertion must match the login URL exactly:
`https://test.salesforce.com` for sandbox, `https://login.salesforce.com` for production.
Using the wrong audience will cause the token exchange to fail silently with an invalid_grant error.

**Recommendation:** Use an env var `SALESFORCE_IS_SANDBOX=true|false` and branch the `aud`
and login URL accordingly.

---

## Research Area 2: Rich Text Editor for React

### 2.1 Comparison Matrix

**Confidence: HIGH** for TipTap, Lexical, Slate. **MEDIUM** for Quill (it has been relatively
stagnant since 2019).

| Criterion | TipTap v2 | Lexical (Meta) | Slate.js | Quill |
|-----------|-----------|----------------|----------|-------|
| React 19 support | Yes | Yes | Yes | Partial (community wrappers) |
| TypeScript | First-class | First-class | Decent | Poor |
| Headless / bring-your-own-UI | Yes (core is headless) | Yes | Yes | No (opinionated DOM) |
| Extension/plugin system | Excellent (ProseMirror) | Good | Manual | Poor |
| Programmatic content insert | `editor.commands.insertContent()` | `editor.update()` via LexicalEditor | `Transforms.insertText()` | `quill.insertText()` |
| Custom block types | Yes, via Node extensions | Yes, via custom nodes | Yes, via Element types | Limited |
| Collaborative editing (future) | Yes (with Yjs) | Yes (experimental) | Via plugins | No |
| Version history | Via Yjs snapshots or custom | Via EditorState history | Manual | No |
| Lock/unlock sections | Via custom extension | Via custom readonly node | Via custom with `normalizeNode` | Not supported |
| AI content injection | Excellent | Good | Requires careful selection API | Adequate |
| Bundle size | ~130kb (core) | ~90kb | ~50kb (but needs more code) | ~200kb |
| Maturity | 4+ years, stable v2 | 3+ years, production at Meta | 7+ years, stable | 10+ years, abandoned-ish |
| ProseMirror under the hood | Yes | No (custom engine) | No (custom) | Yes (via ProseMirror) |
| Community / ecosystem | Large | Growing fast | Medium | Shrinking |

### 2.2 Recommendation: TipTap v2

**Confidence: HIGH**

TipTap is the right choice for Jamo's requirements. Rationale:

1. **AI content injection** — TipTap's `editor.commands.insertContentAt()` and
   `editor.commands.setContent()` work at the document-model level, making it trivial to
   target specific sections and inject or replace content from streaming AI.

2. **Lock/unlock sections** — Achievable via a custom Node Extension that sets
   `this.options.editable` conditionally, or by using the `ReadOnly` extension on a per-node
   basis. TipTap also supports `editor.setEditable(false)` globally.

3. **Custom block types** — TipTap's ProseMirror foundation gives access to a rich node/mark
   schema. Sections, subsections, tables, and callouts are all straightforward Node extensions.

4. **Headless** — Works perfectly with Tailwind CSS; no style conflicts.

5. **React 19** — TipTap's `useEditor` hook and `<EditorContent />` component work with React 19.

6. **Version history** — Can be built using `editor.on('update', ...)` to snapshot state into
   Supabase on each save, and restoring with `editor.commands.setContent(previousState)`.

**When Lexical wins instead:** If Meta's backing and bundle size are critical, or if you anticipate
needing collaborative editing at scale (Lexical's Collab plugin is tighter). But for the Jamo MVP,
TipTap's maturity and extension ecosystem win.

**When Slate wins instead:** If you need maximum control over the rendering pipeline and are
willing to build most features from scratch. Not recommended for an MVP timeline.

**Quill — do not use.** Active development has largely stalled. React 19 compatibility is via
third-party wrappers. Better options exist.

---

### 2.3 TipTap Setup for Jamo

```typescript
// Install
// npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-text-style

// src/components/ProposalEditor/ProposalEditor.tsx
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { LockedSection } from "./extensions/LockedSection"; // custom
import { AIHighlight } from "./extensions/AIHighlight";    // custom

interface ProposalEditorProps {
  content: string;         // JSON or HTML string
  onUpdate: (json: object) => void;
  lockedSectionIds: string[];
  isReadOnly?: boolean;
}

export function ProposalEditor({
  content,
  onUpdate,
  lockedSectionIds,
  isReadOnly = false,
}: ProposalEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      LockedSection.configure({ lockedIds: lockedSectionIds }),
      AIHighlight,
    ],
    content,
    editable: !isReadOnly,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getJSON());
    },
  });

  return (
    <EditorContent
      editor={editor}
      className="prose prose-sm max-w-none focus:outline-none"
    />
  );
}
```

---

### 2.4 Programmatic AI Content Injection

```typescript
// Targeting a specific section by its node ID (stored as a data-section-id attribute)
function injectAIContentIntoSection(
  editor: Editor,
  sectionId: string,
  newContent: string
): void {
  // Find the position of the node with the matching section ID
  let targetPos: number | null = null;
  let targetEnd: number | null = null;

  editor.state.doc.forEach((node, offset) => {
    if (node.attrs["data-section-id"] === sectionId) {
      targetPos = offset + 1; // +1 to position inside node
      targetEnd = offset + node.nodeSize;
    }
  });

  if (targetPos === null) return;

  // Replace the section's content with the new AI-generated text
  editor
    .chain()
    .focus()
    .deleteRange({ from: targetPos, to: targetEnd! })
    .insertContentAt(targetPos, newContent)
    .run();
}

// For streaming: append chunks as they arrive
function appendStreamChunk(editor: Editor, sectionId: string, chunk: string): void {
  // Find end of target section
  let insertPos: number | null = null;

  editor.state.doc.forEach((node, offset) => {
    if (node.attrs["data-section-id"] === sectionId) {
      insertPos = offset + node.nodeSize - 1; // before closing tag
    }
  });

  if (insertPos === null) return;

  editor.chain().insertContentAt(insertPos, chunk).run();
}
```

---

### 2.5 Lock/Unlock Section Implementation

**Confidence: HIGH** — TipTap Node extensions are well-documented for this pattern.

```typescript
// src/components/ProposalEditor/extensions/LockedSection.ts
import { Node, mergeAttributes } from "@tiptap/core";

export interface LockedSectionOptions {
  lockedIds: string[];
}

export const LockedSection = Node.create<LockedSectionOptions>({
  name: "lockedSection",
  group: "block",
  content: "block+",
  defining: true,

  addOptions() {
    return { lockedIds: [] };
  },

  addAttributes() {
    return {
      id: { default: null },
      locked: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-type='locked-section']" }];
  },

  renderHTML({ HTMLAttributes }) {
    const isLocked = this.options.lockedIds.includes(HTMLAttributes.id);
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-type": "locked-section",
        "data-locked": isLocked ? "true" : "false",
        contenteditable: isLocked ? "false" : undefined,
        class: isLocked
          ? "opacity-60 cursor-not-allowed border-l-4 border-gray-300 pl-4"
          : "border-l-4 border-jamo-200 pl-4",
      }),
      0, // 0 means "render children here"
    ];
  },

  addNodeView() {
    // Optional: React node view for lock/unlock toggle button in UI
    return null;
  },
});
```

**UI Lock Toggle:**
```tsx
// The lock toggle lives outside the editor — it updates state in React,
// which re-passes lockedSectionIds to the extension via editor.setOptions()
function SectionHeader({
  sectionId,
  isLocked,
  onToggleLock,
}: {
  sectionId: string;
  isLocked: boolean;
  onToggleLock: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-semibold text-gray-700">Section Title</h3>
      <button
        onClick={() => onToggleLock(sectionId)}
        className="text-xs text-gray-400 hover:text-jamo-500"
      >
        {isLocked ? "Unlock" : "Lock"}
      </button>
    </div>
  );
}
```

---

## Research Area 3: Multi-Step Wizard UX in React

### 3.1 Pattern Recommendation: Finite State Machine via useReducer

**Confidence: HIGH** — this is the established best practice for complex wizard flows.

For a proposal creation wizard with 4-7 steps (proposal metadata → client context →
scope/services → budget → review → "fast draft" shortcut), use a custom hook backed
by `useReducer`. This gives predictable state transitions, easy serialization to
sessionStorage, and clear "skip to fast draft" branching.

**Do not reach for a wizard library** (Formik Wizard, react-step-wizard, etc.) — they
add unnecessary abstraction and fight React Router. Custom is simpler and more flexible
for Jamo's needs.

---

### 3.2 Wizard State Shape

```typescript
// src/features/proposal-wizard/types.ts

type WizardStep =
  | "metadata"      // title, due date, value
  | "client"        // client name, Salesforce account link
  | "scope"         // study type, therapeutic area, services
  | "budget"        // budget tiers, timeline
  | "review"        // confirm and generate
  | "generating";   // AI streaming in progress

interface WizardState {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
  isFastDraft: boolean;
  formData: {
    metadata: Partial<ProposalMetadata>;
    client: Partial<ClientData>;
    scope: Partial<ScopeData>;
    budget: Partial<BudgetData>;
  };
  validation: Record<WizardStep, ValidationResult>;
  salesforceOpportunityId?: string;
}

type WizardAction =
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "GO_TO_STEP"; step: WizardStep }
  | { type: "FAST_DRAFT_SHORTCUT" }
  | { type: "UPDATE_FIELD"; step: WizardStep; field: string; value: unknown }
  | { type: "VALIDATE_STEP"; step: WizardStep; result: ValidationResult }
  | { type: "START_GENERATION" }
  | { type: "LINK_SALESFORCE"; opportunityId: string };
```

---

### 3.3 Core Wizard Hook

```typescript
// src/features/proposal-wizard/useWizard.ts
import { useReducer, useEffect, useCallback } from "react";

const STEP_ORDER: WizardStep[] = ["metadata", "client", "scope", "budget", "review"];
const FAST_DRAFT_STEPS: WizardStep[] = ["metadata", "client"]; // minimum steps for fast draft

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "NEXT_STEP": {
      const idx = STEP_ORDER.indexOf(state.currentStep);
      const next = STEP_ORDER[idx + 1] ?? state.currentStep;
      return {
        ...state,
        currentStep: next,
        completedSteps: new Set([...state.completedSteps, state.currentStep]),
      };
    }

    case "PREV_STEP": {
      const idx = STEP_ORDER.indexOf(state.currentStep);
      return {
        ...state,
        currentStep: STEP_ORDER[Math.max(0, idx - 1)],
      };
    }

    case "GO_TO_STEP": {
      // Only allow navigating to completed steps (not future ones)
      const canNavigate =
        state.completedSteps.has(action.step) || action.step === state.currentStep;
      return canNavigate ? { ...state, currentStep: action.step } : state;
    }

    case "FAST_DRAFT_SHORTCUT": {
      // Jump directly to review with isFastDraft=true
      // Only allowed after the minimum required steps are complete
      const hasMinimum = FAST_DRAFT_STEPS.every((s) => state.completedSteps.has(s));
      if (!hasMinimum) return state;
      return {
        ...state,
        currentStep: "review",
        isFastDraft: true,
        completedSteps: new Set([...state.completedSteps, state.currentStep]),
      };
    }

    case "UPDATE_FIELD": {
      return {
        ...state,
        formData: {
          ...state.formData,
          [action.step]: {
            ...state.formData[action.step as keyof typeof state.formData],
            [action.field]: action.value,
          },
        },
      };
    }

    case "START_GENERATION": {
      return { ...state, currentStep: "generating" };
    }

    default:
      return state;
  }
}

export function useWizard() {
  const [state, dispatch] = useReducer(wizardReducer, getInitialState());

  // Persist to sessionStorage on every state change
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "jamo_wizard_state",
        JSON.stringify({
          ...state,
          completedSteps: Array.from(state.completedSteps), // Set is not serializable
        })
      );
    } catch (_) {
      // ignore storage errors
    }
  }, [state]);

  const nextStep = useCallback(() => dispatch({ type: "NEXT_STEP" }), []);
  const prevStep = useCallback(() => dispatch({ type: "PREV_STEP" }), []);
  const goToStep = useCallback(
    (step: WizardStep) => dispatch({ type: "GO_TO_STEP", step }),
    []
  );
  const fastDraft = useCallback(() => dispatch({ type: "FAST_DRAFT_SHORTCUT" }), []);
  const updateField = useCallback(
    (step: WizardStep, field: string, value: unknown) =>
      dispatch({ type: "UPDATE_FIELD", step, field, value }),
    []
  );

  const canFastDraft = FAST_DRAFT_STEPS.every((s) =>
    state.completedSteps.has(s) || s === state.currentStep
  );

  return { state, nextStep, prevStep, goToStep, fastDraft, updateField, canFastDraft };
}

function getInitialState(): WizardState {
  try {
    const saved = sessionStorage.getItem("jamo_wizard_state");
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...parsed, completedSteps: new Set(parsed.completedSteps) };
    }
  } catch (_) {}

  return {
    currentStep: "metadata",
    completedSteps: new Set(),
    isFastDraft: false,
    formData: { metadata: {}, client: {}, scope: {}, budget: {} },
    validation: {} as Record<WizardStep, ValidationResult>,
  };
}
```

---

### 3.4 Per-Step Validation Pattern

```typescript
// src/features/proposal-wizard/validation.ts

type ValidationResult = { valid: boolean; errors: Record<string, string> };

const stepValidators: Record<WizardStep, (data: WizardState["formData"]) => ValidationResult> = {
  metadata: ({ metadata }) => {
    const errors: Record<string, string> = {};
    if (!metadata.title?.trim()) errors.title = "Title is required";
    if (!metadata.dueDate) errors.dueDate = "Due date is required";
    if (!metadata.value || metadata.value <= 0) errors.value = "Value must be > 0";
    return { valid: Object.keys(errors).length === 0, errors };
  },
  client: ({ client }) => {
    const errors: Record<string, string> = {};
    if (!client.name?.trim()) errors.name = "Client name is required";
    return { valid: Object.keys(errors).length === 0, errors };
  },
  scope: ({ scope }) => {
    const errors: Record<string, string> = {};
    if (!scope.studyType) errors.studyType = "Select a study type";
    if (!scope.services?.length) errors.services = "Select at least one service";
    return { valid: Object.keys(errors).length === 0, errors };
  },
  budget: () => ({ valid: true, errors: {} }), // optional step
  review: () => ({ valid: true, errors: {} }),
  generating: () => ({ valid: true, errors: {} }),
};

export function validateStep(
  step: WizardStep,
  formData: WizardState["formData"]
): ValidationResult {
  return stepValidators[step]?.(formData) ?? { valid: true, errors: {} };
}
```

---

### 3.5 Fast Draft Shortcut UX

The "fast draft" shortcut should appear in the wizard toolbar once the minimum steps
(metadata + client) are complete. It bypasses scope and budget steps and tells the AI
to generate a generic starting draft with placeholder content for the unspecified sections.

```tsx
// Inside the wizard step footer
{canFastDraft && currentStep !== "review" && (
  <button
    onClick={fastDraft}
    className="text-sm text-jamo-500 underline-offset-2 hover:underline"
  >
    Skip to fast draft
  </button>
)}
```

On the review/generating step, pass `isFastDraft: true` to the AI generation call so the
prompt can be adjusted (e.g., "generate a comprehensive but placeholder draft, filling in
budget and scope with best estimates based on the therapeutic area").

---

### 3.6 Step Indicator Component

```tsx
// src/features/proposal-wizard/StepIndicator.tsx
function StepIndicator({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
}: {
  steps: WizardStep[];
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
  onStepClick: (step: WizardStep) => void;
}) {
  return (
    <nav className="flex items-center gap-2">
      {steps.map((step, idx) => {
        const isCompleted = completedSteps.has(step);
        const isCurrent = step === currentStep;
        const isClickable = isCompleted;
        return (
          <button
            key={step}
            onClick={() => isClickable && onStepClick(step)}
            disabled={!isClickable}
            className={[
              "flex items-center gap-1.5 text-xs font-medium transition-colors",
              isCurrent ? "text-jamo-600" : isCompleted ? "text-gray-600" : "text-gray-300",
              isClickable ? "cursor-pointer" : "cursor-default",
            ].join(" ")}
          >
            <span
              className={[
                "w-5 h-5 rounded-full flex items-center justify-center text-xs",
                isCurrent
                  ? "bg-jamo-500 text-white"
                  : isCompleted
                  ? "bg-gray-200 text-gray-600"
                  : "bg-gray-100 text-gray-300",
              ].join(" ")}
            >
              {isCompleted ? "✓" : idx + 1}
            </span>
            {step}
          </button>
        );
      })}
    </nav>
  );
}
```

---

## Research Area 4: Real-Time AI Streaming in React

### 4.1 SSE from Supabase Edge Function

**Confidence: HIGH** — SSE is a first-class web standard; Supabase Edge Functions support
streaming responses via the Deno Streams API.

#### Edge Function: Streaming SSE Response

```typescript
// supabase/functions/generate-proposal/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const { proposalContext, isFastDraft } = await req.json();

  // Create a streaming TransformStream
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Helper to write an SSE event
  async function writeSSE(event: string, data: unknown): Promise<void> {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await writer.write(encoder.encode(payload));
  }

  // Start Anthropic streaming call in background
  (async () => {
    try {
      const anthropic = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 8000,
          stream: true,
          system: CRO_PROPOSAL_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserMessage(proposalContext) }],
        }),
      });

      const reader = anthropic.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") break;

          try {
            const parsed = JSON.parse(raw);
            if (parsed.type === "content_block_delta") {
              await writeSSE("chunk", { text: parsed.delta.text });
            }
            if (parsed.type === "message_stop") {
              await writeSSE("done", { success: true });
            }
          } catch (_) {}
        }
      }
    } catch (error) {
      await writeSSE("error", { message: (error as Error).message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
```

---

### 4.2 React Hook: Consuming SSE Stream

```typescript
// src/hooks/useProposalStream.ts
import { useState, useCallback, useRef } from "react";

interface StreamState {
  isStreaming: boolean;
  error: string | null;
  sections: Record<string, string>; // sectionId -> accumulated text
  currentSection: string | null;
}

export function useProposalStream() {
  const [state, setState] = useState<StreamState>({
    isStreaming: false,
    error: null,
    sections: {},
    currentSection: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (proposalContext: object, onChunk?: (sectionId: string, text: string) => void) => {
      // Cancel any in-progress stream
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setState((s) => ({ ...s, isStreaming: true, error: null, sections: {} }));

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-proposal`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ proposalContext }),
            signal: abortRef.current.signal,
          }
        );

        if (!res.ok) throw new Error(`Stream failed: ${res.status}`);
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentSectionId = "executive-summary"; // default first section

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const messages = buffer.split("\n\n");
          buffer = messages.pop() ?? ""; // keep incomplete message in buffer

          for (const message of messages) {
            const lines = message.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event: "));
            const dataLine  = lines.find((l) => l.startsWith("data: "));

            if (!eventLine || !dataLine) continue;
            const event = eventLine.slice(7);
            const data  = JSON.parse(dataLine.slice(6));

            if (event === "section_start") {
              currentSectionId = data.sectionId;
              setState((s) => ({
                ...s,
                currentSection: currentSectionId,
                sections: { ...s.sections, [currentSectionId]: "" },
              }));
            }

            if (event === "chunk") {
              setState((s) => ({
                ...s,
                sections: {
                  ...s.sections,
                  [currentSectionId]:
                    (s.sections[currentSectionId] ?? "") + data.text,
                },
              }));
              onChunk?.(currentSectionId, data.text);
            }

            if (event === "done") {
              setState((s) => ({ ...s, isStreaming: false, currentSection: null }));
            }

            if (event === "error") {
              setState((s) => ({
                ...s,
                isStreaming: false,
                error: data.message,
              }));
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setState((s) => ({
            ...s,
            isStreaming: false,
            error: (err as Error).message,
          }));
        }
      }
    },
    []
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  return { ...state, startStream, cancelStream };
}
```

---

### 4.3 Connecting Stream to TipTap Editor

```typescript
// src/components/ProposalGenerator/ProposalGenerator.tsx
import { useEditor, EditorContent } from "@tiptap/react";
import { useProposalStream } from "../../hooks/useProposalStream";

export function ProposalGenerator({ proposalContext }: { proposalContext: object }) {
  const editor = useEditor({ extensions: [StarterKit], content: "" });
  const { isStreaming, sections, currentSection, startStream, cancelStream } =
    useProposalStream();

  // When a new chunk arrives, inject it into the correct editor section
  const handleChunk = useCallback(
    (sectionId: string, text: string) => {
      if (!editor) return;
      // For streaming display: append text to the current paragraph cursor
      // A simpler approach: track a React ref for buffer, render sections outside editor
      // until streaming complete, then load final content into editor
      appendStreamChunk(editor, sectionId, text);
    },
    [editor]
  );

  const handleGenerate = async () => {
    editor?.commands.setContent(""); // clear editor
    await startStream(proposalContext, handleChunk);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={handleGenerate} disabled={isStreaming} className="btn-primary">
          {isStreaming ? "Generating…" : "Generate Proposal"}
        </button>
        {isStreaming && (
          <button onClick={cancelStream} className="btn-ghost text-sm">
            Cancel
          </button>
        )}
      </div>

      {/* Show section-by-section progress while streaming */}
      {isStreaming && currentSection && (
        <p className="text-xs text-jamo-500 animate-pulse">
          Writing: {currentSection}…
        </p>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
```

---

### 4.4 Section-by-Section Streaming UX Pattern

**Confidence: MEDIUM** — the SSE protocol supports this; the implementation details
depend on the AI provider's streaming format.

The cleanest UX for section-by-section generation is a **two-phase display** approach:

**Phase 1 — Streaming Display (outside editor):**
While streaming, render sections in a read-only preview using plain React state.
Do not write to the TipTap editor during streaming — this avoids cursor conflicts
and editor state corruption from rapid programmatic updates.

```tsx
// StreamingPreview.tsx — shown while isStreaming = true
function StreamingPreview({
  sections,
  currentSection,
}: {
  sections: Record<string, string>;
  currentSection: string | null;
}) {
  const SECTION_ORDER = [
    "executive-summary",
    "scope-of-work",
    "timeline",
    "budget",
    "team",
    "appendix",
  ];

  return (
    <div className="space-y-6">
      {SECTION_ORDER.map((id) => {
        const text = sections[id];
        const isActive = id === currentSection;

        if (!text && !isActive) return null; // not reached yet

        return (
          <div
            key={id}
            className={[
              "rounded-lg border p-4 transition-all",
              isActive
                ? "border-jamo-300 shadow-sm"
                : "border-gray-100",
            ].join(" ")}
          >
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              {id.replace(/-/g, " ")}
            </h4>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {text ?? ""}
              {isActive && (
                <span className="inline-block w-0.5 h-4 bg-jamo-400 animate-blink ml-0.5" />
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
```

**Phase 2 — Transfer to Editor:**
When streaming is complete, load the final sections into TipTap as structured JSON:

```typescript
useEffect(() => {
  if (!isStreaming && Object.keys(sections).length > 0 && editor) {
    // Convert sections to TipTap document JSON
    const doc = {
      type: "doc",
      content: Object.entries(sections).map(([sectionId, text]) => ({
        type: "lockedSection",
        attrs: { id: sectionId, locked: false },
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      })),
    };
    editor.commands.setContent(doc);
  }
}, [isStreaming, sections, editor]);
```

---

### 4.5 Loading / Progress State Patterns

```tsx
// Progress indicator that shows section completion
function GenerationProgress({
  sections,
  sectionOrder,
  isStreaming,
}: {
  sections: Record<string, string>;
  sectionOrder: string[];
  isStreaming: boolean;
}) {
  const completedCount = sectionOrder.filter((s) => sections[s]?.length > 100).length;
  const progress = Math.round((completedCount / sectionOrder.length) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{isStreaming ? `Writing sections… (${completedCount}/${sectionOrder.length})` : "Complete"}</span>
        <span>{progress}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className="bg-jamo-400 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

---

## Key Architecture Decisions

### Decision 1: TipTap over Lexical for rich text

**Decision:** Use TipTap v2.
**Rationale:** Superior extension ecosystem, ProseMirror reliability, simpler AI content injection API.
**Tradeoff:** Larger bundle than Lexical (~130kb vs ~90kb). Acceptable for a B2B SaaS.
**Action:** `npm install @tiptap/react @tiptap/pm @tiptap/starter-kit`

### Decision 2: Salesforce JWT Bearer Token flow (not username/password)

**Decision:** JWT Bearer Token for production; username/password acceptable for development.
**Rationale:** No password in code, no refresh token to manage, works with MFA-enabled orgs.
**Tradeoff:** Requires RSA key pair setup in Salesforce Connected App (one-time admin task).
**Action:** Store private key in Supabase Vault secrets.

### Decision 3: Two-phase streaming (preview state -> editor load)

**Decision:** Do not write to TipTap during streaming. Buffer in React state. Load editor on completion.
**Rationale:** TipTap's editor state is complex; rapid programmatic updates during streaming
cause cursor corruption and unnecessary re-renders. Plain React state is faster for display.
**Tradeoff:** User can't interact with the editor during streaming (acceptable — show a cancel button instead).

### Decision 4: Custom useReducer wizard (no wizard library)

**Decision:** Build wizard state with useReducer + sessionStorage persistence.
**Rationale:** Wizard libraries add abstraction that fights React Router and complex branching logic.
Custom gives full control over the "fast draft" shortcut and validation.
**Tradeoff:** More upfront code. Worth it for flexibility.

### Decision 5: Salesforce writes via Opportunity PATCH + Task creation

**Decision:** Write back to Salesforce by PATCH-ing the Opportunity's StageName/Description
and creating a Task record (not a custom field).
**Rationale:** Requires no Salesforce admin setup (custom fields require admin access, a
barrier to customer onboarding). Task records are standard and visible in Salesforce's
activity timeline.
**Tradeoff:** Less structured data in Salesforce. Custom fields are better long-term.

---

## Confidence Summary

| Area | Confidence | Notes |
|------|------------|-------|
| Salesforce OAuth (JWT flow) | HIGH | Well-documented, stable for years |
| Salesforce REST API endpoints | HIGH | Stable, core product |
| Salesforce rate limits | MEDIUM | Vary by org edition, verify in customer's org |
| Salesforce API version number | MEDIUM | v62.0 current as of mid-2025; verify latest |
| TipTap v2 React integration | HIGH | Used widely, well-documented |
| TipTap lock section via extension | MEDIUM | Pattern is sound; test exact attribute filtering |
| Lexical comparison claims | HIGH | Factual comparison, both actively maintained |
| Quill deprecation status | MEDIUM | Largely stagnant but not officially EOL |
| useReducer wizard pattern | HIGH | Standard React pattern |
| SSE from Supabase Edge Function | HIGH | Deno Streams API is stable |
| Anthropic streaming format | MEDIUM | SSE format correct but `delta.text` field should be verified against current Anthropic API docs |
| Two-phase streaming architecture | MEDIUM | Pattern is sound; test TipTap editor loading performance with large documents |

---

## Items Requiring Live Verification

1. **Verify current Salesforce API version:** Run `GET {instance_url}/services/data/` against
   the target org to confirm the latest available version.

2. **Verify Anthropic streaming event format:** The `content_block_delta` event with `delta.text`
   field is correct for the Messages API with `stream: true`. Confirm against
   `https://docs.anthropic.com/en/api/messages-streaming` — this has been stable but field names
   matter here.

3. **Verify TipTap React 19 compatibility:** TipTap v2 targets React 18. As of August 2025,
   React 19 compatibility was confirmed via community reports but the official changelog should be
   checked. Run `npm install @tiptap/react` and test for any `useLayoutEffect` SSR warnings or
   concurrent mode issues.

4. **Verify Deno Web Crypto RSA key import:** The `pkcs8` format key import pattern used in the
   Salesforce auth example is standard Web Crypto API but should be tested in a Deno environment.
   Alternative: use `djwt` from `deno.land/x/djwt` which handles this for you.

5. **Verify Supabase Edge Function streaming response:** Confirm that `TransformStream` and streaming
   `Response` bodies are fully supported in the current Supabase Edge Function runtime version.
   As of early 2025 this was supported; verify against Supabase changelog if runtime has been updated.
