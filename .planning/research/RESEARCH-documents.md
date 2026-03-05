# Research: Document Parsing & Export Pipeline

**Project:** Jamo — B2B SaaS CRO Proposal Generation Platform
**Researched:** 2026-03-05
**Scope:** File ingestion (PDF, DOCX, TXT, XLSX) and DOCX export in a Supabase Edge Functions (Deno) + React 19 stack
**Knowledge cutoff note:** Based on training data through August 2025. Library APIs and Supabase Edge Functions behavior should be verified against current documentation before implementation. Confidence levels noted per section.

---

## Executive Summary

Jamo needs two document pipelines: **ingestion** (parse uploaded files → extract text → feed AI) and **export** (generate structured DOCX from proposal data). These are the highest-leverage technical decisions for the document feature because wrong choices cause rewrites.

**The central constraint is Deno.** Supabase Edge Functions run on Deno, not Node.js. Deno supports `npm:` specifiers, meaning most npm packages work — but packages that rely on Node.js native modules (`.node` bindings), `fs` in non-Deno-compatible ways, or complex binary C++ addons will fail at runtime. This narrows the viable library choices significantly.

**Recommended approach:**
- PDF extraction: `npm:pdf-parse` via Deno npm specifiers (digital PDFs only, no OCR)
- DOCX extraction: `npm:mammoth` — the clear winner, purpose-built for this use case
- XLSX parsing: `npm:xlsx` (SheetJS) — industry standard, works in Deno
- DOCX generation: `npm:docx` — runs client-side in the browser, avoiding Deno DOCX generation entirely
- File upload: Supabase Storage with direct-from-browser upload + Storage webhooks or manual Edge Function trigger

---

## 1. Deno Runtime Constraints (Read This First)

**Confidence: HIGH** (Supabase Edge Functions are Deno Deploy-based, well-documented)

