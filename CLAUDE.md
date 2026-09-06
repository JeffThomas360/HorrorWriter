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
> | `roadmap.md` | The board: what to work on, in order |
> | `work/*.md` | One note per task, sized to a PR. Work it out in the note. |
> | `reference/architecture.md` | Stack, island model, structure, database, design system, testing |
> | `reference/infrastructure.md` | Supabase, Workers, deploy, secrets |
> | `decisions-and-milestones.md` | What shipped, what was decided, what's superseded |
>
> **Read `project-overview.md` before starting work.** This file carries only the traps that bite
> while editing code — everything else lives in the vault, and is not duplicated here.

---

## ⚠️ Traps

These have each cost a production bug or a debugging session.

- **`withProviders` is a NAMED export** from `src/components/Providers.jsx`; the default export is
  `Providers`. A default import compiles fine, then crashes at SSR with
  `Cannot read properties of null (reading 'useState')`. This is the live `/library/series/[id]`
  500 — see `work/series-hub-500.md`.
- **Hooks before early returns** in island components. A hooks-after-return bug crashed the story
  reader in production (`6b69881`).
- **Islands don't share React context.** Each `client:load` is a separate React root, so one page
  has several `AuthProvider` instances. They coordinate through module-scoped globals in
  `AuthContext.jsx` (`globalInFlight`, `globalProfileCache`). Any new shared or loading state must
  resolve correctly for *every* instance.
- **Cross-island events must survive the hydration gap** — persist a flag (see
  `window.__signinPending` in `MainLayout.astro`); never rely on catching a live CustomEvent.
- **`supabase` may be null** (unconfigured env) — guard before querying.
- **`Permissions-Policy` microphone must stay `(self)`** in `public/_headers`. `microphone=()`
  silently kills Dictate in production with no error anywhere.
- **CSP `script-src` must keep `'unsafe-inline'`** in `public/_headers`. Astro hydrates every
  `client:load` island via an *inline* `<script type="module">`; `script-src 'self'` blocks all of
  them, so **no island ever hydrates** while the page still looks normal (the SSR'd HTML renders
  fine). Sign-in modal, notifications bell, mobile menu all dead, and `UserMenu` frozen on its
  server-rendered `▸ Reading coven...`. Deliberate trade — see `standing-decisions.md`, don't
  "harden" it back.
- **`public/_headers` is invisible to `npm run dev`** — it's a Cloudflare static-hosting file, so a
  header change that passes locally can be totally broken in production. Verify on the PR's Workers
  Builds preview. **Tell for dead hydration:** network panel shows CSS and fonts only, zero JS.
- **Read the browser console before reading component source.** The CSP outage above was first
  misdiagnosed as an `AuthContext` loading-state bug from source alone; the console named the real
  cause in one look. Cost a wasted PR and deploy cycle.
- **`wrangler.toml` has no `main` or `[assets]` on purpose** — the Cloudflare Vite plugin validates
  `main` at build start, before `dist/` exists, and would error.
- **Astro 7 ↔ Vite 8:** `package.json` `overrides` pins `vite ^8`. Don't let npm downgrade it.
- **Crimson `#991B1B` fails WCAG contrast at small sizes** — hovers, borders and large display type
  only, never body copy.

## Commands

```powershell
npm run dev          # astro dev — http://localhost:5173
npm run build        # astro build → dist/ (Cloudflare adapter)
npm run test:unit    # vitest run — 39 tests
npx playwright test  # E2E, 54 tests. From PowerShell prefix with `cmd /c` (npx.ps1 is blocked).

# Release: git push to main (Workers Builds auto-deploys)
# Transcribe Worker is NOT auto-deployed: cd workers/transcribe; npx wrangler deploy
```

## Environment notes

- **`gh` CLI is authenticated** (`JeffThomas360`) — `gh pr create` / `gh pr merge` work.
- **Dependabot pushes to `main` unattended, and `main` auto-deploys. There is no CI test gate.**
- **Agent sandbox:** Playwright's browser download is blocked, so E2E must run on Jeff's machine.
  Unit tests and `npm run build` work, but only after copying the repo to `/tmp` and reinstalling —
  the Windows `node_modules` holds native binaries Linux can't load.
- **If "Supabase not configured" appears in production,** check Workers Builds → Settings → Build →
  Variables for the `VITE_*` set.
- Plan docs under `docs/superpowers/` have **stale checkboxes** — they were never ticked as work
  landed. Trust `git log`.
