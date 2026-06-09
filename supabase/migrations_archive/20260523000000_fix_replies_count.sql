-- Fix replies_count off-by-one: the original post should not count as a reply.
-- Rewrite handle_new_post() to skip the first post of a thread.
--
-- This migration is defensive: the backfill only runs if public.posts exists,
-- so it's safe to apply even if 20240520000000_content_schemas.sql hasn't been
-- applied yet (the function body is lazy-validated by plpgsql).
create or replace function public.handle_new_post()
returns trigger as $$
declare
  prior_count integer;
begin
  select count(*) into prior_count
  from public.posts
  where thread_id = new.thread_id
    and id <> new.id;

  if prior_count > 0 then
    -- Subsequent post: count it as a reply and bump activity.
    update public.threads
    set replies_count = replies_count + 1,
        updated_at = timezone('utc'::text, now())
    where id = new.thread_id;
  else
    -- Original post: don't count as a reply, but still bump activity.
    update public.threads
    set updated_at = timezone('utc'::text, now())
    where id = new.thread_id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Backfill: replies_count := total posts in thread - 1 (the OP), floored at 0.
-- Skipped if public.posts isn't present yet.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'posts'
  ) then
    update public.threads t
    set replies_count = greatest(0, (
      select count(*) - 1
      from public.posts p
      where p.thread_id = t.id
    ));
  end if;
end $$;
