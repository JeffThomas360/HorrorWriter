-- Forum post editing (Jeff, 2026-10-01).
-- Plan: docs/superpowers/plans/2026-10-01-forum-editing.md
--
-- Members can edit their own thread (title + opening post) and their own
-- replies. There is deliberately still no member UPDATE policy on threads or
-- posts: RLS can't limit an update to some columns, so one would let an author
-- set their own mod_status from 'hidden' back to 'live'. Edits go through the
-- two functions below, which change only the text and edited_at.
--
-- Member edits are not written to mod_actions: that table feeds the public
-- transparency log. edited_at is the record, and the thread page shows it.

-- ── 1. "edited" marker ─────────────────────────────────────────────────────
-- Separate from updated_at, which also moves on replies and moderation.
alter table public.threads add column edited_at timestamptz;
alter table public.posts   add column edited_at timestamptz;

-- ── 2. An edit is not activity ─────────────────────────────────────────────
-- threads.updated_at orders the forum list, so a title edit must not bump a
-- thread to the top. Every other update still touches it as before.
create function public.threads_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.edited_at is distinct from old.edited_at then
    new.updated_at := old.updated_at;
  else
    new.updated_at := timezone('utc'::text, now());
  end if;
  return new;
end $$;

drop trigger threads_set_updated_at on public.threads;
create trigger threads_set_updated_at
  before update on public.threads
  for each row execute function public.threads_touch_updated_at();

-- ── 3. Edit functions ──────────────────────────────────────────────────────
-- Errors are stable codes the client maps to plain words. "Not yours" and
-- "doesn't exist" are the same not_found, so ids can't be probed.
create function public.edit_forum_post(p_post_id uuid, p_content text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_author uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if public.is_banned(auth.uid()) then raise exception 'banned' using errcode = '42501'; end if;
  select author_id into v_author from public.posts where id = p_post_id for update;
  if not found or v_author is distinct from auth.uid() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if coalesce(btrim(p_content), '') = '' then raise exception 'empty' using errcode = '22023'; end if;
  -- mod_status is untouched: a hidden post stays hidden, and moderate-content
  -- only re-screens rows that are still live.
  update public.posts set content = btrim(p_content), edited_at = now() where id = p_post_id;
end $$;

create function public.edit_forum_thread(p_thread_id uuid, p_title text, p_content text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_author  uuid;
  v_opening uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if public.is_banned(auth.uid()) then raise exception 'banned' using errcode = '42501'; end if;
  select author_id into v_author from public.threads where id = p_thread_id for update;
  if not found or v_author is distinct from auth.uid() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- The opening post is the thread's first post (create_thread_with_post
  -- writes it in the same transaction as the thread).
  select id into v_opening from public.posts
  where thread_id = p_thread_id
  order by created_at, id
  limit 1
  for update;
  if v_opening is null or (select author_id from public.posts where id = v_opening) is distinct from auth.uid() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_content), '') = '' then
    raise exception 'empty' using errcode = '22023';
  end if;
  update public.threads set title = btrim(p_title), edited_at = now() where id = p_thread_id;
  update public.posts set content = btrim(p_content), edited_at = now() where id = v_opening;
end $$;

-- ── 4. Grants (new functions are private by default since 20260910000000) ──
revoke all on function public.threads_touch_updated_at()           from public, anon, authenticated;
revoke all on function public.edit_forum_post(uuid, text)          from public, anon, authenticated;
revoke all on function public.edit_forum_thread(uuid, text, text)  from public, anon, authenticated;
grant execute on function public.edit_forum_post(uuid, text)         to authenticated;
grant execute on function public.edit_forum_thread(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
