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
| Deploy | Cloudflare Pages (GitHub auto-deploy on push to `main`) |
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
  migrations/            # ONE consolidated baseline (clean-reset, 2026-06-08)
    00000000000000_baseline.sql   # full schema: auth-trigger, profiles, passkeys,
                                  # library, forum, comments, storage, realtime,
                                  # rate-limit RPC + the moderation suite data model
  migrations_archive/    # the 24 pre-baseline migrations (history only, NOT applied)
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
- Account ID: `e61bdda6d2e023366f97a9bf015c6334`
- **Deploy: push to `main`** — GitHub auto-deploy is connected; Cloudflare rebuilds on every push.
  No manual wrangler step for normal releases. Build command `npm run build`, output dir `dist`.

**⚠️ Production env vars (Settings → Variables and Secrets → Production).** Vite bakes `VITE_*` vars
into the bundle at **build time** — editing a var in the dashboard does NOTHING until a new build
runs (see Deploy workflow for how to force a rebuild without a code change). **On 2026-06-14 every
var EXCEPT `VITE_SUPABASE_ANON_KEY` was found wiped from production** (cause unknown — possibly the
GitHub-integration setup), which silently broke the Supabase client ("Supabase not configured"),
transcription, Turnstile, and Google login. **If the site breaks site-wide after a deploy, check
these first.** Full required set (restored + verified 2026-06-14):
  - `VITE_SUPABASE_URL` = `https://bmvvugrfnuedjlucmlbw.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` (secret — value not API-readable; if login fails with "Invalid API key"
    rather than "not configured", re-check this one)
  - `VITE_TRANSCRIBE_URL` = `https://horrorwriter-transcribe.orig-beetlebub.workers.dev`
  - `VITE_TURNSTILE_SITE_KEY` = `0x4AAAAAADVOj70TqBIdnJER` (PUBLIC site key — safe to commit/expose)
  - `VITE_ENABLE_GOOGLE_LOGIN` = `true` (feature flag for the Google OAuth button)
  - `NODE_VERSION` = `20`
  - Local `.env.local` intentionally omits `VITE_TURNSTILE_SITE_KEY` so the Send Magic Link button
    isn't stuck disabled when the Turnstile script fails to load in dev. Playwright injects a dummy
    key via `webServer.env` so the gating test stays deterministic (see `playwright.config.js`).

**Turnstile SECRET key** lives in **Supabase Auth** (Authentication → Settings → Bot and Abuse
Protection / CAPTCHA), NOT in Cloudflare. **Never** put the secret key in a `VITE_*` var — it would
ship in the public bundle. The secret key is a separate system and was untouched by the wipe above.

**Cloudflare Worker: `horrorwriter-transcribe`**
- Live at: `https://horrorwriter-transcribe.orig-beetlebub.workers.dev`
- Deploy: `cd workers/transcribe && npx wrangler deploy`
- Uses Workers AI binding (`env.AI`) — `@cf/openai/whisper` model
- Accepts `POST /transcribe` with `multipart/form-data` field `audio`, max 4 MB

**Supabase Auth redirect URLs configured:**
- `https://horrorwriter.org/auth/callback`
- `https://www.horrorwriter.org/auth/callback`
- `https://horrorwriter.pages.dev/auth/callback`

---

## Deploy workflow

```powershell
# Normal release: just push. GitHub auto-deploy rebuilds Pages on push to main.
git add .
git commit -m "..."
git push

# Rebuild WITHOUT a code change (e.g. after editing env vars in the dashboard):
# trigger a fresh production deployment via the Cloudflare API.
$h = @{ Authorization = "Bearer $env:CLOUDFLARE_API_TOKEN" }
$acct = "e61bdda6d2e023366f97a9bf015c6334"
Invoke-RestMethod -Method POST -Headers $h `
  -Uri "https://api.cloudflare.com/client/v4/accounts/$acct/pages/projects/horrorwriter/deployments"

# Read / set production env vars via the API (PATCH MERGES by key; set a key to null to delete it):
#   GET   .../pages/projects/horrorwriter   → .result.deployment_configs.production.env_vars
#   PATCH .../pages/projects/horrorwriter   with body:
#     { deployment_configs: { production: { env_vars: { NAME: { type: "plain_text", value: "..." } } } } }

