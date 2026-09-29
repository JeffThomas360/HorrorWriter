# Midnight Ritual — design

**Date:** 2026-09-28 · **Status:** approved in conversation, awaiting Jeff's review of this document
**Replaces:** the static five-channel `MidnightRitual.jsx` on the home page

## Why

Today the Midnight Ritual is five hardcoded prompts and a writing box whose "Finish Draft" button
saves nothing. Jeff wants it to really work.

It lines up with three things already on record in the vault:

- `purpose.md` (2026-09-26): *AI writing prompts to whet the appetite to write. Prompts only, as
  sparks; the writing itself stays human.*
- `purpose.md` audit: the site is missing *a recurring rhythm, something that happens on a
  schedule, so there's a reason to return.*
- The success metric is stories getting critiqued. Shared ritual pieces become ordinary stories,
  so they feed that directly.

## Decisions (Jeff, 2026-09-28)

| Question | Decision |
|---|---|
| Where a finished piece goes | **Writer chooses:** private by default, with an option to share under the prompt |
| Where prompts come from | **AI drafts, Jeff approves**, from a review queue in the admin panel. Jeff can also add his own |
| Cadence | **One shared prompt a week.** Past prompts stay open |
| Accounts | **Write first, sign in to save.** The draft survives the sign-in |
| Word limit | **500 words** |
| Storage approach | **C:** private drafts in their own table; sharing turns a draft into a normal story |
| Seal on account deletion | **Drafts are sealed too**, alongside stories and series |

Defaults Claude chose that Jeff has not explicitly confirmed. Change them at review if wrong:

- **Share asks for confirmation** ("This will be public. Share?") and **requires a title**.
- **Weekly slot: Friday 03:00, `America/New_York`.** One fixed instant for everyone, because a
  shared prompt can't unlock at each visitor's local 3 a.m. The existing `WitchingHourBar`
  countdown stays local-time; it is a mood clock, not the prompt schedule.
- **Model for drafting prompts:** `claude-sonnet-5`. A batch of 8 costs well under a cent.

## What writers see

**Home page box** (rewritten `MidnightRitual.jsx`):

- Shows **this week's prompt**, meaning the current released prompt.
- Shows a countdown to the next unlock, or "Next ritual coming soon" when nothing is scheduled.
  It never counts toward a time that won't happen.
- Links to **Past rituals** (`/ritual/`).
- If no prompt has ever been released, it shows "The first ritual is being prepared." There is
  never a fake prompt.

**Writing:**

- "Write to this prompt" opens a text box with a live word count, capped at 500.
- Save is disabled over the cap, and the count shows `512 / 500`.
- The text autosaves to `localStorage` under `hw.ritual.draft.<promptId>` as the writer types.
  Every read and write is wrapped in try/catch. If storage is unavailable, writing still works;
  only the safety net goes quiet.

**Saving:**

- **Signed in:** "Save draft" inserts or updates a row in `ritual_drafts`.
- **Signed out:**
  1. Clicking Save sets `hw.ritual.saveAfterSignin = <promptId>` in `localStorage`.
  2. It then dispatches `open-signin`, reusing the existing `window.__signinPending` hand-off in
     `MainLayout.astro` so the request survives the hydration gap.
  3. When a session appears, including after an OAuth or passkey redirect, the island sees the
     flag, saves the local draft, clears the flag, and confirms.

**After saving**, there are two actions:

- **Keep private.** The draft is listed under **My Rituals**, only visible to its author, and can
  be edited or shared later.
- **Share under this prompt.** This opens a confirm dialog with a required title, then runs
  `share_ritual_draft`, then calls `moderate-content` fire-and-forget, exactly as
  `PublishStory.jsx:174-178` does.

**Pages** (SSR, modelled on `src/pages/library/read/[id].astro`):

- `/ritual/`:
  - Lists released prompts, newest first, each with its **real** count of visible shared responses.
  - For signed-in writers there is a **My Rituals** section: their drafts, each with Edit and
    Share.
- `/ritual/<YYYY-MM-DD>/` (the go-live date in the site timezone):
  - Shows the prompt, a "Write to this prompt" box (the same island), and the shared responses.
  - Unreleased or unknown dates return a 404 via `lookupOutcome()`.

**Library:** shared pieces appear as normal stories. The story reader shows "Written for the
Midnight Ritual of <date>", linking to the prompt page.

## Keeper review queue (admin panel)

There is a new **Rituals** tab in `Admin.jsx`, visible only when `isKeeper`. It has four parts.

**Draft 8 prompts:**

- The button invokes the Edge Function `draft-ritual-prompts`, which inserts 8 rows as `pending`.
- The prompt given to the model asks for one- or two-sentence horror sparks in the tone of the
  current five, varied across subgenres (cosmic, folk, analog/found footage, psychological, body,
  domestic, and so on). It passes the last 30 prompts so the model avoids repeats.

**Pending list:** each prompt can be edited inline, approved or rejected.

