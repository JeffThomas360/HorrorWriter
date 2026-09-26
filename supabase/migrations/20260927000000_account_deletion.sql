-- Account deletion: Erase everything / Seal my writing.
-- Spec: docs/superpowers/specs/2026-09-26-account-deletion-and-sealing-design.md
-- Test: scripts/sql/test-delete-member.sql (rolls back; must print ALL PASS)

-- 1. Detach, don't destroy: deleting a profile no longer deletes other members'
--    critiques and replies hanging off the member's stories and threads.
alter table public.books         alter column author_id drop not null;
alter table public.threads       alter column author_id drop not null;
alter table public.book_comments alter column author_id drop not null;
alter table public.posts         alter column author_id drop not null;

alter table public.books         drop constraint books_author_id_fkey,
  add constraint books_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.threads       drop constraint threads_author_id_fkey,
  add constraint threads_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.book_comments drop constraint book_comments_author_id_fkey,
  add constraint book_comments_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.posts         drop constraint posts_author_id_fkey,
  add constraint posts_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;

-- 1b. A mod note survives its author's deletion (target_user_id still cascades;
--     author_id is now cleared instead of failing the whole transaction).
alter table public.mod_notes alter column author_id drop not null;

-- 2. Tombstones.
alter table public.books   add column removed_by_author boolean not null default false;
alter table public.threads add column removed_by_author boolean not null default false;

-- 3. Sealed bundles. Ciphertext only; the key exists only in the member's browser.
create table public.sealed_bundles (
  email_key  text primary key,               -- HMAC-SHA256(secret, lower(trim(email))), hex
  bundle     bytea not null,                 -- 0x01 || salt(16) || iv(12) || ciphertext+tag
  sealed_at  timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 years'
);
alter table public.sealed_bundles enable row level security;
-- No policies: no client role can read or write. Edge Functions use service_role.
revoke all on table public.sealed_bundles from public, anon, authenticated;
grant select, insert, update, delete on table public.sealed_bundles to service_role;

-- 4. Seals are kept at most seven years.
create extension if not exists pg_cron;
select cron.schedule(
  'purge-expired-seals',
  '17 3 * * *',
  $$delete from public.sealed_bundles where expires_at < now()$$
);

-- 5. The erase/tombstone work runs as a BEFORE DELETE trigger on profiles, so
--    it fires no matter how the profile gets deleted -- delete_member below,
--    the Supabase dashboard deleting the auth user (cascades to profiles), or
--    anything else. delete_member no longer duplicates this logic.
create or replace function public.erase_member_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The member's own critiques and posts (opening posts included) go.
  delete from public.book_comments where author_id = old.id;
  delete from public.posts         where author_id = old.id;

  -- Stories and threads nobody else's words hang off: gone.
  delete from public.books b
   where b.author_id = old.id
     and not exists (select 1 from public.book_comments c where c.book_id = b.id);
  delete from public.threads t
   where t.author_id = old.id
     and not exists (select 1 from public.posts p where p.thread_id = t.id);

  -- The rest become tombstones: the member's words erased, others' kept.
  update public.books
     set title = '', lede = '', content = null, series_teaser = null, chapters_info = null,
         author_id = null, removed_by_author = true
   where author_id = old.id;
  update public.threads
     set title = '', author_id = null, removed_by_author = true
   where author_id = old.id;

  return old;
end;
$$;

-- Trigger functions need no client grant -- PostgREST never exposes them --
-- but the lockdown default only covers functions created after 20260910000000,
-- so this one is revoked explicitly too, matching that migration's pattern.
revoke all on function public.erase_member_content() from public, anon, authenticated;

drop trigger if exists erase_member_content_before_delete on public.profiles;
create trigger erase_member_content_before_delete
  before delete on public.profiles
  for each row execute function public.erase_member_content();

comment on function public.erase_member_content() is
'SECURITY DEFINER trigger function, BEFORE DELETE on public.profiles. Erases the departing member''s critiques and posts, deletes their stories/threads nobody else replied to, and tombstones the rest -- regardless of what deleted the profile row.';

-- 6. The whole database side of an account deletion, in one transaction.
--    All the content work now happens in the trigger above; this just
--    validates arguments, stores the sealed bundle when given one, and
--    deletes the profile (which fires the trigger).
create or replace function public.delete_member(
  p_user uuid, p_email_key text default null, p_bundle bytea default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null then
    raise exception 'delete_member: p_user is required';
  end if;
  if (p_email_key is null) <> (p_bundle is null) then
    raise exception 'delete_member: email key and bundle go together';
  end if;

  if p_bundle is not null then
    insert into public.sealed_bundles (email_key, bundle)
    values (p_email_key, p_bundle)
    on conflict (email_key) do update
      set bundle = excluded.bundle, sealed_at = now(), expires_at = now() + interval '7 years';
  end if;

  -- Series (and their series_books) cascade with the profile; follows, blocks,
  -- notifications and mod_notes about the member cascade too (mod_notes
  -- authored BY the member instead keep the note and clear author_id).
  delete from public.profiles where id = p_user;
end;
$$;

revoke all on function public.delete_member(uuid, text, bytea) from public, anon, authenticated;
grant execute on function public.delete_member(uuid, text, bytea) to service_role;

comment on function public.delete_member(uuid, text, bytea) is
'SECURITY DEFINER, service_role only (delete-account Edge Function). Validates arguments, stores a sealed bundle when given one, and deletes the profile -- the erase_member_content trigger does the content work.';

notify pgrst, 'reload schema';