Supabase Edge Functions run on **Deno Deploy**, which is Deno with some restrictions:
- No persistent filesystem (read-only `/tmp` access with limited size — typically 50MB per invocation)
- No `net` listener (you're the listener, not a server)
- Memory limits (~512MB per invocation depending on plan)
- Execution time limits (varies by plan; default ~150 seconds wall clock)
- npm packages are supported via `npm:` specifiers: `import parse from "npm:pdf-parse"`
- Deno's `std` library and most pure-JavaScript npm packages work
- Native Node addons (`.node` files) do NOT work — this eliminates any library that shells out to a C binary

**What this means for library choices:**
- Pure JavaScript/TypeScript implementations: WORK
- Libraries that use `Buffer` from Node.js: WORK (Deno has a Node.js compatibility layer)
- Libraries shelling out to system binaries (e.g., LibreOffice, poppler-utils): DO NOT WORK
- Libraries using native Node addons (e.g., `canvas`, some PDF renderers): DO NOT WORK
- Large WASM bundles: May work but watch memory limits

**Import syntax in Supabase Edge Functions:**

```typescript
// npm packages via npm: specifier
import pdfParse from "npm:pdf-parse@1.1.1";
import mammoth from "npm:mammoth@1.8.0";
import * as XLSX from "npm:xlsx@0.18.5";

// Or via import map in deno.json / import_map.json
```

**Recommendation:** Pin exact versions in your import map or `deno.json` to avoid unexpected breakage on Edge Function deployments.

---

## 2. PDF Text Extraction in Deno

**Confidence: MEDIUM** (pdf-parse works in Deno confirmed in community reports; edge cases need integration testing)

### The Landscape

PDF parsing in JavaScript is harder than it looks because PDFs are not a text format — they are a layout/drawing format that happens to contain text objects. Extraction quality varies by how the PDF was created.

**Key distinction:**
- **Digital PDFs** (created by Word, InDesign, Acrobat from text): Text objects are embedded. Extraction is reliable.
- **Scanned PDFs** (photographed or printed and scanned): Text is a raster image. Extraction requires OCR. **This is explicitly out of scope for MVP.**

### Recommended: `pdf-parse` (npm)

**Package:** `npm:pdf-parse@1.1.1` (last stable release)
**Confidence: MEDIUM**

`pdf-parse` is a pure JavaScript wrapper around Mozilla's `pdf.js`. It works in Deno because it has no native addons and its core dependency (pdf.js) is JavaScript.

**Pros:**
- Pure JavaScript — no native deps
- Widely used in the Node.js ecosystem, battle-tested
- Returns structured output: `text`, `numpages`, `info`, `metadata`
- Works with `Uint8Array` or `Buffer` inputs (both work in Deno)

**Cons:**
- The npm package hasn't had a major release since 2019; the underlying pdf.js is maintained separately by Mozilla
- Occasional issues with complex PDFs (multi-column layouts, tables with merged cells, non-Latin character sets)
- Text ordering can be incorrect in complex layouts (pdf.js renders by position, not reading order)
- No structure preservation (headings vs. body text are indistinguishable)
- **Deno gotcha:** pdf-parse has a test-mode auto-run issue where importing it runs test code if `DENO_DEPLOYMENT_ID` is not set. The workaround is to import from the main file directly: `import pdfParse from "npm:pdf-parse/lib/pdf-parse.js"` instead of the default export.

**Usage pattern in Edge Function:**

```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// Import from lib directly to avoid the test-runner issue
import pdfParse from "npm:pdf-parse/lib/pdf-parse.js";

export async function extractPdfText(fileBuffer: Uint8Array): Promise<string> {
  try {
    const data = await pdfParse(fileBuffer);
    return data.text; // Plain text, newlines preserved between pages
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}
```

**Expected output quality:**
- Clean running text from well-formed PDFs: HIGH quality
- Clinical trial RFPs from pharmaceutical companies (typically exported from Word or InDesign): HIGH quality
- Scanned or image-heavy PDFs: will return empty/garbage text — must handle this gracefully and tell the user

### Alternative: Direct pdf.js (Deno-first)

Mozilla's pdf.js (`npm:pdfjs-dist`) is the underlying library that pdf-parse wraps. You can use it directly for more control, at the cost of more boilerplate. This is only worth it if you need page-level metadata, annotation data, or more granular rendering control.

**For MVP: use pdf-parse. It's simpler and sufficient.**

### What to NOT Use

- **`pdfextract`**: Requires system binary (pdftotext from poppler). Will fail in Deno Deploy.
- **`pdf2json`**: Has native addon requirements in some versions.
- **Any OCR-based solution** (`tesseract.js` as a WASM build in Deno): Works in theory, but WASM binary is large (~20MB), slow, and not needed for MVP scope (digital PDFs only).
- **Calling an external OCR API** (Google Cloud Vision, AWS Textract): Valid for V2 OCR support, adds latency and cost but no Deno compatibility issues.

### Handling Large PDFs

Clinical trial RFPs and protocols can be 50-200 pages, easily 5-20MB as PDF files. Supabase Storage handles the storage fine. The Edge Function must process the file in memory:

- **File size limit:** Edge Functions receive files as request body or read from Supabase Storage. For the storage path, you download the file bytes into memory — 20MB is within limits but be aware of the ~512MB function memory cap.
- **Token limits:** A 100-page RFP might produce 50,000-150,000 words of text. This exceeds what you can feed to Claude in a single call. You will need a **chunking strategy** for the extraction → AI pipeline (see Section 7).
- **Timeout:** pdf-parse is synchronous-ish (based on promises but CPU-bound). Complex PDFs can take several seconds. Keep files under 20MB for MVP.

---

## 3. DOCX Text Extraction in Deno

**Confidence: HIGH** (mammoth is the clear standard, well-tested in Deno/serverless)

### Recommended: `mammoth` (npm)

**Package:** `npm:mammoth@1.8.0`
**Confidence: HIGH**

Mammoth is purpose-built for DOCX-to-text and DOCX-to-HTML conversion. It's the most widely-used, actively maintained library for this use case. Pure JavaScript. Works in Deno with no known compatibility issues.

**Pros:**
- Pure JavaScript (zero native deps)
- Extracts semantic structure: headings (H1-H6), paragraphs, tables, lists, bold/italic
- Produces clean HTML or plain text — you choose
- HTML output preserves structure that can be used to infer document sections
- Actively maintained (regular releases)
- Excellent Deno compatibility

**Cons:**
- Does not preserve Word-specific styles beyond basic semantics (e.g., custom named styles map poorly unless you configure style mappings)
- Complex Word formatting (multi-column layouts, text boxes, footnotes) may be dropped or mangled
- Images are dropped by default (appropriate for text extraction)

**Usage pattern in Edge Function:**

```typescript
import mammoth from "npm:mammoth@1.8.0";

export async function extractDocxText(fileBuffer: Uint8Array): Promise<{
  text: string;
  html: string;
  headings: string[];
}> {
  // mammoth expects an ArrayBuffer or Buffer
  const arrayBuffer = fileBuffer.buffer;

  // Extract clean plain text
  const textResult = await mammoth.extractRawText({ arrayBuffer });

  // Extract HTML to preserve structure
  const htmlResult = await mammoth.convertToHtml({ arrayBuffer });

  // Parse headings from HTML for section structure
  const headings = extractHeadingsFromHtml(htmlResult.value);

  return {
    text: textResult.value,
    html: htmlResult.value,
    headings,
  };
}

function extractHeadingsFromHtml(html: string): string[] {
  // Simple regex to pull heading text — use a proper HTML parser in production
  const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
  const headings: string[] = [];
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    // Strip any inner HTML tags from heading text
    headings.push(match[1].replace(/<[^>]+>/g, "").trim());
  }
  return headings;
}
```

**Preserving structural information for AI context:**

For AI processing, send the HTML output rather than raw text. This preserves heading hierarchy, lists, and table structures that help the AI understand document organization:

```typescript
// Include structure hint in the AI prompt context
const docxContext = `
DOCUMENT STRUCTURE (from uploaded DOCX):
${htmlResult.value}

DOCUMENT HEADINGS (in order):
${headings.join("\n")}
`;
```

Alternatively, convert HTML to Markdown using a library like `npm:turndown` — Markdown is more token-efficient than HTML while preserving structure. This is recommended for long documents going into AI context.

### Custom Style Mapping in Mammoth

CRO proposal templates often use custom Word styles (e.g., "Heading-CRO", "Section-Title"). Configure style maps:

```typescript
const styleMap = [
  "p[style-name='Heading-CRO'] => h1:fresh",
  "p[style-name='Section-Title'] => h2:fresh",
  "p[style-name='Body-CRO'] => p:fresh",
];

const result = await mammoth.convertToHtml({
  arrayBuffer,
  styleMap,
});
```

For MVP: use default style mapping. Custom maps are a V2 feature when you know your users' actual templates.

### Alternative: `docx-parser` / `officeparser`

`officeparser` is a simpler alternative that handles DOCX, PPTX, and XLSX in one package. Less control than mammoth, but fine if you only need raw text. **Stick with mammoth** — its HTML output is valuable for structure-aware AI context.

---

## 4. XLSX Parsing in Deno

**Confidence: HIGH** (SheetJS/xlsx is the industry standard, Deno-compatible)

### Recommended: `xlsx` (SheetJS) (npm)

**Package:** `npm:xlsx@0.18.5`
**Confidence: HIGH**

SheetJS (the `xlsx` npm package) is the definitive JavaScript library for reading and writing Excel files. Pure JavaScript. Works in Deno with no known compatibility issues.

**Note on versions:** SheetJS changed licensing in 2023. The last MIT-licensed version is `0.18.5`. Later versions (0.19+) are under a proprietary license (SheetJS Community Edition License). For Jamo's commercial B2B product, use either `0.18.5` (MIT, fully open) or purchase a SheetJS Pro license for the latest version. **Use `0.18.5` for MVP** — it covers all required functionality.

**Pros:**
- Handles `.xlsx`, `.xls`, `.csv`, `.ods` (comprehensive format support)
- Converts sheets to JSON arrays of objects (column headers as keys)
- Handles merged cells, multiple sheets, named ranges
- Can output as CSV, JSON, or HTML
- Deno-compatible with `npm:` specifier

**Cons:**
- Large bundle size (~1.5MB minified) — not a concern server-side but relevant for browser use
- Complex formulas are not evaluated (values as-last-computed, not recalculated)
- API is terse and not TypeScript-native (community @types package exists)

**Usage pattern in Edge Function:**

```typescript
import * as XLSX from "npm:xlsx@0.18.5";

export interface SheetData {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rawCsv: string;
}

export async function extractXlsxData(fileBuffer: Uint8Array): Promise<SheetData[]> {
  const workbook = XLSX.read(fileBuffer, { type: "array" });

  const sheets: SheetData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON (first row = headers)
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "", // Fill empty cells with empty string
    });

    // Get headers
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Also get CSV for simple AI context injection
    const rawCsv = XLSX.utils.sheet_to_csv(worksheet);

    sheets.push({ sheetName, headers, rows, rawCsv });
  }

  return sheets;
}
```

**Structuring XLSX data for AI context:**

Budget spreadsheets from CRO proposals typically have a "Budget" or "Cost" sheet. For AI context, CSV format is the most token-efficient representation of tabular data:

```typescript
// Build AI context from budget sheets
function buildBudgetContext(sheets: SheetData[]): string {
  return sheets
    .map(sheet => `
SPREADSHEET SHEET: "${sheet.sheetName}"
${sheet.rawCsv}
    `.trim())
    .join("\n\n");
}
```

**Identifying the right sheet:** Budget files may have multiple sheets. Auto-detect by looking for sheets with headers containing budget-relevant keywords (cost, price, fee, rate, total, amount). This detection can be done client-side before upload to show the user which sheet was detected.

---

## 5. DOCX Generation and Export

**Confidence: HIGH** (`docx` package is the clear choice, browser-compatible)

### Recommended: `docx` (npm) — Client-Side in the Browser

**Package:** `npm:docx@8.5.0` (or latest 8.x)
**Target environment: Browser (React frontend)**
**Confidence: HIGH**

The `docx` package generates DOCX files from structured data using a programmatic API. It runs entirely in the browser (outputs a `Blob`), which means:
1. No Edge Function needed for DOCX generation
2. No file needs to be sent back from the server
3. Instant downloads with no round-trip latency

**This is the correct architecture for MVP.** The proposal data already lives in the frontend's state (or is fetched from Supabase). Generate the DOCX client-side from that structured data, trigger a browser download.

**Pros:**
- Pure JavaScript — works in browser and Node.js/Deno
- Comprehensive API: paragraphs, headings, tables, bullet lists, numbered lists, headers/footers, page breaks, styles
- TypeScript-native (authored in TypeScript, excellent type definitions)
- Actively maintained, version 8.x has clean API
- Produces valid `.docx` files that open in Word, Google Docs, LibreOffice
- No server round-trip required for generation

**Cons:**
- No ability to READ an existing DOCX template and fill it in (it generates from scratch programmatically)
- Applying an uploaded user template's exact formatting is not straightforward — see template notes below
- Requires building a mapping layer from your proposal data model to `docx` API calls
- Complex layouts (exact pixel positioning) are very difficult

### Installation

```bash
npm install docx
```

### Core Usage Pattern (React frontend)

```typescript
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  NumberFormat,
} from "docx";
import { saveAs } from "file-saver"; // npm install file-saver @types/file-saver

interface ProposalSection {
  title: string;
  content: string; // Plain text or structured blocks
  subsections?: ProposalSection[];
}

async function exportProposalToDocx(proposal: {
  title: string;
  client: string;
  sections: ProposalSection[];
}): Promise<void> {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 22, // 11pt (half-points)
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,   // 1 inch (twips: 1440 per inch)
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [
          // Cover page elements
          new Paragraph({
            text: proposal.title,
            heading: HeadingLevel.TITLE,
            spacing: { before: 2880, after: 480 },
          }),
          new Paragraph({
            text: `Prepared for: ${proposal.client}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 2880 },
          }),
          // Page break before content
          new Paragraph({ pageBreakBefore: true }),

          // Generate section children
          ...buildSectionChildren(proposal.sections),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${proposal.title.replace(/[^a-z0-9]/gi, "_")}.docx`);
}

function buildSectionChildren(sections: ProposalSection[]): Paragraph[] {
  const children: Paragraph[] = [];

  for (const section of sections) {
    // Section heading
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 240 },
      })
    );

    // Section content (split on newlines, each line is a paragraph)
    const lines = section.content.split("\n").filter(l => l.trim());
    for (const line of lines) {
      children.push(
        new Paragraph({
          text: line,
          spacing: { after: 120 },
        })
      );
    }

    // Subsections
    if (section.subsections) {
      for (const sub of section.subsections) {
        children.push(
          new Paragraph({
            text: sub.title,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 360, after: 120 },
          })
        );
        const subLines = sub.content.split("\n").filter(l => l.trim());
        for (const line of subLines) {
          children.push(new Paragraph({ text: line, spacing: { after: 120 } }));
        }
      }
    }
  }

  return children;
}
```

