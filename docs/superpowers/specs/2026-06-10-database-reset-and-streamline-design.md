# Database Reset & Streamline — Design Spec
**Date:** 2026-06-10
**Status:** Approved (pending spec review)

---

## Goal

Wipe the pre-launch database back to a true clean slate — no logins, no user
content — and fold the only outstanding schema drift + the new passkey
`attachment` column into the single consolidated baseline so future resets stay
clean. Site is not live; this is authorized and there is no production data to
preserve.

---

## Current state (verified 2026-06-10 against remote `bmvvugrfnuedjlucmlbw`)

| Table | Rows | Disposition |
|---|---|---|
| `auth.users` | 1 | wipe |
| `profiles` | 1 | wipe (cascades from auth.users) |
| `passkey_credentials` | 1 | wipe (cascades) |
| `threads` | 1 | wipe (cascades) |
| `posts` | 1 | wipe (cascades) |
| `webauthn_challenges` | 2 | wipe (ephemeral) |
| `books`, `book_comments`, `reports`, `mod_actions`, `notifications`, `filter_rules` | 0 | already empty |
| `categories` | 5 | seed — regenerated from baseline |
| `mod_role_badges` | 4 | seed — regenerated from baseline |
| `storage.objects` (avatars) | ≤1 | wipe |

**Decisions taken:** full wipe including seed data (regenerated fresh from the
baseline), realized via a **genuine full schema teardown** (DROP SCHEMA public
CASCADE + re-apply the cleaned baseline), not a targeted data delete.

---

## Part 1 — Streamline the baseline (`supabase/migrations/00000000000000_baseline.sql`)

The baseline is the single source of truth; both fixes go into it so the
teardown rebuilds a clean schema.

### 1a. Remove duplicate passkey RLS policies

The file creates each passkey policy twice — once periodless with the
unoptimized `auth.uid()` form, once with a trailing period using the
`(SELECT auth.uid())` form that every other policy in the file uses. **Delete
the two periodless, unoptimized duplicates; keep the optimized period versions:**

- DROP: `CREATE POLICY "Users can delete their own passkeys" ...` (line ~532)
- DROP: `CREATE POLICY "Users can view their own passkeys" ...` (line ~580)
- KEEP: `"Users can delete their own passkeys." ...` and `"Users can view their own passkeys." ...`

This removes the only confirmed schema drift in the DB and makes passkey RLS
consistent with the rest (the `(SELECT auth.uid())` form is initplan-cached, so
it's also a small perf win).

### 1b. Fold the `attachment` column into the baseline

Add the column to the `passkey_credentials` table definition so it is part of
the baseline rather than a follow-on migration:

```sql
"attachment" "text",
-- + CHECK constraint among the table constraints:
CONSTRAINT "passkey_credentials_attachment_check"
  CHECK ("attachment" IN ('platform', 'cross-platform'))
```

Then **archive** the standalone migration:
`supabase/migrations/20260610000000_passkey_attachment.sql`
→ `supabase/migrations_archive/20260610000000_passkey_attachment.sql`

This preserves the project's "ONE consolidated baseline" doctrine (same pattern
as the 2026-06-08 consolidation).

---

## Part 2 — Remote teardown sequence (executed via Supabase MCP `execute_sql`)

Run as discrete, verified steps. Stop and report if any step's verification
fails.

1. **Wipe logins** — `DELETE FROM auth.users;`
   Cascades through `profiles` → `books`/`threads`/`posts`/`book_comments`/
   `passkey_credentials`, and within the auth schema to identities/sessions.
2. **Wipe storage** — `DELETE FROM storage.objects WHERE bucket_id = 'avatars';`
3. **Teardown schema** — `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
   (Cascade-drops the public functions and the dependent `on_auth_user_created`
   trigger on `auth.users`; extensions live in `extensions`/`vault` and are
   untouched.)
4. **Rebuild** — apply the full cleaned baseline. It is self-contained:
   re-grants schema usage + default privileges, recreates all tables/policies/
   functions/triggers, the storage bucket + policies (`drop policy if exists`
   guarded), the realtime publication, and re-seeds `categories` +
   `mod_role_badges`.
5. **Reconcile migration history** —
   `DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260610000000';`
   so remote history matches the folder (cleaned baseline only). The
   `00000000000000` row survives the teardown (it lives in the
   `supabase_migrations` schema).

---

## Verification (post-teardown)

- Row counts: all user tables = 0; `categories` = 5; `mod_role_badges` = 4.
- `auth.users` = 0.
- `passkey_credentials` has the `attachment` column + CHECK constraint.
- `pg_policies` for `passkey_credentials`: exactly one SELECT + one DELETE (no dups).
- Schema grants present (`GRANT USAGE ON SCHEMA public` to anon/authenticated/service_role).
- `supabase/get_advisors` (security lint) shows no new RLS/security regressions.

---

## What's NOT changing

- No edge function changes (the passkey functions already deployed; they read/
  write the `attachment` column which the rebuilt schema still has).
- No frontend changes.
- Mixed policy naming (`"Users can…"` vs `xxx_select`) is left as-is — cosmetic,
  churning it serves nothing.
- Extensions, the `auth`/`storage`/`supabase_migrations` schemas: untouched
  except as noted.

---

## Rollback / safety

- Pre-launch, no production data; the only loss is 1 test login + 1 test thread,
  intentionally.
- Baseline file edits are version-controlled (git) and revertible.
- Steps are run individually with verification between them; an unexpected result
  halts the sequence before the destructive `DROP SCHEMA`.
