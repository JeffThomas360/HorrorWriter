-- Behaviour test for 20261028010000_tickets.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
-- The tickets migration calls keeper_dispatch() from 20261028000000_keeper_alerts.sql.
-- Once that migration is applied:
--   powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-tickets.sql -Migration supabase/migrations/20261028010000_tickets.sql
-- While both are unmerged, pass a scratch file holding the two migrations concatenated
-- (keeper_alerts first) as -Migration. Local dev points at PRODUCTION, so only run it this way.
--
-- Actors: M and O are existing ordinary accounts over an hour old (auth.users.created_at) with
-- no tickets (O is only ever refused), K is the keeper. Throwaway accounts (...c30xx) cover
-- too_new (including a backdated profile), banned and the limit guards, so sanctions and
-- backdating never touch a real profile. T (...c3005) reads an answer before it goes quiet. L's profile is brand new while its account is two
-- hours old, so L passing proves the age guard reads auth.users, not profiles.
-- Pushes are asserted on net.http_request_queue with fake Vault secrets, as in
-- test-keeper-alerts.sql: the queued rows are uncommitted, roll back, and point at rehearsal.invalid.
begin;

-- ── Helpers (session-temporary) ────────────────────────────────────────────
-- p_sql must raise. p_key is the expected message (the client maps errors by message);
-- p_state, when given, the expected SQLSTATE. Runs as whatever role is current.
create function pg_temp.expect_err(p_sql text, p_key text, p_state text default null)
returns void language plpgsql as $f$
begin
  execute p_sql;
  raise exception 'FAIL: expected "%" but it succeeded: %', coalesce(p_key, p_state), p_sql;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm is distinct from coalesce(p_key, sqlerrm) or sqlstate is distinct from coalesce(p_state, sqlstate) then
    raise exception 'FAIL: expected "%" (%), got "%" (%) from: %', p_key, coalesce(p_state, 'any state'), sqlerrm, sqlstate, p_sql;
  end if;
end $f$;
grant execute on function pg_temp.expect_err(text, text, text) to authenticated, anon;

-- Alerts queued to the fake send-keeper-alert URL: by kind, or by exact body.
create function pg_temp.pushes(p_kind text) returns bigint language plpgsql as $f$
begin
  return (select count(*) from net.http_request_queue
           where headers->>'Authorization' = 'Bearer rehearsal-key'
             and url = 'https://rehearsal.invalid/functions/v1/send-keeper-alert'
             and convert_from(body, 'utf8')::jsonb->>'kind' = p_kind);
end $f$;
create function pg_temp.pushed(p_body jsonb) returns bigint language plpgsql as $f$
begin
  return (select count(*) from net.http_request_queue
           where headers->>'Authorization' = 'Bearer rehearsal-key'
             and url = 'https://rehearsal.invalid/functions/v1/send-keeper-alert'
             and convert_from(body, 'utf8')::jsonb = p_body);
end $f$;

-- Fake Vault secrets (overwriting real ones for this transaction only, if set).
do $$
declare
  names text[] := array['hw_project_url', 'hw_service_role_key'];
  vals  text[] := array['https://rehearsal.invalid/', 'rehearsal-key'];
  i integer;
  sid uuid;
begin
  for i in 1..2 loop
    select id into sid from vault.secrets where name = names[i];
    if sid is null then
      perform vault.create_secret(vals[i], names[i]);
    else
      perform vault.update_secret(sid, vals[i]);
    end if;
  end loop;
end $$;

