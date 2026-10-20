-- Avatar uploads fail in production with "new row violates row-level security
-- policy for table objects". The baseline's SELECT policy on storage.objects
-- was dropped by hand in prod, and storage upload({ upsert: true }) needs a
-- SELECT policy to return the written row. Re-add SELECT scoped to the owner's
-- own folder only, so the public bucket still can't be listed by anyone else.
-- Public avatar URLs keep working: public buckets serve objects without RLS.
drop policy if exists "Users can read their own avatar objects" on storage.objects;
create policy "Users can read their own avatar objects" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

NOTIFY pgrst, 'reload schema';
