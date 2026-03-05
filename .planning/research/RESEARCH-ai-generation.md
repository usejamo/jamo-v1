# AI Generation Research: Jamo CRO Proposal Platform

**Researched:** 2026-03-05
**Confidence:** MEDIUM — Anthropic API knowledge is based on training data through August 2025. Web tool access was unavailable during this session. All Anthropic API patterns are well-established and documented; mark any version-specific claims for verification before implementation.
**Existing asset reviewed:** `cro-proposal-generator.js` (root-level)

---

## Existing Implementation Assessment

The current `cro-proposal-generator.js` has a solid foundation:

- **System prompt:** Comprehensive 13-section CRO proposal structure. Well-scoped and domain-appropriate.
- **`buildUserMessage()`:** Cleanly structured user message builder with graceful `[Not provided]` fallbacks.
- **`generateProposal()`:** Basic non-streaming fetch call to `https://api.anthropic.com/v1/messages`.
- **`generateProposalBySection()`:** Section-by-section loop — the critical design pattern — but with a significant flaw: it passes the full text of ALL prior sections in every subsequent call, growing the input context O(n²) across 11 sections. This will overflow context windows on large proposals and incur excessive token costs.

The research below addresses all five question areas and directly targets the gaps in the current implementation.

---

## 1. Section-by-Section Generation with Claude

### The Core Problem the Current Code Has

`generateProposalBySection()` uses `fullSections.join('\n\n---\n\n')` as prior context passed verbatim into every subsequent call. With 11 sections at ~2,000–4,000 words each, by section 8 the prior context payload alone is 20,000–30,000 tokens — this is before the system prompt (~1,500 tokens) and user message (~2,000–5,000 tokens). That total easily hits 35,000+ tokens on the input side. The context window for claude-sonnet-4-5 is 200K tokens (HIGH confidence), so overflow isn't the immediate risk — cost and latency are.

The real issues:
1. **Cost:** Token cost is input + output. Sections 9–11 each pay for 25,000+ tokens of prior context they mostly don't need.
2. **Latency:** Time to first token increases with input length.
3. **Consistency drift:** Long prior context doesn't actually prevent inconsistency — Claude needs *structured* consistency anchors, not a raw dump of text.

### Recommended Pattern: Summary-Anchored Section Generation

Instead of passing full prior sections, maintain a running **Proposal Consistency Anchor** — a short structured summary that is updated after each section is generated.

```typescript
interface ProposalAnchor {
  // Extract these from generated sections as they're completed
  studyTitle: string;
  therapeuticArea: string;
  totalEnrollment: number;
  siteCount: number;
  countryCount: number;
  enrollmentTimeline: string; // e.g., "18 months"
  keyMilestones: {
    fsi: string;       // First Subject In
    lsi: string;       // Last Subject In
    databaseLock: string;
    finalCsr: string;
  };
  budgetRange: string;        // e.g., "$4.2M–$5.1M"
  keyPersonnelNamed: string[]; // Names used in Section 5
  servicesInScope: string[];
  servicesOutOfScope: string[];
  openAssumptions: string[];   // Flagged assumptions from prior sections
}
```

Pass this anchor (typically 300–600 tokens) instead of the full prior section text. After each section completes, run a secondary extraction call to update the anchor.

```typescript
async function extractAnchorUpdates(
  sectionText: string,
  currentAnchor: ProposalAnchor,
  apiKey: string
): Promise<Partial<ProposalAnchor>> {
  // Short, focused extraction call — max 500 output tokens
  const extractionPrompt = `
From this generated proposal section, extract any concrete values that should
stay consistent throughout the full proposal. Return ONLY a JSON object with
these fields (omit fields where no value appears in the text):

{
  "totalEnrollment": number | null,
  "siteCount": number | null,
  "enrollmentTimeline": string | null,
  "keyMilestones": { "fsi": string, "lsi": string, ... } | null,
  "budgetRange": string | null,
  "keyPersonnelNamed": string[] | null,
  "openAssumptions": string[] | null
}

SECTION TEXT:
${sectionText.substring(0, 4000)} // truncate for extraction pass
  `;

  // Call with low max_tokens — this is a structured extraction, not generation
  const result = await callClaude(extractionPrompt, { maxTokens: 500 });
  return JSON.parse(result);
}
```

**Confidence:** MEDIUM — This pattern is established practice for multi-turn document generation. The anchor structure is specific to CRO proposals and must be tuned.

### Section Prompt Template with Anchor

```typescript
function buildSectionPrompt(
  userMessage: string,
  sectionSpec: { id: string; name: string; sections: string },
  anchor: ProposalAnchor
): string {
  const anchorBlock = anchor ? `
