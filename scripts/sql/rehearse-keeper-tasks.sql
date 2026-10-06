-- Rehearsal for 20261005000000_keeper_tasks.sql. Runs AFTER the migration body,
-- in the same transaction, and ends in ROLLBACK. Every `do` block raises on
-- failure, so a clean run means every check passed.

do $$
declare keeper uuid; a uuid; b uuid; t uuid; n int;
begin
  select id into keeper from public.profiles where mod_role = 'keeper' limit 1;
  if keeper is null then raise exception 'rehearsal needs a keeper profile'; end if;

  -- dedupe: same key twice -> same id, one row
  a := public.create_keeper_task('manual', 'rehearsal:k1', null, null, '{"title":"x"}'::jsonb, 0::smallint);
  b := public.create_keeper_task('manual', 'rehearsal:k1', null, null, '{"title":"y"}'::jsonb, 0::smallint);
  if a is distinct from b then raise exception 'dedupe returned two ids'; end if;
  select count(*) into n from public.keeper_tasks where dedupe_key = 'rehearsal:k1';
  if n <> 1 then raise exception 'dedupe made % rows', n; end if;

  -- act as the keeper
  perform set_config('request.jwt.claims', json_build_object('sub', keeper, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.keeper_tasks;
  if n < 1 then raise exception 'keeper cannot read tasks'; end if;

  -- resolve, then a second resolve must fail not_open
  perform public.resolve_keeper_task(a, 'done', 'rehearsal');
  begin
    perform public.resolve_keeper_task(a, 'done');
    raise exception 'second resolve should have failed';
  exception when sqlstate 'HW011' then null; end;

  -- resolved task is not reopened by a repeat create
  reset role;
  b := public.create_keeper_task('manual', 'rehearsal:k1');
  if b is distinct from a then raise exception 'repeat create returned a different id'; end if;
  if (select status from public.keeper_tasks where id = a) <> 'resolved' then
    raise exception 'resolved task was reopened';
  end if;

  -- unknown action
  perform set_config('request.jwt.claims', json_build_object('sub', keeper, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := public.keeper_add_task('Rehearsal to-do', 'body');
  begin
    perform public.resolve_keeper_task(t, 'nonsense');
    raise exception 'unknown action should have failed';
  exception when sqlstate 'HW012' then null; end;

  -- snooze bounds
  begin perform public.snooze_keeper_task(t, now() - interval '1 hour'); raise exception 'past snooze accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.snooze_keeper_task(t, now() + interval '31 days'); raise exception '31-day snooze accepted';
  exception when sqlstate '22023' then null; end;
  perform public.snooze_keeper_task(t, now() + interval '1 day');

  -- bad title
  begin perform public.keeper_add_task('   '); raise exception 'blank title accepted';
  exception when sqlstate '22023' then null; end;

  -- auto-close
  reset role;
  perform public.create_keeper_task('rehearsal_type', 'rehearsal:k2', 'story', gen_random_uuid(), '{}'::jsonb, 0::smallint);
  update public.keeper_tasks set target_id = '00000000-0000-0000-0000-000000000001' where dedupe_key = 'rehearsal:k2';
  if public.close_keeper_tasks_for('rehearsal_type', '00000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'auto-close did not close exactly one';
  end if;
end $$;

-- A non-keeper must be refused everything. Uses a real ordinary profile if the
-- database has one; otherwise a random uuid with no profile (mod_can must refuse
-- that too). Either way the block executes and asserts refusal.
do $$
declare plain uuid; n int;
begin
  select id into plain from public.profiles where mod_role is null limit 1;
  if plain is null then
    plain := gen_random_uuid();
    raise notice 'non-keeper check: no ordinary profile, using profile-less uuid';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', plain, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.keeper_add_task('nope'); raise exception 'non-keeper add accepted';
  exception when sqlstate '42501' then null; end;
  begin perform public.resolve_keeper_task(gen_random_uuid(), 'done'); raise exception 'non-keeper resolve accepted';
  exception when sqlstate '42501' then null; end;
  select count(*) into n from public.keeper_tasks;
  if n <> 0 then raise exception 'non-keeper can read % tasks', n; end if;
  reset role;
  raise notice 'non-keeper check ran: refused';
  perform set_config('rehearsal.checks', coalesce(current_setting('rehearsal.checks', true), '') || 'non-keeper;', true);
end $$;

-- Logged-out visitors: EXECUTE revoked, and no readable rows.
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.keeper_add_task('nope'); raise exception 'anon add accepted';
  exception when sqlstate '42501' then null; end;
  begin
    select count(*) into n from public.keeper_tasks;
    if n <> 0 then raise exception 'anon can read % tasks', n; end if;
  exception when sqlstate '42501' then null; end;  -- no SELECT grant is also a refusal
  reset role;
  raise notice 'anon check ran: refused';
  perform set_config('rehearsal.checks', coalesce(current_setting('rehearsal.checks', true), '') || 'anon;', true);
end $$;

-- A moderator (any mod tier below keeper) must be refused too.
do $$
declare m uuid; n int;
begin
  select id into m from public.profiles where mod_role in ('sentinel', 'moderator', 'warden') limit 1;
  if m is null then
    raise notice 'moderator check skipped: no moderator profile';
    perform set_config('rehearsal.checks', coalesce(current_setting('rehearsal.checks', true), '') || 'moderator-SKIPPED;', true);
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.keeper_add_task('nope'); raise exception 'moderator add accepted';
  exception when sqlstate '42501' then null; end;
  select count(*) into n from public.keeper_tasks;
  if n <> 0 then raise exception 'moderator can read % tasks', n; end if;
  reset role;
  raise notice 'moderator check ran: refused';
  perform set_config('rehearsal.checks', coalesce(current_setting('rehearsal.checks', true), '') || 'moderator;', true);
end $$;

-- service_role-only functions must be closed to authenticated callers.
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_keeper_task('manual', 'rehearsal:denied'); raise exception 'authenticated create_keeper_task accepted';
  exception when sqlstate '42501' then null; end;
  begin perform public.close_keeper_tasks_for('manual', gen_random_uuid()); raise exception 'authenticated close_keeper_tasks_for accepted';
  exception when sqlstate '42501' then null; end;
  reset role;
  raise notice 'service_role-only check ran: refused';
  perform set_config('rehearsal.checks', coalesce(current_setting('rehearsal.checks', true), '') || 'service_role-only;', true);
end $$;

-- `checks` is the proof the refusal blocks executed (notices are not shown by the CLI).
select 'rehearsal passed' as result, current_setting('rehearsal.checks', true) as checks;
