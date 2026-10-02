-- Behaviour test for 20261001000000_forum_editing.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
-- After merge:  npx supabase db query --linked -f scripts/sql/test-forum-editing.sql
-- Before merge: powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-forum-editing.sql -Migration supabase/migrations/20261001000000_forum_editing.sql
begin;

do $$ begin
  if to_regprocedure('public.edit_forum_post(uuid, text)') is null then raise exception 'FAIL: edit_forum_post missing'; end if;
  if to_regprocedure('public.edit_forum_thread(uuid, text, text)') is null then raise exception 'FAIL: edit_forum_thread missing'; end if;
end $$;

-- ── Setup (as postgres) ────────────────────────────────────────────────────
-- A = author, B = another member, X = banned author.
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-00000000f101', 'forum-a@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000f102', 'forum-b@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000f103', 'forum-x@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
update public.profiles set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-00000000f103';

-- T1 by A: opening post O1 (A) and reply R1 (A) and reply R2 (B).
-- T2 by X (banned): opening post O2.
-- T3 tombstoned (author erased): opening post O3 with no author.
insert into public.threads (id, category_id, title, author_id, updated_at) values
  ('00000000-0000-4000-8000-0000000f1a01', (select id from public.categories order by sort_order limit 1), 'Original title', '00000000-0000-4000-8000-00000000f101', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000f1a02', (select id from public.categories order by sort_order limit 1), 'Banned title',   '00000000-0000-4000-8000-00000000f103', now() - interval '3 days');
insert into public.threads (id, category_id, title, author_id, removed_by_author) values
  ('00000000-0000-4000-8000-0000000f1a03', (select id from public.categories order by sort_order limit 1), 'Tombstone', null, true);
insert into public.posts (id, thread_id, author_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000f1b01', '00000000-0000-4000-8000-0000000f1a01', '00000000-0000-4000-8000-00000000f101', 'Original opening post.', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000f1b02', '00000000-0000-4000-8000-0000000f1a01', '00000000-0000-4000-8000-00000000f101', 'Original reply by A.',   now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000f1b03', '00000000-0000-4000-8000-0000000f1a01', '00000000-0000-4000-8000-00000000f102', 'Reply by B.',            now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000f1b04', '00000000-0000-4000-8000-0000000f1a02', '00000000-0000-4000-8000-00000000f103', 'Banned opening post.',   now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000f1b05', '00000000-0000-4000-8000-0000000f1a03', null,                                   'Tombstoned post.',       now() - interval '3 days');
-- R1 has been hidden by a moderator.
-- prevent_mod_status_reset allows this only for moderators or the automated path.
select set_config('app.automated_mod_action', 'true', true);
update public.posts set mod_status = 'hidden' where id = '00000000-0000-4000-8000-0000000f1b02';
select set_config('app.automated_mod_action', '', true);
-- Pin T1's activity time so we can prove an edit doesn't bump it.
-- (the touch trigger would overwrite it with now(), so switch it off for this one line)
alter table public.threads disable trigger threads_set_updated_at;
update public.threads set updated_at = '2026-01-01 00:00+00' where id = '00000000-0000-4000-8000-0000000f1a01';
alter table public.threads enable trigger threads_set_updated_at;

-- ── anon can't call either function ────────────────────────────────────────
set local role anon;
do $$ begin
  begin
    perform public.edit_forum_post('00000000-0000-4000-8000-0000000f1b02', 'anon edit');
    raise exception 'FAIL: anon edited a post';
  exception when insufficient_privilege then null; end;
  begin
    perform public.edit_forum_thread('00000000-0000-4000-8000-0000000f1a01', 'anon title', 'anon body');
    raise exception 'FAIL: anon edited a thread';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── B can't edit A's thread or reply; it looks like "not found" ────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f102","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform public.edit_forum_post('00000000-0000-4000-8000-0000000f1b02', 'B edits A');
    raise exception 'FAIL: B edited A''s reply';
  exception when others then
    if sqlerrm <> 'not_found' then raise exception 'FAIL: expected not_found for B on A''s reply, got %', sqlerrm; end if;
  end;
  begin
    perform public.edit_forum_thread('00000000-0000-4000-8000-0000000f1a01', 'B title', 'B body');
    raise exception 'FAIL: B edited A''s thread';
  exception when others then
    if sqlerrm <> 'not_found' then raise exception 'FAIL: expected not_found for B on A''s thread, got %', sqlerrm; end if;
  end;
  -- Nobody can edit a tombstoned thread or its authorless post.
  begin
    perform public.edit_forum_thread('00000000-0000-4000-8000-0000000f1a03', 'Revived', 'Revived body');
    raise exception 'FAIL: tombstoned thread edited';
  exception when others then
    if sqlerrm <> 'not_found' then raise exception 'FAIL: tombstone expected not_found, got %', sqlerrm; end if;
  end;
  begin
    perform public.edit_forum_post('00000000-0000-4000-8000-0000000f1b05', 'Revived body');
    raise exception 'FAIL: tombstoned post edited';
  exception when others then
    if sqlerrm <> 'not_found' then raise exception 'FAIL: tombstone post expected not_found, got %', sqlerrm; end if;
  end;
  -- B can edit B's own reply.
  perform public.edit_forum_post('00000000-0000-4000-8000-0000000f1b03', '  Reply by B, edited.  ');
end $$;
reset role;

do $$ begin
  if (select content from public.posts where id = '00000000-0000-4000-8000-0000000f1b02') <> 'Original reply by A.' then
    raise exception 'FAIL: A''s reply changed after B''s refused edit'; end if;
  if (select title from public.threads where id = '00000000-0000-4000-8000-0000000f1a01') <> 'Original title' then
    raise exception 'FAIL: A''s title changed after B''s refused edit'; end if;
  if (select content from public.posts where id = '00000000-0000-4000-8000-0000000f1b03') <> 'Reply by B, edited.' then
    raise exception 'FAIL: B''s own edit should be saved trimmed'; end if;
end $$;

-- ── A edits: reply (hidden stays hidden), thread (no bump), empties refused ─
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f101","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.edit_forum_post('00000000-0000-4000-8000-0000000f1b02', 'Edited reply by A.');
  perform public.edit_forum_thread('00000000-0000-4000-8000-0000000f1a01', '  Edited title  ', 'Edited opening post.');
  begin
    perform public.edit_forum_post('00000000-0000-4000-8000-0000000f1b02', '   ');
    raise exception 'FAIL: blank reply accepted';
  exception when others then
    if sqlerrm <> 'empty' then raise exception 'FAIL: blank reply expected empty, got %', sqlerrm; end if;
  end;
  begin
    perform public.edit_forum_thread('00000000-0000-4000-8000-0000000f1a01', ' ', 'Body');
    raise exception 'FAIL: blank title accepted';
  exception when others then
    if sqlerrm <> 'empty' then raise exception 'FAIL: blank title expected empty, got %', sqlerrm; end if;
  end;
  begin
    perform public.edit_forum_thread('00000000-0000-4000-8000-0000000f1a01', 'Title', '');
    raise exception 'FAIL: blank opening post accepted';
  exception when others then
    if sqlerrm <> 'empty' then raise exception 'FAIL: blank opening post expected empty, got %', sqlerrm; end if;
  end;
end $$;
reset role;

do $$
declare p public.posts; t public.threads; o public.posts;
begin
  select * into p from public.posts where id = '00000000-0000-4000-8000-0000000f1b02';
  if p.content <> 'Edited reply by A.' or p.edited_at is null then raise exception 'FAIL: reply edit not saved with edited_at'; end if;
  if p.mod_status <> 'hidden' then raise exception 'FAIL: editing a hidden reply changed its status to %', p.mod_status; end if;

  select * into t from public.threads where id = '00000000-0000-4000-8000-0000000f1a01';
  if t.title <> 'Edited title' or t.edited_at is null then raise exception 'FAIL: thread title edit not saved with edited_at'; end if;
  if t.updated_at <> '2026-01-01 00:00+00' then raise exception 'FAIL: a title edit bumped thread activity to %', t.updated_at; end if;

  select * into o from public.posts where id = '00000000-0000-4000-8000-0000000f1b01';
  if o.content <> 'Edited opening post.' or o.edited_at is null then raise exception 'FAIL: opening post not edited with the thread'; end if;

  -- An ordinary (non-edit) update still bumps activity.
  update public.threads set pinned = true where id = t.id;
  if (select updated_at from public.threads where id = t.id) = '2026-01-01 00:00+00' then
    raise exception 'FAIL: a non-edit update no longer bumps updated_at'; end if;
end $$;

-- ── A banned author can't edit ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f103","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform public.edit_forum_post('00000000-0000-4000-8000-0000000f1b04', 'Banned edit');
    raise exception 'FAIL: banned member edited a post';
  exception when others then
    if sqlerrm <> 'banned' then raise exception 'FAIL: banned post edit expected banned, got %', sqlerrm; end if;
  end;
  begin
    perform public.edit_forum_thread('00000000-0000-4000-8000-0000000f1a02', 'Banned', 'Banned edit');
    raise exception 'FAIL: banned member edited a thread';
  exception when others then
    if sqlerrm <> 'banned' then raise exception 'FAIL: banned thread edit expected banned, got %', sqlerrm; end if;
  end;
end $$;
reset role;

select 'ALL PASS' as result;
rollback;
