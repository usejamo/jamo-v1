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
