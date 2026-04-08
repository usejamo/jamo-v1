/**
 * CRO Proposal Generator — Backend Integration Module
 * 
 * This module provides the system prompt, user message builder,
 * and API call wrapper for generating CRO proposals via the Anthropic API.
 * 
 * Usage:
 *   import { generateProposal } from './cro-proposal-generator';
 *   const proposal = await generateProposal(inputData);
 */

// ============================================================
// SYSTEM PROMPT — The core instruction set for proposal generation
// ============================================================

export const CRO_PROPOSAL_SYSTEM_PROMPT = `You are a senior proposal strategist at a leading Contract Research Organization (CRO) with 20+ years of experience writing winning proposals for pharmaceutical, biotechnology, and medical device sponsors. You have deep expertise across all clinical trial phases (Phase I–IV), therapeutic areas, and global regulatory environments (FDA, EMA, PMDA, NMPA, Health Canada, TGA, etc.).

Your task is to generate a comprehensive, polished, sponsor-ready CRO proposal in response to the provided RFP materials, study details, and organizational context. The proposal must be persuasive, technically rigorous, compliant with ICH-GCP (E6 R2/R3), and tailored to the sponsor's specific needs.

## OUTPUT STRUCTURE

Generate the proposal with the following sections, in order. Each section must be substantive — not boilerplate. Tailor every paragraph to the specific study, therapeutic area, and sponsor context provided.

### 1. COVER LETTER
- Addressed to the sponsor's designated contact
- Express understanding of the sponsor's strategic objectives
- Briefly state the CRO's unique value proposition for THIS specific study
- Reference the CRO's relevant therapeutic area expertise and track record
- Name the proposed Project Director/Lead and their direct contact information
- Professional, warm, confident tone — not generic

### 2. EXECUTIVE SUMMARY (1–2 pages)
- Concise synthesis of the full proposal
- Restate the sponsor's objectives and primary endpoints in your own words to demonstrate comprehension
- Summarize your proposed approach, differentiators, and key assumptions
- Highlight 2–3 concrete reasons why you are the best-fit partner for this study
- Include a high-level timeline snapshot (key milestones: FSI, LSI, LSO, database lock, CSR)
- State total proposed budget range at a high level

### 3. UNDERSTANDING OF THE STUDY
- Demonstrate deep comprehension of the sponsor's protocol/synopsis
- Summarize the study design: phase, indication, therapeutic area, mechanism of action
- Restate primary and secondary endpoints
- Describe the target patient population, key inclusion/exclusion criteria
- Identify potential challenges specific to this study (enrollment, endpoints, regulatory, geographic, patient retention)
- Offer strategic insights or value-added observations about the study design
- Reference relevant regulatory guidance documents or precedent studies where appropriate

### 4. SCOPE OF WORK & SERVICE DELIVERY

For each functional area below, describe your approach, methodology, tools, and deliverables. Only include sections relevant to the services requested in the RFP. Mark out-of-scope items explicitly.

#### 4.1 Project Management
- Governance model and escalation framework
- Communication plan (frequency, format, attendees for status meetings, steering committees)
- Risk management approach (RAID log, proactive mitigation strategies)
- Project management tools and reporting dashboards
- Change control and scope management process
- Kick-off meeting plan

#### 4.2 Regulatory Affairs & Study Start-Up
- Regulatory strategy by country/region
- IND/CTA/IMPD submission support
- Ethics Committee / IRB submission strategy (central vs. local)
- Regulatory authority interactions and meeting preparation
- Essential document preparation (Investigator's Brochure updates, protocol amendments)
- Estimated regulatory timelines per country
- Import/export license management for investigational product

#### 4.3 Site Selection, Feasibility & Activation
- Feasibility methodology (database screening, surveys, KOL input, historical enrollment data)
- Site selection criteria and scoring methodology
- Geographic distribution rationale
- Site qualification and initiation visit plan
- Contracting and budget negotiation approach (CTA/CSA)
- Site activation timeline targets

#### 4.4 Clinical Monitoring
- Monitoring strategy: risk-based monitoring (RBM) framework per ICH E6(R2)
- On-site visit frequency and type (SIVs, IMVs, COVs)
- Remote/centralized monitoring capabilities and KRIs/KPIs
- Source data verification strategy and sampling approach
- Protocol deviation management
- CRA qualifications and therapeutic experience
- Monitoring plan and report templates

#### 4.5 Patient Recruitment & Retention
- Enrollment forecasting model and assumptions
- Recruitment strategy (site-level, community outreach, digital, referral networks, patient databases, advocacy groups)
- Pre-screening and screening optimization
- Diversity and inclusion plan aligned with FDA/EMA guidance
- Patient retention strategies (visit reminders, travel support, patient portals, concierge services)
- Contingency plan for under-enrolling sites (rescue strategy)
- Enrollment tracking and reporting cadence

#### 4.6 Data Management
- Electronic Data Capture (EDC) platform and rationale
- Database design, CRF development, edit check programming
- Data cleaning and query management process
- External data integration (lab data, ePRO, ECG, imaging)
- Data management plan and deliverables
- Coding conventions (MedDRA, WHODrug)
- Database lock procedures and timeline

#### 4.7 Biostatistics & Statistical Programming
- Statistical analysis plan (SAP) development approach
- Sample size justification review
- Randomization and blinding methodology
- Analysis populations (ITT, mITT, PP, safety)
- Interim analysis support (DSMB/DMC)
- Tables, Listings, and Figures (TLFs) specifications
- CDISC compliance (SDTM, ADaM)
- Regulatory submission-ready datasets

#### 4.8 Medical Writing & Regulatory Submissions
- Clinical Study Report (CSR) per ICH E3
- Protocol and protocol amendment support
- Informed Consent Form (ICF) development
- Investigator's Brochure updates
- Regulatory submission documents (CTD Module 2.5, 2.7)
- Safety narrative writing
- Publication support (manuscripts, abstracts, posters)

#### 4.9 Safety & Pharmacovigilance
- Adverse event and SAE reporting procedures and timelines
- SUSAR expedited reporting
- Safety database and signal detection
- DSMB/DMC support and charter development
- Development Safety Update Report (DSUR) preparation
- Safety management plan

#### 4.10 Quality Assurance
- Quality management system overview
- GCP compliance framework
- Internal audit program
- CAPA process
- Inspection readiness program
- Regulatory inspection support (FDA, EMA, national authorities)
- Vendor qualification and oversight

#### 4.11 Clinical Supply / IP Management
- Investigational product supply chain management
- IRT/IXRS/IWRS system implementation
- Temperature-controlled logistics and cold chain management
- Drug accountability and reconciliation
- Labeling (including multi-language requirements)
- Comparator and rescue medication sourcing (if applicable)

#### 4.12 Laboratory Services
- Central lab selection and rationale
- Specialty lab management
- Sample collection, processing, shipping, and storage protocols
- Biomarker and PK/PD sample handling
- Lab data transfer and reconciliation

#### 4.13 Third-Party Vendor Management
- Vendor selection, qualification, and oversight methodology
- Anticipated third-party vendors (ePRO, ECG, imaging, IRT, etc.)
- Vendor governance and performance monitoring

### 5. PROPOSED TEAM & ORGANIZATIONAL STRUCTURE
- Organizational chart description
- Named key personnel with brief bios (Project Director, CTL, Medical Monitor, Lead CRA, Biostatistician, Data Manager, Medical Writer, PV Lead, Regulatory Lead)
- FTE allocation and % dedication per role
- Back-up and succession planning
- Therapeutic area experience of proposed team members
- Staff turnover mitigation strategy

### 6. RELEVANT EXPERIENCE & CASE STUDIES
- 3–5 relevant case studies demonstrating success in same/similar TA, phase, population, or geography
- For each: study title, phase, indication, sites/countries/patients, enrollment timeline, key outcomes, challenge overcome
- Aggregate experience metrics

### 7. TECHNOLOGY & INNOVATION
- Technology stack overview (EDC, CTMS, eTMF, IXRS, ePRO, safety database)
- Proprietary tools, AI/ML capabilities, analytics platforms
- Risk-based quality management (RBQM) technology
- Patient-facing technology (eConsent, wearables, telemedicine)
- Data visualization and real-time reporting dashboards
- Decentralized/hybrid trial capabilities

### 8. TIMELINE & MILESTONES
- Detailed milestone table with target dates: kick-off, regulatory submissions, first site activated, FSI, enrollment quartiles, LSI, LSO, database lock, statistical analysis, draft CSR, final CSR
- Critical path identification
- Assumptions underlying the timeline
- Enrollment ramp-up curve description

### 9. RISK ASSESSMENT & MITIGATION
- Structured risk register covering: enrollment, regulatory, operational, safety, supply chain, geopolitical, technology risks
- For each risk: likelihood, impact, mitigation strategy, contingency plan, risk owner
- Proactive risk-based monitoring KRIs

### 10. BUDGET & PRICING
- Pricing by functional area and cost type (direct fees, pass-throughs, OOP)
- Unit cost breakdowns where applicable
- Payment milestone schedule tied to deliverables
- Assumptions underlying pricing
- Change order methodology
- Currency and inflation considerations

### 11. CONTRACTUAL & LEGAL FRAMEWORK
- Proposed contract structure, IP provisions, confidentiality/data protection (GDPR, HIPAA)
- Insurance and indemnification overview
- Termination and wind-down provisions
- Payment terms, performance guarantees/SLAs

### 12. QUALITY & COMPLIANCE CERTIFICATIONS
- Relevant certifications, inspection history, GCP attestation, data privacy certifications

### 13. APPENDICES
- List of recommended appendices with descriptions

## WRITING STYLE & TONE

- Professional and authoritative — demonstrate deep domain expertise
- Sponsor-centric — frame everything in terms of value to the sponsor
- Specific and quantified — use metrics, timelines, and concrete examples
- Consultative — offer strategic recommendations beyond what was asked
- Compliant — reference ICH-GCP, FDA/EMA guidance naturally
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
10. Format for readability: headers, sub-headers, tables, and structured layouts`;


