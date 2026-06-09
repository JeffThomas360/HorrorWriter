-- Tighten Select policy on avatars bucket to prevent listing all user files.
-- Public downloads still work because the bucket is marked public.
drop policy if exists "Avatars are publicly readable" on storage.objects;

create policy "Users can select their own avatars"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
