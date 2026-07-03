# HorrorWriter — CLAUDE.md

A horror writing community at **horrorwriter.org**. **Astro 6** site (React islands) on
Cloudflare Pages, Supabase backend.

> **2026-06-16 — migrated off the React+Vite SPA to Astro.** Routing is now file-based Astro
> pages with React islands; the design system was reskinned from the old VHS/HUD look to a dark
> "1980s paperback" typographic theme. The full E2E + unit suites pass.
>
> **2026-06-17 — mid-migration to Cloudflare Workers (paused). ⚠️ DO NOT push to `main` yet — see
> Next Priorities / SAVEPOINT below.**

---

## Stack

| Layer | Tech |
|---|---|
| Framework | **Astro 6** (`@astrojs/cloudflare` adapter — static prerender + SSR) |
| UI | **React 19 islands** (`@astrojs/react`, `client:load`) |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`, `@theme` tokens in `src/styles/global.css`) |
| Data fetching | `@tanstack/react-query` (in islands) |
| Auth | Supabase magic-link + WebAuthn passkeys + Google OAuth (flagged) |
| Database | Supabase Postgres (Row Level Security on all tables) |
| Storage | Supabase Storage (avatars bucket, per-user RLS) |
| Edge Functions | Supabase Deno functions (WebAuthn ceremonies) |
| Deploy | Cloudflare Workers (migration from Pages in progress — see SAVEPOINT) |
| Node | 22 (pinned in `.nvmrc`; Astro 6 requires ≥22.12) |

**Notes**
- `react-router-dom` is still a dependency and imported by a few **orphaned** legacy SPA
  components (`Layout.jsx`, `Nav.jsx`, `Footer.jsx`, `Atmospherics.jsx`, `MobileBottomNav.jsx`,
  `OnboardingBanner.jsx`, `FloatingAction.jsx`). Nothing wires them up anymore — routing is
  file-based Astro. They can be deleted; `react-router-dom` is vestigial.
- Markdown editing/preview via `react-markdown` + `remark-gfm` + `turndown`; `.docx` import via
  `mammoth`; toasts via `sonner`; animation via `framer-motion`.

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
for every instance** — a coalescing branch that forgot to clear its own `isLoading` is exactly
what caused the "stuck on ▸ Loading…" bug fixed on 2026-06-16.

### Project structure

```
src/
  layouts/
    MainLayout.astro      # HTML shell, global header/footer, mounts the shared islands
  pages/                  # FILE-BASED ROUTES (.astro). Each mounts a React island.
    index.astro                 → Home
    forum/index.astro           → Forum index
    forum/new.astro             → CreateThread
    forum/thread/[id].astro     → ThreadView          (SSR, dynamic)
    library/index.astro         → Library
    library/publish.astro       → PublishStory
    library/read/[id].astro     → ReadStory           (SSR, dynamic)
    profile.astro               → Profile
    my-reports.astro            → MyReports
    moderation.astro            → Moderation (the mod "Terminal")
    rules.astro                 → Rules
    transparency.astro          → TransparencyLog      (SSR, dynamic)
    u/[handle].astro            → UserProfile          (SSR, dynamic)
    auth/callback.astro         → AuthCallback (magic-link / OAuth redirect handler)
  pages-react/            # React island bodies (one per route above)
  components/
    AuthContext.jsx       # Session + profile state, shared across islands (see ⚠️ above)
    Providers.jsx         # QueryClient + AuthProvider; exports withProviders(Component)
    RequireAuth.jsx       # Island route guard; pops sign-in via window 'open-signin' event
    UserMenu.jsx          # Header account menu island
    SignInModal.jsx / SignInModalWrapper.jsx   # Magic-link + passkey + Google sign-in
    Footer.astro          # (Astro) site footer used by MainLayout
    ProfileHead.jsx, ModBadge.jsx, NotificationsBell.jsx, FollowButton.jsx,
    Transcribe{Button,Modal}.jsx, MarkdownEditor.jsx, ReportModal.jsx, ... + mod/ subcomponents
  lib/
    moderation.js + moderation.test.js   # mod permission helpers (isMod, modCan) + UNIT TESTS
    passkey.js            # WebAuthn client (register + authenticate)
    profile.js            # Profile fetch/update helpers
    modActions.js, useModBadges.js, fileParser.js, useDocumentTitle.js
  styles/
    global.css            # Tailwind v4 entry + @theme design tokens + base typesetting
    fonts.css             # @font-face (self-hosted under public/fonts/)
  supabaseClient.js       # Supabase client singleton
