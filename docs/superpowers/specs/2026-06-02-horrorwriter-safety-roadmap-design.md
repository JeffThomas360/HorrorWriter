# Horror Writer — a safe, writer-owned home that scales to 50k

> Approved roadmap (2026-06-02). Strategy/spec for the trust-&-safety program.
> Each increment below gets its own spec → plan → build cycle. This document is the
> roadmap, the moderation operating model, the engineering standards for scale, and the
> legal appendix.

## Context

Login works; the core functions exist. The product vision, refined with Jeff:

- **Host, not censor.** "I host, my users provide. I am not a censor or approver."
  Content is posted freely (no pre-approval), with a **wide berth** for creative/dark
  horror content. Users have **full control over their own work**.
- **Removal is transparent and hard.** A removed post shows as **deleted with the reason
  why** (a public tombstone). It must **not be easy** to delete or censor a user —
  removals are reasoned, logged, the author is notified, and they can appeal.
- **Hard legal lane.** Caveats override the wide berth: DMCA, illegal content (esp.
  CSAM), and law-enforcement/court orders. These can compel removal and **data
  preservation even when a user wants deletion**.
- **Passwordless login** is already done (passkey/magic-link/Google).
- **Scales to ~50k users**, and a **companion phone app** comes later.

### Current state vs. vision (from the code)
- RLS already lets owners update/delete their own `threads`/`books`, but **no UI exposes
  it**, and `posts`/`book_comments` lack owner update/delete policies. Books go public the
  instant they're inserted (no drafts).
- **Zero moderation infrastructure:** no roles, reports, blocking, removal, bans, audit,
  appeals, or legal tooling. Turnstile + the `enforce_rate_limit()` trigger guard *auth/
  inserts* only.
- Scale groundwork is partly present: `20260530233240_fk_indexes.sql` (FK indexes) and
  `20260530233253_rls_initplan.sql` (RLS initPlan wrapping) exist — extend these patterns.
- Footer policy links (House Rules, Critique Code, Content Warnings) are "· soon" stubs.

---

## The moderation operating model (the spine of everything)

Mapped to the **Santa Clara Principles** (the industry due-process standard):

1. **Reactive, not gatekept.** Content publishes immediately. Moderators act only on
   reports or legal triggers — never pre-approval. Authors own and control their work.
2. **Transparent removal = tombstone.** Removed content is **soft-deleted, never purged**.
   In place it shows: *"Removed — [reason]"* + who-type (author/moderator/legal) + an
   appeal link. Three removal kinds, visibly distinct:
   - **Author withdrawal** — the user's own choice (full control); tombstone optional.
   - **Moderator removal** — mandatory reason (enum + note), author notified, appealable.
   - **Legal removal** — *"Removed for legal reasons"*; content retained under legal hold,
     hidden from all, exempt from purge.
3. **Hard to censor = friction + accountability.** Every moderator action requires a
   reason, is written to an immutable `moderation_actions` audit log, notifies the author,
   and is appealable. Account bans are admin-only (two-tier). Nothing is hard-deleted by a
   moderator.
4. **Appeals.** Authors can contest a removal/suspension; appeals are their own queue.
5. **Transparency report.** Publish periodic counts (removals, suspensions, appeals,
   legal takedowns) — the third Santa Clara pillar, and trust-building for an altruistic site.

---

## Engineering standards for 50k users (cross-cutting)

- **Keyset/cursor pagination everywhere** (never `OFFSET`): `WHERE (created_at, id) <
  (cursor) ORDER BY created_at DESC, id DESC LIMIT n`, with a composite index per feed.
  First target: `ThreadView.jsx` (currently fetches all posts) and `Forum`/`Library` lists.
- **Index every RLS/filter column** (`author_id`, `category_id`, `removed_at`, report
  `status`) — extend `fk_indexes.sql`.
- **Wrap RLS auth calls** as `(select auth.uid())` / `(select is_moderator())` so Postgres
  runs them once via initPlan — extend `rls_initplan.sql`. ~100x on large tables.
- **Keep denormalized counts** (`replies_count`, `comments_count` already exist); maintain
  via triggers, never `count(*)` in feeds.
- **Realtime sparingly** (presence + active thread only); don't subscribe whole feeds.
- **Storage scaling** for avatars/story covers per Supabase storage guidance.
- Supabase/Postgres handles 50k users comfortably — the discipline is query patterns + indexes.

