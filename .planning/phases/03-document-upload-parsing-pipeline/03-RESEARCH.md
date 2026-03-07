# Phase 3: Document Upload & Parsing Pipeline — Research

**Phase:** 03-document-upload-parsing-pipeline
**Researched:** 2026-03-07
**Status:** Complete

---

## Research Question

**What do I need to know to PLAN Phase 3 (Document Upload & Parsing Pipeline) well?**

Phase 3 delivers:
- File upload UI with drag-and-drop
- Direct browser → Supabase Storage upload
- Supabase Edge Function for document text extraction (PDF, DOCX, XLSX, TXT)
- Extracted text stored in `document_extracts` table
- Auto-classification of document types
- Per-file status indicators

**Key risks identified in roadmap:**
- PDF parsing in Deno (`pdf-parse` compatibility)
- Edge Function npm package imports
- Storage upload patterns and RLS

---

## Critical Findings

### 1. PDF Parsing — AVOID `pdf-parse` in Deno Edge Functions

**Problem:** `pdf-parse` has known compatibility issues in Supabase Edge Functions (Deno runtime).

**Evidence:**
- Stack Overflow (2024): "if you're using this in Supabase Edge Functions, there's an issue that causes it to return 'Function Not Found'"
- GitHub discussion #34787: "Error: Failed to load pdf-parse. Please install it with eg. npm install pdf-parse."
- Multiple reports of Deno incompatibility

**✅ Recommended alternative: `pdfjs-serverless`**

- **Why:** Redistribution of Mozilla's PDF.js specifically for edge/serverless environments (Cloudflare Workers, Deno, etc.)
- **Size:** Bundles full PDF.js runtime — larger than `pdf-parse`, but actually works
- **Usage pattern:**
  ```typescript
  import { getDocument } from 'npm:pdfjs-serverless'

  const data = await Deno.readFile('sample.pdf')
  const document = await getDocument({
    data,
    useSystemFonts: true
  }).promise

  // Iterate pages
  for (let i = 1; i <= document.numPages; i++) {
    const page = await document.getPage(i)
    const textContent = await page.getTextContent()
    const text = textContent.items.map(item => item.str).join(' ')
  }
  ```

**Trade-off:** Larger bundle size than text-only parsers, but necessary for Deno compatibility.

**Action for planning:** Plan 1 should include a proof-of-concept test importing `pdfjs-serverless` in a minimal Edge Function before building full extraction logic.

---

### 2. DOCX Parsing — `mammoth` is Deno-compatible

**Status:** ✅ Safe to use

- **Package:** `npm:mammoth`
- **Compatibility:** Works in Deno, confirmed via deno.com/npm/package/mammoth
- **Purpose:** Converts DOCX → HTML + plain text
- **Adoption:** 785+ npm projects use it
- **Semantic parsing:** Preserves heading structure (Heading 1 → `<h1>`, etc.)

**Usage pattern:**
```typescript
import mammoth from 'npm:mammoth'

const result = await mammoth.extractRawText({ path: 'document.docx' })
// result.value = plain text
// result.messages = warnings/errors

const htmlResult = await mammoth.convertToHtml({ path: 'document.docx' })
// htmlResult.value = HTML string
```

**Output options:**
- Plain text (for AI ingestion)
- HTML (preserves structure for display/parsing)

**Recommendation:** Extract **both** plain text and HTML:
- Plain text → store in `document_extracts.content`
- HTML → store in `document_extracts.structured_content` (JSONB or TEXT column)

---

### 3. XLSX Parsing — Pin to `@0.18.5` (confirmed)

**Status:** ✅ Already documented in STATE.md

- **Package:** `npm:xlsx@0.18.5`
- **License issue:** v0.19+ switched to proprietary license
- **Deno compatibility:** Works with npm: specifier
- **Output:** Convert to CSV for AI context

**Usage pattern:**
```typescript
import * as XLSX from 'npm:xlsx@0.18.5'

const workbook = XLSX.read(fileData, { type: 'buffer' })
const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
const csv = XLSX.utils.sheet_to_csv(firstSheet)
```

---

### 4. Supabase Edge Function NPM Package Best Practices

**From Supabase docs:**

#### Use `deno.json` (not `import_map.json`)
- **Recommended:** Each function has its own `deno.json` in the function directory
- **Legacy:** `import_map.json` still supported but deprecated

**Directory structure:**
```
supabase/functions/
  extract-document/
    index.ts
    deno.json    ← function-specific dependencies
```

