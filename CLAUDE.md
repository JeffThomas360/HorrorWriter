# HorrorWriter — CLAUDE.md

A horror writing community at **horrorwriter.org**. **Astro 7** site (React islands) on
Cloudflare Workers, Supabase backend.

> **2026-06-16 — migrated off the React+Vite SPA to Astro.** Routing is now file-based Astro
> pages with React islands; the design system was reskinned from the old VHS/HUD look to a dark
> "1980s paperback" typographic theme. The full E2E + unit suites pass.
>
> **2026-06-30 — Cloudflare Workers cutover complete.** `horrorwriter.org` + `www` serve from the
> `horrorwriter` Worker; deploy is push-to-`main` (Workers Builds). The old Pages project is dormant.
>
> **2026-07-04 — upgraded Astro 6 → 7 (Vite 7 → 8, adapter 13 → 14, react-integration 5 → 6).**
> Motivated by `npm audit`: Astro 6 could not reach 0 vulnerabilities without breaking (`--force`)
> changes; Astro 7 + a non-breaking `npm audit fix` gets there. The bump surfaced a latent
> cross-island sign-in-modal hydration race, fixed in the same change (see the constraint note under
> Known constraints). Full E2E 46/46, unit 9/9, `npm audit` 0.

---

## 📚 Project Documentation Link

**Primary documentation, planning, and task tracking for this project are maintained in your Obsidian vault.**

- **Vault path:** `D:\CLAUDECODE\Vault\02_Projects\horrorwriter\project-overview.md`
- **Contents:** Project setup, tech stack, main files, development goals (P1–P10 roadmap), known constraints, and resume checklist
- **When to use:** Check the vault note for architecture overview, current checkpoint (2026-07-04), and upcoming priorities before starting work

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
| Node | 22 (pinned in `.nvmrc`; Astro 7 requires ≥20.19 / ≥22.12) |

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
| heading font (`h1`–`h4`) | Cinzel (serif) |

Use Tailwind utilities + the CSS-variable tokens (e.g. `text-[var(--color-accent-crimson)]`,
`.vintage-card`, `.prose-book`, `main.shell`). No CSS modules. The old VHS/Stranger-Things HUD
design system (scanlines, green REC dot, `--blood`/`--cyan`) has been **removed** — but Cinzel
survived the reskin and is still the active heading font (`global.css:38-45`), not a leftover.

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
- **Cross-island event coordination must survive the hydration gap.** Independent islands hydrate
  in an unguaranteed order, so a *transient* `window` CustomEvent dispatched by one island can be
  missed by another that hasn't attached its listener yet. This bit the sign-in modal on the Astro 7
  upgrade: the Sign In button (`UserMenu`) dispatches `open-signin`, the modal (`SignInModalWrapper`)
  listens for it — under Astro 7's timing the event fired first and the modal never opened. Fix:
  `MainLayout.astro`'s early inline `<script>` (runs before islands hydrate) records the request on
  `window.__signinPending`, and the wrapper *replays* that flag on mount (clearing on close). Any new
  cross-island signal must do the same — persist a flag, don't rely on catching a live event.
- **Astro 7 ↔ Vite 8:** Astro 7 uses Vite 8. The root `package.json` `overrides` pins
  `vite ^8` — do not let npm downgrade it.
- **Windows E2E:** use `cmd /c npx playwright test` or the Bash tool (PowerShell blocks `npx.ps1`).
- **Astro 7 backgrounds `astro dev` for AI-agent terminals**, which detaches the process from
  Playwright's `webServer`. `playwright.config.js` sets `ASTRO_DEV_BACKGROUND=0` in `webServer.env`
  to force foreground — keep it.
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

### ⏸ CHECKPOINT — 2026-07-04 (resume here)

**Where the session stopped (pin):** mid-execution of the **transcribe "Dictate" redesign** plan
(`docs/superpowers/plans/2026-07-04-transcribe-flow-redesign.md`, spec in
`docs/superpowers/specs/2026-07-04-transcribe-flow-redesign-design.md`), being run
subagent-driven with a progress ledger at `.superpowers/sdd/progress.md` — **read that ledger
first when resuming.**