### Table Generation Pattern

Clinical trial proposals frequently contain tables (study schedules, budget summaries, deliverables). The `docx` package handles tables well:

```typescript
function buildTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      // Header row
      new TableRow({
        tableHeader: true,
        children: headers.map(header =>
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: header, bold: true })],
              }),
            ],
            shading: { fill: "E8E8E8" }, // Light grey header background
          })
        ),
      }),
      // Data rows
      ...rows.map(row =>
        new TableRow({
          children: row.map(cell =>
            new TableCell({
              children: [new Paragraph({ text: cell })],
            })
          ),
        })
      ),
    ],
  });
}
```

### Bullet List Pattern

```typescript
function buildBulletList(items: string[]): Paragraph[] {
  return items.map(item =>
    new Paragraph({
      text: item,
      bullet: { level: 0 },
      spacing: { after: 80 },
    })
  );
}
```

### Template Formatting: The Hard Problem

**CROs will upload their own DOCX templates. The requirement is that exports match the template's formatting.**

There are two approaches:

**Approach A: Style Extraction + Application (Recommended for MVP)**
Extract the style names and basic formatting from the uploaded template's XML, store them per organization, and apply equivalent styles when generating with `docx`. This is an approximation — not pixel-perfect, but preserves key elements (fonts, colors, heading styles).