**deno.json format:**
```json
{
  "imports": {
    "pdfjs": "npm:pdfjs-serverless@latest",
    "mammoth": "npm:mammoth@^1.11.0",
    "xlsx": "npm:xlsx@0.18.5",
    "supabase": "npm:@supabase/supabase-js@2"
  },
  "compilerOptions": {
    "lib": ["deno.window", "deno.ns"],
    "strict": true
  }
}
```

#### Bundle size constraints
- **Hard limit:** 10MB source code
- **Check size:** `deno info /path/to/function/index.ts`
- **Optimization:** Use selective imports, avoid wildcard imports

**Example:**
```typescript
// ✅ Good: selective import
import { createClient } from 'npm:@supabase/supabase-js@2'

// ❌ Bad: imports entire package
import * as supabase from 'npm:@supabase/supabase-js@2'
```

---

### 5. Supabase Storage Upload Pattern

**✅ Recommended: Direct browser → Storage (no proxy)**

**From Supabase docs:**
- Client uploads directly to Supabase Storage
- No round-trip through Edge Function
- Storage emits events that can trigger Edge Functions

**Upload flow:**
1. **Browser:** Upload file to Storage bucket via Supabase client
2. **Storage:** File stored at `{org_id}/{proposal_id}/{filename}`
3. **Browser:** Call Edge Function with file path
4. **Edge Function:** Download from Storage, extract text, write to `document_extracts`

**RLS pattern (already in migration 014):**
```sql
-- Storage path: {org_id}/{proposal_id}/{filename}
-- RLS check: (storage.foldername(name))[1] = org_id::text
```

**Client-side upload:**
```typescript
const { data, error } = await supabase.storage
  .from('documents')
  .upload(`${orgId}/${proposalId}/${filename}`, file, {
    cacheControl: '3600',
    upsert: false
  })
```

---

### 6. Edge Function Trigger Pattern

**Two options for triggering extraction:**

#### Option A: Client calls Edge Function after upload (simpler)
```typescript
// 1. Upload file
const { data: uploadData } = await supabase.storage
  .from('documents')
  .upload(path, file)

// 2. Trigger extraction
const { data: extractData } = await supabase.functions.invoke('extract-document', {
  body: {
    bucketName: 'documents',
    filePath: uploadData.path,
    proposalId,
    documentId
  }
})
```

**Pros:** Simple, synchronous feedback, no webhook setup
**Cons:** Client must wait for extraction (or poll for status)

#### Option B: Storage webhooks (advanced, not needed for MVP)
- Configure Storage bucket to emit webhook on upload
- Edge Function listens to webhook
- Fully async, no client involvement

**Recommendation for Phase 3:** Use **Option A** (client-triggered) for MVP simplicity.

---

### 7. Document Type Classification

**Approach: Filename + basic content heuristics**

**Filename patterns:**
- `rfp` / `request for proposal` → RFP
- `protocol` / `study protocol` → Protocol
- `transcript` / `meeting notes` → Transcript
- `budget` / `cost` / `pricing` → Budget
- `brochure` / `investigator` → Investigator Brochure

**Content signals (secondary):**
- RFP: "proposal deadline", "evaluation criteria"
- Protocol: "inclusion criteria", "endpoints", "study design"
- Budget: currency symbols, line items, totals

**Implementation:**
```typescript
function classifyDocument(filename: string, extractedText: string): DocumentType {
  const lower = filename.toLowerCase()

  if (lower.includes('rfp') || lower.includes('request')) return 'rfp'
  if (lower.includes('protocol')) return 'protocol'
  if (lower.includes('transcript') || lower.includes('notes')) return 'transcript'
  if (lower.includes('budget') || lower.includes('cost')) return 'budget'

  // Fallback: content-based classification
  if (extractedText.includes('proposal deadline')) return 'rfp'

  return 'other'
}
```

---

### 8. Error Handling & Status Tracking

**Per-file status required by REQ-2.8:**
- `uploading` → Browser upload in progress
- `extracting` → Edge Function processing
- `complete` → Extraction succeeded, text in DB
- `failed` → Extraction error (PDF corrupt, unsupported format, etc.)

**Database tracking:**

Option 1: Status column in `proposal_documents` table
```sql
ALTER TABLE proposal_documents
ADD COLUMN extraction_status TEXT DEFAULT 'pending',
ADD COLUMN extraction_error TEXT;
```

Option 2: Check existence in `document_extracts` table
- No extract row = pending
- Extract row exists = complete
- Could add `error` column to `document_extracts`

**Recommendation:** Option 1 (explicit status column) for clearer UI state management.

---

## Implementation Strategy

