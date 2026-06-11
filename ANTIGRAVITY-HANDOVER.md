# HorrorWriter — Handover (for Google Antigravity / any fresh agent)

**Written:** 2026-06-10 · **Repo:** `D:\CLAUDECODE\Projects\horrorwriter` · **GitHub:** https://github.com/JeffThomas360/HorrorWriter
This file is self-contained: it assumes you have **no prior context, no special memory, and no MCP connections**. Everything needed to continue is below or referenced by path.

---

## 1. What this project is

A horror-writing community at **horrorwriter.org**. React 19 + Vite 7 SPA on Cloudflare Pages, Supabase backend (Postgres + Auth + Storage + Edge Functions). Auth = Supabase magic-link + WebAuthn passkeys (+ feature-flagged Google OAuth). Full project reference lives in **`CLAUDE.md`** at the repo root (note: `CLAUDE.md` is gitignored, but the file exists locally — read it first; it has the full stack, infra, table list, and deploy workflow).

**The site is pre-launch** (not truly live to real users). There is exactly one real account.

---

## 2. Current state (as of this handover)

### Branches
- **`main`** — clean, synced with origin, deployed to production. Everything below under "Done" is here.
- **`feat/moderation-phase-1`** — active work branch, pushed to origin. Contains moderation Phase 1 Tasks 1–2 (see §5). **Resume here.**

### Done and deployed on `main` this session
- **Passkeys rebuilt to the WebAuthn standard** and deployed (edge functions + frontend). Single "Add a passkey" button, **no forced `authenticatorAttachment`** (forcing `cross-platform` was routing Windows to the OS dialog). The site CANNOT choose the provider (Bitwarden vs Windows Hello) — that's a browser/OS/client decision by spec. A help disclosure on the Profile page explains this to users (incl. the "site in your password manager's excluded domains" gotcha).
- **Database wiped to a clean slate and rebuilt** from the consolidated baseline (`supabase/migrations/00000000000000_baseline.sql`), then **streamlined + security-hardened**. Supabase security advisors are down to by-design findings only. Seeds intact: 5 forum `categories`, 4 `mod_role_badges`.
- **First Keeper bootstrapped:** the account `beetlebub` (`orig.beetlebub@gmail.com`) has `profiles.mod_role = 'keeper'`, `mod_scope = 'all'`, logged in `mod_actions`.

### NOT deployed / NOT on main
- All moderation **behavior + UI** (Phases 1–6). The schema/data model exists (empty tables + helper functions) but there is **no moderator UI mounted yet** (`/moderation` route is unmounted; Nav `[Terminal]` link is gated off).

---

## 3. Infrastructure (you'll need these)

| Thing | Value |
|---|---|
| Supabase project ref | `bmvvugrfnuedjlucmlbw` |
| Supabase CLI | linked already (`supabase link --project-ref bmvvugrfnuedjlucmlbw`); `supabase migration list --linked` works non-interactively |
| Cloudflare Pages project | `horrorwriter` (the Pages one) |
| Edge functions (deployed) | `webauthn-register-begin/complete`, `webauthn-authenticate-begin/complete` |
| Transcribe Worker | `horrorwriter-transcribe` (separate CF Worker) |
| Node | 20 (pinned in `.nvmrc`) |

**This is a Windows machine.** Shell is PowerShell; a bash tool is also available. `npm` works fine.

**I (the previous agent) used a Supabase MCP connection for DB work.** Antigravity likely won't have that — use the **Supabase CLI** (`supabase db push`, `supabase migration list --linked`) or the **Supabase dashboard SQL editor** instead. `gh` CLI is **not authenticated** — open PRs via the GitHub web URL.

---

## 4. Build / test / deploy commands

```powershell
# Build
npm run build

# Unit tests (Vitest — pure logic; added this session)
npm run test:unit

# E2E tests (Playwright, chromium)
npx playwright test                      # all
npx playwright test moderation.spec.js   # one file

# Deploy frontend to Cloudflare Pages (MANUAL — no auto-deploy on push)
npm run build
npx wrangler pages deploy dist --project-name horrorwriter

# Deploy edge functions
npx supabase functions deploy <name>

# Apply a DB migration to remote (DO NOT use `db reset` — see §6)
npx supabase db push
```

**There is no GitHub→Pages auto-deploy.** Every production deploy is the manual `wrangler` command above. Pushing to GitHub only syncs the repo.

---

## 5. The active work: Moderation Suite

### Design docs (read these — they're the source of truth)
- `docs/superpowers/specs/2026-06-08-moderation-suite-design.md` — full approved design (roles, RLS model, tables, phases).
- `docs/superpowers/specs/2026-06-10-moderation-suite-addendum.md` — this session's decisions: transparency model, 4 deltas (inline actions, mobile, public tombstone, reporter-specific outcomes), phase-by-phase delivery.
- `docs/superpowers/plans/2026-06-10-moderation-phase-1-foundation.md` — **the Phase 1 implementation plan with copy-paste-ready code and TDD steps for all 9 tasks.**