- **Task 1 (Dictate button)** — done, reviewed clean (`129eaf6`).
- **Task 2 (modal rebuild)** — committed (`2ccce4f`, `ba85961`) but **NOT green and NOT reviewed**:
  the implementer agent was stopped at session end; controller-verified state is
  `tests/transcribe.spec.js` **6 passed / 1 FAILED** — "Record path: record, review the transcript,
  add to the story" (line 38). Diagnose (fake-media flags in `playwright.config.js` vs the
  record→transcribe wiring in `TranscribeModal.jsx`), fix to green, run the task-review gate, then
  Task 3.
- **Task 3 (error hardening + sweep)** — not started.

**Also done this session (2026-07-04), all committed on `main` but UNPUSHED (deliberate hold —
push ships everything via Workers Build):**
- **Dead-CSS reskin (complete):** `ReportModal`, `ShareBar`, and all 8 `mod/` components (incl.
  `InlineModControls`, found beyond the original list) rebuilt from the removed VHS design system
  to the paperback theme (`6e7d506`, `6cdad57`, `6bcb7cc`). Full suite green at that point;
  mod-terminal tabs screenshot-verified. Test-hook classes (`form-err`, `form-ok`, `mod-user-row`,
  `mod-badge`, `modal-content`) deliberately preserved.
- Transcribe spec + plan docs (`50da994`, `72e3318`, `a1e7fd9`).

**Earlier same day, already live in production:** Astro 7 migration (see the migration note below),
Phase 3/4 audit fixes, reply-count DB trigger (applied to remote Supabase), footer-gap fix.

**P1 manual auth verification remains open** (needs Jeff on a real device) — it was started this
session and got as far as the transcribe UX complaint that spawned the Dictate redesign.

---

### Previous checkpoint — 2026-07-03

**Session summary:** ran a full frontend UX/accessibility audit (screenshots + contrast math + source citations, no fabricated findings) and worked through it in phases. Phases 1 and 2 shipped and are live; Phases 3 and 4 are scoped but not started. Two pushes today: `5ddad93` (Phase 1) and `ae66705` (Phase 2), both built and deployed clean via Workers Builds.

**Phase 1 — done, live (`5ddad93`):**
- Swapped crimson-as-text (handles/timestamps/eyebrows/tags) to `text-secondary`/`text-primary` sitewide — crimson at small sizes measured ~2.16:1 contrast, fails WCAG AA (4.5:1). Kept crimson for hovers, borders, and large display type.
- Raised every `text-[8px]/[9px]/[10px]/[11px]` (~65 instances, 18 files) to a 12px floor; bumped forum post/reply body text from 14px to match the Library's existing `.prose-book` 18px reading size.
- Fixed the mobile nav hamburger's tap target: 32×32px → 44×44px (`MainLayout.astro`, Apple HIG/Material minimum).
- "TRENDING" badge converted to solid crimson fill + white text (kept the emphasis, fixed the contrast).
- **Retracted one finding after the fact:** an "off-palette blue" mobile-nav color report turned out to be ClearType/subpixel rendering fringing in the screenshot, not a real CSS bug — confirmed via pixel-level PNG decode + `getComputedStyle` (both showed the correct bone `#E5E1D8`). Left the retraction in the audit record instead of quietly deleting it.

**Phase 2 — done, live (`ae66705`):**
- Sign-in modal button hierarchy now matches the documented auth strategy (lead with passkey/Google, magic-link as fallback): Passkey is the solid/primary button, Google is secondary (outlined), magic-link demoted to a plain text link ("Email me a magic link instead") below the email field. Updated `tests/auth.spec.js` to match the new copy.
- Removed the home page's stat grid (1 writer / 1 story / 2 threads sitting directly under a "Founded 1986" framing, undercutting it) per Jeff's call — hid the numbers rather than reframing them. Also deleted the now-dead Supabase count queries (`profiles`/`books`/`threads` head-counts) that only fed that grid.

