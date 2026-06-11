-- Moderation Phase 1 RPCs (2026-06-10). Keeper-only, SECURITY DEFINER,
-- each writes a public.mod_actions audit row atomically.

create or replace function public.set_mod_role(p_target uuid, p_role text, p_scope text default 'all')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role text;
  v_old_role text;
  v_scope text;
  v_found boolean;
begin
  select mod_role into v_actor_role from public.profiles where id = v_actor;
  if v_actor_role is distinct from 'keeper' then
    raise exception 'Only a Keeper may assign roles' using errcode = '42501';
  end if;
  if p_target = v_actor then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('sentinel','moderator','warden') then
    raise exception 'Invalid role: %', p_role using errcode = '22023';
  end if;
  v_scope := coalesce(p_scope, 'all');
  if v_scope not in ('all','forum','library') then
    raise exception 'Invalid scope: %', v_scope using errcode = '22023';
  end if;
  if p_role is null or p_role = 'warden' then
    v_scope := 'all';  -- wardens & cleared roles are always global
  end if;

  select mod_role, true into v_old_role, v_found from public.profiles where id = p_target;
  if not coalesce(v_found, false) then
    raise exception 'No such user' using errcode = 'P0002';
  end if;

  update public.profiles set mod_role = p_role, mod_scope = v_scope where id = p_target;

  insert into public.mod_actions (actor_id, action, target_type, target_user_id, metadata)
  values (
    v_actor,
    case when p_role is null then 'revoke_role' else 'assign_role' end,
    'user', p_target,
    jsonb_build_object('old_role', v_old_role, 'new_role', p_role, 'scope', v_scope)
  );
end;
$$;

create or replace function public.set_role_badge(p_role text, p_emoji text, p_label text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role text;
  v_found boolean;
begin
  select mod_role into v_actor_role from public.profiles where id = v_actor;
  if v_actor_role is distinct from 'keeper' then
    raise exception 'Only a Keeper may edit badges' using errcode = '42501';
  end if;
  if p_role not in ('sentinel','moderator','warden','keeper') then
    raise exception 'Invalid role: %', p_role using errcode = '22023';
  end if;

  update public.mod_role_badges set emoji = p_emoji, label = p_label where role = p_role
  returning true into v_found;
  if not coalesce(v_found, false) then
    raise exception 'No such badge role' using errcode = 'P0002';
  end if;

  insert into public.mod_actions (actor_id, action, target_type, metadata)
  values (v_actor, 'edit_badge', 'badge',
          jsonb_build_object('role', p_role, 'emoji', p_emoji, 'label', p_label));
end;
$$;

revoke all on function public.set_mod_role(uuid, text, text)   from public, anon;
revoke all on function public.set_role_badge(text, text, text) from public, anon;
grant execute on function public.set_mod_role(uuid, text, text)   to authenticated;
grant execute on function public.set_role_badge(text, text, text) to authenticated;
