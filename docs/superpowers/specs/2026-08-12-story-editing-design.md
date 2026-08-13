# Story editing — design

**Date:** 2026-08-12
**Status:** approved, ready for planning
**Related work note:** `work/story-editing.md`, `work/draft-autosave.md`, `work/publish-validation.md`

## Goal

A writer can change a story after it's published. Today `PublishStory.jsx` only ever `INSERT`s
into `books` — there is no UPDATE path anywhere in the UI, so a typo has no fix short of
delete-and-republish, which orphans the story's critiques and its position in any series.

## Scope: this is phase 1 of a larger vision

This spec covers **only the author editing their own story** — form reuse, versioning, and
validation. Two things Jeff wants eventually are explicitly **out of scope here** and will each
get their own brainstorm later, built on top of what this spec establishes:

- **Phase 2 — community-proposed changes.** Other users can propose edits to a story (both
  freeform ideas and verbatim text changes), tied to their critiques. Authenticated users can
  up/down-vote a proposed change as a signal. The author has **sole authority** over what actually
  changes — voting is advisory, not binding.
- **Phase 3 — undo.** Once changes (from phase 1 or phase 2) are applied, the author can revert
  them. Needs its own storage design (likely a change/version history table beyond the simple
  counter this phase introduces).

Two adjacent needs came up during this brainstorm and are **deliberately filed as separate work
notes**, not designed here:

- **Content safety flagging** (`work/content-safety-flagging.md`) — applies to all publishing, not
  just edits. Jeff's steer: this should be a *visibility* gate (visible / hidden / needs-review),
  never something that alters story content. The existing `mod_status` column and moderation
  pipeline already model this shape.
- **Document import** (`work/document-import.md`) — importing a `.docx` or similar into the
  markdown editor. Its own dependency, its own failure modes, doesn't ride along for free.

**Design principle for future phases:** an unauthenticated reader always sees only the
author-accepted current state of a story — never a pending suggestion, never an in-review change.
That's automatically true in phase 1 (nothing to review yet) but constrains how phase 2 must work.

## 1. Route & component

`PublishStory.jsx` becomes mode-aware rather than insert-only. A new route,
`src/pages/library/edit/[id].astro`, renders the same component with a `bookId` prop. When present,
the component fetches that book (RLS already restricts to the owner) and pre-fills the existing
fields — title, lede, cover, content, series. Submit branches on whether a `bookId` is present:
`insert` (today's behavior) vs. `update`.

One form, one validation path — avoids maintaining two versions of the same logic.

## 2. Data model

```sql
alter table public.books add column version integer not null default 1;
alter table public.book_comments add column book_version integer not null default 1;

create or replace function public.stamp_book_comment_version()
returns trigger as $$
begin
  select version into new.book_version from public.books where id = new.book_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_stamp_book_comment_version
  before insert on public.book_comments
  for each row execute function public.stamp_book_comment_version();
```

- `version` increments by 1 on every successful edit: `UPDATE books SET …, version = version + 1
  WHERE id = … AND author_id = …`.
- The version stamp on a new critique is set by a `BEFORE INSERT` trigger, not app code — so it
  can't be missed by some future insert path.
- The edit path **never sets `mod_status`**. It stays whatever it was before the edit. This is
  enforced twice: the app doesn't send the column, and the existing `prevent_mod_status_reset`
  trigger (from `20260701000000_rls_hardening.sql`) already blocks a non-moderator from changing it
  regardless.

## 3. Critique version badges

Each critique renders with a background shade keyed to how far behind the story's current version
it was written at (`books.version - book_comments.book_version`):

| Delta | Shade |
|---|---|
| 0 (same version) | Green |
| 1 | Yellow |
| 2 | Orange |
| 3+ | Red |

Critiques are **never removed or hidden** regardless of drift — the badge is informational only,
telling a reader "this feedback was written against an earlier version of the text."

## 4. Series attachment on edit

The series dropdown pre-fills with the story's current series membership. Changing it calls the
existing `addBookToSeries`, same as first publish. Removing a story from a series stays a "My
Stories" action, unchanged — this form has never handled removal, even at publish time.

## 5. Validation (folds in `publish-validation`)

Folded into this PR rather than done separately, since both touch the same form:

- **Story content:** 50-word minimum, 10,000-word maximum. Enforced on **every save**, including
  edits to stories published before this rule existed — a writer fixing a typo in an old
  under-50-word piece will need to bring it up to the floor first. (Jeff's explicit call — simpler
  rule over grandfathering.)
- **Title / lede:** unchanged from today — required, non-empty, no explicit length bound requested.
- **Markdown preview:** a toggle that renders through the exact same `react-markdown` +
  `remark-gfm` pipeline the published story page uses, so preview and reality can never disagree.
  Applies to both publish and edit.

## Acceptance criteria

- [ ] A writer can edit title, lede, cover, series, and content on a story they own
- [ ] `GET`/pre-fill only succeeds for the story's own author (RLS-backed)
- [ ] Saving an edit increments `books.version`; never touches `mod_status`
- [ ] New critiques are stamped with the book's version at time of posting (DB trigger)
- [ ] Existing critiques render with the correct version-delta shade (green/yellow/orange/red)
- [ ] Content is bounded 50–10,000 words on every save, publish or edit, no exceptions
- [ ] Markdown preview toggle renders via the same pipeline as the published page
- [ ] Unit coverage: version increment, critique version stamping, word-count bounds
- [ ] E2E coverage: edit an existing story end-to-end; verify a pre-existing critique keeps its
      badge color after an unrelated edit

## Open questions carried forward (not blocking this phase)

- Exact voting UI/data model for phase 2 community suggestions — not designed yet.
- Undo/revert storage shape for phase 3 — likely needs more than the single `version` counter this
  phase adds (a full snapshot table), to be designed when that phase is scoped.
