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
    CreateThread.jsx     # Forum thread creation (stub)
    Forum.jsx            # Forum index (mocked data)
    Home.jsx             # Landing page
    Library.jsx          # Story library (mocked data)
    Profile.jsx          # Profile editor (real Supabase)
    PublishStory.jsx     # Story publishing (stub)
    ReadStory.jsx        # Story reader (stub)
    Rituals.jsx          # Writing prompts
    ThreadView.jsx       # Forum thread view (stub)
    UserProfile.jsx      # Public profile by handle (real Supabase)
  lib/
    passkey.js           # WebAuthn client (register + authenticate)
    profile.js           # Profile fetch/update helpers
    useDocumentTitle.js  # Per-route <title> hook
  data/
    books.js             # Mocked library data
    prompts.js           # Writing prompts data
    threads.js           # Mocked forum data
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
  - `VITE_TURNSTILE_SITE_KEY` — NOT YET SET (Turnstile not configured)

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

Storage bucket: `avatars` — per-user folder, owner RLS.

---

## What's real vs. mocked

| Feature | Status |
|---|---|
| Magic link sign-in | ✅ Real (Supabase Auth) |
| Passkey sign-in/register | ✅ Real (WebAuthn Edge Functions) |
| Profile edit + avatar upload | ✅ Real (Supabase) |
| Public user profiles by handle | ✅ Real |
| Forum (browse/post) | ⚠️ Mocked — DB schema exists, pages use `src/data/threads.js` |
| Library (browse/publish) | ⚠️ Mocked — DB schema exists, pages use `src/data/books.js` |
| CreateThread / ThreadView | ⚠️ Stub |
| PublishStory / ReadStory | ⚠️ Stub |
| Rituals / writing prompts | ⚠️ Static data |
| Turnstile CAPTCHA | ⚠️ Not configured (key not set) |

---

## Known constraints

- **Git on Windows mount:** The sandbox cannot reliably run git commands on `D:\CLAUDECODE\Projects\horrorwriter`. Jeff commits and pushes from PowerShell.
- **File edits in sandbox:** Use `cat > file << 'EOF'` heredocs for non-trivial writes. The Edit/Write file tools work fine for the mounted folder.
- **No GitHub auto-deploy:** Cloudflare Pages has no GitHub connection. Every deploy requires the manual wrangler command above.
- **Old Worker:** A separate Cloudflare Worker named `horrorwriter` still exists (`horrorwriter.orig-beetlebub.workers.dev`). It no longer serves any domains and can be deleted.

---

## Next priorities

1. **Wire Forum to Supabase** — replace `src/data/threads.js` mock with real queries on `categories` + `threads` + `posts`
2. **Wire Library to Supabase** — replace `src/data/books.js` mock with real queries on `books`
3. **Implement ThreadView** — fetch thread + paginated posts
4. **Implement PublishStory / ReadStory** — insert/fetch from `books`
5. **Turnstile CAPTCHA** — set up at dash.cloudflare.com → Turnstile, add `VITE_TURNSTILE_SITE_KEY` to Cloudflare Pages env vars
6. **Delete old Worker** — Cloudflare → Workers & Pages → the Worker `horrorwriter` → Settings → Delete
7. **Connect GitHub to Pages** — for auto-deploys on push
