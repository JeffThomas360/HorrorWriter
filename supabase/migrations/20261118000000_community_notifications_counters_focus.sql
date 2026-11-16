-- Community notifications, accurate comment/reply counters on delete,
-- content-ID appeal resolution, and optional story critique_focus note.

-- ── 1. Schema additions ────────────────────────────────────────────────────
alter table public.notifications
  add column if not exists href text
  check (href is null or (href like '/%' and char_length(href) <= 300));

alter table public.books
  add column if not exists critique_focus text
  check (critique_focus is null or char_length(btrim(critique_focus)) <= 500);

-- Preserve explicit book_version when restoring critiques from story_vault
create or replace function public.stamp_book_comment_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.restoring_story_vault', true), '') = 'true'
     and new.book_version is not null then
    return new;
  end if;

  select version into new.book_version
  from public.books
  where id = new.book_id;

  if new.book_version is null then
    new.book_version := 1;
  end if;

  return new;
end;
$$;

alter function public.stamp_book_comment_version() owner to postgres;
revoke all on function public.stamp_book_comment_version() from public, anon, authenticated;
grant all on function public.stamp_book_comment_version() to service_role;

-- ── 2. Story critique counter + community notification on insert ───────────
create or replace function public.handle_new_book_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book_author_id uuid;
  v_book_title text;
  v_actor_handle text;
begin
  if new.mod_status = 'live' then
    update public.books
    set comments_count = coalesce(comments_count, 0) + 1
    where id = new.book_id;
  end if;

  if new.mod_status = 'live' and new.author_id is not null then
    select author_id, title
      into v_book_author_id, v_book_title
    from public.books
    where id = new.book_id;

    -- Notify the story author unless they wrote the critique themselves,
    -- are restoring their own story from the vault (auth.uid() = v_book_author_id),
    -- or have blocked the commenter.
    if v_book_author_id is not null
       and v_book_author_id <> new.author_id
       and coalesce(auth.uid(), new.author_id) <> v_book_author_id
       and not exists (
         select 1 from public.user_blocks
         where blocker_id = v_book_author_id and blocked_id = new.author_id
       )
    then
      select handle into v_actor_handle
      from public.profiles
      where id = new.author_id;

      insert into public.notifications (user_id, kind, title, body, href)
      values (
        v_book_author_id,
        'critique_received',
        'New critique on "' || left(coalesce(v_book_title, 'your story'), 80) || '"',
        coalesce('@' || v_actor_handle, 'A reader') || ': ' || left(btrim(coalesce(new.content, '')), 140),
        '/library/read/' || new.book_id::text || '/'
      );
    end if;
  end if;

  return new;
end;
$$;

alter function public.handle_new_book_comment() owner to postgres;
revoke all on function public.handle_new_book_comment() from public, anon, authenticated;
grant all on function public.handle_new_book_comment() to service_role;

-- Decrement/re-increment books.comments_count when a critique is deleted or hidden/unhidden.
create or replace function public.adjust_book_comments_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.mod_status = 'live' then
      update public.books
      set comments_count = greatest(coalesce(comments_count, 0) - 1, 0)
      where id = old.book_id;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if new.mod_status is distinct from old.mod_status then
      if old.mod_status = 'live' and new.mod_status <> 'live' then
        update public.books
        set comments_count = greatest(coalesce(comments_count, 0) - 1, 0)
        where id = new.book_id;
      elsif old.mod_status <> 'live' and new.mod_status = 'live' then
        update public.books
        set comments_count = coalesce(comments_count, 0) + 1
        where id = new.book_id;
      end if;
    end if;
    return new;
  end if;
  return null;
end;
$$;

alter function public.adjust_book_comments_count() owner to postgres;
revoke all on function public.adjust_book_comments_count() from public, anon, authenticated;
grant all on function public.adjust_book_comments_count() to service_role;

drop trigger if exists trg_book_comments_adjust_count on public.book_comments;
create trigger trg_book_comments_adjust_count
  after delete or update of mod_status on public.book_comments
  for each row
  execute function public.adjust_book_comments_count();

-- ── 3. Forum post delete counter & community reply notifications ───────────
create or replace function public.handle_deleted_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.mod_status = 'live' then
    update public.threads
    set replies_count = greatest(coalesce(replies_count, 0) - 1, 0)
    where id = old.thread_id;
  end if;
  return old;
end;
$$;

alter function public.handle_deleted_post() owner to postgres;
revoke all on function public.handle_deleted_post() from public, anon, authenticated;
grant all on function public.handle_deleted_post() to service_role;

drop trigger if exists trg_posts_decrement_on_delete on public.posts;
create trigger trg_posts_decrement_on_delete
  after delete on public.posts
  for each row
  execute function public.handle_deleted_post();

create or replace function public.notify_on_post_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid;
  v_parent_title text;
  v_thread_title text;
  v_actor_handle text;
  v_kind text;
  v_title text;
