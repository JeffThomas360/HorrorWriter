-- Midnight Ritual mentoring: a moderator can put an entry "under revision"
-- instead of deleting it. The entry is hidden from readers (reusing the
-- existing 'hidden' status, so mod_actions and the author notification still
-- happen), the author and moderators talk privately in ritual_feedback, the
-- author edits and marks it ready, and a moderator shows it again.
--
-- * Readers see a placeholder (author name only) via ritual_revision_placeholders().
-- * ritual_edit_entry() now also allows editing while a revision is open.
-- * Closes a hole: an author could un-hide their own hidden post with a direct
--   UPDATE. Only moderators can move a post out of 'hidden' now.

create table public.ritual_revisions (
  post_id     uuid primary key references public.posts(id) on delete cascade,
  started_by  uuid references public.profiles(id) on delete set null,
  started_at  timestamptz not null default now(),
  ready_at    timestamptz,
  resolved_at timestamptz
);

create table public.ritual_feedback (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  sender_id  uuid references public.profiles(id) on delete set null,
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index ritual_feedback_post_idx on public.ritual_feedback (post_id, created_at);

alter table public.ritual_revisions enable row level security;
alter table public.ritual_feedback enable row level security;
revoke all on public.ritual_revisions, public.ritual_feedback from anon, authenticated;
grant select on public.ritual_revisions, public.ritual_feedback to authenticated;

-- Private: the entry's author and moderators only. All writes go through the RPCs below.
create policy ritual_revisions_select on public.ritual_revisions for select to authenticated using (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
  or public.mod_can('hide', 'forum'));
create policy ritual_feedback_select on public.ritual_feedback for select to authenticated using (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
  or public.mod_can('hide', 'forum'));

-- Moderator: hide an entry for revision, with the first note to the author.
create or replace function public.ritual_start_revision(p_post_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  v_post public.posts;
begin
  if v_uid is null or not public.mod_can('hide', 'forum') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if char_length(v_note) not between 1 and 4000 then raise exception 'bad_note' using errcode = 'HW024'; end if;
  select p.* into v_post
  from public.posts p join public.threads t on t.id = p.thread_id
  where p.id = p_post_id and p.parent_post_id is null and p.author_id is not null and t.category_id = 'rituals';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  insert into public.ritual_revisions (post_id, started_by) values (p_post_id, v_uid)
  on conflict (post_id) do update
    set started_by = excluded.started_by, started_at = now(), ready_at = null, resolved_at = null
    where public.ritual_revisions.resolved_at is not null;
  if not found then raise exception 'already_open' using errcode = 'HW025'; end if;

  perform public.set_content_mod_status('post', p_post_id, 'hidden', 'Under revision with a mentor');
  insert into public.ritual_feedback (post_id, sender_id, body) values (p_post_id, v_uid, v_note);
end $$;

-- Author or moderator: add to the private conversation while a revision is open.
create or replace function public.ritual_post_feedback(p_post_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_post public.posts;
  v_rev public.ritual_revisions;
  v_is_mod boolean := public.mod_can('hide', 'forum');
  v_id uuid;
begin
  if v_uid is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_post from public.posts where id = p_post_id;
  select * into v_rev from public.ritual_revisions where post_id = p_post_id and resolved_at is null;
  if v_post.id is null or v_rev.post_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_post.author_id is distinct from v_uid and not v_is_mod then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'bad_note' using errcode = 'HW024'; end if;

  insert into public.ritual_feedback (post_id, sender_id, body) values (p_post_id, v_uid, v_body)
  returning id into v_id;
  -- Tell the other side.
  insert into public.notifications (user_id, kind, title, body)
  values (
    case when v_uid = v_post.author_id then coalesce(v_rev.started_by, v_uid) else v_post.author_id end,
    'content_actioned', 'New message about a response under revision',
    'Open the response in The Crypt to read it.');
  return v_id;
end $$;

-- Author: finished making changes.
create or replace function public.ritual_mark_ready(p_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_rev public.ritual_revisions;
begin
  select r.* into v_rev from public.ritual_revisions r join public.posts p on p.id = r.post_id
  where r.post_id = p_post_id and r.resolved_at is null and p.author_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.ritual_revisions set ready_at = now() where post_id = p_post_id;
  if v_rev.started_by is not null then
    insert into public.notifications (user_id, kind, title, body)
    values (v_rev.started_by, 'content_actioned', 'A response is ready for review',
            'The author has finished their changes. Open it in The Crypt.');
  end if;
end $$;

-- Moderator: show the entry again.
create or replace function public.ritual_finish_revision(p_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.mod_can('hide', 'forum') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ritual_revisions where post_id = p_post_id and resolved_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.set_content_mod_status('post', p_post_id, 'live', 'Revision complete');
  update public.ritual_revisions set resolved_at = now() where post_id = p_post_id;
end $$;

-- Public: which entries in a thread are under revision (author name only).
create or replace function public.ritual_revision_placeholders(p_thread_id uuid)
returns table (post_id uuid, handle text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, pr.handle, p.created_at
  from public.posts p
  join public.ritual_revisions r on r.post_id = p.id and r.resolved_at is null
  left join public.profiles pr on pr.id = p.author_id
  where p.thread_id = p_thread_id
  order by p.created_at
$$;

revoke all on function public.ritual_start_revision(uuid, text) from public, anon;
revoke all on function public.ritual_post_feedback(uuid, text) from public, anon;
revoke all on function public.ritual_mark_ready(uuid) from public, anon;
revoke all on function public.ritual_finish_revision(uuid) from public, anon;
revoke all on function public.ritual_revision_placeholders(uuid) from public;
grant execute on function public.ritual_start_revision(uuid, text) to authenticated;
grant execute on function public.ritual_post_feedback(uuid, text) to authenticated;
grant execute on function public.ritual_mark_ready(uuid) to authenticated;
grant execute on function public.ritual_finish_revision(uuid) to authenticated;
grant execute on function public.ritual_revision_placeholders(uuid) to anon, authenticated;

-- Editing is allowed while a revision is open (the post is hidden then).
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
  if v_post.mod_status <> 'live'
     and not exists (select 1 from public.ritual_revisions where post_id = p_post_id and resolved_at is null) then
    raise exception 'not_editable' using errcode = '42501';
  end if;
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

-- Only a moderator can take a post out of 'hidden'.
create or replace function public.posts_guard_unhide()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and not public.mod_can('hide', 'forum') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.posts_guard_unhide() from public, anon, authenticated;

drop trigger if exists posts_guard_unhide on public.posts;
create trigger posts_guard_unhide before update of mod_status on public.posts
  for each row when (old.mod_status = 'hidden' and new.mod_status is distinct from 'hidden')
  execute function public.posts_guard_unhide();

notify pgrst, 'reload schema';