## CONSISTENCY REQUIREMENTS (must match across all sections)

- Study Enrollment: ${anchor.totalEnrollment} subjects
- Sites: ${anchor.siteCount} sites across ${anchor.countryCount} countries
- Enrollment Duration: ${anchor.enrollmentTimeline}
- FSI Target: ${anchor.keyMilestones?.fsi ?? 'TBD'}
- LSI Target: ${anchor.keyMilestones?.lsi ?? 'TBD'}
- Database Lock: ${anchor.keyMilestones?.databaseLock ?? 'TBD'}
- Budget Range: ${anchor.budgetRange ?? 'TBD'}
- Named Personnel: ${anchor.keyPersonnelNamed?.join(', ') ?? 'Not yet named'}
- Services In Scope: ${anchor.servicesInScope?.join(', ')}
- Open Assumptions: ${anchor.openAssumptions?.slice(0, 5).join(' | ')}

Do NOT introduce numbers or names that contradict the above.` : '';

  return `${userMessage}

${anchorBlock}

---

INSTRUCTION: Generate ONLY section(s) ${sectionSpec.sections} (${sectionSpec.name}).
Follow all structural and style guidelines from your system instructions.
Ensure all figures, timelines, and personnel names are consistent with the
CONSISTENCY REQUIREMENTS above.`;
}
```

### Recommended max_tokens Per Section

| Section | Expected Length | Recommended max_tokens |
|---------|-----------------|------------------------|
| Cover Letter | 300–500 words | 1,500 |
| Executive Summary | 600–1,000 words | 3,000 |
| Understanding of Study | 800–1,200 words | 3,500 |
| Scope 4.1–4.3 (3 subsections) | 1,500–2,500 words | 6,000 |
| Scope 4.4–4.5 (2 subsections) | 1,000–1,800 words | 5,000 |
| Scope 4.6–4.8 (3 subsections) | 1,500–2,500 words | 6,000 |
| Scope 4.9–4.13 (5 subsections) | 2,000–3,000 words | 7,000 |
| Team & Experience (5+6) | 1,200–2,000 words | 5,000 |
| Technology (7) | 600–1,000 words | 3,000 |
| Timeline & Risk (8+9) | 1,000–2,000 words | 5,000 |
| Budget, Legal, Compliance (10–13) | 1,500–2,500 words | 6,000 |

**Total estimated output:** ~50,000 tokens across all sections. At current claude-sonnet-4-5 pricing (verify current rates at docs.anthropic.com/en/docs/about-claude/models), a full proposal generation is a meaningful per-unit cost to model into pricing.

### Generation Order Recommendation

Counterintuitive but important: **generate Section 3 (Understanding of the Study) first**, not Section 1 (Cover Letter). The understanding section extracts the most critical anchor values (enrollment, endpoints, key challenges). Then generate sections 4–13, then section 2 (Executive Summary, which needs to reference figures from the full proposal), then section 1 (Cover Letter, which references the project director named in section 5).

Revised order:
```
3 → 4.1–4.3 → 4.4–4.5 → 4.6–4.8 → 4.9–4.13 → 5 → 6 → 7 → 8 → 9 → 10–13 → 2 → 1
```

This ensures:
- Section 2 (Executive Summary) has real figures to cite
- Section 1 (Cover Letter) has the named project director from Section 5
- Budget consistency: Section 10 follows Section 4 (scope drives cost)

---

## 2. Streaming Responses for Better UX

### Why Streaming Matters for CRO Proposals

A single section call with max_tokens: 6,000 can take 30–60 seconds without streaming. For a CRO professional evaluating the platform, a blank screen for 45 seconds is unacceptable. Streaming shows progress immediately and creates the impression of a "thinking" system.

### Anthropic Streaming API Implementation

The Anthropic API supports Server-Sent Events (SSE) streaming. Add `"stream": true` to the request body.

**Confidence:** HIGH — This is the documented Anthropic streaming API as of August 2025.

```typescript
// Core streaming fetch call — TypeScript, works in browser or Node.js
async function* streamSection(
  systemPrompt: string,
  userMessage: string,
  options: { apiKey: string; model: string; maxTokens: number }
): AsyncGenerator<string, void, unknown> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens,
      stream: true,   // KEY: enable streaming
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error ${response.status}: ${err.error?.message}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep partial line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          // SSE event types from Anthropic streaming:
          // message_start, content_block_start, ping, content_block_delta,
          // content_block_stop, message_delta, message_stop
          if (
            parsed.type === 'content_block_delta' &&
            parsed.delta?.type === 'text_delta'
          ) {
            yield parsed.delta.text;
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }
  }
}
```

