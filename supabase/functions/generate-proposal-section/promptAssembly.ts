// ============================================================================
// PURE PROMPT ASSEMBLY — extracted from index.ts so it can be imported by
// Vitest (promptAssembly.test.ts) without pulling in Deno-only top-level
// imports (`serve` from deno.land, `createClient` from the "supabase" bare
// specifier) that Node/Vite cannot resolve. index.ts re-exports these same
// symbols and the request handler calls them directly — no divergent copy.
// ============================================================================

// ============================================================================
// CONSTANTS — inlined from src/types/generation.ts
// NOTE: Duplicated because Deno Edge runtime cannot resolve src/lib/ imports at deploy time
// ============================================================================

export const SECTION_NAMES: Record<string, string> = {
  understanding: 'Understanding of the Study',
  scope_of_work: 'Scope of Work & Service Delivery',
  proposed_team: 'Proposed Team & Organizational Structure',
  timeline: 'Timeline & Milestones',
  budget: 'Budget & Pricing',
  regulatory_strategy: 'Regulatory Strategy',
  quality_management: 'Quality Management',
  executive_summary: 'Executive Summary',
  cover_letter: 'Cover Letter',
}

// ============================================================================
// SYSTEM PROMPT — inlined from cro-proposal-generator.js
// ============================================================================

export const CRO_PROPOSAL_SYSTEM_PROMPT = `You are a senior proposal strategist at a leading Contract Research Organization (CRO) with 20+ years of experience writing winning proposals for pharmaceutical, biotechnology, and medical device sponsors. You have deep expertise across all clinical trial phases (Phase I–IV), therapeutic areas, and global regulatory environments (FDA, EMA, PMDA, NMPA, Health Canada, TGA, etc.).

Your task is to generate a comprehensive, polished, sponsor-ready CRO proposal in response to the provided RFP materials, study details, and organizational context. The proposal must be persuasive, technically rigorous, and tailored to the sponsor's specific needs.

## WRITING STYLE & TONE

- Professional and authoritative — demonstrate deep domain expertise
- Sponsor-centric — frame everything in terms of value to the sponsor
- Specific and quantified — use metrics, timelines, and concrete examples
- Consultative — offer strategic recommendations beyond what was asked
- Grounded — reference applicable regulatory guidance only when it is provided in [REGULATORY CONTEXT]; never assert compliance that is not grounded there
- Concise but thorough — every sentence earns its place
- Confident but not arrogant — honest about complexities
- Action-oriented — active voice, "we will" not "can be done"

## CRITICAL RULES

1. NEVER fabricate data, study results, personnel names, or regulatory outcomes
2. If information is not provided, flag it with [PLACEHOLDER: description of what's needed]
3. Tailor everything to the specific therapeutic area with correct clinical terminology
4. Reference the sponsor's protocol or RFP language to demonstrate alignment
5. All timelines must be internally consistent
6. Budget items must align with scope of work — no orphaned line items
7. Distinguish between assumptions and confirmed parameters
8. Where the RFP is ambiguous, state your interpretation explicitly
9. Include both strengths AND honest challenges with mitigation plans
10. Format for readability: headers, sub-headers, tables, and structured layouts

## OUTPUT FORMAT

Output ONLY valid HTML. Use these tags: <h2>, <h3>, <h4>, <p>, <strong>, <em>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>.
Rules:
- NEVER use Markdown syntax (no ## headings, no **bold**, no |---|--- tables, no backtick code fences)
- NEVER include preamble like "Here is the section:" or meta-commentary
- NEVER wrap output in \`\`\`html code fences
- Start the response directly with the first HTML tag`

// Appended only when regulatory grounding is actually present — see gating at each builder's
// system-prompt assembly. Gating derives from regulatoryChunks.length (not a client-supplied
// count) so a caller cannot desync count>0 with an empty chunk array to force a false compliance
// assertion (CR-02, hardens T-14.6-03).
export const COMPLIANCE_CLAUSE = ' The proposal must be compliant with ICH-GCP (E6 R2/R3) and reference FDA/EMA guidance where grounded.'