-- ── 0. Old Support requests moved over; the auto-close job is scheduled ────
-- Runs first, before this test opens any ticket. Checks every report the migration
-- moved in this transaction (resolved_at = now() is the transaction's start time).
do $$
declare r record; tk uuid; mid uuid; n int := 0;
begin
  if (select count(*) from public.reports where target_type = 'site' and status = 'open') <> 0 then
    raise exception 'FAIL: % open site reports left after the move',
      (select count(*) from public.reports where target_type = 'site' and status = 'open');
  end if;
  for r in
    select rp.id, rp.reporter_id, rp.details, rp.created_at, rp.status, p.handle
      from public.reports rp join public.profiles p on p.id = rp.reporter_id
     where rp.target_type = 'site' and rp.resolution = 'moved to tickets' and rp.resolved_at = now()
  loop
    n := n + 1;
    if r.status <> 'actioned' then raise exception 'FAIL: moved report % is %', r.id, r.status; end if;
    select t.id into tk from public.tickets t
     where t.user_id = r.reporter_id and t.topic = 'broken' and t.subject = 'Support request'
       and t.created_at = r.created_at and t.status = 'waiting';
    if tk is null then raise exception 'FAIL: moved report % has no waiting ticket', r.id; end if;
    select m.id into mid from public.ticket_messages m
     where m.ticket_id = tk and not m.from_keeper and m.author_id = r.reporter_id and m.created_at = r.created_at
       and m.body = left(coalesce(nullif(btrim(r.details), ''), '(no details given)'), 2000);
    if mid is null or (select count(*) from public.ticket_messages where ticket_id = tk) <> 1 then
      raise exception 'FAIL: moved report % did not become exactly one first message', r.id;
    end if;
    if (select count(*) from public.keeper_tasks
         where type = 'ticket' and target_type = 'ticket' and target_id = tk and status = 'open'
           and dedupe_key = 'ticket:' || tk || ':' || mid
           and payload = jsonb_build_object('topic', 'broken', 'subject', 'Support request', 'handle', r.handle)) <> 1 then
      raise exception 'FAIL: moved report % has no matching open keeper task', r.id;
    end if;
  end loop;
  perform set_config('test.moved', n::text, true);

  if (select count(*) from cron.job where jobname = 'close-inactive-tickets' and schedule = '17 4 * * *'
        and command = 'select public.close_inactive_tickets()') <> 1 then
    raise exception 'FAIL: close-inactive-tickets cron job missing or wrong';
  end if;
end $$;

-- ── Actors ─────────────────────────────────────────────────────────────────
-- Throwaway accounts (as postgres, no JWT): handle_new_user gives each a profile.
-- Account age is auth.users.created_at (clients can't write it); every profile
-- here is created now. N and S are brand new accounts; B and L are two hours
-- old; B is banned for a day. S later backdates its own profiles.created_at.
insert into auth.users (id, email, aud, role, instance_id, created_at) values
  ('00000000-0000-4000-8000-0000000c3001', 'tickets-new@example.test',     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c3002', 'tickets-banned@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000000c3003', 'tickets-limits@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000000c3004', 'tickets-spoofer@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c3005', 'tickets-seen@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '2 hours');
update public.profiles set banned_until = now() + interval '1 day'
 where id = '00000000-0000-4000-8000-0000000c3002';

do $$
declare k uuid; m uuid; o uuid;
begin
  select id into k from public.profiles where mod_role = 'keeper' order by created_at limit 1;
  if k is null then raise exception 'FAIL: rehearsal needs a keeper profile'; end if;
  select p.id into m from public.profiles p join auth.users u on u.id = p.id
   where p.mod_role is null and u.created_at < now() - interval '1 hour'
     and (p.banned_until is null or p.banned_until <= now())
     and not exists (select 1 from public.tickets t where t.user_id = p.id)
   order by u.created_at limit 1;
  select p.id into o from public.profiles p join auth.users u on u.id = p.id
   where p.mod_role is null and u.created_at < now() - interval '1 hour'
     and (p.banned_until is null or p.banned_until <= now())
     and not exists (select 1 from public.tickets t where t.user_id = p.id)
     and p.id is distinct from m
   order by u.created_at limit 1;
  if m is null or o is null then raise exception 'FAIL: rehearsal needs two ordinary accounts over an hour old'; end if;
  perform set_config('test.k', k::text, true);
  perform set_config('test.m', m::text, true);
  perform set_config('test.o', o::text, true);

  -- For the transparency check (section 9b): the newest log row that existed
  -- before this test, if any, and a row with a NULL target_type.
  perform set_config('test.pre_log', coalesce((
    select m2.id::text from public.mod_actions m2 join public.profiles p2 on p2.id = m2.actor_id
     where m2.target_type is distinct from 'ticket'
     order by m2.created_at desc limit 1), ''), true);
  insert into public.mod_actions (actor_id, action, target_type)
  values (k, 'rehearsal_null_target', null);
end $$;

-- S, a brand-new account, backdates its own profile by a year (the profiles
-- UPDATE policy allows it). The age guard must not care.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000c3004","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    update public.profiles set created_at = now() - interval '1 year' where id = auth.uid();
    perform set_config('test.s_self_backdate', 'member could backdate', true);
  exception when insufficient_privilege then
    perform set_config('test.s_self_backdate', 'refused, owner backdated', true);
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
update public.profiles set created_at = now() - interval '1 year'
 where id = '00000000-0000-4000-8000-0000000c3004' and created_at > now() - interval '1 year';
do $$ begin
  if (select created_at from public.profiles where id = '00000000-0000-4000-8000-0000000c3004') > now() - interval '364 days' then
    raise exception 'FAIL: setup could not backdate S''s profile';
  end if;
end $$;

-- ── 1. open_ticket happy path (service role, as the open-ticket Edge Function) ──
do $$
declare
  m uuid := current_setting('test.m')::uuid;
  h text := (select handle from public.profiles where id = current_setting('test.m')::uuid);
  t uuid;
  msg public.ticket_messages;
  task public.keeper_tasks;
  n int;
  pushes0 bigint := pg_temp.pushes('ticket_new');
begin
  t := public.open_ticket(m, 'signing-in', '  My   passkey vanished ', E'  I cannot sign in with my passkey\n  on my new phone.  ');
  if t is null then raise exception 'FAIL: open_ticket returned null'; end if;
  perform set_config('test.t1', t::text, true);

  if not exists (select 1 from public.tickets where id = t and user_id = m and topic = 'signing-in'
                   and subject = 'My passkey vanished' and status = 'waiting'
                   and close_reason is null and closed_at is null and member_seen_at is null) then
    raise exception 'FAIL: new ticket row is wrong: %', (select to_jsonb(x) from public.tickets x where x.id = t);
  end if;

  select count(*) into n from public.ticket_messages where ticket_id = t;
  if n <> 1 then raise exception 'FAIL: expected 1 first message, got %', n; end if;
  select * into msg from public.ticket_messages where ticket_id = t;
  if msg.from_keeper or msg.author_id is distinct from m then raise exception 'FAIL: first message author is wrong'; end if;
  if msg.body <> E'I cannot sign in with my passkey\n  on my new phone.' then
    raise exception 'FAIL: first message should be trimmed with its line break kept, got "%"', msg.body;
  end if;

  select count(*) into n from public.keeper_tasks where type = 'ticket' and target_id = t and status = 'open';
  if n <> 1 then raise exception 'FAIL: expected exactly 1 open ticket task, got %', n; end if;
  select * into task from public.keeper_tasks where type = 'ticket' and target_id = t;
  if task.dedupe_key <> 'ticket:' || t || ':' || msg.id then raise exception 'FAIL: dedupe key %', task.dedupe_key; end if;
  if task.target_type is distinct from 'ticket' or task.priority <> 0 then raise exception 'FAIL: task target_type/priority wrong'; end if;
  if task.payload <> jsonb_build_object('topic', 'signing-in', 'subject', 'My passkey vanished', 'handle', h) then
    raise exception 'FAIL: task payload %', task.payload;
  end if;
  perform set_config('test.t1_task', task.id::text, true);

  if pg_temp.pushes('ticket_new') - pushes0 <> 1 then raise exception 'FAIL: expected 1 ticket_new push'; end if;
  if pg_temp.pushed(jsonb_build_object('kind', 'ticket_new', 'topic', 'signing-in', 'handle', h)) <> 1 then
    raise exception 'FAIL: the ticket_new push must carry kind + topic + handle only';
  end if;
end $$;

-- ── 2. Privileges ──────────────────────────────────────────────────────────
do $$
declare f text; r text;
begin
  -- open_ticket belongs to the Edge Function (Turnstile first): service_role only.
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.open_ticket(uuid, text, text, text)', 'execute') then
      raise exception 'FAIL: % can execute open_ticket', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.open_ticket(uuid, text, text, text)', 'execute') then
    raise exception 'FAIL: service_role cannot execute open_ticket';
  end if;
  -- Member and keeper RPCs: authenticated yes, anon no.
  foreach f in array array['public.reply_ticket(uuid, text)', 'public.mark_ticket_seen(uuid)',
                           'public.keeper_reply_ticket(uuid, text)', 'public.keeper_close_ticket(uuid, text, text)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL: authenticated cannot execute %', f; end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL: anon can execute %', f; end if;
  end loop;
  -- Internals: no client role.
  foreach f in array array['public.close_inactive_tickets()', 'public.ticket_norm(text)', 'public.ticket_body(text, integer)',
                           'public.ticket_require_member(uuid)', 'public.ticket_check_limits(uuid, text)',
                           'public.keeper_task_apply_action(public.keeper_tasks, text, text)'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FAIL: % can execute %', r, f; end if;
    end loop;
  end loop;
  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace,
           lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where ns.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE'
       and p.proname in ('open_ticket', 'reply_ticket', 'mark_ticket_seen', 'keeper_reply_ticket', 'keeper_close_ticket',
                         'close_inactive_tickets', 'ticket_norm', 'ticket_body', 'ticket_require_member',
                         'ticket_check_limits', 'keeper_task_apply_action')
  ) then raise exception 'FAIL: PUBLIC can execute a ticket function'; end if;
  -- Tables: authenticated reads only; anon nothing; RLS on; no write policies.
  foreach f in array array['public.tickets', 'public.ticket_messages'] loop
    if not has_table_privilege('authenticated', f, 'select') then raise exception 'FAIL: authenticated cannot read %', f; end if;
    if has_table_privilege('authenticated', f, 'insert') or has_table_privilege('authenticated', f, 'update')
       or has_table_privilege('authenticated', f, 'delete') then raise exception 'FAIL: authenticated can write %', f; end if;
    if has_table_privilege('anon', f, 'select') then raise exception 'FAIL: anon can read %', f; end if;
  end loop;
  if exists (select 1 from pg_class where oid in ('public.tickets'::regclass, 'public.ticket_messages'::regclass) and not relrowsecurity) then
    raise exception 'FAIL: RLS is off on a tickets table';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('tickets', 'ticket_messages') and cmd <> 'SELECT') then
    raise exception 'FAIL: a tickets table has a write policy';
  end if;
end $$;

-- A signed-in member calling open_ticket directly (skipping Turnstile) is refused.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.m'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_err(format('select public.open_ticket(%L, %L, %L, %L)', current_setting('test.m'),
    'other', 'Let me in please', 'A body that is long enough to pass the guard.'), null, '42501');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ── 3. Guards on open_ticket (service role) ────────────────────────────────
