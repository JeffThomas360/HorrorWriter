# HorrorWriter Moderation Suite — Design Spec

**Date:** 2026-06-08
**Status:** Approved design, pending implementation plan
**Author:** Jeff + Claude (brainstorming session)

---

## 1. Purpose

Build a complete, self-contained moderation suite for HorrorWriter that gives the
owner full background control over everything posted, shared, and discussed, lets
users report problems with content / other users / the site itself, and lets the
owner delegate moderation to trusted users with **granular, partitioned** access.

The site is **not yet truly live**. We have explicit latitude to tear down and
rebuild existing schema and code to do this cleanly. The remote database will be
**wiped and rebuilt from a single consolidated migration baseline** (all current
test data is disposable).

Guiding constraints (from project memory):
- **Low-friction & hands-off** — non-technical for writer users, low-maintenance for the owner.
- **No fake claims** — atmospheric VHS theater is fine; asserted facts (badges, statuses) must be real.
- **Clean, safe space** without drama or public pitchforks.

Grounding (established practice): horror/graphic content is *allowed by design* — the
violation line is real-world harm and targeted harassment, judged by context
(repeated / targeted / pattern), mirroring AO3's content policy. Pair proactive
filters with reactive reports, write plain-language guidelines, review promptly, and
**close the loop** with reporters.

---

## 2. Design principles

1. **One canonical state per concept.** No contradicting boolean pairs.
2. **Server-enforced, not UI-enforced.** All permissions and visibility live in RLS
   via SQL helper functions. The UI mirrors them but is never the gate.
3. **Light over clever.** Operational flags on `profiles` for fast RLS; history/why
   in the audit log. No subsystem we don't need yet (YAGNI).
4. **Closed-loop, audience-scoped communication.** The actioned user gets full
   disclosure; reporters get a short closure; the public gets nothing.
5. **Reversible by default.** Hiding is a state change, not a delete. Everything is logged.

---

## 3. Roles, capabilities & scope (the backbone)

Replace the binary `profiles.is_admin` with a role + area scope.

- `profiles.mod_role` — `null` (normal user) | `'sentinel'` | `'moderator'` | `'warden'` | `'keeper'`
- `profiles.mod_scope` — `'all'` | `'forum'` | `'library'` (only meaningful for `sentinel` / `moderator`; `warden` and `keeper` are always `all`)

Permissions are derived from role, enforced server-side by a SQL helper
`public.mod_can(action text, area text) returns boolean` that reads the caller's role
and scope. The same matrix is mirrored in a small JS helper for UI gating.

### Capability matrix

| Capability | Sentinel | Moderator | Warden | Keeper |
|---|:--:|:--:|:--:|:--:|
| Handle / triage reports | ✓ (scope) | ✓ (scope) | ✓ | ✓ |
| Hide content (reversible) | ✓ (scope) | ✓ (scope) | ✓ | ✓ |
| Screen / approve queue | — | ✓ (scope) | ✓ | ✓ |
| Shadowban user | — | — | ✓ | ✓ |
| Ban / suspend user | — | — | ✓ | ✓ |
| Assign / revoke roles | — | — | — | ✓ |
| Configure badges & filter rules | — | — | — | ✓ |
| Read audit log | — | — | ✓ | ✓ |

Rules:
- Only a **Keeper** assigns or revokes roles, and only roles strictly below Keeper.
- A scoped action is permitted only when the target content's area matches the
  moderator's `mod_scope` (or scope is `all`). Area mapping: `books` + `book_comments`
  → `library`; `threads` + `posts` → `forum`.

---

## 4. Public moderator badges

Transparency about *who* moderates (distinct from the invisible enforcement tools).

- New table `mod_role_badges (role text primary key, emoji text, label text)`,
  seeded: 🗝️ Keeper, 🕯️ Warden, 👁️ Moderator, 🔦 Sentinel.
- Rendered **read-only** on public profiles (`ProfileHead`, `UserProfile`) based on
  `profiles.mod_role`. Users cannot edit their own badge.
- A Keeper edits the emoji↔role mapping from a Badges settings tab. Mapping is stored
  server-side (table), never hardcoded. RLS: public read; Keeper-only write.

---

## 5. Content moderation state

Every content table (`books`, `threads`, `posts`, `book_comments`) carries a single
state column instead of `hidden` + `approved`:

- `mod_status text not null default 'live'` — `'live'` | `'screening'` | `'hidden'`
  - `live` — publicly visible.
  - `screening` — awaiting approval (held by user screening or a filter match); visible
    only to author + mods.
  - `hidden` — taken down by a mod (reversible); visible only to author + mods.

### Visibility (RLS SELECT)
A row is visible when:
`mod_status = 'live' AND author is not shadowbanned`
**OR** caller is the author
**OR** `mod_can('view_hidden', <area>)`.