# Transcribe Worker (separate from Pages — NOT auto-deployed; deploy manually):
cd workers/transcribe; npx wrangler deploy
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
| `reports` | User reports (content/user/site/appeal) | reporter + mods (Phase 2 UI) |
| `mod_actions` | Append-only moderation audit log | warden+ read (Phase 4 UI) |
| `notifications` | Closed-loop user notifications | owner read; definer-only insert |
| `mod_role_badges` | Role→emoji map (Keeper-editable) | public read, keeper write |
| `filter_rules` | Submission auto-filter rules | keeper only (Phase 5 UI) |

Storage bucket: `avatars` — per-user folder, owner RLS.

**Moderation model (Phase 0 baseline, 2026-06-08):** `is_admin`/`hidden`/`approved`/
`moderation_flags` were dropped and replaced. `profiles` now carries `mod_role`
(`sentinel|moderator|warden|keeper`) + `mod_scope` (`all|forum|library`) plus standing
flags (`requires_screening`, `is_shadowbanned`, `banned_until`, `ban_reason`). Content
tables (`books`/`threads`/`posts`/`book_comments`) carry a single `mod_status`
(`live|screening|hidden`). Visibility/permissions are enforced in RLS via the SQL helpers
`mod_can(action, area)` and `content_visible(status, author, area)`. The 5 new tables
above are created empty — their behavioral triggers + admin UI land in Phases 1–6
(see `docs/superpowers/specs/2026-06-08-moderation-suite-design.md`).

Insert rate limiting is enforced DB-side via the `enforce_rate_limit()` trigger function.
`posts` is on the Realtime publication for live thread updates. (Both now live in the
consolidated baseline migration.)

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
| Audio transcription | ✅ Real (CF Worker + Workers AI Whisper — story editor + thread composer) |
| Rituals / writing prompts | ❌ Removed |

---

## Known constraints

- **Git on Windows mount:** Historically flaky from the sandbox, but `git add`/`commit`/`push` ran
  successfully from the Bash tool in the 2026-05-30 session (commit `d243cf6` pushed). Treat it as
  usually-works; fall back to Jeff's PowerShell if a command misbehaves.
- **`gh` CLI not authenticated:** Opening PRs from here fails until `gh auth login` is run. Until
  then, open PRs via the GitHub web compare URL (or `Start-Process <url>` to launch the browser).
- **File edits in sandbox:** The Edit/Write file tools work fine for the mounted folder.
- **GitHub auto-deploy:** Cloudflare Pages is connected to GitHub. Pushes to main trigger automatic deploys (confirmed 2026-06-14). Manual wrangler deploy is no longer needed for normal releases.
- **Cloudflare API token mechanics:** `CLOUDFLARE_API_TOKEN` (machine env var) needs **Workers
  Scripts Edit + Cloudflare Pages Edit** (current token verified to have both, 2026-06-14). The
  PowerShell/Bash tools spawn fresh shells that read the CURRENT machine value, but the **MCP
  Cloudflare plugin uses whatever token existed when the Claude Code session STARTED** — so after
  rotating the token, either restart Claude Code or drive Cloudflare through the PowerShell tool
  (which already sees the new value). This bit us 2026-06-14: MCP writes failed with auth errors
  while the PowerShell tool's API calls succeeded.
- **Old Worker:** A separate Cloudflare Worker named `horrorwriter` still exists (`horrorwriter.orig-beetlebub.workers.dev`). It no longer serves any domains and can be deleted.

---

## Next priorities

> Done 2026-06-14: restored all 6 wiped Pages env vars + forced a rebuild (fixed the site-wide
> "Supabase not configured" outage); deployed transcribe Worker CORS fix (added `*.pages.dev` +
> localhost origins). Earlier: moderation suite phases 1–3, site phases 4–10, GitHub auto-deploy.

1. **Verify the 2026-06-14 fix on the live site** — after a hard refresh, passkey + magic-link
   login, the Google button, and audio transcription should all work. (The transcription
   `NetworkError` was likely caused by the missing `VITE_TRANSCRIBE_URL`, now restored, in addition
   to the Worker CORS fix.) If login fails with "Invalid API key" instead of "Supabase not
   configured", re-check the `VITE_SUPABASE_ANON_KEY` value.
2. **Pagination on ThreadView** — currently fetches all posts at once; add a page cursor before threads grow.
3. **Delete old Worker** — Cloudflare → Workers & Pages → the Worker `horrorwriter` → Settings → Delete
4. **Authenticate `gh`** — run `gh auth login` so PRs can be opened from the CLI/sandbox.
