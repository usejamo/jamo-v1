# Demo Proposal — Wizard Cheat Sheet

**Purpose:** produce the single canonical demo proposal that gets captured as a fixture and replayed, token-free, in every future demo. Fill this out the same way every time.

**Source RFP:** `docs/Quorvane_RFP_CALIBRATE-301.pdf` — **use this one.** The older `Vericel_RFP_ADVANCE-301.pdf` is superseded; do not use it.
**Demo org id:** `8dd090ca-8c63-4f29-b345-ac7ca8bbd477`
**Login:** the demo presenter account (`demo@usejamo.com`) — not your normal admin account.

---

## ⚠️ Two things to know

### 1. The sponsor is fictional on purpose — don't "correct" it

The sponsor is **Quorvane Biopharma, Inc.**, an invented company. The earlier draft used "Vericel", which collides with **Vericel Corporation** (NASDAQ: VCEL), a real cell-therapy firm in Cambridge, MA. Shown to a prospect, that could read as us displaying another client's confidential RFP, or claiming a customer we don't have.

So: type the sponsor name exactly as below. Don't substitute a real company to make the demo feel more concrete — that's the failure mode this avoids.

### 2. The due date will go stale

The RFP's deadline is **September 4, 2026**. Enter that date so the wizard matches the PDF.

The fixture stores the due date and replays it unchanged, so **it will eventually drift into the past** and the demo will open on an overdue proposal. Set a calendar reminder for around **August 2026** to re-generate the RFP with fresh dates and re-capture. Re-capture is one button and creates a new version rather than overwriting, so it's cheap.

---

## Step 1 — Study Information

Required fields are marked ★. The two dropdowns only accept the exact strings below.

| Field | What to enter | Notes |
|---|---|---|
| **Sponsor Name** ★ | `Quorvane Biopharma, Inc.` | Exactly as written — see note above |
| **Therapeutic Area** ★ | `Oncology / Hematology` | Dropdown — pick this exact option |
| **Indication** ★ | `Advanced Hepatocellular Carcinoma (FGF19-amplified)` | Free text. The FGF19 qualifier matters — it's the whole scientific premise |
| **Investigational Product** | `Veliforinib (QRV-4471)` | Leave the *"Not disclosed by sponsor (blinded)"* checkbox **unchecked**. Checking it clears the field |
| **Study Phase** ★ | `Phase III` | Dropdown — exact option. Not "Phase III/IV" |
| **Proposal Due Date** | `2026-09-04` | Matches the RFP's stated deadline of September 4, 2026 |
| **Countries / Regions** | see below | Comma-separated; parsed when you click away from the field |

**Countries / Regions** — paste exactly:

```
United States, Canada, Germany, France, Spain, Italy, Netherlands, Poland, Japan, South Korea, Taiwan, Australia, Israel, Brazil
```

That's all 14 countries from RFP §2.2. Commas matter — each becomes a separate region.

### Services to select

Tap these **16** services. They map directly to RFP §3, so the generated proposal will address what the RFP actually asked for.

| Category | Select |
|---|---|
| Core Services | Project Management · Regulatory Affairs & Study Start-Up · Site Selection, Feasibility & Activation |
| Monitoring | Clinical Monitoring (On-site) · Clinical Monitoring (Remote/Centralized) |
| Data & Statistics | Data Management & EDC · Biostatistics & Statistical Programming |
| Medical Writing | Medical Writing (CSR) · Medical Writing (Protocol/ICF) · Medical Writing (Regulatory Submissions) |
| Safety | Safety & Pharmacovigilance |
| Specialty | Central Laboratory Services · Specialty Laboratory Services · Third-Party Vendor Management · DSMB/DMC Support |
| Technology | ePRO/eCOA |

**Deliberately NOT selected**, and why — the RFP either excludes them or assigns them to the Sponsor:

- **Patient Recruitment & Retention** — never mentioned in the RFP.
- **Clinical Supply / IP Management** — §4 states IP supply and distribution are Sponsor-managed; the CRO only coordinates (covered by Third-Party Vendor Management).
- **eConsent** — not requested.
- **Quality Assurance** — not a requested service area. Most real CRO proposals would include it, but the cheat sheet mirrors the RFP.