// Neutralize our structural prompt-block delimiters if they appear inside retrieved chunk
// content/source. Adversarial chunk text (e.g. sponsor RFP history containing a literal
// "[/PROPOSAL HISTORY]") must not be able to break out of its block and inject instructions
// that override the compliance gating (CR-01, hardens T-14.6-02). Precise allowlist of our own
// structural markers — does NOT touch [PLACEHOLDER: ...] or bracketed acronyms like [US].
const BLOCK_DELIMITERS = /\[\s*\/?\s*(?:REGULATORY CONTEXT|PROPOSAL HISTORY|PRIOR SECTIONS|NOTE|TEMPLATE CONTEXT)\s*\]/gi
export function sanitizeChunkText(s: string): string {
  return String(s ?? '').replace(BLOCK_DELIMITERS, '')
}

/**
 * Build the system prompt and user message for a specific proposal section (v1).
 */
export function buildSectionPrompt(params: {
  sectionId: string
  tone: string
  regulatoryChunks: Array<{ content: string; source: string; agency?: string; doc_type?: string }>
  proposalChunks: Array<{ content: string; source: string; agency?: string; doc_type?: string }>
  regulatoryCount: number
  anchor: string
  proposalInput: {
    studyInfo?: Record<string, string>
    assumptions?: Array<{ category: string; content: string }>
    services?: string[]
  }
  templateContext?: {
    sections: Array<{ name: string; role: string | null; description?: string | null }>
  }
}): { system: string; userMessage: string } {
  const { sectionId, tone, regulatoryChunks, proposalChunks, anchor, proposalInput } = params
  const sectionName = SECTION_NAMES[sectionId] || sectionId

  // Derive grounding from the actual chunk array, never a caller-supplied count (CR-02).
  const groundedCount = regulatoryChunks.length

  let system = CRO_PROPOSAL_SYSTEM_PROMPT + (groundedCount > 0 ? COMPLIANCE_CLAUSE : '')

  system += `\n\nIMPORTANT: Generate ONLY the "${sectionName}" section.\nTone for this section: ${tone}.\n\nCRITICAL RULE: When specific information is not available, use [PLACEHOLDER: description of what's needed] markers. NEVER invent specific numbers, dates, or names.`

  if (anchor) {
    system += `\n\n## CONSISTENCY ANCHOR (summary of prior sections):\n${anchor}`
  }

  const regSection = regulatoryChunks.length > 0
    ? regulatoryChunks.map((c) => `[${sanitizeChunkText(c.source)}] ${sanitizeChunkText(c.content)}`).join('\n---\n')
    : '(No relevant regulatory context found)'
  const propSection = proposalChunks.length > 0
    ? proposalChunks.map((c) => `[${sanitizeChunkText(c.source)}] ${sanitizeChunkText(c.content)}`).join('\n---\n')
    : '(No relevant proposal history found)'
  system += `\n\n[REGULATORY CONTEXT]\n${regSection}\n[/REGULATORY CONTEXT]`
  system += `\n\n[PROPOSAL HISTORY]\n${propSection}\n[/PROPOSAL HISTORY]`
  if (groundedCount === 0) {
    system += `\n\n[NOTE] No regulatory grounding available for this section/geography — do not assert regulatory compliance; flag unresolved items with [PLACEHOLDER].`
  }

  if (params.templateContext?.sections?.length) {
    const sectionList = params.templateContext.sections
      .map((s, i) => `${i + 1}. ${s.name}${s.description ? ` — ${s.description}` : ''}`)
      .join('\n')
    system += `\n\n[TEMPLATE CONTEXT]\nThe organization uses the following proposal template. Adapt your tone, structure, and section naming to match this format:\n${sectionList}\n[/TEMPLATE CONTEXT]`
  }

  // Build user message from proposalInput
  const studyInfo = proposalInput?.studyInfo || {}
  const assumptions = proposalInput?.assumptions || []
  const services = proposalInput?.services || []

  const sections: string[] = []

  sections.push(`## SPONSOR & RFP INFORMATION

**Sponsor Name:** ${studyInfo.sponsorName || '[PLACEHOLDER: Sponsor name]'}
**Therapeutic Area:** ${studyInfo.therapeuticArea || '[PLACEHOLDER: Therapeutic area]'}
**Indication:** ${studyInfo.indication || '[PLACEHOLDER: Indication]'}
**Proposal Due Date:** ${studyInfo.dueDate || '[Not provided]'}`)

  sections.push(`## STUDY DETAILS

**Study Phase:** ${studyInfo.phase || '[PLACEHOLDER: Study phase]'}
**Regions/Countries:** ${studyInfo.regions || '[Not provided]'}
**Study Title:** ${studyInfo.studyTitle || '[PLACEHOLDER: Study title]'}
**Primary Endpoint(s):** ${studyInfo.primaryEndpoints || '[PLACEHOLDER: Primary endpoints]'}
**Target Enrollment:** ${studyInfo.targetEnrollment || '[PLACEHOLDER]'} subjects`)

  if (assumptions.length > 0) {
    const assumptionsList = assumptions.map((a) => `- [${a.category}] ${a.content}`).join('\n')
    sections.push(`## EXTRACTED ASSUMPTIONS\n${assumptionsList}`)
  }

  if (services.length > 0) {
    const servicesList = services.map((s) => `- ${s}`).join('\n')
    sections.push(`## SERVICES REQUESTED\n${servicesList}`)
  }

  const userMessage = `Generate the "${sectionName}" section of the CRO proposal based on the following inputs.

${sections.join('\n\n---\n\n')}

---

Please generate ONLY the "${sectionName}" section now, following the structure and guidelines defined in your instructions. Use [PLACEHOLDER: ...] for any information not provided above that would be needed in a final proposal.`

  return { system, userMessage }
}