### React Integration Pattern

```typescript
// In a React component managing section generation
const [sectionText, setSectionText] = useState('');
const [isStreaming, setIsStreaming] = useState(false);

async function generateSection(sectionSpec: SectionSpec, anchor: ProposalAnchor) {
  setIsStreaming(true);
  setSectionText('');

  const prompt = buildSectionPrompt(userMessage, sectionSpec, anchor);
  let accumulated = '';

  try {
    for await (const chunk of streamSection(SYSTEM_PROMPT, prompt, options)) {
      accumulated += chunk;
      setSectionText(accumulated); // re-render on each chunk
    }

    // After section completes, extract anchor updates
    const anchorUpdates = await extractAnchorUpdates(accumulated, anchor, apiKey);
    setAnchor(prev => ({ ...prev, ...anchorUpdates }));
  } finally {
    setIsStreaming(false);
  }
}
```

### UX Pattern: Section Progress Indicator

For the section-by-section generation flow, show a progress rail:

```
[Cover Letter] [Exec Summary] [Study Understanding] [Scope...] ... [Budget]
     ✓              ✓               streaming...           ○          ○
```

Each section should render into the proposal document as it streams, so the user sees the document being "written" in real time rather than section cards appearing one by one.

### Abort/Cancel Streaming

```typescript
// Pass an AbortController signal for user-initiated cancel
const controller = new AbortController();

const response = await fetch('https://api.anthropic.com/v1/messages', {
  // ...
  signal: controller.signal,
});

// In UI: "Stop generating" button calls controller.abort()
```

---

## 3. Document Extraction and Information Structuring

### The Two-Pass Architecture

Before generating a proposal, Jamo needs to extract structured data from uploaded RFP documents (PDFs, DOCX). The recommended pattern is a **two-pass pipeline**:

**Pass 1 — Extraction:** Claude reads the raw document and outputs structured JSON matching the `ProposalInput` shape from `cro-proposal-generator.js`.

**Pass 2 — Generation:** The extracted JSON feeds `buildUserMessage()` → section-by-section generation.

This separation is critical. Combining extraction and generation in one prompt degrades both: extraction quality drops because the model is also trying to be creative, and generation quality drops because context is polluted with raw document text.

### Extraction System Prompt

```
You are a clinical trial data extraction specialist. Your ONLY task is to read
the provided RFP or protocol document and extract structured information into
JSON format.

RULES:
1. Extract ONLY what is explicitly stated in the document.
2. For any field not present, use null — never infer or fabricate values.
3. For fields where the document is ambiguous, extract the most literal reading
   and set confidence: "low".
4. All date values: use ISO 8601 format (YYYY-MM-DD) if stated, otherwise null.
5. Return ONLY valid JSON. No commentary, no markdown code blocks.
```

### Extraction User Prompt

```typescript
const EXTRACTION_FIELDS = `
{
  "sponsor": {
    "name": string | null,
    "contactName": string | null,
    "contactTitle": string | null,
    "rfpReference": string | null,
    "rfpDate": string | null,        // ISO 8601
    "proposalDueDate": string | null, // ISO 8601
    "requirements": string | null
  },
  "study": {
    "title": string | null,
    "protocolNumber": string | null,
    "phase": string | null,          // "Phase II", "Phase III", etc.
    "therapeuticArea": string | null,
    "indication": string | null,
    "design": string | null,
    "primaryEndpoints": string | null,
    "secondaryEndpoints": string | null,
    "targetEnrollment": number | null,
    "numberOfSites": number | null,
    "countriesRegions": string | null,
    "duration": string | null,
    "investigationalProduct": string | null,
    "mechanismOfAction": string | null,
    "comparatorControl": string | null,
    "inclusionExclusionSummary": string | null
  },
  "servicesRequested": string[] | null,
  "budget": {
    "pricingModel": string | null,
    "currency": string | null,
    "notes": string | null
  },
  "extractionConfidence": {
    "overall": "high" | "medium" | "low",
    "fieldsWithLowConfidence": string[],
    "criticalMissingFields": string[],   // Fields required for proposal gen
    "documentType": "rfp" | "protocol" | "synopsis" | "combined" | "unknown",
    "notes": string
  }
}`;

function buildExtractionPrompt(documentText: string): string {
  return `Extract structured information from the following clinical trial document.
Return a JSON object with exactly these fields:

${EXTRACTION_FIELDS}

DOCUMENT:
${documentText}`;
}
```

### Calling Extraction

