-- Midnight Ritual entries: authors can edit and delete their own.
--
-- * posts.edited_at marks a real edit by the author (updated_at moves on any
--   change, including moderation, so it can't carry that meaning).
-- * ritual_edit_entry() is the only path for editing: it re-checks ownership,
--   the title, and the 100-2000 word range. Authors keep their direct DELETE
--   policy; a delete is permanent.
-- * When the last entry in a ritual thread is deleted, the thread is removed
--   with it, so a prompt shows in the Crypt only while it has an entry.

alter table public.posts add column if not exists edited_at timestamptz;

create or replace function public.ritual_edit_entry(p_post_id uuid, p_title text, p_content text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_post public.posts;
  v_words integer := public.ritual_word_count(p_content);
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if public.is_banned(v_uid) then raise exception 'banned' using errcode = '42501'; end if;
  select p.* into v_post
  from public.posts p join public.threads t on t.id = p.thread_id
  where p.id = p_post_id and p.author_id = v_uid
    and p.parent_post_id is null and t.category_id = 'rituals';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_post.mod_status <> 'live' then raise exception 'not_editable' using errcode = '42501'; end if;
  if char_length(v_title) not between 1 and 200 then raise exception 'bad_title' using errcode = 'HW013'; end if;
  if char_length(btrim(coalesce(p_content, ''))) not between 1 and 16000 or v_words > 2000 then
    raise exception 'bad_content' using errcode = 'HW014';
  end if;
  if v_words < 100 then raise exception 'too_short' using errcode = 'HW023'; end if;

  if v_post.title is not distinct from v_title and v_post.content is not distinct from p_content then
    return v_post.edited_at;
  end if;
  update public.posts set title = v_title, content = p_content, edited_at = now()
  where id = p_post_id
  returning edited_at into v_post.edited_at;
  return v_post.edited_at;
end $$;
revoke all on function public.ritual_edit_entry(uuid, text, text) from public, anon;
grant execute on function public.ritual_edit_entry(uuid, text, text) to authenticated;

create or replace function public.ritual_entry_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.threads where id = old.thread_id and category_id = 'rituals')
     and not exists (
       select 1 from public.posts
       where thread_id = old.thread_id and parent_post_id is null and author_id is not null
     ) then
    delete from public.threads where id = old.thread_id;
  end if;
  return null;
end $$;
revoke all on function public.ritual_entry_deleted() from public, anon, authenticated;

drop trigger if exists on_ritual_entry_deleted on public.posts;
create trigger on_ritual_entry_deleted after delete on public.posts
  for each row when (old.parent_post_id is null and old.author_id is not null)
  execute function public.ritual_entry_deleted();

notify pgrst, 'reload schema';
