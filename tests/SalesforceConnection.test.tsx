// Wave 0 stubs — REQ-12.5, REQ-12.6 SalesforceConnection component
import { describe, it } from 'vitest'

describe('SalesforceConnection', () => {
  it.skip('renders disconnected state with Production/Sandbox radio and Connect Salesforce button', () => {})
  it.skip('defaults to Production radio selected', () => {})
  it.skip('renders connected state with sf_username and Disconnect button', () => {})
  it.skip('renders Connected status badge with green dot in connected state', () => {})
  it.skip('renders inline error banner when sf_error=user_denied query param is present', () => {})
  it.skip('renders inline error banner when sf_error=state_mismatch query param is present', () => {})
  it.skip('renders inline error banner when sf_error=token_exchange_failed query param is present', () => {})
  it.skip('renders inline error banner when sf_error=userinfo_failed query param is present', () => {})
  it.skip('renders inline error banner when sf_error=unknown query param is present', () => {})
  it.skip('removes sf_error from URL after rendering error banner (D-15)', () => {})
  it.skip('renders disconnected state (not thrown) when salesforce_connections returns null (REQ-12.6)', () => {})
  it.skip('renders disconnected state (not thrown) when salesforce_connections fetch errors (REQ-12.6)', () => {})
})