```typescript
async function extractFromDocument(
  documentText: string,
  apiKey: string,
  model = 'claude-sonnet-4-5-20250929'
): Promise<ProposalInput & { extractionConfidence: ExtractionConfidence }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,  // Extraction output is compact JSON — 2K is sufficient
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildExtractionPrompt(documentText) }],
    }),
  });

  const data = await response.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');

  // Strip any accidental markdown code fences Claude may include
  const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}
```

### Handling PDFs and DOCX in a Frontend-Only App

The current Jamo stack is frontend-only (no backend). This creates a constraint: PDF/DOCX parsing must happen client-side before text is sent to the Anthropic API.

**Recommended libraries:**
- **PDF:** `pdf.js` (Mozilla, well-maintained, MIT license) — extracts text from PDFs in the browser. Install: `npm install pdfjs-dist`.
- **DOCX:** `mammoth.js` — converts DOCX to plain text/HTML in the browser. Install: `npm install mammoth`.

```typescript
// PDF extraction — browser-compatible
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}

// DOCX extraction — browser-compatible
import mammoth from 'mammoth';

async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
```

**Important constraint:** The Anthropic API does not accept binary file uploads in the messages API — you must extract text first and pass it as a string. The Files API (if available at your API version) is a separate feature for caching, not binary document parsing.

**Confidence:** HIGH for pdf.js and mammoth approach. MEDIUM for "Files API not supporting binary parsing" — verify at docs.anthropic.com.

### Confidence Levels in Extraction

The `extractionConfidence` field in the schema above gives you actionable data. Use it in the UI:

- `critical_missing_fields` → Show a "Missing required information" banner before starting generation. Prompt user to fill these in manually.
- `fieldsWithLowConfidence` → Highlight extracted values as editable in a review form with a yellow "low confidence" indicator.
- `documentType: "unknown"` → Show a warning: "This document doesn't look like an RFP or protocol. Generation quality may be affected."

After extraction, **always show users a confirmation/edit form** before triggering generation. Never go directly from document → generation without a human review step.

---

## 4. RAG for Regulatory Documents

### When RAG Is Appropriate for Jamo

RAG (Retrieval-Augmented Generation) is appropriate for Jamo in two specific scenarios:

1. **CRO's own regulatory document library:** The CRO's SOPs, past proposal sections, site databases, regulatory strategy templates — proprietary content that differs by CRO and must be injected at generation time.
2. **ICH/FDA/EMA guidance documents:** Standard regulatory references (ICH E6 R2/R3, FDA guidance on enrollment diversity, EMA guidelines). These are large but largely static.

For a v1/MVP, **scenario 2 is likely premature complexity**. Claude already has strong knowledge of ICH E6, FDA, and EMA standards in its training data. The value-add from RAG over static guidelines is marginal unless you need to cite specific section numbers from specific guidance documents.

For a v1, focus RAG energy on **scenario 1** (CRO-specific content) if the CRO has usable document libraries. If not, defer RAG entirely.

### RAG Architecture (when needed)

Full RAG requires a backend. The current frontend-only architecture cannot run a vector database or embedding model in the browser — these require persistent compute. Plan for a lightweight backend (Node.js/Express or serverless functions) before implementing RAG.

Required components:
- **Embedding model:** Use Anthropic's `voyage-3` via the Anthropic Embeddings API, or OpenAI `text-embedding-3-small`. Both produce 1536-dimension vectors.
- **Vector store:** Supabase with pgvector (easiest to add to an existing Supabase DB), Pinecone (hosted, simple API), or Qdrant (self-hosted).
- **Chunking strategy:** 512-token chunks with 64-token overlap for regulatory text. Larger chunks lose precision; smaller chunks lose context.

**Confidence:** HIGH for the architecture description. MEDIUM for voyage-3 specifically — verify current Anthropic embedding model names at docs.anthropic.com.

### Retrieval Prompt Pattern

When you do add RAG, the key is to frame retrieved chunks as **reference material**, not instructions:

```
You are generating Section 4.2 (Regulatory Affairs) of a CRO proposal.

## REGULATORY REFERENCE MATERIAL
The following excerpts are from relevant ICH/FDA/EMA guidance documents.
Reference them where appropriate. Do not quote verbatim unless citing.
Use [ICH E6(R3) Section 5.2] style citation format inline.

--- CHUNK 1 (Source: ICH E6 R3 Final, Section 5.2.1) ---
[chunk text]

--- CHUNK 2 (Source: FDA Guidance on IRB Review, 2023, p.12) ---
[chunk text]

--- CHUNK 3 (Source: EMA Guideline on GCP Inspection, 2024) ---
[chunk text]

## PROPOSAL INPUT DATA
[standard user message content]

## INSTRUCTION
Generate Section 4.2 now. Cite regulatory references inline where substantively
relevant. Do not cite more than once per paragraph. Do not cite references that
are not from the REGULATORY REFERENCE MATERIAL above.
```

