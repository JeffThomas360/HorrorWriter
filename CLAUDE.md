# HorrorWriter — CLAUDE.md

A horror writing community at **horrorwriter.org**. React + Vite SPA on Cloudflare Pages, Supabase backend.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, react-router-dom 7, Vite 7 |
| Auth | Supabase magic-link + WebAuthn passkeys |
| Database | Supabase Postgres (Row Level Security on all tables) |
| Storage | Supabase Storage (avatars bucket, per-user RLS) |
| Edge Functions | Supabase Deno functions (WebAuthn ceremonies) |
| Deploy | Cloudflare Pages via `wrangler pages deploy` |
| Node | 20 (pinned in `.nvmrc`) |

**Dependencies:** `@supabase/supabase-js`, `react-router-dom`, `@simplewebauthn/browser`, `@marsidev/react-turnstile`

---

## Project structure

```
src/
  App.jsx               # Router + AuthContext provider
  main.jsx              # Mounts to #root
  style.css             # All CSS (~800 lines, VHS/horror design system)
  supabaseClient.js     # Supabase client singleton
  components/
    Atmospherics.jsx    # VHS scanlines, noise, vignette overlay
    AuthContext.jsx      # Session state, fetchProfile, refreshProfile
    ErrorBoundary.jsx
    Footer.jsx
    Layout.jsx           # Nav + Footer wrapper
    Nav.jsx
    OnboardingBanner.jsx # Shows when bio is empty, hides on /profile
    ProfileHead.jsx      # Avatar + handle display component
    RequireAuth.jsx      # Route guard
    SignInModal.jsx      # Magic link + passkey sign-in
    VcrClock.jsx         # VHS HUD clock
  pages/
    AuthCallback.jsx     # Handles Supabase magic-link redirect
    CreateThread.jsx     # Forum thread creation (real Supabase)
    Forum.jsx            # Forum index (real Supabase)
    Home.jsx             # Landing page + global presence lobby (Realtime)
    Library.jsx          # Story library (real Supabase)
    Profile.jsx          # Profile editor (real Supabase)
    PublishStory.jsx     # Story publishing (real Supabase)
    ReadStory.jsx        # Story reader + critiques/book_comments (real Supabase)
    ThreadView.jsx       # Forum thread view + replies (real Supabase)
    UserProfile.jsx      # Public profile by handle (real Supabase)
  lib/
    passkey.js           # WebAuthn client (register + authenticate)
    profile.js           # Profile fetch/update helpers
    useDocumentTitle.js  # Per-route <title> hook
  # NOTE: src/data/ mock files (books.js, prompts.js, threads.js) and Rituals.jsx
  #       have been removed — every page now queries Supabase directly.
tests/                   # Playwright E2E (chromium); mocks in tests/mocks.js
  auth.spec.js  forum.spec.js  library.spec.js  profile.spec.js
supabase/
  migrations/            # Applied to remote via `supabase db push`
    20240428000000_init_profiles.sql
    20240428000002_profile_extras.sql    # location, pronouns, website, avatar
    20240428000004_storage_avatars.sql   # storage bucket + RLS
    20240514000000_library_schema.sql    # books table
    20240514000001_forum_schema.sql      # categories, threads tables
    20240520000000_content_schemas.sql   # posts table, content col on books
    20260519000000_passkeys.sql          # passkey_credentials, webauthn_challenges
    20260520034702_add_type_to_webauthn_challenges.sql
    20260520034846_add_type_to_webauthn_challenges.sql
    20260523000000_fix_replies_count.sql           # OP no longer counted as a reply
    20260523000001_create_missing_posts_table.sql  # ensures posts table + books.content
    20260523000002_rate_limiting.sql               # enforce_rate_limit() trigger fn
    20260527000000_enable_realtime_posts.sql       # Realtime publication for posts
    20260527000001_book_comments.sql               # book_comments (story critiques)
  functions/
    webauthn-register-begin/
    webauthn-register-complete/
    webauthn-authenticate-begin/
    webauthn-authenticate-complete/
public/
  favicon.svg            # Custom nib + blood inkpot icon
```

---

## Design system

**VHS / Stranger Things Control Deck aesthetic** — scanlines, noise, vignette, green HUD with blinking REC dot.

| Token | Value |
|---|---|
| `--blood` | `#ff1f3a` |
| `--cyan` | `#4cd5ff` |
| `--gold` | `#d3a24a` |
| `--bone` | `#f3ecd9` |
| `--ink` | near-black |
| `--display` | Cinzel (serif headings) |
| body font | EB Garamond |
| mono | VT323 |

All CSS lives in `src/style.css`. No CSS modules, no Tailwind.

---

## Infrastructure

**Supabase project:** `bmvvugrfnuedjlucmlbw`
- CLI linked: `supabase link --project-ref bmvvugrfnuedjlucmlbw`
- All migrations applied to remote
- All 4 Edge Functions deployed
- Edge Function secrets set: `WEBAUTHN_RP_ID=horrorwriter.org`, `WEBAUTHN_ORIGIN`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected)