**Approach B: Template Fill with `docxtemplater` (Recommended for V2)**
`docxtemplater` takes an actual DOCX file as a template with `{placeholders}` and fills in values. This produces output that is byte-for-byte styled like the original template because the template file itself is the base.

```
Template: proposal-template.docx (with {title}, {executive_summary}, etc.)
docxtemplater fills placeholders → output inherits ALL Word styles from template
```

**For MVP:** Use Approach A (generate with `docx`, approximate the user's style). This is significantly simpler and still produces professional output. Tell users the export is clean and structured but may not exactly match their branded template — this is the "worst-case MVP acceptable outcome" already noted in the project spec.

**For V2:** Implement `docxtemplater`. This requires:
1. CRO uploads their branded DOCX template with placeholder tags
2. `docxtemplater` fills those placeholders server-side (Edge Function or client-side)
3. Output is styled exactly like the original template

`docxtemplater` package: `npm:docxtemplater@3.49.0` with `npm:pizzip@3.1.7`. Both work in browser and Deno.

### Why NOT Server-Side DOCX Generation (for MVP)

Generating DOCX on the Edge Function is possible but has no advantage over client-side for the MVP case:
- The proposal data is already on the client (fetched from Supabase)
- Sending it to the server just to get a file back adds latency
- The `docx` package works identically in the browser
- You avoid additional Edge Function invocation costs

**Server-side DOCX generation becomes necessary when:**
- The template filling uses server-only data (e.g., directly from the DB without a client round-trip)
- You need to generate DOCX as part of an automated workflow (scheduled, webhook-triggered)
- The generated file needs to be stored in Supabase Storage immediately (e.g., for sharing/collaboration)

---

## 6. File Upload Flow with Supabase Storage

**Confidence: HIGH** (Supabase Storage is well-documented, stable API)

### Architecture Overview

```
Browser → Supabase Storage (direct upload) → Edge Function (triggered for processing)
                                           ↘ Supabase DB (file metadata record)
```

**The key insight:** Upload directly from the browser to Supabase Storage. Do NOT proxy the file through an Edge Function — that doubles bandwidth cost, doubles latency, and hits Edge Function request body size limits.

### Step 1: Browser Upload to Supabase Storage

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface UploadResult {
  path: string;
  publicUrl: string | null;
  signedUrl: string;
}

async function uploadDocument(
  file: File,
  proposalId: string,
  orgId: string
): Promise<UploadResult> {
  // Storage path: org-scoped, proposal-scoped
  const filePath = `${orgId}/${proposalId}/${Date.now()}_${file.name}`;

  const { data, error } = await supabase.storage
    .from("proposal-documents")
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
      // cacheControl is for public files; signed URLs have their own expiry
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // Get a signed URL (not public — documents are private)
  const { data: signedData, error: signedError } = await supabase.storage
    .from("proposal-documents")
    .createSignedUrl(filePath, 3600); // 1 hour expiry

  if (signedError) throw new Error(`Signed URL failed: ${signedError.message}`);

  return {
    path: filePath,
    publicUrl: null, // Bucket is private
    signedUrl: signedData.signedUrl,
  };
}
```

### Step 2: Record the File in Supabase DB

After upload, record the file metadata in a `documents` table so it's queryable:

```typescript
async function recordDocument(params: {
  proposalId: string;
  orgId: string;
  storagePath: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
}): Promise<void> {
  const { error } = await supabase.from("documents").insert({
    proposal_id: params.proposalId,
    org_id: params.orgId,
    storage_path: params.storagePath,
    file_name: params.fileName,
    file_type: params.fileType, // 'pdf', 'docx', 'xlsx', 'txt'
    file_size_bytes: params.fileSizeBytes,
    processing_status: "pending",
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Document record failed: ${error.message}`);
}
```

### Step 3: Trigger the Edge Function for Processing

After a successful upload, call the extraction Edge Function explicitly from the browser:

```typescript
async function triggerDocumentExtraction(
  documentId: string,
  storagePath: string
): Promise<{ extractedText: string; metadata: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke("extract-document", {
    body: { documentId, storagePath },
  });

  if (error) throw new Error(`Extraction failed: ${error.message}`);
  return data;
}
```

**Why not use Storage webhooks?** Supabase Storage does support object webhooks (via the `storage.objects` table change events or via the Realtime channel). However, for MVP, explicit invocation from the browser is simpler, easier to debug, and gives you synchronous feedback (you can show extraction progress). Use webhooks in V2 for background processing workflows.

### The Edge Function: `extract-document`

```typescript
// supabase/functions/extract-document/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import pdfParse from "npm:pdf-parse/lib/pdf-parse.js";
import mammoth from "npm:mammoth@1.8.0";
import * as XLSX from "npm:xlsx@0.18.5";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // Service role for storage access
);

serve(async (req) => {
  const { documentId, storagePath } = await req.json();

  try {
    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("proposal-documents")
      .download(storagePath);

    if (downloadError) throw downloadError;

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Determine file type from storage path
    const extension = storagePath.split(".").pop()?.toLowerCase();
    let extractedText = "";
    let extractionMeta: Record<string, unknown> = {};

    switch (extension) {
      case "pdf": {
        const pdfData = await pdfParse(uint8Array);
        extractedText = pdfData.text;
        extractionMeta = {
          numPages: pdfData.numpages,
          info: pdfData.info,
        };
        break;
      }
      case "docx": {
        const textResult = await mammoth.extractRawText({ arrayBuffer });
        const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
        extractedText = textResult.value;
        extractionMeta = {
          html: htmlResult.value,
          messages: textResult.messages,
        };
        break;
      }
      case "xlsx":
      case "xls": {
        const workbook = XLSX.read(uint8Array, { type: "array" });
        const sheetTexts = workbook.SheetNames.map(name => {
          const sheet = workbook.Sheets[name];
          return `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
        });
        extractedText = sheetTexts.join("\n\n");
        extractionMeta = { sheetNames: workbook.SheetNames };
        break;
      }
      case "txt": {
        extractedText = new TextDecoder().decode(uint8Array);
        break;
      }
      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }

    // Update the document record with extracted text
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        extracted_text: extractedText,
        extraction_metadata: extractionMeta,
        processing_status: "completed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ extractedText, metadata: extractionMeta }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    // Mark document as failed
    await supabase
      .from("documents")
      .update({ processing_status: "failed", error_message: error.message })
      .eq("id", documentId);

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### Storage Bucket Security