This replaces the layered drop/recreate policies with one clean policy per table,
expressed through helper functions.

---

## 6. User standing & enforcement (bans / suspensions)

Operational standing flags on `profiles` (fast for RLS); the *why/history* lives in
the audit log (§9), so **no separate sanctions table**.

- `requires_screening boolean not null default false` — new content posts as `screening`.
- `is_shadowbanned boolean not null default false` — content invisible to all but self + mods.
- `banned_until timestamptz` — `null` = not banned; a future timestamp = timed
  suspension; `'infinity'` = permanent ban.
- `ban_reason text` — shown to the user on their banner.

### Read-only enforcement
A `BEFORE INSERT` trigger on all four content tables rejects writes when the author is
currently banned/suspended (`banned_until > now()`). Suspended/banned users can still
**sign in**, see a **banner + reason**, and file an **appeal**.

### Screening enforcement
The same insert path sets `mod_status = 'screening'` when the author
`requires_screening` **or** a filter rule (§8) matches.

### Appeals
An appeal is a `reports` row with `target_type = 'appeal'` referencing the user's own
ban, routed to Warden/Keeper. Resolution sends a closed-loop notice (§7).

---

## 7. Reporting (closed-loop)

Single `reports` table (built fresh; the old `moderation_flags` is dropped).

```
reports (
  id uuid pk,
  reporter_id uuid -> profiles (nullable; set null on reporter delete),
  target_type text check in ('story','critique','thread','post','user','site','appeal'),
  target_id uuid null,            -- null for 'site' general reports
  category text check in ('harassment','spam','urgent','other'),
  details text,                   -- free text (catch-all incl. plagiarism, etc.)
  status text not null default 'open' check in ('open','actioned','dismissed'),
  resolved_by uuid -> profiles null,
  resolved_at timestamptz null,
  resolution text null,           -- short internal note + basis for reporter closure
  created_at timestamptz default now()
)
```

- **Report buttons** added to: stories & critiques (`ReadStory`), threads & posts
  (`ThreadView`), **users** (`UserProfile`), and a footer **"Report a problem"** for
  site/safety issues. A shared `ReportModal` component drives all of them.
- **Routing:** content/user reports → abuse queue; `site` reports → a separate Keeper
  **Support** inbox tab (mirrors the AO3 abuse-vs-support split).
- **Auto-hide:** content reaching a Keeper-configurable threshold (default 5 distinct
  reporters) auto-sets `mod_status = 'hidden'` and logs the action.
- **URGENT lane:** `category = 'urgent'` bypasses the threshold, pins to the top of the
  queue, and **emails the Keeper immediately** (small Supabase Edge Function; reuses
  existing function/secret infrastructure). Never silently auto-hides — a human decides fast.
- Reporter identity is never shown to the reported user.

---

## 8. Lightweight proactive filter

Keeper-editable rules, evaluated at submission time. Matches route to **screening**
(never hard-block) so horror language is never falsely censored unless the Keeper
explicitly lists a phrase.

```
filter_rules (
  id uuid pk,
  kind text check in ('phrase','max_links','duplicate','new_account_flood'),
  value text,            -- the phrase, or numeric threshold as text
  enabled boolean default true,
  created_at timestamptz default now()
)
```

A `BEFORE INSERT` trigger `apply_content_filters()` on content tables checks enabled
rules (banned phrases, link count over threshold, duplicate/repeat text, brand-new
account posting rapidly) and sets `mod_status = 'screening'` on a match. Composes with
the existing rate-limit trigger and the screening flag from §6. A Keeper Filters tab
edits the phrase list and thresholds.

---

## 9. Audit log, reversibility & mod notes

Append-only log; the single source of truth for *who did what and why*.

```
mod_actions (
  id uuid pk,
  actor_id uuid -> profiles,
  action text,            -- hide, unhide, approve, reject, shadowban, unshadowban,
                          -- screen, unscreen, suspend, ban, unban, dismiss_report,
                          -- action_report, assign_role, revoke_role, edit_badge,
                          -- edit_filter, note
  target_type text,       -- content type | 'user' | 'report' | 'badge' | 'filter'
  target_id uuid null,
  target_user_id uuid null,
  reason text null,
  metadata jsonb null,
  created_at timestamptz default now()
)
```

- All mod operations write an `mod_actions` row.
- **Reversible hides:** hiding sets `mod_status='hidden'`; unhiding restores `'live'`.
  No destructive deletes (replaces today's "delete the flag" behavior — reports are
  resolved by status change, not deletion).
- **Mod notes** on a user are `action = 'note'` rows (`target_user_id` set).
- Readable by Warden+ (RLS via `mod_can('read_audit', 'all')`).

---

## 10. Closed-loop notifications (lean)

A minimal notifications subsystem — **not** a public transparency feed.

