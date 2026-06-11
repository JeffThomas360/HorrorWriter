# Moderation Suite — Implementation Addendum

**Date:** 2026-06-10
**Status:** Approved (pending spec review)
**Supplements:** [2026-06-08-moderation-suite-design.md](2026-06-08-moderation-suite-design.md)

The 2026-06-08 design is approved and its **Phase 0 schema is live** (rebuilt
into the consolidated baseline on 2026-06-10: `mod_role`/`mod_scope`/`mod_status`,
the `mod_can`/`content_visible` helpers, and the five tables `reports`,
`mod_actions`, `notifications`, `mod_role_badges`, `filter_rules`, all empty).
This addendum records the decisions made on 2026-06-10 and how we build the rest.

---

## 1. Transparency model (confirmed + refined)

Confirms the base spec's audience-scoped model, with two refinements:

- **Actioned user** → maximal private detail: the exact content, the guideline
  cited, **which moderator acted (by role/badge)**, when, why, the consequence and
  its duration, and an appeal link. **Never the reporter's identity.**
- **Reporter** → the outcome of *their specific* report (e.g. "your report on X led
  to action" / "no action needed") — clear but neutral, no detail that fuels feuds.
- **Public** → a neutral **"removed by moderators" tombstone** where hidden content
  was, instead of silent disappearance. Nothing else.
- **No public moderation log; reporters are never revealed to the accused.**

## 2. Deltas vs. the 2026-06-08 spec

1. **Inline moderation actions.** Beyond the central Keeper Terminal, mods see
   discreet capability-gated controls (hide / screen / resolve) directly on content
   surfaces — `ReadStory` (story + critiques), `ThreadView` (thread + posts),
   `UserProfile` — so they act in one click where they find it. Every inline action
   writes to `mod_actions` exactly like a terminal action (same code path).
2. **Mobile-friendly moderation.** The terminal and inline controls are usable on a
   phone — the owner can react on the go.
3. **Public tombstone** (see §1) — a small shared component rendered where
   `content_visible(...)` is false for the public but the row exists.
4. **Reporter-specific outcome** in the closed-loop notification (see §1).

Everything else in the base spec stands unchanged.

## 3. Delivery approach

Phase-by-phase; **each phase ships independently and gets its own implementation
plan + review checkpoint.** No single mega-plan. Order follows the base spec §13;
the tangible "react to bad content fast" capability lands at the end of Phase 2.

| Phase | Delivers |
|---|---|
| **1 — Foundation** *(plan next)* | roles, capabilities, badges, terminal shell |
| 2 | reporting + inline takedown + notifications bell |
| 3 | bans/suspensions + read-only enforcement + appeals |
| 4 | audit tab + reversible-hide UX + mod notes + resolution notices |
| 5 | lightweight auto-filter |
| 6 | terminal refactor polish + Community Guidelines page |

## 4. Phase 1 scope (the next implementation plan)

- **Bootstrap (done 2026-06-10):** `beetlebub` (`orig.beetlebub@gmail.com`) set to
  `mod_role = 'keeper'`, `mod_scope = 'all'`, logged to `mod_actions` as an
  `assign_role` bootstrap row. Resolves the chicken-and-egg (a fresh DB has no
  Keeper to grant the first role). This is a **manual step to repeat after any
  future DB reset** — it cannot live in the baseline, since a freshly reset DB has
  no such user until they sign up again.
- **JS capability helper** mirroring `mod_can(action, area)` for UI gating only —
  server-side RLS remains the real gate; the UI never decides access.
- **Keeper Terminal shell + access gate.** Mount a `/moderation` route and restore
  the Nav `[Terminal]` link, both gated on `profile?.mod_role` (any non-null role).
  Unauthorized visitors get the existing disguised-404 treatment, not a redirect.
- **Registry tab.** User search; assign/revoke role + scope — **Keeper-only**, and
  only roles strictly below Keeper. Each change logs `assign_role` / `revoke_role`
  to `mod_actions`.
- **Badges tab.** Edit the emoji↔role mapping in `mod_role_badges` (Keeper-only);
  logs `edit_badge`. Mapping stays server-side, never hardcoded.
- **Public role badges.** Render the `mod_role` badge read-only on `ProfileHead`
  and `UserProfile`, sourced from `mod_role_badges`. Users can't edit their own.

### Current UI state (Phase 1 starting point)
- No moderation route is mounted — App.jsx has `{/* TODO(phase1): mount rebuilt
  Keeper Terminal route */}`.
- The Nav `[Terminal]` link is hard-disabled (`{false && (...)}`).
- So setting the Keeper role grants no visible UI until Phase 1 ships.

### Verification
- TDD throughout; RLS verified server-side (a non-Keeper cannot assign roles even
  by direct API call, not just hidden buttons).
- Supabase security advisors clean after any DDL.

## 5. Not changing / still out of scope

Base spec §14 stands: no AI classification, no public transparency feed, no hard
auth lockout, no DM moderation, no automated appeals. Inline actions do **not**
introduce a new permission path — they reuse `mod_can` + `mod_actions`.
