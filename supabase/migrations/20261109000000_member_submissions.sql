-- What each member has put on the site: per-kind counts on Admin → Users, and the
-- Submissions tab on the moderation case file.
--
-- member_submissions_index() is the one place that decides what kind of thing a row is,
-- because the tables don't say:
--   story     a books row by a member. The classics (archive_author set) have no member.
--   thread    a forum thread the member started. Ritual prompt threads belong to no one.
--   reply     a post in a forum thread, except the thread's opening post, which is the
--             earliest post there (same rule as adjust_replies_count_on_status_change).
--   ritual    a top-level post in a prompt thread: the member's entry.
--   critique  a book_comments row, or a post answering an entry in a prompt thread.
--
-- Everything counts as it stands now. Deleted work is really deleted (the site's deletion
-- policy), so it leaves these counts too. Hidden and screening rows are included and tallied
-- separately, since those are what a moderator is looking for.

-- ── 1. Count edits to posts ──────────────────────────────
-- Stories already carry books.version. Ritual entries only had edited_at, the last edit.
-- A trigger, not ritual_edit_entry, so no client write can skip it, and BEFORE INSERT OR UPDATE
-- because a member can write their own posts directly: this keeps the number out of their hands.
alter table public.posts add column edit_count integer not null default 0;

create function public.count_post_edit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.edit_count := 0;
  else
    new.edit_count := old.edit_count
      + case when new.content is distinct from old.content or new.title is distinct from old.title
             then 1 else 0 end;
  end if;
  return new;
end $$;
revoke all on function public.count_post_edit() from public, anon, authenticated;

create trigger posts_count_edit before insert or update on public.posts
  for each row execute function public.count_post_edit();

-- ── 2. The shared definition (private) ───────────────────
create function public.member_submissions_index()
returns table (author_id uuid, kind text, target_type text, id uuid, mod_status text, created_at timestamptz)
language sql stable set search_path = '' as $$
  select b.author_id, 'story', 'story', b.id, b.mod_status, b.created_at
    from public.books b
   where b.author_id is not null and b.archive_author is null and not b.removed_by_author
  union all
  select t.author_id, 'thread', 'thread', t.id, t.mod_status, t.created_at
    from public.threads t
   where t.author_id is not null and t.prompt_id is null and not t.removed_by_author
  union all
  select c.author_id, 'critique', 'critique', c.id, c.mod_status, c.created_at
    from public.book_comments c
   where c.author_id is not null
  union all
  select p.author_id,
         case when t.prompt_id is null then 'reply'
              when p.parent_post_id is null then 'ritual'
              else 'critique' end,
         'post', p.id, p.mod_status, p.created_at
    from public.posts p
    join public.threads t on t.id = p.thread_id
   where p.author_id is not null
     and (t.prompt_id is not null
          or exists (select 1 from public.posts earlier
                      where earlier.thread_id = p.thread_id and earlier.created_at < p.created_at));
$$;
revoke all on function public.member_submissions_index() from public, anon, authenticated;

