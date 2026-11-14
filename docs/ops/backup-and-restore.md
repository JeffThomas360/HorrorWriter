# Backup and restore

The Supabase Free plan keeps no backups. The nightly Backup workflow in the private repo
[JeffThomas360/horrorwriter-backups](https://github.com/JeffThomas360/horrorwriter-backups) is the
only copy of members' writing outside the live database. It dumps the database, encrypts it, and
keeps the file as that run's artifact for 30 days. It costs nothing: a private repo gets 500 MB of
artifact storage, and a nightly backup is well under 1 MB (public data was 2.5 MB on 2026-11-13).

Run it by hand: horrorwriter-backups → Actions → Backup → Run workflow.

## What is and is not backed up
- **Backed up:** roles, schema and all table data, including sign-in accounts (`auth`) and the
  storage object index.
- **Not backed up:** the files in Supabase Storage (avatars), Edge Function secrets, Vault
  secrets, and the project's dashboard settings (auth providers, redirect URLs).

## One-time setup
1. Supabase → Connect → **Session pooler** connection string (port 5432), with the database
   password in place of `[YOUR-PASSWORD]`. The direct `db.<ref>.supabase.co` host is IPv6-only and
   GitHub's runners cannot reach it.
2. Pick a long passphrase and store it in your password manager. **Without it the backups cannot
   be read.**
3. Add both as secrets on the backups repo. Pasting into gh's hidden "Paste your secret" prompt
   doesn't always register in an embedded terminal, so copy each value, then run the matching
   line; it reads the clipboard, and the value never appears on screen or in history:
   ```powershell
   gh secret set SUPABASE_DB_URL -R JeffThomas360/horrorwriter-backups --body (Get-Clipboard)
   gh secret set BACKUP_PASSPHRASE -R JeffThomas360/horrorwriter-backups --body (Get-Clipboard)
   ```
   Look for `✓ Set Actions secret …`. The URL looks like
   `postgresql://postgres.<project-ref>:<password>@aws-…pooler.supabase.com:5432/postgres`.
   Or add them on GitHub: horrorwriter-backups → Settings → Secrets and variables → Actions →
   New repository secret.
4. Run the workflow by hand once. Look for a green run with one artifact,
   `horrorwriter-<date>`, under Artifacts on the run's page.

GitHub emails you when a scheduled run fails. A backup that fails silently for a week is the
failure to watch for: check the backups repo's Actions tab when that email arrives.

## Copies on this PC and in Google Drive
GitHub keeps each backup 30 days. `scripts/ops/pull-backups.ps1` copies every backup GitHub still
holds to `D:\Backups\horrorwriter` and to `My Drive\horrorwriter-backups` in Google Drive, and
keeps them all (each is well under 1 MB). It only adds what is missing, so the PC does not need to
be on at night: any run catches up on the last 30 days. Files stay encrypted; Google only holds
locked files.

Set up once, from the repo folder:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\ops\install-backup-pull.ps1
```
That copies the script into `D:\Backups\horrorwriter` (so it keeps working whichever branch the
checkout is on), registers the scheduled task "HorrorWriter backup pull" (at sign-in and every 4
hours) and runs it once. Look in `D:\Backups\horrorwriter\pull-backups.log` for `local: N backups` and
`drive: … copied`. "Google Drive not found" means Google Drive for desktop isn't running or signed
in; the local copy is still made. "WARNING: newest backup is N days old" means the nightly run is
failing.

## Restore drill (do this once now, then after any big schema change)
Restore into the **local** stack, never straight into production.

```powershell
# 1. Download the newest artifact: horrorwriter-backups → Actions → newest green Backup run →
#    Artifacts → horrorwriter-<stamp>. It arrives as a .zip holding horrorwriter-<stamp>.tar.gz.gpg.
# 2. Unzip, then decrypt and unpack (Git Bash or WSL):
gpg --decrypt horrorwriter-<stamp>.tar.gz.gpg | tar -xzf -
# 3. Start an empty local database:
npx supabase start
npx supabase db reset --no-seed
# 4. Load data only (the local stack already has the schema from the migrations):
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" --single-transaction `
  --variable ON_ERROR_STOP=1 --command "SET session_replication_role = replica" --file dump/data.sql
```

Look for: no error, and in Studio (http://localhost:54323) the `profiles`, `books` and forum tables
hold the same row counts as production.

## Restoring production
Only after a restore drill has worked on the same dump.
1. Put the site in maintenance if it is still up, so nobody writes during the restore.
2. If the project still exists and the schema is intact, restore `data.sql` into it with the
   `psql` command above, using the session pooler URL.
3. If the project is gone, create a new project, then load `roles.sql`, `schema.sql` and
   `data.sql` in that order in one `psql` call, re-enter Edge Function and Vault secrets, redeploy
   the functions, and update `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Workers Builds.
