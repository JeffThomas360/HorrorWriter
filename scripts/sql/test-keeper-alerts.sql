-- Behaviour test for 20261028000000_keeper_alerts.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
-- Before merge: powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-keeper-alerts.sql -Migration supabase/migrations/20261028000000_keeper_alerts.sql
-- Local dev points at PRODUCTION, so only run it this way.
--
-- How it proves the send path without sending anything: keeper_dispatch() hands
-- the request to pg_net by inserting into net.http_request_queue. That insert is
-- uncommitted here and rolls back, so the pg_net worker never sees it. Every
-- request this script makes carries the fake key 'rehearsal-key' to a ".invalid"
-- host, so even a leak could not reach the Edge Function. Warnings (missing
-- Vault secrets, swallowed failures) are not shown by the CLI, so each case is
-- asserted on the queue instead.
begin;

create function pg_temp.queued(p_url_suffix text) returns bigint language sql as $f$
  select count(*) from net.http_request_queue
  where headers->>'Authorization' = 'Bearer rehearsal-key' and url like '%' || p_url_suffix
$f$;

create function pg_temp.queued_kind(p_kind text) returns bigint language sql as $f$
  select count(*) from net.http_request_queue
  where headers->>'Authorization' = 'Bearer rehearsal-key' and url like '%/send-keeper-alert'
    and convert_from(body, 'utf8')::jsonb->>'kind' = p_kind
$f$;

-- ── 1. No Vault secrets: completes quietly and sends nothing ───────────────
-- The test role cannot delete from vault.secrets, so this only runs while the real secrets
-- are not set yet (true until Jeff does the one-time setup). Afterwards it is skipped, noisily.
do $$
declare have_any boolean := exists (select 1 from vault.secrets where name in ('hw_project_url', 'hw_service_role_key'));
begin
  perform set_config('test.had_secrets', have_any::text, true);
  if have_any then
    raise notice 'Vault secrets already set: skipping the no-secrets and half-set cases';
    return;
  end if;

  perform public.keeper_dispatch('send-keeper-alert', '{}'::jsonb);
  perform public.keeper_dispatch('rehearsal-marker-none', '{"kind":"signup"}'::jsonb);
  if (select count(*) from net.http_request_queue where url like '%rehearsal-marker-none') <> 0 then
    raise exception 'FAIL: keeper_dispatch queued a request with no Vault secrets';
  end if;

  -- Only one of the two set is still "missing".
  perform vault.create_secret('https://rehearsal.invalid', 'hw_project_url');
  perform public.keeper_dispatch('rehearsal-marker-half', '{}'::jsonb);
  if (select count(*) from net.http_request_queue where url like '%rehearsal-marker-half') <> 0 then
    raise exception 'FAIL: keeper_dispatch queued a request with only hw_project_url set';
  end if;
end $$;

-- ── 2. Both secrets: one POST, right URL, key and body ─────────────────────
-- Set (or, if real ones exist, temporarily overwrite -- this rolls back) the two secrets to fakes.
-- A trailing slash on the URL must not double up.
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
do $$
declare q record;
begin
  perform public.keeper_dispatch('rehearsal-marker-sent', '{"kind":"signup","handle":"ash-1a2b"}'::jsonb);
  if pg_temp.queued('rehearsal-marker-sent') <> 1 then
    raise exception 'FAIL: expected exactly 1 queued request, got %', pg_temp.queued('rehearsal-marker-sent');
  end if;
  select * into q from net.http_request_queue where url like '%rehearsal-marker-sent';
  if q.url <> 'https://rehearsal.invalid/functions/v1/rehearsal-marker-sent' then
    raise exception 'FAIL: wrong URL %', q.url;
  end if;
  if q.method <> 'POST' then raise exception 'FAIL: method is %', q.method; end if;
  if q.headers->>'Authorization' <> 'Bearer rehearsal-key' then raise exception 'FAIL: wrong Authorization header'; end if;
  if q.headers->>'Content-Type' <> 'application/json' then raise exception 'FAIL: wrong Content-Type'; end if;
  if convert_from(q.body, 'utf8')::jsonb <> '{"kind":"signup","handle":"ash-1a2b"}'::jsonb then
    raise exception 'FAIL: wrong body %', convert_from(q.body, 'utf8');
  end if;
