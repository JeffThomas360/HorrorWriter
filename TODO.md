# HorrorWriter — TODO

Snapshot from 2026-04-29. The full implementation plan is in
`docs/superpowers/plans/2026-04-24-horrorwriter-react-migration.md` (47 tasks).
This file is the short version: what's left, in priority order.

## Status overview

| Phase | Description                                  | State   |
| ----- | -------------------------------------------- | ------- |
| 0     | Setup, deps, .env.example, _redirects        | done    |
| 1     | Layout, atmospherics, router, stubs          | done    |
| 2     | Static pages with mocked data                | done    |
| 3     | Database migrations (5 written)              | done*   |
| 4     | Magic-link auth                              | partial |
| 5     | Profile read/edit + UserProfile + onboarding | done    |
| 6     | Passkey support (WebAuthn)                   | not yet |
| 7     | Cleanup + Cloudflare Pages deploy            | partial |

`*` Phase 3 SQL is written and committed but **not yet applied** to the live
Supabase project — see "Apply migrations" below.

## Immediate (finish Phase 7)

- [ ] **Apply pending Supabase migrations.** Need: 20-char project ref from the
      Supabase dashboard URL (`https://supabase.com/dashboard/project/<this>`).
      ```powershell
      supabase link --project-ref <your-ref>
      supabase db push
      ```
      Will apply `0002_profile_extras`, `0003_webauthn_challenges`,
      `0004_storage_avatars`. Without these, the live Profile editor will
      throw on save (extra columns missing) and avatar upload will throw
      (no `avatars` bucket).

- [ ] **Set up Cloudflare Pages.** Dashboard → Workers & Pages → Create →
      Pages → Connect to Git → pick `JeffThomas360/HorrorWriter`.
      Framework: **Vite**. Build command: `npm run build`. Output dir: `dist`.
      Env vars (Production + Preview both):
      - `VITE_SUPABASE_URL` = your project URL
      - `VITE_SUPABASE_ANON_KEY` = your anon/public key
      - `NODE_VERSION` = `20`

- [ ] **Add Cloudflare URL to Supabase auth redirects.** After Pages gives
      you a `*.pages.dev` URL, go to Supabase dashboard →
      Authentication → URL Configuration → Redirect URLs → add
      `https://<your-project>.pages.dev/auth/callback`. Without this,
      magic-link sign-ins fail with "redirect URL not allowed."

- [ ] **Smoke test the live site.** Click through every route. Confirm
      magic-link sign-in works, profile edits save, avatar upload works,
      `/u/<handle>` renders.

- [ ] **(Optional) Custom domain.** Cloudflare Pages → Custom domains →
      add `horrorwriter.org`. Then re-add the redirect URL in Supabase
      with the real domain.

## Phase 4 finish — small

- [ ] Extract auth helpers into `src/lib/auth.js` (currently inline in
      SignInModal/AuthCallback). Plan task 22.
- [ ] Real magic-link E2E smoke test (plan task 28). Becomes "click
      through live site" once Phase 7 is done — these collapse together.

## Phase 6 — passkeys (the big one)

Requires Supabase Edge Functions. CLI is already installed. Migrations 0001
(passkey_credentials table) and 0003 (webauthn_challenges table) are ready to
support this.

- [ ] **Task 35:** `supabase/functions/_shared/cors.ts` — shared CORS helper
- [ ] **Task 36:** `webauthn-register-begin` Edge Function
- [ ] **Task 37:** `webauthn-register-complete` Edge Function
- [ ] **Task 38:** `webauthn-authenticate-begin` Edge Function
- [ ] **Task 39:** `webauthn-authenticate-complete` Edge Function
- [ ] **Task 40:** Deploy functions, set `RP_ID` and `ORIGIN` secrets
      (`horrorwriter.org` and `https://horrorwriter.org` once domain is wired)
- [ ] **Task 41:** `src/lib/passkey.js` — client helpers using
      `@simplewebauthn/browser`
- [ ] **Task 42:** Devices section on Profile page — list registered passkeys,
      add/remove
- [ ] **Task 43:** Replace the stubbed `alert("Passkeys coming soon")`
      button in `SignInModal.jsx` with a real passkey sign-in flow
- [ ] **Task 44:** Cross-device passkey E2E test

## Cleanup / nice-to-have

- [ ] Remove the duplicate `vite.config.js` if `git status` shows it
      (cosmetic only — file is identical, drvfs ghost)
- [ ] Add a `package.json` `lint` script + ESLint config (currently no
      lint step in CI; not in plan but worth doing before more contributors)
- [ ] Sweep `OnboardingBanner.jsx` heuristic — currently shows for any
      user with empty bio. Could also key off "still on auto-generated handle."
- [ ] Add a `<title>` per route (right now the tab always says "Horror Writer"
      regardless of page) — probably 5 lines with `useEffect`

## When working on this codebase

- Jeff commits via PowerShell on the Windows side. The Linux sandbox
  attached to this workspace can't manage git on the `D:\` drive
  (drvfs limitation — `index.lock` permission errors, file truncation
  on the Edit/Write tools). Use bash heredocs for non-trivial file
  writes.
- CRLF line endings: `.gitattributes` enforces LF in the repo.
  PowerShell's `git` will normalize on commit.
- Build verification from sandbox: `npx vite build --outDir /tmp/dist`
  (the mounted outputs dir has stuck files).
