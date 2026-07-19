# HorrorWriter — CLAUDE.md

A horror writing community at **horrorwriter.org**. **Astro 7** site (React islands) on
Cloudflare Workers, Supabase backend. Solo-maintained by Jeff; the site must stay
non-technical for writer users and low-maintenance to run.

> **Project history, session logs, and planning live in the Obsidian vault:**
> `D:\CLAUDECODE\Vault\02_Projects\horrorwriter\project-overview.md` — read it before starting
> work for the current checkpoint and roadmap. This file documents the *current state* only.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | **Astro 7** (`@astrojs/cloudflare` adapter v14 — static prerender + SSR) |
| UI | **React 19 islands** (`@astrojs/react` v6, `client:load`) |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`, `@theme` tokens in `src/styles/global.css`) |
| Data fetching | `@tanstack/react-query` (in islands) |
| Auth | Supabase magic-link + WebAuthn passkeys + Google OAuth (flagged) |
| Database | Supabase Postgres (Row Level Security on all tables) |
| Storage | Supabase Storage (avatars bucket, per-user RLS) |
| Edge Functions | Supabase Deno functions (WebAuthn ceremonies) |
| Deploy | Cloudflare Workers (push-to-`main` via Workers Builds) |
| Node | 22 (pinned in `.nvmrc`) |

Markdown editing via `react-markdown` + `remark-gfm` + `turndown`; `.docx` import via
`mammoth`; toasts via `sonner`. No other UI libraries — Storybook, `framer-motion`, and
`react-router-dom` were all removed as unneeded (2026-07).

---

## Architecture

Astro renders the page shell (`src/layouts/MainLayout.astro`) and each route's `.astro` file
mounts a React **island** for the interactive body.

```
Request → src/pages/<route>.astro
            └─ MainLayout.astro  (global chrome: header, <UserMenu>, <Footer>, <SignInModalWrapper>)
                 └─ <SomePage client:load />   ← React island from src/pages-react/
```

**⚠️ Islands do NOT share React context.** Each `client:load` directive is a separate React root.
`MainLayout` mounts `AuthProvider`, `UserMenu`, and `SignInModalWrapper` as independent islands,
and every page island re-wraps itself in `withProviders` (its own `AuthProvider`). So a single
page has **multiple `AuthProvider` instances**. They coordinate through **module-scoped globals**
in `src/components/AuthContext.jsx` (`globalInFlight`, `globalProfileCache`) so the profile is
fetched once and shared. **Any new shared/loading state in `AuthContext` must resolve correctly
for every instance.**

**⚠️ React hooks must precede early returns.** Island components that early-return on
loading/error must declare ALL hooks first — a hooks-after-return bug crashed the story
reader in production (fixed 2026-07-18, `6b69881`).

### Project structure

```
src/
  layouts/MainLayout.astro  # HTML shell, global header/footer, mounts the shared islands
  pages/                    # FILE-BASED ROUTES (.astro). Each mounts a React island.
    index.astro                 → Home
    forum/index.astro           → Forum index
    forum/new.astro             → CreateThread
    forum/thread/[id].astro     → ThreadView          (SSR, dynamic)
    library/index.astro         → Library
    library/publish.astro       → PublishStory
    library/read/[id].astro     → ReadStory           (SSR, dynamic)
    library/series/[id].astro   → SeriesHub           (SSR, dynamic)
    profile.astro               → Profile
    my-reports.astro            → MyReports
    moderation.astro            → Moderation (the mod "Terminal")
    rules.astro / transparency.astro / u/[handle].astro / auth/callback.astro
  pages-react/              # React island bodies (one per route above)
  components/
    AuthContext.jsx         # Session + profile state, shared across islands (see ⚠️ above)
    Providers.jsx           # QueryClient + AuthProvider; exports withProviders(Component)
    RequireAuth.jsx         # Island route guard; pops sign-in via window 'open-signin' event
    UserMenu.jsx, SignInModal.jsx / SignInModalWrapper.jsx, Footer.astro
    SeriesContextBar.jsx, SeriesSidebar.jsx          # Story Series in-story navigation
    Transcribe{Button,Modal}.jsx, MarkdownEditor.jsx, ReportModal.jsx, ... + mod/ subcomponents
  lib/
    moderation.js (+ .test.js)  # mod permission helpers (isMod, modCan)
    series.js (+ .test.js)      # Story Series fetch helpers (mocked-client unit tests)
    passkey.js, profile.js, modActions.js, useModBadges.js, fileParser.js, useDocumentTitle.js
  styles/global.css         # Tailwind v4 entry + @theme design tokens
  styles/fonts.css          # @font-face (self-hosted under public/fonts/)
  supabaseClient.js         # Supabase client singleton (may be null if unconfigured — guard it)
