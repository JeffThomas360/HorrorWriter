# Login Fix — RESOLVED ✅

**Status:** Production magic-link sign-up works end-to-end (verified 2026-06-03 via
Playwright on horrorwriter.org — "Check your email for the magic link." returned,
meaning Supabase accepted the Turnstile token). Passkey sign-in unaffected.

**What it actually was:** A **new** Turnstile widget was created (new site key
`0x4AAAAAADVOj70TqBIdnJER` + a new secret). The old deployed frontend still used the
retired site key `0x4AAAAAADPgGbyDwYkJ3VSh`, which 400'd. Fix = point the frontend at
the new site key AND set the matching new secret in Supabase Auth.

**Resolution applied:**
- `.env.production` → `VITE_TURNSTILE_SITE_KEY=0x4AAAAAADVOj70TqBIdnJER` (rebuilt + deployed)
- Supabase Auth CAPTCHA secret updated via the Management API (value not stored here —
  secrets never belong in the repo; it lives only in Supabase Auth + Cloudflare Turnstile)
- Widget hostnames include `horrorwriter.org` + `www.horrorwriter.org`
- Resilience fix (PR #5) shipped in the same bundle

---

## ☐ Follow-ups (not blocking — login works now)

1. **⚠️ Rotate the Turnstile secret again.** An earlier version of this file briefly
   committed the secret value to git history (commits `6796ca8`, `20cd5a3`). Treat that
   secret as exposed: Cloudflare → Turnstile → the widget → **Rotate Secret Key**, then
   update it in Supabase Auth → CAPTCHA. (The current file no longer contains it.)
2. **Update the Cloudflare Pages dashboard env var** `VITE_TURNSTILE_SITE_KEY` to
   `0x4AAAAAADVOj70TqBIdnJER`. Current deploys build locally (using `.env.production`),
   so this isn't used today — BUT if GitHub→Pages auto-deploy is ever connected, a
   Cloudflare-side build would use the stale OLD key and re-break login.
3. **Revoke the temporary Supabase PAT** named "Claude" if you don't want to keep it
   (https://supabase.com/dashboard/account/tokens).

---

## (Historical) Root cause notes

The Cloudflare Turnstile widget returned a **400** on the live site because the deployed
frontend's site key didn't match a widget configured for the live domain, so it never
produced a token and the "Send Magic Link" button stayed disabled. The site key (public)
belongs in `.env.production` / Cloudflare `VITE_TURNSTILE_SITE_KEY`; the secret (private)
belongs **only** in Supabase Auth → CAPTCHA — never in the repo or a `VITE_` variable.

---

## Optional hardening (later)
- Supabase Auth → consider whether CAPTCHA must gate magic-link, or whether passkeys +
  email rate-limiting are sufficient (CAPTCHA adds a single point of failure for signup).
- Code-split the bundle — build warns it's >500 kB (cosmetic, not urgent).