**How many chunks:** 3–5 per section call is the practical limit before the model starts ignoring chunks or degrading in quality. Retrieve by semantic similarity to the section topic (e.g., for Section 4.2 Regulatory, retrieve chunks tagged with "regulatory", "IND", "CTA", "Ethics Committee").

### Citation Format Guidance

Instruct Claude to use inline citations in a consistent format: `[Source Name, Year, Section/Page]`. Run a post-processing step to extract all citations into a reference list for the Appendices section.

---

## 5. Proactive Gap Detection

### The Gap Detection Loop

Gap detection is a distinct AI pass, not part of generation. Run it after the full proposal draft is assembled.

```
[Generated Proposal] → [Gap Detection Pass] → [Gap List] → [UI: Show gaps to user]
                                                                    ↓
                                              [User answers questions]
                                                                    ↓
                                              [Targeted Section Regeneration]
```

### Gap Detection Prompt

```typescript
const GAP_DETECTION_SYSTEM = `
You are a senior CRO proposal reviewer with 20+ years of experience.
Your task is to identify critical gaps or weaknesses in a draft CRO proposal
before it is submitted to a sponsor.

You will return a JSON array of gap objects. Each gap has:
{
  "id": string,              // unique slug, e.g., "missing-site-count"
  "severity": "critical" | "important" | "minor",
  "section": string,         // proposal section where gap appears
  "issue": string,           // one sentence: what is missing or weak
  "question": string,        // the specific question to ask the user to resolve it
  "suggestedDefault": string | null  // if there's a reasonable default, suggest it
}

Return ONLY a valid JSON array. No commentary.
`;

const GAP_DETECTION_USER = (proposalDraft: string, originalInput: ProposalInput) => `
## ORIGINAL PROPOSAL INPUTS
${JSON.stringify(originalInput, null, 2)}

## GENERATED PROPOSAL DRAFT
${proposalDraft.substring(0, 40000)} // Cap at ~40K chars to stay within context

Identify all critical gaps in this draft. Focus on:
1. Placeholders ([PLACEHOLDER: ...]) left unfilled
2. Timelines that are internally inconsistent (e.g., FSI before regulatory approval)
3. Budget sections with missing unit costs or assumptions
4. Team sections with unnamed personnel in critical roles
5. Regulatory sections missing country-specific requirements
6. Enrollment assumptions that are unrealistic given the therapeutic area
7. Missing case studies or generic/non-specific case study content
8. Scope sections that don't match the services requested
`;
```

### Gap Detection API Call

```typescript
async function detectGaps(
  proposalDraft: string,
  originalInput: ProposalInput,
  apiKey: string
): Promise<Gap[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929', // Use Sonnet for gap detection — cost savings vs Opus
      max_tokens: 3000,
      system: GAP_DETECTION_SYSTEM,
      messages: [{
        role: 'user',
        content: GAP_DETECTION_USER(proposalDraft, originalInput)
      }],
    }),
  });

  const data = await response.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}
```

### UI Pattern for Gap Resolution

After gap detection returns results, present them to the user as a prioritized checklist:

```
[!] CRITICAL — Team Section: Project Director is not named.
    → "Who is your proposed Project Director for this study?"
    [text input]

[!] CRITICAL — Budget: No unit cost assumptions provided for monitoring visits.
    → "How many on-site monitoring visits per site do you plan?"
    [number input]  [or "Use industry standard: 8 visits/site"]

[~] IMPORTANT — Timeline: FSI date is not specified.
    → "When is your target First Subject In date?"
    [date picker]
```

### Targeted Section Regeneration After Gap Resolution

After users answer gap questions, regenerate only the affected sections (not the full proposal):

```typescript
interface GapResolution {
  gapId: string;
  userAnswer: string;
}

async function regenerateSectionWithResolutions(
  sectionId: string,
  originalSectionText: string,
  resolutions: GapResolution[],
  anchor: ProposalAnchor,
  apiKey: string
): Promise<string> {
  const resolutionContext = resolutions
    .map(r => `- Gap resolved: ${r.gapId}\n  User provided: ${r.userAnswer}`)
    .join('\n');

  const prompt = `
## ORIGINAL SECTION DRAFT
${originalSectionText}

## GAP RESOLUTIONS PROVIDED BY USER
${resolutionContext}

## INSTRUCTION
Revise the above section to incorporate the gap resolutions. Preserve all content
that was acceptable. Only change text that is affected by the resolutions.
Return the complete revised section.
  `;

  return callClaude(prompt, { maxTokens: 6000, apiKey });
}
```