tests/                      # Playwright E2E (chromium), 9 specs / 47 tests. Mocks in tests/mocks.js
supabase/migrations/        # Consolidated baseline + incremental migrations
supabase/functions/         # 4 WebAuthn Edge Functions
workers/transcribe/         # Cloudflare Worker: Whisper audio transcription
```

---

## Design system

**Dark "1980s paperback" typographic theme** — black/charcoal background, crimson accent,
bone text. Tokens are Tailwind v4 `@theme` variables in `src/styles/global.css`:

| Token | Value |
|---|---|
| `--color-bg-primary` | `#121212` |
| `--color-bg-surface` | `#1a1a1a` |
| `--color-text-primary` | `#E5E1D8` (bone) |
| `--color-text-secondary` | `#A3A39C` |
| `--color-accent-crimson` | `#991B1B` |
| body font | Merriweather (serif) |
| heading font (`h1`–`h4`) | Cinzel (serif) |

Use Tailwind utilities + the CSS-variable tokens (e.g. `text-[var(--color-accent-crimson)]`,
`.vintage-card`, `.prose-book`, `main.shell`). No CSS modules, no inline-style blocks for new
work (the Series components currently use inline styles — flagged for token migration).
Crimson fails WCAG contrast at small text sizes — use it for hovers/borders/large display only.

---

## Infrastructure

**Supabase project:** `bmvvugrfnuedjlucmlbw` (CLI linked; all migrations applied remotely;
4 Edge Functions deployed; secrets `WEBAUTHN_RP_ID=horrorwriter.org`, `WEBAUTHN_ORIGIN` set).

**Cloudflare Worker `horrorwriter`** — serves `horrorwriter.org` + `www`.
- Account ID: `e61bdda6d2e023366f97a9bf015c6334`
- **Deploy: push to `main`.** Workers Builds runs `npm run build` then
  `npx wrangler deploy --config dist/server/wrangler.json`.
- Root `wrangler.toml` intentionally has **no `main` or `[assets]`** — the Cloudflare Vite
  plugin validates `main` at build start (before `dist/` exists) and would error.
- **`VITE_*` build vars** are set in Workers Builds → Settings → Build → Variables (NOT
  runtime `[vars]`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable — safe to
  commit), `VITE_TRANSCRIBE_URL`, `VITE_ENABLE_GOOGLE_LOGIN`. Local `.env.local` (gitignored)
  holds these for `npm run dev`.
- `public/_headers` carries CSP + `Permissions-Policy` (microphone must stay `(self)` — the
  Dictate feature needs it; `microphone=()` silently kills recording in production).

**Cloudflare Worker `horrorwriter-transcribe`** — `POST /transcribe`, `multipart/form-data`
field `audio`, max 4 MB, Workers AI `@cf/openai/whisper`. Deploy manually:
`cd workers/transcribe && npx wrangler deploy` (NOT auto-deployed).

**Supabase Auth redirect URLs:** `https://horrorwriter.org/auth/callback`,
`https://www.horrorwriter.org/auth/callback`, `https://horrorwriter.pages.dev/auth/callback`.

---

## Commands

```powershell
npm run dev          # astro dev — http://localhost:5173
npm run build        # astro build → dist/ (Cloudflare adapter)
npm run test:unit    # vitest run — src/lib/*.test.js (13 tests)
npx playwright test  # E2E (47 tests). On Windows prefix with `cmd /c`, OR use the Bash tool.

# Release: git push (Workers Builds auto-deploys)
# Transcribe Worker: cd workers/transcribe; npx wrangler deploy
```

---

## Testing

