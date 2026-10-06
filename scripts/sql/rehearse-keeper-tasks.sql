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

-- A non-keeper must be refused everything.
do $$
declare plain uuid;
begin
  select id into plain from public.profiles where mod_role is null limit 1;
  if plain is null then return; end if;  -- no ordinary profile to test with
  perform set_config('request.jwt.claims', json_build_object('sub', plain, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.keeper_add_task('nope'); raise exception 'non-keeper add accepted';
  exception when sqlstate '42501' then null; end;
  if (select count(*) from public.keeper_tasks) <> 0 then raise exception 'non-keeper can read tasks'; end if;
end $$;

select 'rehearsal passed' as result;
