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

**Dependencies:** `@supabase/supabase-js`, `react-router-dom`, `@simplewebauthn/browser` (Turnstile/`@marsidev/react-turnstile` was removed — no captcha in the current app)

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
- **Deploy: push to `main`.** Cloudflare's native Git integration rebuilds Pages on every push,
  reading the root **`wrangler.toml`** as the source of truth. Build command `npm run build`,
  output dir `dist`. (A second pipeline — a `.github/workflows/deploy.yml` GitHub Action that
  deployed via `wrangler pages deploy` using GitHub repo secrets — was **deleted 2026-06-15** to
  stop the two pipelines racing; see Known constraints.)

**⚠️ Production env vars live in the root `wrangler.toml` `[vars]` block — NOT the dashboard.**
Because a `wrangler.toml` exists, Cloudflare treats it as the source of truth and **wipes any
dashboard plain-text vars on every deploy** (secrets survive). This bit us hard on 2026-06-14/15:
the build shipped with no `VITE_SUPABASE_URL`, producing a site-wide "Supabase not configured"
outage. **To change a build var: edit `wrangler.toml [vars]` and push — do NOT use the dashboard.**
Vite bakes `VITE_*` into the bundle at build time. Current required set (all PUBLIC by design, safe
to commit — verified live 2026-06-15):
  - `VITE_SUPABASE_URL` = `https://bmvvugrfnuedjlucmlbw.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = `sb_publishable_...` (Supabase **publishable** key — RLS-protected,
    public by design; it ships in the client bundle regardless)
  - `VITE_TRANSCRIBE_URL` = `https://horrorwriter-transcribe.orig-beetlebub.workers.dev`
  - `VITE_ENABLE_GOOGLE_LOGIN` = `true` (feature flag for the Google OAuth button)
  - `VITE_TURNSTILE_SITE_KEY` — kept in `[vars]` but **currently unused**: the frontend has no
    Turnstile code and `@marsidev/react-turnstile` is no longer a dependency (see below).
  - Local `.env.local` (gitignored) holds these for `npm run dev`. `.env.production` (also gitignored)
    is local-only and never reaches the build.

**Turnstile is vestigial.** Supabase Auth CAPTCHA is commented out in `supabase/config.toml` and the
React app has no Turnstile/captcha code, so neither the site key nor a secret key is functionally
needed right now. If you ever re-enable it: the **site** key goes in `wrangler.toml [vars]`; the
**secret** key goes in Supabase Auth (Authentication → Settings → CAPTCHA), NEVER in a `VITE_*` var.

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

# Change a build/runtime env var: edit the [vars] block in the root wrangler.toml, then push.
# (Do NOT set it in the Cloudflare dashboard — wrangler.toml is the source of truth and the
#  dashboard plain-text vars get wiped on every deploy.)

# Force a rebuild WITHOUT a code change: trigger a fresh production deployment via the Cloudflare API.
$h = @{ Authorization = "Bearer $env:CLOUDFLARE_API_TOKEN" }
$acct = "e61bdda6d2e023366f97a9bf015c6334"
Invoke-RestMethod -Method POST -Headers $h `
  -Uri "https://api.cloudflare.com/client/v4/accounts/$acct/pages/projects/horrorwriter/deployments"

# Verify a deploy actually baked the vars in — fetch the live bundle and grep it:
#   $html = (Invoke-WebRequest "https://horrorwriter.org/" -UseBasicParsing).Content
#   $js   = [regex]::Match($html, '/assets/[^"'']+\.js').Value
#   (Invoke-WebRequest "https://horrorwriter.org$js" -UseBasicParsing).Content -match 'bmvvugrfnuedjlucmlbw'

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
| Turnstile CAPTCHA | ❌ Removed (no captcha code in app; Supabase Auth CAPTCHA disabled) |
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
- **GitHub auto-deploy:** Cloudflare Pages' native Git integration rebuilds on every push to `main`,
  using the root `wrangler.toml` (incl. its `[vars]`). Manual wrangler deploy is not needed for
  normal releases.
- **Two-pipeline outage (2026-06-14/15):** the site had BOTH Cloudflare's native Git integration AND
  a `.github/workflows/deploy.yml` GitHub Action deploying on every push — they raced, and the
  native build shipped broken bundles (no env vars, because `wrangler.toml` had no `[vars]` and the
  dashboard vars get wiped on deploy). Fixed by moving all `VITE_*` vars into `wrangler.toml [vars]`
  and **deleting the GitHub Action** so the native integration is the sole pipeline. If "Supabase
  not configured" ever returns, first confirm the live bundle actually contains the Supabase URL
  (grep recipe in Deploy workflow) — that distinguishes an env-var/build problem from a code bug.
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

> Done 2026-06-15: fixed the site-wide "Supabase not configured" outage at the root — moved all
> `VITE_*` vars into `wrangler.toml [vars]` (Pages was wiping dashboard vars on every deploy) and
> deleted the redundant `.github/workflows/deploy.yml` so a single deploy pipeline remains. Verified
> the live bundle now contains the Supabase URL + working publishable key and the transcribe URL.
> Also deployed the transcribe Worker CORS fix. Earlier: moderation suite phases 1–3, site phases 4–10.

1. **Confirm in-browser** — Jeff to hard-refresh and verify passkey/Google login + audio
   transcription actually work end-to-end (bundle is verified; live user flow not yet confirmed).
2. **Pagination on ThreadView** — currently fetches all posts at once; add a page cursor before threads grow.
3. **Delete old Worker** — Cloudflare → Workers & Pages → the Worker `horrorwriter` → Settings → Delete
4. **Authenticate `gh`** — run `gh auth login` so PRs can be opened from the CLI/sandbox.
