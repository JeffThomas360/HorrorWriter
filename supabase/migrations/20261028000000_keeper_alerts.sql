-- Keeper alerts: one Vault-backed dispatcher, storm alerts that actually send,
-- and a Pushover alert when a new member confirms their account.
--
-- Why this exists
--   check_for_storm() has always posted to send-storm-alert with
--   current_setting('app.settings.supabase_url' / 'app.settings.service_role_key'),
--   and neither setting exists on this project, so storm alerts were never sent.
--   Supabase Vault is the supported place for the URL and key, and ordinary
--   migrations can read it. keeper_dispatch() is the single path every
--   trigger/RPC uses to reach an Edge Function from now on.
--
-- ONE-TIME SETUP, by hand, after this merges (Supabase SQL editor; never commit values):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'hw_project_url');
--   select vault.create_secret('<legacy service_role JWT>',         'hw_service_role_key');
--   Until both exist, keeper_dispatch() raises a WARNING and sends nothing.
--   The key must be the legacy service_role JWT: the functions sit behind
--   verify_jwt, and send-keeper-alert compares it to SUPABASE_SERVICE_ROLE_KEY.
--
-- A failed dispatch never fails or rolls back the statement that triggered it.

-- 1. The dispatcher ---------------------------------------------------------
create or replace function public.keeper_dispatch(p_function text, p_body jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'hw_project_url';
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'hw_service_role_key';

    if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
      raise warning 'keeper_dispatch(%): Vault secrets hw_project_url / hw_service_role_key are not both set; nothing sent', p_function;
      return;
    end if;

    perform net.http_post(
      url     := rtrim(v_url, '/') || '/functions/v1/' || p_function,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := p_body
    );
  exception when others then
    raise warning 'keeper_dispatch(%) failed: %', p_function, sqlerrm;
  end;
end;
$$;

revoke all on function public.keeper_dispatch(text, jsonb) from public, anon, authenticated;

comment on function public.keeper_dispatch(text, jsonb) is
  'Internal. POSTs p_body to the Edge Function p_function using the Vault secrets hw_project_url and hw_service_role_key. Best-effort: warns and returns, never raises.';

-- 2. Storm alerts: same body as 20260908010000_reapply_p1a_safety.sql, but the
--    dispatch goes through keeper_dispatch(). CREATE OR REPLACE keeps the
--    existing ACL (revoked from public/anon/authenticated in 20260910000000).
CREATE OR REPLACE FUNCTION public.check_for_storm(p_target_type text, p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window interval := interval '15 minutes';
  v_window_start timestamptz := date_trunc('minute', now()) - (extract(minute from now())::int % 15) * interval '1 minute';
  v_report_count integer;
  v_reply_count integer;
  v_combined integer;
  v_already_alerted boolean;
BEGIN
  SELECT count(*) INTO v_report_count
  FROM public.reports
  WHERE target_type = p_target_type AND target_id = p_target_id
    AND created_at > (now() - v_window);

  v_reply_count := 0;
  IF p_target_type = 'story' THEN
    SELECT count(*) INTO v_reply_count FROM public.book_comments
    WHERE book_id = p_target_id AND created_at > (now() - v_window);
  ELSIF p_target_type = 'thread' THEN
    SELECT count(*) INTO v_reply_count FROM public.posts
    WHERE thread_id = p_target_id AND created_at > (now() - v_window);
  END IF;

  v_combined := v_report_count + v_reply_count;

  IF v_combined >= 8 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.storm_alerts
      WHERE target_type = p_target_type AND target_id = p_target_id AND window_start = v_window_start
    ) INTO v_already_alerted;

    INSERT INTO public.storm_alerts (target_type, target_id, report_count, reply_count, window_start)
    VALUES (p_target_type, p_target_id, v_report_count, v_reply_count, v_window_start)
    ON CONFLICT (target_type, target_id, window_start)
    DO UPDATE SET report_count = excluded.report_count, reply_count = excluded.reply_count;

    IF NOT v_already_alerted THEN
      -- Best-effort: keeper_dispatch() warns and returns on any failure, so a
      -- missed alert never rolls back the report/comment/post that tripped this.
      PERFORM public.keeper_dispatch('send-storm-alert', jsonb_build_object(
        'targetType', p_target_type, 'targetId', p_target_id,
        'reportCount', v_report_count, 'replyCount', v_reply_count
      ));
    END IF;
  END IF;
END;
$$;

-- 3. New-member alert -------------------------------------------------------
-- Fires when an account's email becomes confirmed (an email sign-up creates the
-- auth user before the link is clicked; Google sign-ups arrive confirmed).
-- At most 10 individual pushes per hour; the 11th collapses into one surge push;
-- the rest stay quiet. Never carries an email address.
create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fire boolean := false;
  n integer;
  v_handle text;
begin
  begin
    if new.email_confirmed_at is not null then
      if tg_op = 'INSERT' then
        v_fire := true;
      elsif old.email_confirmed_at is null then
        v_fire := true;
      end if;
    end if;

    if v_fire then
      select count(*) into n from auth.users where email_confirmed_at > now() - interval '1 hour';
      if n <= 10 then
        select handle into v_handle from public.profiles where id = new.id;
        perform public.keeper_dispatch('send-keeper-alert',
          jsonb_build_object('kind', 'signup', 'handle', v_handle));
      elsif n = 11 then
        perform public.keeper_dispatch('send-keeper-alert',
          jsonb_build_object('kind', 'signup_surge', 'count', 11));
      end if;
    end if;
  exception when others then
    raise warning 'notify_new_signup failed (signup unaffected): %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.notify_new_signup() from public, anon, authenticated;

-- Sorts after on_auth_user_created (handle_new_user), so the profile row exists
-- when an INSERT-time confirmed signup fires this.
-- The DDL locks auth.users. If that lock isn't free within 5 s, fail (and retry the
-- migration) rather than queue every sign-in behind the wait. `set local` lasts to the
-- end of this migration's transaction.
set local lock_timeout = '5s';
drop trigger if exists on_auth_user_signup_alert on auth.users;
create trigger on_auth_user_signup_alert
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.notify_new_signup();

notify pgrst, 'reload schema';