Why the borderline ones *are* included:
- **Both monitoring types** — §3.3 asks for a risk-based strategy "combining centralized and on-site monitoring."
- **Specialty Laboratory Services** — §3.8's FGF19 amplification assay is a specialty biomarker test, distinct from routine central lab.
- **ePRO/eCOA** — the Sponsor contracts the vendor, but §4 requires the CRO to provide integration support and site training.
- **Third-Party Vendor Management** — §4 assigns the CRO coordination of the ePRO, imaging, and IP supply vendors.

---

## Step 2 — Documents

1. Upload `docs/Quorvane_RFP_CALIBRATE-301.pdf`.
2. **Wait for parsing to finish** — every document must reach *complete* before the wizard lets you continue. This runs the real extraction and embedding pipeline. It costs tokens. That is expected and happens exactly once.

Do not advance until the document list shows the file as parsed.

---

## Step 3 — Assumptions

The AI extracts assumptions from RFP §4, which is unusually explicit (enrollment, screening failure rate, site activation, monitoring frequency, database lock, and so on).

- **Review each one.** Whatever you approve here is baked into the fixture and shown in every future demo.
- Fix anything wrong or vague now rather than after capture.
- Approve them all before continuing.

---

## Step 4 — Generate

- Template: **Standard Proposal** (the only default template, and the only one demo runs accept).
- Generate and **let every section finish**.
- **Check that no section is blank.** Capture refuses a proposal with an ungenerated section and will name it in the error — a blank section would otherwise show up mid-demo.

---

## After generation — two things that make the demo work

### A. Capture the fixture

On the proposal detail page, click **Save as demo fixture** (in the metadata row, beside the status selector).

Expected: `Captured as fixture v1`. If it fails, the error names the reason — most commonly an ungenerated section.

### B. Upload the canonical RFP to Storage

This is separate from the wizard upload and easy to miss. Every demo run points at one shared file. Without it the demo's RFP download 404s even though everything else looks right.

In the Supabase dashboard → **Storage** → `documents` bucket, create this exact path and upload the same PDF:

```
8dd090ca-8c63-4f29-b345-ac7ca8bbd477/demo/canonical-demo-rfp.pdf
```

The filename must be exactly `canonical-demo-rfp.pdf`.

---

## Then verify

Go to `/demo` and click **Add demo RFP**. You should see:

`Fixture v1 · N sections · N assumptions · N indexed RFP chunks`

If it says *"no active demo fixture"*, the capture in step A didn't succeed.

The full 10-step verification script — including what failure looks like at each step — is in
`.planning/phases/16-token-free-demo-mode/16-09-SUMMARY.md`.

**Worth testing explicitly:** ask the chat a question about GCP or monitoring obligations. The RFP requires ICH E6(R3) compliance and there are 268 regulatory chunks loaded, so you should get real citations. That's the strongest moment in the demo — confirm it works before you show anyone.

---

## Gap list — sponsor answers

These answers are not in the RFP PDF. They exist so whoever is running the demo can respond confidently if a prospect asks "so what's the actual answer?" after the product surfaces a gap. Read them as what Calidra/Quorvane would say in clarification responses.