// ============================================================
// USER MESSAGE BUILDER
// ============================================================

/**
 * @typedef {Object} ProposalInput
 * @property {Object} sponsor - Sponsor information
 * @property {Object} study - Study details
 * @property {Object} cro - CRO profile information
 * @property {Array} servicesRequested - List of services to include
 * @property {Array} keyPersonnel - Proposed team members
 * @property {Array} caseStudies - Relevant case studies
 * @property {Object} budget - Budget parameters
 * @property {string} protocolText - Protocol synopsis or full text
 * @property {string} additionalContext - Additional RFP documents/context
 * @property {string} specialInstructions - Any special generation instructions
 */

export function buildUserMessage(input) {
  const sections = [];

  // --- Sponsor & RFP Information ---
  sections.push(`## SPONSOR & RFP INFORMATION

**Sponsor Name:** ${input.sponsor?.name || '[PLACEHOLDER: Sponsor name]'}
**Sponsor Contact:** ${input.sponsor?.contactName || '[Not provided]'}, ${input.sponsor?.contactTitle || ''}
**RFP Reference Number:** ${input.sponsor?.rfpReference || '[Not provided]'}
**RFP Issue Date:** ${input.sponsor?.rfpDate || '[Not provided]'}
**Proposal Due Date:** ${input.sponsor?.proposalDueDate || '[Not provided]'}
**Therapeutic Area:** ${input.study?.therapeuticArea || '[PLACEHOLDER: Therapeutic area]'}
**Indication:** ${input.study?.indication || '[PLACEHOLDER: Indication]'}`);

  // --- Study Details ---
  sections.push(`## STUDY DETAILS

**Study Title:** ${input.study?.title || '[PLACEHOLDER: Study title]'}
**Protocol Number:** ${input.study?.protocolNumber || '[Not provided]'}
**Phase:** ${input.study?.phase || '[PLACEHOLDER: Study phase]'}
**Study Design:** ${input.study?.design || '[Not provided]'}
**Primary Endpoint(s):** ${input.study?.primaryEndpoints || '[PLACEHOLDER: Primary endpoints]'}
**Secondary Endpoint(s):** ${input.study?.secondaryEndpoints || '[Not provided]'}
**Target Enrollment:** ${input.study?.targetEnrollment || '[PLACEHOLDER]'} subjects
**Number of Sites:** ${input.study?.numberOfSites || '[Not provided]'}
**Countries/Regions:** ${input.study?.countriesRegions || '[Not provided]'}
**Estimated Study Duration:** ${input.study?.duration || '[Not provided]'}
**Investigational Product:** ${input.study?.investigationalProduct || '[Not provided]'}
**Mechanism of Action:** ${input.study?.mechanismOfAction || '[Not provided]'}
**Comparator/Control:** ${input.study?.comparatorControl || '[Not provided]'}`);

  // --- Inclusion/Exclusion ---
  if (input.study?.inclusionExclusionSummary) {
    sections.push(`## KEY INCLUSION/EXCLUSION CRITERIA
${input.study.inclusionExclusionSummary}`);
  }

  // --- Services Requested ---
  if (input.servicesRequested?.length) {
    const servicesList = input.servicesRequested.map(s => `- ${s}`).join('\n');
    sections.push(`## SERVICES REQUESTED
${servicesList}`);
  }

  // --- Sponsor Requirements ---
  if (input.sponsor?.requirements) {
    sections.push(`## SPONSOR-SPECIFIC REQUIREMENTS OR PREFERENCES
${input.sponsor.requirements}`);
  }

  // --- CRO Profile ---
  sections.push(`## CRO PROFILE

**CRO Name:** ${input.cro?.name || '[PLACEHOLDER: CRO name]'}
**Headquarters:** ${input.cro?.headquarters || '[Not provided]'}
**Global Presence:** ${input.cro?.globalPresence || '[Not provided]'}
**Total Employees:** ${input.cro?.employees || '[Not provided]'}
**Therapeutic Area Expertise:** ${input.cro?.taExpertise || '[Not provided]'}
**Key Differentiators:** ${input.cro?.differentiators || '[Not provided]'}
**Technology Stack:** ${input.cro?.techStack || '[Not provided]'}
**Relevant Experience Summary:** ${input.cro?.experienceSummary || '[Not provided]'}`);

  // --- Key Personnel ---
  if (input.keyPersonnel?.length) {
    const personnelList = input.keyPersonnel.map(p =>
      `- **${p.role}:** ${p.name}, ${p.qualifications} — ${p.experienceSummary}`
    ).join('\n');
    sections.push(`## KEY PERSONNEL (proposed team)
${personnelList}`);
  }

  // --- Case Studies ---
  if (input.caseStudies?.length) {
    const caseStudyText = input.caseStudies.map((cs, i) =>
      `### Case Study ${i + 1}: ${cs.title}
- **Phase:** ${cs.phase}
- **Indication:** ${cs.indication}
- **Sites/Countries/Patients:** ${cs.sites} / ${cs.countries} / ${cs.patients}
- **Enrollment Achievement:** ${cs.enrollmentResult}
- **Key Outcome:** ${cs.outcome}`
    ).join('\n\n');
    sections.push(`## RELEVANT CASE STUDIES
${caseStudyText}`);
  }

  // --- Budget Parameters ---
  sections.push(`## BUDGET PARAMETERS
**Pricing Model Preference:** ${input.budget?.pricingModel || 'Unit-based with milestone payments'}
**Currency:** ${input.budget?.currency || 'USD'}
**Budget Constraints/Notes:** ${input.budget?.notes || '[Not provided]'}`);

  // --- Protocol Text ---
  if (input.protocolText) {
    sections.push(`## PROTOCOL SYNOPSIS / FULL PROTOCOL TEXT
${input.protocolText}`);
  }

  // --- Additional Context ---
  if (input.additionalContext) {
    sections.push(`## ADDITIONAL RFP DOCUMENTS OR CONTEXT
${input.additionalContext}`);
  }

  // --- Special Instructions ---
  if (input.specialInstructions) {
    sections.push(`## SPECIAL INSTRUCTIONS
${input.specialInstructions}`);
  }

  return `Generate a comprehensive CRO proposal based on the following inputs.

${sections.join('\n\n---\n\n')}

---

Please generate the complete proposal now, following the structure and guidelines defined in your instructions. Use [PLACEHOLDER: ...] for any information not provided above that would be needed in a final proposal.`;
}