**Confidence: HIGH**

The `proposal-documents` bucket must be **private** (not public). Users should never get direct public URLs.

**Recommended security model:**
- RLS on `storage.objects`: users can only access objects under their `org_id/` prefix
- Signed URLs for all access: generate from the backend (Edge Function or server-side route), short-lived (1 hour for viewing, 15 minutes for processing triggers)
- Service role key only in Edge Functions: never expose it to the browser

**Supabase Storage RLS policy (SQL):**

```sql
-- Policy: Users can only upload to their own org's folder
CREATE POLICY "Users can upload to their org"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proposal-documents'
  AND (storage.foldername(name))[1] = (
    SELECT org_id::text FROM users WHERE id = auth.uid()
  )
);

-- Policy: Users can only read their org's documents
CREATE POLICY "Users can read their org documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proposal-documents'
  AND (storage.foldername(name))[1] = (
    SELECT org_id::text FROM users WHERE id = auth.uid()
  )
);
```

### Handling Large Files (>10MB)

**Confidence: MEDIUM** (limits have changed; verify against current Supabase docs)

Supabase Storage supports files up to **5GB** in total. The practical constraints for Jamo are:

**Upload size limits:**
- Supabase Storage upload: default 50MB per object (configurable up to 5GB on Pro plan)
- Clinical RFPs: typically 2-20MB — well within limits
- Very large protocol packages (100+ pages with images): can reach 50MB