### Phase roadmap (each ships independently)
- **Phase 1 — Foundation:** roles/capabilities, Keeper RPCs, public badges, terminal shell + Registry + Badges tabs. ← in progress
- Phase 2 — Reporting + inline takedown + notifications bell (the "react fast" payoff)
- Phase 3 — Bans/suspensions + read-only enforcement + appeals
- Phase 4 — Audit tab + reversible-hide UX + mod notes + resolution notices
- Phase 5 — Lightweight auto-filter
- Phase 6 — Terminal polish + Community Guidelines page

### Phase 1 status (on `feat/moderation-phase-1`)
| Task | What | Status |
|---|---|---|
| 1 | Add Vitest tooling | ✅ committed (`a428ecc`) |
| 2 | `src/lib/moderation.js` capability helper + 9 unit tests | ✅ committed (`e081d6e`) |
| 3 | `set_mod_role` + `set_role_badge` Keeper RPCs (migration) + authz test | ⬜ **resume here** |
| 4 | `src/lib/modActions.js` wrappers + `useModBadges` hook | ⬜ |
| 5 | `ModBadge` component + render on `ProfileHead` | ⬜ |
| 6 | `/moderation` route + disguised-404 gate + Nav link | ⬜ |
| 7 | Registry tab (search + assign/revoke) | ⬜ |
| 8 | Badges tab (edit emoji/label) | ⬜ |
| 9 | Stale-mock cleanup + full suite green | ⬜ |
| — | merge → `main`, build + `wrangler pages deploy` | ⬜ |

### How to resume Phase 1
1. `git checkout feat/moderation-phase-1`
2. Open the Phase 1 plan and execute **Task 3 onward**, in order. Each task is TDD: write failing test → confirm fail → implement (exact code in the plan) → confirm pass → commit.
3. Verify between tasks: `npm run test:unit` and `npx playwright test`.
4. Task 3 applies a real migration to the remote DB (additive, safe) — use `supabase db push` or the dashboard, NOT `db reset`.

---

## 6. Critical gotchas (do not relearn the hard way)

- **NEVER run `supabase db reset` on the linked/remote DB now.** It wipes all data including the Keeper bootstrap (`beetlebub`). The "consolidated baseline + reset" pattern was a *pre-data* convenience. **From Phase 1 on, schema changes are incremental migrations applied on top** (`supabase db push`), not baseline edits + reset.
- **Passkeys:** never force `authenticatorAttachment`. A relying party cannot choose the passkey provider — it's a client/browser decision. Don't re-introduce a "synced vs device-bound" two-button UI; it's an anti-pattern that was removed. See the help text in `src/pages/Profile.jsx`.
- **Role assignment can't be a plain client UPDATE** — `profiles` RLS only allows self-updates. Cross-user role changes go through the `set_mod_role` SECURITY DEFINER RPC (Task 3), which self-checks Keeper and writes the audit row atomically.
- **`tests/mocks.js` still has pre-baseline cruft** (`is_admin`, `approved=eq.false`, `moderation_flags`). Task 9 cleans it; don't trust those branches.
- **No auto-deploy.** Manual `wrangler` deploy every time.
- **Security advisors:** after any DDL, run them (Supabase dashboard → Advisors, or CLI). The remaining warnings (`mod_can`/`content_visible` executable, `avatars` public-bucket listing, `webauthn_challenges` RLS-no-policy) are **intentional/by-design** — don't "fix" them (it breaks RLS).

---

## 7. Standing backlog (not started, lower priority)
- Set `VITE_TRANSCRIBE_URL` in Cloudflare Pages env (Production + Preview) then redeploy — transcription needs it.
- Pagination on `ThreadView` (fetches all posts at once).
- Delete the old, domain-less Cloudflare Worker named `horrorwriter`.
- Connect GitHub → Cloudflare Pages for auto-deploy.
- `gh auth login` so PRs can be opened from the CLI.

---

## 8. Database quick reference
Tables: `profiles` (carries `mod_role`, `mod_scope`, `requires_screening`, `is_shadowbanned`, `banned_until`, `ban_reason`), `passkey_credentials` (+ `attachment`), `webauthn_challenges`, `books`, `categories`, `threads`, `posts`, `book_comments` (content tables carry `mod_status` = `live|screening|hidden`), and the moderation set: `reports`, `mod_actions`, `notifications`, `mod_role_badges`, `filter_rules`. Key SQL helpers: `mod_can(action, area)`, `content_visible(status, author, area)`. RLS is ON for all tables and is the real authorization gate. Full notes in `CLAUDE.md`.