tests/                    # Playwright E2E (chromium). Mocks in tests/mocks.js
  auth.spec.js  forum.spec.js  library.spec.js  moderation.spec.js
  profile.spec.js  rules.spec.js  transcribe.spec.js
supabase/
  migrations/             # ONE consolidated baseline (clean-reset, 2026-06-08)
  functions/              # 4 WebAuthn Edge Functions
workers/transcribe/       # Cloudflare Worker: Whisper audio transcription
```

---

## Design system

**Dark "1980s paperback" typographic theme** — black/charcoal background, crimson accent,
bone text, serif body (Merriweather). Tokens are Tailwind v4 `@theme` variables in
`src/styles/global.css`:

| Token | Value |
|---|---|
| `--color-bg-primary` | `#121212` |
| `--color-bg-surface` | `#1a1a1a` |
| `--color-text-primary` | `#E5E1D8` (bone) |
| `--color-text-secondary` | `#A3A39C` |
| `--color-accent-crimson` | `#991B1B` |
| body font | Merriweather (serif) |

Use Tailwind utilities + the CSS-variable tokens (e.g. `text-[var(--color-accent-crimson)]`,
`.vintage-card`, `.prose-book`, `main.shell`). No CSS modules. The old VHS/Stranger-Things HUD
design system (scanlines, green REC dot, `--blood`/`--cyan`/Cinzel) has been **removed**.

---

## Infrastructure

**Supabase project:** `bmvvugrfnuedjlucmlbw`
- CLI linked: `supabase link --project-ref bmvvugrfnuedjlucmlbw`
- All migrations applied to remote; all 4 Edge Functions deployed
- Edge Function secrets set: `WEBAUTHN_RP_ID=horrorwriter.org`, `WEBAUTHN_ORIGIN`,
  `SUPABASE_SERVICE_ROLE_KEY` (auto-injected)

**Cloudflare Worker: `horrorwriter`** *(migrated from Pages 2026-06-30)*
- Live at: `horrorwriter.org`, `www.horrorwriter.org`
- Account ID: `e61bdda6d2e023366f97a9bf015c6334`
- **Deploy: push to `main`.** Workers Builds Git integration auto-builds and deploys.
  - Build command: `npm run build`
  - Deploy command: `npx wrangler deploy --config dist/server/wrangler.json`
  - Root `wrangler.toml` intentionally has **no `main` or `[assets]`** — the Cloudflare Vite
    plugin validates `main` at build start (before `dist/` exists) and would error. The generated
    `dist/server/wrangler.json` has the correct paths and is used by the deploy command.
- **`VITE_*` build vars** are set in Workers Builds → Settings → Build → Variables and secrets
  (NOT in `wrangler.toml [vars]`, which are runtime-only). Required set:
  - `VITE_SUPABASE_URL` = `https://bmvvugrfnuedjlucmlbw.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = `sb_publishable_...` (Supabase publishable key — safe to commit)
  - `VITE_TRANSCRIBE_URL` = `https://horrorwriter-transcribe.orig-beetlebub.workers.dev`
  - `VITE_ENABLE_GOOGLE_LOGIN` = `true`
  - Local `.env.local` (gitignored) holds these for `npm run dev`.
- Pages project `horrorwriter` still exists but has auto-deploy disabled and no custom domains.
  It can be deleted once confident in the Workers setup.