---

## 6. Context-Aware Chat (Document Q&A)

### The Chat Panel Architecture

The `ARCHITECTURE.md` shows an `AIChatPanel` already exists in the codebase (referenced via `PendingSuggestion` and `COMMAND_MAP`). The research below describes the backend pattern needed to make it functional for real document Q&A.

### Conversation History Management

The Anthropic messages API is stateless — conversation history must be maintained client-side and sent with each call. The challenge is context window budget.

For a 13-section CRO proposal (~25,000 words ≈ ~33,000 tokens), the full proposal as context + conversation history can eat the entire context window within a few turns.

**Solution: Sliding window with section targeting**

Rather than including the full proposal in every chat call, identify which section(s) the user's question pertains to and include only those sections plus a short proposal summary.

```typescript
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatContext {
  proposalSummary: string;        // ~500 tokens: key numbers, scope, timeline
  relevantSections: string[];     // 1-3 sections most relevant to current question
  conversationHistory: ChatMessage[]; // Last N turns (sliding window)
}

function buildChatContext(
  proposal: GeneratedProposal,
  userQuestion: string,
  history: ChatMessage[]
): ChatContext {
  return {
    proposalSummary: proposal.anchor ? formatAnchorAsText(proposal.anchor) : '',
    relevantSections: identifyRelevantSections(userQuestion, proposal.sections),
    conversationHistory: history.slice(-10), // Keep last 10 turns max
  };
}
```

### Section Targeting via Keyword Matching

For a simple v1, keyword-based section targeting is sufficient and avoids the complexity of semantic search:

```typescript
const SECTION_KEYWORDS: Record<string, string[]> = {
  'cover_letter': ['cover letter', 'introduction', 'greeting'],
  'executive_summary': ['executive summary', 'overview', 'highlights', 'budget range'],
  'understanding': ['study design', 'endpoints', 'inclusion', 'exclusion', 'population'],
  'scope_pm': ['project management', 'governance', 'escalation', 'kick-off', 'communication plan'],
  'scope_regulatory': ['regulatory', 'IND', 'CTA', 'IRB', 'ethics', 'submission'],
  'scope_monitoring': ['monitoring', 'CRA', 'site visit', 'RBM', 'risk-based'],
  'scope_recruitment': ['enrollment', 'recruitment', 'retention', 'FSI', 'LSI'],
  'scope_data': ['data management', 'EDC', 'CRF', 'query', 'database lock'],
  'scope_stats': ['biostatistics', 'SAP', 'CDISC', 'SDTM', 'ADaM', 'randomization'],
  'team': ['team', 'personnel', 'project director', 'CRA', 'medical monitor'],
  'timeline': ['timeline', 'milestone', 'Gantt', 'critical path', 'schedule'],
  'risk': ['risk', 'mitigation', 'contingency', 'RAID'],
  'budget': ['budget', 'cost', 'pricing', 'payment', 'invoice', 'unit cost'],
};

function identifyRelevantSections(
  question: string,
  sections: Record<string, string>
): string[] {
  const lower = question.toLowerCase();
  const scored: Array<{ id: string; score: number }> = [];

  for (const [sectionId, keywords] of Object.entries(SECTION_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > 0) scored.push({ id: sectionId, score });
  }

  // Return top 2 most relevant sections
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(s => s.id);
}
```

### Chat System Prompt

```
You are a CRO proposal assistant helping the user review and refine their draft proposal.

You have access to:
1. A summary of the full proposal (key numbers, scope, timeline)
2. The full text of the most relevant proposal sections for the current question
3. The conversation history

Your role:
- Answer questions about proposal content accurately
- Explain complex clinical trial concepts clearly
- Suggest specific improvements with example language
- When asked to modify a section, produce a complete revised version with a clear
  "[SUGGESTED REVISION — Section X.X]" header so the user can accept or decline it
- If asked about something not covered in the provided sections, say so clearly
  rather than guessing

CRITICAL: Do not contradict figures, timelines, or claims stated in the
proposal sections you've been given. If you believe something is incorrect,
flag it explicitly: "[NOTE: This may conflict with the timeline in Section 8]"
```

### Chat User Message Template

```typescript
function buildChatMessage(
  userQuestion: string,
  context: ChatContext
): string {
  const sectionTexts = context.relevantSections
    .map(id => `### Section: ${id}\n${context.proposalContent[id] ?? '(not generated)'}`)
    .join('\n\n---\n\n');

  return `## PROPOSAL SUMMARY
${context.proposalSummary}

## RELEVANT SECTIONS
${sectionTexts}

## USER QUESTION
${userQuestion}`;
}

