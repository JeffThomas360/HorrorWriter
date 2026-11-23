-- Email a member when someone responds to their writing.
--
-- Why this exists
--   Writers publish within minutes of joining and most never come back. The
--   bell (20261118000000) only reaches a member who is already on the site, so
--   a critique left for someone who has gone is never seen. This sends one
--   short email with a link.
--
-- How it works
--   A critique or reply already inserts a row in public.notifications. A new
--   trigger hands that row's id to the Edge Function send-member-email through
--   keeper_dispatch(). The function calls member_email_claim(id), which decides
--   whether an email may go and, if so, returns the address and marks the row.
--   The function then sends through Resend.
--
--   Until send-member-email is deployed the dispatch gets a 404 and nothing
--   is claimed or sent, so merging this alone changes nothing a member sees.
--
-- Decisions (Jeff, 2026-11-23)
--   On by default, existing members included: no row in member_email_prefs
--   means "on". Every email carries a link that turns it off without signing in.
--
-- What is deliberately not sent
--   The text of the critique. Moderation may hide it seconds after it posts,
--   and an email cannot be taken back.

-- 1. Preference --------------------------------------------------------------
create table public.member_email_prefs (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  on_response     boolean not null default true,
  -- The secret in the "turn these emails off" link.
  off_token       uuid not null default gen_random_uuid() unique,
  last_emailed_at timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.member_email_prefs enable row level security;
revoke all on table public.member_email_prefs from anon, authenticated;

comment on table public.member_email_prefs is
  'Per-member email preference. No row = defaults (emails on). Reached only through get_email_pref / set_email_pref / email_off / member_email_claim.';

alter table public.notifications
  add column if not exists emailed_at timestamptz;

-- 2. Member-facing RPCs ------------------------------------------------------
create function public.get_email_pref()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select on_response from public.member_email_prefs where user_id = auth.uid()),
    true
  );
$$;

create function public.set_email_pref(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to change this setting';
  end if;
  if p_on is null then
    raise exception 'A value is required';
  end if;

  insert into public.member_email_prefs (user_id, on_response)
  values (v_user, p_on)
  on conflict (user_id) do update
    set on_response = excluded.on_response, updated_at = now();

  return p_on;
end;
$$;

-- The link in the email. Works signed out: the token is the proof.
create function public.email_off(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null then
    return false;
  end if;

  update public.member_email_prefs
  set on_response = false, updated_at = now()
  where off_token = p_token;

  return found;
end;
$$;

revoke all on function public.get_email_pref()        from public, anon, authenticated;
revoke all on function public.set_email_pref(boolean) from public, anon, authenticated;
revoke all on function public.email_off(uuid)         from public, anon, authenticated;
grant execute on function public.get_email_pref()        to authenticated;
grant execute on function public.set_email_pref(boolean) to authenticated;
grant execute on function public.email_off(uuid)         to anon, authenticated;

-- 3. The claim: may this notification be emailed? ----------------------------
-- Called only by send-member-email with the service key. Returns one row and
-- marks the notification when an email may go; returns no row otherwise.
create function public.member_email_claim(p_notification uuid)
returns table (email text, title text, href text, off_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid;
  v_title text;
  v_href  text;
  v_email text;
  v_pref  public.member_email_prefs%rowtype;
begin
  select n.user_id, n.title, n.href
    into v_user, v_title, v_href
  from public.notifications n
  where n.id = p_notification
    and n.emailed_at is null
    and n.kind in ('critique_received', 'ritual_comment', 'thread_reply')
    -- A dispatch that arrives late is dropped, not sent as stale news.
    and n.created_at > now() - interval '1 day'
  for update;

  if not found then
    return;
  end if;

  -- Make sure the member has a row (and so a turn-off token), then lock it:
  -- two responses landing together must not both pass the hourly limit.
  insert into public.member_email_prefs (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  select * into v_pref
  from public.member_email_prefs
  where user_id = v_user
  for update;

  if not v_pref.on_response then
    return;
  end if;

  -- At most one email an hour per member, so a burst of replies is one message.
  if v_pref.last_emailed_at is not null
     and v_pref.last_emailed_at > now() - interval '1 hour' then
    return;
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_user
    and u.email is not null
    and u.email_confirmed_at is not null;

  if v_email is null then
    return;
  end if;

  update public.notifications set emailed_at = now() where id = p_notification;
  update public.member_email_prefs set last_emailed_at = now() where user_id = v_user;

  return query select v_email, v_title, v_href, v_pref.off_token;
end;
$$;

revoke all on function public.member_email_claim(uuid) from public, anon, authenticated;
grant execute on function public.member_email_claim(uuid) to service_role;

comment on function public.member_email_claim(uuid) is
  'Service role only. Decides whether a response notification may be emailed (preference on, confirmed address, under one email an hour, under a day old) and marks it as sent.';

-- 4. Hand new response notifications to the Edge Function ---------------------
create function public.dispatch_response_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- keeper_dispatch is best-effort: it warns and returns, never raises, so a
  -- failed send cannot undo the critique or reply that caused it.
  perform public.keeper_dispatch(
    'send-member-email',
    jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$$;

revoke all on function public.dispatch_response_email() from public, anon, authenticated;

create trigger trg_notifications_response_email
  after insert on public.notifications
  for each row
  when (new.kind in ('critique_received', 'ritual_comment', 'thread_reply'))
  execute function public.dispatch_response_email();

notify pgrst, 'reload schema';
