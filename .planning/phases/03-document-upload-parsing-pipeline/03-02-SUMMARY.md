---
phase: 03-document-upload-parsing-pipeline
plan: "02"
subsystem: document-management
tags: [ui, document-list, status-tracking, tdd]

dependency_graph:
  requires:
    - supabase-client (from 01-01)
    - proposal_documents table (from 01-02)
    - Database types (from 01-04)
  provides:
    - DocumentList component
    - Document status visualization
    - Document deletion functionality
  affects:
    - None (standalone component)

tech_stack:
  added:
    - React Testing Library userEvent
  patterns:
    - TDD (RED-GREEN-REFACTOR)
    - Chainable mock query builder for Supabase tests
    - Polling for real-time status updates
    - Human-readable file size formatting

key_files:
  created:
    - src/components/DocumentList.tsx
  modified:
    - src/components/__tests__/DocumentList.test.tsx

decisions:
  - Poll every 2 seconds when documents have parse_status='extracting' (stops when all terminal)
  - Status badge colors: gray (pending), blue (extracting), green (complete), red (error)
  - File size formatting: B, KB (1024), MB (1024*1024)
  - Delete removes from Storage first, then database (CASCADE handles document_extracts)
  - Empty state shows upload icon with "No documents uploaded yet"
  - Loading state shows "Loading documents..." during initial fetch

metrics:
  duration_seconds: 343
  completed_date: "2026-03-07T19:14:01Z"
  tasks_completed: 1
  tests_added: 5
  tests_passing: 5
  files_created: 1
  files_modified: 1
  commits: 2
---

# Phase 03 Plan 02: Document List with Status Indicators Summary

**One-liner:** Document list component with color-coded status badges (pending/extracting/complete/error), real-time polling, and deletion

## What Was Built

Created a DocumentList React component that displays uploaded documents for a proposal with:

1. **Document display** - Shows file name, size, and status for each document
2. **Status indicators** - Color-coded badges for pending, extracting, complete, and error states
3. **Real-time updates** - Polls every 2 seconds when documents are extracting
4. **File icons** - Different icons based on MIME type (PDF, Word, Excel, text)
5. **Deletion** - Removes document from both Storage and database
6. **Empty state** - Shows helpful message when no documents uploaded
7. **Human-readable sizes** - Formats bytes as B, KB, or MB

## Implementation Details

### Component Architecture

**Props:**
- `proposalId: string` - Filters documents by proposal
- `onDocumentDeleted?: () => void` - Optional callback after deletion

**State:**
- `documents` - Array of DocumentRow from proposal_documents table
- `loading` - Initial fetch loading state
- `error` - Error message if fetch fails

**Data fetching:**
```typescript
supabase
  .from('proposal_documents')
  .select('*')
  .eq('proposal_id', proposalId)
  .order('created_at', { ascending: false })
```

**Polling logic:**
- Checks if any document has `parse_status === 'extracting'`
- If yes, polls every 2 seconds via setInterval
- Stops when all documents have terminal status (complete or error)
- Cleanup function clears interval on unmount

**Delete flow:**
1. Delete from Storage: `supabase.storage.from('documents').remove([storage_path])`
2. Delete from database: `supabase.from('proposal_documents').delete().eq('id', documentId)`
3. Remove from local state
4. Call `onDocumentDeleted()` callback if provided

### Status Badge Design

| Status      | Badge Color      | Text           |
| ----------- | ---------------- | -------------- |
| `pending`   | Gray (100/600)   | "Pending"      |
| `extracting`| Blue (100/600)   | "Extracting..." |
| `complete`  | Green (100/600)  | "Complete"     |
| `error`     | Red (100/600)    | "Failed"       |

### File Size Formatting

- < 1024 bytes: "500 B"
- < 1MB: "15.0 KB"
- >= 1MB: "2.0 MB"

### Testing Strategy (TDD)

**RED phase (commit 5de96ff):**
- Created 5 failing tests covering all requirements
- Tests failed because DocumentList.tsx didn't exist

**GREEN phase (commit 51a1428):**
- Implemented DocumentList component
- All 5 tests passing

**Mock strategy:**
- Created chainable mock query builder
- Allows per-test mock data configuration
- Properly mocks chained Supabase methods (from → select → eq → order)

### Test Coverage

1. **Empty state** - Renders "No documents uploaded yet" when no documents
2. **Document display** - Fetches and displays file name and size
3. **Status badges** - All 4 status types render with correct colors
4. **Delete** - Calls Storage and database delete, triggers callback
5. **File size** - Formats bytes/KB/MB correctly

All tests green: `npm run test:run` passes in 1.60s

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] DocumentList component exists and renders in test
- [x] Component queries proposal_documents table filtered by proposal_id
- [x] Status badges render with correct colors for each state
- [x] File size formatted in human-readable units
- [x] Delete removes document from Storage and database
- [x] Polling updates status during extraction
- [x] Empty state displays when no documents
- [x] All tests green: npm run test:run passes

## Success Criteria Met

- [x] User sees list of uploaded documents for proposal
- [x] Each document shows file name, size, and status badge
- [x] Status badge color-coded: gray (pending), blue (extracting), green (complete), red (error)
- [x] Delete button removes document from Storage and database
- [x] Status updates automatically during extraction (polling every 2s)
- [x] Empty state shown when no documents uploaded
- [x] Component matches Jamo visual design

## Files Changed

**Created:**
- `src/components/DocumentList.tsx` (234 lines)

**Modified:**
- `src/components/__tests__/DocumentList.test.tsx` (207 lines, from stub to full tests)

## Commits

| Hash    | Type   | Description                                           |
| ------- | ------ | ----------------------------------------------------- |
| 5de96ff | test   | Add failing test for DocumentList component (RED)     |
| 51a1428 | feat   | Implement DocumentList component (GREEN)              |

## Next Steps

Plan 03-03 already completed (Edge Function POC with pdfjs-serverless).

This component is ready to integrate into the proposal detail page once the FileUpload component is built (plan 03-01, currently pending).