**1. Total budget / cost range / allocation by service** *(product may surface these as 3 separate gaps — they're one)*

Withheld deliberately, not an omission. Competitive RFPs don't disclose budget; it's how sponsors get honest pricing. Sponsor wants fees by service area and year, FTE assumptions by role and region, unit costs for repeatable deliverables, pass-throughs itemised separately.

**2. Contract type preference**

Full-service for core scope, given a lean sponsor org. Open to hybrid. Biostatistics/stat programming is the likeliest FSP carve-out. Milestone invoicing, 5% holdback against performance metrics.

**3. Regulatory pathway**

Traditional approval on OS — not accelerated. Fast Track designation held. Intends Real-Time Oncology Review and Project Orbis (FDA, Health Canada, TGA, ANVISA, MHRA). EU via CTIS under Reg. 536/2014; Japan via PMDA CTN. NDA/MAA within 9 months of primary OS data cut.

**4. Patient visit schedule**

28-day screening, FGF19 testing allowed on archival tissue under pre-screening consent. 21-day cycles aligned to atezo/bev. RECIST v1.1 every 6 weeks to week 48, then every 9 weeks. Weekly LFTs through Cycle 1 (hepatic risk of FGFR4 inhibition), then Day 1 each cycle. QLQ-C30 + HCC-18 at baseline, C1–C6 Day 1, then every second cycle. Sparse PK all patients, intensive PK in ~40. Safety follow-up 30 days; survival every 12 weeks.

**5. AE reporting timelines**

Site → CRO within 24h of awareness; CRO → Sponsor within 24h of receipt. 21 CFR 312.32: 7 days fatal/life-threatening SUSARs, 15 days other. Same 7/15 clock to EudraVigilance. Pregnancy and overdose within 24h regardless of seriousness. Events of special interest (Grade ≥3 transaminase elevation, Grade ≥3 diarrhoea, suspected Hy's Law DILI) — 24h notification. Reconciliation quarterly, 100% complete 30 days pre-lock.

**6. DSMB/IDMC requirements**

Five voting members: three oncologists/hepatologists with HCC trial experience, one hepatologist with DILI adjudication experience, one independent biostatistician. Charter to FDA guidance and DAMOCLES, executed pre-FPI. Organisational meeting ~6 weeks pre-FPI, safety reviews every 6 months, ad hoc on hepatic triggers. Unblinded analyses by an independent stats centre firewalled from the CRO study team. Interim analysis at ~185 OS events (~50% of the ~370 needed for final).

**7. Medical coding standards**

MedDRA v29.0 at study start; WHODrug Global, B3 format. Both up-versioned annually on the March release and at final lock. Coding guideline requires Sponsor approval before first patient in.

**8. Central lab vendor**

No incumbent — CRO recommendations welcome. Must have global kit distribution with proven import/export in Japan, South Korea, Taiwan, Brazil; biological sample import licences for all planned countries; validated cold chain for biomarker shipment.

**9. Quality metrics / KPIs**

FPFV within 120 days of contract execution. 80% of sites activated within 6 months. eCRF entry within 5 business days of visit. Median query resolution ≤5 business days, ≥95% closed within 15. Monitoring visit reports submitted within 10 business days, signed off within 21. Deviations reported within 5 business days. eTMF ≥95% during conduct, 100% at close. Primary DBL within 6 months of OS data cut. Portion of fee at risk against these.

**10. Sponsor internal resources**

Lean org, all field monitoring outsourced. Internal: 1 Clinical Development Lead, 1 Medical Director, Head of Clin Ops + 2 Clinical Program Managers, 2 biostatisticians + 1 stat programmer, 2 Regulatory Affairs, 3-person PV team retaining the safety database, 2 clinical supply. No internal data management — CRO leads, Sponsor reviews at checkpoints.

**11. Phase II data availability**

Topline QRV-CAL-201 efficacy and safety available now, released under NDA at presentation stage. IB Edition 5 current; Edition 6 with final Phase II dataset planned Q4 2026, available before FPI. Phase II CSR expected Q4 2026. No database migration to Phase III EDC, but ISS/ISE pool both studies. Phase II collected under SDTM IG 3.3.

---

**Flag 1 — the budget triple.** The extractor currently reports total budget, cost range, and allocation-by-service as three findings. They're one gap. If a prospect notices, the honest framing is that granularity is tunable, not that the product miscounted. Worth deciding whether to collapse these before the fixture is captured.

**Flag 2 — companion diagnostic.** The full answer to the central-lab gap includes a CDx thread: FGF19 amplification testing sits on the companion diagnostic pathway, the Sponsor has a CDx partner under separate agreement, the clinical trial assay is used for enrolment, and a bridging study is planned — so the CRO scopes central lab services excluding the assay but including specimen logistics and site training. This is realistic for a biomarker-selected registrational trial but is scope that doesn't appear anywhere in the RFP. Include it only if the demo narrative tolerates answers that go beyond the document. Otherwise stop at the vendor requirements in row 8.

---

## Quick reference

| | |
|---|---|
| RFP file | `docs/Quorvane_RFP_CALIBRATE-301.pdf` |
| Sponsor | `Quorvane Biopharma, Inc.` |
| Therapeutic Area | `Oncology / Hematology` |
| Indication | `Advanced Hepatocellular Carcinoma (FGF19-amplified)` |
| Product | `Veliforinib (QRV-4471)`, undisclosed unchecked |
| Phase | `Phase III` |
| Due date | `2026-09-04` (re-capture before it goes stale) |
| Regions | 14 countries, comma-separated |
| Services | 16 selected (see table) |
| Template | Standard Proposal |