### Wave 1: Storage + UI
1. **Storage upload component** (drag-and-drop, file picker, direct browser upload)
2. **Status indicator UI** (uploading / extracting / complete / failed)
3. **Document list display** (show uploaded files with status)

### Wave 2: Extraction Engine
1. **POC Edge Function** — Test `pdfjs-serverless` import and basic PDF extraction
2. **Full extraction Edge Function** — PDF, DOCX, XLSX, TXT handlers
3. **Classification logic** — Filename + content heuristics
4. **Error handling** — Try/catch per file type, surface errors to UI

**Dependency:** Wave 2 depends on Wave 1 (can't extract until upload works).

---

## Validation Architecture

### Unit Tests (Edge Function)
- ✅ PDF extraction with `pdfjs-serverless`
- ✅ DOCX extraction with `mammoth`
- ✅ XLSX extraction with `xlsx@0.18.5`
- ✅ TXT direct read
- ✅ Document classification logic
- ✅ Error handling for corrupt files

**Test fixtures:**
- `test-rfp.pdf` (known-good PDF)
- `test-protocol.docx` (known-good DOCX)
- `test-budget.xlsx` (known-good XLSX)
- `corrupt.pdf` (intentionally broken file)

### Integration Tests
- ✅ Upload → Storage → RLS check (org isolation)
- ✅ Edge Function invocation with uploaded file path
- ✅ `document_extracts` row created after extraction
- ✅ Extraction status updates correctly

### UI Tests (Vitest)
- ✅ File upload component renders
- ✅ Drag-and-drop accepts supported file types
- ✅ Status indicator updates during upload/extraction
- ✅ Error states display correctly

---

## Dependencies on Prior Phases

**Phase 1 (Supabase Foundation):**
- ✅ `proposal_documents` table exists
- ✅ `document_extracts` table exists
- ✅ Storage bucket `documents` created
- ✅ RLS policies on Storage

**Phase 2 (Auth):**
- ✅ `org_id` available in AuthContext
- ✅ User authenticated before upload

---

## Open Questions for Planning

1. **UI framework:** Use existing Jamo design system components? Or build upload component from scratch?
2. **Extraction timeout:** How long before marking a file extraction as failed? (Edge Functions have 150s timeout)
3. **File size limits:** Supabase Storage max 50MB — do we warn users or enforce client-side?
4. **Concurrent uploads:** Allow multiple files uploading at once? Or one-at-a-time queue?
5. **Extraction retry:** If extraction fails, allow user to retry? Or require re-upload?

---

## Recommended Plan Structure

**Plan 01 (Wave 1):** File upload UI + Storage integration
- Build upload component (drag-and-drop + file picker)
- Wire direct browser → Storage upload
- Display upload status (uploading / complete / failed)
- Add `extraction_status` column to `proposal_documents`

**Plan 02 (Wave 1):** Document list display
- Show uploaded files for a proposal
- Display per-file status indicators
- Allow file deletion (soft-delete via RLS)

**Plan 03 (Wave 2):** POC Edge Function for PDF extraction
- **Risk mitigation:** Test `pdfjs-serverless` import in minimal Edge Function
- Verify bundle size < 10MB
- Extract text from test PDF
- Write to console (no DB write yet)

**Plan 04 (Wave 2):** Full extraction Edge Function
- PDF extraction with `pdfjs-serverless`
- DOCX extraction with `mammoth`
- XLSX extraction with `xlsx@0.18.5`
- TXT direct read
- Document classification
- Write to `document_extracts` table
- Update `extraction_status` in `proposal_documents`
- Error handling and logging

**Plan 05 (Wave 2):** Wire extraction trigger from client
- After file upload, call `extract-document` Edge Function
- Poll `extraction_status` for updates
- Display extraction errors in UI

---

## Resources

**Supabase Docs:**
- [Edge Functions dependencies](https://supabase.com/docs/guides/functions/dependencies)
- [Storage upload](https://supabase.com/docs/guides/storage)
- [Edge Function bundle size](https://supabase.com/docs/guides/troubleshooting/edge-function-bundle-size-issues)

**NPM Packages:**
- `pdfjs-serverless`: https://github.com/johannschopplich/pdfjs-serverless
- `mammoth`: https://www.npmjs.com/package/mammoth
- `xlsx@0.18.5`: https://www.npmjs.com/package/xlsx

**Key Discussions:**
- pdf-parse Deno issues: https://github.com/orgs/supabase/discussions/26818
- LangChain + Deno PDF processing: https://github.com/orgs/supabase/discussions/34787

---

*Phase: 03-document-upload-parsing-pipeline*
*Research complete: 2026-03-07*
