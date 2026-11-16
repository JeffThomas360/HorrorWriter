-- Behaviour test for 20261118000000_community_notifications_counters_focus.sql.
-- Rolls back; nothing is kept.
-- Before merge:
--   powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-community-notifications-counters.sql -Migration supabase/migrations/20261118000000_community_notifications_counters_focus.sql
begin;

-- ── 1. Setup throwaway users (…e6xx) ───────────────────────────────────────
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-00000000e601', 'batch6-author@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e602', 'batch6-critic@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e603', 'batch6-mod1@example.test',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e604', 'batch6-mod2@example.test',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

update public.profiles set mod_role = 'moderator', mod_scope = 'all'
where id in ('00000000-0000-4000-8000-00000000e603', '00000000-0000-4000-8000-00000000e604');

-- ── 2. Trigger functions are not callable by anon/authenticated ────────────
set local role anon;
do $$ begin
  begin perform public.adjust_book_comments_count();
    raise exception 'FAIL: anon called adjust_book_comments_count';
  exception when insufficient_privilege then null; end;
  begin perform public.handle_deleted_post();
    raise exception 'FAIL: anon called handle_deleted_post';
  exception when insufficient_privilege then null; end;
  begin perform public.notify_on_post_created();
    raise exception 'FAIL: anon called notify_on_post_created';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── 3. Story critique_focus + critique notifications + delete decrement ─────
insert into public.books (id, author_id, title, lede, content, critique_focus)
values (
  '00000000-0000-4000-8000-0000000c6001',
  '00000000-0000-4000-8000-00000000e601',
  'The Bell Tower',
  'A gothic lede.',
  'Once upon a midnight dreary.',
  'Does the pacing in the final scene work?'
);

-- Overlong critique_focus is rejected.
do $$ begin
  begin
    update public.books set critique_focus = repeat('x', 501)
    where id = '00000000-0000-4000-8000-0000000c6001';
    raise exception 'FAIL: overlong critique_focus accepted';
  exception when check_violation then null; end;
end $$;

-- Critic leaves a critique -> comments_count = 1, author receives critique_received notification with href.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e602","role":"authenticated"}', true);
set local role authenticated;
insert into public.book_comments (id, book_id, author_id, content)
values (
  '00000000-0000-4000-8000-0000000c6101',
  '00000000-0000-4000-8000-0000000c6001',
  '00000000-0000-4000-8000-00000000e602',
  'Great tension in the final scene!'
);
reset role;

do $$ begin
  if (select comments_count from public.books where id = '00000000-0000-4000-8000-0000000c6001') <> 1 then
    raise exception 'FAIL: comments_count did not increment to 1';
  end if;
  if not exists (
    select 1 from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e601'
      and kind = 'critique_received'
      and href = '/library/read/00000000-0000-4000-8000-0000000c6001/'
  ) then
    raise exception 'FAIL: author did not receive critique_received notification with href';
  end if;
end $$;

-- Author comments on own story -> comments_count = 2, no self-notification.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e601","role":"authenticated"}', true);
set local role authenticated;
insert into public.book_comments (id, book_id, author_id, content)
values (
  '00000000-0000-4000-8000-0000000c6102',
  '00000000-0000-4000-8000-0000000c6001',
  '00000000-0000-4000-8000-00000000e601',
  'Thanks for reading!'
);
reset role;

do $$ begin
  if (select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-00000000e601' and kind = 'critique_received') <> 1 then
    raise exception 'FAIL: author received a self-notification on own story comment';
  end if;
end $$;

-- Critic deletes their critique -> comments_count decrements from 2 to 1.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e602","role":"authenticated"}', true);
set local role authenticated;
delete from public.book_comments where id = '00000000-0000-4000-8000-0000000c6101';
reset role;

do $$ begin
  if (select comments_count from public.books where id = '00000000-0000-4000-8000-0000000c6001') <> 1 then
    raise exception 'FAIL: comments_count did not decrement on critique delete';
  end if;
end $$;

-- ── 4. Thread reply notification + reply delete decrement ──────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e601","role":"authenticated"}', true);
set local role authenticated;
select set_config(
  'test.thread_id',
  public.create_thread_with_post('Opening hook test', 'crypt', 'Does this opening sentence hook you?', null::uuid)::text,
  true
);
reset role;

do $$ begin
  if exists (
    select 1 from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e601' and kind = 'thread_reply'
  ) then
    raise exception 'FAIL: OP generated a self-notification';
  end if;
end $$;

-- Critic replies to thread -> replies_count = 1, author receives thread_reply notification.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e602","role":"authenticated"}', true);
set local role authenticated;
insert into public.posts (id, thread_id, author_id, content)
values (
  '00000000-0000-4000-8000-0000000b6001',
  current_setting('test.thread_id')::uuid,
  '00000000-0000-4000-8000-00000000e602',
  'The second clause hooked me immediately.'
);
reset role;

do $$ begin
  if (select replies_count from public.threads where id = current_setting('test.thread_id')::uuid) <> 1 then
    raise exception 'FAIL: replies_count did not increment to 1';
  end if;
  if not exists (
    select 1 from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e601'
      and kind = 'thread_reply'
      and href = '/forum/thread/' || current_setting('test.thread_id') || '/'
  ) then
    raise exception 'FAIL: author did not receive thread_reply notification with href';
  end if;
end $$;

-- Critic deletes reply -> replies_count decrements to 0.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e602","role":"authenticated"}', true);
set local role authenticated;
delete from public.posts where id = '00000000-0000-4000-8000-0000000b6001';
reset role;

do $$ begin
  if (select replies_count from public.threads where id = current_setting('test.thread_id')::uuid) <> 0 then
    raise exception 'FAIL: replies_count did not decrement to 0 on reply delete';
  end if;
end $$;

-- ── 5. Content-ID Appeal resolution unhides the story ─────────────────────
-- Mod 1 hides the story
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e603","role":"authenticated"}', true);
set local role authenticated;
select public.set_content_mod_status('story', '00000000-0000-4000-8000-0000000c6001', 'hidden', 'Mistakenly flagged');
reset role;

-- Author files appeal using the story ID (the exact payload AppealButton sends on ReadStory.jsx)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e601","role":"authenticated"}', true);
set local role authenticated;
insert into public.reports (id, reporter_id, target_type, target_id, category, details, source)
values (
  '00000000-0000-4000-8000-0000000a6001',
  '00000000-0000-4000-8000-00000000e601',
  'appeal',
  '00000000-0000-4000-8000-0000000c6001',
  'other',
  'This is fictional horror prose.',
  'user'
);
reset role;

-- Mod 2 overturns the appeal -> story returns to live and appellant gets appeal_resolved notification with href
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e604","role":"authenticated"}', true);
set local role authenticated;
select public.resolve_appeal('00000000-0000-4000-8000-0000000a6001', false, 'Overturned: fictional prose within guidelines.');
reset role;

do $$ begin
  if (select mod_status from public.books where id = '00000000-0000-4000-8000-0000000c6001') <> 'live' then
    raise exception 'FAIL: resolve_appeal did not restore story mod_status to live';
  end if;
  if not exists (
    select 1 from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e601'
      and kind = 'appeal_resolved'
      and href = '/library/read/00000000-0000-4000-8000-0000000c6001/'
  ) then
    raise exception 'FAIL: resolve_appeal did not notify appellant with story href';
  end if;
end $$;

select 'ALL PASS' as result;
rollback;