**Edge Function body/download limits:**
- Edge Functions receive requests with body limits (~6MB for HTTP request body)
- However, when downloading from Storage inside an Edge Function, you're reading from the same infrastructure — effectively no limit beyond memory
- Memory per invocation: ~512MB (sufficient for a 20MB PDF → text extraction)

**For files >20MB:**
- Stream the file rather than loading entirely into memory (Deno supports streaming via `ReadableStream`)
- Process page-by-page where the parser supports it
- For MVP: set a 20MB hard limit with a clear user error message. This covers 95%+ of real RFPs.

**Chunked upload for browser:**

```typescript
// For files > 6MB, use Supabase's built-in multipart support
// The Supabase JS SDK handles this automatically as of v2.x
// No manual chunking required for uploads

const { data, error } = await supabase.storage
  .from("proposal-documents")
  .upload(filePath, file, {
    contentType: file.type,
    // Supabase SDK uses multipart for large files automatically
  });
```

---

## 7. Text-to-AI Pipeline Considerations

**Confidence: HIGH**

This is not a library question but a critical architectural decision that affects how extraction results are used.

### Token Budget Reality

A clinical trial RFP can be 50-200 pages. After extraction:
- 1 page ≈ 250-400 words ≈ 300-500 tokens (GPT/Claude tokenization)
- 100-page RFP ≈ 30,000-50,000 tokens

