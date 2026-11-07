-- Behaviour test for 20261108000000_logged_sanctions.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
--   & .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-sanctions.sql -Migration supabase\migrations\20261108000000_logged_sanctions.sql
--
-- Every actor is a throwaway account (...c40xx), so no real profile is ever sanctioned.
begin;

-- ── Helpers (session-temporary) ────────────────────────────────────────────
-- p_sql must raise p_key, and p_state when given. Runs as whatever role is current.
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

create function pg_temp.must(p_ok boolean, p_what text)
returns void language plpgsql as $f$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_what; end if;
end $f$;

-- Act as a signed-in member, the way PostgREST does. Null = back to the admin role this
-- script started with (the CLI's login role is not necessarily postgres).
select set_config('test.admin_role', current_user, true);
create function pg_temp.be(p_id uuid)
returns void language plpgsql as $f$
begin
  if p_id is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('role', current_setting('test.admin_role'), true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $f$;

grant execute on function pg_temp.expect_err(text, text, text) to authenticated, anon;
grant execute on function pg_temp.must(boolean, text)          to authenticated, anon;
grant execute on function pg_temp.be(uuid)                     to authenticated, anon;

-- ── Actors ─────────────────────────────────────────────────────────────────
-- As the admin role, no JWT: handle_new_user gives each a profile, and the escalation
-- trigger lets a caller with no auth.uid() set the roles.
insert into auth.users (id, email, aud, role, instance_id, created_at) values
  ('00000000-0000-4000-8000-0000000c4001', 'sanctions-keeper@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c4002', 'sanctions-warden@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c4003', 'sanctions-moderator@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c4004', 'sanctions-sentinel@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c4005', 'sanctions-member@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c4006', 'sanctions-target@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());

update public.profiles set mod_role = 'keeper',    mod_scope = 'all' where id = '00000000-0000-4000-8000-0000000c4001';
update public.profiles set mod_role = 'warden',    mod_scope = 'all' where id = '00000000-0000-4000-8000-0000000c4002';
update public.profiles set mod_role = 'moderator', mod_scope = 'all' where id = '00000000-0000-4000-8000-0000000c4003';
update public.profiles set mod_role = 'sentinel',  mod_scope = 'all' where id = '00000000-0000-4000-8000-0000000c4004';

do $$
declare
  k uuid := '00000000-0000-4000-8000-0000000c4001';
  w uuid := '00000000-0000-4000-8000-0000000c4002';
  m uuid := '00000000-0000-4000-8000-0000000c4003';
  s uuid := '00000000-0000-4000-8000-0000000c4004';
  a uuid := '00000000-0000-4000-8000-0000000c4005';
  t uuid := '00000000-0000-4000-8000-0000000c4006';
  who uuid;
  n integer;
  v_until timestamptz;
  v_perm  timestamptz;
  r record;
  pub record;
  denied constant text := 'permission denied: suspending or banning requires Warden access';
  log_hide uuid;
begin
  perform pg_temp.must((select count(*) from public.profiles where id in (k, w, m, s, a, t)) = 6, 'six throwaway profiles');

  -- ── 1. Why this exists: a direct write cannot sanction anyone, and says nothing ──
  -- This is what the old buttons did. It must stay a no-op, or the log could be walked around.
  perform pg_temp.be(k);
  update public.profiles set banned_until = now() + interval '1 day' where id = t;
  get diagnostics n = row_count;
  perform pg_temp.must(n = 0, 'a direct UPDATE of another member, even by a keeper, should match no rows');
  perform pg_temp.expect_err(
    format('update public.profiles set banned_until = now() + interval ''1 day'' where id = %L', k),
    'permission denied: cannot change sanctions on your own profile', '42501');
  perform pg_temp.be(null);
  perform pg_temp.must((select banned_until from public.profiles where id = t) is null, 'the direct UPDATE left the target unsanctioned');

  -- ── 2. Who may call ──────────────────────────────────────────────────────
  perform pg_temp.must(not has_function_privilege('anon', 'public.mod_apply_sanction(uuid,integer,text)', 'execute'), 'anon cannot apply');
  perform pg_temp.must(not has_function_privilege('anon', 'public.mod_revoke_sanction(uuid,text)', 'execute'), 'anon cannot revoke');
  perform pg_temp.must(has_function_privilege('authenticated', 'public.mod_apply_sanction(uuid,integer,text)', 'execute'), 'authenticated can call apply');
  perform pg_temp.must(has_function_privilege('authenticated', 'public.mod_revoke_sanction(uuid,text)', 'execute'), 'authenticated can call revoke');

  foreach who in array array[m, s, a] loop
    perform pg_temp.be(who);
    perform pg_temp.expect_err(format('select public.mod_apply_sanction(%L, 7, %L)', t, 'no'), denied, '42501');
    perform pg_temp.expect_err(format('select public.mod_revoke_sanction(%L, %L)', t, 'no'), denied, '42501');
  end loop;
  perform pg_temp.be(null);
  perform pg_temp.must((select count(*) from public.mod_actions where target_user_id = t) = 0, 'a refused caller logs nothing');

  -- ── 3. Bad input ─────────────────────────────────────────────────────────
  perform pg_temp.be(w);
  perform pg_temp.expect_err(format('select public.mod_apply_sanction(%L, 7, null)', t), 'A written reason is required', '22023');
  perform pg_temp.expect_err(format('select public.mod_apply_sanction(%L, 7, %L)', t, '   '), 'A written reason is required', '22023');
  perform pg_temp.expect_err(format('select public.mod_apply_sanction(%L, 0, %L)', t, 'x'), 'A suspension must last between 1 and 365 days', '22023');
  perform pg_temp.expect_err(format('select public.mod_apply_sanction(%L, 366, %L)', t, 'x'), 'A suspension must last between 1 and 365 days', '22023');
  perform pg_temp.expect_err(format('select public.mod_apply_sanction(%L, 7, %L)', gen_random_uuid(), 'x'), 'No such user', 'P0002');
  perform pg_temp.expect_err(format('select public.mod_revoke_sanction(%L, %L)', gen_random_uuid(), 'x'), 'No such user', 'P0002');
  perform pg_temp.expect_err(format('select public.mod_revoke_sanction(%L, %L)', t, 'x'), 'This member has no active sanction', '22023');

  -- ── 4. A suspension applies and is logged ────────────────────────────────
  v_until := public.mod_apply_sanction(t, 7, '  Repeated spam  ');
  perform pg_temp.be(null);
  perform pg_temp.must(v_until = now() + interval '7 days', 'suspension runs seven days from now');
  perform pg_temp.must((select banned_until from public.profiles where id = t) = v_until, 'banned_until saved');
  perform pg_temp.must((select ban_reason from public.profiles where id = t) = 'Repeated spam', 'ban_reason saved, trimmed');
  perform pg_temp.must(public.is_banned(t), 'is_banned sees the suspension');

  select * into r from public.mod_actions where target_user_id = t and action = 'suspend';
  perform pg_temp.must(r.actor_id = w, 'suspension logs its actor');
  perform pg_temp.must(r.target_type = 'user' and r.target_id is null, 'suspension row targets the user, with no target_id');
  perform pg_temp.must(r.reason = 'Repeated spam', 'suspension logs its reason');
  perform pg_temp.must(r.metadata->>'days' = '7', 'suspension logs its duration');
  perform pg_temp.must((r.metadata->>'until')::timestamptz = v_until, 'suspension logs its end date');

  -- ── 5. The public ledger shows it happened, not who or why ───────────────
  insert into public.mod_actions (actor_id, action, target_type, target_id, reason)
  values (k, 'hide', 'post', gen_random_uuid(), 'Content reason stays public') returning id into log_hide;
  insert into public.mod_actions (actor_id, action, target_type, target_id, reason)
  values (k, 'ticket_replied', 'ticket', gen_random_uuid(), null);

  perform set_config('role', 'anon', true);
  select * into pub from public.get_transparency_log(10000) l where l.id = r.id;
  perform pg_temp.must(pub.id is not null, 'the suspension is on the public ledger');
  perform pg_temp.must(pub.action = 'suspend' and pub.target_type = 'user' and pub.actor_role = 'warden', 'the ledger names the action and role');
  perform pg_temp.must(pub.target_id is null, 'the ledger gives no member id');
  perform pg_temp.must(pub.reason is null, 'the ledger gives no sanction reason');

  select * into pub from public.get_transparency_log(10000) l where l.id = log_hide;
  perform pg_temp.must(pub.reason = 'Content reason stays public' and pub.target_id is not null, 'content rows are unchanged');
  perform pg_temp.must(not exists (select 1 from public.get_transparency_log(10000) l where l.target_type = 'ticket'), 'ticket rows stay off the ledger');
  perform pg_temp.be(null);

  -- ── 6. The case file reads it: wardens yes, lower roles no ───────────────
  perform pg_temp.be(w);
  perform pg_temp.must((select count(*) from public.mod_actions where target_user_id = t) = 1, 'a warden reads the row');
  perform pg_temp.be(m);
  perform pg_temp.must((select count(*) from public.mod_actions where target_user_id = t) = 0, 'a moderator cannot read the audit trail');

  -- ── 7. A permanent ban replaces it ───────────────────────────────────────
  perform pg_temp.be(w);
  v_perm := public.mod_apply_sanction(t, null, 'Ban evasion');
  perform pg_temp.be(null);
  perform pg_temp.must(v_perm = timestamptz '2099-12-31 23:59:59+00', 'permanent means the 2099 date isPermanentBan reads');
  perform pg_temp.must((select banned_until from public.profiles where id = t) = v_perm, 'permanent banned_until saved');
  select * into r from public.mod_actions where target_user_id = t and action = 'ban';
  perform pg_temp.must(r.actor_id = w and r.reason = 'Ban evasion', 'ban logs actor and reason');
  perform pg_temp.must(r.metadata ? 'days' and r.metadata->>'days' is null, 'ban logs no duration');

  -- ── 8. Revoke clears it and is logged ────────────────────────────────────
  perform pg_temp.be(w);
  perform public.mod_revoke_sanction(t, 'Miscommunication');
  perform pg_temp.be(null);
  perform pg_temp.must((select banned_until from public.profiles where id = t) is null, 'revoke clears banned_until');
  perform pg_temp.must((select ban_reason from public.profiles where id = t) is null, 'revoke clears ban_reason');
  perform pg_temp.must(not public.is_banned(t), 'is_banned sees the revoke');
  select * into r from public.mod_actions where target_user_id = t and action = 'revoke_sanction';
  perform pg_temp.must(r.actor_id = w and r.reason = 'Miscommunication', 'revoke logs actor and reason');
  perform pg_temp.must((r.metadata->>'was_until')::timestamptz = v_perm, 'revoke logs what it lifted');
  perform pg_temp.must((select count(*) from public.mod_actions where target_user_id = t) = 3, 'suspend, ban and revoke are all on file');

  -- ── 9. The escalation rules still hold through the RPCs ──────────────────
  perform pg_temp.be(w);
  perform pg_temp.expect_err(format('select public.mod_apply_sanction(%L, 7, %L)', w, 'x'), 'permission denied: cannot change sanctions on your own profile', '42501');
  perform pg_temp.expect_err(format('select public.mod_apply_sanction(%L, 7, %L)', k, 'x'), 'permission denied: only a Keeper may sanction a Keeper', '42501');
  perform pg_temp.be(null);
  perform pg_temp.must((select count(*) from public.mod_actions where target_user_id in (w, k)) = 0, 'a refused sanction logs nothing');

  -- ── 10. A keeper can sanction a warden ───────────────────────────────────
  perform pg_temp.be(k);
  perform public.mod_apply_sanction(w, 1, 'Overzealous');
  perform pg_temp.be(null);
  perform pg_temp.must((select actor_id from public.mod_actions where target_user_id = w and action = 'suspend') = k, 'the keeper is the logged actor');
end $$;

select 'ALL PASS' as result;

rollback;
