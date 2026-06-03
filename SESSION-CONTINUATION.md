# HorrorWriter — Session Continuation (2026-05-30)

Handoff doc to resume work. Not committed by default — delete or keep as you like.

---

## 🚨 FIRST ACTION NEXT SESSION — ASK JEFF FOR THESE BEFORE DOING ANYTHING ELSE

Open the session by asking Jeff to provide the two Cloudflare secrets that are blocking auto-deploy:

> "Welcome back. To finish auto-deploy I need two things from you:
> 1. **`CLOUDFLARE_ACCOUNT_ID`** — Cloudflare → Workers & Pages → Account ID (right sidebar).
> 2. **`CLOUDFLARE_API_TOKEN`** — Cloudflare → My Profile → API Tokens → Create Custom Token → permission **Account › Cloudflare Pages › Edit**.
> Paste the Account ID here (I'll set it), and either paste the token or add it yourself via `! gh secret set CLOUDFLARE_API_TOKEN`. Then I'll merge PR #4 and ship the first deploy."

Do NOT start other work until that ask is made. Once both secrets exist → merge PR #4 → watch the Actions run.

---

## ⏭️ IMMEDIATE NEXT STEP (do this first)

Auto-deploy (GitHub Actions) is fully wired **except two Cloudflare secrets**. Add them, then merge PR #4 — that triggers the first production deploy.

**Add these repo secrets** (Settings → Secrets and variables → Actions):
1. `CLOUDFLARE_ACCOUNT_ID` — Cloudflare dash → Workers & Pages → Account ID (right sidebar). *(not sensitive)*
2. `CLOUDFLARE_API_TOKEN` — Cloudflare → My Profile → API Tokens → Create Custom Token → permission **Account › Cloudflare Pages › Edit**. *(create-once credential)*

Already set: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key, matches prod), `VITE_TURNSTILE_SITE_KEY` (`0x4AAAAAADPgGbyDwYkJ3VSh`), and variable `VITE_ENABLE_GOOGLE_LOGIN=false`.

**Then:** merge **PR #4** (`ci/github-actions-auto-deploy`) → first auto-deploy ships current `main` (incl. the Profile passkey fix that isn't live yet) → watch the Actions run goes green. From then on: push to `main` = auto-deploy.

---

## ✅ Done this session

- **Turnstile Playwright test fix** — PR #1 merged. Suite 10/10 green. (`playwright.config.js` injects a dummy Turnstile key via `webServer.env`.)
- **CLAUDE.md refresh** — PR #2 merged (was badly stale).
- **DB security + performance hardening** — PR #3 merged. 4 migrations **already applied to live DB** `bmvvugrfnuedjlucmlbw` via Supabase MCP and verified by advisors:
  - `harden_functions` (search_path + revoke RPC execute)
  - `fk_indexes` (9 FK covering indexes)
  - `rls_initplan` (wrapped `auth.uid()` in 16 policies — built from LIVE pg_policies)
  - `lock_credential_tables` (revoked anon/authenticated table privs on `passkey_credentials` + `webauthn_challenges`; Edge Functions use service_role, unaffected)
  - Migration filenames renamed to match recorded remote versions `20260530233232/233240/233253/233301` so `supabase db push` stays clean.
  - Advisor result: all 12 security WARNs + all FK/RLS-initplan perf findings cleared. Remaining are benign (empty-table "unused index" INFO; `webauthn_challenges` no-policy INFO by design; leaked-password N/A — no passwords).
- **Profile passkey bug fixed** (in PR #3) — was querying a non-existent `passkeys` table with columns `device_type`/`backed_up`. Repointed to `passkey_credentials` selecting `id, created_at, last_used_at`. **Needs deploy to go live.**
- **`gh` authenticated** as JeffThomas360 (keyring).
- **Auto-deploy workflow** written (`.github/workflows/deploy.yml`) — PR #4 open, pending the 2 Cloudflare secrets.
- Stale `status-update-tracking` worktree + all merged branches cleaned up. Repo reduced to `main`.

---

## 🔭 Pending roadmap

1. **Finish auto-deploy** (the immediate next step above).
2. **Verify first deploy** — confirm horrorwriter.org serves latest (Profile fix works, sign-in works).
3. **Auth strategy** (per Jeff's steer: very easy + very secure; lead with passkeys + Google; retire magic-link):
   - Configure **Google OAuth** provider in Supabase dashboard (client id/secret), set `VITE_ENABLE_GOOGLE_LOGIN=true` (GitHub var + Supabase redirect URLs).
   - Redesign `SignInModal` to lead with **Passkey** + **Google**; demote/remove **magic-link** (weakest path).
   - Passkey UX: consider warning before deleting last passkey (lockout risk).
4. **Drift reconciliation** — repo migration `20260519000000_passkeys.sql` defines a stale `passkeys` table; live DB uses `passkey_credentials` (id text PK, user_id, public_key bytea, transports text[], counter, created_at, last_used_at) and `webauthn_challenges` (has both `purpose` and `type` cols). Repo is not reproducible from scratch. Write a reconciliation migration / fix the source migration. **Live works — this is reproducibility hygiene, not a live bug.** Jeff OK'd wiping data, but wiping is NOT advised (Edge Functions depend on the live schema; ~no real data anyway).
5. **Minor:** avatars storage bucket has a broad SELECT policy allowing file listing (advisor WARN) — tighten if desired.
6. (Optional) clear 3 stale rows in `webauthn_challenges` (ephemeral nonces).

---

## 🔑 Key facts / gotchas

- **Cloudflare Pages `horrorwriter` is direct-upload** → cannot convert to native Git integration. That's why we use GitHub Actions + `wrangler pages deploy` (keeps custom domains `horrorwriter.org` etc.).
- **Local `wrangler` token is broken** ("Failed to retrieve account IDs"). Irrelevant once Actions deploy works; otherwise `npx wrangler login` to fix.
- **Git works fine from the sandbox this session** (contrary to old CLAUDE.md note).
- **DB migrations applied via MCP `apply_migration`**, not `supabase db push`. Files in repo match the recorded versions.
- Supabase project: `bmvvugrfnuedjlucmlbw`. Prod uses the **publishable** anon key `sb_publishable_-Y5K0e8qQrpsybmuQyyqxg_llQOokRY`.
- Open PRs: **#4** (auto-deploy). Possibly a stray PR from the earlier remote "Ultraplan" cloud session for the Turnstile fix — check the PR list; if it duplicates PR #1's already-merged change, close it.