**Turnstile is vestigial.** Supabase Auth CAPTCHA is commented out in `supabase/config.toml` and
the app has no Turnstile/captcha code. If re-enabled: the **site** key goes in `wrangler.toml
[vars]`; the **secret** key goes in Supabase Auth (Authentication → CAPTCHA), NEVER in a `VITE_*` var.

**Cloudflare Worker: `horrorwriter-transcribe`**
- Live at: `https://horrorwriter-transcribe.orig-beetlebub.workers.dev`
- Deploy: `cd workers/transcribe && npx wrangler deploy` (separate from Pages — NOT auto-deployed)
- Uses Workers AI binding (`env.AI`) — `@cf/openai/whisper`. `POST /transcribe`,
  `multipart/form-data` field `audio`, max 4 MB.

**Supabase Auth redirect URLs configured:**
`https://horrorwriter.org/auth/callback`, `https://www.horrorwriter.org/auth/callback`,
`https://horrorwriter.pages.dev/auth/callback`

---

## Commands

```powershell
npm run dev          # astro dev — local server on http://localhost:5173
npm run build        # astro build — production build to dist/ (Cloudflare adapter)
npm run preview      # astro preview
npm run test:unit    # vitest run — unit tests (src/lib/*.test.js)
npx playwright test  # E2E (chromium). On Windows prefix with `cmd /c`, OR use the Bash tool.
```

### Deploy workflow

```powershell
# Normal release: just push. Cloudflare rebuilds Pages on push to main.
git add . ; git commit -m "..." ; git push

# Change a build/runtime env var: edit the [vars] block in the root wrangler.toml, then push.
# (Do NOT set it in the Cloudflare dashboard — it gets wiped on every deploy.)

# Force a rebuild WITHOUT a code change (Cloudflare API):
$h = @{ Authorization = "Bearer $env:CLOUDFLARE_API_TOKEN" }
$acct = "e61bdda6d2e023366f97a9bf015c6334"
Invoke-RestMethod -Method POST -Headers $h `
  -Uri "https://api.cloudflare.com/client/v4/accounts/$acct/pages/projects/horrorwriter/deployments"

# Verify a deploy baked the vars in — fetch the live bundle and grep it:
#   $html = (Invoke-WebRequest "https://horrorwriter.org/" -UseBasicParsing).Content
#   $js   = [regex]::Match($html, '/_astro/[^"'']+\.js').Value
#   (Invoke-WebRequest "https://horrorwriter.org$js" -UseBasicParsing).Content -match 'bmvvugrfnuedjlucmlbw'

