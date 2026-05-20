# HorrorWriter — Launch Checklist

Everything needed to go from "code is ready" to "horrorwriter.org is live and fully featured."
Run these steps in order.

---

## Step 1 — Commit & push the new code

In PowerShell from `D:\CLAUDECODE\Projects\horrorwriter`:

```powershell
git add -A
git commit -m "feat: passkeys — Edge Functions, migration, UI"
git push origin main
```

Cloudflare Pages will auto-build from `main`. While it builds, do Steps 2–3.

---

## Step 2 — Link Supabase and push migrations

### 2a. Find your project ref
Go to https://supabase.com/dashboard  
Open your project → the URL will be:  
`https://supabase.com/dashboard/project/XXXXXXXXXXXXXXXXXXXX`  
That 20-character string is your **project ref**.

### 2b. Link and push

```powershell
supabase link --project-ref XXXXXXXXXXXXXXXXXXXX
supabase db push
```

This applies all pending migrations including the new `passkeys` and `webauthn_challenges` tables.

---

## Step 3 — Deploy the Edge Functions

```powershell
supabase functions deploy webauthn-register-begin
supabase functions deploy webauthn-register-complete
supabase functions deploy webauthn-authenticate-begin
supabase functions deploy webauthn-authenticate-complete
```

### 3a. Set Edge Function secrets
In the Supabase Dashboard → Settings → Edge Functions → Secrets, add:

| Secret | Value |
|---|---|
| `WEBAUTHN_RP_ID` | `horrorwriter.org` |
| `WEBAUTHN_ORIGIN` | `https://horrorwriter.org` |

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

---

## Step 4 — Fix the custom domain on Cloudflare Pages

The site is deployed but `horrorwriter.org` still points to an old Pages project.

1. Go to https://dash.cloudflare.com → **Workers & Pages**
2. Open the **old** project → Settings → Custom Domains → remove `horrorwriter.org`
3. Open the **horrorwriter** project → Settings → Custom Domains → add `horrorwriter.org`
4. Cloudflare will provision the SSL certificate automatically (takes ~1 minute)

---

## Step 5 — Verify Cloudflare Pages environment variables

In the **horrorwriter** Pages project → Settings → Environment variables, confirm all three exist for **Production** (and optionally Preview):

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Dashboard → Turnstile |

Trigger a manual redeploy after adding/changing env vars.

---

## Step 6 — Add the live domain to Supabase Auth

In Supabase Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://horrorwriter.org`
- **Redirect URLs:** add `https://horrorwriter.org/auth/callback`

---

## Step 7 — Custom SMTP (so magic links come from @horrorwriter.org)

Right now magic links arrive from `noreply@mail.app.supabase.io`. To fix:

1. Sign up for **Resend** (https://resend.com) — free tier is fine to start
2. Add and verify `horrorwriter.org` as a sending domain (adds DNS TXT records in Cloudflare)
3. Create an API key in Resend
4. In Supabase Dashboard → Authentication → SMTP Settings:
   - Enable Custom SMTP
   - Host: `smtp.resend.com` · Port: `465` · User: `resend`
   - Password: your Resend API key
   - Sender email: `noreply@horrorwriter.org`
5. Optionally: Supabase Dashboard → Authentication → Email Templates → customize the magic link email to match the VHS aesthetic

---

## Done ✓

Once all steps are complete:
- `horrorwriter.org` serves the live React app
- Magic-link sign-in works from the site's own domain
- Users can register and sign in with passkeys (Face ID / Touch ID / PIN)
- Forum, Library, Rituals, and all profile features are live on real data
