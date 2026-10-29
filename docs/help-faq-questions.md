# Help page FAQ: questions and facts

Working file for Jeff. Claude drafted the **questions** and the **Facts** notes; the answers are yours.

How to answer one: open its file in `src/content/help/` (named in the heading below), write the answer under the
second `---` in plain markdown, and change `draft: true` to `draft: false`. An entry with an empty body is never
shown, in dev or in production, so you can answer them in any order. `npm run dev` shows entries that still have
`draft: true` but already have a body; production shows only `draft: false`. Change a question by editing its
`question:` line. `order:` sets the position inside its topic.

Facts were checked against the code on branch `design/member-tickets` on 2026-10-28. "Unverified" means the
repository can't confirm it; check it on the live site before you rely on it. Wording quoted in "quotes" is
copied from the code.

## Things to know before answering

1. **No control for deleting one published story.** The database lets an author delete their own story
   (`"Users can delete own books."`, `supabase/migrations/00000000000000_baseline.sql` line 522) and `/rules/`
   says "Delete a post, thread, or story and it's actually gone" (`src/pages/rules.astro` line 101), but no
   button calls it. Searching `src/` for `.delete()` finds only series, kept ritual entries, ritual posts, passkeys, follows,
   blocks and filter rules. The story page offers "Edit Story" and "Report" only. This affects
   `edit-or-delete-a-story.md`.
2. **Someone who can't sign in can't open a ticket.** Tickets need a signed-in account, and by your decision
   a ticket never gives anyone access to an account. "I can't sign in at all" and "I lost access to my email"
   therefore have to be answered here, in the FAQ.
3. **The sign-in wording is about to change.** On this branch the modal still says "No Google or passkey? Email
   me a sign-in link" and still has the "No account uses that email" branch. The planned "Can't sign in?" rework
   (design spec, "Can't sign in?") relabels the link. Re-read `src/components/SignInModal.jsx` before you write the
   sign-in answers.
4. **Is Google sign-in on?** The button shows only when `VITE_ENABLE_GOOGLE_LOGIN === 'true'` at build time
   (`SignInModal.jsx` line 55). `wrangler.toml` and `.env.local` say `true`; the untracked local `.env.production`
   says `false`. Which value the live build uses is **unverified**. Open the live sign-in modal and see.

---

## Signing in

### How do I sign in?
File: `how-do-i-sign-in.md`

**Facts**
- The header's **Sign In** button (`src/components/UserMenu.jsx`) opens the modal "Summon Yourself", which says
  "No password needed." There are no passwords on the site.
- Three ways in (`src/components/SignInModal.jsx`): **Continue with Google** (see note 4 above),
  **Sign in with passkey**, and a small link, "No Google or passkey? Email me a sign-in link", which reveals an
  email box and the button "Email me a sign-in link". After sending: "Link sent. Check your inbox (and spam) and
  click it to sign in." The link lands on `/auth/callback`.
- New accounts: "New here? Create an account" asks for a birth month and year first. The minimum age is 13
  (`MIN_AGE`, `src/lib/ageGate.js`). The modal says "We use this once, to check you are old enough. It is not
  stored." Only a pass/fail verdict is kept in the browser's local storage (`hw_age_gate`). A failed check is
  remembered in that browser.
- Disposable email domains are refused: "Temporary or disposable email addresses are not allowed."
  (`DISPOSABLE_DOMAINS` in `SignInModal.jsx`).
- Signing in to an existing account needs no age check; only paths that can create an account are gated
  (comment at the top of `src/lib/ageGate.js`).

### What's a passkey?
File: `what-is-a-passkey.md`

**Facts**
- A member adds one on **Profile**, in the "Fast sign-in" section, with "＋ Add a passkey"
  (`src/pages-react/Profile.jsx`, `registerPasskey()` in `src/lib/passkey.js`; Edge Functions
  `webauthn-register-begin` and `webauthn-register-complete`).
- Passkeys are discoverable (`residentKey: 'required'`, `supabase/functions/webauthn-register-begin/index.ts`), so
  signing in needs no email: "Sign in with passkey" asks the browser or password manager for the passkeys saved
  for horrorwriter.org. User verification is `preferred`; attestation is `none`.
- The site does not choose where a passkey is stored. It sends no `authenticatorAttachment`, so the browser shows
  its own picker: this device, a phone, a security key or a password manager. The Profile page says: "this device
  (Windows Hello, Touch ID), your phone, a security key, or a password manager like Bitwarden or 1Password."
