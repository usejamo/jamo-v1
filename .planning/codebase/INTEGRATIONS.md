# External Integrations

**Analysis Date:** 2026-03-03

## APIs & External Services

### Anthropic API
- **Purpose:** AI-powered CRO (Contract Research Organization) proposal generation
- **Module:** `cro-proposal-generator.js` (root-level, ESM module)
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Auth:** `x-api-key` header — API key passed via `options.apiKey` at call time
- **Default model:** `claude-sonnet-4-5-20250929` (overridable)
- **Max tokens:** 32,000 (full proposals); 8,000 per section (section-by-section mode)
- **Prompt template:** `cro_proposal_prompt_template.md` — Handlebars-style template doc for frontend variable substitution
- **Exports:** `generateProposal()`, `generateProposalBySection()`, `buildUserMessage()`, `CRO_PROPOSAL_SYSTEM_PROMPT`, `AVAILABLE_SERVICES`, `THERAPEUTIC_AREAS`, `STUDY_PHASES`

**No other external APIs detected:**
- No authentication service clients
- No payment processing (Stripe, etc.)
- No analytics services

## Data Storage

**Databases:**
- None - Application uses in-memory data only
- Demo data loaded from JSON files at startup

**Data Files:**
- `src/data/proposals.json` - Proposal records loaded into memory
- `src/data/documents.json` - Document references for proposals
- All data persists only during browser session (not persistent)

**File Storage:**
- Local filesystem only - Static assets in `public/` directory
- `public/jamo_logo.png` - Application logo

**Caching:**
- None configured - Standard browser caching via Vite

## Authentication & Identity

**Auth Provider:**
- None - Application has no authentication layer
- No user login/signup
- Public access to all functionality
- Demo/prototype state

## Monitoring & Observability

**Error Tracking:**
- None configured

**Logs:**
- Console logging only (development)
- No external log aggregation

## CI/CD & Deployment

**Hosting:**
- Not configured - Static hosting required (e.g., Vercel, Netlify, GitHub Pages, S3)
- Build output: `dist/` directory

**CI Pipeline:**
- Not configured - No GitHub Actions or external CI service detected

**Build Process:**
- Vite compilation to static assets
- No server-side building required

## Environment Configuration

**Required env vars:**
- `ANTHROPIC_API_KEY` - Required for CRO proposal generation via `cro-proposal-generator.js`

**Secrets location:**
- `.env` at project root (present, gitignored)

## Data Persistence

**Current Architecture:**
- In-memory React Context (`src/context/ProposalsContext.tsx`)
- Data reset on page refresh
- LocalStorage: Not used
- Database: Not configured

**State Management Pattern:**
- React Context API for global state
- Providers:
  - `ProposalsProvider` - Manages proposal CRUD operations
  - `DeletedProvider` - Tracks deleted items
  - `ArchivedProvider` - Tracks archived items
  - `SidebarContext` - UI sidebar state
  - `ProposalModalContext` - Modal interaction state

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Third-Party CDNs

**Fonts:**
- System fonts only - No external font CDNs (e.g., Google Fonts)

**JavaScript Libraries:**
- All dependencies installed via npm
- No CDN-loaded scripts

## Future Integration Points

**If Backend Needed:**
- Create API client library (e.g., fetch wrapper or axios client) in `src/services/api.ts`
- Add `.env` file for API_BASE_URL configuration
- Implement error boundary for network failures
- Add loading/error states to components
- Consider adding TanStack Query or SWR for data fetching

**If Database Needed:**
- Currently data survives browser session via Context API
- Could migrate to localStorage for light persistence
- For true persistence, implement backend with database (PostgreSQL, MongoDB, etc.)

**If Authentication Needed:**
- Integrate auth provider (Auth0, Supabase, Firebase, or custom OAuth)
- Add login page and protected routes
- Store tokens securely

**If Analytics Needed:**
- Consider Mixpanel, Segment, or Plausible
- Minimal performance impact preferred

---

*Integration audit: 2026-03-03*