do $$
declare
  m text := current_setting('test.m');
  ok_subject text := 'A fine subject';
  ok_body text := 'This body is comfortably over twenty characters.';
  call text := 'select public.open_ticket(%L, %L, %L, %L)';
begin
  -- identity and sanctions
  perform pg_temp.expect_err(format(call, null, 'other', ok_subject, ok_body), 'not_signed_in');
  perform pg_temp.expect_err(format(call, gen_random_uuid(), 'other', ok_subject, ok_body), 'not_signed_in');
  perform pg_temp.expect_err(format(call, '00000000-0000-4000-8000-0000000c3001', 'other', ok_subject, ok_body), 'too_new');
  -- S: auth.users.created_at = now(), profiles.created_at a year back. Still too new.
  perform pg_temp.expect_err(format(call, '00000000-0000-4000-8000-0000000c3004', 'other', ok_subject, ok_body), 'too_new');
  perform pg_temp.expect_err(format(call, '00000000-0000-4000-8000-0000000c3002', 'other', ok_subject, ok_body), 'banned');
  -- topic
  perform pg_temp.expect_err(format(call, m, 'admin', ok_subject, ok_body), 'bad_topic');
  perform pg_temp.expect_err(format(call, m, null, ok_subject, ok_body), 'bad_topic');
  -- subject: whitespace padding counts as nothing
  perform pg_temp.expect_err(format(call, m, 'other', '    x    ', ok_body), 'bad_subject');
  perform pg_temp.expect_err(format(call, m, 'other', 'a' || repeat(' ', 30) || 'b', ok_body), 'bad_subject');
  perform pg_temp.expect_err(format(call, m, 'other', repeat('s', 121), ok_body), 'bad_subject');
  -- body
  perform pg_temp.expect_err(format(call, m, 'other', ok_subject, repeat('b', 19)), 'bad_body');
  perform pg_temp.expect_err(format(call, m, 'other', ok_subject, 'short' || repeat(E' \n\t', 20) || 'body'), 'bad_body');
  perform pg_temp.expect_err(format(call, m, 'other', ok_subject, repeat('b', 2001)), 'bad_body');
  -- 1,991 characters normalised, but over 2,000 as stored (the line breaks are kept)
  perform pg_temp.expect_err(format(call, m, 'other', ok_subject, repeat('b', 1000) || repeat(E'\n', 50) || repeat('c', 990)), 'bad_body');
  -- duplicate: the first ticket's words, spaced differently
  perform pg_temp.expect_err(format(call, m, 'other', ok_subject,
    E'\n I  cannot sign in   with my passkey on   my new phone.\t'), 'duplicate');

  -- The boundaries pass (then are undone): 5 / 120 subject, 20 / 2,000 body.
  begin
    perform public.open_ticket(m::uuid, 'other', repeat('s', 5), repeat('b', 20));
    perform public.open_ticket(m::uuid, 'other', repeat('s', 120), repeat('c', 2000));
    raise exception 'undo-boundaries';
  exception when others then
    if sqlerrm <> 'undo-boundaries' then raise exception 'FAIL: a boundary-length ticket was refused: %', sqlerrm; end if;
  end;
end $$;

-- ── 4. Limits (throwaway L): 3 open, 3 a day, 10 member messages a day ─────
do $$
declare
  l uuid := '00000000-0000-4000-8000-0000000c3003';
  t uuid[] := '{}';
  i int;
begin
  for i in 1..3 loop
    t := t || public.open_ticket(l, 'other', 'Limits ticket ' || i, 'Limits ticket body number ' || i || ', long enough.');
  end loop;
  perform pg_temp.expect_err(format('select public.open_ticket(%L, %L, %L, %L)', l, 'other', 'Limits ticket 4',
    'Limits ticket body number 4, long enough.'), 'too_many_open');
  perform set_config('test.l_tickets', array_to_string(t, ','), true);
end $$;

-- The keeper dismisses the third one (no note).
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.k'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.keeper_close_ticket(split_part(current_setting('test.l_tickets'), ',', 3)::uuid, 'dismissed');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  l uuid := '00000000-0000-4000-8000-0000000c3003';
  t3 uuid := split_part(current_setting('test.l_tickets'), ',', 3)::uuid;
  task public.keeper_tasks;
begin
  if not exists (select 1 from public.tickets where id = t3 and status = 'closed' and close_reason = 'dismissed' and closed_at is not null) then
    raise exception 'FAIL: dismissed ticket row is wrong';
  end if;
  select * into task from public.keeper_tasks where type = 'ticket' and target_id = t3;
  if task.status <> 'dismissed' or task.resolution <> 'dismissed' or task.resolved_by is distinct from current_setting('test.k')::uuid
     or task.resolved_at is null then
    raise exception 'FAIL: a dismissed ticket should dismiss its task, got %/%', task.status, task.resolution;
  end if;
  if (select count(*) from public.ticket_messages where ticket_id = t3) <> 1 then raise exception 'FAIL: a close without a note added a message'; end if;
  if exists (select 1 from public.notifications where user_id = l) then raise exception 'FAIL: a close without a note notified the member'; end if;
  -- R21: nothing new to read, so it is seen at once and never reaches the banner.
  if (select member_seen_at from public.tickets where id = t3) is null then
    raise exception 'FAIL: a close without a note should mark the ticket seen';
  end if;

  -- Two open now, but three opened in the last 24 h.
  perform pg_temp.expect_err(format('select public.open_ticket(%L, %L, %L, %L)', l, 'other', 'Limits ticket 5',
    'Limits ticket body number 5, long enough.'), 'daily_limit');
  -- Move the tickets out of the 24 h window; their three messages still count.
  update public.tickets set created_at = created_at - interval '25 hours' where user_id = l;