Claude Sonnet's context window is 200K tokens (as of Sonnet 3.5/3.7/Sonnet 4.x). This means **even large RFPs fit in a single context window**. However:
- You will have multiple documents per proposal (RFP + protocol + budget + transcript + regulatory docs)
- Total token budget across all docs can exceed 200K
- You also need tokens for the system prompt and the generated output

**Recommended approach (MVP):**
1. Extract all documents
2. Concatenate extracted text with document labels
3. If total token count exceeds 150K tokens (conservative budget), apply **truncation with a priority order**: RFP text first (most important), then protocol, then budget summary, then transcripts
4. V2: implement proper RAG — chunk documents, embed with `pgvector`, retrieve relevant chunks per section being generated

**Token estimation (before sending to Claude):**

```typescript
// Rough estimate: 4 characters per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildAiContext(
  documents: Array<{ type: string; text: string }>,
  maxTokens = 150000
): string {
  const priorityOrder = ["rfp", "protocol", "budget", "transcript", "template", "other"];
  const sorted = [...documents].sort((a, b) =>
    priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type)
  );

  let context = "";
  let usedTokens = 0;

  for (const doc of sorted) {
    const docHeader = `\n\n=== ${doc.type.toUpperCase()} ===\n`;
    const fullSection = docHeader + doc.text;
    const sectionTokens = estimateTokens(fullSection);

    if (usedTokens + sectionTokens > maxTokens) {
      // Truncate this document to fit remaining budget
      const remainingTokens = maxTokens - usedTokens;
      const remainingChars = remainingTokens * 4;
      context += docHeader + doc.text.substring(0, remainingChars) + "\n[TRUNCATED]";
      break;
    }

    context += fullSection;
    usedTokens += sectionTokens;
  }

  return context;
}
```

---

## 8. Recommended MVP Implementation Plan

### Phase 1: File Upload UI + Storage (no parsing yet)
1. Create `proposal-documents` bucket in Supabase (private)
2. Set up storage RLS policies
3. Create `documents` table in Postgres
4. Build file upload component in React (drag-drop, file type validation, progress indicator)
5. Upload directly from browser to Supabase Storage
6. Record file metadata in `documents` table
7. Show uploaded files list in proposal wizard Step 2

### Phase 2: Extraction Edge Function
1. Create `extract-document` Edge Function
2. Install `pdf-parse`, `mammoth`, `xlsx` via npm specifiers
3. Implement per-format extraction (PDF, DOCX, XLSX, TXT)
4. Store `extracted_text` in `documents` table
5. Handle errors gracefully (empty PDFs, password-protected files, corrupt files)
6. Trigger from frontend after upload completes

### Phase 3: AI Context Assembly
1. Build `buildAiContext()` utility that concatenates extracted texts with document labels
2. Apply token budget management (truncation with priority order)
3. Feed assembled context into the existing `cro-proposal-generator.js` prompt structure
4. Test with real clinical trial RFPs

### Phase 4: DOCX Export
1. Install `docx` npm package in the React frontend
2. Install `file-saver` for browser download trigger
3. Build a `ProposalExporter` class/hook that maps proposal sections to `docx` Document structure
4. Handle tables (study schedules, deliverables), bullet lists, section headings
5. Add "Export to DOCX" button in proposal workspace
6. Test output in Word, Google Docs, LibreOffice

### V2 Additions
- `docxtemplater` for template-matching exports
- RAG chunking pipeline with `pgvector` (replace context truncation)
- OCR for scanned PDFs via external API (Google Cloud Vision or AWS Textract)
- PDF export (Puppeteer/headless Chrome in a separate service, or a PDF generation API)

---

## 9. Gotchas and Known Issues

**Confidence: HIGH** (based on well-known issues in these libraries)

