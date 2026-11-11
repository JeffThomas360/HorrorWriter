# Backup and restore

The Supabase Free plan keeps no backups. `.github/workflows/backup.yml` is the only copy of
members' writing outside the live database. It runs nightly and can be run by hand
(Actions → Backup → Run workflow).

## What is and is not backed up
- **Backed up:** roles, schema and all table data, including sign-in accounts (`auth`) and the
  storage object index.
- **Not backed up:** the files in Supabase Storage (avatars), Edge Function secrets, Vault
  secrets, and the project's dashboard settings (auth providers, redirect URLs).

## One-time setup
1. Cloudflare → R2 → create a private bucket (for example `horrorwriter-backups`). Add a lifecycle
   rule deleting objects under `db/` after 30 days.
2. R2 → Manage API tokens → create a token with Object Read & Write on that bucket only.
3. Supabase → Connect → **Session pooler** connection string (port 5432), with the database password.
4. Pick a long passphrase and store it in your password manager. **Without it the backups cannot
   be read.**
5. GitHub → repo → Settings → Secrets and variables → Actions, add:
   `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
6. Run the workflow by hand once. Look for a green run and a `horrorwriter-<date>.tar.gz.gpg`
   line at the end of the "Store in R2" step.

GitHub emails the repo owner when a scheduled run fails. A backup that fails silently for a week
is the failure to watch for: check the Actions tab when that email arrives.

## Restore drill (do this once now, then after any big schema change)
Restore into the **local** stack, never straight into production.

```powershell
# 1. Download the newest object from the R2 bucket (dashboard → bucket → db/ → Download).
# 2. Decrypt and unpack (Git Bash or WSL):
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
