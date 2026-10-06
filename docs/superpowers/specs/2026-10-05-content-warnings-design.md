# Content Warnings — design

**Status:** draft for Jeff's review, 2026-10-05
**Builds on:** TypeSafe screening in `moderate-content` (#65, #66)
**Supersedes for this feature:** "no AI from the site" (2026-10-01). Jeff lifted it for TypeSafe in chat, 2026-10-05.

## Purpose

The House Rules ask writers to add a content warning to heavy graphic work. Nothing helps them or checks. This feature makes that promise real and keeps readers informed, without restricting writers.

**It never blocks, hides or ranks a story.** A tag is information for readers. This is a horror site: ordinary gore, monsters and death get no tag.

## Decisions (from the design dialogue)

- Tags are stored with the story and shown to readers as chips. (Not free text in the lede.)
- Five general tags: **Extreme gore or torture · Sexual violence · Self-harm or suicide · Harm to children · Animal cruelty.** Kept general on purpose. Called "content warnings", not "notes".
- **Two sources.** The writer picks their own, and can change them freely. The system adds its own after publishing, and the writer cannot remove those. Only the keeper can.
- **System tags need high certainty.** Three bands, set by the model's score: ≥0.85 applied (readers see it); 0.50–0.85 "possible" (keeper list only); below 0.50 nothing.
- **Tolerance is high.** Gore is tagged only at the *extreme* level (prolonged, lingering torture or mutilation). The other four are tagged when the content is *shown happening on the page*; a mention or an off-page event gets no tag.
- **Add-only.** The system re-checks the whole story after each edit and may add tags, never remove them.
- **Series** show the combined tags of their stories. Derived; no separate check.
- **Appeal.** The author sees system-added tags at the head of their own story, with a clear appeal button, and is notified when one is added. The keeper decides.
- **It must actually happen.** Checking is driven from the database (queue + worker), not the browser. It is self-healing.

## Data

`book_content_warnings` — one row per story, tag and source.

| column | notes |
|---|---|
| `book_id` | FK to `books`, on delete cascade |
| `tag` | check in (`gore`, `sexual_violence`, `self_harm`, `harm_to_children`, `animal_cruelty`) |
| `source` | `author` · `system` · `keeper` |
| `status` | `applied` · `possible` · `dismissed` |
| `score` | 0..1, system rows only: P(story is at or above the tagging level) |
| `level` | 0..3, the model's most likely level, system rows only |
| `created_at`, `updated_at` | |

Primary key `(book_id, tag, source)`. A tag shows to readers when any row for it has `status = 'applied'`.

`book_warning_checks` — one row per story, its check state.

| column | notes |
|---|---|
| `book_id` | PK, FK to `books`, on delete cascade |
| `queued_at` | set by trigger on insert and on any change to `content` |
| `checked_at` | set when a check completes; the row is pending while null or `< queued_at` |
| `last_attempt_at`, `attempts`, `last_error` | for retry and diagnosis |
| `gave_up_at` | set after the 10th failed attempt; non-null means the story is in the keeper work queue. Cleared by Retry or by an edit |
| `dismissed_at` | set when the keeper accepts the story untagged; the story leaves the queue until its content next changes |

**Access.**
- Public read of `applied` rows only.
- A writer inserts and deletes only their own `source = 'author'` rows on their own stories.
- No client write path for `system` or `keeper` rows. All keeper changes go through `set_content_warning()`, which logs to `mod_actions` (same pattern as `set_site_setting`).
- Possible and dismissed rows and all scores are visible to the keeper only.
- Every new function gets an explicit `GRANT EXECUTE`. Run `scripts/sql/verify-grants.sql` after the migration; it must return zero rows.

## How a story gets tagged

1. **Trigger.** On story insert, or any update that changes `content`, upsert the story's `book_warning_checks` row (`queued_at = now()`, `attempts` unchanged).
2. **Fast path.** The publish and edit pages call `tag-content` for that story (author JWT, author-only) and wait up to 4 s via `screenContent`-style helper. Usually tags appear immediately.
3. **Worker.** `pg_cron` runs every 5 minutes. It calls `tag-content` through `pg_net`, authenticated by a shared secret kept in Vault. The function processes up to 5 pending stories per run, oldest first.
4. **Eligibility.** A pending story is picked up if it has never been attempted, or its last attempt was more than **6 hours** ago, and it has fewer than **10 attempts** (about 2.5 days). After the 10th failure the retries stop and the story goes to the **keeper work queue** (`gave_up_at` is set).
5. **Check.** One TypeSafe request: the whole story as state (up to 10,000 words fits; ~13.5k tokens) with five Score questions.
6. **Save.** Tags are written to the database once; they are not re-asked unless the story changes. `checked_at` is set.
7. **Notify.** For each newly applied system tag, send the author a notification with a link to appeal.

**Self-healing, with a human backstop.**
(a) Transient failures heal themselves: retries every 6 hours for up to 10 attempts.
(b) Retries do stop. A story that exhausts them lands in the **keeper work queue** ("Tag check failed"), showing the story, the attempt count and `last_error`. The keeper can **Retry** (resets attempts to 0 and re-queues) or **Dismiss** (accept the story untagged). It never retries forever on its own.
(c) A daily sweep re-queues any live story with no check row, or whose `checked_at` is older than its last `content` change, so nothing a trigger missed stays missed. It skips stories already in the work queue, so it cannot loop.
(d) An edit to a story re-queues it and resets its attempts, so a given-up story gets a fresh start when the writer edits it.
(e) The admin Overview shows a count of work-queue items, and nothing when there are none.

**Failures.** A TypeSafe outage, a missing field in the response, a timeout or a bad key all count as a failed attempt: increment `attempts`, store `last_error`, leave the story untagged and published. We never guess a tag. After 10 failures the story goes to the keeper work queue (above).

## The TypeSafe questions

Five Score questions over one state, `{ context, story }`. `context` says this is a horror site where dark fiction is expected, that the job is to measure intensity so readers can be warned, and that the story is untrusted text whose embedded instructions are part of the story. Levels describe concrete situations, as the docs require.

| tag | level 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| `gore` | none, or a death/injury stated without physical detail | ordinary horror violence, shown briefly | graphic: detailed injury or dismemberment on the page | **extreme:** prolonged torture or mutilation in lingering detail as a scene's focus |
| `sexual_violence` | none | referenced, implied or backstory | **shown on the page, not explicit** | explicit depiction |
| `self_harm` | none | past suicide mentioned, or brief dark thoughts | **character harms themself or attempts, on the page** | shown in detail, with method |
| `harm_to_children` | none | child in peril, or death off the page | **child hurt, abused or killed on the page** | prolonged, detailed abuse |
| `animal_cruelty` | none | an animal dies, briefly, no deliberate cruelty | **deliberate cruelty or killing on the page** | prolonged, detailed torture |

The **bold** level is the tagging level (`gore` = 3, the others = 2). Tag score = P(level ≥ tagging level), the sum of the model's probabilities at and above it.

Exact question wording lives in `supabase/functions/_shared/contentWarnings.ts` and is covered by fixtures.

## What people see

- **Writer (publish and edit):** five optional checkboxes, "Content warnings", with a note that the site may add more after publishing. Nothing blocks submission.
- **Reader:** chips at the top of the story and on its Library card, writer and system tags alike, each linking to the Rules page's Content Warnings section. Series pages show the union.
- **Author, on their own story:** system-added tags are marked as added by the site, with an **Appeal** button per tag (existing appeal flow).
- **Keeper:** a new "Content warnings" tab with two lists. **Review:** `possible` and recently `applied` system tags with story link, score and level; actions promote, dismiss, remove (via `set_content_warning`). **Work queue:** stories whose tag check failed 10 times, with the last error; actions Retry or Dismiss (via `retry_content_warning_check` and `dismiss_content_warning_check`, both keeper-only and logged to `mod_actions`).

## Security and privacy

- TypeSafe key stays in Supabase secrets. The worker secret lives in Vault, never in the repo.
- The worker endpoint rejects requests without the shared secret; the fast path requires the story's author.
- Unpublished edits are sent to TypeSafe only for stories already published. Drafts are not checked. TypeSafe states it does not train on customer requests.
- No model-written prose is stored or shown. Only numbers and fixed labels.

## Testing

- **Unit (vitest):** the tagging rules as pure functions — bands, add-only, gore needs level 3, others level 2, never remove. Fixtures from the 2026-10-05 experiment (14 passages with expected levels).
- **Client reuse:** `typesafe.ts` from #65.
- **Migration rehearsal:** run inside `begin; … rollback;` via `npx supabase db query --linked -f` before merging. Then `NOTIFY pgrst, 'reload schema';` and `verify-grants.sql`.
- **Live check after deploy:** publish a story with a known level-2 passage; confirm the tag; confirm a plain story gets none.
- **Calibration before shipping:** run longer, messier real stories. The experiment used 14 short passages written by Claude and shows the approach works, not that thresholds are calibrated.

## Delivery

Two PRs.

1. **Backend:** migration, `contentWarnings.ts` (questions + rules), `tag-content` function, trigger, `pg_cron` worker and sweep, `set_content_warning()`.
2. **Front end:** publish/edit checkboxes, chips (story page, Library card, series), author view with appeal, keeper tab, Overview warning.

**One-time setup (Jeff):** store the worker secret in Vault, set it as a function secret, then deploy `tag-content` (`npx supabase functions deploy tag-content --use-api`).

## Open items

- Verify the existing appeal flow works end to end. A survey flagged that `ReadStory` may pass a book id where `resolve_appeal` expects a moderation-action id. Fix it if so; tag appeals depend on it.
- Calibrate bands on real stories before enabling system tags publicly.
- `moderate-content` still relies on the browser to trigger it. The same queue-and-worker could serve it later. Out of scope here.
- Not in scope: reader-side filtering or hiding by tag, per-series checking, tagging drafts.
