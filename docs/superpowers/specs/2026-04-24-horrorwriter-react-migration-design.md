# HorrorWriter React Migration — Design Spec

**Date:** 2026-04-24
**Status:** Approved (pending implementation plan)
**Scope:** V1 — Auth + Profiles only

## Summary

Migrate the existing single-file VHS prototype (`index.html`) into the empty React + Vite skeleton in `src/`, preserving the visual design pixel-for-pixel. V1 ships real magic-link authentication, optional passkey upgrade for fast re-login, and full profile read/edit (with avatar upload) backed by Supabase. The Forum, Library, and Rituals sections are ported visually with their existing mocked data — they look identical to the prototype but are not yet wired to a backend. That work is V2+.

Hosting is Cloudflare Pages (static SPA). Backend (auth, database, storage, WebAuthn ceremony) lives entirely on Supabase. Cloudflare needs no special features beyond standard static hosting + SPA fallback.

## Goals

- Real, working sign-up and sign-in (no mocked auth)
- Users can edit their own profile and view others' public profiles at `/u/:handle`
- Visual parity with the existing prototype — atmospherics, typography, colors, layout
- Big-bang migration: one cohesive ship, prototype `index.html` is fully replaced
- Deployable to Cloudflare Pages with a single `git push` to `main`

## Non-Goals (V1)

- Real forum/library/rituals data — these stay mocked, ported visually
- Email/password sign-in
- OAuth providers (Google, Apple, etc.)
- Profile or account deletion UI
- Admin or moderation tooling
- RSS feed (footer link stays present but inert)
- Achievements / badges system (badges remain hard-coded on the demo profile)
- Mobile native apps
- Automated tests (V1 is mostly UI surface — defer until features stabilize)

## Architecture

Standard Vite + React SPA backed by Supabase.

**Stack:**
- React 19 + react-router-dom 7 (BrowserRouter — clean URLs)
- Vite 7 (already configured)
- Supabase: Auth (magic link), Postgres (profiles, passkeys, webauthn_challenges), Storage (avatars)
- Supabase Edge Functions (Deno) for WebAuthn ceremony endpoints
- SimpleWebAuthn (browser + server packages) for passkey registration/assertion
- Cloudflare Pages for static hosting

**Data flow:**
- Browser ↔ Supabase JS client directly for auth, profile read/write, avatar upload (RLS enforces who can do what)
- Browser ↔ Supabase Edge Functions for WebAuthn ceremonies (the Edge Functions in turn use the service-role key to mint sessions)
- Cloudflare never sees backend traffic — it only serves static files

**Visual atmospherics** (scanlines, noise, tracking overlay, vignette, VCR HUD with live clock) live in a single `Layout` component that wraps every route — they persist across navigation, no flicker.

## Component & File Structure

```
src/
├── main.jsx                      # entry — mounts <App /> into #root
├── App.jsx                       # router + AuthProvider wrapper
├── style.css                     # all global CSS, ported from index.html
│
├── lib/
│   ├── supabase.js               # Supabase client (already exists, needs env vars)
│   ├── auth.js                   # signInWithMagicLink, signOut helpers
│   ├── passkey.js                # registerPasskey, signInWithPasskey (calls Edge Functions)
│   └── profile.js                # getProfile, updateProfile, uploadAvatar
│
├── contexts/
│   └── AuthContext.jsx           # current user/session + profile, useAuth() hook
│
├── components/
│   ├── Layout.jsx                # shell: atmospherics + nav + footer + <Outlet />
│   ├── Atmospherics.jsx          # scanlines, noise, tracking, vignette, HUD clock
│   ├── Nav.jsx                   # top nav with Sign In / user menu
│   ├── Footer.jsx
│   ├── SignInModal.jsx           # magic-link form + passkey button
│   ├── OnboardingBanner.jsx      # "complete your profile" nudge
│   └── RequireAuth.jsx           # route guard for /profile
│
├── pages/
│   ├── Home.jsx                  # hero, live strip, featured tiles, "what this is"
│   ├── Forum.jsx                 # The Crypt — visual port, mocked data
│   ├── Library.jsx               # Book shares — visual port, mocked data
│   ├── Rituals.jsx               # Prompts/contests — visual port, mocked data
│   ├── Profile.jsx               # /profile — own profile editor
│   ├── UserProfile.jsx           # /u/:handle — public profile view
│   └── AuthCallback.jsx          # /auth/callback — handles magic-link return
│
└── data/
    ├── threads.js                # mocked forum threads (lifted from prototype)
    ├── books.js                  # mocked library books
    └── prompts.js                # mocked prompts

supabase/
├── migrations/
│   ├── 0001_profiles.sql
│   ├── 0002_passkeys.sql
│   ├── 0003_storage_avatars.sql
│   └── 0004_webauthn_challenges.sql
└── functions/
    ├── webauthn-register-begin/
    ├── webauthn-register-complete/
    ├── webauthn-authenticate-begin/
    └── webauthn-authenticate-complete/

public/
├── _redirects                    # /* /index.html 200 — SPA fallback
└── (favicons, etc.)
```