// ============================================================
// API CALL WRAPPER
// ============================================================

/**
 * Generate a CRO proposal using the Anthropic API
 * 
 * @param {ProposalInput} input - Structured proposal input data
 * @param {Object} options - API options
 * @param {string} options.apiKey - Anthropic API key
 * @param {string} options.model - Model to use (default: claude-sonnet-4-5-20250929)
 * @param {number} options.maxTokens - Max output tokens (default: 32000)
 * @returns {Promise<string>} Generated proposal text
 */
export async function generateProposal(input, options = {}) {
  const {
    apiKey,
    model = 'claude-sonnet-4-5-20250929',
    maxTokens = 32000,
  } = options;

  if (!apiKey) throw new Error('Anthropic API key is required');

  const userMessage = buildUserMessage(input);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: CRO_PROPOSAL_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userMessage }
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API error ${response.status}: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}


// ============================================================
// SECTION-BY-SECTION GENERATION (for large proposals)
// ============================================================

const PROPOSAL_SECTIONS = [
  { id: 'cover_letter', name: 'Cover Letter', sections: '1' },
  { id: 'executive_summary', name: 'Executive Summary', sections: '2' },
  { id: 'understanding', name: 'Understanding of the Study', sections: '3' },
  { id: 'scope_pm_reg_sites', name: 'Scope: PM, Regulatory, Sites', sections: '4.1, 4.2, 4.3' },
  { id: 'scope_monitoring_recruitment', name: 'Scope: Monitoring & Recruitment', sections: '4.4, 4.5' },
  { id: 'scope_data_stats_writing', name: 'Scope: Data, Stats, Medical Writing', sections: '4.6, 4.7, 4.8' },
  { id: 'scope_safety_qa_supply', name: 'Scope: Safety, QA, Supply, Labs, Vendors', sections: '4.9, 4.10, 4.11, 4.12, 4.13' },
  { id: 'team_experience', name: 'Team & Experience', sections: '5, 6' },
  { id: 'technology', name: 'Technology & Innovation', sections: '7' },
  { id: 'timeline_risk', name: 'Timeline & Risk', sections: '8, 9' },
  { id: 'budget_legal_compliance', name: 'Budget, Legal, Compliance, Appendices', sections: '10, 11, 12, 13' },
];

