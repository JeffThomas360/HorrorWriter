# HorrorWriter — CLAUDE.md

A horror writing community at **horrorwriter.org**. Astro 7 (React islands) on Cloudflare Workers,
Supabase backend. Solo-maintained by Jeff; must stay non-technical for writer users and
low-maintenance to run.

> ## 📖 The source of truth is the Obsidian vault
>
> **`D:\CLAUDECODE\Vault\02_Projects\horrorwriter\`**
>
> | | |
> |---|---|
> | `project-overview.md` | Hub — start here |
> | `roadmap.md` | The board: what's open, in order. Only what's open. |
> | `standing-decisions.md` | The rules still in force — including how Claude works on this repo |
> | `work/*.md` | Themed notes; each `##` is one open item sized to a PR. Work it out in the note. |
> | `stewing-on-jeffs-input/` | Gray-area items with a decision attached. Don't start from these alone. |
> | `reference/architecture.md` | Stack, island model, structure, database, design system, testing |
> | `reference/infrastructure.md` | Supabase, Workers, deploy, secrets |
> | `_archive/` | What shipped and why. History only. |
>
> **Read `project-overview.md` before starting work.** This file carries only the traps that bite
> while editing code — everything else lives in the vault and is not duplicated here.

## How work lands

- **Claude commits, pushes a feature branch, and opens the PR. Jeff reviews and merges.**
  Claude never pushes `main` and never merges — `main` auto-deploys with no CI gate in front of it.
- After a code change, state the exact commands (`npm run test:unit`, `npm run build`,
  `npx playwright test`) — Jeff runs them. Don't narrate process.
- One deliverable at a time. Name scope creep out loud, with its cost, before acting on it.
- **Check state before diagnosing:** `git status`, which environment, is it deployed — and for
  anything visible in a browser, **read the console first.**
- Before picking work, `git log --since=<vault date>` and diff it against the board. The vault has
  drifted before.

---

## ⚠️ Traps

These have each cost a production bug or a debugging session.

- **`withProviders` is a NAMED export** from `src/components/Providers.jsx`; the default export is
  `Providers`. A default import compiles fine, then crashes at SSR with
  `Cannot read properties of null (reading 'useState')`. Guarded by a regression test.
- **Hooks before early returns** in island components. A hooks-after-return bug crashed the story
  reader in production (`6b69881`).
- **Islands don't share React context.** Each `client:load` is a separate React root, so one page
  has several `AuthProvider` instances. They coordinate through module-scoped globals in
  `AuthContext.jsx` (`globalInFlight`, `globalProfileCache`). Any new shared or loading state must
  resolve correctly for *every* instance — and `getSession().then()` must `await` the profile fetch
  or `isLoading` never clears (`fd3c35d`).
- **Cross-island events must survive the hydration gap** — persist a flag (see
  `window.__signinPending` in `MainLayout.astro`); never rely on catching a live CustomEvent.
- **Never ship a primary CTA as `class="hidden"` revealed by script.** Render it visible
  server-side and let JS *upgrade* it; a JS failure must not leave the landing page with no call to
  action (`ccd4656`, the 2026-09-06 outage).
- **`supabase` may be null** (unconfigured env) — guard before querying.
- **`Permissions-Policy` microphone must stay `(self)`** in `public/_headers`. `microphone=()`
  silently kills Dictate in production with no error anywhere.
- **CSP `script-src` must keep `'unsafe-inline'`** in `public/_headers`. Astro hydrates every
  `client:load` island via an *inline* `<script type="module">`; `script-src 'self'` blocks all of
  them, so **no island ever hydrates** while the page still looks normal (the SSR'd HTML renders
  fine). Deliberate trade — see `standing-decisions.md`. The agreed way out is Astro build-time
  hashes **with `script-src` removed from `_headers` in the same change** (meta and header CSPs are
  intersected by the browser).
- **`public/_headers` is invisible to `npm run dev`** — it's a Cloudflare static-hosting file, so a
  header change that passes locally can be totally broken in production. Verify on the PR's Workers
  Builds preview. **Tell for dead hydration:** network panel shows CSS and fonts only, zero JS.
- **`wrangler.toml` has no `main` or `[assets]` on purpose** — the Cloudflare Vite plugin validates
  `main` at build start, before `dist/` exists, and would error.
- **`wrangler.toml` points local dev at the production Supabase project.** `npm run dev` reads and
  writes live data. Local is fine for code/render/console breakage; not for exercising writes.
- **Astro 7 ↔ Vite 8:** `package.json` `overrides` pins `vite ^8`. Don't let npm downgrade it.
- **Schema changes need a numbered migration in `supabase/migrations/` AND a PostgREST cache
  reload** — `NOTIFY pgrst, 'reload schema';` — or the API throws
  `Could not find the '<col>' column of '<table>' in the schema cache` while the column plainly
  exists (`books.updated_at`, 2026-09-07).
- **Every new function in `public` starts with `EXECUTE TO PUBLIC`.** That is Postgres's default
  ACL, and `CREATE OR REPLACE` won't fix it later — only a first-time `CREATE` gets it. A
  migration that adds a function must `REVOKE ... FROM PUBLIC` and `GRANT` deliberately in the
  same file (pattern: `20260908010000` lines 270–271). After **any** migration, run
  `scripts/sql/verify-grants.sql` — it must return zero rows. This reopened once already
  (`20260702000000` fixed it; the 2026-08-19 storm work reopened it).
- **`transparency_log` is an RPC** (`get_transparency_log`), not a view, since `20260907000000`.
  Don't recreate the view; the advisor ERROR it cleared will come back.
- **`site_settings` has no client write path.** All writes go through `set_site_setting()`, which
  logs to `mod_actions`. Don't add an UPDATE policy.
- **Tailwind v4 resets `<p>` margins to 0.** Paragraph spacing lives in `.prose-book p` / `.prose p`
  in `global.css`; a bare `<p>` has none.
- **Two reds, and they are not interchangeable.** `--color-blood` `#C8102E` measures **3.38:1** on
  `--color-void` — WCAG AA for *large* text only (≥24px, or ≥18.66px bold). `--color-ember`
  `#FF3B2F` measures **5.61:1** and clears AA at any size. Blood for display type, borders and fills
  (white or bone *on* blood is fine); **ember for anything interactive or small.** Most of this
  site's text is small, so ember is the default red, not the exception. `#991B1B` is gone —
  `designTokens.test.js` bans its return.

## Commands

```powershell
npm run dev          # astro dev — http://localhost:5173 (astro.config.mjs server.port)
npm run build        # astro build → dist/ (Cloudflare adapter)
npm run test:unit    # vitest run — 137 tests / 18 suites as of 2026-09-07; the count moves
npx playwright test  # E2E, 12 spec files. From PowerShell prefix with `cmd /c` (npx.ps1 is blocked).

# Release: merge to main → Cloudflare Workers Builds auto-deploys. (Pages is dead; don't cite it.)
# Transcribe Worker is NOT auto-deployed: cd workers/transcribe; npx wrangler deploy
```

## Environment notes

- **`gh` CLI is authenticated** (`JeffThomas360`) — `gh pr create` works. **On Windows only.** The
  agent's Linux workspace starts each session without it; background processes die when a shell
  call returns, so `gh auth login --web` can't be used there. Recipe that works (2026-09-10):
  download the release tarball to `$HOME/bin`, then split the OAuth device flow across two calls —
  `POST github.com/login/device/code` with `client_id=178c6fc778ccc68e1d6a` and
  **`scope=repo workflow read:org`** (`gh` refuses a token without `read:org`), show Jeff the code,
  then `POST login/oauth/access_token` piped straight into `gh auth login --with-token`. The token
  must never be printed. Read access to the public repo needs none of this — plain `curl` to
  `api.github.com` works from that workspace.
- **Dependabot pushes to `main` unattended, and `main` auto-deploys.** Unit tests run on PRs only.
- **Agent shells:** the cloud container has no git credentials and no route to GitHub or Supabase.
  The desktop Linux workspace (`device_bash`) can run git, but **cannot unlink files** — every
  index-touching git command leaves a `.git/index.lock` behind unless delete permission was
  granted. Playwright's browser download is blocked in both; E2E runs on Jeff's machine. Unit tests
  and `npm run build` work only after copying the repo to `/tmp` and reinstalling — the Windows
  `node_modules` holds native binaries Linux can't load.
- **If "Supabase not configured" appears in production,** check Workers Builds → Settings → Build →
  Variables for the `VITE_*` set.
- Plan docs under `docs/superpowers/` have **stale checkboxes** — they were never ticked as work
  landed. Trust `git log`.