- Profile labels each passkey from what the browser reported: "Synced passkey" (cross-platform), "Device-bound
  passkey" (platform) or "Passkey" (unknown), with the date added and last used, and a "✕ Remove" button
  ("Remove this passkey? You can always add a new one.").
- The same passkey can't be added twice: "This passkey is already registered on your account."
- Passkeys are tied to the domain: "Passkeys only work on horrorwriter.org. Use Google or the email link here."
  (relying-party ID `horrorwriter.org`, `supabase/functions/_shared/webauthnOrigin.ts`).

### I got a new phone or computer. How do I get back in?
File: `new-phone-or-computer.md`

**Facts**
- Whether a passkey follows the member to a new device depends on where it was saved. That is decided by the
  browser or password manager, not by the site, and the site can't see it beyond the Profile labels above.
  Which providers sync is general platform behaviour and is **unverified** here.
- Two ways in that don't depend on a passkey: the email sign-in link (sent to the address on the account) and
  Google (if the account's email matches). Both are in `SignInModal.jsx`.
- After signing in, **Profile > Add a passkey** registers the new device. Old passkeys can be removed there.
- There is no way in the code to change an account's email address (no `updateUser` call anywhere in `src/`).

### My passkey isn't offered when I sign in
File: `passkey-not-offered.md`

**Facts**
- In-repo guidance (Profile page, "Using a password manager?" panel): install and unlock the manager's
  extension and turn on "Ask to save and use passkeys"; in Chrome or Edge open `chrome://settings/passkeys`
  (`edge://settings/passkeys`) and enable the manager as provider; in Firefox allow the extension to run on all
  sites under `about:addons`; then use Add a passkey and choose the manager.
- Cause that actually bit you on 2026-06-10, from your notes (not in the repo): horrorwriter.org was in Bitwarden's
  **Excluded domains** (Firefox). That blocks the manager with no error, and the site can't detect or fix it.
- The passkey must have been added to this account first (Profile lists them), and it works only on
  horrorwriter.org.
- If it still isn't offered, Google (note 4) or the email link get the member in, and a passkey can be added again
  from Profile.
- The registration request waits 60 seconds so a password-manager extension that is waking up isn't skipped
  (comment in `webauthn-register-begin/index.ts`).

### I can't sign in at all
File: `cant-sign-in-at-all.md`

**Facts**
- Everything the member can try is above: Google, passkey, or the email link to the account's email. The link is
  a one-time sign-in; spam folders are mentioned in the modal's own message.
- On this branch, asking for a link for an address that has no account shows "No account uses that email." with
  "New here? Create an account" (it only does this in a browser that hasn't passed the age check). The planned
  rework removes that message (note 3).
- A suspended member who opens a ticket is told "Your account is suspended. Use the appeal on your profile
  instead." (`src/lib/tickets.js`, `banned`). The only appeal control in the client is the "Appeal this" button
  on the author's own hidden story (`src/components/AppealButton.jsx`, used in `ReadStory.jsx` line 262); none was found
  on Profile, so that sentence doesn't match the UI. Whether a suspended member can sign in at all is **unverified**.
- A ticket can't be opened by someone who isn't signed in (note 2).

### I lost access to my email
File: `lost-email-access.md`

**Facts**
- Your decision in the design spec: nobody is locked out unless they've lost their email, and there is no
  recovery for a lost email. A ticket or a message never gets anyone into an account.
- Google and passkey sign-in don't use the account's email at sign-in time, so a member who has either set up
  can still get in.
- There is no email-change feature in the code (no `updateUser`). Sealing writing needs a **confirmed** email
  (`supabase/functions/delete-account/index.ts` line 73).
- No public contact address for account problems exists in the site. The only address on the site is
  `abuse@horrorwriter.org`, listed for DMCA takedown notices (`src/pages/rules.astro`).

---

## My writing

### How do I publish a story?
File: `publish-a-story.md`

**Facts**
- Signed in, go to `/library/publish/` (`src/pages-react/PublishStory.jsx`; it is wrapped in `RequireAuth`, which
  opens the sign-in modal if needed).
- Required: Story Title, "Lede / Back-Cover Hook", and the Story Manuscript. Length: **50 to 10,000 words**
  (`validateStoryContent`, `src/lib/storyValidation.js`; the counter turns red outside that range).
- Optional on the form: a feedback focus ("What feedback do you want from other writers?": First 250 Words / Hook,
  Atmosphere & Dread, Pacing & Plot Twist, Proofreading & Polish, Read Only / General Feedback), a cover
  (VHS sleeve) and "Part of a series?". The manuscript uses the Markdown editor and a **Dictate** button.
- The form saves a copy in the browser every 1.5 seconds and offers "Restore Draft" if the page is closed
  (`src/lib/draftAutosave.js`). That draft is local to that browser, not on the account.
- The button reads "Publish Story to Archives". The member lands on `/library/read/<id>/`.
- Limit: **3 stories per hour** per account (`enforce_rate_limit`, `supabase/migrations/20260819010000_report_pileup_hardening.sql`).
- After saving, the new story is sent to the `moderate-content` function for automatic screening
  (`src/lib/screenContent.js`); what it screens for is in `supabase/functions/_shared/screening.ts`.
- The author keeps the copyright; the site takes only a display licence (house rule 1 on `/rules/`).

### How do I edit or delete my story?
File: `edit-or-delete-a-story.md`

**Facts**
- **Edit:** on the story's page the author sees "Edit Story" (`ReadStory.jsx` line 252), which opens
  `/library/edit/<id>/` (same form, button "Save Revisions"). `/my-stories/` (linked from Profile) lists each story
  with an Edit link. Saving raises the story's version number by one and runs the screening again.
- **Delete:** see note 1 at the top. No delete control for a single story was found. Series can be deleted from
  `/my-stories/` ("Delete Series": the stories stay, they just leave the series).
- What `/rules/` promises about deletion is quoted in note 1.

### What happens to my writing if I delete my account?
File: `delete-my-account.md`

**Facts**
- Where: **Profile > Delete my account** (`src/components/DeleteAccount.jsx`). It needs a fresh sign-in (within
  10 minutes) and shows two choices side by side:
  - **Erase everything**: stories and series deleted for good, "No, not by anyone" can get them back. Type DELETE
    to confirm.
  - **Seal my writing**: stories and series are encrypted in the member's browser with a recovery code, then
    removed from the site. Sign up again with the **same email** and enter the code to get them back (the prompt
    appears at the top of Profile, `SealedWritingPrompt.jsx`: "Enter the recovery code you saved when you left.").
- In both cases critiques and forum replies are deleted; so are the profile, avatar, follows and sign-in
  (`ROWS` in `DeleteAccount.jsx`). On `/rules/` other members' critiques and replies on the member's work stay, credited to "a
  departed member."
- Recovery code: six words and four characters, for example `PALE-HOUND-ASHES-TALLOW-EMBER-MIRE-7Q4K`
  (`generateRecoveryCode` in `src/lib/seal.js`). It is made in the browser and never sent. The sealing step makes
  the member copy, download or print it and type its last 4 characters. "Without this code your writing can never
  be recovered. Not by us, not by anyone."
- Sealing needs a **confirmed** email, so the seal can be found again. Seals are kept at most **7 years**, then a daily
  job deletes them (`supabase/migrations/20260927000000_account_deletion.sql`).
- If a seal is already waiting from an earlier departure, a new seal is refused until it is unsealed.
- A Midnight Ritual entry kept in the vault is deleted with the account (`/rules/`, "Keeping a Ritual Entry").

---

## Rituals

### What is a Midnight Ritual?
File: `what-is-a-midnight-ritual.md`

**Facts**
- A writing prompt box on the home page (`src/components/MidnightRitual.jsx`). The newest five released prompts
  are open at once, shown as channels CH 13.0 to CH 13.4 ("Current Transmission", then "Signal 2 (Week 2 of 5)"
  and so on); `fetchActivePrompts(limit = 5)` in `src/lib/ritualDraft.js`.
- A new prompt unlocks every **Friday at 03:00 New York time** (`ritual_slot_after`,
  `supabase/migrations/20260930000000_midnight_ritual.sql`).
- Writing and saving a draft: a draft is kept in the browser per channel; signed-in members can save it to their
  account, where only they see it. Publishing posts the response into The Crypt's Rituals category for critique,
  under the prompt's thread (`ritual_publish_entry`).
- Publishing needs a signed-in account and a prompt that has gone live.
- Home-page FAQ text already says it is "released once a week" and "Write up to 2,000 words right on the home page"
  (`src/pages/index.astro`).

### Why 100 words minimum and 2,000 maximum?
File: `ritual-word-limits.md`

**Facts**
- Publishing needs **100 to 2,000 words**: `MIN_WORDS = 100`, `WORD_LIMIT = 2000` in `src/lib/ritualDraft.js`,
  enforced in the database by `ritual_publish_entry` (`supabase/migrations/20261023000000_ritual_min_words.sql`;
  at most 16,000 characters too). Saving a draft has no minimum, only the 2,000 cap.
- Words are counted as the database counts them (`ritual_word_count`): runs of non-space characters, but the
  Markdown marks the editor adds itself (a scene-break line of `---` or `***`, the `>` of a quote) don't count.
- The cap was 500 words before 2026-10-18 (`20261018010000_ritual_word_limit_2000.sql`); the minimum was added
  2026-10-23. The reasons for these numbers are yours; the code only says "Publishing needs a real piece; saving a
  draft doesn't."
- The same 100 to 2,000 range applies when a writer edits a published entry (`20261023010000_ritual_entry_edit_delete.sql`).

### A mentor sent my entry back. What do I do?
File: `mentor-sent-my-entry-back.md`

**Facts**
- A moderator can choose "Mentor: send for revision" on a published entry and write a first note
  (`src/components/RitualRevisionPanel.jsx`; `supabase/migrations/20261023020000_ritual_mentoring.sql`). The entry
  is hidden from readers (they see a placeholder with the author's name) and the author is notified through the
  normal hidden-content notification.
- The author opens the response in The Crypt and sees the panel "Under revision with a mentor": a private
  conversation between the author and the mentors (each message up to 4,000 characters). Each new message
  notifies the other side: "New message about a response under revision".
- The author may edit the entry while it is under revision (100 to 2,000 words still apply), then press
  "I've made my changes: ready for review". The mentor is notified ("A response is ready for review") and shows it
  again with "Show this response again".
- The Appeal button exists only on a hidden story page (`ReadStory.jsx`), not on forum posts, so an entry under
  revision has no Appeal button; the private conversation is the route.

### What does "Keep it" do?
File: `what-does-keep-it-do.md`

**Facts**
- When a writer deletes their own Ritual entry, the dialog offers **Delete forever**, **Keep it** or Cancel
  (`src/components/RitualEntryActions.jsx`). Delete forever can't be undone, and its critiques go with it.
- **Keep it** takes the entry, its critiques and any private mentor conversation out of the thread and locks them
  with a recovery code that only the writer has (`src/components/KeepRitualEntry.jsx`,
  `src/lib/ritualKeep.js`). The code is made and used in the browser; "Nobody can open them without it, including us."
  "Lose this code and the piece is gone for good. We can't reset it."
- The writer must copy or download the code and tick "I've saved my recovery code" before the button works.
- Recovery code format: six words plus four characters (same generator as account sealing, `src/lib/seal.js`).
- A writer can keep up to **50** entries (error "Your vault is full (50 entries)…", `ritualKeep.js`).
- Critiques removed by moderation are not kept (`/rules/`, "Keeping a Ritual Entry").
- Deleting the account deletes the vault too.

### How do I restore a kept entry?
File: `restore-a-kept-entry.md`

**Facts**
- Kept entries are listed on **Profile** (`/profile/#kept-entries`, `src/components/KeptRitualEntries.jsx`).
  Each has **Restore** (asks for the recovery code) and a delete option.
- Wrong code: "That code doesn't open this entry." A damaged bundle says to contact the keeper without deleting it.
- A restored entry returns to its place in its thread, with its critiques, marked "Brought back from the dead."
  Critiques whose writers have left the site are left out, and the page says how many.
- A restored entry is checked again before anyone can read it (`/rules/`). If it was under revision with a mentor
  it comes back under revision.
- A member who is suspended can restore only after the suspension ends: "You can restore this once your
  suspension ends. It stays safe in your vault until then."
- If the prompt the entry answered no longer exists, it can't be restored.

---

## Another member

### How do I report a post or a person?
File: `report-a-post-or-person.md`

**Facts**
- A **Report** button appears on a story (`ReadStory.jsx`), on each critique, on a thread and its posts
  (`src/pages-react/ThreadView.jsx`) and on a member's profile (`src/pages-react/UserProfile.jsx`). Reporting needs a
  signed-in account ("You must be signed in to submit a report.").
- The form (`src/components/ReportModal.jsx`) asks for a category: Harassment / Hate Speech, Spam / Bots, Urgent /
  Real-world Harm, Other Violation. "Additional Details" is optional.
- Limit: **5 reports per 15 minutes** per member (`20260819010000_report_pileup_hardening.sql`).
- An Urgent report also sends the keeper an email (`urgent-report-email`); it really sends only if
  `RESEND_API_KEY` is configured, otherwise it logs a stub (`supabase/functions/urgent-report-email/index.ts`).
  Whether that key is set in production is **unverified**.

### How do I block someone?
File: `block-someone.md`

**Facts**
- A **Block** button sits on a story page (next to Report) and on a member's profile (`BlockButton.jsx`,
  `ReadStory.jsx` line 259, `UserProfile.jsx` line 126). The same button reads **Unblock** afterwards. None was
  found on forum posts (`ThreadView.jsx` has no `BlockButton`).
- The toast says: "Blocked @handle. Their content is now hidden from you."
- Effect: the blocker no longer sees that member's stories, threads, posts or critiques
  (`content_visible`, `supabase/migrations/20260819000000_user_blocks.sql`, kept in
  `20260822000000_enforce_sanctions.sql`). A blocked member also can't critique or reply to the blocker's content
  (`20260819001000_fix_block_insert_rls.sql`).
- The blocked member isn't told, and can't see that they are blocked (comment in `20260819000000_user_blocks.sql`).
- There is no list of blocked members anywhere in the site; to unblock, go to that member's profile
  (`/u/<handle>/`) and press Unblock.

### What happens after I report something?
File: `what-happens-after-i-report.md`

**Facts**
- The report goes to the Moderation > Reports tab. A moderator marks it **actioned** or **dismissed**, with an
  optional note (`resolve_report`, `src/lib/modActions.js`).
- The reporter gets a notification titled "Report Reviewed": "Your report was reviewed and action has been taken.
  Thank you for keeping the community safe." or "Your report was reviewed but no action was deemed necessary at
  this time." (`supabase/migrations/20260610020000_mod_phase2_reports.sql`).
- **My reports** (`/my-reports/`, linked from Profile) lists every report the member made with its status
  (OPEN / ACTIONED / DISMISSED) and the moderator's note.
- A story, critique, thread or post reported by **5 different members** is hidden automatically ("Auto-hidden:
  reached report threshold (5)") and its author is notified (`handle_new_report`, same file; the 5 is at
  `20260819010000_report_pileup_hardening.sql` line 89). Reports against a person don't hide anything on their own.
- Moderation actions are listed publicly on `/transparency/`.

---

## Something's broken

### Dictate isn't hearing me
File: `dictate-cant-hear-me.md`

**Facts**
- **Dictate** is the button on the Publish a story form and on a new thread (`src/components/TranscribeButton.jsx`,
  `TranscribeModal.jsx`). It needs a signed-in account ("Please sign in to use Dictate.").
- It asks the browser for the microphone with `getUserMedia({ audio: true })`. If that fails the message is:
  "Microphone access was denied. Allow it in your browser settings."
- The site allows its own microphone use: `public/_headers` has
  `Permissions-Policy: geolocation=(), camera=(), microphone=(self)`. With `microphone=()` the button would fail
  silently. This header is only in effect on the deployed site, not under `npm run dev`.
- The browser's own per-site permission can still be "Block". The site can't change that. Per-browser steps for
  unblocking are **unverified** (not in the repo).
- Limits: a recording stops by itself after **10 minutes**, the modal hint says "Speak clearly in a quiet room. Up
  to ~4 min.", and a clip or uploaded file (.mp3, .wav, .m4a, .ogg) must be under **4 MB** (client and worker:
  `workers/transcribe/src/index.js`).
- If `VITE_TRANSCRIBE_URL` isn't set: "Transcription service is not configured."

---

## Other

### What do the house rules say?
File: `house-rules.md`

**Facts**
- `/rules/` is "The Codex", with sections: House Rules (`#house-rules`: 1 Absolute Creator Ownership, 2 Thirteen
  and Over, 3 Hidden Circle), The Critique Code (`#critique-code`: "Critique the art, respect the author."),
  Content Warnings (`#content-warnings`), Legal (`#liability-dmca`: including "Your Content, Your Call",
  "Keeping a Ritual Entry" and "Leaving Horror Writer") and Privacy (`#privacy`). Source: `src/pages/rules.astro`.
- Your answer can link to the page rather than repeat it; the footer links each section.