---

## Roadmap (each increment = its own spec → plan → build)

### Increment 1 — Ownership + transparent removal foundation
- **Schema:** `profiles.role ('user'|'moderator'|'admin')`, `profiles.status ('active'|
  'suspended'|'banned')` + `suspended_until`; soft-removal columns `removed_at, removed_by,
  removal_reason, removal_kind ('author'|'moderator'|'legal')` on `threads/posts/books/
  book_comments`; `threads.locked`; `moderation_actions` audit table; `is_moderator()/
  is_admin()` security-definer helpers (mirror `20260530233232_harden_functions.sql`).
- **RLS:** add owner update/delete to `posts` + `book_comments`; SELECT shows `removed_at
  IS NULL` to non-mods (mods bypass); mod UPDATE policies for removal/lock; suspended/
  banned blocked from inserts via the existing rate-limit trigger family.
- **Frontend:** owner **edit/delete** on own thread/reply/book/critique; **tombstone**
  rendering for removed items; `role`/`status` surfaced through `AuthContext.jsx`.
- **Verify:** `get_advisors security` stays clean (RLS+policy on every new table).

### Increment 2 — Reporting, moderator queue, appeals
- `reports` (reporter, target_type/id, reason, details, status) and `appeals` tables;
  reusable `<ReportButton>` on all content + profiles; **block-user** (`user_blocks`,
  filtered from feeds); `/moderation` dashboard behind a `RequireRole` guard (mirror
  `RequireAuth.jsx`) — triaged queue, reasoned removal/lock, admin-only suspend/ban, audit
  view; author-facing appeal flow + notifications. Mod nav link visible only to mods.

### Increment 3 — Legal & safety compliance (the hard lane)
- **DMCA:** register a designated agent with the U.S. Copyright Office; public DMCA/
  takedown policy page + intake; notice→hide→counter-notice→restore workflow.
- **CSAM:** an "illegal content" fast-path that immediately hides, files an **NCMEC
  CyberTipline** report, and preserves content + uploader metadata/IP **≥90 days**.
- **Legal hold:** a flag on content/accounts that **exempts from purge** and overrides
  user deletion (for preservation/court orders); law-enforcement request log.
- **Account deletion + data export** reconciled with legal hold: user can delete/export
  their work (full control), but items under hold are retained per law.

### Increment 4 — Abuse & bot hardening
- Turnstile + rate-limit on *content* writes (not just auth); new-account posting
  throttle; slur/hate fast-block list at submit (wide berth for horror themes, hard line
  on targeted hate); disposable-email checks.

### Increment 5 — Collaboration depth
- Story drafts/visibility (private/unlisted/public), beta-reader requests, line-level
  critique, follow authors, notifications.

### Increment 6 — Polish + phone-app bridge
- Empty/loading/error states, accessibility, mobile; ship a **PWA** as the stepping stone
  to native; document the Supabase client contract the app reuses.

**Priority rationale:** 1–2 deliver the safe, transparent, hard-to-abuse moderation; 3 is
legally mandatory before real growth; 4 repels bad actors; 5 deepens community; 6 readies the app.

---

## Legal appendix (references — not optional at scale)
- **Santa Clara Principles** — notice+reason, appeal, transparency numbers.
  <https://santaclaraprinciples.org/>
- **DMCA designated agent** — register with the Copyright Office or lose safe harbor.
  <https://www.copyright.gov/dmca-directory/faq.html>
- **CSAM/NCMEC** — CyberTipline report on actual knowledge; ≥90-day preservation;
  non-reporting is a federal crime (18 U.S.C. §2258A, up to $150k first offense).
- **Law enforcement** — preservation requests / subpoenas / court orders; designate a legal contact.
- Action items for Jeff before launch-scale: line up a **DMCA agent** + a **legal contact**.

---

## Next session
- Run **brainstorming** on **Increment 1** to lock the exact tombstone + ownership UX,
  then **writing-plans** to produce the implementation plan and build.
- Open security follow-up: the Turnstile secret is in public git history (`6796ca8`,
  `20cd5a3`) — rotate when convenient (bot-protection bypass only; RLS confirmed clean
  via Supabase advisors).