end $$;

-- ── 3. A failing dispatch never raises ─────────────────────────────────────
do $$
begin
  perform public.keeper_dispatch(null, '{}'::jsonb);   -- null URL: pg_net rejects it, we swallow it
  perform public.keeper_dispatch('rehearsal-marker-nullbody', null);
end $$;

-- ── 4. Signup alerts (secrets set, so each alert shows up in the queue) ────
-- Confirmed at insert (the Google path): profile exists, one 'signup' push with its handle.
insert into auth.users (id, email, aud, role, instance_id, email_confirmed_at) values
  ('00000000-0000-4000-8000-00000000a101', 'alert-confirmed@example.test', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', now());
do $$
declare
  v_handle text;
  n integer;
  q record;
begin
  select handle into v_handle from public.profiles where id = '00000000-0000-4000-8000-00000000a101';
  if v_handle is null then raise exception 'FAIL: profile row missing after a confirmed insert'; end if;

  select count(*) into n from auth.users where email_confirmed_at > now() - interval '1 hour';
  if n <= 10 then
    if pg_temp.queued('/send-keeper-alert') <> 1 then
      raise exception 'FAIL: a confirmed insert should queue exactly 1 alert, got %', pg_temp.queued('/send-keeper-alert');
    end if;
    select * into q from net.http_request_queue
      where headers->>'Authorization' = 'Bearer rehearsal-key' and url like '%/send-keeper-alert';
    if q.url <> 'https://rehearsal.invalid/functions/v1/send-keeper-alert' then raise exception 'FAIL: wrong alert URL %', q.url; end if;
    if convert_from(q.body, 'utf8')::jsonb <> jsonb_build_object('kind', 'signup', 'handle', v_handle) then
      raise exception 'FAIL: wrong signup body %', convert_from(q.body, 'utf8');
    end if;
    raise notice 'confirmed-insert alert queued with handle %', v_handle;
  else
    raise notice 'production already has % confirmed accounts in the last hour; skipping the exact-alert check', n;
  end if;
end $$;

-- Unconfirmed insert (the email path): profile exists, nothing sent yet.
-- Then confirming it sends one alert; touching it again does not send another.
do $$
declare
  c0 bigint := pg_temp.queued('/send-keeper-alert');
  c1 bigint;
  n integer;
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    ('00000000-0000-4000-8000-00000000a102', 'alert-unconfirmed@example.test', 'authenticated', 'authenticated',
     '00000000-0000-0000-0000-000000000000');
  if not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000a102') then
    raise exception 'FAIL: profile row missing after an unconfirmed insert';
  end if;
  if pg_temp.queued('/send-keeper-alert') <> c0 then
    raise exception 'FAIL: an unconfirmed signup queued an alert';
  end if;

  update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-00000000a102';
  c1 := pg_temp.queued('/send-keeper-alert');
  select count(*) into n from auth.users where email_confirmed_at > now() - interval '1 hour';
  if n <= 10 and c1 <> c0 + 1 then
    raise exception 'FAIL: confirming should queue 1 alert (n=%), queued %', n, c1 - c0;
  end if;

  update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-00000000a102';
  update auth.users set email = 'alert-unconfirmed2@example.test' where id = '00000000-0000-4000-8000-00000000a102';
  if pg_temp.queued('/send-keeper-alert') <> c1 then
    raise exception 'FAIL: re-confirming or editing a confirmed user queued another alert';
  end if;
end $$;

-- ── 5. Flood guard: <= 10 individual pushes, one surge push at 11, then silence ─
do $$
declare
  n0 integer;
  i integer;
  signups0 bigint := pg_temp.queued_kind('signup');
  surges0 bigint := pg_temp.queued_kind('signup_surge');
  want_signups integer;
  want_surges integer;
begin
  select count(*) into n0 from auth.users where email_confirmed_at > now() - interval '1 hour';
  if n0 >= 12 then
    raise notice 'production already has % confirmed accounts in the last hour; skipping the flood-guard check', n0;
    return;
  end if;
  -- Bring the hour's confirmed accounts up to 12. Accounts numbered n0+1 .. 10 get their own push,
  -- #11 gets the one surge push, #12 gets nothing.
  for i in 1..(12 - n0) loop
    insert into auth.users (id, email, aud, role, instance_id, email_confirmed_at)
    values (gen_random_uuid(), 'alert-flood-' || i || '@example.test', 'authenticated', 'authenticated',
            '00000000-0000-0000-0000-000000000000', now());
  end loop;
  want_signups := greatest(0, 10 - n0);
  want_surges := case when n0 < 11 then 1 else 0 end;
  if pg_temp.queued_kind('signup') - signups0 <> want_signups then
    raise exception 'FAIL: expected % signup pushes, got % (n0=%)', want_signups, pg_temp.queued_kind('signup') - signups0, n0;
  end if;
  if pg_temp.queued_kind('signup_surge') - surges0 <> want_surges then
    raise exception 'FAIL: expected % surge pushes, got % (n0=%)', want_surges, pg_temp.queued_kind('signup_surge') - surges0, n0;
  end if;
  raise notice 'flood guard ok: n0=%, signups=%, surges=%', n0, want_signups, want_surges;
end $$;

-- ── 6. Storm alerts now reach the dispatcher ───────────────────────────────
-- Eight reports on one target inside the window trip check_for_storm (via the report trigger).
do $$
declare
  t uuid := '00000000-0000-4000-8000-00000000a201';
  i integer;
  q record;
begin
  for i in 1..8 loop
    insert into public.reports (reporter_id, target_type, target_id, category) values (null, 'thread', t, 'spam');
  end loop;
  if not exists (select 1 from public.storm_alerts where target_type = 'thread' and target_id = t) then
    raise exception 'FAIL: 8 reports did not record a storm_alerts row';
  end if;
  if pg_temp.queued('/send-storm-alert') <> 1 then
    raise exception 'FAIL: expected exactly 1 storm dispatch, got %', pg_temp.queued('/send-storm-alert');
  end if;
  select * into q from net.http_request_queue
    where headers->>'Authorization' = 'Bearer rehearsal-key' and url like '%/send-storm-alert';
  if q.url <> 'https://rehearsal.invalid/functions/v1/send-storm-alert' then raise exception 'FAIL: wrong storm URL %', q.url; end if;
  if convert_from(q.body, 'utf8')::jsonb <> jsonb_build_object(
       'targetType', 'thread', 'targetId', t, 'reportCount', 8, 'replyCount', 0) then
    raise exception 'FAIL: wrong storm body %', convert_from(q.body, 'utf8');
  end if;

  -- A ninth report in the same window updates the row but does not alert again.
  insert into public.reports (reporter_id, target_type, target_id, category) values (null, 'thread', t, 'spam');
  if pg_temp.queued('/send-storm-alert') <> 1 then
    raise exception 'FAIL: a repeat report in the same window sent another storm alert';
  end if;
end $$;

-- ── 7. Privileges ──────────────────────────────────────────────────────────
do $$
declare r text; f text;
begin
  foreach f in array array['public.keeper_dispatch(text, jsonb)', 'public.notify_new_signup()', 'public.check_for_storm(text, uuid)'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'execute') then
        raise exception 'FAIL: % can execute %', r, f;
      end if;
    end loop;
    if exists (
      select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = f::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) then
      raise exception 'FAIL: PUBLIC can execute %', f;
    end if;
  end loop;
end $$;

-- The trigger is attached and sorts after the profile trigger.
do $$
begin
  if (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_signup_alert' and not tgisinternal) <> 1 then
    raise exception 'FAIL: on_auth_user_signup_alert is not attached to auth.users';
  end if;
  if 'on_auth_user_signup_alert' < 'on_auth_user_created' then
    raise exception 'FAIL: trigger name sorts before on_auth_user_created';
  end if;
end $$;

select 'ALL PASS' as result;
rollback;