end $$;

-- L replies 7 times to a waiting ticket (3 + 7 = 10 messages today), then is capped.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000c3003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare t1 uuid := split_part(current_setting('test.l_tickets'), ',', 1)::uuid; i int;
begin
  for i in 1..7 loop
    perform public.reply_ticket(t1, 'Follow-up number ' || i || ' on the limits ticket.');
  end loop;
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', t1, 'Follow-up number 8 on the limits ticket.'), 'message_limit');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  l uuid := '00000000-0000-4000-8000-0000000c3003';
  t1 uuid := split_part(current_setting('test.l_tickets'), ',', 1)::uuid;
begin
  perform pg_temp.expect_err(format('select public.open_ticket(%L, %L, %L, %L)', l, 'other', 'Limits ticket 6',
    'Limits ticket body number 6, long enough.'), 'message_limit');
  -- Replies to a waiting ticket only add the message: no push, no second task.
  if pg_temp.pushes('ticket_reply') <> 0 then raise exception 'FAIL: a reply to a waiting ticket sent a push'; end if;
  if (select count(*) from public.keeper_tasks where type = 'ticket' and target_id = t1 and status = 'open') <> 1 then
    raise exception 'FAIL: replies to a waiting ticket changed its open task count';
  end if;
  if (select count(*) from public.ticket_messages where ticket_id = t1) <> 8 then raise exception 'FAIL: expected 8 messages on L''s ticket'; end if;
  if (select status from public.tickets where id = t1) <> 'waiting' then raise exception 'FAIL: L''s ticket left waiting'; end if;
end $$;

-- ── 5. Keeper replies, twice (the second from a stale tab) ─────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.k'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare t uuid := current_setting('test.t1')::uuid; r1 uuid;
begin
  if not exists (select 1 from public.tickets where id = t) then raise exception 'FAIL: the keeper cannot read the ticket'; end if;
  if (select count(*) from public.ticket_messages where ticket_id = t) <> 1 then raise exception 'FAIL: the keeper cannot read its messages'; end if;
  r1 := public.keeper_reply_ticket(t, 'Try the email link on the sign-in screen.');
  if r1 is null then raise exception 'FAIL: keeper_reply_ticket returned null'; end if;
  perform set_config('test.t1_r1', r1::text, true);
  perform pg_temp.expect_err(format('select public.keeper_reply_ticket(%L, %L)', t, E' \n\t '), 'bad_body');
  perform pg_temp.expect_err(format('select public.keeper_reply_ticket(%L, %L)', gen_random_uuid(), 'Hello there.'), 'not_found');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  t uuid := current_setting('test.t1')::uuid;
  k uuid := current_setting('test.k')::uuid;
  m uuid := current_setting('test.m')::uuid;
  n int;
begin
  if not exists (select 1 from public.tickets where id = t and status = 'answered' and member_seen_at is null) then
    raise exception 'FAIL: after a keeper reply the ticket should be answered and unseen';
  end if;
  select count(*) into n from public.keeper_tasks where type = 'ticket' and target_id = t and status = 'open';
  if n <> 0 then raise exception 'FAIL: % open tasks after the keeper replied', n; end if;
  if not exists (select 1 from public.keeper_tasks where id = current_setting('test.t1_task')::uuid and status = 'resolved'
                   and resolution = 'replied' and resolved_by = k and resolved_at is not null) then
    raise exception 'FAIL: the ticket task was not resolved as replied by the keeper';
  end if;
  if not exists (select 1 from public.ticket_messages where id = current_setting('test.t1_r1')::uuid and ticket_id = t
                   and from_keeper and author_id = k and body = 'Try the email link on the sign-in screen.') then
    raise exception 'FAIL: keeper reply message is wrong';
  end if;
  select count(*) into n from public.notifications
   where user_id = m and kind = 'ticket_reply' and title = 'The Keeper answered your ticket' and body = 'My passkey vanished' and read_at is null;
  if n <> 1 then raise exception 'FAIL: expected 1 ticket_reply notification, got %', n; end if;
  -- Logged, with nothing in the publicly listed reason column, and no target_user_id
  -- (R30): support is not an action against the member, so it stays out of their case
  -- file and the audit view's "actions against". The ticket is the target.
  if (select count(*) from public.mod_actions where action = 'ticket_replied' and target_type = 'ticket' and target_id = t
        and target_user_id is null and actor_id = k and reason is null) <> 1 then
    raise exception 'FAIL: ticket_replied not logged to mod_actions';
  end if;
end $$;

-- The stale tab: a second reply while the ticket is still open is appended.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.k'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.keeper_reply_ticket(current_setting('test.t1')::uuid, '  Also check your password manager.  ');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare t uuid := current_setting('test.t1')::uuid; m uuid := current_setting('test.m')::uuid;
begin
  if (select status from public.tickets where id = t) <> 'answered' then raise exception 'FAIL: second keeper reply changed the status'; end if;
  if (select count(*) from public.ticket_messages where ticket_id = t and from_keeper) <> 2 then raise exception 'FAIL: second keeper reply not appended'; end if;
  if not exists (select 1 from public.ticket_messages where ticket_id = t and from_keeper and body = 'Also check your password manager.') then
    raise exception 'FAIL: keeper reply was not trimmed';
  end if;
  if (select count(*) from public.notifications where user_id = m and kind = 'ticket_reply') <> 2 then
    raise exception 'FAIL: expected a notification per keeper reply';
  end if;
  if exists (select 1 from public.keeper_tasks where type = 'ticket' and target_id = t and status = 'open') then
    raise exception 'FAIL: second keeper reply left an open task';
  end if;
end $$;

