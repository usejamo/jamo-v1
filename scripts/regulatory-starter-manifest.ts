// scripts/regulatory-starter-manifest.ts
//
// PROPOSAL — pending clinical-domain review. NOT a locked spec. Do not treat as authoritative.
// This is a draft default starter corpus (core ICH E-series + a couple of common cross-references).
// The list, geographies, phases, and therapeutic-area scoping below all need a clinical-domain pass
// before this manifest is treated as ground truth. See 14.6-BRIEF.md "Default manifest" section.
//
// Consumed by scripts/seed-regulatory.ts. `folder` defaults to `documentKey` when omitted — PDFs for
// an entry live at `regulatory-docs/<folder ?? documentKey>/*.pdf` (operator-supplied, gitignored).

export interface ManifestEntry {
  documentKey: string
  title: string
  agency: string
  geography: string[]
  phase?: string[]
  therapeuticArea?: string
  effectiveDate?: string
  status?: string
  supersedes?: string
  folder?: string
}

export const STARTER_MANIFEST: ManifestEntry[] = [
  {
    documentKey: 'ICH-E6R3',
    title: 'ICH E6(R3) Guideline for Good Clinical Practice',
    agency: 'ICH',
    // ICH-E6R3 geography is {US,EU,UK}, NOT GLOBAL — deliberate. Keeps E6 from citing R3 for a Japan
    // (PMDA) query. Do NOT "fix" to GLOBAL. R3-only starter set; no R2; no supersedes on the E6 pair.
    geography: ['US', 'EU', 'UK'],
    effectiveDate: '2025-01-06',
    status: 'active',
    // Deliberately no `supersedes` — the starter set does not seed E6(R2), so there is nothing in this
    // manifest for R3 to resolve against. Do not add `supersedes: 'ICH-E6R2'` without also seeding R2.
  },
  {
    documentKey: 'ICH-E8R1',
    title: 'ICH E8(R1) General Considerations for Clinical Studies',
    agency: 'ICH',
    geography: ['GLOBAL'],
    effectiveDate: '2021-10-06',
    status: 'active',
  },
  {
    documentKey: 'ICH-E9',
    title: 'ICH E9 Statistical Principles for Clinical Trials',
    agency: 'ICH',
    geography: ['GLOBAL'],
    effectiveDate: '1998-02-05',
    status: 'active',
  },
  {
    documentKey: 'ICH-E3',
    title: 'ICH E3 Structure and Content of Clinical Study Reports',
    agency: 'ICH',
    geography: ['GLOBAL'],
    effectiveDate: '1996-11-30',
    status: 'active',
  },
  {
    documentKey: 'ICH-M3R2',
    title: 'ICH M3(R2) Nonclinical Safety Studies for the Conduct of Human Clinical Trials',
    agency: 'ICH',
    geography: ['GLOBAL'],
    effectiveDate: '2009-06-11',
    status: 'active',
  },
]