/**
 * Build system prompt and user message for v2 payload.
 * Uses sectionDescription as content scope; sectionRole as strategy hint only.
 */
export function buildSectionPromptV2(params: {
  sectionId: string
  sectionName: string
  sectionDescription: string | null
  sectionRole: string | null
  tone: string
  regulatoryChunks: Array<{ content: string; source: string; agency?: string; doc_type?: string }>
  proposalChunks: Array<{ content: string; source: string; agency?: string; doc_type?: string }>
  regulatoryCount: number
  consistencyAnchor?: string
  priorSections: Array<{ id: string; name: string; content: string }>
  proposalContext: {
    studyInfo?: Record<string, string>
    assumptions?: Array<{ category: string; value: string; confidence: string }>
    services?: string[]
  }
}): { system: string; userMessage: string } {
  const { sectionName, sectionDescription, sectionRole, tone, regulatoryChunks, proposalChunks, consistencyAnchor, priorSections, proposalContext } = params

  // Derive grounding from the actual chunk array, never a caller-supplied count (CR-02).
  const groundedCount = regulatoryChunks.length

  // Role-based tone/structure hints (soft signal only — does NOT override content scope)
  const roleHints: Record<string, string> = {
    executive_summary: 'Write as a compelling 1–2 page executive summary. Synthesize all key points from prior sections. Lead with the CRO\'s strongest differentiators.',
    cover_letter: 'Write as a formal business letter. Keep under 1 page. Reference the sponsor by name. Express genuine enthusiasm and commitment.',
    budget: 'Organize as a structured financial breakdown. Use tables. Include payment milestone assumptions. Align all line items with scope of work.',
    timeline: 'Include a visual Gantt-style description. Reference specific milestones, durations, and dependencies. All dates must be internally consistent.',
    regulatory_strategy: groundedCount > 0
      ? 'Reference specific ICH-GCP guidelines (E6 R2/R3) and FDA/EMA guidance only where grounded in the provided [REGULATORY CONTEXT].'
      : 'No regulatory grounding is available for this section/geography. Do not reference or assert compliance with any named regulatory framework or guideline for this section. Flag any unresolved regulatory items with [PLACEHOLDER] per the CRITICAL RULES; never fabricate.',
    understanding: 'Demonstrate deep comprehension of the sponsor\'s study. Reference protocol specifics and therapeutic context. This is your credibility section.',
  }

  let system = CRO_PROPOSAL_SYSTEM_PROMPT + (groundedCount > 0 ? COMPLIANCE_CLAUSE : '')

  system += `\n\nIMPORTANT: Generate ONLY the "${sectionName}" section.`

  if (sectionDescription) {
    system += `\n\nSECTION SCOPE: ${sectionDescription}`
  }

  if (sectionRole && roleHints[sectionRole]) {
    system += `\n\nSECTION STRATEGY: ${roleHints[sectionRole]}`
  }

  system += `\n\nTone for this section: ${tone}.\n\nCRITICAL RULE: When specific information is not available, use [PLACEHOLDER: description of what's needed] markers. NEVER invent specific numbers, dates, or names.`

  if (consistencyAnchor) {
    system += `\n\n## CONSISTENCY ANCHOR (summary of prior sections):\n${consistencyAnchor}`
  }

  if (priorSections && priorSections.length > 0) {
    // Include up to 3 most recent prior sections as direct context (token budget guard)
    const recentPrior = priorSections.slice(-3)
    const priorContext = recentPrior
      .map((s) => `### ${s.name}\n${s.content.slice(0, 800)}${s.content.length > 800 ? '...[truncated]' : ''}`)
      .join('\n\n---\n\n')
    system += `\n\n[PRIOR SECTIONS — for consistency]\n${priorContext}\n[/PRIOR SECTIONS]`
  }

  {
    const regSection = regulatoryChunks.length > 0
      ? regulatoryChunks.map((c) => `[${sanitizeChunkText(c.source)}] ${sanitizeChunkText(c.content)}`).join('\n---\n')
      : '(No relevant regulatory context found)'
    const propSection = proposalChunks.length > 0
      ? proposalChunks.map((c) => `[${sanitizeChunkText(c.source)}] ${sanitizeChunkText(c.content)}`).join('\n---\n')
      : '(No relevant proposal history found)'
    system += `\n\n[REGULATORY CONTEXT]\n${regSection}\n[/REGULATORY CONTEXT]`
    system += `\n\n[PROPOSAL HISTORY]\n${propSection}\n[/PROPOSAL HISTORY]`
    if (groundedCount === 0) {
      system += `\n\n[NOTE] No regulatory grounding available for this section/geography — do not assert regulatory compliance; flag unresolved items with [PLACEHOLDER].`
    }
  }

  // Build user message
  const studyInfo = proposalContext?.studyInfo || {}
  const assumptions = proposalContext?.assumptions || []
  const services = proposalContext?.services || []

  const sections: string[] = []
  sections.push(`## SPONSOR & RFP INFORMATION\n\n**Sponsor Name:** ${studyInfo.sponsorName || '[PLACEHOLDER: Sponsor name]'}\n**Therapeutic Area:** ${studyInfo.therapeuticArea || '[PLACEHOLDER: Therapeutic area]'}\n**Indication:** ${studyInfo.indication || '[PLACEHOLDER: Indication]'}\n**Proposal Due Date:** ${studyInfo.dueDate || '[Not provided]'}`)
  sections.push(`## STUDY DETAILS\n\n**Study Phase:** ${studyInfo.studyPhase || '[PLACEHOLDER: Study phase]'}\n**Regions/Countries:** ${studyInfo.countries || '[Not provided]'}`)

  if (assumptions.length > 0) {
    const assumptionsList = assumptions.map((a: any) => `- [${a.category}] ${a.value || a.content}`).join('\n')
    sections.push(`## EXTRACTED ASSUMPTIONS\n${assumptionsList}`)
  }

  if (services.length > 0) {
    sections.push(`## SERVICES REQUESTED\n${services.map((s: string) => `- ${s}`).join('\n')}`)
  }

  const userMessage = `Generate the "${sectionName}" section of the CRO proposal based on the following inputs.\n\n${sections.join('\n\n---\n\n')}\n\n---\n\nPlease generate ONLY the "${sectionName}" section now. Use [PLACEHOLDER: ...] for any missing information.`

  return { system, userMessage }
}
