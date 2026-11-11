# Download My Writing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any member can download everything they wrote as one `.zip` of plain Markdown files, at any time, banned or not.

**Architecture:** Browser-only. A new `src/lib/writingExport.js` reads the member's own rows through normal RLS, turns them into `{ path, text }` files with pure functions, and zips them with a lazily loaded library. A small component on the profile page drives it. Kept (vault) work gets its own Download, which decrypts in the browser without calling a restore RPC. No migration and no Edge Function.

**Tech Stack:** React islands, supabase-js, vitest, Playwright, `fflate` (MIT, new dependency).

**Spec:** `docs/superpowers/specs/2026-11-06-bans-and-appeals-design.md`, "Piece 1". This is the first of four plans. Bans, member votes and the rules rewrite get their own.

## Global Constraints

- Includes the member's stories, Ritual entries, forum threads and posts, critiques, Ritual drafts and series structure, **including work a mod removed**.
- Excludes other people's words, such as critiques on their stories or replies in their threads.
- Entirely in the browser using what RLS already lets an author read. No new server load.
- `collectWriting` in `sealCollect.js` must not be reused or changed: it omits posts and critiques and drops mod-hidden stories on purpose.
- Any zip library must be openly licensed and self-hosted (bundled from npm, no CDN).
- `supabase` may be null: guard it. Hooks go before early returns. `withProviders` is a named export.
- `package.json` overrides pin `vite ^8`. Confirm npm didn't downgrade it after installing.
- Buttons follow the existing `SMALL_BTN` style in `KeptStories.jsx`, with a 44px tap target for the main button.
- Jeff runs the full suites. Implementers run only the single test file named in each step.
- Branch from `main`, not from PR #132's branch. This piece doesn't depend on #132.

## Review Focus

1. **A member with more than 1000 rows in a table.** PostgREST caps a response at 1000 rows, so all of them must be exported. Test in Task 1.
2. **A request failing partway through.** There must be no partial zip, because a silently incomplete download breaks the promise. The member sees an error and can retry. Tests in Tasks 1 and 3.
3. **Titles that can't be file names** (`Who/What?`, `CON`, `...`, 300 characters, two stories with one title). Each gets a valid file, and nothing overwrites anything. Test in Task 2.
4. **A post in a thread the member can no longer see,** because a mod hid the thread, or a critique on a removed story. The writing is still exported, with a fallback heading. Test in Task 2.
5. **An account with no writing.** They're told so, and no empty zip downloads. Test in Task 3.

---

### Task 1: Collect a member's writing

**Files:**
- Create: `src/lib/writingExport.js`
- Test: `src/lib/writingExport.test.js`
- Create: `scripts/sql/test-download-access.sql`

**Interfaces:**
- Produces: `fetchAllRows(makeQuery: () => query, pageSize = 1000): Promise<Row[]>`, where `makeQuery` returns a fresh ordered query for each page.
- Produces: `collectMyWriting(client, userId): Promise<Collected>`, where `Collected` is `{ stories, series, seriesBooks, threads, posts, critiques, drafts, threadsById, storyTitlesById, promptBodiesById }`.
- Produces: `countWork(collected): number`, the number of stories, threads, posts, critiques and drafts.

Exact columns, each filtered by `author_id = userId`, ordered by `id`:

| Table | Columns |
|---|---|
| `books` | `id, title, lede, content, mod_status, prompt_id, created_at, updated_at` |
| `threads` | `id, title, category_id, mod_status, prompt_id, created_at` |
| `posts` | `id, thread_id, title, content, mod_status, created_at, updated_at` |
| `book_comments` | `id, book_id, content, mod_status, created_at` |
| `ritual_drafts` | `prompt_id, content, created_at, updated_at` |
| `series` | `id, title, description, created_at` |

Then the lookups, each in `.in()` chunks of 100 ids to keep URLs short: `series_books` (`series_id, book_id, sort_order`) by the series ids, `threads` (`id, title, prompt_id`) by `posts.thread_id`, `books` (`id, title`) by `book_comments.book_id`, and `ritual_prompts` (`id, body`) by the drafts' and threads' `prompt_id`. A row missing from a lookup because RLS hides it is normal, not an error.

- [ ] **Step 1: Write the failing tests** using a small fake client, as `storyKeep.test.js` does:
  - `fetchAllRows` returns 1003 rows from a 1000-row page plus a 3-row page, and asks for ranges `0-999` then `1000-1999`.
  - `fetchAllRows` stops after one page when it's shorter than the page size.
  - `fetchAllRows` throws if the second page returns an error.
  - `collectMyWriting` filters every table by the given user id.
  - `collectMyWriting` throws if any one query errors.
  - `collectMyWriting` asks for 250 thread ids across 3 `.in()` calls.
  - `countWork` returns 0 for an empty account.