-- ── 6. The member: reads, marks seen, replies ──────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.m'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare t uuid := current_setting('test.t1')::uuid; st text; seen timestamptz; r uuid;
begin
  select status, member_seen_at into st, seen from public.tickets where id = t;
  if st is distinct from 'answered' or seen is not null then raise exception 'FAIL: member sees %/% instead of answered/unseen', st, seen; end if;
  if (select count(*) from public.ticket_messages where ticket_id = t) <> 3 then raise exception 'FAIL: member cannot read the whole conversation'; end if;
  perform public.mark_ticket_seen(t);
  if (select member_seen_at from public.tickets where id = t) is null then raise exception 'FAIL: mark_ticket_seen did not stick'; end if;

  -- Writes go only through the RPCs.
  perform pg_temp.expect_err(format('insert into public.tickets (user_id, topic, subject) values (%L, %L, %L)',
    current_setting('test.m'), 'other', 'Sneaky ticket'), null, '42501');
  perform pg_temp.expect_err(format('insert into public.ticket_messages (ticket_id, from_keeper, body) values (%L, true, %L)',
    t, 'Forged keeper reply'), null, '42501');
  perform pg_temp.expect_err(format('update public.tickets set status = %L where id = %L', 'waiting', t), null, '42501');
  perform pg_temp.expect_err(format('delete from public.ticket_messages where ticket_id = %L', t), null, '42501');
  -- Keeper RPCs refuse a member; keeper tasks stay invisible.
  perform pg_temp.expect_err(format('select public.keeper_reply_ticket(%L, %L)', t, 'I am the keeper now'), 'not_allowed');
  perform pg_temp.expect_err(format('select public.keeper_close_ticket(%L, %L)', t, 'resolved'), 'not_allowed');
  if (select count(*) from public.keeper_tasks) <> 0 then raise exception 'FAIL: a member can read keeper tasks'; end if;

  -- Replying to an answered ticket puts it back in the queue.
  r := public.reply_ticket(t, 'That worked, but now the passkey prompt loops.');
  if r is null then raise exception 'FAIL: reply_ticket returned null'; end if;
  perform set_config('test.t1_reply', r::text, true);
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', t,
    '  That worked,  but now the passkey' || E'\n' || 'prompt loops.'), 'duplicate');
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', t, 'too short'), 'bad_body');
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', gen_random_uuid(), 'A reply to a ticket that does not exist.'), 'not_found');
  -- A second reply while waiting just adds the message.
  perform public.reply_ticket(t, 'Here is one more detail about the loop.');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  t uuid := current_setting('test.t1')::uuid;
  h text := (select handle from public.profiles where id = current_setting('test.m')::uuid);
  task public.keeper_tasks;
  n int;
begin
  if (select status from public.tickets where id = t) <> 'waiting' then raise exception 'FAIL: member reply did not set waiting'; end if;
  select count(*) into n from public.keeper_tasks where type = 'ticket' and target_id = t and status = 'open';
  if n <> 1 then raise exception 'FAIL: expected 1 open task after the member replied, got %', n; end if;
  select * into task from public.keeper_tasks where type = 'ticket' and target_id = t and status = 'open';
  if task.id = current_setting('test.t1_task')::uuid then raise exception 'FAIL: the old task was reopened instead of a new one'; end if;
  if task.dedupe_key <> 'ticket:' || t || ':' || current_setting('test.t1_reply') then raise exception 'FAIL: new task dedupe key %', task.dedupe_key; end if;
  if task.payload <> jsonb_build_object('topic', 'signing-in', 'subject', 'My passkey vanished', 'handle', h) then
    raise exception 'FAIL: new task payload %', task.payload;
  end if;
  perform set_config('test.t1_task2', task.id::text, true);
  -- One reply push (the second reply went to a waiting ticket), handle only.
  if pg_temp.pushes('ticket_reply') <> 1 then raise exception 'FAIL: expected 1 ticket_reply push, got %', pg_temp.pushes('ticket_reply'); end if;
  if pg_temp.pushed(jsonb_build_object('kind', 'ticket_reply', 'handle', h)) <> 1 then
    raise exception 'FAIL: the ticket_reply push must carry kind + handle only';
  end if;
  if (select count(*) from public.ticket_messages where ticket_id = t) <> 5 then raise exception 'FAIL: expected 5 messages on the ticket'; end if;
end $$;

-- ── 7. Everyone else is refused ────────────────────────────────────────────
-- Another member: not found, and nothing to read.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.o'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare t uuid := current_setting('test.t1')::uuid;
begin
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', t, 'Someone else butting into this ticket.'), 'not_found');
  perform pg_temp.expect_err(format('select public.mark_ticket_seen(%L)', t), 'not_found');
  if (select count(*) from public.tickets where id = t) <> 0 then raise exception 'FAIL: another member can see the ticket'; end if;
  if (select count(*) from public.ticket_messages where ticket_id = t) <> 0 then raise exception 'FAIL: another member can read its messages'; end if;
  if (select count(*) from public.tickets) <> 0 then raise exception 'FAIL: another member can see tickets that are not theirs'; end if;
end $$;
reset role;

-- A banned member.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000c3002","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', current_setting('test.t1'), 'A banned member trying to reply.'), 'banned');
end $$;
reset role;

-- S, the brand-new account with the backdated profile, on the member RPC path too.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000c3004","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', current_setting('test.t1'), 'A brand-new account trying to reply.'), 'too_new');
end $$;
reset role;

-- A JWT whose account has no profile, and no JWT at all.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', current_setting('test.t1'), 'A ghost trying to reply here.'), 'not_signed_in');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', current_setting('test.t1'), 'Nobody is signed in at all here.'), 'not_signed_in');
  perform pg_temp.expect_err(format('select public.mark_ticket_seen(%L)', current_setting('test.t1')), 'not_signed_in');
end $$;

-- Logged-out visitors: no table grant, no RPC grant.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  perform pg_temp.expect_err('select count(*) from public.tickets', null, '42501');
  perform pg_temp.expect_err('select count(*) from public.ticket_messages', null, '42501');
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', current_setting('test.t1'), 'Anonymous reply attempt here.'), null, '42501');
  perform pg_temp.expect_err(format('select public.open_ticket(%L, %L, %L, %L)', current_setting('test.m'), 'other',
    'Anon subject', 'Anonymous open attempt here.'), null, '42501');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ── 8. Generic resolve can't touch a live ticket's task; manual tasks still work ──
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.k'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_err(format('select public.resolve_keeper_task(%L, %L)', current_setting('test.t1_task2'), 'done'), 'use_ticket_actions', 'HW012');
  perform pg_temp.expect_err(format('select public.resolve_keeper_task(%L, %L)', current_setting('test.t1_task2'), 'dismiss'), 'use_ticket_actions', 'HW012');
  perform public.resolve_keeper_task(public.keeper_add_task('Rehearsal to-do'), 'done');
end $$;

-- ── 9. Close: once, then the stale tab gets `closed` (still the keeper) ────
do $$
declare t uuid := current_setting('test.t1')::uuid;
begin
  perform pg_temp.expect_err(format('select public.keeper_close_ticket(%L, %L)', t, 'inactive'), 'bad_reason');
  perform pg_temp.expect_err(format('select public.keeper_close_ticket(%L, null)', t), 'bad_reason');
  perform pg_temp.expect_err(format('select public.keeper_close_ticket(%L, %L)', gen_random_uuid(), 'resolved'), 'not_found');
  perform public.keeper_close_ticket(t, 'resolved', E'  Glad it is sorted.\n  Closing this one.  ');
  perform pg_temp.expect_err(format('select public.keeper_close_ticket(%L, %L)', t, 'resolved'), 'closed');
  perform pg_temp.expect_err(format('select public.keeper_close_ticket(%L, %L)', t, 'dismissed'), 'closed');
  perform pg_temp.expect_err(format('select public.keeper_reply_ticket(%L, %L)', t, 'One more thing.'), 'closed');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  t uuid := current_setting('test.t1')::uuid;
  k uuid := current_setting('test.k')::uuid;
  m uuid := current_setting('test.m')::uuid;
