# HorrorWriter — Engineering Roadmap

> **Living roadmap. Tool-agnostic.** Any contributor or AI agent can pick up the next unchecked
> piece and execute it. Work **top-down** (pieces are sorted by impact, highest first). Each piece
> is self-contained, independently shippable, and must leave the suite green. We are in
> **stability mode** — prefer small, verifiable changes over new scope.

## Context snapshot (for someone arriving cold)

- **What it is:** a horror-writing community at **horrorwriter.org**.
- **Stack:** Astro 6 (file-based routing in `src/pages/*.astro`) mounting React 19 islands
  (`src/pages-react/*`), Tailwind v4, Supabase (Postgres + Auth + Storage + Edge Functions),
  deployed to Cloudflare Pages on push to `main`. Full architecture in `CLAUDE.md`.
- **Supabase project ref:** `bmvvugrfnuedjlucmlbw`.
- **Recently completed:** migration off the React+Vite SPA to Astro; fixed a multi-island
  `AuthContext` loading race; removed 14 dead files + 3 unused deps (`react-router-dom`,
  `framer-motion`, `@tanstack/react-query-devtools`); tightened CSP (self-hosted fonts).

### How to verify any change
```bash
npm run build          # Astro production build (Cloudflare adapter) — must succeed
npm run test:unit      # vitest unit tests — must pass
npx playwright test    # E2E (chromium) — must pass
# Windows: prefix Playwright with `cmd /c`, or run from a POSIX shell (PowerShell blocks npx.ps1).
```
A change is **not done** until build + unit + E2E are green and the piece's own "Done when" holds.

### Status legend
`[ ]` todo · `[~]` in progress · `[x]` done. Update this file as pieces land.

---

## Step 0 — Lock in the cleanup *(prerequisite · ~5 min)*
The dead-code/dependency cleanup + CSP tighten are verified but uncommitted.
- [ ] Commit the working-tree cleanup as its own commit (separate from the migration)
- **Done when:** working tree is clean and `git log` shows the cleanup commit.

---

## P1 — Confirm the live site actually works *(impact: highest · effort: S)*
**Why:** the migration shipped, but passkey / Google / magic-link / transcription are only
*mock*-verified. If a core flow is broken, nothing else matters. Fast, removes the biggest unknown.
- [ ] Sign in end-to-end with a **passkey** on production
- [ ] Sign in with **Google** and with a **magic link**
- [ ] Run **audio transcription** on a real recording
- [ ] One real write per area: publish a story; post a thread reply
- **Done when:** every flow is confirmed against real Supabase, or a bug is filed for each failure.

## P2 — Lock down data access (RLS authorization) *(impact: highest security · effort: M)*
**Why:** the client `RequireAuth` guard is UX only; Postgres **RLS is the real protection**. This is
the foundation before the community grows.
- [ ] Audit RLS policies table-by-table: `profiles, books, threads, posts, book_comments, reports,
      mod_actions, notifications, mod_role_badges, filter_rules` — confirm owner-write / correct-read
- [ ] Add authorization tests on a seeded test project: user A **cannot** update/delete user B's
      profile, book, post, or comment
- [ ] Confirm mod-only tables (`mod_actions`, `filter_rules`) reject non-mods; verify
      `mod_can()` / `content_visible()` SQL helpers
- **Done when:** an authorization test suite proves cross-user isolation and passes.

## P3 — Fix mobile navigation *(impact: high UX · effort: S–M)*
**Why:** the header nav is `hidden md:flex` — on phones users **cannot reach Forum/Library**
(only logo + account menu show). A writing community skews mobile.
- [ ] Add a mobile menu (hamburger or bottom bar) in `src/layouts/MainLayout.astro`:
      Home / The Crypt / Library / account
- [ ] Keyboard- and screen-reader-accessible; matches the 1980s-paperback theme
- **Done when:** all nav is reachable at 375px width; a Playwright mobile-viewport test passes.

## P4 — Island resilience (error boundary) *(impact: medium-high stability · effort: S)*
**Why:** an island render error currently white-screens that island. One boundary in `Providers`
makes every island degrade gracefully. (The old unused `ErrorBoundary` was deleted; add a clean one.)
- [ ] Add an `ErrorBoundary` and wrap the children inside `src/components/Providers.jsx`
- [ ] On-theme fallback ("something broke" + reload action)
- **Done when:** a deliberately thrown island error renders the fallback, not a blank panel.

## P5 — Wire up notifications *(impact: medium user value · effort: S–M)*
**Why:** the **backend is already live** — moderation triggers insert `report_resolved` and
`content_actioned` rows for users — but there is **no UI**, so the loop is silently broken. Closing
it fits the site's transparency ethos and is low effort. *(Decision: build. To drop instead, remove
the notification INSERTs from the Phase-2 moderation functions and drop the table.)*
- [ ] Add a header notifications island (in/near `UserMenu`) wired into `MainLayout.astro`
- [ ] Fetch unread for current user; show count badge; dropdown to view + mark-read / mark-all-read
- [ ] Optional: realtime subscription on `notifications` filtered by `user_id`
- [ ] Style with current design tokens (`--color-*`), not the removed VHS tokens
- **Done when:** a user with unread notifications sees them, can mark them read, and the badge clears.

## P6 — Harden the CSP *(impact: medium security · effort: M)*
**Why:** `script-src` in `public/_headers` still allows `'unsafe-inline'` + `'unsafe-eval'`.
- [ ] Test-drop `'unsafe-eval'`; confirm hydration + transcription still work
- [ ] Move inline scripts to Astro CSP **nonces/hashes**; drop `'unsafe-inline'` if feasible
- **Done when:** CSP is nonce/hash-based (or at minimum `'unsafe-eval'`-free) with no console violations.

## P7 — Make the tests earn their keep *(impact: medium confidence · effort: M)*
**Why:** the 34 E2E are all mock-backed; SSR and RLS paths are uncovered and some selectors are brittle.
- [ ] Un-bypass SSR for ≥1 page so its real fetch runs in CI (today SSR pages skip the DB under
      `PLAYWRIGHT_TEST`)
- [ ] Explicit regression for the multi-island auth-loading hang (load `/profile`, assert body resolves)
- [ ] Replace brittle CSS selectors (`.form-ok`, `.modal-content`, `h2.title`) with role/label/text
- [ ] (RLS authorization tests are delivered in P2)
- **Done when:** suite is green with SSR + the auth-loading regression covered.

## P8 — Dependency & supply-chain hygiene *(impact: low-medium · effort: S)*
**Why:** one transitive high-severity advisory remains (`ws` via `@supabase/supabase-js`); low real
exposure (runs only in Node SSR, not the Cloudflare runtime).
- [ ] Resolve `ws` via an `overrides` pin or a `supabase-js` bump; re-verify realtime presence
- [ ] `npm audit --omit=dev` is clean; build + tests green
- **Done when:** no high-severity production advisories.

## P9 — Final lean trims *(impact: low · effort: S)*
- [ ] Remove vestigial `VITE_TURNSTILE_SITE_KEY` from `wrangler.toml` (no Turnstile code exists)
- [ ] Delete `scratch/` debug scripts (gitignored)
- [ ] Sync `CLAUDE.md` with any changes from P3–P5 (mobile nav, error boundary, notifications)
- **Done when:** no dead config/feature flags remain and docs match reality.

---

## Decisions log
- **2026-06-16 — Notifications: BUILD (wire existing backend to a UI), not drop.** Backend triggers
  already generate moderation notifications in production; only the header UI is missing.
- **2026-06-16 — Migration to Astro complete; dead code + unused deps removed; in stability mode.**