# Transcribe Worker (separate from Pages — deploy manually):
cd workers/transcribe; npx wrangler deploy
```

---

## Testing

- **Unit (`vitest`):** `src/lib/moderation.test.js` (9 tests — `isMod` / `modCan` permission logic).
  Run with `npm run test:unit`.
- **E2E (`@playwright/test`, chromium):** 7 spec files / **34 tests** in `tests/`. Playwright starts
  the Astro dev server itself (`webServer` in `playwright.config.js`). Supabase REST + WebAuthn +
  Auth are mocked in `tests/mocks.js`; auth is injected via `setupMockAuth` (writes a session to
  `localStorage`). The webServer runs with `PLAYWRIGHT_TEST=true` so SSR pages skip live DB fetches.
- `expect` timeout is raised to **15s** in `playwright.config.js` — Astro's dev server compiles
  routes + islands JIT on first hit, which can exceed the 5s default for a cold route.
- **Windows gotcha:** PowerShell blocks the local `npm.ps1`/`npx.ps1` shims (execution policy), so
  run E2E via `cmd /c npx playwright test` **or** through the agent Bash tool (git-bash), which runs
  `npx` directly.

---

## Database tables

| Table | Purpose | RLS |
|---|---|---|
| `profiles` | User profiles (handle, bio, avatar, location, mod fields) | owner write, public read |
| `passkey_credentials` | WebAuthn credential store | owner only |
| `webauthn_challenges` | Ephemeral challenge store | service role |
| `books` | Story library | owner write, public read |
| `categories` | Forum categories (pre-seeded) | public read |
| `threads` | Forum threads | owner write, public read |
| `posts` | Forum replies | owner write, public read |
| `book_comments` | Story critiques / responses | owner write, public read |
| `reports` | User reports (content/user/site/appeal) | reporter + mods |
| `mod_actions` | Append-only moderation audit log | warden+ read |
| `notifications` | Closed-loop user notifications | owner read; definer-only insert |
| `mod_role_badges` | Role→emoji/label map (Keeper-editable) | public read, keeper write |
| `filter_rules` | Submission auto-filter rules | keeper only |

Storage bucket: `avatars` — per-user folder, owner RLS.

**Moderation model:** `profiles` carries `mod_role` (`sentinel|moderator|warden|keeper`) +
`mod_scope` (`all|forum|library`) plus standing flags (`requires_screening`, `is_shadowbanned`,
`banned_until`, `ban_reason`). Content tables (`books`/`threads`/`posts`/`book_comments`) carry a
single `mod_status` (`live|screening|hidden`). Visibility/permissions are enforced in RLS via SQL
helpers `mod_can(action, area)` and `content_visible(status, author, area)`; client-side gating
uses `src/lib/moderation.js` (`isMod`, `modCan`). The `/moderation` "Terminal" surfaces tabs
(Reports, Support, AutoMod, Sanctions, Registry, Badges) gated by role; it **defaults to the
Reports tab**. Insert rate limiting is enforced DB-side via the `enforce_rate_limit()` trigger.
`posts` is on the Realtime publication for live thread updates.

---

## What's real

Everything queries Supabase directly (no mock data files). Magic-link, passkey (WebAuthn Edge
Functions), Google OAuth (flagged via `VITE_ENABLE_GOOGLE_LOGIN`), profile edit + avatar upload,
public profiles by handle, forum (browse/create/reply), library (browse/publish/read/critique),
realtime presence lobby on Home, and audio transcription (CF Worker + Workers AI Whisper) are all
live on real data. **Removed:** Rituals / writing prompts, Turnstile CAPTCHA, and the old mock
`src/data/` files.

---

## Known constraints

- **Astro islands don't share React context** — see the ⚠️ under Architecture. Coordinate
  cross-island state through the module-scoped globals in `AuthContext.jsx`, and make sure every
  `AuthProvider` instance resolves its own loading/error state.
- **Astro 6 ↔ Vite 7:** Astro 6 uses Vite 7. The root `package.json` `overrides` pins
  `vite ^7` — do not let npm hoist Vite 8.
- **Windows E2E:** use `cmd /c npx playwright test` or the Bash tool (PowerShell blocks `npx.ps1`).
- **`gh` CLI not authenticated:** opening PRs from here fails until `gh auth login`. Until then,
  open PRs via the GitHub web compare URL.
- **Deploy pipeline:** Workers Builds Git integration on `horrorwriter` Worker. Pages auto-deploy
  is disabled. If a build fails, check Workers Builds logs in the Cloudflare dashboard. If
  "Supabase not configured" ever returns, check Workers Builds → Settings → Build → Variables to
  confirm the `VITE_*` vars are still present.
- **Cloudflare API token / MCP:** The MCP Cloudflare plugin uses whatever token existed when the
  Claude Code session STARTED. After rotating, restart the session. A working token needs:
  Account > Cloudflare Pages Edit, Workers Scripts Edit + Zone > DNS Edit, Zone Read (for
  `horrorwriter.org`). Last working token created 2026-06-30.
- **Workers cutover complete (2026-06-30):** `horrorwriter.org` and `www.horrorwriter.org` point
  to the `horrorwriter` Worker. The old `horrorwriter.pages.dev` Pages project is dormant.

---

## Next priorities

### ⏸ CHECKPOINT — 2026-07-02 (resume here)

**Session summary:** shipped the header notifications bell (P5) and made the first cut of CSP hardening (P6 partial). Build, unit tests, and full 39-test E2E suite all green; pushed to `main` (`85b9694`) and deployed via Workers Builds.

**What was done this session:**
- **P5 complete:** `NotificationsBell.jsx` island in `MainLayout.astro` header (next to `UserMenu`) — unread badge, dropdown (click-outside/Escape close), mark-read/mark-all-read. Backed by `src/lib/notifications.js` (CRUD against the `notifications` table) + `src/lib/useNotifications.js` (React Query hooks, 60s poll — table isn't on Realtime).
- **P6 partial:** dropped `'unsafe-eval'` from CSP `script-src` in `public/_headers`; also added the transcribe Worker origin to `connect-src` (was missing, would have blocked transcription under a strict CSP). Inline-script nonce/hash work (dropping `'unsafe-inline'`) not yet done.
- Found and killed a stale `astro preview` process left running from a prior session that was locking `dist/client` and blocking builds — worth remembering if a build ever fails with `EPERM`/`resource busy` on `dist`.

---

### Roadmap (resume from P1 manual verification, then P4)

**P1 remaining — Manual auth verification** *(Jeff, on real device)*
- [ ] Sign in with passkey on production `horrorwriter.org`
- [ ] Sign in with Google; sign in via magic link
- [ ] Use audio transcription on a real recording (requires sign-in)
- [ ] Post a forum reply; publish a story
- Done when: all flows confirmed working, or bugs filed.

**P4 — Island error boundary** *(S, medium-high stability)*
- [ ] Add `ErrorBoundary` wrapping children in `src/components/Providers.jsx`; on-theme fallback ("something went wrong" + reload)
- Done when: deliberately thrown island error renders the fallback, not a blank panel.

**P6 remaining — Harden CSP** *(M, medium security)*
- [x] Test-drop `'unsafe-eval'` from `public/_headers`; confirmed build + hydration + full E2E suite still green
- [ ] Verify audio transcription still works in production now that `connect-src` includes the transcribe Worker origin (part of P1 manual verification)
- [ ] Move inline scripts to nonces/hashes to drop `'unsafe-inline'` if feasible
- Done when: CSP nonce/hash-based with no console violations.

**P7 — Improve test coverage** *(M, medium confidence)*
- [ ] Un-bypass SSR for ≥1 page (today all 34 E2E mock Supabase; SSR pages skip live DB under `PLAYWRIGHT_TEST`)
- [ ] Explicit regression test for multi-island auth-loading hang (load `/profile`, assert body resolves)
- [ ] Replace brittle CSS selectors (`.form-ok`, `h2.title`) with role/label/text selectors
- Done when: suite green with SSR + auth-loading regression covered.

**P8 — Dependency hygiene** *(S, low-medium)*
- [ ] Resolve `ws` high-severity advisory (transitive via `@supabase/supabase-js`) via `overrides` pin or version bump
- Done when: `npm audit --omit=dev` is clean.

**P9 — Final trims** *(S, low)*
- [ ] Remove vestigial `VITE_TURNSTILE_SITE_KEY` from `wrangler.toml` (no Turnstile code exists)
- [ ] Delete `scratch/` debug scripts (gitignored already, but tidy up)
- [ ] `gh auth login` so PRs can be opened from the CLI
- [ ] Delete 7 orphaned legacy SPA components: `Layout.jsx`, `Nav.jsx`, `Footer.jsx`,
      `Atmospherics.jsx`, `MobileBottomNav.jsx`, `OnboardingBanner.jsx`, `FloatingAction.jsx`
      — nothing imports them; then drop `react-router-dom` from `package.json`
- [ ] Delete dormant Cloudflare Pages project `horrorwriter` (now that Worker owns the domains)
- Done when: no dead code/config/flags remain and docs match reality.