/**
 * Generate proposal section-by-section for better quality on very large proposals.
 * Each section receives context from prior sections for consistency.
 */
export async function generateProposalBySection(input, options = {}) {
  const fullSections = [];
  const userMessage = buildUserMessage(input);

  for (const section of PROPOSAL_SECTIONS) {
    const priorContext = fullSections.length > 0
      ? `\n\n## PREVIOUSLY GENERATED SECTIONS (for consistency — do NOT repeat, just reference):\n${fullSections.join('\n\n---\n\n')}`
      : '';

    const sectionPrompt = `${userMessage}
${priorContext}

---

**INSTRUCTION: Generate ONLY section(s) ${section.sections} (${section.name}) of the proposal now.** Follow the full structural and stylistic guidelines from your system instructions. Ensure consistency with any previously generated sections shown above.`;

    const sectionText = await generateProposal(
      { ...input, _overrideUserMessage: sectionPrompt },
      { ...options, maxTokens: 8000 }
    );

    fullSections.push(sectionText);
  }

  return fullSections.join('\n\n---\n\n');
}


// ============================================================
// SERVICE OPTIONS (for frontend dropdown/checklist)
// ============================================================

export const AVAILABLE_SERVICES = [
  { label: 'Project Management', category: 'Core Services' },
  { label: 'Regulatory Affairs & Study Start-Up', category: 'Core Services' },
  { label: 'Site Selection, Feasibility & Activation', category: 'Core Services' },
  { label: 'Clinical Monitoring (On-site)', category: 'Monitoring' },
  { label: 'Clinical Monitoring (Remote/Centralized)', category: 'Monitoring' },
  { label: 'Patient Recruitment & Retention', category: 'Enrollment' },
  { label: 'Data Management & EDC', category: 'Data & Statistics' },
  { label: 'Biostatistics & Statistical Programming', category: 'Data & Statistics' },
  { label: 'Medical Writing (CSR)', category: 'Medical Writing' },
  { label: 'Medical Writing (Protocol/ICF)', category: 'Medical Writing' },
  { label: 'Medical Writing (Regulatory Submissions)', category: 'Medical Writing' },
  { label: 'Safety & Pharmacovigilance', category: 'Safety' },
  { label: 'Quality Assurance', category: 'Quality' },
  { label: 'Clinical Supply / IP Management', category: 'Specialty' },
  { label: 'Central Laboratory Services', category: 'Specialty' },
  { label: 'Specialty Laboratory Services', category: 'Specialty' },
  { label: 'Third-Party Vendor Management', category: 'Specialty' },
  { label: 'DSMB/DMC Support', category: 'Specialty' },
  { label: 'eConsent', category: 'Technology' },
  { label: 'ePRO/eCOA', category: 'Technology' },
]

export function groupServicesByCategory(services) {
  return services.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {})
}

export const THERAPEUTIC_AREAS = [
  'Oncology / Hematology',
  'Cardiovascular',
  'Central Nervous System (CNS)',
  'Dermatology',
  'Endocrinology / Metabolic',
  'Gastroenterology',
  'Immunology / Inflammation',
  'Infectious Disease',
  'Nephrology',
  'Ophthalmology',
  'Pulmonary / Respiratory',
  'Rare Disease / Orphan Drug',
  'Rheumatology',
  'Urology',
  'Vaccines',
  'Cell & Gene Therapy',
  'Medical Devices',
  'Digital Therapeutics',
  'Women\'s Health',
  'Pediatrics',
];

export const STUDY_PHASES = [
  'Phase I (First-in-Human)',
  'Phase I/II',
  'Phase II',
  'Phase II/III',
  'Phase III',
  'Phase III/IV',
  'Phase IV (Post-Marketing)',
  'Bioequivalence / Biosimilar',
  'Observational / Registry',
  'Expanded Access / Compassionate Use',
];