begin
  if not exists (select 1 from public.tickets where id = t and status = 'closed' and close_reason = 'resolved' and closed_at is not null) then
    raise exception 'FAIL: closed ticket row is wrong';
  end if;
  if not exists (select 1 from public.ticket_messages where ticket_id = t and from_keeper and author_id = k
                   and body = E'Glad it is sorted.\n  Closing this one.') then
    raise exception 'FAIL: the closing note was not added as a keeper message';
  end if;
  if (select count(*) from public.ticket_messages where ticket_id = t) <> 6 then raise exception 'FAIL: expected 6 messages after the close'; end if;
  if (select count(*) from public.notifications where user_id = m and kind = 'ticket_closed'
        and title = 'Your ticket was closed' and body = 'My passkey vanished') <> 1 then
    raise exception 'FAIL: the closing note did not notify the member';
  end if;
  -- R21: the member had seen the earlier replies (section 6); the closing note is new to
  -- them, so the ticket is unseen again and the banner shows it.
  if (select member_seen_at from public.tickets where id = t) is not null then
    raise exception 'FAIL: a closing note should leave the ticket unseen, for the banner';
  end if;
  if not exists (select 1 from public.keeper_tasks where id = current_setting('test.t1_task2')::uuid
                   and status = 'resolved' and resolution = 'resolved' and resolved_by = k and resolved_at is not null) then
    raise exception 'FAIL: resolving the ticket did not resolve its open task';
  end if;
  if exists (select 1 from public.keeper_tasks where type = 'ticket' and target_id = t and status = 'open') then
    raise exception 'FAIL: a closed ticket still has an open task';
  end if;
  if (select count(*) from public.mod_actions where action = 'ticket_closed' and target_type = 'ticket' and target_id = t
        and target_user_id is null and actor_id = k and reason is null) <> 1 then
    raise exception 'FAIL: ticket_closed not logged to mod_actions';
  end if;
end $$;

-- The member can't reply to a closed ticket (but may still mark it seen).
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.m'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_err(format('select public.reply_ticket(%L, %L)', current_setting('test.t1'), 'Please reopen this closed ticket.'), 'closed');
  perform public.mark_ticket_seen(current_setting('test.t1')::uuid);
  if (select member_seen_at from public.tickets where id = current_setting('test.t1')::uuid) is null then
    raise exception 'FAIL: mark_ticket_seen did not work on a closed ticket';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ── 9b. The public transparency log never shows ticket activity ───────────
do $$ begin
  -- Non-vacuous: the replies and closes above did log ticket rows.
  if (select count(*) from public.mod_actions where target_type = 'ticket' and action in ('ticket_replied', 'ticket_closed')) < 4 then
    raise exception 'FAIL: expected ticket_replied/ticket_closed rows in mod_actions';
  end if;
  -- R30: none of them names the member.
  if exists (select 1 from public.mod_actions where target_type = 'ticket' and target_user_id is not null) then
    raise exception 'FAIL: a ticket mod_actions row names the member in target_user_id';
  end if;
  -- Signature, ACL and comment unchanged by the CREATE OR REPLACE.
  if not has_function_privilege('anon', 'public.get_transparency_log(int)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_transparency_log(int)', 'execute') then
    raise exception 'FAIL: get_transparency_log lost its anon/authenticated grant';
  end if;
  if exists (select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = 'public.get_transparency_log(int)'::regprocedure and a.grantee = 0) then
    raise exception 'FAIL: PUBLIC can execute get_transparency_log';
  end if;
  if obj_description('public.get_transparency_log(int)'::regprocedure, 'pg_proc') is distinct from
     'Safe SECURITY DEFINER function with strict search_path=public: provides public visibility into sanitized moderation logs without triggering 0010_security_definer_view.' then
    raise exception 'FAIL: get_transparency_log comment changed';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.get_transparency_log(int)'::regprocedure) then
    raise exception 'FAIL: get_transparency_log is no longer SECURITY DEFINER';
  end if;
end $$;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare pre text := current_setting('test.pre_log');
begin
  if exists (select 1 from public.get_transparency_log(100000) where target_type = 'ticket') then
    raise exception 'FAIL: get_transparency_log shows ticket activity';
  end if;
  if not exists (select 1 from public.get_transparency_log(100000) where action = 'rehearsal_null_target' and target_type is null) then
    raise exception 'FAIL: get_transparency_log dropped a row with a NULL target_type';
  end if;
  if pre <> '' then
    if not exists (select 1 from public.get_transparency_log(100000) where id = pre::uuid) then
      raise exception 'FAIL: get_transparency_log lost the pre-existing row %', pre;
    end if;
    perform set_config('test.pre_log_seen', 'yes', true);
  else
    perform set_config('test.pre_log_seen', 'no pre-existing row', true);
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ── 10. Auto-close: answered and quiet for 14 days ─────────────────────────
do $$
declare m uuid := current_setting('test.m')::uuid;
begin
  perform set_config('test.ta', public.open_ticket(m, 'rituals', 'Ritual entry missing', 'My ritual entry from last week is gone.')::text, true);
  perform set_config('test.tb', public.open_ticket(m, 'my-writing', 'Cannot edit my story', 'The edit button on my story does nothing.')::text, true);
  -- T's answer will be read before it goes quiet.
  perform set_config('test.tc', public.open_ticket('00000000-0000-4000-8000-0000000c3005', 'other',
    'A question I got answered', 'Asking something that the Keeper will answer and I will read.')::text, true);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.k'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.keeper_reply_ticket(current_setting('test.ta')::uuid, 'Restored it from the vault.');
  perform public.keeper_reply_ticket(current_setting('test.tb')::uuid, 'Which browser are you using?');
  perform public.keeper_reply_ticket(current_setting('test.tc')::uuid, 'Here is the answer you asked for.');
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000c3005","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.mark_ticket_seen(current_setting('test.tc')::uuid);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  a uuid := current_setting('test.ta')::uuid;   -- answered, quiet 15 days: closes
  b uuid := current_setting('test.tb')::uuid;   -- answered, recent: stays
  w uuid := split_part(current_setting('test.l_tickets'), ',', 2)::uuid;  -- waiting, quiet 15 days: stays
  c uuid := current_setting('test.tc')::uuid;   -- answered and read, quiet 15 days: closes, still read
  c_seen timestamptz := (select member_seen_at from public.tickets where id = current_setting('test.tc')::uuid);
  n int;
