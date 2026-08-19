# Harassment & Attack Protection — Design

**Date:** 2026-08-18
**Status:** approved, ready for implementation planning
**Sub-project of:** the trust & safety decomposition (see `work/security-and-moderation.md` in the
vault). This is piece #2 (harassment/attack protection). Piece #1 (moderator accountability / mod
notes) and the "vote/engagement integrity" and "plagiarism detection" pieces are separate,
not-yet-designed sub-projects.

## Thesis

Site is pre-launch (no users yet) — this is prophylactic, not reactive. Evidence review (below)
points toward structural, mostly-automated, low-maintenance defenses over building a bigger human
moderation queue. Everything here builds on schema that already exists: `profiles.mod_role` /
`mod_scope`, `mod_status` (`live|screening|hidden`) as a **visibility-only** gate that never alters
content, `mod_can()`/`content_visible()`, `reports`, `mod_actions`, `mod_role_badges`,
`transparency_log`, `notifications`, `enforce_rate_limit()`.

**Locked constraint carried over from the existing "Content safety flagging" backlog item:**
moderation status is visibility-only. Automated systems may hide/screen; they may not delete or
alter content. This design's one exception (worst-tier auto-pull, PR4) is scoped narrowly and
still never deletes — see below.

## Evidence behind the approach

- **Visible community guidelines at the point of posting** measurably reduce harassment and
  *increase* participation — a randomized experiment across 2,190 discussions in a 13M-subscriber
  community (Matias/CivilServant, published in *PNAS*) found pinned rules increased newcomer rule
  compliance by 8+ points and newcomer participation by 70%, with no speech suppression.
- **Blocking is what users actually reach for** over reporting — one click, immediately
  empowering, versus a slower report-then-wait-on-a-mod flow. It's also the cheapest lever to
  build and reduces load on the (solo) moderator.
- **Weaponized/mass reporting is a named, studied attack pattern**, not a hypothetical — platforms
  mitigate it with per-reporter rate limits (Reddit does this). A per-reporter limit alone is
  insufficient against a *coordinated* multi-account pile-on, which is why pile-on pattern
  detection is treated as load-bearing, not optional, in PR3.
- **Purely reactive (report-then-review) systems miss most harassment** — 47% of harassment targets
  never report at all, they just leave. An always-on automated first pass catches what a queue
  never sees.
- **Classifier choice:** OpenAI's free Moderation endpoint benchmarks at 0.83 balanced accuracy
  (best free option; Perspective API is being sunset entirely after Dec 2026, so not viable).
  Claude Haiku 4.5 costs ~$0.0005/call (~$0.50 per 1,000 posts) and has the highest measured
  precision (0.92) / lowest false-positive rate (0.022) in the comparative benchmark. At solo-mod
  scale, false positives are the real cost — each one is either a support ticket or manual triage.
  Two-stage design (free first pass, paid confirm only on flags) gets both: near-zero cost at
  volume, low false-positive rate on the flags that matter.
- **Steam/Valve's review-bombing model** (anomaly detection → human confirms → exclude from score,
  never delete, always stays visible, user-overridable) is the reference pattern for the storm
  detector in PR5 — detect first without guessing intent, keep everything visible, require human
  judgment before anything is excluded, and only ever affect the *aggregate signal*, never the
  content itself.

## The six PRs

### PR1 — Feedback guidelines at point of posting

Static, non-dismissible text block rendered directly above the comment/reply composer on story
critique and forum threads — not a modal, not a link-out. Content lives in a small constant/config
file, editable by Jeff directly, no schema change.

### PR2 — Blocking / muting

New table:

```sql
create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (blocker_id, blocked_id)
);
```

- A blocked user's content is invisible to the blocker — enforced at the RLS level, not just
  client-side filtering.
- The blocked user cannot reply to, comment on, or @-mention the blocker.
- One-click toggle from any comment/post/profile.

### PR3 — Report rate-limit + pile-on detection

Two mechanisms, both required:

1. **Per-reporter rate limit** — reuse the existing `enforce_rate_limit()` trigger pattern, applied
   to `reports` inserts (e.g. N reports per rolling hour per reporter).
2. **Pile-on pattern detection** — if a single target (`target_type`/`target_id`) accumulates
   reports from **multiple distinct reporters** within a short rolling window with no corroborating
   detail, flag the *pattern itself* for Jeff's review rather than letting the reports silently
   accumulate toward any automatic action. This is the load-bearing half — a per-reporter limit
   alone does not stop a coordinated multi-account pile-on, since each account can individually
   stay under the limit.

### PR4 — Automated content pre-screening

On every new `book_comments` / `posts` / `threads` insert:

1. **Stage 1 — OpenAI Moderation endpoint** (free) runs on 100% of content.
2. **Stage 2 — Claude Haiku 4.5** (~$0.0005/call) runs only on content Stage 1 flags, confirming or
   dismissing before anything reaches a human.