### pdf-parse Test Runner Gotcha
**Problem:** Importing `npm:pdf-parse` (default export) runs test code in some Deno environments.
**Fix:** Import from the lib path directly:
```typescript
import pdfParse from "npm:pdf-parse/lib/pdf-parse.js";
```

### SheetJS License Change
**Problem:** SheetJS `xlsx` versions >= 0.19.0 changed from MIT to a proprietary license.
**Fix:** Pin to `0.18.5` for MIT compliance in a commercial product, or purchase a SheetJS Pro license.

### Password-Protected Files
**Problem:** pdf-parse and mammoth both throw on password-protected documents. CROs sometimes share protected PDFs.
**Fix:** Catch the error and return a user-friendly message: "This file appears to be password-protected. Please provide an unprotected version." Do NOT attempt to crack passwords.

### Empty PDF Text Extraction
**Problem:** A scanned PDF returns an empty string from pdf-parse (no text objects in the file).
**Fix:** After extraction, check `extractedText.trim().length`. If empty and file extension is `.pdf`, surface a warning: "No text could be extracted from this PDF. It may be a scanned document. Text from scanned PDFs requires OCR (coming in V2)." Let the user continue — they can still generate a proposal using other uploaded documents.

### DOCX Formatting Complexity
**Problem:** The `docx` package API is verbose. Complex formatting decisions (page numbering, headers/footers with org logo, exact font sizes) require significant boilerplate.
**Fix:** Build a `DocxBuilder` utility class with pre-configured methods (`addSection()`, `addTable()`, `addBulletList()`) that encapsulate the `docx` API complexity. The proposal workspace components call the utility, not the raw API.

### Edge Function Cold Start
**Problem:** The first invocation of `extract-document` after a period of inactivity has a cold start (~1-3 seconds on Deno Deploy). Users experience a slow response on the first upload.
**Fix:** Show a loading state with a message like "Analyzing your documents..." — this is expected. For V2, consider Supabase's function warm-up ping.

### Large File Memory Pressure
**Problem:** A 20MB PDF loaded entirely into a Uint8Array inside an Edge Function uses ~20MB of the ~512MB limit. Multiple concurrent requests could theoretically cause memory pressure.
**Fix:** For MVP, accept this risk (concurrent document processing from a single user is unlikely in early usage). For V2, implement streaming extraction or queue-based processing.

---

## 10. Library Summary Table

| Use Case | Library | Version | Location | License | Confidence |
|----------|---------|---------|----------|---------|------------|
| PDF text extraction | `pdf-parse` | 1.1.1 | Edge Function (Deno) | MIT | MEDIUM |
| DOCX text extraction | `mammoth` | 1.8.0 | Edge Function (Deno) | MIT | HIGH |
| XLSX parsing | `xlsx` (SheetJS) | 0.18.5 | Edge Function (Deno) | MIT (0.18.5 only) | HIGH |
| DOCX generation | `docx` | 8.5.0 | Browser (React) | MIT | HIGH |
| Browser download trigger | `file-saver` | 2.0.5 | Browser (React) | MIT | HIGH |
| DOCX template filling (V2) | `docxtemplater` | 3.49.0 | Browser or Deno | LGPL/Paid | MEDIUM |
| HTML→Markdown (optional) | `turndown` | 7.1.3 | Edge Function (Deno) | MIT | HIGH |

---

## 11. Items Requiring Live Verification

The following should be verified against current Supabase and library documentation before implementation:

1. **pdf-parse Deno import path fix** — confirm `npm:pdf-parse/lib/pdf-parse.js` resolves correctly in current Supabase Edge Functions (Deno 1.40+). Community reports suggest it works; test in a minimal Edge Function before committing.

2. **Supabase Storage default bucket size limit** — verify current default per-object size limit on your Supabase plan. The 50MB default may have changed.

3. **Edge Function memory and timeout limits** — verify current limits on your plan (Supabase Free vs Pro vs Enterprise have different limits). Critical for large PDF processing.

4. **SheetJS 0.18.5 npm: specifier** — confirm `npm:xlsx@0.18.5` resolves in Deno Deploy. Test with a simple import before building the extraction pipeline around it.

5. **`docx` package v8.x API** — verify `HeadingLevel`, `Packer.toBlob()`, and table APIs are unchanged in current v8.x. The API was stable through v8.5 in training data.

6. **Supabase Storage RLS `storage.foldername()` function** — verify this helper function exists in your Supabase version. Alternative: use a CHECK constraint on a custom `documents` table instead of direct storage RLS.

---

*Research complete. This document reflects knowledge through August 2025. Verify library versions and Supabase Edge Functions behavior against current documentation before implementation.*