begin
  if c_seen is null then raise exception 'FAIL: setup: T''s answered ticket was not marked seen'; end if;
  if (select member_seen_at from public.tickets where id = a) is not null then
    raise exception 'FAIL: setup: the quiet answered ticket should be unseen';
  end if;
  update public.ticket_messages set created_at = created_at - interval '15 days' where ticket_id in (a, w, c);
  n := public.close_inactive_tickets();
  if n <> 2 then raise exception 'FAIL: close_inactive_tickets closed %, expected 2', n; end if;
  if not exists (select 1 from public.tickets where id = a and status = 'closed' and close_reason = 'inactive' and closed_at is not null) then
    raise exception 'FAIL: the quiet answered ticket was not closed as inactive';
  end if;
  -- R21: auto-close leaves member_seen_at alone. An unread answer stays unread (the banner
  -- still shows it); one already read stays read.
  if (select member_seen_at from public.tickets where id = a) is not null then
    raise exception 'FAIL: auto-close marked an unread answer as seen';
  end if;
  if not exists (select 1 from public.tickets where id = c and status = 'closed' and close_reason = 'inactive'
                   and member_seen_at = c_seen) then
    raise exception 'FAIL: auto-close changed member_seen_at on an answer that was already read';
  end if;
  if (select status from public.tickets where id = b) <> 'answered' then raise exception 'FAIL: a recently answered ticket was closed'; end if;
  if (select status from public.tickets where id = w) <> 'waiting' then raise exception 'FAIL: a waiting ticket was auto-closed'; end if;
  if (select count(*) from public.ticket_messages where ticket_id = a) <> 2 then raise exception 'FAIL: auto-close added a message'; end if;

  -- The table itself refuses an inconsistent row or an unknown topic.
  perform pg_temp.expect_err(format('update public.tickets set status = %L where id = %L', 'closed', b), null, '23514');
  perform pg_temp.expect_err(format('update public.tickets set topic = %L where id = %L', 'admin', b), null, '23514');
end $$;

-- ── 10b. A blank closing note is no note (R21) ────────────────────────────
do $$ begin
  perform set_config('test.td', public.open_ticket('00000000-0000-4000-8000-0000000c3005', 'other',
    'A second question here', 'Asking a second thing, which the Keeper will just close.')::text, true);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.k'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.keeper_close_ticket(current_setting('test.td')::uuid, 'resolved', E'  \n\t  ');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare d uuid := current_setting('test.td')::uuid;
begin
  if not exists (select 1 from public.tickets where id = d and status = 'closed' and close_reason = 'resolved') then
    raise exception 'FAIL: the blank-note close did not close the ticket';
  end if;
  if (select count(*) from public.ticket_messages where ticket_id = d) <> 1 then
    raise exception 'FAIL: a blank closing note was added as a message';
  end if;
  if (select member_seen_at from public.tickets where id = d) is null then
    raise exception 'FAIL: a blank closing note should count as no note: seen at once';
  end if;
  if exists (select 1 from public.notifications where user_id = '00000000-0000-4000-8000-0000000c3005' and kind = 'ticket_closed') then
    raise exception 'FAIL: a blank closing note notified the member';
  end if;
end $$;

-- ── 10c. A close with no note never hides an unread keeper reply (R21b) ───
-- M's tb is answered and M has not opened it. T's te is answered and T read it, at a
-- known time. Both are then closed with no note. The waiting cases are L's dismissed
-- ticket (section 4) and T's td (10b): both seen, so neither ever reaches the banner.
do $$ begin
  perform set_config('test.te', public.open_ticket('00000000-0000-4000-8000-0000000c3005', 'other',
    'A third question here', 'Asking a third thing, which I will read before it is closed.')::text, true);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.k'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.keeper_reply_ticket(current_setting('test.te')::uuid, 'Here is the answer to the third one.');
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000c3005","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.mark_ticket_seen(current_setting('test.te')::uuid);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
-- now() is one value for the whole transaction, so give T's read a time of its own:
-- otherwise "left alone" and "set to now()" would look the same.
update public.tickets set member_seen_at = '2026-01-02T03:04:05Z'
 where id = current_setting('test.te')::uuid and member_seen_at is not null;
do $$ begin
  if not exists (select 1 from public.tickets where id = current_setting('test.tb')::uuid and status = 'answered' and member_seen_at is null) then
    raise exception 'FAIL: setup: tb should be answered and unread';
  end if;
  if not exists (select 1 from public.tickets where id = current_setting('test.te')::uuid and status = 'answered'
                   and member_seen_at = '2026-01-02T03:04:05Z') then
    raise exception 'FAIL: setup: te should be answered and read';
  end if;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.k'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.keeper_close_ticket(current_setting('test.tb')::uuid, 'resolved');
  perform public.keeper_close_ticket(current_setting('test.te')::uuid, 'dismissed', null);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  b uuid := current_setting('test.tb')::uuid;
  e uuid := current_setting('test.te')::uuid;
begin
  -- Replied, then closed with no note before the member looked: still unseen, so the
  -- banner still shows the reply (spec Goal 4).
  if not exists (select 1 from public.tickets where id = b and status = 'closed' and close_reason = 'resolved' and member_seen_at is null) then
    raise exception 'FAIL: closing with no note hid a keeper reply the member had not read';
  end if;
  -- Answered and read, then closed with no note: stays read, at the time it was read.
  if not exists (select 1 from public.tickets where id = e and status = 'closed' and close_reason = 'dismissed'
                   and member_seen_at = '2026-01-02T03:04:05Z') then
    raise exception 'FAIL: closing a read answer with no note changed when it was seen: %',
      (select member_seen_at from public.tickets where id = e);
  end if;
  -- Neither close added a message.
  if (select count(*) from public.ticket_messages where ticket_id in (b, e)) <> 4 then
    raise exception 'FAIL: a close with no note added a message';
  end if;
end $$;

-- ── 11. Deleting a ticket deletes its queue tasks (R29); an orphan can still go ──
-- L's second ticket is still waiting with an open task. Deleting the ticket as the
-- owner (postgres) cascades its messages, and its AFTER DELETE trigger removes its
-- tasks: keeper_tasks has no foreign key to tickets, so without it the task would be
-- left pointing at nothing. L's first ticket is the live control.
do $$
declare
  gone uuid := split_part(current_setting('test.l_tickets'), ',', 2)::uuid;
  live uuid := split_part(current_setting('test.l_tickets'), ',', 1)::uuid;
  live_task uuid;
  orphan uuid;
  r text;