**Routes:**
- `/` → Home
- `/forum` → Forum
- `/library` → Library
- `/rituals` → Rituals
- `/profile` → Profile editor (own — requires auth, wrapped in `RequireAuth`)
- `/u/:handle` → UserProfile (public)
- `/auth/callback` → handles Supabase magic-link redirect, then redirects to `/`

The existing 1,200-line `index.html` is replaced with a small Vite-standard shell containing only `<div id="root">` and the bootstrap script tag.

## Data Model

### `profiles` table

1:1 with `auth.users`. Auto-created via Postgres trigger on user signup so we never have a signed-in user without a profile row.

```sql
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  handle          text unique not null,        -- e.g. 'marigold-rotten' (no @, lowercased)
  display_name    text,
  bio             text,
  location        text,
  pronouns        text,
  website_url     text,
  avatar_url      text,                        -- public Supabase Storage URL, or null
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index profiles_handle_idx on profiles (handle);
```

**Auto-handle on signup:** trigger generates `user-<6 random hex>` (e.g. `user-a8f2c1`). Users can change it later; uniqueness is enforced.

**RLS policies:**
- `select`: anyone (profiles are public)
- `insert`: only the trigger (no client inserts)
- `update`: only `auth.uid() = id` (users edit their own row)

### `passkeys` table

Stores WebAuthn credentials. One user can register many passkeys (laptop, phone, etc.).

```sql
create table passkeys (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  credential_id   text unique not null,        -- base64url
  public_key      text not null,               -- base64url COSE key
  counter         bigint not null default 0,
  device_name     text,                        -- "Jeff's MacBook" — user-set on registration
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz
);

create index passkeys_user_id_idx on passkeys (user_id);
create index passkeys_credential_id_idx on passkeys (credential_id);
```

**RLS policies:**
- `select`: only `auth.uid() = user_id` (so user can list their own devices)
- `insert / update / delete`: only via Edge Functions using the service-role key (clients never write directly)

### `webauthn_challenges` table

Short-lived challenges used during WebAuthn ceremonies. Edge Functions enforce a 5-minute TTL on lookup (`created_at > now() - interval '5 minutes'`); expired rows are simply ignored. A periodic cleanup job to delete old rows is a nice-to-have for table size but not required for correctness.

```sql
create table webauthn_challenges (
  id              uuid primary key default gen_random_uuid(),
  challenge       text not null,               -- base64url
  user_id         uuid references auth.users(id) on delete cascade,  -- nullable for sign-in
  purpose         text not null,               -- 'register' | 'authenticate'
  created_at      timestamptz not null default now()
);

create index webauthn_challenges_challenge_idx on webauthn_challenges (challenge);
```

**RLS:** no client access; only Edge Functions (service role) read/write this table.

### `avatars` Storage bucket

- **Public read** (avatars show on public profiles)
- **Authenticated insert/update** restricted via Storage policy to a folder named after the user's UUID: `{user_id}/avatar.{ext}`
- 2 MB max file size, image MIME types only (`image/png`, `image/jpeg`, `image/webp`, `image/gif`)

## Auth Flows

### Magic link sign-in (primary, available to everyone)