// Full chat API call including history
async function chat(
  userQuestion: string,
  history: ChatMessage[],
  context: ChatContext,
  apiKey: string
): Promise<string> {
  const messages: ChatMessage[] = [
    ...history,
    {
      role: 'user',
      content: buildChatMessage(userQuestion, context),
    },
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,  // Chat responses should be concise — 2K sufficient
      system: CHAT_SYSTEM_PROMPT,
      messages,
    }),
  });

  const data = await response.json();
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('');
}
```

### "Explain This Section" Pattern (Traceback to Source)

The `ARCHITECTURE.md` shows the draft type system supports `Annotation` objects linking text segments to source documents. To implement "explain this selection":

1. User selects text in the proposal renderer.
2. Selected text + the section ID are sent to chat as a structured question.
3. The chat prompt explicitly includes the relevant source document excerpt (from the extraction pass) alongside the proposal section.

```typescript
function buildExplainPrompt(
  selectedText: string,
  sectionId: string,
  sectionContent: string,
  sourceDocumentExcerpt: string // The RFP/protocol text that this was based on
): string {
  return `The user has selected the following text from Section "${sectionId}" of the proposal:

"${selectedText}"

The proposal section this comes from is:
${sectionContent.substring(0, 3000)}

The source RFP/protocol text that informed this section was:
${sourceDocumentExcerpt.substring(0, 2000)}

Please explain:
1. Why this language was used in the proposal (what from the RFP/protocol drove it)
2. What the CRO is committing to with this language
3. Whether this is standard industry language or tailored to this study
4. Any risks or implications the CRO user should be aware of`;
}
```

---

## 7. CRO/Clinical Trial Domain-Specific Prompt Engineering

### Terminology That Improves Output Quality

The existing system prompt uses appropriate terminology, but these additions improve consistency:

**Always include in system context:**
- The specific ICH guideline version: "ICH E6(R3) Final" (not just "ICH-GCP") — this forces current standards
- "CDISC SDTM 3.4 and ADaM 1.3" — forces current data standard references
- "FDA 21 CFR Part 11" for electronic records — triggers appropriate compliance language
- Regulatory body full names: "US FDA Center for Drug Evaluation and Research (CDER)" — avoids ambiguous abbreviations

**Instruction to prevent common failures:**
```
When describing timelines, always anchor from a study start date. Never use
relative terms like "Month 1" or "Week 4" without also providing an absolute
date (or flagging it as [PLACEHOLDER: absolute date needed]).

When listing countries, always note whether the regulatory pathway is
IND (US), CTA (EU/UK), or study-specific.

