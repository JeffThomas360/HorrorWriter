# Login Fix — Action Checklist

**Status:** Production magic-link sign-up is currently broken. Passkey sign-in still works.

**Root cause:** The Cloudflare Turnstile widget on the live site returns a **400** for site
key `0x4AAAAAADPgGbyDwYkJ3VSh`. The widget never produces a token, so the "Send Magic Link"
button stays permanently disabled and the modal shows *"Security check failed."*

A 400 on `challenges.cloudflare.com/.../<sitekey>/...` almost always means the widget's
**hostname allowlist does not include the live domain** (or the key was rotated/deleted).

---

## ✅ Done (code side)

- [x] Hardened `src/components/SignInModal.jsx` so a Turnstile failure is **recoverable**
      (Retry button + passkey fallback) instead of a dead-end disabled button.
- [x] Added `onExpire` handling so a token that expires (~5 min) auto-resets instead of
      silently failing on submit.
- [x] Local dev unblocked (`VITE_TURNSTILE_SITE_KEY` commented out in `.env.local`).
- [x] PR opened: **fix/turnstile-resilience** (merge after review).

> ⚠️ The code fix prevents the button from *bricking*, but the captcha still won't **pass**
> until the Turnstile config below is fixed. Both are needed for magic-link signup to work.

---

## ☐ TODO — Jeff (Cloudflare dashboard — I can't access this)

### 1. Fix the Turnstile hostname allowlist (the actual cure)
1. Cloudflare Dashboard → **Turnstile**.
2. Open the widget with site key `0x4AAAAAADPgGbyDwYkJ3VSh`.
3. Under **Hostname Management / Domains**, confirm these are present (add if missing):
   - `horrorwriter.org`
   - `www.horrorwriter.org`
4. Save.
5. If the key was deleted or you can't find it:
   - Create a **new** Turnstile widget (Managed mode) with the hostnames above.
   - Copy the new **Site Key** and **Secret Key**.
   - Cloudflare Pages → `horrorwriter` → Settings → Variables → update
     `VITE_TURNSTILE_SITE_KEY` to the new site key.
   - Supabase → Auth → Settings → **CAPTCHA protection** → update the Turnstile
     **secret key** to match (the secret and site key must be from the same widget).

### 2. Re-authenticate Wrangler, then deploy the code fix
The stored wrangler token expired (`Authentication error [code: 10000]`), so the deploy
couldn't run from the agent. Run locally:
```powershell
npx wrangler login          # opens browser, sign in to Cloudflare
npm run build
npx wrangler pages deploy dist --project-name horrorwriter
```

### 3. Verify on the live site
1. Hard-refresh `https://horrorwriter.org`.
2. Click **Sign In** → the Turnstile widget should render and **auto-pass** (no
   "Security check failed").
3. **Send Magic Link** should become enabled after entering an email.
4. Confirm the magic-link email arrives and signs you in at `/auth/callback`.

---

## Optional hardening (later)
- Supabase Auth → consider whether CAPTCHA must gate magic-link, or whether passkeys +
  email rate-limiting are sufficient (CAPTCHA adds a single point of failure for signup).
- Code-split the bundle — build warns it's >500 kB (cosmetic, not urgent).
