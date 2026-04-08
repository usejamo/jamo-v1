# Technology Stack

**Analysis Date:** 2026-03-03

## Languages

**Primary:**
- TypeScript 5.9.3 - Application source code in `src/`
- JavaScript - Configuration and build tooling
- CSS - Styling with Tailwind CSS

**Secondary:**
- HTML - Static markup in `index.html`

## Runtime

**Environment:**
- Node.js - Development and build environment

**Package Manager:**
- npm - Dependency management
- Lockfile: `package-lock.json` present (v3)

## Frameworks

**Core:**
- React 19.2.0 - UI framework for component-based UI
- React DOM 19.2.0 - React browser bindings

**Routing:**
- React Router 7.13.1 - Client-side routing for navigation between pages

**Styling:**
- Tailwind CSS 4.2.1 - Utility-first CSS framework
- @tailwindcss/vite 4.2.1 - Vite integration for Tailwind

**Animation:**
- Framer Motion 12.34.3 - Animation and motion library for interactive UI components

## Key Dependencies

**Critical:**
- react-router-dom 7.13.1 - Enables page routing and navigation (Dashboard, Proposals, Settings)
- tailwindcss 4.2.1 - Core styling framework using utility classes throughout components
- framer-motion 12.34.3 - Powers animations for panels, modals, and transitions

**Infrastructure:**
- `cro-proposal-generator.js` - Anthropic API integration module for CRO proposal generation (uses native `fetch`)

## Build & Development Tools

**Build System:**
- Vite 7.3.1 - Fast frontend build tool and dev server
- @vitejs/plugin-react 5.1.1 - React support for Vite

**Linting:**
- ESLint 9.39.1 - Code linting and style enforcement
- eslint-plugin-react-hooks 7.0.1 - React hooks rules
- eslint-plugin-react-refresh 0.4.24 - Fast refresh rules for Vite
- @eslint/js 9.39.1 - ESLint recommended config
- globals 16.5.0 - Global variable definitions

**Type Checking:**
- TypeScript 5.9.3 - Static type checking (target: ES2020, strict mode enabled)

## Configuration

**Environment:**
- `.env` present - Anthropic API key required for proposal generation feature
- `ANTHROPIC_API_KEY` (or passed via options) required by `cro-proposal-generator.js`

**Build:**
- `vite.config.js` - Vite configuration with React and Tailwind plugins
- `tsconfig.json` - TypeScript compiler options (strict mode, ES2020 target)
- `eslint.config.js` - ESLint rules configuration

**Type Definitions:**
- `src/types/` - Custom TypeScript type definitions for domain models

## Platform Requirements

**Development:**
- Node.js runtime required
- npm for dependency installation
- Modern web browser with ES2020 support

**Production:**
- Static hosting compatible with SPA (Single Page Application)
- No server-side runtime required
- Client-side rendering only
- Deployed as `dist/` directory output from `vite build`

## Scripts

**Development:**
```bash
npm run dev      # Start Vite dev server with hot reload
npm run build    # Build for production to dist/
npm run preview  # Preview production build locally
npm run lint     # Run ESLint
```

## Key Features

**Technology Characteristics:**
- **Frontend-Only**: Pure client-side React application
- **No Backend**: Data stored in memory via React Context (loaded from JSON)
- **No Database Integration**: Demo data persists in-memory only
- **Anthropic API Integration**: `cro-proposal-generator.js` calls `https://api.anthropic.com/v1/messages` via native fetch
- **Modern React**: Uses React 19 with latest hooks patterns
- **Type Safe**: Full TypeScript strict mode enabled
- **CSS-in-Tailwind**: All styling via Tailwind utility classes
- **Responsive**: Mobile-first Tailwind design approach
- **SPA Navigation**: Client-side routing with React Router

---

*Stack analysis: 2026-03-03*