When describing site counts, distinguish between "planned sites" and
"activated sites" — these are different at FSI.
```

### Structured Output Enforcement

For extraction and gap detection, always instruct Claude to return valid JSON and implement a retry with correction prompt if parsing fails:

```typescript
async function callWithJsonRetry<T>(
  prompt: string,
  systemPrompt: string,
  apiKey: string,
  maxRetries = 2
): Promise<T> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const correctionNote = lastError
      ? `\n\nIMPORTANT: Your previous response failed JSON parsing with: "${lastError}". Return ONLY valid JSON this time.`
      : '';

    const text = await callClaude(prompt + correctionNote, { systemPrompt, apiKey, maxTokens: 2000 });
    const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      lastError = String(e);
    }
  }

  throw new Error(`Failed to get valid JSON after ${maxRetries + 1} attempts`);
}
```

### Model Selection Guidance

| Task | Recommended Model | Rationale |
|------|------------------|-----------|
| Proposal section generation | claude-opus-4-6 (high value) or claude-sonnet-4-5 (cost-efficient) | Long-form professional writing; quality matters |
| Document extraction | claude-sonnet-4-5 | Structured task; Sonnet is sufficient and cheaper |
| Gap detection | claude-sonnet-4-5 | Analytical task; Sonnet performs well |
| Chat Q&A | claude-sonnet-4-5 | Conversational; latency matters; cost accumulates |
| Anchor extraction (metadata) | claude-haiku-3 (if available) | Tiny structured task; cheapest model appropriate |

Verify current model IDs and whether claude-haiku-3 is still available at: https://docs.anthropic.com/en/docs/about-claude/models/overview

---

## 8. Key Constraints and Design-Around Requirements

### Constraint 1: No Backend (Current Architecture)

The current app is a frontend-only SPA. This creates several hard constraints:

- **API key exposure:** `ANTHROPIC_API_KEY` in a frontend `.env` is exposed to any user who opens DevTools. This is acceptable for internal demos and MVP testing, but requires a backend proxy before any production or external user access.
- **No persistent storage:** Extracted data, generated proposals, and conversation history are lost on page refresh. Must be addressed before shipping.
- **No RAG:** Vector databases require a backend. Frontend-only RAG is impractical.

**Recommendation:** Add a lightweight backend (Cloudflare Workers, Vercel Edge Functions, or Node.js/Express) before any real user access. This also moves API key management server-side.

### Constraint 2: Context Window Budget

| Model | Context Window | Practical Input Budget (leaving room for output) |
|-------|---------------|--------------------------------------------------|
| claude-sonnet-4-5 | 200K tokens | ~185K tokens input |
| claude-opus-4-6 | 200K tokens | ~185K tokens input |

A typical CRO protocol PDF can be 50–150 pages → 30,000–90,000 tokens of extracted text. This fits within the context window, but leaves less room for prior section context in the generation loop. For very large protocols (Phase III pivotal, >100 pages), consider summarizing the protocol text before passing it to generation calls.

**Confidence:** MEDIUM for specific context window sizes — verify at docs.anthropic.com as these change with model updates.

### Constraint 3: Rate Limits and Proposal Generation Time

Generating all 11 sections sequentially takes significant time:
- 11 API calls × average 30–60 seconds per call (depending on section length and streaming) = 5–10 minutes total wall clock time for a full proposal.

This is acceptable for a v1 if:
1. Streaming is implemented so the user sees progress
2. The UI clearly communicates that generation is running
3. Users can work on other sections while generation continues

For faster generation, consider parallel section generation where sections have no dependency on each other (e.g., Technology section 7 and Case Studies section 6 don't depend on the Scope sections). Map out the dependency graph before implementing parallelization.

### Constraint 4: Cost Per Proposal

At claude-sonnet-4-5 pricing (verify at anthropic.com/pricing):
- Input: ~50,000 tokens per full proposal generation (across all 11 calls)
- Output: ~50,000 tokens per full proposal
- Extraction pass: ~10,000 tokens input + 2,000 tokens output
- Gap detection: ~40,000 tokens input + 3,000 tokens output

Total per proposal: approximately 100,000–120,000 tokens input + 55,000 tokens output. At current Sonnet pricing this is meaningful — factor into Jamo's per-seat or per-proposal pricing model.

---

## 9. Implementation Priority Order

Based on research, here is the recommended implementation sequence:

**Phase 1 — Complete the generation loop (existing asset + fixes)**
1. Fix `generateProposalBySection()` to use anchor-based consistency instead of full prior text
2. Add streaming to the section generation calls
3. Revise section generation order (Section 3 first, Executive Summary and Cover Letter last)
4. Wire the generator to the existing ProposalDetail UI

**Phase 2 — Document extraction**
1. Add `pdf.js` and `mammoth` for client-side document parsing
2. Implement the two-pass extraction system prompt
3. Build an extraction review/edit form in the UI before triggering generation
4. Surface confidence levels and missing fields

**Phase 3 — Gap detection**
1. Implement gap detection as a post-generation pass
2. Build the gap resolution UI (prioritized checklist with questions)
3. Wire targeted section regeneration for resolved gaps

**Phase 4 — Chat panel**
1. Implement the chat context builder with section targeting
2. Wire the existing `AIChatPanel` to the real API
3. Add "explain this selection" via text selection handler

**Phase 5 — Backend + RAG (when scale requires)**
1. Move API key to server-side proxy
2. Add persistent storage (database)
3. Implement RAG for CRO document libraries if customers have them

---

## 10. Sources and Confidence Summary

| Area | Confidence | Primary Source |
|------|------------|----------------|
| Anthropic streaming SSE API | HIGH | Training data through Aug 2025; well-documented stable API |
| Context window sizes (200K) | MEDIUM | Training data — verify at docs.anthropic.com before shipping |
| Model IDs (claude-sonnet-4-5-20250929) | MEDIUM | Matches existing codebase; verify current model list |
| pdf.js for browser PDF parsing | HIGH | Established, well-documented library |
| mammoth.js for DOCX parsing | HIGH | Established library, widely used |
| RAG architecture pattern | HIGH | Standard established pattern |
| voyage-3 embedding model name | LOW | Verify at docs.anthropic.com — model names change |
| Per-token pricing estimates | LOW | Pricing changes frequently — always verify at anthropic.com/pricing |
| Section generation order | MEDIUM | Derived from document structure logic; validate with domain expert |
| Gap detection JSON schema | MEDIUM | Designed for this domain; may need tuning in practice |

**Note:** Web access was unavailable during this research session. All Anthropic API patterns should be verified against the official documentation at `https://docs.anthropic.com` before implementation, particularly: model IDs, context window sizes, streaming event structure, and current pricing.