- **Unit (`vitest`):** `moderation.test.js` (9) + `series.test.js` (4, mocked Supabase client).
- **E2E (`@playwright/test`, chromium):** 9 spec files / **47 tests**. Playwright starts the
  Astro dev server itself; Supabase REST + WebAuthn + Auth are mocked in `tests/mocks.js`;
  auth injected via `setupMockAuth` (localStorage session). `PLAYWRIGHT_TEST=true` makes SSR
  pages skip live DB fetches. `expect` timeout raised to 15s (dev server JIT-compiles routes).
- **Windows gotcha:** PowerShell blocks `npx.ps1` — run E2E via `cmd /c npx playwright test`
  or the agent Bash tool.
- `playwright.config.js` sets `ASTRO_DEV_BACKGROUND=0` in `webServer.env` (Astro 7 otherwise
  backgrounds `astro dev` for AI-agent terminals, detaching it from Playwright) — keep it.

---

## Database tables

| Table | Purpose | RLS |
|---|---|---|
| `profiles` | User profiles (handle, bio, avatar, mod fields) | owner write, public read |
| `passkey_credentials` / `webauthn_challenges` | WebAuthn | owner only / service role |
| `books` | Story library (incl. `series_teaser`) | owner write, public read |
| `categories` / `threads` / `posts` | Forum | owner write, public read |
| `book_comments` | Story critiques | owner write, public read |
| `series` / `series_books` | Story Series (curated multi-story runs) | public read; owner-only write (series AND book ownership checked) |
| `reports` / `mod_actions` / `notifications` / `mod_role_badges` / `filter_rules` | Moderation + notifications | see migrations |

**Moderation model:** `profiles.mod_role` (`sentinel|moderator|warden|keeper`) + `mod_scope`
(`all|forum|library`) + standing flags. Content tables carry `mod_status`
(`live|screening|hidden`); RLS enforces via SQL helpers `mod_can()` / `content_visible()`;
client gating via `src/lib/moderation.js`. Insert rate limiting via `enforce_rate_limit()`
trigger. `posts` is on the Realtime publication.

---

## Known constraints

- **Islands don't share React context** — coordinate through module-scoped globals in
  `AuthContext.jsx`; every `AuthProvider` instance must resolve its own loading state.
- **Cross-island events must survive the hydration gap** — persist a flag (see
  `window.__signinPending` in `MainLayout.astro`), never rely on catching a live CustomEvent.
- **Hooks before early returns** in island components (see ⚠️ under Architecture).
- **Astro 7 ↔ Vite 8:** root `package.json` `overrides` pins `vite ^8` — don't let npm downgrade.
- **`supabase` client may be null** (unconfigured env) — guard before querying.
- **`gh` CLI not authenticated** — open PRs via the GitHub web compare URL until `gh auth login`.
- **Cloudflare MCP token** is read at session start; restart the session after rotating.
- **If "Supabase not configured" returns in prod,** check Workers Builds → Settings → Build →
  Variables for the `VITE_*` set.

---

## Current roadmap

See the vault note for full context and history. As of **2026-07-18**:

1. **Story Series — finish it** (feature is live but incomplete):
   - E2E tests for the hub + in-story navigation (plan Tasks 7–8:
     `docs/superpowers/plans/2026-07-06-series-page-implementation.md`), incl. series
     handlers in `tests/mocks.js`.
   - Responsive refinement + migrate the Series components' inline styles to design tokens
     (plan Task 9).
   - **Writer-side series creation/assignment UI** — there is currently NO way for a writer
     to create a series or add stories to one (`PublishStory.jsx` has no series UI). Readers
     can only see the one hand-made series row.
2. **P1 — Manual verification on a real device (Jeff):** passkey/Google/magic-link sign-in on
   production, record + transcribe (now that `microphone=(self)` is deployed), post a reply,
   publish a story.
3. **P4 — Island error boundary** in `Providers.jsx` (on-theme fallback instead of blank panel).
4. **P6 — CSP hardening:** move inline scripts to nonces/hashes to drop `'unsafe-inline'`.
5. **P9 — Final trims:** delete the dormant Cloudflare Pages project `horrorwriter`;
   `gh auth login`.
