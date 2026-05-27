# HorrorWriter — Session Pickup File
_Last updated: 2026-05-24_

---

## What the site is

**horrorwriter.org** — A React + Vite SPA hosted on Cloudflare Workers, backed by Supabase (Postgres, Auth, Storage, Edge Functions). Horror-themed community platform for writers. VHS aesthetic.

- **Repo:** https://github.com/JeffThomas360/HorrorWriter
- **Live site:** https://horrorwriter.org
- **Supabase project:** `bmvvugrfnuedjlucmlbw`
- **Cloudflare:** Workers & Pages → horrorwriter
- **Design spec:** `docs/superpowers/specs/2026-04-24-horrorwriter-react-migration-design.md`

---

## What's fully done

| Phase | Status |
|-------|--------|
| 0 — Project setup (Vite, Cloudflare, env vars) | ✅ Done |
| 1 — Layout + router + all static pages | ✅ Done |
| 2 — Inner pages with mocked data | ✅ Done |
| 3 — Supabase migrations (profiles, passkeys, storage) | ✅ Done |
| 4 — Auth: magic-link, Turnstile CAPTCHA, Passkeys | ✅ Built & Live |
| 5 — Profile editor + avatar upload | ✅ Done |
| 6 — Forum & Library (Posts, Threads, Books) | ✅ Live with real data |
| 7 — Automated Playwright E2E Tests | ✅ Passing (Zero Regressions) |
| 8 — Security & Rate Limiting | ✅ Postgres RLS & Triggers Active |

---

## What We Built Recently (May 2026)

### 1. UX & UI Overhaul
- **Navigation:** Explicitly pinned "The Crypt" (Forum) and "Library" to the sidebar.
- **Contextual CTAs:** The homepage now knows if you are logged in ("Enter the Crypt" vs "Enter the Void").
- **Actionable Empty States:** Empty categories in the forum/library now feature highly styled prompts urging users to publish the first story/thread.
- **Micro-Interactions:** Added blood-red `:focus-visible` rings for keyboard navigation, tactile `:active` button depressions, and smooth `.loading-pulse` opacity animations for fetching states.

### 2. Infrastructure & Security
- **Cloudflare Turnstile:** Natively integrated with Supabase `signInWithOtp` to protect the Magic Link endpoint from bots.
- **Custom SMTP (Resend):** Verified and configured `noreply@horrorwriter.org` as the sender for magic links.
- **Postgres Rate Limiting:** Built custom PL/pgSQL triggers (`20260523000002_rate_limiting.sql`) to prevent DoS application attacks (e.g. max 10 posts / 5 mins, 5 threads / 15 mins).
- **Row Level Security (RLS):** Verified that `posts`, `threads`, and `books` are fully locked down via `auth.uid() = author_id` policies. Identity spoofing is impossible.
- **Agent Skills:** Installed Supabase and Postgres Best Practices agent skills natively via MCP.

### 3. Automated Testing
- Built a robust E2E testing suite using Playwright (`npx playwright test`).
- Covers virtual WebAuthn passkey authentication flows, Turnstile verification gating, and Forum category/thread navigation.

---

## Database migrations (all applied to remote)

| Migration | What it does |
|-----------|-------------|
| `20240520000000_content_schemas.sql` | Base `posts` and `threads` schemas with RLS |
| `20260519000000_passkeys.sql` | Creates `passkeys` + `webauthn_challenges` tables |
| `20260523000000_fix_replies_count.sql` | Fixes thread reply count bug |
| `20260523000001_create_missing_posts_table.sql`| Recovery migration, ensures schemas sync |
| `20260523000002_rate_limiting.sql`| Adds PL/pgSQL database-level rate limiting triggers |

---

## What's NOT done yet (Next Steps)

### 1. Google OAuth (Feature Flagged)
We planned to add "Sign in with Google" to the `SignInModal.jsx`, wrapped in a `VITE_ENABLE_GOOGLE_LOGIN` environment variable flag so it only shows if explicitly toggled on by the developer.

### 2. Live Realtime Subscriptions
Implement Supabase Realtime in `ThreadView.jsx` so that when a user is reading a forum thread, new replies from other users pop into the UI instantly without needing a page refresh.

### 3. Data Fetching Optimization (TanStack Query)
Replace standard `useEffect` fetching with `@tanstack/react-query` to cache forum and library data, drastically reducing loading flickers when navigating back and forth between categories.

---

## Tech stack quick reference

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, React Router v7 |
| Hosting | Cloudflare Workers |
| Backend | Supabase (Postgres + Auth + Storage) |
| Auth | Magic-link OTP + WebAuthn passkeys + Turnstile |
| Testing | Playwright E2E |
| CSS | Custom (`src/style.css`) — VHS horror aesthetic |
| Fonts | Cinzel (display), EB Garamond (body), VT323 (mono) |
| Colors | `--blood` #ff1f3a, `--cyan` #4cd5ff, `--gold` #d3a24a, `--bone` #f3ecd9 |
