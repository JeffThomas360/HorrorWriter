# Account deletion: Erase everything, or Seal my writing

Status: approved by Jeff, 2026-09-26 · Author: Claude (with Jeff)

## Why

There is no way for a member to delete their account today. Jeff wants one, with a real choice:

- **Erase everything.** Gone for good, as the House Rules already promise for any deletion.
- **Seal my writing.** The member's stories and series leave the site, locked with a recovery
  code only the member holds, kept for up to seven years, and restored if they come back with the
  same verified email.

Jeff's hard requirement for sealing: **nobody, including Jeff, can unlock a member's sealed
writing without the member's recovery code.**

## Behaviour

### Where

A **Delete my account** section at the bottom of `/profile/`.

### Step 1: the choice

Both options are explained side by side in plain words:

| | Erase everything | Seal my writing |
|---|---|---|
| Stories and series | Deleted for good | Encrypted in your browser, then removed from the site |
| Can you get them back? | No, not by anyone | Yes: sign up again with the same email and enter your recovery code |
| Can the keeper read them? | No, they're gone | No, only your code opens them |
| Your critiques and forum replies | Deleted | Deleted (conversations aren't sealed) |
| Profile, avatar, follows, sign-in | Deleted | Deleted |

### Step 2: confirm twice

- **Seal:** show the recovery code with Copy, Download (.txt) and Print buttons. The member types
  the code's last word back before anything is sealed.
- **Both:** type `DELETE` to finish.

### What gets included

- **Everything the member wrote** is covered by their choice, **including content under an open
  report**. When sealed, a reported item's text travels in the sealed bundle; if the member
  returns and recovers, it comes back, and the report can be reopened against it.
- **Content removed by moderation (`mod_status = 'hidden'`) is never sealed.** It is erased
  outright, whichever option the member picks. The site must not keep material that nobody can
  inspect. Content awaiting review (`mod_status = 'screening'`) follows the member's choice, like
  reported content.

### What other members see ("detach, don't destroy")

- A departed member's story or thread becomes a **tombstone**: title and text erased, shown as
  *"Removed by its author."* Other members' critiques and replies stay beneath it, untouched.
- Wherever the departed member's name appeared, it reads **"a departed member"**.

### Retention

A sealed bundle is kept for **at most 7 years** from sealing, then deleted automatically.
Bundles are compressed before encryption.

### Recovery

- When someone signs in and a sealed bundle matches their **verified** email, their profile shows
  *"Sealed writing is waiting for you."*
- They enter the recovery code. Their browser downloads the bundle, decrypts it, and restores
  **everything, live, immediately**, to the new account, with no review step (Jeff's call).
- The bundle is then deleted. A wrong code simply fails to decrypt.

### House Rules (`/rules/`, "Your Content, Your Call")

Add, as approved by Jeff:

> **Leaving the coven.** When you delete your account you choose: **Erase everything**, and your
> stories, series, critiques and posts are gone for good; or **Seal my writing**, and your stories
> and series are locked with a recovery code only you hold, kept for up to seven years, and
> restored if you return with the same email. Nobody can open a seal without your code, including
> us. Other members' critiques and replies on your work stay, credited to "a departed member."

And edit the existing exceptions sentence, which currently says content under an open report is
kept while under review. That is no longer true: reported content follows the member's choice.
Content removed by moderation, and anything the law requires us to preserve, remain exceptions.

## Design

### Database (one migration)

1. **Detach, don't cascade.** `books.author_id`, `threads.author_id`, `book_comments.author_id` and
   `posts.author_id` become nullable, and their foreign keys to `profiles` change from
   `ON DELETE CASCADE` to `ON DELETE SET NULL`. `series.author_id` stays `CASCADE` (a series is the
   member's own and holds no one else's words; `series_books` rows go with it).
2. **Tombstones.** New column `removed_by_author boolean not null default false` on `books` and
   `threads`. A tombstone has its author-written fields blanked (`books.title`, `lede`, `content`;
   `threads.title` and the opening post's `content`), `author_id = null`,
   `removed_by_author = true`. RLS and the UI render tombstones as "Removed by its author."
3. **`sealed_bundles`:**
   - `email_key text primary key`: `HMAC-SHA256(server_secret, lower(trim(email)))`, hex. The bare
     address is never stored. The secret lives in Supabase Vault.
   - `bundle bytea not null`: the encrypted, compressed payload (format below).
   - `sealed_at timestamptz not null default now()`
   - `expires_at timestamptz not null default now() + interval '7 years'`
   - RLS on, **no policies**: no client role can select, insert, update or delete. Access is only
     through the `delete-account` and `sealed-writing` Edge Functions (service role).
4. **Expiry.** A daily `pg_cron` job deletes rows where `expires_at < now()`. `pg_cron` is not
   installed yet; the migration enables it (available on the free plan).
5. **Grants.** Every new function gets explicit grants, per the CLAUDE.md trap, and
   `scripts/sql/verify-grants.sql` must still return zero rows.

### Sealing, in the member's browser (`src/lib/seal.js`)

- **Recovery code:** 6 words drawn uniformly from the **EFF large wordlist** (7,776 words,
  CC-BY 3.0; attribution in the House Rules footer) plus a 4-character suffix from a 32-symbol
  alphabet. About 77.5 + 20 = **~97 bits** of entropy, drawn with `crypto.getRandomValues`.
  Format: `WORD-WORD-WORD-WORD-WORD-WORD-XXXX`.
- **Key derivation:** PBKDF2-SHA256, 600,000 iterations, 16-byte random salt, producing a 256-bit key.
  Web Crypto only; no new dependency.
- **Payload:** JSON of the member's stories (title, lede, content, cover, badge, mod_status,
  created_at, updated_at, version) and series (title, description, ordering). **Excluded:**
  stories with `mod_status = 'hidden'`.
- **Compression:** `CompressionStream('gzip')` before encryption.
- **Encryption:** AES-256-GCM, 12-byte random IV. The bundle is
  `version(1 byte) ‖ salt(16) ‖ iv(12) ‖ ciphertext+tag`.
- The recovery code **never leaves the browser**: not sent, not logged, not stored. Only the
  bundle is uploaded.

### Deletion (`supabase/functions/delete-account`)

`POST` with the member's session token (verified with `auth.getUser()`), body
`{ mode: 'erase' | 'seal', bundle?: base64 }`. It then:

1. Rejects if the sign-in is older than 10 minutes (a fresh sign-in is the "confirm it's really
   you" step), or if `mode = 'seal'` without a bundle.
2. Calls one `SECURITY DEFINER` database function, `delete_member(p_user uuid, p_email_key text,
   p_bundle bytea)`, callable only by `service_role`, which in **one transaction**:
   - stores the bundle when sealing (upsert on `email_key`)
   - hard-deletes the member's `hidden` (moderation-removed) stories, threads, critiques and posts
   - turns the member's stories and threads into tombstones
   - deletes the member's critiques and forum posts that are not opening posts of their own
     threads
   - deletes the profile (series, follows, blocks, notifications, `mod_notes` about them cascade;
     the `SET NULL` foreign keys detach everything else)
3. Deletes the member's avatar from storage (`avatars/<user_id>/`).
4. Deletes the auth user (`auth.admin.deleteUser`).

If step 2 fails, nothing has changed. If step 3 or 4 fails after step 2, the function reports
it, and a retry is safe (both steps are idempotent).

### Recovery (`supabase/functions/sealed-writing`)

- `GET`: with a valid session **and a confirmed email**, computes `email_key` from the session's
  email and returns `{ waiting: true, bundle }` or `{ waiting: false }`.
- The browser derives the key from the code the member types, decrypts, decompresses, and
  re-inserts the stories and series through the normal authenticated client (RLS applies; the
  new account is the author). Everything is restored live, with the original `mod_status`.
- `DELETE`: removes the bundle once restoration succeeded.

### Who can unlock a seal

- **Nobody without the recovery code.** The server stores only the encrypted bundle; the code
  and the key derived from it exist only in the member's browser, only for the moment of sealing
  or recovery.
- **Not the keeper, not the site operator, not someone with a full database copy.** With ~97
  bits of entropy and 600,000 PBKDF2 rounds, guessing is infeasible.
- **One honest limit of any in-browser encryption:** it trusts the page the browser runs *at the
  moment of sealing or recovery*. Whoever controls the site's code could, in principle, ship a
  version that captures codes typed in the future. It can never reach back and open seals made
  before that. Mitigations: the sealing code lives in one small, reviewed module (`seal.js`), and
  any change to it is called out in its PR.
- The email lookup only **finds** a bundle; it cannot **open** one. Whoever can pass the email
  check (including the operator, who controls sign-in) gets ciphertext and nothing more.

### Error handling

- Sealing fails (browser lacks `CompressionStream`, etc.): nothing is deleted; the member is told
  and can choose Erase or try another browser.
- Upload or deletion fails: nothing is deleted; show the error; safe to retry.
- Wrong recovery code: "That code doesn't open this seal." Unlimited retries are harmless (the
  work happens in the member's own browser).
- Corrupted or tampered bundle: GCM authentication fails, so the same message is shown and nothing is
  restored.

## Testing

- `seal.js` unit tests (Vitest): code format and entropy source, seal→unseal round trip, wrong
  code fails, tampered byte fails, moderation-removed items excluded, compression applied.
- The migration is rehearsed against production inside `begin … rollback`, checking: tombstoning
  keeps others' critiques and replies, `verify-grants.sql` returns zero rows, and no client role
  can read `sealed_bundles`.
- Edge Functions: stale session rejected; seal without bundle rejected; delete then recover round
  trip against a test account.
- E2E (Playwright, mocked): the delete flow's two confirmations, and the recovery prompt.

## Delivery: three PRs

1. **Database + Erase.** Migration (detach, tombstones, `sealed_bundles`, expiry job,
   `delete_member`), `delete-account` Edge Function (erase path), the Profile "Delete my account"
   UI with Erase only, and tombstone rendering.
2. **Seal.** `seal.js`, EFF wordlist, recovery-code screen, seal path in `delete-account`.
3. **Recover + House Rules.** `sealed-writing` Edge Function, recovery prompt and restore flow,
   `/rules` wording.

## Out of scope

- Deleting a single story or thread: unchanged, still a real hard delete.
- Account deactivation or pause: not requested.
- Moderator-initiated account removal: unchanged (bans).
