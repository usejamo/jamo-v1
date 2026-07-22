# Handoff prompt — draft v2 of the demo RFP

Paste everything below into a fresh Claude conversation, and attach `docs/Vericel_RFP_ADVANCE-301.pdf`.

---

I need a v2 of the attached fake RFP. It's a test document for a CRO proposal-generation product demo. Keep the same structure, tone, length (~6 pages), and section numbering — this is a targeted revision, not a rewrite. Output a real text-based PDF (selectable text, not a scanned image), because a document parser has to extract from it.

## 1. Replace the sponsor identity — this is the main reason for v2

"Vericel BioPharma, Inc." is too close to **Vericel Corporation** (NASDAQ: VCEL), a real cell-therapy company headquartered in Cambridge, MA. The footer address, 500 Kendall Street, Cambridge MA, is also a real Cambridge biotech address. Shown to a prospect, that combination could read as us displaying another client's confidential RFP, or as claiming a customer relationship we don't have.

Replace all sponsor-identifying details with clearly fictional ones, applied consistently everywhere they appear:

| Item | v1 | v2 |
|---|---|---|
| Sponsor | Vericel BioPharma, Inc. | **Calidra Biopharma, Inc.** |
| Compound code | VBP-4471 | **CLD-4471** (keep the generic name *veliforinib*) |
| Study name | ADVANCE-301 | **CALIBRATE-301** |
| Protocol Number | VBP-ADV-301 | **CLD-CAL-301** |
| RFP Reference | VBP-2025-ADVANCE-301 | **CLD-2026-CALIBRATE-301** |
| Phase II predecessor | VBP-ADV-201 | **CLD-CAL-201** |
| Contact email | clinical.ops@vericelbio.com | **clinical.ops@calidrabio.com** |
| Footer address | 500 Kendall Street, Cambridge, MA 02142 | a generic suburban office address — **avoid Cambridge/Kendall Square**, which is densely occupied by real biotechs |

Before finalising, sanity-check that "Calidra" doesn't match a real pharma company. If it does, pick another invented name and apply it consistently.

## 2. Move all dates forward

Today is **22 July 2026**. Every date in v1 is in the past, which makes the proposal look overdue in a live demo. Use these, and keep them internally consistent:

- Issue Date: **15 July 2026**
- Clarification questions due: **14 August 2026**
- Response Due: **4 September 2026** (11:59 PM Eastern)
- CRO presentations: week of **14–18 September 2026**
- CTA submissions planned: **Q1 2027** (v1 said Q1 2026)
- Version/date in the footer: **Version 2.0 | 15 July 2026**

Check for any other date or year references I haven't listed and move them forward consistently.

## 3. Keep these exactly as they are

These are real, publicly known, and make the document credible. They are not confidentiality risks — don't genericise them:

- **ICH E6(R3)** GCP — keep this, and keep it prominent. It's load-bearing for the demo.
- Approved comparators and standard of care: atezolizumab, bevacizumab, sorafenib, lenvatinib
- Instruments and standards: EORTC QLQ-C30, HCC-18, MedDRA, WHO Drug, RECIST if referenced
- Named EDC vendors as sponsor preference: Medidata Rave, Veeva Vault EDC
- HCC epidemiology (~905,000 new cases/year), the FGF19/FGFR4 biology, ORR 24.3%, mPFS 6.8 months
- The whole of §3 (Scope of Services) and §4 (Key Assumptions) — §4's specificity is what makes the demo's assumption-extraction look good. Keep it at least as detailed.
- The confidentiality notice — it's realistic for an RFP

## 4. Do NOT add a "sample document" disclaimer to the body

It's tempting, but the document's text gets chunked and embedded into a retrieval index. A line like "fictional sample for demonstration purposes" can surface later in an AI-generated citation mid-demo, which is worse than the problem it solves.

If you want a marker, put it in the **PDF metadata** (title/subject/keywords) only — never in visible body text.

## 5. Output

- Filename: `Calidra_RFP_CALIBRATE-301.pdf`
- Text-based PDF, same table-heavy layout as v1
- After generating, list every change you made so I can confirm nothing was missed

---

## Why these changes (context, if useful)

This PDF becomes the permanent demo artifact: it gets captured once into a fixture and replayed to every prospect, so mistakes are expensive to unwind. The sponsor name and the dates are the two things a sharp prospect would notice first.