- **Approve** schedules it into the next free weekly slot and shows the date ("Goes live Fri 9
  Oct, 03:00 ET").
- **Reject** deletes it for real, per `feedback_deletion_policy`.

**Schedule list:** upcoming approved prompts in order.

- **Un-schedule** returns a prompt to pending, and later prompts move up to close the gap.
- Released prompts (`goes_live_at <= now()`) are locked: no edit, no un-schedule, no delete.

**Add prompt:** a text box that creates a `pending` prompt with `source = 'keeper'`.

**Overview tab:** shows a warning tile when fewer than 2 prompts are scheduled in the future.

**Audit:** every action writes to `mod_actions` with `target_type = 'ritual_prompt'`:

- `ritual_prompts_drafted` (metadata: count)
- `ritual_prompt_added`
- `ritual_prompt_edited`
- `ritual_prompt_approved` (metadata: `goes_live_at`)
- `ritual_prompt_unscheduled`
- `ritual_prompt_rejected`

## Data

All of this goes in one migration in PR 1. There is no client write path to `ritual_prompts`:
every write goes through keeper-gated `SECURITY DEFINER` functions, the same pattern as
`set_site_setting`.

### `ritual_prompts`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `body` | text not null | 10–400 chars (CHECK) |
| `status` | text not null | `pending` \| `scheduled` (CHECK) |
| `goes_live_at` | timestamptz null | required iff `scheduled`; UNIQUE |
| `source` | text not null | `ai` \| `keeper` |
| `created_by` | uuid → profiles on delete set null | |
| `created_at`, `updated_at` | timestamptz | `updated_at` trigger |

- **RLS SELECT:**
  - Anyone (anon and authenticated) can read rows where
    `status = 'scheduled' AND goes_live_at <= now()`.
  - Keepers (`mod_can('configure','all')`) can read all rows.
- **No INSERT, UPDATE or DELETE policies.**

### `ritual_drafts`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `author_id` | uuid not null → profiles **on delete cascade** | "Erase everything" removes drafts with no trigger change |
| `prompt_id` | uuid not null → ritual_prompts on delete restrict | |
| `content` | text not null | CHECK: 1–500 words (`\S+` tokens, the same rule as the client) and ≤ 6000 chars |
| `created_at`, `updated_at` | timestamptz | |

- **UNIQUE (`author_id`, `prompt_id`):** one draft per writer per prompt.
- **RLS:** the owner can select, insert, update and delete where `author_id = auth.uid()`.
- **INSERT and UPDATE also require:**
  - `NOT is_banned(author_id)`
  - the prompt is released (`EXISTS` a scheduled prompt with `goes_live_at <= now()`)
- **No separate rate limit.** The UNIQUE (`author_id`, `prompt_id`) constraint already caps a
  writer at one draft per released prompt. Sharing inserts into `books`, which keeps its existing
  `rate_limit_books` trigger.

### `books.prompt_id`

- A nullable column: uuid → `ritual_prompts` on delete restrict, with an index.
- Existing policies are unchanged; `books_select` / `content_visible` already hide moderated
  content.
- The column is added to `STORY_FIELDS` in `sealCollect.js` so a sealed shared piece keeps its
  link.

### Functions

Every function below gets an explicit `GRANT EXECUTE` (the post-`20260910000000` default is
private), and `scripts/sql/verify-grants.sql` must return zero rows afterwards.

**Keeper functions** (`SECURITY DEFINER`, gated by `mod_can('configure','all')`, granted to
`authenticated`, each writes `mod_actions`):

- `ritual_add_prompt(body)`
- `ritual_edit_prompt(id, body)`
- `ritual_approve_prompt(id)` → returns `goes_live_at`
- `ritual_unschedule_prompt(id)`
- `ritual_reject_prompt(id)`
- `ritual_list_queue()`: returns pending plus future-scheduled rows

**Public function:** `ritual_next_unlock()` returns a timestamptz or null. It is
`SECURITY DEFINER`, granted to anon and authenticated, and exposes the time of the next unlock
without its text.

**Writer function:** `share_ritual_draft(draft_id, title)` returns a book id. It is
`SECURITY INVOKER` and granted to authenticated. In one transaction, under the caller's own RLS:

1. Insert into `books` with `title`, `content`, `author_id = auth.uid()`, `version = 1` and
   `prompt_id`.
2. Delete the draft.

Because it runs as the caller, it passes through exactly the same book INSERT policy and triggers
as `PublishStory`. Any failure rolls back both steps.

**Schedule packing** (inside approve and unschedule):

- A slot is a Friday at 03:00 `America/New_York`, computed in SQL with `AT TIME ZONE` so daylight
  saving time is handled.
- Future scheduled prompts always occupy consecutive slots, starting at the first slot after
  `now()`.
- **Approve** appends to the end.
- **Unschedule** removes the prompt and re-packs the future ones in their existing order.
- Released prompts are never moved.
- The slot arithmetic also lives in a pure JS helper (`src/lib/ritualSchedule.js`) for display
  and unit tests. The SQL is authoritative.

**Current prompt:**

```sql
select … from ritual_prompts
where status = 'scheduled' and goes_live_at <= now()
order by goes_live_at desc
limit 1
```

RLS alone makes this safe for anon.

### Edge Function `draft-ritual-prompts`

1. Verify the JWT, then call `mod_can('configure','all')` as the user. It refuses with 403
   otherwise.
2. Refuse if 40 or more prompts are already pending (a cost and clutter guard).
3. Read the last 30 prompts (released and scheduled) using the service role.
4. Call the Anthropic Messages API (`claude-sonnet-5`), asking for a JSON array of exactly 8
   strings. Validate the length rules and drop duplicates.
5. Insert the prompts as `pending, source='ai'` and write one `mod_actions` row.

**Secret:** `ANTHROPIC_API_KEY`. It does not exist yet. **Jeff adds it** in the Supabase dashboard
(Edge Functions → Secrets); Claude never handles the key. Without it, the function returns a clear
error and the tab shows it.

**Deploy:** by hand, `npx supabase functions deploy draft-ritual-prompts --use-api`, after PR 2's
migration is live.

## Sealing on account deletion

These changes are in `src/lib/sealCollect.js`. The Edge Functions and `_shared` stay unchanged,
since they never read bundle contents.

- Bump `PAYLOAD_VERSION` to 3 and add `rituals: [{ prompt_id, content, created_at }]`, with a
  `RITUAL_FIELDS` allowlist.
- `collectWriting` also reads the member's `ritual_drafts`.
- `checkPayloadVersion` accepts both 2 and 3. A v2 bundle simply has no rituals.
- `planRestore` counts ritual drafts, and `restoreWriting` re-inserts them. It skips any
  (`prompt_id`) the writer already has a draft for. `prompt_id` always still exists, because
  released prompts can't be deleted (`on delete restrict`, and keeper functions refuse).
- `SealedWritingPrompt.jsx` includes rituals in its restore summary.
- Tests: `sealCollect.test.js`, `SealedWritingPrompt.test.jsx` and
  `scripts/sql/test-delete-member.sql` are extended.

## Edge cases

| Case | Behaviour |
|---|---|
| Queue runs dry | The last released prompt stays current; the countdown says "Next ritual coming soon"; the Overview warns at fewer than 2 scheduled |
| The week rolls over mid-draft | The draft stays tied to its prompt; old prompts stay open for saving and sharing |
| Over 500 words | Save is disabled client-side; the DB CHECK rejects it anyway |
| No localStorage | Writing works; autosave and the sign-in hand-off are skipped (Save then saves only if already signed in) |
| `supabase` is null (unconfigured env) | The box shows the static "being prepared" state; no query is made |
| Model down, or key missing | The Draft button shows the error; the queue and live prompt are unaffected |
| A shared piece is hidden or removed | It disappears from the prompt page and counts, via the existing `content_visible` RLS |
| Banned member | Save and share are refused by RLS (`is_banned`), and the UI shows the standard message |
| Keeper edits a released prompt | Refused by the function; the UI shows it as locked |

## Testing

TDD. Tests are written before code in each PR.

**Unit tests (vitest):**

- `ritualSchedule.js`: slot computation across DST changes, packing after unschedule, "next
  unlock", and current-prompt selection.
- Word count and the 500 cap.
- The draft hand-off through sign-in, simulating flag, then session, then save.
- `MidnightRitual`: its states (no prompt, current prompt, dry queue, signed out vs in).
- The admin Rituals tab: its states and locked rows.
- `sealCollect`: v3 collect and restore, and reading v2 bundles.
- **Honesty guard:** `honestSignals.test.js` currently bans "weekly" prompt claims (added in PR
  #59). PR 3 replaces that with a guard that the home box reads its prompt from the database and
  contains no hardcoded prompt list.

**SQL rehearsal** (`scripts/sql/test-rituals.sql`, run inside `begin … rollback` against the
linked project). It proves that:

- member A cannot read member B's drafts
- anon cannot read pending or future prompts
- a non-keeper cannot call the keeper functions
- sharing is atomic
- a draft cannot target an unreleased prompt
- released prompts cannot be edited or unscheduled

It also runs `verify-grants.sql`.

**E2E (Playwright, run on Jeff's machine):** one spec covering the whole path: write signed-out,
save, sign in, the draft is saved, share, and the piece appears on the prompt page.

## Rollout: three PRs, each mergeable alone

1. **Database:**
   - The migration (tables, RLS, functions, `books.prompt_id`) and `NOTIFY pgrst, 'reload schema'`.
   - The seal v3 changes.
   - The SQL rehearsal.
   - Nothing visible changes.
2. **Admin:**
   - The Rituals tab, the Overview warning and the `draft-ritual-prompts` function.
   - After merge: Jeff adds `ANTHROPIC_API_KEY`, the function is deployed by hand, and Jeff
     drafts and approves the first prompts.
3. **Writers:**
   - The new home box, saving and the sign-in hand-off, My Rituals, sharing, the `/ritual/`
     pages, the reader link and the honesty-guard swap.
   - Merge only once at least one prompt is released, so the box is never empty at launch.

## Out of scope

- Critique credits or economy tie-in. Shared pieces are ordinary stories, so whatever
  `critique-economy` builds applies to them automatically.
- Notifications ("a new ritual is live").
- More than one prompt per week, and genre channels.
- AI help with the writing itself. Never, by decision.
