# Story Series — Writer-Side Creation UI — HorrorWriter

**Date:** 2026-07-19
**Feature:** Writer-facing series creation, story assignment, ordering, and deletion
**Scope:** New `/my-stories` page, `PublishStory.jsx` series dropdown, series deletion
**Status:** Design spec (ready for implementation)
**Revision (2026-07-19):** the delete-series design was changed from soft-delete + restore to a
real hard-delete, after a site-wide deletion-policy correction (see repo `CLAUDE.md` and the
vault project note) — the site no longer defaults to retaining user content on the assumption it
might need to come back; it deletes for real when the user's intent to delete is clear, with
exceptions only for genuine external obligations (open abuse report under review, legal hold,
CSAM-reporting duty). Deleting your own series with no other claim on it doesn't hit any of
those. The "Data model changes" and "Deleted Series" sections below reflect the revision, not
the original design.

---

## Overview

The Story Series feature (`docs/superpowers/plans/2026-07-06-series-page-implementation.md`) shipped
the reader-facing hub, in-story sidebar, and context bar (2026-07-06 through 2026-07-18), but there
is currently **no way for a writer to create a series or assign stories to one** — only a single
hand-inserted database row exists. This spec covers the missing writer-side surface.

There is also currently no writer dashboard at all: a writer's only view of their own catalog today
is their public `/u/[handle]` profile, mixed in with everyone else's view of them. This work
introduces that dashboard as `/my-stories`.

Explicitly **out of scope**: story editing (no story-edit UI exists anywhere in the app today; not
introduced here), multi-series membership (one series per story only), drag-and-drop reordering,
and the separately-captured "reader-submitted, author-moderated tangents/branches" idea (P11 in the
vault roadmap) — that is a distinct, larger feature requiring its own brainstorm.

---

## Data model changes

### Series deletion — no schema change needed

Deleting a series is a real `DELETE` on the `series` row. The existing hard-DELETE RLS policy
(`"Authors can delete their series"`, from `20260610040000_phase9_features.sql`) already covers
this — no new migration, no new column, no RLS change. `series_books` rows for that series
cascade-delete automatically (`series_id uuid references public.series(id) on delete cascade`,
same migration). The stories themselves are untouched; they just become unassigned and reappear
as assignable in "Your Stories" below. No new columns on `series`, and no change to
`fetchSeriesWithBooks` (`src/lib/series.js`) — a deleted series simply no longer exists to query,
same as any other deleted row.

No schema changes needed for `series_books` (ordering already has `sort_order`; ownership RLS
already fixed in `20260706000000_series_prerequisites.sql`).

---

## `/my-stories` page

**Route:** `src/pages/my-stories.astro` → island `src/pages-react/MyStories.jsx`. Mirrors the
`my-reports.astro` pattern: top-level personal-dashboard route (not nested under `/library`),
`RequireAuth`-gated, wrapped in `withProviders`.

**Entry points:**
- `Profile.jsx`: a "My Stories" link added beside the existing "View My Reports" link.
- `Library.jsx`: a "My Stories" link added beside "Publish a Story" (signed-in state only).

### Layout: two sections, in order

#### 1. Your Series

- **"+ New Series"**: a collapsed row/button that expands inline (no modal, no navigation) into a
  form: title (required), description (optional), and a **required** dropdown listing the writer's
  own published stories to pick one as the series' initial member. A series is never created empty —
  creation and first-story assignment happen in the same action, via a single insert into `series`
  followed by one insert into `series_books` (`sort_order = 0`). This removes "empty series" as a
  state the UI ever has to render.
- Each series renders as a card:
  - Title, description.
  - List of member stories, each with a numeric input bound to `sort_order` (plain number field,
    not drag-and-drop — avoids adding a drag-and-drop dependency) and a "Remove from series" action
    (deletes the `series_books` row; the story itself is untouched).
  - "Delete Series" button → browser `confirm()` (matching the existing pattern used for handle
    changes and passkey removal in `Profile.jsx`) — the wording should say plainly that this is
    permanent (e.g. "Delete this series? This can't be undone. Your stories won't be deleted —
    they'll just no longer be part of a series.") → `DELETE` on the `series` row. The card
    disappears from this list and its stories become unassigned (still visible under "Your
    Stories" below, now assignable to a different series). No restore/undelete — this is a real
    delete, not a hide.

#### 2. Your Stories

- Flat list (explicitly not nested/grouped) of all the writer's published books — title,
  posted-ago, word count, reusing the display conventions already in `Library.jsx`.
- Each row: if the story isn't in a series, an "Add to series" control (`<select>` of the writer's
  active series + confirm button) inserts a `series_books` row at the end (`sort_order` = current
  max + 1). If it is already in a series, show which one and a "Remove from series" action instead.
  One series per story is enforced by this being a single assign/unassign action, not a
  multi-select.

---

## `PublishStory.jsx` change

Add one optional field to the existing form: **"Part of a series?"** — a `<select>` populated from
the writer's own active series (fetched the same way `/my-stories` does), defaulting to "None."

- **Attach-only.** This dropdown never creates a new series — only `/my-stories` can. This was an
  explicit constraint: publishing a story must only let a writer attach it to a series that already
  exists, never spin one up mid-publish. If a writer wants a new series, a short hint below the
  dropdown points them to "Manage series from My Stories."
- On successful publish (`books` insert succeeds and returns `data.id`), if a series was selected,
  a second insert into `series_books` (`sort_order` = current max in that series + 1) runs before
  the redirect to `/library/read/[id]`. If a writer has zero series, the dropdown still renders with
  only the "None" option (no special-casing needed).

---

## Testing

- Unit: extend `src/lib/series.js` (or a new `src/lib/mySeries.js` if the writer-mutation helpers
  are split out) with mocked-client tests for create-with-initial-story, add/remove story,
  reorder, and delete — following the existing mocked-client pattern in `series.test.js`.
- E2E: new `tests/mySeries.spec.js` covering create → assign → reorder → delete, plus
  `series`/`series_books` mock handlers added to `tests/mocks.js` (these don't exist yet — this
  spec's E2E work and the still-open Tasks 7–8 from the 2026-07-06 plan should share those mocks
  rather than duplicating them).
- Existing `library.spec.js` / publish flow E2E gets a case for the new optional series dropdown.

---

## Open items deliberately deferred (not in this spec)

- Task 9 from the 2026-07-06 plan (responsive refinement, inline-style → token migration for
  `SeriesHub`/`SeriesSidebar`) is unrelated to writer-side creation and stays a separate task.
- Reader-submitted/author-moderated tangents (P11) — separate feature, separate brainstorm.