```
notifications (
  id uuid pk,
  user_id uuid -> profiles,
  kind text,              -- report_received, report_resolved, content_actioned,
                          -- ban_notice, appeal_result
  title text,
  body text,
  read_at timestamptz null,
  created_at timestamptz default now()
)
```

- UI: a **bell in the nav** with an unread count → dropdown list (+ a simple
  `/notifications` page). RLS: owner-read, owner-update (mark read).
- **Audience-scoped delivery** (the owner's explicit rule):
  - **Reporter** → on submit: *"Report received — a Keeper will review."* On
    resolution: a short, drama-free closure (*"reviewed, action taken"* / *"no action
    needed"*). No details that could fuel a feud.
  - **Actioned user** → full private disclosure: what content, which rule, the
    consequence, the duration (for suspensions), and an appeal link.
  - **Public / others** → nothing.

---

## 11. Keeper Terminal (admin UI) refactor

The existing ~600-line `src/pages/Moderation.jsx` is replaced by a tabbed terminal
composed of focused, independently testable components:

- **Reports** — abuse queue with URGENT pinned at top; filter by area/category; resolve
  (action / dismiss) with reason; reversible.
- **Support** — `site` reports inbox.
- **Screening** — pending `screening` content; approve / reject.
- **Registry** — user search; assign/revoke roles & scope (Keeper); shadowban,
  screening, suspend/ban (Warden+); view a user's mod-notes & history.
- **Filters** — banned-phrase list + thresholds (Keeper).
- **Badges** — emoji↔role mapping (Keeper).
- **Audit** — read-only action log (Warden+).

Access gate stays as the disguised 404 for unauthorized visitors, but is driven by
`mod_role` (any non-null role sees the relevant tabs; tabs/actions filtered by
capability), not a single admin bit.

Plus a plain-language **Community Guidelines** page (linked from the report flow and
footer) so reports have rules to cite.

---

## 12. Data / schema summary (consolidated baseline)

The remote DB is reset; a single clean migration baseline recreates the full schema.
It must faithfully reproduce all current **non-moderation** functionality:

- `profiles` (+ new `mod_role`, `mod_scope`, `requires_screening`, `is_shadowbanned`,
  `banned_until`, `ban_reason`)
- `passkey_credentials`, `webauthn_challenges`
- `books`, `categories`, `threads`, `posts`, `book_comments` (+ new `mod_status`)
- storage `avatars` bucket + RLS
- Realtime publication on `posts`
- rate-limiting trigger, `create_thread` RPC, `updated_at` touch triggers

New moderation objects:
- Tables: `reports`, `mod_actions`, `notifications`, `mod_role_badges`, `filter_rules`
- Functions: `mod_can()`, content-visibility helper, `apply_content_filters()`,
  screening/ban insert guards, report auto-hide + urgent-email hooks
- One clean RLS policy set per table, expressed through the helpers

Dropped for good: `is_admin`, `hidden`, `approved`, `moderation_flags`, and the layered
moderation migrations.

---

## 13. Build order (phased; each ships independently)

0. **Consolidated schema baseline + DB reset.** One clean migration set — including the
   empty `mod_actions` and `notifications` tables so later phases can write to them from
   the moment they introduce an action. Verify the app still runs against the rebuilt DB
   before adding UI.
1. **Roles + capabilities + badges.** `mod_role`/`mod_scope`, `mod_can()`, RLS refactor,
   `mod_role_badges` + Badges tab, public profile badges, Registry role assignment
   (logs `assign_role`/`revoke_role` to `mod_actions`).
2. **Reporting + notifications bell.** `reports`, `ReportModal` across content/users/site,
   Support inbox, auto-hide threshold, URGENT email, notifications bell + reporter ack.
3. **Bans / suspensions + read-only + appeals.** Standing flags, insert guards, ban
   banner + appeal flow, Registry ban controls (each logs to `mod_actions`).
4. **Audit tab + reversible-hide UX + mod notes + closed-loop resolution notices.** The
   read-only Audit log UI, reversible hide/unhide controls, user mod-notes, and the
   audience-scoped offender/reporter resolution messages. (Actions from phases 1–3 are
   already being logged; this phase surfaces and completes the loop.)
5. **Lightweight auto-filter.** `filter_rules`, `apply_content_filters()`, Filters tab.
6. **Terminal refactor + Community Guidelines page.** Split into per-tab components,
   plain-language guidelines.

---

## 14. Out of scope (explicitly deferred)

- AI content classification (lightweight rules only for now).
- Full public transparency feed / notifications center beyond the lean closed loop.
- Hard auth-account lockout (read-only bans preserve the appeal path).
- Direct messaging moderation (no DM feature exists).
- Automated appeals adjudication (appeals are handled by a human Warden/Keeper).
