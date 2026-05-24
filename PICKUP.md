# HorrorWriter — Session Pickup File
_Last updated: 2026-05-19_

---

## What the site is

**horrorwriter.org** — A React + Vite SPA hosted on Cloudflare Workers, backed by Supabase (Postgres, Auth, Storage, Edge Functions). Horror-themed community platform for writers. VHS aesthetic.

- **Repo:** https://github.com/JeffThomas360/HorrorWriter
- **Live site:** https://horrorwriter.org
- **Supabase project:** https://supabase.com/dashboard/project/bmvvugrfnuedjlucmlbw
- **Cloudflare:** Workers & Pages → horrorwriter (Worker, not Pages)
- **Design spec:** `docs/superpowers/specs/2026-04-24-horrorwriter-react-migration-design.md`
- **Migration plan:** `docs/superpowers/plans/2026-04-24-horrorwriter-react-migration.md`

---

## What's fully done

| Phase | Status |
|-------|--------|
| 0 — Project setup (Vite, Cloudflare, env vars) | ✅ Done |
| 1 — Layout + router + all static pages | ✅ Done |
| 2 — Inner pages with mocked data | ✅ Done |
| 3 — Supabase migrations (profiles, passkeys, storage) | ✅ Done |
| 4 — Auth: magic-link, AuthContext, AuthCallback | ✅ Done |
| 5 — Profile editor + avatar upload + public /u/:handle pages | ✅ Done |
| 6 — Passkeys (WebAuthn) — register + sign-in flow | ✅ Built & deployed |
| 7 — Deploy to Cloudflare Workers via Wrangler CLI | ✅ Live |

---

## Passkeys — the big thing we just finished

We built full WebAuthn passkey support (register + authenticate) using:
- **`@simplewebauthn/server` v11** — 4 Supabase Edge Functions (Deno)
- **`@simplewebauthn/browser` v11** — client-side in `src/lib/passkey.js`

### Edge Functions (all deployed to Supabase):
- `webauthn-register-begin` — generates registration options, stores challenge
- `webauthn-register-complete` — verifies attestation, stores passkey credential
- `webauthn-authenticate-begin` — generates auth options, stores challenge
- `webauthn-authenticate-complete` — verifies assertion, mints magic-link token for session

### Key bugs we fixed in this session:
1. **Buffer not available in Deno** — replaced `Buffer.from()` with `encodeBase64`/`decodeBase64` from `jsr:@std/encoding/base64`
2. **Challenge insert had no error checking** — added explicit error returns so failures aren't silent
3. **Remote `webauthn_challenges` table was missing the `type` column** — fixed with migration `20260520034702_add_type_to_webauthn_challenges.sql`

### Last known state:
The migration applied successfully. Passkeys have NOT been tested end-to-end yet since the fix. **This is the first thing to do next session.**

---

## Database migrations (all applied to remote)

| Migration | What it does |
|-----------|-------------|
| `20260519000000_passkeys.sql` | Creates `passkeys` + `webauthn_challenges` tables |
| `20260520034702_add_type_to_webauthn_challenges.sql` | Adds `type` + `user_id` columns to challenges table |
| (plus older ones for profiles, storage, etc.) | All in sync |

Run `supabase migration list` to verify. Should show all as "applied".

---

## Deployment

```powershell
# Build
npm run build

# Deploy to Cloudflare Worker
npx wrangler deploy

# Deploy Edge Functions (when changed)
supabase functions deploy webauthn-register-begin
supabase functions deploy webauthn-register-complete
supabase functions deploy webauthn-authenticate-begin
supabase functions deploy webauthn-authenticate-complete
```

**Note:** We use `npx wrangler deploy`, NOT the Cloudflare web uploader (it was broken/stuck).  
**Note:** `public/_redirects` was deleted — SPA routing handled by `wrangler.toml` (`not_found_handling = "single-page-application"`).

---

## What's NOT done yet (in priority order)

### 1. Test passkeys end-to-end ← DO THIS FIRST
- Go to https://horrorwriter.org/profile → click "▸ Add a Passkey"
- Should prompt for Face ID / Touch ID / Windows Hello
- Should show "✓ Passkey added"
- Then sign out, open Sign In modal, click "Sign in with Passkey"
- Should sign you in without email

### 2. Rotate the exposed keys
`KEYS/Keys.txt` was briefly committed to the public GitHub repo before being removed. Those keys are compromised. Rotate:
- Supabase service role key
- Any API keys that were in that file
Generate new ones from the Supabase dashboard and Cloudflare dashboard, update Wrangler secrets.

### 3. Set up Resend for branded emails
Magic-link emails currently come from Supabase's generic sender. To send from `noreply@horrorwriter.org`:
- Sign up at https://resend.com
- Add and verify your domain
- Get the SMTP credentials
- In Supabase Dashboard → Authentication → SMTP Settings → enable custom SMTP
- Set host: `smtp.resend.com`, port: `465`, user: `resend`, password: your Resend API key
- Set "Sender name" and "Sender email" to your branded values

### 4. Community features (Phase 8 — not started)
Forums, writing rooms, library submissions — these pages exist with mocked data but have no real backend yet.

---

## Tech stack quick reference

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, React Router |
| Hosting | Cloudflare Workers (static assets) |
| Backend | Supabase (Postgres + Auth + Storage) |
| Auth | Supabase magic-link OTP + WebAuthn passkeys |
| Edge Functions | Supabase Deno functions |
| CSS | Custom (`src/style.css`, ~822 lines) — VHS horror aesthetic |
| Fonts | Cinzel (display), EB Garamond (body), VT323 (mono) |
| Colors | `--blood` #ff1f3a, `--cyan` #4cd5ff, `--gold` #d3a24a, `--bone` #f3ecd9 |

---

## Key file locations

```
src/
  lib/
    passkey.js          ← WebAuthn client logic (register + sign-in)
    profile.js          ← Profile update + avatar upload
    auth.js             ← Auth helpers
  components/
    AuthContext.jsx     ← Auth state + refreshProfile
    SignInModal.jsx     ← Magic link + passkey sign-in UI
  pages/
    Profile.jsx         ← Profile editor + passkeys management section

supabase/
  functions/
    webauthn-register-begin/index.ts
    webauthn-register-complete/index.ts
    webauthn-authenticate-begin/index.ts
    webauthn-authenticate-complete/index.ts
  migrations/           ← All migrations, in sync with remote

wrangler.toml           ← Cloudflare Worker config (SPA routing, assets dir)
DEPLOY.md               ← Step-by-step deploy checklist
```

---

## Known constraints

- **Git operations**: Jeff does these in PowerShell, not the AI sandbox (index.lock permission errors on mounted Windows drive)
- **File writes in sandbox**: Use bash heredocs (`cat > file << 'EOF'`) for non-trivial files — the Edit tool truncates large insertions
- **Supabase CLI**: Installed via Scoop, version 2.95.4
- **Node**: Pinned to 20 via `.nvmrc`
