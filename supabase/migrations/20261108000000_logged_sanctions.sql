-- Sanctions that really apply, and leave a record.
--
-- The case file's buttons wrote profiles.banned_until straight from the browser. The only
-- UPDATE policy on profiles is "Users can update own profile.", so for anyone else's row the
-- write matched zero rows. PostgREST reports that as success, so the page said "User
-- suspended" and nothing had changed, for every role including Keeper. No suspension or ban
-- has ever taken effect through the UI, and none was ever logged.
--
-- mod_apply_sanction / mod_revoke_sanction replace that write. Each checks mod_can('ban','all'),
-- requires a written reason, and saves the sanction and its mod_actions row together.
--   - Permanent means banned_until = 2099-12-31 (isPermanentBan in src/lib/moderation.js reads
--     that year). Suspensions are capped at 365 days so none can pass for permanent.
--   - prevent_profile_mod_escalation still fires on these updates, so nobody can sanction
--     themselves and only a Keeper can sanction a Keeper.
--   - The RLS policy is left alone: a direct write still can't touch another member's row, so
--     these functions are the only way to sanction anyone from the client.
--
-- Rows use target_type 'user', target_user_id = the member, target_id null, as set_mod_role does.
--
-- Sanction state is private (20261020020000), and get_transparency_log is public, so section 3
-- stops it returning the member's id or the reason on any row whose target is a user. The
-- public ledger shows that a role banned or suspended someone, not who or why.
--
-- Behaviour test: scripts/sql/test-sanctions.sql (rolls back; must print ALL PASS).

-- ── 1. Apply: p_days null = permanent ban ──────────────────────────────────
create function public.mod_apply_sanction(p_user_id uuid, p_days integer, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  v_until  timestamptz;
begin
  if not public.mod_can('ban', 'all') then
    raise exception 'permission denied: suspending or banning requires Warden access' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A written reason is required' using errcode = '22023';
  end if;
  if p_days is not null and p_days not between 1 and 365 then
    raise exception 'A suspension must last between 1 and 365 days' using errcode = '22023';
  end if;

  v_until := case
    when p_days is null then timestamptz '2099-12-31 23:59:59+00'
    else now() + make_interval(days => p_days)
  end;

  update public.profiles set banned_until = v_until, ban_reason = v_reason where id = p_user_id;
  if not found then
    raise exception 'No such user' using errcode = 'P0002';
  end if;

  insert into public.mod_actions (actor_id, action, target_type, target_user_id, reason, metadata)
  values (
    auth.uid(),
    case when p_days is null then 'ban' else 'suspend' end,
    'user', p_user_id, v_reason,
    jsonb_build_object('days', p_days, 'until', v_until)
  );

  return v_until;
end;
$$;

-- ── 2. Revoke: only an active sanction, so the log never records a non-event ──
create function public.mod_revoke_sanction(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  v_was    timestamptz;
begin
  if not public.mod_can('ban', 'all') then
    raise exception 'permission denied: suspending or banning requires Warden access' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A written reason is required' using errcode = '22023';
  end if;

  select banned_until into v_was from public.profiles where id = p_user_id;
  if not found then
    raise exception 'No such user' using errcode = 'P0002';
  end if;
  if v_was is null or v_was <= now() then
    raise exception 'This member has no active sanction' using errcode = '22023';
  end if;

  update public.profiles set banned_until = null, ban_reason = null where id = p_user_id;

  insert into public.mod_actions (actor_id, action, target_type, target_user_id, reason, metadata)
  values (auth.uid(), 'revoke_sanction', 'user', p_user_id, v_reason, jsonb_build_object('was_until', v_was));
end;
$$;

-- ── 3. Public ledger: no member id or reason on user-targeted rows ─────────
-- Copied from 20261028010000 (nothing since redefines it) plus the two CASEs. CREATE OR
-- REPLACE keeps the signature, the grants and the comment.
CREATE OR REPLACE FUNCTION public.get_transparency_log(limit_count int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  action text,
  target_type text,
  target_id uuid,
  reason text,
  created_at timestamptz,
  actor_role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    m.id,
    m.action,
    m.target_type,
    CASE WHEN m.target_type = 'user' THEN NULL ELSE m.target_id END,
    CASE WHEN m.target_type = 'user' THEN NULL ELSE m.reason END,
    m.created_at,
    p.mod_role AS actor_role
  FROM public.mod_actions m
  JOIN public.profiles p ON m.actor_id = p.id
  WHERE m.target_type IS DISTINCT FROM 'ticket'
  ORDER BY m.created_at DESC
  LIMIT limit_count;
$$;

-- ── 4. Grants ──────────────────────────────────────────────────────────────
revoke all on function public.mod_apply_sanction(uuid, integer, text) from public, anon;
revoke all on function public.mod_revoke_sanction(uuid, text)         from public, anon;
grant execute on function public.mod_apply_sanction(uuid, integer, text) to authenticated;
grant execute on function public.mod_revoke_sanction(uuid, text)         to authenticated;

NOTIFY pgrst, 'reload schema';
