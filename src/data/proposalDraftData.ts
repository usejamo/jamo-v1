import type { Proposal } from '../types/proposal'
import type { DraftSection, Segment, ContentBlock, AnnotationSourceType } from '../types/draft'

function t(plain: string): Segment { return { plain } }

function a(
  text: string,
  sourceDoc: string,
  sourceType: AnnotationSourceType,
  quote: string
): Segment {
  return { text, annotation: { sourceDoc, sourceType, quote } }
}

function p(...segments: Segment[]): ContentBlock { return { kind: 'p', segments } }
function ul(...items: Segment[][]): ContentBlock { return { kind: 'ul', items } }
function table(headers: string[], rows: string[][]): ContentBlock { return { kind: 'table', headers, rows } }

export function generateProposalDraft(
  proposal: Proposal,
  rfpDoc: string,
  kickoffDoc: string | null,
  otherDoc: string | null
): DraftSection[] {
  const ko = kickoffDoc ?? 'Kick-off Call Transcript'
  const ot = otherDoc ?? 'Supporting Document'
  const { client, studyType, therapeuticArea, value } = proposal

  const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  }).format(value)

  return [
    // ─── 1. Executive Summary ───────────────────────────────────────────────
    {
      id: 's1',
      title: '1. Executive Summary',
      blocks: [
        p(
          t(`${client} has issued a request for proposal seeking a full-service CRO partner to execute a `),
          a(`${studyType}`, rfpDoc, 'rfp',
            `RFP Section 1.1 — Study Type: "${studyType}". Sponsor requires a full-service CRO capable of end-to-end study execution including project management, clinical operations, data management, biostatistics, and regulatory support.`),
          t(` in the ${therapeuticArea} space. Based on our review of the RFP and follow-up discussions during the kick-off call, we understand the sponsor's primary objectives to be: (1) establishing a safety and tolerability profile across dose cohorts; (2) characterizing the pharmacokinetic (PK) profile to inform dose selection for subsequent development; and (3) generating preliminary biomarker data to support future program decisions.`)
        ),
        p(
          t(`Our team is ideally positioned to execute this program. We have completed over 40 studies of similar design in the past five years, with specific depth in `),
          a(`${therapeuticArea} indications`, rfpDoc, 'rfp',
            `RFP Section 1.3 — Therapeutic Area: "${therapeuticArea}". Sponsor prefers a CRO with demonstrated experience in this indication and familiarity with relevant biomarker endpoints.`),
          t(`. A dedicated project team is in place and prepared to begin study startup activities `),
          a(`within four weeks of contract execution`, ko, 'kickoff',
            `Kick-off Call Notes — Sponsor confirmed: "We need boots on the ground quickly. Target FPI no later than Q3 2026. Startup of four weeks from contract signature is the expectation."`),
          t(`.`)
        ),
        p(
          t(`This proposal is based on the RFP, the kick-off call, and all supporting documents provided to date. It is valid for `),
          a(`90 days from the date of submission`, rfpDoc, 'rfp',
            `RFP Section 7.2 — Proposal Validity: "Submitted proposals must remain valid and binding for a minimum of 90 calendar days from the date of submission."`),
          t(`. All scope assumptions are detailed in Section 8.`)
        ),
      ],
    },

    // ─── 2. Study Overview / Protocol Summary ───────────────────────────────
    {
      id: 's2',
      title: '2. Study Overview / Protocol Summary',
      blocks: [
        table(
          ['Parameter', 'Details'],
          [
            ['Study Design', 'Randomized, double-blind, placebo-controlled'],
            ['Phase', studyType.includes('Phase') ? studyType.split(' ')[0] + ' ' + studyType.split(' ')[1] : studyType],
            ['Indication / Therapeutic Area', therapeuticArea],
            ['Study Population', 'As defined in the protocol and RFP'],
            ['Planned Study Sites', '1–3 sites (see Section 6)'],
            ['Estimated Duration', '12–18 months from contract execution'],
            ['Estimated Enrollment', '48–96 subjects (see Section 6)'],
          ]
        ),
        p(t('Primary Endpoints:')),
        ul(
          [a('Safety and tolerability', rfpDoc, 'rfp',
            `RFP Section 3.1 — Primary Endpoints: "Primary endpoint is safety and tolerability, including adverse events (AEs), serious adverse events (SAEs), clinical laboratory assessments, vital signs, physical examinations, and ECGs.`)],
          [t('Pharmacokinetic parameters: '), a('AUC₀–inf, AUC₀–last, Cmax, Tmax, and t½', rfpDoc, 'rfp',
            `RFP Section 3.1 — PK Parameters: "Sponsor requires full NCA-derived PK parameter set including AUC₀–inf, AUC₀–last, Cmax, Tmax, t½, CL/F, and Vz/F for all dose cohorts."`)],
        ),
        p(t('Secondary Endpoints:')),
        ul(
          [t('Dose proportionality assessment across all cohorts')],
          [a('Preliminary biomarker assessment', otherDoc ? ot : rfpDoc, otherDoc ? 'other' : 'rfp',
            otherDoc
              ? `From ${ot} — Biomarker Strategy: "Exploratory biomarkers to be assessed include [target biomarker]. Samples to be collected at pre-dose, 2h, 8h, and 24h post-dose. Assay to be provided by sponsor."`
              : `RFP Section 3.2 — Secondary Endpoints: "Exploratory biomarker data collection is required at defined timepoints to support future development decisions."`)],
          [t('Food effect sub-study (optional cohort, per protocol)')],
        ),
        p(t('Visit Schedule Summary:')),
        table(
          ['Study Period', 'Duration', 'Key Activities'],
          [
            ['Screening', 'Day −28 to Day −2', 'Informed consent, eligibility assessment, baseline labs'],
            ['Admission / Baseline', 'Day −1', 'Check-in, final eligibility confirmation, baseline assessments'],
            ['Dosing Day', 'Day 1', 'Study drug administration, PK sampling initiation'],
            ['In-Clinic PK Sampling', 'Days 1–3', 'Intensive serial PK sampling, safety monitoring'],
            ['Ambulatory Follow-up', 'Day 7', 'Safety labs, abbreviated PK sample'],
            ['End-of-Study Visit', 'Day 14', 'Final safety assessments, study exit procedures'],
          ]
        ),
      ],
    },

    // ─── 3. Scope of Work ───────────────────────────────────────────────────
    {
      id: 's3',
      title: '3. Scope of Work',
      blocks: [
        p(t('The following describes our full-service scope. Each functional area operates under a single project management structure with unified reporting and escalation pathways.')),
      ],
      subsections: [
        {
          id: 's3-1',
          title: '3.1 Project Management',
          blocks: [
            ul(
              [t('Dedicated Project Manager as single point of contact for all sponsor communications')],
              [t('Weekly status calls with written meeting minutes distributed within 48 hours')],
              [t('Monthly written progress reports covering enrollment, milestones, budget, and risk')],
              [t('Risk register established at kickoff and reviewed at every status call')],
              [t('Oversight of all functional area leads and third-party vendors')],
              [t('Contract and budget management, including change order administration and tracking')],
              [t('Coordination of the final Clinical Study Report (CSR) delivery')],
            ),
          ],
        },
        {
          id: 's3-2',
          title: '3.2 Clinical Operations',
          blocks: [
            ul(
              [t('Site identification, feasibility assessment, and final site selection')],
              [t('IRB/IEC submission packages preparation and tracking through approval')],
              [t('Site contracts and budget negotiation; Clinical Trial Agreement (CTA) execution')],
              [t('Investigator meeting design and facilitation (in-person or hybrid)')],
              [t('On-site and remote monitoring visits per the Monitoring Plan and Risk-Based Monitoring strategy')],
              [a('Source data verification (SDV) and source data review (SDR)', rfpDoc, 'rfp',
                `RFP Section 4.2 — Monitoring Requirements: "Sponsor requires 100% SDV for primary endpoint data and risk-based SDV for all other data fields. A monitoring plan must be submitted for sponsor review prior to site activation."`)],
              [t('Investigational product (IP) accountability and reconciliation')],
              [t('Protocol deviation documentation, categorization, and CAPA initiation')],
              [t('Site closeout visits and archival coordination')],
            ),
          ],
        },
        {
          id: 's3-3',
          title: '3.3 Data Management',
          blocks: [
            ul(
              [a('eCRF design and build in Medidata Rave', rfpDoc, 'rfp',
                `RFP Section 5.1 — EDC Platform: "Sponsor operates a Medidata Rave enterprise license. CRO is required to build and manage the eCRF within the sponsor's existing Rave environment. CRO must provide a Rave-certified data manager."`)],
              [t('Data Management Plan (DMP) authoring and sponsor approval')],
              [t('User Acceptance Testing (UAT) with site and sponsor stakeholders')],
              [t('Edit check programming, data validation, and discrepancy management')],
              [t('Medical coding: MedDRA for adverse events, WHODrug for concomitant medications')],
              [t('SAE/narrative reconciliation with Medical Monitor')],
              [t('Database lock procedures and locked database transfer to Biostatistics')],
            ),
          ],
        },
        {
          id: 's3-4',
          title: '3.4 Biostatistics',
          blocks: [
            ul(
              [t('Statistical Analysis Plan (SAP) development and sponsor review/approval cycle')],
              [t('Randomization schedule generation and blind maintenance procedures')],
              [t('Statistical programming in SAS for all Tables, Figures, and Listings (TFLs)')],
              [t('NCA PK analysis using Phoenix WinNonlin; PK parameter dataset delivery')],
              [t('Integrated summary datasets (SDTM, ADaM) per CDISC standards')],
              [t('Biostatistics contribution to the Clinical Study Report')],
            ),
          ],
        },
        {
          id: 's3-5',
          title: '3.5 Regulatory Affairs',
          blocks: [
            ul(
              [t('Regulatory strategy guidance for IND amendments, if triggered by protocol changes')],
              [t('Ethics Committee / IRB submission support and response management')],
              [t('Expedited safety reporting: IND safety reports and CIOMS forms within required timelines')],
              [t('Clinical Study Report (CSR) structured per ICH E3 guidelines')],
              [t('Document archival per applicable regulations and sponsor SOPs')],
            ),
          ],
        },
        {
          id: 's3-6',
          title: '3.6 Medical Monitoring',
          blocks: [
            ul(
              [t('Dedicated Medical Monitor assigned for the full duration of the study')],
              [t('SAE and AE medical review; narrative authoring and sponsor submission')],
              [t('Protocol deviation medical assessment and clinical significance determination')],
              [a('Interim safety review after each dose cohort prior to dose escalation decision', ko, 'kickoff',
                `Kick-off Call Notes — Medical Monitoring: "Sponsor's CMO emphasized that they want a formal safety review meeting after each cohort, not just a data read. Medical Monitor must be present on dosing days and available for dose escalation teleconferences within 48 hours of cohort completion."`)],
              [t('On-call coverage during dosing days for any urgent medical questions')],
              [t('Participation in Dose Escalation Committee (DEC) calls as needed')],
            ),
          ],
        },
      ],
    },

    // ─── 4. Project Timeline ────────────────────────────────────────────────
    {
      id: 's4',
      title: '4. Project Timeline',
      blocks: [
        p(t('The following milestone-based timeline reflects our standard Phase I startup assumptions and the enrollment targets discussed during the kick-off call. All dates are relative to contract execution (Week 0).')),
        table(
          ['Milestone', 'Target Week', 'Notes'],
          [
            ['Contract Execution', 'Week 0', 'Fully executed CTA + Work Order'],
            ['Study Startup Initiated', 'Week 1', 'PM assigned; project team onboarded'],
            ['Protocol Finalized & Approved', 'Week 3', 'Sponsor signature required'],
            ['IRB/IEC Submission', 'Week 4', 'Initial submission to lead site'],
            ['IRB/IEC Approval', 'Week 8', 'Assumes standard review cycle'],
            ['Site Activation', 'Week 9', 'Contracts, training, drug shipment confirmed'],
            ['First Subject Screened', 'Week 10', ''],
            ['First Patient In (FPI)', 'Week 11', 'First subject dosed'],
            ['SAD Cohorts Complete', 'Week 22', '6 cohorts × ~2 weeks per cohort'],
            ['MAD Cohorts Complete', 'Week 30', '2 cohorts × ~4 weeks per cohort'],
            ['Last Subject Last Visit (LSLV)', 'Week 32', 'Final follow-up visit'],
            ['Database Lock', 'Week 36', 'Assumes clean data and no major queries'],
            ['Draft Clinical Study Report', 'Week 44', 'For sponsor review and comment'],
            ['Final Clinical Study Report', 'Week 48', '~12 months from contract execution'],
          ]
        ),
        p(t('Note: This timeline assumes no significant protocol amendments, no clinical holds, and that the sponsor provides IMP at site no later than Week 8.')),
      ],
    },

    // ─── 5. Staffing Plan ───────────────────────────────────────────────────
    {
      id: 's5',
      title: '5. Staffing Plan',
      blocks: [
        table(
          ['Role', 'Name', 'FTE Allocation', 'Years Experience'],
          [
            ['Project Manager', 'Sarah M. (to be confirmed)', '100%', '8 years'],
            ['Clinical Lead / Sr. CRA', 'James T. (to be confirmed)', '75%', '6 years'],
            ['Data Manager', 'Priya K. (to be confirmed)', '50%', '7 years'],
            ['Biostatistician', 'Dr. Chen W. (to be confirmed)', '25%', '10 years'],
            ['Medical Monitor', 'Dr. Lisa R., MD (to be confirmed)', '10%', '12 years'],
            ['Regulatory Affairs Specialist', 'Mark A. (to be confirmed)', '20%', '9 years'],
          ]
        ),
        p(t('Project Manager — 8+ years in Phase I clinical operations with specific expertise in SAD/MAD and first-in-human study designs. Has managed 14 Phase I programs for global biotech and pharmaceutical sponsors across oncology, CNS, and immunology indications.')),
        p(t('Clinical Lead — 6 years of site management experience with deep familiarity with Phase I unit operations. Has executed 9 studies requiring intensive PK sampling designs. Experienced with Veeva Vault CTMS and risk-based monitoring frameworks.')),
        p(t('Medical Monitor — Board-certified physician with 12 years of clinical research experience. Has served as Medical Monitor on 20+ Phase I studies including 8 first-in-human programs. Familiar with dose escalation committee (DEC) governance and on-call safety coverage requirements.')),
        p(t('Full CVs for all key personnel are provided in Appendix A.')),
      ],
    },

    // ─── 6. Site Strategy ───────────────────────────────────────────────────
    {
      id: 's6',
      title: '6. Site Strategy',
      blocks: [
        p(
          t('Based on the scope described in the RFP and the site preferences confirmed during the kick-off call, we propose a '),
          a('single-site strategy', ko, 'kickoff',
            `Kick-off Call Notes — Site Strategy: "Sponsor confirmed preference for a single-site study to maintain consistency in PK sampling procedures, reduce variability, and simplify logistics. Multi-site designs were discussed but deprioritized for this Phase I study."`),
          t(` at a dedicated Phase I inpatient unit. A single-site approach provides the controlled environment required for intensive PK sampling, 24-hour medical coverage, and timely dose escalation decisions.`)
        ),
        p(t('Site Selection Criteria:')),
        ul(
          [t('Minimum 20 inpatient beds dedicated exclusively to Phase I studies')],
          [t('On-site analytical laboratory with HPLC-MS/MS capability for real-time PK sample processing')],
          [t('Principal Investigator with ≥5 SAD/MAD studies as PI in the past 3 years')],
          [a('Preference for sites in the US or EU', ko, 'kickoff',
            `Kick-off Call Notes — Geography: "Sponsor's Head of Clinical Ops stated a strong preference for US or Western European sites. Sites in Eastern Europe are acceptable only as backups. APAC sites are out of scope for this study."`)],
          [t('Active unit with ≥10 ongoing or recently completed studies (validated site performance)')],
        ),
        p(t('Enrollment Assumptions:')),
        ul(
          [a('Target enrollment: 48 subjects', rfpDoc, 'rfp',
            `RFP Section 2.4 — Enrollment: "The planned study population is 48 subjects: 6 SAD cohorts of 8 subjects each (6 active : 2 placebo) and 2 MAD cohorts of 8 subjects each (6 active : 2 placebo). The sponsor may add an optional food effect cohort (n=12) at their discretion."`)],
          [t('Assumed screen failure rate: 25% (~12 additional subjects screened beyond target)')],
          [t('Cohort enrollment rate: ~2 cohorts per 4-week period (sequential by design)')],
          [t('Total enrollment period: ~20 weeks from first subject screened to LSLV')],
        ),
      ],
    },

    // ─── 7. Budget Summary ──────────────────────────────────────────────────
    {
      id: 's7',
      title: '7. Budget Summary',
      blocks: [
        p(
          t('The following represents a high-level summary of the proposed budget for this program. This budget is based on the scope described in Section 3 and the assumptions outlined in Section 8. '),
          a('A detailed line-item budget is provided as a separate Excel attachment', rfpDoc, 'rfp',
            `RFP Section 6.1 — Budget Format: "Respondents must provide both a high-level budget summary within the proposal body and a detailed line-item budget in the provided Excel template as a separate attachment. All costs must be broken out by functional area and clearly delineated between service fees and pass-through costs."`)
        ),
        table(
          ['Functional Area', 'Service Fees', 'Pass-Through Costs', 'Total'],
          [
            ['Project Management', '$85,000', '—', '$85,000'],
            ['Clinical Operations', '$120,000', '$45,000', '$165,000'],
            ['Data Management', '$55,000', '$8,000', '$63,000'],
            ['Biostatistics & Programming', '$48,000', '—', '$48,000'],
            ['Regulatory Affairs', '$22,000', '$5,000', '$27,000'],
            ['Medical Monitoring', '$30,000', '—', '$30,000'],
            ['Site Costs (estimated)', '—', '$150,000', '$150,000'],
            ['Lab / Bioanalytical (estimated)', '—', '$35,000', '$35,000'],
            ['TOTAL', '$360,000', '$243,000', `$603,000`],
          ]
        ),
        p(
          a('All pass-through costs are estimated and will be invoiced at actuals', rfpDoc, 'rfp',
            `RFP Section 6.3 — Pass-Through Policy: "Pass-through costs must be invoiced at cost with supporting documentation. No mark-up will be accepted on pass-through expenses. Estimated pass-throughs in the proposal are for budgetary planning only."`),
          t(`. Service fees are fixed-price per the agreed scope. Any scope changes will be addressed via a formal change order process prior to work commencing. The proposed budget reflects the total estimated program cost of ${formattedValue} inclusive of all fees and estimated pass-throughs.`)
        ),
      ],
    },

    // ─── 8. Assumptions and Exclusions ──────────────────────────────────────
    {
      id: 's8',
      title: '8. Assumptions and Exclusions',
      blocks: [
        p(t('The scope, timeline, and budget in this proposal are contingent on the following assumptions. Violation of these assumptions may constitute a scope change and trigger a change order.')),
        p(t('Included in Scope:')),
        ul(
          [t('All activities described in Section 3 (Scope of Work)')],
          [t('One protocol version at proposal submission; up to one minor amendment included in base scope')],
          [t('One clinical study site (Phase I inpatient unit)')],
          [a('Up to 48 subjects enrolled; optional food effect cohort (n=12) is excluded from base scope', rfpDoc, 'rfp',
            `RFP Section 2.4 — Enrollment: "Base enrollment is 48 subjects. The optional food effect cohort (n=12) described in Section 2.5 is NOT included in the base scope and must be budgeted as a separate option."`)],
          [t('NCA PK analysis using Phoenix WinNonlin; population PK modeling is excluded')],
          [t('English-language documents only; translations are excluded')],
          [t('One Clinical Study Report (CSR) in ICH E3 format')],
        ),
        p(t('Excluded from Scope:')),
        ul(
          [t('IND filing, NDA preparation, or any other regulatory submissions to health authorities')],
          [t('Investigational drug manufacturing, formulation, labeling, or supply logistics')],
          [t('Pharmacogenomics, proteomics, or exploratory biomarker assay development')],
          [t('Document translation into non-English languages')],
          [t('Long-term safety follow-up beyond 14 days post-final dose')],
          [t('Population PK modeling or PK/PD modeling')],
          [t('Additional protocol amendments beyond the one included in base scope')],
        ),
        p(t('Key Assumptions:')),
        ul(
          [a('Protocol version: as provided at time of proposal submission; no major amendments anticipated', otherDoc ? ot : rfpDoc, otherDoc ? 'other' : 'rfp',
            otherDoc
              ? `From ${ot} — Protocol Version: "This document reflects Protocol Version 1.0. The sponsor confirmed during the kick-off call that no major amendments are anticipated prior to FPI."`
              : `RFP Section 2.1 — Protocol Status: "The study protocol is at final draft stage. No major amendments are anticipated prior to regulatory submission."`)],
          [a('Number of planned cohorts: 8 (6 SAD + 2 MAD); subjects per cohort: 8 (6 active : 2 placebo)', rfpDoc, 'rfp',
            `RFP Section 2.3 — Study Design: "The study will enroll 8 cohorts in a sequential, dose-escalating fashion. Six cohorts will receive single ascending doses; two cohorts will receive multiple ascending doses. Each cohort will consist of 8 subjects randomized 6:2 (active:placebo)."`)],
          [t('Single study site; US or EU geography')],
          [t('Sponsor to provide IMP and matched placebo delivered to site no later than Week 8 post-contract execution')],
          [t('Sponsor is responsible for the bioanalytical method and PK assay; CRO to coordinate sample shipment only')],
          [a('eCRF platform: Medidata Rave under sponsor-owned enterprise license', rfpDoc, 'rfp',
            `RFP Section 5.1 — EDC Platform: "The CRO must build and manage all eCRF activities within the sponsor's existing Medidata Rave enterprise environment. CRO must not establish a separate EDC instance."`)],
          [t('Study startup to begin within 4 weeks of fully executed contract and Work Order')],
          [t('Enrollment rate: approximately 2 cohorts per month')],
          [t('Exchange rates and travel cost estimates based on rates current at proposal submission; subject to revision if study start is delayed >6 months')],
        ),
      ],
    },

    // ─── 9. Company Qualifications ──────────────────────────────────────────
    {
      id: 's9',
      title: '9. Company Qualifications',
      blocks: [
        p(t(`We are a full-service contract research organization with operations across North America, Europe, and Asia-Pacific. We have supported over 500 clinical studies across Phase I–IV for global pharmaceutical, biotechnology, and medical device sponsors. Our ${therapeuticArea} practice is one of our most established therapeutic area teams.`)),
        p(t('Relevant Capabilities:')),
        ul(
          [t(`${therapeuticArea}: 30+ completed studies across Phase I–III`)],
          [t('Phase I / First-in-Human: 40+ FIH studies in the past 5 years, including SAD/MAD, food effect, DDI, and QT/QTc designs')],
          [t('Biostatistics & NCA: In-house PK/PD capabilities using Phoenix WinNonlin and SAS; CDISC-compliant datasets for all studies')],
          [t('Regulatory Track Record: Zero FDA warning letters in past 10 years; successful inspection history across FDA, EMA, and PMDA')],
          [t('Technology: Veeva Vault CTMS, Medidata Rave, and proprietary central monitoring dashboards')],
        ),
        p(t('Client references from studies of similar design are available upon request (subject to NDA). See Appendix C.')),
      ],
    },

    // ─── 10. Quality and Risk Management ────────────────────────────────────
    {
      id: 's10',
      title: '10. Quality and Risk Management',
      blocks: [
        p(t('Quality Oversight:')),
        ul(
          [t('Dedicated Quality Assurance (QA) function embedded within the project team; QA Lead assigned at project kickoff')],
          [t('Risk-based monitoring (RBM) approach per ICH E6(R3) guidance; central monitoring data review supplemented by targeted on-site visits')],
          [t('Trial Master File (TMF) maintained in real-time using Veeva Vault eTMF; audit-ready at all times with a target TMF completeness score ≥95%')],
          [t('Protocol deviation categorization (minor, major, important) with mandatory CAPA for any major or important deviation')],
          [t('Sponsor audit access supported at any point during the study with 5-business-day notice')],
        ),
        p(t('Risk Management:')),
        ul(
          [t('Risk register established at project kickoff; reviewed and updated at every monthly status report')],
          [t('Top identified risks for a study of this type: enrollment screen failure rate exceeding 25%, PK sampling compliance at site, dose escalation hold decisions')],
          [t('Mitigation: pre-screening questionnaire deployed before formal screening visits; intensive site staff training on PK sampling SOPs; Medical Monitor on-call during all dosing days')],
          [t('Business continuity: backup CRA and PM identified prior to study start; all documents maintained in shared document management system to ensure continuity in the event of staff transitions')],
        ),
      ],
    },

    // ─── 11. Appendices ─────────────────────────────────────────────────────
    {
      id: 's11',
      title: '11. Appendices',
      blocks: [
        ul(
          [t('Appendix A — Key Personnel CVs (Project Manager, Clinical Lead, Data Manager, Biostatistician, Medical Monitor)')],
          [t('Appendix B — SOP Index (full SOP library available upon request under confidentiality agreement)')],
          [t('Appendix C — Client References (available upon request; names and contacts provided under NDA)')],
          [t('Appendix D — Detailed Line-Item Budget (Excel attachment)')],
          [t('Appendix E — Draft Project Gantt Chart')],
        ),
      ],
    },
  ]
}
