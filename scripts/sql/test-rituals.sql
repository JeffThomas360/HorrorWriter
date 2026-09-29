-- Behaviour test for 20260930000000_midnight_ritual.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
-- After merge:  npx supabase db query --linked -f scripts/sql/test-rituals.sql
-- Before merge: powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-rituals.sql -Migration supabase/migrations/20260930000000_midnight_ritual.sql
begin;

do $$ begin
  if to_regclass('public.ritual_prompts') is null then raise exception 'FAIL: ritual_prompts missing'; end if;
end $$;

-- ── Setup (as postgres) ────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-00000000e101', 'ritual-keeper@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e102', 'ritual-a@example.test',      'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e103', 'ritual-b@example.test',      'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e104', 'ritual-banned@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
update public.profiles set mod_role = 'keeper' where id = '00000000-0000-4000-8000-00000000e101';
update public.profiles set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-00000000e104';

-- One released prompt (R) and one pending prompt (P1), inserted directly.
insert into public.ritual_prompts (id, body, status, goes_live_at, source) values
  ('00000000-0000-4000-8000-0000000f0001', 'A released prompt, for testing only.', 'scheduled', now() - interval '1 day', 'keeper'),
  ('00000000-0000-4000-8000-0000000f0002', 'A pending prompt, for testing only.',  'pending',   null,                     'ai');

-- ── Slots: Fridays 03:00 America/New_York, across DST ──────────────────────
do $$ begin
  -- Thu 1 Oct 2026 12:00 UTC -> Fri 2 Oct 03:00 EDT = 07:00 UTC
  if public.ritual_slot_after('2026-10-01 12:00+00') <> '2026-10-02 07:00+00' then
    raise exception 'FAIL: slot after Thu 1 Oct is %', public.ritual_slot_after('2026-10-01 12:00+00'); end if;
  -- Exactly on a slot -> the NEXT week
  if public.ritual_slot_after('2026-10-02 07:00+00') <> '2026-10-09 07:00+00' then
    raise exception 'FAIL: a slot boundary must roll to next week'; end if;
  -- Fri 2 Oct 02:59 EDT -> same day 03:00
  if public.ritual_slot_after('2026-10-02 06:59+00') <> '2026-10-02 07:00+00' then
    raise exception 'FAIL: just before 03:00 should give the same day'; end if;
  -- Across fall-back (1 Nov 2026): Fri 30 Oct slot -> Fri 6 Nov 03:00 EST = 08:00 UTC
  if public.ritual_slot_after('2026-10-30 07:00+00') <> '2026-11-06 08:00+00' then
    raise exception 'FAIL: DST fall-back slot is %', public.ritual_slot_after('2026-10-30 07:00+00'); end if;
end $$;

-- ── anon sees only released prompts ────────────────────────────────────────
set local role anon;
do $$ begin
  if (select count(*) from public.ritual_prompts where id in ('00000000-0000-4000-8000-0000000f0001','00000000-0000-4000-8000-0000000f0002')) <> 1 then
    raise exception 'FAIL: anon must see the released prompt and not the pending one'; end if;
  if public.ritual_next_unlock() is not null then
    raise exception 'FAIL: next unlock should be null with nothing scheduled ahead'; end if;
end $$;
reset role;

-- ── a non-keeper can't manage prompts ──────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e102","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform public.ritual_add_prompt('A prompt from someone who is not a keeper.');
    raise exception 'FAIL: non-keeper added a prompt';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.ritual_prompts where id = '00000000-0000-4000-8000-0000000f0002') then
    raise exception 'FAIL: non-keeper can read a pending prompt'; end if;
end $$;
reset role;

-- ── the keeper queue: add, approve, pack, unschedule, lock, reject ─────────
-- Expected slots, computed as postgres: clients can't call ritual_slot_after.
select set_config('test.slot1', public.ritual_slot_after(now())::text, true),
       set_config('test.slot2', public.ritual_slot_after(public.ritual_slot_after(now()))::text, true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e101","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  p2 uuid; s1 timestamptz; s2 timestamptz;
begin
  p2 := public.ritual_add_prompt('  A keeper-written prompt for the test.  ');
  if (select body from public.ritual_prompts where id = p2) <> 'A keeper-written prompt for the test.' then
    raise exception 'FAIL: added prompt body not trimmed'; end if;

  s1 := public.ritual_approve_prompt('00000000-0000-4000-8000-0000000f0002');
  s2 := public.ritual_approve_prompt(p2);
  if s1 <> current_setting('test.slot1')::timestamptz then raise exception 'FAIL: first approval should take the first free slot'; end if;
  if s2 <> current_setting('test.slot2')::timestamptz then raise exception 'FAIL: second approval should take the following slot'; end if;

  -- Un-scheduling the first moves the second up into its slot.
  perform public.ritual_unschedule_prompt('00000000-0000-4000-8000-0000000f0002');
  if (select goes_live_at from public.ritual_prompts where id = p2) <> s1 then
    raise exception 'FAIL: later prompt did not move up after unschedule'; end if;
  if (select status from public.ritual_prompts where id = '00000000-0000-4000-8000-0000000f0002') <> 'pending' then
    raise exception 'FAIL: unscheduled prompt is not pending'; end if;

  -- A released prompt is locked.
  begin
    perform public.ritual_edit_prompt('00000000-0000-4000-8000-0000000f0001', 'Trying to change a released prompt.');
    raise exception 'FAIL: edited a released prompt';
  exception when sqlstate 'HW010' then null; end;
  begin
    perform public.ritual_unschedule_prompt('00000000-0000-4000-8000-0000000f0001');
    raise exception 'FAIL: unscheduled a released prompt';
  exception when sqlstate 'HW010' then null; end;
  -- Only pending prompts can be rejected.
  begin
    perform public.ritual_reject_prompt(p2);
    raise exception 'FAIL: rejected a scheduled prompt';
  exception when sqlstate 'HW011' then null; end;

  perform public.ritual_edit_prompt('00000000-0000-4000-8000-0000000f0002', 'An edited pending prompt for the test.');
  perform public.ritual_reject_prompt('00000000-0000-4000-8000-0000000f0002');
  if exists (select 1 from public.ritual_prompts where id = '00000000-0000-4000-8000-0000000f0002') then
    raise exception 'FAIL: rejected prompt was not deleted'; end if;

  if (select count(*) from public.mod_actions
      where actor_id = '00000000-0000-4000-8000-00000000e101' and target_type = 'ritual_prompt') < 6 then
    raise exception 'FAIL: keeper actions were not all audited'; end if;
end $$;
reset role;

-- anon: the scheduled-but-future prompt stays invisible; its unlock time does not.
set local role anon;
do $$ begin
  if exists (select 1 from public.ritual_prompts where goes_live_at > now()) then
    raise exception 'FAIL: anon can read a future prompt'; end if;
  if public.ritual_next_unlock() <> current_setting('test.slot1')::timestamptz then
    raise exception 'FAIL: next unlock is wrong'; end if;
end $$;
reset role;

-- ── grants ─────────────────────────────────────────────────────────────────
do $$ begin
  if has_function_privilege('anon', 'public.ritual_add_prompt(text)', 'execute') then
    raise exception 'FAIL: anon can call ritual_add_prompt'; end if;
  if has_function_privilege('authenticated', 'public.ritual_slot_after(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.ritual_repack()', 'execute') then
    raise exception 'FAIL: internal ritual helpers are client-callable'; end if;
end $$;
-- @@TASK3@@

select 'ALL PASS' as result;
rollback;
