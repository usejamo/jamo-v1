---
status: partial
phase: 12-salesforce-integration
source: [12-VERIFICATION.md]
started: 2026-05-06T00:00:00.000Z
updated: 2026-05-06T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Visual layout — SalesforceConnection card first in grid
expected: Settings → Integrations tab shows SalesforceConnection as the first of 3 cards in the grid (Salesforce, HubSpot, Workday)
result: [pending]

### 2. sf_error URL cleanup
expected: Navigate to /settings?tab=Integrations&sf_error=state_mismatch — error banner appears with correct copy, URL is cleaned (sf_error removed) after page loads
result: [pending]

### 3. Full OAuth connect flow
expected: Click Connect Salesforce → browser redirects to Salesforce login → after auth, redirected back to Settings with connected state showing sf_username and green Connected badge
result: [pending]

### 4. Disconnect flow
expected: Click Disconnect → button shows Disconnecting… spinner → on success, card returns to disconnected state with Production/Sandbox radio
result: [pending]

### 5. REQ-12.6 graceful degradation with live Supabase
expected: Component loads without throwing when salesforce_connections row doesn't exist — shows disconnected state, not an error boundary
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
