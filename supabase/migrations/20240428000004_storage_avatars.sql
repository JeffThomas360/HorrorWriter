-- Avatar storage bucket + RLS for per-user-folder uploads.
--
-- Layout convention: every user's avatar lives at `<user_uuid>/avatar.<ext>`.
-- The folder-name check (`storage.foldername(name))[1]`) enforces that a user
-- can only INSERT/UPDATE/DELETE objects under their own UUID folder.
-- Read access is fully public so anyone can <img> a profile avatar.

-- 1. Bucket. `on conflict do update` keeps us idempotent in case the bucket
--    was created via the dashboard before this migration ran.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Policies. `drop policy if exists` first so this migration is re-runnable
--    if a partial run left some of them behind.
drop policy if exists "Avatars are publicly readable"     on storage.objects;
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "Users can delete their own avatar" on storage.objects;

create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
