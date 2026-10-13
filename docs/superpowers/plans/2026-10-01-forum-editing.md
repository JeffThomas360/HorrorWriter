# Forum Post Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members edit their own forum thread (title and opening post) and their own replies, with an honest "edited" marker and re-screening on save.

**Architecture:** Members have no UPDATE policy on `threads` or `posts`. RLS can't restrict an update to certain columns, so an author policy would let an author flip their own `mod_status` from `hidden` back to `live`. Edits therefore go through two `SECURITY DEFINER` functions that change only the text and `edited_at`:
- `edit_forum_thread(p_thread_id, p_title, p_content)` changes the title and the opening post in one transaction.
- `edit_forum_post(p_post_id, p_content)` changes a reply.

The client calls these from a new `PostCard` component (hooks live there, not in `ThreadView`'s early-return body). After saving, it fires `moderate-content` exactly as creating a post does.

**Tech Stack:** Postgres/PLpgSQL migration, React 19 island, @tanstack/react-query, vitest + Testing Library, SQL rehearsal via `scripts/sql/rehearse.ps1`.

**Spec:** the design agreed in chat with Jeff on 2026-10-01; there is no separate spec document:
- Authors edit their own opening post (title and body) and their own replies, at any time.
- Edited posts show an "edited" marker.
- Every edit is re-screened by the same check that runs on new posts.
- Banned members can't edit, and hidden posts stay hidden after an edit.
- Out of scope: edit history, and deleting your own post.

## Global Constraints

- Migration `supabase/migrations/20261001000000_forum_editing.sql`. **Merging applies it to production.** Rehearse it first with `rehearse.ps1`.
- Both new functions: `SECURITY DEFINER`, `set search_path = ''`, `revoke all ... from public, anon, authenticated`, then `grant execute ... to authenticated`. Add allowlist rows to `scripts/sql/verify-grants.sql`; it must return 0 rows after the merge.
- End the migration with `notify pgrst, 'reload schema';` (new columns).
- Edits never change `mod_status`, `author_id`, `category_id`, `pinned` or `replies_count`.
- **An edit is not activity.** `threads.updated_at` orders the forum list, so a title edit must not bump the thread. The touch trigger leaves `updated_at` alone when `edited_at` changes.
- Errors are raised as stable codes the client maps to plain words: `not_signed_in`, `banned`, `not_found` (also used for "not yours", so ids can't be probed), `empty`.
- **No `mod_actions` row for member edits.** That table feeds the public transparency log; `edited_at` is the record.
- `supabase` may be null; island hooks go before early returns; ember for small red text.

## Review Focus

1. **A hidden or screening post is edited.** Its status must stay as it is. Re-screening must not overwrite it (`moderate-content` already skips non-`live` rows). Pinned in Task 1 SQL.
2. **Someone else's post id is sent to the function.** Expected: `not_found`, and nothing changes. Pinned in Task 1 SQL.
3. **A tombstoned thread** (author erased their account, `author_id` null): nobody can edit it. Pinned in Task 1 SQL.
4. **A blank or whitespace-only save.** Refused client-side (Save disabled) and server-side (`empty`). Pinned in Tasks 1 and 3.
5. **The editor is opened, then Cancel.** The original text must be restored, with no request sent. Pinned in Task 3.

---

### Task 1: Migration and SQL behaviour test

**Files:**
- Create: `supabase/migrations/20261001000000_forum_editing.sql`
- Create: `scripts/sql/test-forum-editing.sql`
- Modify: `scripts/sql/verify-grants.sql` (allowlist)

**Interfaces — Produces:**
- `threads.edited_at timestamptz null` and `posts.edited_at timestamptz null`
- `edit_forum_thread(p_thread_id uuid, p_title text, p_content text) returns void`
- `edit_forum_post(p_post_id uuid, p_content text) returns void`

Steps:
- [ ] Write `test-forum-editing.sql` (`begin; … rollback;`, ends `select 'ALL PASS'`). It covers:
  - the author edits a reply: the content changes, `edited_at` is set, `mod_status` is unchanged
  - the author edits a thread: the title and opening post change, and `threads.updated_at` is unchanged
  - another member gets `not_found` on both, and nothing changes
  - a banned author gets `banned`
  - empty content or an empty title gets `empty`
  - a hidden post stays `hidden` after an edit
  - a tombstoned thread (author_id null) can't be edited
  - anon can't execute either function
- [ ] Run it with `rehearse.ps1` against the migration before writing the migration. **Expected:** FAIL, because the function does not exist.
- [ ] Write the migration.
- [ ] Rehearse again. **Expected:** ALL PASS.
- [ ] Add allowlist rows to `verify-grants.sql`. Rehearse `verify-grants.sql` with the migration spliced in. **Expected:** 0 rows.
- [ ] Commit `feat(forum): edit functions and edited_at`.

### Task 2: Client data layer

**Files:** Create `src/lib/forumEditing.js` and `src/lib/forumEditing.test.js`.

**Interfaces — Produces:**
- `editThread(threadId, title, content) => Promise<void>`
- `editPost(postId, content) => Promise<void>`
- `forumEditErrorMessage(error) => string`

Both edit functions throw `new Error(message)`. Both fire `moderate-content` after a successful save:
- `editThread` screens the title (`thread`) and the opening post (`post`). It needs the opening post's id, so its signature takes `{ threadId, openingPostId, title, content }`.
- `editPost` screens the post (`post`).

Each screening call is fire-and-forget, with `.catch(console.error)`, matching `CreateThread.jsx`.

Messages:

| Code | Message |
|---|---|
| `banned` | "Your account is suspended, so you can't edit posts right now." |
| `not_found` | "That post no longer exists, or isn't yours to edit." |
| `empty` | "A post can't be empty." |
| `not_signed_in` | "Please sign in to edit." |
| anything else | its own message |

Steps: failing test → implement → pass → commit `feat(forum): edit data layer`.

### Task 3: Edit UI on the thread page

**Files:**
- Create: `src/components/forum/PostCard.jsx` and `src/components/forum/PostCard.test.jsx`
- Modify: `src/pages-react/ThreadView.jsx`. The article markup moves into `PostCard`. The `threads` and `posts` selects already use `*`, so `edited_at` comes through.

**`PostCard` props:** `{ post, label, isOpening, thread, currentUserId, onReport, onSaved }`.

Behaviour:
- "Edit" shows only when `currentUserId === post.author_id`, the post isn't a tombstone, and (for the opening post) the thread isn't a tombstone either.
- The opening post edits the title and the body; a reply edits the body only. The body uses `MarkdownEditor`, the title a plain input.
- Save is disabled while anything is blank or a save is in flight. Cancel restores the original and sends nothing.
- On success: leave edit mode, call `onSaved()` (ThreadView invalidates `['thread', id]` and `['posts', id]`), and show `toast.success('Saved.')`.
- On error: show the message inline (`role="alert"`) and stay in edit mode, so nothing typed is lost.
- When `edited_at` is set, the meta line shows `· edited` with `title="Edited <locale date>"`. For the opening post, the thread's `edited_at` also counts.

Tests:
- Edit is shown to the author and hidden from others and from signed-out visitors.
- A reply edit calls `editPost`.
- An opening-post edit calls `editThread` with the title.
- Blank text disables Save.
- Cancel restores the text and sends no call.
- An error is shown and edit mode is kept.
- The "edited" marker renders from `edited_at`.

Steps: failing test → implement → pass → wire into ThreadView → `npm run test:unit` and `npm run build` → commit `feat(forum): edit your own thread and replies`.

### Task 4: Verify, review, PR

- [ ] Run `npm run dev`, then open a thread page and read the console. Do not save an edit locally: dev writes go to production.
- [ ] Whole-branch review by a fresh reviewer.
- [ ] Push and open the PR. The body must say that merging applies migration `20261001000000`.
- [ ] After merge, confirm all three:
  - `schema_migrations` has `20261001000000`
  - `test-forum-editing.sql` returns ALL PASS against the linked database
  - `verify-grants.sql` returns 0 rows
- [ ] Vault: add forum editing to "Recently shipped".