3. **Outcome:** a confirmed flag moves `mod_status` to `screening` (hidden pending review) —
   **except** the single worst-tier category (CSAM-adjacent / imminent-threat content), which is
   also pulled from all feeds/search immediately in addition to being hidden. Nothing is ever
   auto-deleted; the underlying row is untouched.
4. **Hard dependency:** the worst-tier auto-pull ships only after the mandatory-reporting/legal
   question already flagged in the existing "Content safety flagging" backlog item is resolved.
   That is a legal question, not an engineering one, and is not re-litigated in this design.

New schema: `reports.source` column (`enum: 'user' | 'automated'`, default `'user'`) so the
automated pipeline reuses the existing `reports` table instead of a parallel one.

### PR5 — Storm detector (cross-signal circuit breaker)

**Model: Valve/Steam's review-bombing detection**, adapted. Steam's approach: detect anomalous
velocity first without trying to determine intent → a human confirms whether it's coordinated →
confirmed-bombed activity is excluded from the aggregate score (never deleted, stays visible,
user-overridable). No auto-freeze of any kind on Steam's side; the same restraint is intentional
here as an extension of the "visibility-only, no automated content alteration" rule to *reputation
signals* as well as content visibility.

- **Detection:** count hostile-signal events (new reports, new replies/comments, negative
  vote/critique-score movement) against a single target within a short rolling window (e.g. 15
  minutes), combined across signal types — not per-channel. A coordinated attack spread thin across
  reports + replies + votes, each individually under its own limit, is exactly what a per-mechanism
  limit misses and this catches.
- **On detection:** immediately alert Jeff via **Email and SMS** (both required — SMS is a new paid
  dependency, e.g. Twilio, a deliberate exception to the usual free/cheap-tier default given the
  time-sensitivity of an active storm). Nothing is auto-frozen and no content visibility changes.
- **On Jeff's confirmation** that it's a coordinated attack: the storm-window's reports/votes are
  excluded from affecting the target's visible standing (report count, critique score) — the
  content itself is never hidden, altered, or frozen as a result of this mechanism alone.
- Explicitly **not** the full "vote/engagement integrity" (bot-downvote detection) sub-project —
  this only uses vote-velocity as one input signal to the storm alarm, and does not attempt general
  bot detection.

### PR6 — Appeals

Reuses existing infrastructure almost entirely — `reports.target_type` already has an unused
`'appeal'` value in its check constraint.

- **Submission:** any user whose content had its `mod_status` changed — by the automated pipeline
  (PR4) or a direct mod action — gets an "Appeal this" affordance. Submitting creates a `reports`
  row: `target_type = 'appeal'`, `target_id` = the original `mod_actions.id`, appellant's
  explanation in `details`.
- **Priority queue:** Moderation Terminal gets a filtered view for `target_type = 'appeal'`, sorted
  oldest-first, surfaced ahead of fresh reports.
- **Resolution:** via the existing `resolve_report` RPC → writes to `mod_actions`
  (`action: 'appeal_resolved'`, required `reason`, `metadata: {upheld: bool, original_action_id}`).
  Since `transparency_log` already publicly exposes `mod_actions` (role-anonymized), every appeal
  outcome is automatically auditable with no new infrastructure. Appellant is notified via the
  existing `notifications` table.
- **The honest limit, stated rather than hidden:** at solo-maintainer scale there is no independent
  second judge. Jeff resolving an appeal of an automated flag *is* a legitimate first human
  look — no issue there. Jeff resolving an appeal of his own **direct** mod action has no
  independent arbiter. Rather than fake independence: require a mandatory cool-off period before
  Jeff can resolve an appeal of his own direct action (not applicable to automated-flag appeals),
  and require written reasoning on every resolution (already enforced by the required `reason`
  field). This limitation is disclosed on `/transparency`, not hidden.
- **Anti-abuse:** reuse `enforce_rate_limit()` — cap open appeals per user, block re-appealing the
  same action without new information in `details`.

## Explicitly out of scope (separate, not-yet-designed sub-projects)

- **Moderator accountability / mod notes** (piece #1 of the original decomposition) — audit trail
  on mod actions beyond what `mod_actions`/`transparency_log` already give, admin/mod private notes
  on users for pattern-tracking. Appeals here (PR6) touch this but don't replace it.
- **Vote/engagement integrity (bot downvoting)** — general bot detection on votes/critique scores.
  PR5's storm detector uses vote-velocity as one *input signal* only; it is not this sub-project.
- **Plagiarism detection** — a content-fingerprinting problem, mechanically unrelated to behavioral
  moderation.
- **Feedback guidelines content itself** (the actual written community norms, as opposed to PR1's
  UI placement of them) — a content/UX deliverable, not scoped here.

## New schema summary

- `user_blocks` (new table, PR2)
- `reports.source` (new column, PR4)
- `reports.target_type = 'appeal'` (activates an existing, previously-unused check-constraint
  value — no migration needed, PR6)
- Everything else (rate limiting, transparency, notifications, appeals routing) reuses existing
  tables and functions.
