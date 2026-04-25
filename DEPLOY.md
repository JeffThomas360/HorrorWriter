# Deploying horrorwriter.org to Cloudflare Pages

You have nothing set up yet. This walks you from a blank Cloudflare account to a live site at **horrorwriter.org** in roughly 20 minutes. Pure static for now — the real backend (D1 database, passkey auth, magic links) comes in pass two.

> Everything here uses Cloudflare's free tier. No credit card required for what we're doing.

---

## What you'll end up with

- `horrorwriter.org` and `www.horrorwriter.org` both serving the prototype over HTTPS
- Free SSL certificate, auto-renewed
- Push-to-deploy: commit to GitHub → live in ~30 seconds
- A staging URL (`horrorwriter.pages.dev`) for previewing before the domain flips

---

## Step 1 — Create a Cloudflare account (2 min)

1. Go to <https://dash.cloudflare.com/sign-up> and sign up with your email.
2. Verify your email. Skip any "add a site" wizards for now — we'll come back.

---

## Step 2 — Get your domain onto Cloudflare DNS (5 min)

If horrorwriter.org is registered somewhere else (Namecheap, GoDaddy, Google Domains, etc.), you need to point its **nameservers** at Cloudflare so Cloudflare can manage its DNS. (You don't have to transfer the registration — just the DNS.)

1. In the Cloudflare dashboard, click **+ Add a site** in the top bar.
2. Type `horrorwriter.org` and choose the **Free** plan.
3. Cloudflare scans existing DNS records — accept whatever it finds.
4. Cloudflare gives you **two nameservers** that look like:
   ```
   gina.ns.cloudflare.com
   walt.ns.cloudflare.com
   ```
5. Log in to your domain registrar (wherever you bought horrorwriter.org). Find the nameserver settings (sometimes called "DNS servers" or "custom nameservers"). Replace whatever's there with the two Cloudflare gave you.
6. Back in Cloudflare, click **Done, check nameservers**. Propagation usually takes 5–30 minutes; sometimes a few hours. You can keep going while you wait.

If horrorwriter.org isn't registered yet, the simplest path is to register it directly through Cloudflare Registrar — no nameserver dance needed. Go to **Domain Registration → Register Domains** in the dash.

---

## Step 3 — Put the prototype on GitHub (5 min)

Cloudflare Pages deploys from a Git repo. If you don't have one yet:

1. Create a free GitHub account at <https://github.com/signup> if needed.
2. On GitHub, click **+ → New repository**. Name it `horrorwriter` (private is fine). Don't initialize with anything.
3. On your computer, in a Terminal:
   ```bash
   cd ~/Desktop          # or wherever you want the project
   mkdir horrorwriter && cd horrorwriter
   # Copy index.html into this folder, then:
   git init
   git add index.html
   git commit -m "first cut: VHS prototype"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/horrorwriter.git
   git push -u origin main
   ```

Don't have git installed? Install it from <https://git-scm.com/downloads>, or use GitHub Desktop (<https://desktop.github.com>) and drag the folder in.

---

## Step 4 — Connect Cloudflare Pages to the repo (3 min)

1. In Cloudflare dashboard, left sidebar → **Workers & Pages**.
2. Click **Create application** → **Pages** tab → **Connect to Git**.
3. Authorize Cloudflare to access your GitHub. Pick the `horrorwriter` repo.
4. On the build settings screen:
   - **Project name:** `horrorwriter` (this becomes `horrorwriter.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** *None*
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (just a slash — root of the repo)
5. Click **Save and Deploy**.

In ~30 seconds, you'll see your site at `https://horrorwriter.pages.dev`. Open it. The prototype should be live.

---

## Step 5 — Point horrorwriter.org at Pages (3 min)

This step waits on nameserver propagation from Step 2. Check by running `dig NS horrorwriter.org` in a Terminal — if it shows `*.ns.cloudflare.com`, you're good.

1. In your Pages project, go to **Custom domains** → **Set up a custom domain**.
2. Enter `horrorwriter.org`. Cloudflare auto-creates the DNS records (a CNAME). Click **Activate domain**.
3. Repeat for `www.horrorwriter.org` so both work.
4. Wait 1–5 minutes. Cloudflare provisions a TLS certificate automatically.

Visit <https://horrorwriter.org>. You should see the prototype.

---

## Step 6 — Update the site

Any time you want to change something:

```bash
# edit index.html
git add index.html
git commit -m "added a thing"
git push
```

Cloudflare Pages auto-builds and deploys on every push to `main`. Branches other than `main` get preview URLs (great for testing redesigns without touching production).

---

## Optional polish

- **Analytics:** Cloudflare Web Analytics is free and privacy-friendly. Pages → your project → **Analytics** → enable.
- **Rewrites & redirects:** Add a `_redirects` file in the repo root if you need any (`/old /new 301`).
- **Custom 404:** Add `404.html` in the repo root; Pages will serve it on missing paths.
- **Headers (CSP, etc.):** Add a `_headers` file (Cloudflare Pages format).

---

## What's next — the real backend (pass two)

When you're ready to wire up actual functionality, we'll add:

| Concern | Service | Cost |
|---|---|---|
| Database (forum threads, posts, profiles, books) | **Cloudflare D1** (SQLite at edge) | Free tier: 5M reads/day |
| File storage (book covers, attachments) | **Cloudflare R2** (S3-compatible) | Free tier: 10GB |
| Passkey auth (WebAuthn) | **`@simplewebauthn/server`** running on Pages Functions | Free |
| Magic-link email | **Resend** (3,000/month free) or **Postmark** | Free tier |
| Sessions | **Cloudflare KV** or signed JWTs in cookies | Free tier |
| Framework | **SvelteKit** w/ `@sveltejs/adapter-cloudflare` (recommended) — or plain Hono on Pages Functions | Free |

The migration path:
1. Drop the prototype's HTML/CSS into a SvelteKit project as components.
2. Add `wrangler.toml` with D1 + R2 + KV bindings.
3. Build out routes: `/api/auth/passkey/{begin,finish}`, `/api/auth/magic/{request,verify}`, `/api/threads`, `/api/books`, `/api/prompts`.
4. Schema migration files in `migrations/0001_init.sql`.
5. Same `git push` deploys frontend + backend together.

When you're ready, say the word and I'll scaffold the whole thing.

---

## Troubleshooting

**"Site can't be reached" on horrorwriter.org**
Nameservers haven't propagated yet. Wait. Test with `dig horrorwriter.org` — if you see Cloudflare's IPs, refresh the browser.

**Pages deployment failed**
Check the build log. Most likely: build output directory wrong. For this prototype, leave the build command blank and set output to `/`.

**Custom domain stuck on "Verifying"**
Make sure horrorwriter.org's nameservers are Cloudflare's, not the registrar's defaults. Step 2 has to be complete first.

**HTTPS not working**
Cloudflare provisions certs automatically but can take up to 24h on rare occasions. Usually it's 5 minutes. If still broken after a day, check **SSL/TLS → Edge Certificates** for the cert status.