- [ ] **Step 2: Verify they fail.** Run `npx vitest run src/lib/writingExport.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the three functions** in `src/lib/writingExport.js`.
- [ ] **Step 4: Verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Write `scripts/sql/test-download-access.sql`.** It proves the promise holds under real RLS. `begin;`, a throwaway account from `insert into auth.users` as in `test-sanctions.sql`, a story, thread, post and critique set to `mod_status = 'hidden'`, and `banned_until` set to 2099 on the profile. Acting as that member, assert each row reads back, then assert a different member can't read the hidden story. Ends with `select 'ALL PASS' as result;` and `rollback;`.
- [ ] **Step 6: Jeff runs it.** Use `run_in_terminal` in the worktree, and Jeff answers the production prompt: `$env:SUPABASE_PROJECT_ID = 'bmvvugrfnuedjlucmlbw'; npx supabase db query --remote -f scripts/sql/test-download-access.sql`. Expected: `ALL PASS`.
- [ ] **Step 7: Commit** with `feat(export): collect a member's writing`.

### Task 2: Turn writing into files

**Files:**
- Modify: `src/lib/writingExport.js`
- Test: `src/lib/writingExport.test.js`

**Interfaces:**
- Consumes: `Collected` from Task 1.
- Produces: `safeFileName(title: string | null, fallback: string): string`, with no extension.
- Produces: `buildExportFiles(collected, { handle: string, exportedAt: Date }): Array<{ path: string, text: string }>`.

**Layout:**

| Path | Contents |
|---|---|
| `README.txt` | Handle, export date, what each folder holds |
| `stories/<title>.md` | All their stories |
| `series.md` | Each series, its description, and its stories in `sort_order`. Omit if the member has no series |
| `ritual-entries/<title>.md` | Own posts with a `title` whose thread has a `prompt_id` |
| `ritual-drafts/<date>.md` | Drafts, with the prompt body quoted at the top when readable |
| `forum/<thread title>.md` | All other own posts, grouped by thread, oldest first. Own threads with no remaining posts still get a file with the title |
| `critiques/<story title>.md` | Own critiques, grouped by story, oldest first |

**Each file:** a `# Title` heading, a line with the date written, then the text. Add a status line under the heading: `> Removed from the site by moderation.` for `hidden`, `> Under review when you downloaded this.` for `screening`, nothing for `live`. Stories put the `lede` before `content`.

**Fallbacks:** `Untitled story`, `Untitled entry`, `A thread you can no longer see`, `A story you can no longer see`.

**`safeFileName` rules:** remove `< > : " / \ | ? *` and control characters, collapse whitespace, trim trailing dots and spaces, keep Unicode and emoji, cut to 80 characters, append `_` to Windows reserved names (`CON PRN AUX NUL COM1-9 LPT1-9`, any case), and return `fallback` if nothing's left. Paths are made unique per folder, ignoring case, as `Title.md` then `Title (2).md`.

- [ ] **Step 1: Write the failing tests:**
  - `safeFileName('Who/What?', 'x')` is `'Who What'`.
  - `safeFileName('CON', 'x')` is `'CON_'`, and `safeFileName('con', 'x')` is `'con_'`.
  - `safeFileName('...', 'x')` is `'x'`, and `safeFileName(null, 'x')` is `'x'`.
  - `safeFileName('a'.repeat(300), 'x')` has length 80.
  - `safeFileName('Nacht über Wien 🕯', 'x')` is unchanged.
  - Two stories titled `Dusk` give `stories/Dusk.md` and `stories/Dusk (2).md`.
  - A `hidden` story's file contains `Removed from the site by moderation.` and its full `content`.
  - A post whose thread is missing from `threadsById` lands in `forum/A thread you can no longer see.md`.
  - Two posts in one thread share one file, oldest first.
  - A titled post in a prompt thread goes to `ritual-entries/`; an untitled reply in the same thread goes to `forum/`.
  - A critique on a story missing from `storyTitlesById` lands in `critiques/A story you can no longer see.md`.
  - No `series.md` when there are no series.
  - `README.txt` always exists and contains the handle.
- [ ] **Step 2: Verify they fail.** Run `npx vitest run src/lib/writingExport.test.js`. Expected: new tests FAIL.
- [ ] **Step 3: Implement `safeFileName` and `buildExportFiles`** as pure functions.
- [ ] **Step 4: Verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(export): turn writing into plain files`.

### Task 3: The download button

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/lib/writingExport.js`
- Create: `src/components/DownloadMyWriting.jsx`
- Test: `src/components/DownloadMyWriting.test.jsx`
- Modify: `src/pages-react/Profile.jsx` (mount above `<KeptStories />`, line 186)
- Test: `tests/profile.spec.js`

