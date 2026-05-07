---
status: complete
phase: 12-salesforce-integration
source: [12-VERIFICATION.md]
started: 2026-05-06T00:00:00.000Z
updated: 2026-05-07T00:00:00.000Z
---

## Current Test

All tests passed via human UAT on 2026-05-07.

## Tests

### 1. Visual layout — SalesforceConnection card first in grid
expected: Settings → Integrations tab shows SalesforceConnection as the first of 3 cards in the grid (Salesforce, HubSpot, Workday)
result: passed

### 2. sf_error URL cleanup
expected: Navigate to /settings?tab=Integrations&sf_error=state_mismatch — error banner appears with correct copy, URL is cleaned (sf_error removed) after page loads
result: passed

### 3. Full OAuth connect flow
expected: Click Connect Salesforce → browser redirects to Salesforce login → after auth, redirected back to Settings with connected state showing sf_username and green Connected badge
result: passed

### 4. Disconnect flow
expected: Click Disconnect → spinner shown in button → on success, card returns to disconnected state with Production/Sandbox radio
result: passed

### 5. REQ-12.6 graceful degradation with live Supabase
expected: Component loads without throwing when salesforce_connections row doesn't exist — shows disconnected state, not an error boundary
result: passed

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

Bugs found and fixed during UAT:
- vault RPCs were in private schema (invisible to PostgREST) → moved to public
- salesforce_connections RLS used user_profiles.id instead of user_id → fixed to use private.get_user_org_id()
- vault.create_secret failed on reconnect due to unique name constraint → fixed with delete-before-insert
- Disconnect button expanded card on loading state → replaced text+spinner with spinner-only
- HubSpot/Workday cards showed fake connected states → replaced with "Coming soon" treatment