create function public.submission_excerpt(p_text text)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(c) > 100 then btrim(left(c, 100)) || '…' else c end
    from (select btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')) as c) squeezed;
$$;
revoke all on function public.submission_excerpt(text) from public, anon, authenticated;

-- ── 3. Admin → Users: every member, with their tallies. Warden/keeper only ───
-- The return type changes, so this is a drop and create, and its grants go with it.
-- submissions looks like {"story": {"total": 3, "hidden": 1, "screening": 0}, ...}; a kind the
-- member has none of is simply absent.
drop function public.mod_list_users();

create function public.mod_list_users()
returns table (
  id uuid, handle text, display_name text, avatar_url text, mod_role text, mod_scope text,
  banned_until timestamptz, is_shadowbanned boolean, requires_screening boolean, created_at timestamptz,
  submissions jsonb
)
language sql stable security definer set search_path = ''
as $$
  with tally as (
    select s.author_id, s.kind,
           jsonb_build_object(
             'total', count(*),
             'hidden', count(*) filter (where s.mod_status = 'hidden'),
             'screening', count(*) filter (where s.mod_status = 'screening')
           ) as counts
      from public.member_submissions_index() s
     group by s.author_id, s.kind
  ), per_member as (
    select t.author_id, jsonb_object_agg(t.kind, t.counts) as submissions
      from tally t
     group by t.author_id
  )
  select p.id, p.handle, p.display_name, p.avatar_url, p.mod_role, p.mod_scope,
         p.banned_until, p.is_shadowbanned, p.requires_screening, p.created_at,
         coalesce(pm.submissions, '{}'::jsonb)
    from public.profiles p
    left join per_member pm on pm.author_id = p.id
   where public.mod_can('ban', 'all')
   order by p.created_at desc;
$$;
revoke all on function public.mod_list_users() from public, anon;
grant execute on function public.mod_list_users() to authenticated;

-- ── 4. The case file: one member's submissions, newest first ─────────────────
-- Any moderator can open a case file, as with mod_get_profile. A scoped moderator only gets
-- hidden and screening rows from their own area, the same line content_visible() draws.
--
-- critiques and replies are what readers see: the public counters, or live posts for a Ritual
-- entry. edits is null for kinds nobody can edit. edits_is_minimum marks a Ritual entry whose
-- count may be low: it was edited before edit_count existed, or its count was reset by being
-- restored from the vault. The date is just after this migration; entries newer than it have
-- been counted from their first edit.
create function public.mod_user_submissions(p_user uuid)
returns table (
  kind text, id uuid, title text, excerpt text, context_title text, context_kind text,
  story_id uuid, thread_id uuid, created_at timestamptz, mod_status text,
  critiques integer, replies integer, edits integer, edits_is_minimum boolean, reports integer
)
language sql stable security definer set search_path = ''
as $$
  select s.kind, s.id,
         coalesce(b.title, t.title, p.title),
         case when s.kind in ('reply', 'critique') or (s.kind = 'ritual' and p.title is null)
              then public.submission_excerpt(coalesce(p.content, c.content)) end,
         case s.kind
           when 'ritual' then parent_thread.title
           when 'reply' then parent_thread.title
           when 'critique' then coalesce(critiqued_story.title, entry.title, parent_thread.title)
         end,
         case when s.kind = 'critique' then case when c.id is not null then 'story' else 'ritual' end end,
         coalesce(b.id, c.book_id),
         coalesce(t.id, p.thread_id),
         s.created_at, s.mod_status,
         case s.kind
           when 'story' then coalesce(b.comments_count, 0)
           when 'ritual' then (select count(*)::integer from public.posts answer
                                where answer.parent_post_id = p.id and answer.mod_status = 'live')
         end,
         case when s.kind = 'thread' then coalesce(t.replies_count, 0) end,
         case s.kind
           when 'story' then greatest(b.version - 1, 0)
           when 'ritual' then greatest(p.edit_count, case when p.edited_at is not null then 1 else 0 end)
         end,
         coalesce(s.kind = 'ritual' and p.edited_at is not null
                  and (p.edit_count = 0 or p.created_at < timestamptz '2026-11-10 00:00:00+00'), false),
         (select count(*)::integer from public.reports r
           where r.target_type = s.target_type and r.target_id = s.id)
    from public.member_submissions_index() s
    left join public.books b on s.target_type = 'story' and b.id = s.id
    left join public.threads t on s.target_type = 'thread' and t.id = s.id
    left join public.book_comments c on s.target_type = 'critique' and c.id = s.id
    left join public.books critiqued_story on critiqued_story.id = c.book_id
    left join public.posts p on s.target_type = 'post' and p.id = s.id
    left join public.threads parent_thread on parent_thread.id = p.thread_id
    left join public.posts entry on entry.id = p.parent_post_id
   where s.author_id = p_user
     and public.mod_can('handle_report', 'all')
     and (s.mod_status = 'live' or public.mod_can('view_hidden', public.mod_area(s.target_type)))
   order by s.created_at desc;
$$;
revoke all on function public.mod_user_submissions(uuid) from public, anon;
grant execute on function public.mod_user_submissions(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