begin
  if new.mod_status <> 'live' or new.author_id is null then
    return new;
  end if;

  if new.parent_post_id is not null then
    select author_id, title
      into v_recipient_id, v_parent_title
    from public.posts
    where id = new.parent_post_id;

    v_kind := 'ritual_comment';
    if v_parent_title is not null then
      v_title := 'New critique on "' || left(v_parent_title, 80) || '"';
    else
      v_title := 'New reply to your critique';
    end if;
  else
    select author_id, title
      into v_recipient_id, v_thread_title
    from public.threads
    where id = new.thread_id;

    v_kind := 'thread_reply';
    v_title := 'New reply in "' || left(coalesce(v_thread_title, 'your thread'), 80) || '"';
  end if;

  if v_recipient_id is not null
     and v_recipient_id <> new.author_id
     and coalesce(auth.uid(), new.author_id) <> v_recipient_id
     and not exists (
       select 1 from public.user_blocks
       where blocker_id = v_recipient_id and blocked_id = new.author_id
     )
  then
    select handle into v_actor_handle
    from public.profiles
    where id = new.author_id;

    insert into public.notifications (user_id, kind, title, body, href)
    values (
      v_recipient_id,
      v_kind,
      v_title,
      coalesce('@' || v_actor_handle, 'A member') || ': ' || left(btrim(coalesce(new.content, '')), 140),
      '/forum/thread/' || new.thread_id::text || '/'
    );
  end if;

  return new;
end;
$$;

alter function public.notify_on_post_created() owner to postgres;
revoke all on function public.notify_on_post_created() from public, anon, authenticated;
grant all on function public.notify_on_post_created() to service_role;

drop trigger if exists on_post_notify_author on public.posts;
create trigger on_post_notify_author
  after insert on public.posts
  for each row
  execute function public.notify_on_post_created();

-- ── 4. Resolve appeal by mod_actions.id OR content target_id ───────────────
create or replace function public.resolve_appeal(
  p_report_id uuid,
  p_upheld boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_appeal_created_at timestamptz;
  v_appeal_target_id uuid;
  v_original_action_id uuid;
  v_original_actor_id uuid;
  v_original_target_type text;
  v_original_target_id uuid;
  v_href text;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A written reason is required to resolve an appeal';
  end if;

  select created_at, target_id
    into v_appeal_created_at, v_appeal_target_id
  from public.reports
  where id = p_report_id and target_type = 'appeal' and status = 'open';
  if not found then
    raise exception 'Appeal not found or already resolved';
  end if;

  -- 1. Direct match on mod_actions.id (when target_id is a mod_action UUID)
  select id, actor_id, target_type, target_id
    into v_original_action_id, v_original_actor_id, v_original_target_type, v_original_target_id
  from public.mod_actions
  where id = v_appeal_target_id;

  -- 2. Fallback: match most recent hide/screen mod_action for this content target_id
  if not found then
    select id, actor_id, target_type, target_id
      into v_original_action_id, v_original_actor_id, v_original_target_type, v_original_target_id
    from public.mod_actions
    where target_id = v_appeal_target_id
      and action in ('hide', 'screen', 'auto_screening', 'auto_hidden')
    order by created_at desc
    limit 1;
  end if;

  -- 3. Fallback: content placed in screening without a mod_actions row
  if v_original_target_id is null then
    if exists (select 1 from public.books where id = v_appeal_target_id) then
      v_original_target_type := 'story';
      v_original_target_id := v_appeal_target_id;
    elsif exists (select 1 from public.threads where id = v_appeal_target_id) then
      v_original_target_type := 'thread';
      v_original_target_id := v_appeal_target_id;
    elsif exists (select 1 from public.posts where id = v_appeal_target_id) then
      v_original_target_type := 'post';
      v_original_target_id := v_appeal_target_id;
    elsif exists (select 1 from public.book_comments where id = v_appeal_target_id) then
      v_original_target_type := 'critique';
      v_original_target_id := v_appeal_target_id;
    else
      raise exception 'Original moderation action not found';
    end if;
  end if;

  if not public.mod_can('handle_report', public.mod_area(v_original_target_type)) then
    raise exception 'Permission denied to resolve appeals in this area';
  end if;

  if v_original_actor_id is not null
     and v_original_actor_id = v_caller_id
     and (now() - v_appeal_created_at) < interval '24 hours'
  then
    raise exception 'Cool-off period: you took the original action — wait 24 hours after the appeal was filed before resolving it yourself, or have another moderator review it.';
  end if;

  update public.reports
  set status = 'actioned',
      resolution = p_reason,
      resolved_by = v_caller_id,
      resolved_at = timezone('utc', now())
  where id = p_report_id;

  if not p_upheld then
    perform set_config('app.automated_mod_action', 'true', true);
    if v_original_target_type = 'story' then
      update public.books set mod_status = 'live' where id = v_original_target_id;
    elsif v_original_target_type = 'thread' then
      update public.threads set mod_status = 'live' where id = v_original_target_id;
    elsif v_original_target_type = 'post' then
      update public.posts set mod_status = 'live' where id = v_original_target_id;
    elsif v_original_target_type = 'critique' then
      update public.book_comments set mod_status = 'live' where id = v_original_target_id;
    end if;
    perform set_config('app.automated_mod_action', 'false', true);
  end if;

  insert into public.mod_actions (actor_id, action, target_type, target_id, reason, metadata)
  values (
    v_caller_id, 'appeal_resolved', v_original_target_type, v_original_target_id, p_reason,
    jsonb_build_object('upheld', p_upheld, 'original_action_id', v_original_action_id)
  );

  v_href := case
    when v_original_target_type = 'story' then '/library/read/' || v_original_target_id::text || '/'
    when v_original_target_type = 'thread' then '/forum/thread/' || v_original_target_id::text || '/'
    else null
  end;

  insert into public.notifications (user_id, kind, title, body, href)
  select reporter_id, 'appeal_resolved',
    case when p_upheld then 'Appeal Reviewed — Decision Upheld' else 'Appeal Reviewed — Decision Overturned' end,
    p_reason,
    v_href
  from public.reports where id = p_report_id;
end;
$$;

revoke all on function public.resolve_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.resolve_appeal(uuid, boolean, text) to authenticated;
grant execute on function public.resolve_appeal(uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