**Phase 3 — all 3 fixed, locally (not yet pushed to `main`):**
- [x] Thread "N replies" count could go stale when a reply was later hidden/screened — `handle_new_post` incremented `replies_count` unconditionally at insert, with nothing to decrement it on a `mod_status` transition. Fixed via a new `AFTER UPDATE` trigger on `posts` (`supabase/migrations/20260704000000_fix_replies_count_on_mod_status.sql`) that adjusts the counter when a non-OP post's `mod_status` crosses in/out of `live`. **Applied to the remote project** (`bmvvugrfnuedjlucmlbw`) via Supabase MCP on 2026-07-04; `get_advisors` confirmed no new security findings.
- [x] `ReadStory` was firing a real Supabase 400 on `series_books`/`series` queries. **Correction (2026-07-04, caught via Supabase MCP before the reply-count migration was pushed): the initial diagnosis that these tables were "never deployed" was WRONG.** `series`/`series_books` are live on the remote project with reasonable RLS and even 1 real row of data (one series linking one book). The actual bug was narrower: the deleted `ReadStory.jsx` query ordered `series_books` by `.order('created_at', ...)`, but `series_books` has no `created_at` column (only `series_id`, `book_id`, `sort_order`) — that's what threw the 400, not a missing table. Decision (Jeff, 2026-07-04): leave the frontend deletion in place rather than patch the one-line bug, since the old UI was an untested prototype anyway — Story Series will be rebuilt properly under **P10** below, reusing the existing schema/data/RLS as a starting point rather than redesigning from scratch. Frontend deletion itself (removed dead queries/UI from `ReadStory.jsx`/`PublishStory.jsx`) still verified clean: build + unit tests + full `library.spec.js`/`forum.spec.js` E2E all green.
- [x] Mobile Forum gap. **Correction (2026-07-04, verified live in a rendered browser, not just source reading): the original hypothesis (a Forum-grid mobile stacking bug in `Forum.jsx:215`) was WRONG** — at 390px the `.forum-grid` correctly collapses to a single column (confirmed via computed styles: `grid-template-columns: 342px`, sidebar and thread list stack with normal 32px gaps). The real cause was **global, not Forum-specific**: `main.shell` (`global.css:24-28`) had `padding-bottom: 6rem` (96px) stacking with `Footer.astro`'s own `mt-20` (80px) — 176px of compounding empty space between content and footer on every page, just most visible on Forum because the seed data's thread list is short. Fixed by dropping `main.shell`'s padding to `2rem 1.5rem` (no explicit bottom value) and leaving the footer's `mt-20` as the sole separator — confirmed via computed styles that the gap dropped to a consistent 80px (footer's intentional spacing) on both Forum and Home, mobile and desktop. Full 45-test E2E suite green after the change.

**Phase 4 — done:**
- [x] De-duplicated `src/styles/fonts.css` — collapsed repeated identical `@font-face` blocks (Cinzel 400/700, Merriweather 300/400/700 normal + italic) down to one declaration each.
- [x] Corrected this file's **Design system** section above — it wrongly listed Cinzel as removed with the old VHS theme; it's still the active `h1`–`h4` heading font (`global.css:38-45`), now documented as such.

**GitHub hardened (same session):** branch protection on `main` (blocks force-push/deletion, direct pushes still work — no required PR review), Dependabot alerts + security updates enabled. No leaked secrets anywhere in tracked files or git history.

**Astro 6→7 migration — DONE and landed on `main` (2026-07-04, commit `7333933`).** The earlier
"33/45 fail, session not picked up, root cause unknown" note was **stale** — it came from a first
worktree cut off an *older* `main`. Redone as a fresh bump on current `main`: the real failure was
only **3 tests, all the sign-in modal** (mock-session detection works fine). Root cause was a
**cross-island hydration race**, not an auth bug — see the constraint note under Known constraints.
Fixed via the `window.__signinPending` replay pattern + a deterministic regression test. Path to 0
vulns is **Astro 7 THEN a non-breaking `npm audit fix`** (Astro 6 needed `--force`/breaking to get
there, which is why the migration was worth doing). Verified before landing: full E2E 46/46 (run 4×,
no flakiness), unit 9/9, build clean, `npm audit` 0, `dist/server/wrangler.json` emits correctly
under adapter 14. The stale first worktree (`astro-7-migration` / branch `worktree-astro-7-migration`)
is superseded and can be deleted.

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

**P8 — Dependency hygiene** *(DONE 2026-07-04)*
- [x] Resolved via the Astro 6→7 migration + a non-breaking `npm audit fix` (see the migration note
      above). `npm audit` is now **0 vulnerabilities** (full, not just `--omit=dev`). Astro 6 could
      not reach 0 without `--force`/breaking changes, which is what forced the migration.

**P9 — Final trims** *(S, low)*
- [ ] Remove vestigial `VITE_TURNSTILE_SITE_KEY` from `wrangler.toml` (no Turnstile code exists)
- [ ] Delete `scratch/` debug scripts (gitignored already, but tidy up)
- [ ] `gh auth login` so PRs can be opened from the CLI
- [ ] Delete 7 orphaned legacy SPA components: `Layout.jsx`, `Nav.jsx`, `Footer.jsx`,
      `Atmospherics.jsx`, `MobileBottomNav.jsx`, `OnboardingBanner.jsx`, `FloatingAction.jsx`
      — nothing imports them; then drop `react-router-dom` from `package.json`
- [ ] Delete dormant Cloudflare Pages project `horrorwriter` (now that Worker owns the domains)
- Done when: no dead code/config/flags remain and docs match reality.

**P10 — Story Series (new feature, real writer request)** *(M, schema+RLS already exist — verified 2026-07-04)*
- Goal: let writers create and curate their own multi-story series, so readers can find and follow
  a series that runs longer than a single story (e.g. a "next part" link, a series index page).
- **The schema is already live on the remote project** (`bmvvugrfnuedjlucmlbw`) from a prior
  half-built attempt (`supabase/migrations/20260610040000_phase9_features.sql`), confirmed via the
  Supabase MCP on 2026-07-04 — do NOT recreate these tables, build on top of them:
  - `series(id, author_id, title, description, created_at)` — RLS: public read, author-only
    write/update/delete.
  - `series_books(series_id, book_id, sort_order)` — RLS: public read; write policy checks
    `auth.uid() = series.author_id` for the target series.
  - There is 1 real live row today (one series with one book assigned) — don't blow it away with a
    destructive migration.
- **Frontend UI for this was deleted 2026-07-04** (see Phase 3 above) because it was firing a
  Supabase 400 — but the root cause was a single bad query, not a schema problem: it ordered
  `series_books` by `.order('created_at', ...)`, and `series_books` has **no `created_at` column**
  (only `series_id`/`book_id`/`sort_order` — order by `sort_order` instead). The deleted UI in
  `ReadStory.jsx` (Series Navigator block) and `PublishStory.jsx` (series dropdown + creation) is a
  reasonable starting point to resurrect via `git show 60df9df~1:src/pages-react/ReadStory.jsx` etc.,
  once the ordering bug is fixed.
- **Known gap to fix before shipping:** the `series_books` write RLS policy only checks that the
  caller owns the *series* (`auth.uid() = series.author_id`) — it never checks that the caller also
  owns the *book* being added. As written, an author could add someone else's story into their own
  series. Add a `book_id`-ownership check to the policy (or a trigger) before this goes live.
- [ ] Fix the `series_books` RLS ownership gap above
- [ ] Resurrect/rebuild series creation+assignment in `PublishStory.jsx` (order by `sort_order`, not `created_at`)
- [ ] Resurrect/rebuild the series navigator UI in `ReadStory.jsx`
- [ ] Add a series index/browse view so readers can discover a series, not just navigate next/prev
- Done when: a writer can create a series, assign stories to it (only their own), and a reader can
  browse and navigate through it end to end.