1. User clicks **Sign In** in the nav → `SignInModal` opens
2. User enters email → clicks **Continue with Email**
3. Browser calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <window.location.origin>/auth/callback } })`
4. Supabase sends magic-link email
5. User clicks link → lands on `/auth/callback?...`
6. `AuthCallback` page calls `supabase.auth.getSession()` (Supabase JS handles the URL fragment automatically), then redirects to `/`
7. Postgres trigger has already created the `profiles` row with auto-generated handle
8. `OnboardingBanner` appears: *"Welcome. Pick a handle and add a bio when you're ready → Complete profile"*

### Passkey registration (after first sign-in)

User goes to `/profile` → "Devices" section → clicks **Add a passkey**:

1. Browser calls Edge Function `webauthn-register-begin` with auth bearer token
2. Edge Function (with service role) generates registration options via SimpleWebAuthn server, stores `(challenge, user_id, purpose='register')` in `webauthn_challenges`
3. Browser receives options, calls `navigator.credentials.create(options)`
4. User confirms with face/fingerprint/PIN → browser gets attestation
5. Browser POSTs attestation + device name to `webauthn-register-complete`
6. Edge Function verifies attestation against stored challenge, deletes the challenge row, inserts row into `passkeys`
7. Toast: *"Device registered. Next time you can sign in instantly."*

### Passkey sign-in (subsequent visits)

`SignInModal` shows **Sign in with passkey** as primary CTA if `window.PublicKeyCredential` is available:

1. Browser calls Edge Function `webauthn-authenticate-begin` (no auth needed — public)
2. Edge Function generates assertion options (`allowCredentials: []` for usernameless flow), stores `(challenge, user_id=null, purpose='authenticate')`
3. Browser calls `navigator.credentials.get(options)` → user confirms
4. Browser POSTs assertion to `webauthn-authenticate-complete`
5. Edge Function looks up `passkeys` row by `credential_id`, verifies signature, retrieves `user_id`
6. Edge Function uses Supabase admin client to call `auth.admin.generateLink({ type: 'magiclink', email: <user email> })` → extracts the `hashed_token` from the response
7. Returns `{ token_hash }` to the browser
8. Browser exchanges via `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` → real Supabase session, no email round-trip
9. Edge Function (or a follow-up call) updates `passkeys.last_used_at`

**Why this approach:** Supabase doesn't support custom-token sign-in for arbitrary auth providers. Generating a magic-link token server-side and exchanging it client-side gives a real Supabase session without sending an email. The token is single-use and short-lived, so this is safe — the Edge Function returns it over HTTPS to a freshly WebAuthn-verified browser.

### Sign-out

Standard `supabase.auth.signOut()` triggered from the user menu in the nav. AuthContext clears.

## Cloudflare Pages — what it needs to support

Cloudflare's role is purely static hosting. None of the auth/WebAuthn code runs on Cloudflare.

| Need | Cloudflare Pages | Notes |
|---|---|---|
| Static React/Vite build hosting | Built-in | `npm run build` → `dist/` |
| HTTPS (required for WebAuthn) | Built-in, automatic | |
| SPA fallback (so `/u/:handle` doesn't 404 on hard reload) | Via `public/_redirects` | One file: `/* /index.html 200` |
| Build-time env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) | Built-in dashboard | Per-environment |
| Custom domain (`horrorwriter.org`) | Built-in | DNS in Cloudflare |

All standard. No special Cloudflare features (Workers, KV, D1, R2) are used.

## Deployment

### Local dev

`.env.local` (gitignored):
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

`npm run dev` → Vite dev server at `http://localhost:5173`. Magic-link `emailRedirectTo` reads `window.location.origin`, so it works in dev and prod without code changes. WebAuthn requires HTTPS or localhost — both covered.

### Supabase project setup (one-time, manual)

1. Create Supabase project (or use existing)
2. Run SQL migrations from `supabase/migrations/` (tables, triggers, RLS policies)
3. Create `avatars` Storage bucket with the policies from the Data Model section
4. Configure Auth → Email templates (magic-link wording can match the prototype's vibe)
5. Add allowed redirect URLs: `https://horrorwriter.org/auth/callback` and `http://localhost:5173/auth/callback`
6. Deploy Edge Functions via `supabase functions deploy <name>` (all 4)
7. Set Edge Function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `RP_ID=horrorwriter.org`, `RP_NAME=Horror Writer`, `ORIGIN=https://horrorwriter.org`

### Cloudflare Pages setup (one-time, manual)

1. Connect GitHub repo `JeffThomas360/HorrorWriter` to Cloudflare Pages
2. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: 20
3. Environment variables (Production + Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Custom domain: `horrorwriter.org` → DNS via Cloudflare
5. Verify `public/_redirects` is committed:
   ```
   /*    /index.html   200
   ```

### CI / release flow

Every push to `main` → Cloudflare auto-builds and deploys to production. Preview deploys for branches and PRs. No GitHub Actions needed for V1.

## Open Risks

- **`auth.admin.generateLink` magic-link exchange** for passkey sign-in is a deliberate workaround for Supabase not supporting custom-token sign-in. If Supabase ships first-class custom-JWT sign-in later, we can simplify. Until then, this is the cleanest path and is used in production by other passkey-on-Supabase implementations.
- **WebAuthn `RP_ID` is bound to the apex domain.** If the site is ever served from a subdomain (e.g. `app.horrorwriter.org`) without also reachable on the apex, registered passkeys will not work there. Lock the design to apex `horrorwriter.org` for now.
- **Email deliverability of magic links** depends on Supabase's default SMTP, which is rate-limited and not great for production. Plan to swap in a real provider (Resend / Postmark / SES) before any meaningful user volume — but not blocking V1.
