# Login Fix — Action Checklist

**Status:** Hostnames fixed + secret rotated. Two manual steps remain before live
signup works: set the new secret in Supabase, and deploy. Passkey sign-in works throughout.

**Root cause (resolved):** The Cloudflare Turnstile widget returned a **400** on the
live site because the widget's hostname allowlist didn't include the live domain, so
it never produced a token and the "Send Magic Link" button stayed disabled.

---

## ✅ Done

- [x] Hardened `src/components/SignInModal.jsx` so a Turnstile failure is **recoverable**
      (Retry button + passkey fallback) instead of a dead-end disabled button. **(merged, PR #5)**
- [x] Added `onExpire` handling so a token that expires (~5 min) auto-resets instead of
      silently failing on submit. **(merged, PR #5)**
- [x] Local dev unblocked (`VITE_TURNSTILE_SITE_KEY` commented out in `.env.local`).
- [x] **Hostnames added** to the Turnstile widget: `horrorwriter.org` + `www.horrorwriter.org`.
- [x] **Secret key rotated** in Cloudflare Turnstile. New secret to put in Supabase below.

---

## ☐ Remaining — Jeff (dashboards / deploy — agent can't reach these)

### 1. Set the new Turnstile secret in Supabase  ← do this
- Supabase Dashboard → project `bmvvugrfnuedjlucmlbw` → **Authentication** →
  **Settings** → **Bot and Abuse Protection / CAPTCHA**.
- Enable CAPTCHA protection, provider = **Turnstile**.
- Paste the new secret: `0x4AAAAAADVOjwwSdwc0_ne8OZPUgl-YdaQ`  → Save.
  (Old secret `0x4AAAAAADVOj88WYd2nbUNluvl1Wsaiyk0` is overwritten/retired.)
- ⚠️ The secret goes **only** here — never in the repo or a `VITE_` variable.

### 2. Site key — confirm it didn't change
- If you only **rotated the secret** on the existing widget, the site key is still
  `0x4AAAAAADPgGbyDwYkJ3VSh` → **nothing to change** in `.env.production` or Cloudflare.
- If you made a **new widget**, send the new **site** key so it can be updated in
  `.env.production` + the Cloudflare Pages `VITE_TURNSTILE_SITE_KEY` var.

### 3. Re-authenticate Wrangler, then deploy
The stored wrangler token expired (`error 10000`). Run locally:
```powershell
npx wrangler login          # opens browser, sign in to Cloudflare
npm run build
npx wrangler pages deploy dist --project-name horrorwriter
```

### 4. Verify (agent will re-test via Playwright once 1 & 3 are done)
1. Hard-refresh `https://horrorwriter.org`, click **Sign In**.
2. Turnstile renders and **auto-passes** (no "Security check failed").
3. **Send Magic Link** enables after entering an email; clicking it returns
   "Check your email…" (not a captcha-disallowed error → secret matches).
4. Magic-link email arrives and signs in at `/auth/callback`.

---

## Optional hardening (later)
- Supabase Auth → consider whether CAPTCHA must gate magic-link, or whether passkeys +
  email rate-limiting are sufficient (CAPTCHA adds a single point of failure for signup).
- Code-split the bundle — build warns it's >500 kB (cosmetic, not urgent).