**Cloudflare Pages project:** `horrorwriter` (the Pages one, not the Worker)
- Live at: `horrorwriter.org`, `www.horrorwriter.org`, `horrorwriter.pages.dev`
- Deploy: `npm run build && npx wrangler pages deploy dist --project-name horrorwriter`
- No GitHub auto-deploy (manual deploy only — push does NOT trigger a build)
- Env vars set in Cloudflare Pages → Settings → Variables and Secrets:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` (secret)
  - `NODE_VERSION=20`
  - `VITE_TURNSTILE_SITE_KEY` — SET in production (real Cloudflare Turnstile key). Intentionally
    commented out in local `.env.local` so the Send Magic Link button isn't stuck disabled when the
    Turnstile script fails to load in dev. Playwright injects a dummy key via `webServer.env` so the
    gating test stays deterministic (see `playwright.config.js`).
  - `VITE_ENABLE_GOOGLE_LOGIN` — feature flag for the Google OAuth sign-in button (`'true'` to show)

**Supabase Auth redirect URLs configured:**
- `https://horrorwriter.org/auth/callback`
- `https://www.horrorwriter.org/auth/callback`
- `https://horrorwriter.pages.dev/auth/callback`

---

## Deploy workflow

```powershell
# Build + deploy (run from D:\CLAUDECODE\Projects\horrorwriter)
npm run build
npx wrangler pages deploy dist --project-name horrorwriter

# Push to GitHub (does NOT auto-deploy — just keeps repo in sync)
git add .
git commit -m "..."
git push
```

---

## Database tables

| Table | Purpose | RLS |
|---|---|---|
| `profiles` | User profiles (handle, bio, avatar, location, etc.) | owner write, public read |
| `passkey_credentials` | WebAuthn credential store | owner only |
| `webauthn_challenges` | Ephemeral challenge store | service role |
| `books` | Story library | owner write, public read |
| `categories` | Forum categories (pre-seeded) | public read |
| `threads` | Forum threads | owner write, public read |
| `posts` | Forum replies | owner write, public read |
| `book_comments` | Story critiques / responses | owner write, public read |

Storage bucket: `avatars` — per-user folder, owner RLS.

Insert rate limiting is enforced DB-side via the `enforce_rate_limit()` trigger function
(`20260523000002_rate_limiting.sql`). `posts` is added to the Realtime publication
(`20260527000000_enable_realtime_posts.sql`) for live thread updates.

---

## What's real vs. mocked

| Feature | Status |
|---|---|
| Magic link sign-in | ✅ Real (Supabase Auth) |
| Passkey sign-in/register | ✅ Real (WebAuthn Edge Functions) |
| Profile edit + avatar upload | ✅ Real (Supabase) |
| Public user profiles by handle | ✅ Real |
| Forum (browse) | ✅ Real (Supabase — `categories` + `threads` with profile join) |
| CreateThread | ✅ Real (inserts thread + initial post) |
| ThreadView (read + reply) | ✅ Real (fetches thread + posts, replies write to `posts`) |
| Library (browse/publish) | ✅ Real (Supabase `books` table) |
| PublishStory / ReadStory | ✅ Real |
| Library critiques | ✅ Real (Supabase `book_comments`) |
| Realtime presence lobby | ✅ Real (Supabase Realtime — `Home.jsx`) |
| Google OAuth sign-in | ✅ Real, feature-flagged (`VITE_ENABLE_GOOGLE_LOGIN`) |
| Turnstile CAPTCHA | ✅ Real (key set in prod) |
| Rituals / writing prompts | ❌ Removed |

---

## Known constraints

- **Git on Windows mount:** Historically flaky from the sandbox, but `git add`/`commit`/`push` ran
  successfully from the Bash tool in the 2026-05-30 session (commit `d243cf6` pushed). Treat it as
  usually-works; fall back to Jeff's PowerShell if a command misbehaves.
- **`gh` CLI not authenticated:** Opening PRs from here fails until `gh auth login` is run. Until
  then, open PRs via the GitHub web compare URL (or `Start-Process <url>` to launch the browser).
- **File edits in sandbox:** The Edit/Write file tools work fine for the mounted folder.
- **No GitHub auto-deploy:** Cloudflare Pages has no GitHub connection. Every deploy requires the manual wrangler command above.
- **Old Worker:** A separate Cloudflare Worker named `horrorwriter` still exists (`horrorwriter.orig-beetlebub.workers.dev`). It no longer serves any domains and can be deleted.

---

## Next priorities

> Done since last update: forum-count migration, Library wired to Supabase, PublishStory/ReadStory,
> Turnstile in prod, library critiques, Realtime presence, feature-flagged Google OAuth.

1. **Pagination on ThreadView** — currently fetches all posts at once; add a page cursor before threads grow.
2. **Delete old Worker** — Cloudflare → Workers & Pages → the Worker `horrorwriter` → Settings → Delete
3. **Connect GitHub to Pages** — for auto-deploys on push
4. **Authenticate `gh`** — run `gh auth login` so PRs can be opened from the CLI/sandbox.
