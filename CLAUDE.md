# HorrorWriter — CLAUDE.md

horrorwriter.org: Astro 7 (React islands) on Cloudflare Workers, Supabase backend. Solo-run by Jeff.
**This file is for one thing: landing code without breaking production.** Planning lives in the
Obsidian vault (`D:\CLAUDECODE\Vault\02_Projects\horrorwriter\`, not in git) — read `now.md` first.

## How work lands
- Claude branches, commits, opens the PR. Jeff reviews and merges. Never push `main`; `main` auto-deploys.
- `main` requires passing `vitest` on an up-to-date branch, no bypass.
- When Jeff must run something: exact command + what to look for. Don't narrate.
- `npm run dev` uses a **local** Supabase stack (`.env.development`); real members' data is never a dev target. Verification of a PR is on its Workers preview, against the live database.
- Check state before diagnosing: `git status`, which environment, is it deployed, browser console.

## Traps (each cost a prod bug)
- `withProviders` is a **named** export of `src/components/Providers.jsx`. A default import crashes SSR (`reading 'useState'`).
- Hooks before early returns in islands.
- Islands don't share React context — each `client:load` is its own root. Shared state goes through module globals in `AuthContext.jsx`; `getSession().then()` must `await` the profile fetch.
- Cross-island events must survive hydration — persist a flag (`window.__signinPending`), never rely on a live CustomEvent.
- Never ship a primary CTA hidden-until-JS. Render visible server-side; JS upgrades it.
- `supabase` may be null — guard before querying.
- `public/_headers`: `microphone=(self)` (else Dictate dies silently); CSP `script-src` keeps `'unsafe-inline'` (else no island hydrates). Only exit: Astro build hashes **and** remove `script-src` from `_headers` in the same change.
- `_headers` is invisible to `npm run dev` — verify on the PR's Workers preview. Dead hydration tell: network shows CSS/fonts, zero JS.
- `wrangler.toml` has no `main`/`[assets]` on purpose. Its `[vars]` name production Supabase, but `.env.development` outranks them for `npm run dev`. If dev ever shows real stories, stop: that file is missing or overridden by a `.env.development.local`.
- `package.json` overrides pin `vite ^8`. Don't let npm downgrade it.
- Pages render inside workerd, even in `npm run dev`: the shell's `process.env` is empty there. `process.env.PLAYWRIGHT_TEST` was always undefined, so every SSR "skip in tests" guard hit the live DB. Test mode is `isPlaywrightTest()` (`src/lib/testMode.js`), baked in by `vite.define` in `astro.config.mjs`.
- Schema change = numbered migration in `supabase/migrations/` + `NOTIFY pgrst, 'reload schema';`.
- Backups: the Free plan has none. `.github/workflows/backup.yml` dumps nightly to R2; restore steps in `docs/ops/backup-and-restore.md`. Before a destructive migration, run the Backup workflow by hand and wait for green.
- Merging a migration applies it to production. Never use MCP `apply_migration`. The site has real members: rehearse **every** migration in `begin; … rollback;` via `npx supabase db query --remote -f <file>`, or `powershell -File scripts/sql/rehearse.ps1 -Test <test.sql> -Migration <migration.sql>`. `--linked` is deprecated in CLI v3 and goes away in v4. A migration on a PR branch must be checked out locally first.
- New functions are private: client-callable ones (incl. RLS helpers) need `GRANT EXECUTE ... TO authenticated` (`anon` only if needed). After any migration, `scripts/sql/verify-grants.sql` must return zero rows.
- `profiles` has column-level grants (20261020020000): `select('*')` fails — use `PROFILE_COLUMNS` from `src/lib/profile.js`. A new profiles column needs `grant select (col) on public.profiles to anon, authenticated` in its migration. Sanction columns are mod-only via `mod_get_profile` / `mod_list_users` / `mod_active_sanctions`.
- `transparency_log` is an RPC (`get_transparency_log`), not a view. `site_settings` writes only via `set_site_setting()` — no UPDATE policy.
- Tailwind v4 zeroes `<p>` margins; spacing lives in `.prose-book p` / `.prose p`.
- Reds: `--color-ember` `#FF3B2F` for anything small or interactive (default). `--color-blood` `#C8102E` only for large display type, borders, fills. `#991B1B` is banned by test.

## Commands
```powershell
npx supabase start   # local stack (Docker Desktop running); Studio :54323, mailbox :54324
npx supabase db reset  # wipe, replay every migration, load supabase/seed.sql
npm run dev          # http://localhost:5173 — local data. Sign in: keeper@ / writer@ / reader@horrorwriter.local (magic link lands in the mailbox)
npm run build
npm run test:unit
cmd /c npx playwright test
# Merge to main = deploy. By hand, after the site change is live:
#   npx wrangler deploy --config workers/transcribe/wrangler.toml
#   npx supabase functions deploy <name> --use-api
```

## Agent environment
- `gh` is authenticated on Jeff's Windows machine only.
- Cloud container: no git credentials, no route to GitHub/Supabase. `device_bash` can run git but leaves `.git/*.lock` files unless delete permission is granted.
- Windows `node_modules` won't load on Linux — copy to `/tmp` and reinstall to run tests there. E2E runs on Jeff's machine.