**Interfaces:**
- Consumes: `collectMyWriting`, `countWork`, `buildExportFiles`.
- Produces: `saveTextFile(name: string, text: string): void` and `saveBlob(blob: Blob, name: string): void`, used again by Task 4.
- Produces: `downloadMyWriting({ userId, handle }): Promise<{ count: number }>`. It throws on any failure, and returns `{ count: 0 }` without saving when there's nothing to export.
- Produces: the page anchor `id="download-writing"`. The ban notice will link to it in the next plan.

**Zip:** `const { zipSync, strToU8 } = await import('fflate')`, loaded only on click. File name: `horrorwriter-writing-YYYY-MM-DD.zip`.

**Copy (Jeff reviews on the PR):**

| State | Text |
|---|---|
| Heading | `Your writing` |
| Description | `Everything you've written here, in one .zip of plain text files.` |
| Button | `Download my writing` |
| Busy | `Gathering your writing…` |
| Done | `Saved N pieces.` (`1 piece` when N is 1) |
| Empty | `You haven't written anything yet.` |
| Failed, with `role="alert"` | `The download didn't finish, so nothing was saved. Please try again.` |

- [ ] **Step 1: Install.** Run `npm install fflate`. Expected: `fflate` in `dependencies`, and `vite` still `^8`.
- [ ] **Step 2: Write the failing component tests,** mocking `../lib/writingExport`:
  - Clicking calls `downloadMyWriting` with the signed-in user's id and handle, then shows `Saved 3 pieces.`
  - A count of 1 shows `Saved 1 piece.`
  - A count of 0 shows the empty message.
  - A rejection shows the failure message in an alert, and the button works again.
  - The button is disabled while busy.
- [ ] **Step 3: Write the failing lib test:** with a collect that throws, `downloadMyWriting` rejects and `saveBlob` never runs.
- [ ] **Step 4: Verify they fail.** Run `npx vitest run src/components/DownloadMyWriting.test.jsx src/lib/writingExport.test.js`. Expected: new tests FAIL.
- [ ] **Step 5: Implement** the lib functions and the component, and mount it on the profile page.
- [ ] **Step 6: Verify they pass.** Same command. Expected: PASS.
- [ ] **Step 7: Add the E2E test** to `tests/profile.spec.js`: on `/profile`, click `Download my writing`, and `page.waitForEvent('download')` gives a name matching `/^horrorwriter-writing-\d{4}-\d{2}-\d{2}\.zip$/`. Add `jsonGet([])` routes in `tests/mocks.js` for any table it doesn't already mock (`ritual_drafts`). Jeff runs it in the final task.
- [ ] **Step 8: Commit** with `feat(profile): download my writing`.

### Task 4: Download kept work

**Files:**
- Modify: `src/lib/storyKeep.js`, `src/lib/ritualKeep.js`
- Modify: `src/components/KeptStories.jsx`, `src/components/KeptRitualEntries.jsx`
- Test: `src/lib/storyKeep.test.js`, `src/lib/ritualKeep.test.js`

**Interfaces:**
- Consumes: `saveTextFile`, `safeFileName` from `writingExport.js`.
- Produces: `openKeptStory({ vaultId, code, sealApi }): Promise<payload>`, the read and unseal half of `restoreKeptStory`, which now calls it.
- Produces: `openKeptEntry({ vaultId, code, sealApi }): Promise<payload>`, the same for `restoreKeptEntry`.
- Produces: `keptStoryFile(payload): { name, text }` from `payload.story` (`title`, `lede`, `content`), and `keptEntryFile(payload): { name, text }` from `payload.entry` (`title`, `content`). Both ignore `comments` and critiques, which are other people's words.

**UI:** each kept item gains a `Download` button beside `Restore`. It opens the same recovery-code form, with the same `wrong-code` and `corrupt-bundle` messages. On success it saves one `.md` file and shows `Saved.` The kept item stays in the vault.

- [ ] **Step 1: Write the failing tests:**
  - `openKeptStory` returns the unsealed payload and never calls `rpc`. This is what makes it work during a ban, when restore is refused.
  - `openKeptStory` rejects with `wrong-code` when `unsealWriting` does.
  - `restoreKeptStory` still calls `story_vault_restore`.
  - `keptStoryFile` contains the story's text and none of the `comments` content.
  - The same four for the Ritual functions.
- [ ] **Step 2: Verify they fail.** Run `npx vitest run src/lib/storyKeep.test.js src/lib/ritualKeep.test.js`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the lib functions and the two component changes.
- [ ] **Step 4: Verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(vault): download kept work without restoring it`.

### Task 5: Open the PR

**Files:** none.

- [ ] **Step 1: Push and open the PR** to `main`. Its body gives Jeff the copy to review, these commands, and the live check below.

```powershell
npm run test:unit
cmd /c npx playwright test tests/profile.spec.js
npm run build
```

Expected: all tests pass and the build finishes without errors.

- [ ] **Step 2: Live check for Jeff, after deploy:** on `/profile`, click `Download my writing`, open the zip, and confirm your stories and posts are there and readable. If you have a kept story, use its `Download` with the recovery code.