begin
  if not exists (select 1 from public.keeper_tasks where type = 'ticket' and target_id = gone and status = 'open') then
    raise exception 'FAIL: setup: the ticket to delete has no open task';
  end if;
  select id into live_task from public.keeper_tasks where type = 'ticket' and target_id = live and status = 'open';
  if live_task is null then raise exception 'FAIL: setup: the live ticket has no open task'; end if;

  delete from public.tickets where id = gone;
  if exists (select 1 from public.tickets where id = gone) or exists (select 1 from public.ticket_messages where ticket_id = gone) then
    raise exception 'FAIL: deleting the ticket did not delete it and its messages';
  end if;
  if exists (select 1 from public.keeper_tasks where type = 'ticket' and target_id = gone) then
    raise exception 'FAIL: deleting a ticket left its keeper task behind';
  end if;
  if not exists (select 1 from public.keeper_tasks where id = live_task and status = 'open') then
    raise exception 'FAIL: deleting one ticket touched another ticket''s task';
  end if;

  -- The trigger function is internal: no client role, no PUBLIC.
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.ticket_delete_tasks()', 'execute') then
      raise exception 'FAIL: % can execute ticket_delete_tasks', r;
    end if;
  end loop;
  if exists (select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = 'public.ticket_delete_tasks()'::regprocedure and a.grantee = 0) then
    raise exception 'FAIL: PUBLIC can execute ticket_delete_tasks';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.ticket_delete_tasks()'::regprocedure and prosecdef
                   and proconfig @> array['search_path=""']) then
    raise exception 'FAIL: ticket_delete_tasks must be SECURITY DEFINER with an empty search_path';
  end if;

  -- A ticket task whose ticket is already gone (from before the trigger, or a hand edit)
  -- can still be cleared from the queue: the orphan branch stays.
  orphan := public.create_keeper_task('ticket', 'ticket:rehearsal-orphan', 'ticket', gen_random_uuid(),
    jsonb_build_object('topic', 'other', 'subject', 'Gone', 'handle', 'nobody'), 0::smallint);
  perform set_config('test.orphan_task', orphan::text, true);
  perform set_config('test.live_task', live_task::text, true);
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.k'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare orphan text := current_setting('test.orphan_task'); live text := current_setting('test.live_task');
begin
  -- A task whose ticket still exists: dismiss is refused like every generic action.
  perform pg_temp.expect_err(format('select public.resolve_keeper_task(%L, %L)', live, 'dismiss'), 'use_ticket_actions', 'HW012');
  perform pg_temp.expect_err(format('select public.resolve_keeper_task(%L, %L)', live, 'done'), 'use_ticket_actions', 'HW012');
  -- An orphan: only dismiss gets through.
  perform pg_temp.expect_err(format('select public.resolve_keeper_task(%L, %L)', orphan, 'done'), 'use_ticket_actions', 'HW012');
  perform pg_temp.expect_err(format('select public.resolve_keeper_task(%L, %L)', orphan, 'snooze'), 'use_ticket_actions', 'HW012');
  perform public.resolve_keeper_task(orphan::uuid, 'dismiss');
  perform pg_temp.expect_err(format('select public.resolve_keeper_task(%L, %L)', orphan, 'dismiss'), 'not_open', 'HW011');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare orphan uuid := current_setting('test.orphan_task')::uuid; live uuid := current_setting('test.live_task')::uuid;
begin
  if not exists (select 1 from public.keeper_tasks where id = orphan and status = 'dismissed' and resolution = 'dismiss'
                   and resolved_by = current_setting('test.k')::uuid and resolved_at is not null) then
    raise exception 'FAIL: the orphan task was not dismissed by the keeper';
  end if;
  if not exists (select 1 from public.keeper_tasks where id = live and status = 'open') then
    raise exception 'FAIL: a refused dismiss changed a live ticket task';
  end if;
  if (select count(*) from public.mod_actions where action = 'keeper_task_resolved' and target_type = 'keeper_task' and target_id = orphan
        and metadata = jsonb_build_object('type', 'ticket', 'action', 'dismiss')) <> 1 then
    raise exception 'FAIL: dismissing the orphan task was not logged';
  end if;
end $$;

-- ── 11b. Erasing a member erases their tickets' queue tasks (R29) ─────────
-- "Erase everything": L's account is deleted the way the dashboard or delete_member
-- does it. The auth user goes, the profile cascades, the profile's tickets cascade, and
-- each ticket's trigger removes its tasks, open or already dismissed.
do $$
declare
  l uuid := '00000000-0000-4000-8000-0000000c3003';
  ids uuid[] := string_to_array(current_setting('test.l_tickets'), ',')::uuid[];
  n int;
begin
  select count(*) into n from public.keeper_tasks where type = 'ticket' and target_id = any(ids);
  if n < 2 then raise exception 'FAIL: setup: expected L''s tickets to have at least 2 tasks, got %', n; end if;
  delete from auth.users where id = l;
  if exists (select 1 from public.profiles where id = l) then raise exception 'FAIL: setup: L''s profile survived'; end if;
  if exists (select 1 from public.tickets where user_id = l or id = any(ids)) then
    raise exception 'FAIL: deleting the member left tickets behind';
  end if;
  select count(*) into n from public.keeper_tasks where type = 'ticket' and target_id = any(ids);
  if n <> 0 then raise exception 'FAIL: deleting the member left % keeper task(s) for their tickets', n; end if;
  -- Nobody else's went with them.
  if not exists (select 1 from public.keeper_tasks where id = current_setting('test.t1_task2')::uuid) then
    raise exception 'FAIL: deleting one member removed another member''s ticket task';
  end if;
end $$;

-- ── 12. No new site reports (R31) ─────────────────────────────────────────
-- Support requests are tickets now and nothing reads a site report, so the reports
-- insert policy refuses one. Every other report is filed as before, as yourself only.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.o'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare o text := current_setting('test.o');
begin
  perform pg_temp.expect_err(format('insert into public.reports (reporter_id, target_type, category, details) values (%L, %L, %L, %L)',
    o, 'site', 'other', 'Rehearsal: the site is broken.'), null, '42501');
  insert into public.reports (reporter_id, target_type, target_id, category, details)
  values (o::uuid, 'post', gen_random_uuid(), 'spam', 'Rehearsal: a post report is still allowed.');
  perform pg_temp.expect_err(format('insert into public.reports (reporter_id, target_type, target_id, category) values (%L, %L, %L, %L)',
    current_setting('test.m'), 'post', gen_random_uuid(), 'spam'), null, '42501');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select count(*) from public.reports where reporter_id = current_setting('test.o')::uuid
        and target_type = 'post' and details = 'Rehearsal: a post report is still allowed.') <> 1 then
    raise exception 'FAIL: the post report was not filed';
  end if;
  if exists (select 1 from public.reports where details = 'Rehearsal: the site is broken.') then
    raise exception 'FAIL: a site report was filed';
  end if;
end $$;

select 'ALL PASS' as result, current_setting('test.moved', true) as support_reports_moved,
       current_setting('test.pre_log_seen', true) as pre_existing_log_row_kept,
       current_setting('test.s_self_backdate', true) as profile_backdate;

rollback;
