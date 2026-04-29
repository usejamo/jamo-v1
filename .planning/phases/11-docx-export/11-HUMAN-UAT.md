---
status: partial
phase: 11-docx-export
source: [11-VERIFICATION.md]
started: 2026-04-29T17:30:00Z
updated: 2026-04-29T17:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Clean DOCX download (no unresolved placeholders)
expected: Clicking 'Export to Word' on a proposal with all placeholders resolved immediately downloads a {slug}.docx file that opens in Word/LibreOffice with correct headings, text, and formatting.
result: [pending]

### 2. Placeholder-blocking modal
expected: Clicking 'Export to Word' on a proposal with unresolved placeholders shows ExportBlockedModal listing each placeholder grouped by section with a 'Resolve →' jump link. The modal prevents the download.
result: [pending]

### 3. Force export with yellow highlights
expected: Clicking 'Force export anyway' in ExportBlockedModal downloads the DOCX file. The file contains an 'Unresolved Placeholders' cover section and all placeholder text is yellow-highlighted in the document body.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
