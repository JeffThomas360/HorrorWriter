-- supabase/migrations/20260908010000_reapply_p1a_safety.sql
--
-- CORRECTIVE MIGRATION — re-applies six migrations that supabase_migrations
-- records as applied but which never ran against bmvvugrfnuedjlucmlbw.
--
-- Verified missing 2026-09-08 by querying pg_proc / pg_tables / pg_trigger /
-- pg_indexes / pg_policies / information_schema.columns object-by-object, not
-- inferred from behaviour. Full evidence: vault work/migration-gap-2026-09-08.md
--
--   20260819010000_report_pileup_hardening   report rate limit + pile-on corroboration
--   20260819020000_automated_mod_status      the RPC the AI classifier calls
--   20260819030000_storm_detection           storm_alerts + cross-signal velocity triggers
--   20260819031000_storm_alert_dispatch      check_for_storm dispatch upgrade
--   20260819032000_resolve_storm             resolve_storm RPC
--   20260819040000_appeals                   resolve_appeal RPC
--
-- Effect of the gap, while it stood: reports were never rate limited,
-- handle_new_report ran without its rolling window or corroboration check,
-- and apply_automated_mod_status did not exist -- so moderate-content's RPC
-- call failed on every submission and every call site swallowed it with
-- .catch(console.error). Confirmed: zero mod_actions rows with actor_id IS NULL.
--
-- This is a FORWARD fix. schema_migrations is not edited and the six original
-- files are left untouched, so history stays honest about what happened.
--
-- Bodies below are byte-identical to those files except for added idempotency
-- guards (ADD COLUMN IF NOT EXISTS, CREATE TABLE/INDEX IF NOT EXISTS, DROP
-- POLICY IF EXISTS), so this is safe to run more than once.
--
-- ONE DELIBERATE DEVIATION from the originals: the storm-alert HTTP dispatch is
-- guarded and wrapped in an exception handler. app.settings.supabase_url and
-- app.settings.service_role_key are not set on this project, so the original
-- code would raise inside an AFTER INSERT trigger and roll back the report,
-- comment or post that tripped it. See the comment at that site.
--
-- FOLLOW-UP (not fixed here): set those two settings, or storm alerts will be
-- recorded in storm_alerts and visible in the Terminal but never pushed.
--
-- DO NOT assume success from an exit code. Verify every object afterwards --
-- trusting the tool is what produced this situation.


-- ======================================================================
-- FROM 20260819010000_report_pileup_hardening.sql
-- ======================================================================

-- supabase/migrations/20260819010000_report_pileup_hardening.sql

-- ── 1. Rate-limit report submissions per reporter ────────────────────
-- enforce_rate_limit() is a generic trigger already used on books/posts/
-- threads; add a 'reports' branch (5 reports per 15 minutes per reporter)
-- and attach it.
CREATE OR REPLACE FUNCTION "public"."enforce_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  recent_count integer;
  limit_count integer;
  limit_interval interval;
begin
  if TG_TABLE_NAME = 'posts' then
    limit_count := 10;
    limit_interval := interval '5 minutes';
  elsif TG_TABLE_NAME = 'threads' then
    limit_count := 5;
    limit_interval := interval '15 minutes';
  elsif TG_TABLE_NAME = 'books' then
    limit_count := 3;
    limit_interval := interval '1 hour';
  elsif TG_TABLE_NAME = 'reports' then
    limit_count := 5;
    limit_interval := interval '15 minutes';
  else
    return new;
  end if;

  if TG_TABLE_NAME = 'reports' then
    execute format(
      'select count(*) from public.%I where reporter_id = $1 and created_at > (now() - $2)',
      TG_TABLE_NAME
    )
    into recent_count
    using auth.uid(), limit_interval;
  else
    execute format(
      'select count(*) from public.%I where author_id = $1 and created_at > (now() - $2)',
      TG_TABLE_NAME
    )
    into recent_count
    using auth.uid(), limit_interval;
  end if;

  if recent_count >= limit_count then
    raise exception 'Rate limit exceeded for %. You must wait before posting again.', TG_TABLE_NAME;
  end if;

  return new;
end;
$_$;

DROP TRIGGER IF EXISTS rate_limit_reports ON public.reports;
CREATE TRIGGER rate_limit_reports BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit();

-- ── 2. Rolling-window, corroboration-aware pile-on handling ──────────
CREATE OR REPLACE FUNCTION public.handle_new_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distinct_reporters integer;
  v_corroborated_reporters integer;
  v_current_status text;
  v_author_id uuid;
  v_window interval := interval '60 minutes';
BEGIN
  IF NEW.target_type IN ('story', 'critique', 'thread', 'post') THEN

    SELECT count(distinct reporter_id) INTO v_distinct_reporters
    FROM public.reports
    WHERE target_type = NEW.target_type
      AND target_id = NEW.target_id
      AND created_at > (now() - v_window);

    SELECT count(distinct reporter_id) INTO v_corroborated_reporters
    FROM public.reports
    WHERE target_type = NEW.target_type
      AND target_id = NEW.target_id
      AND created_at > (now() - v_window)
      AND details IS NOT NULL AND length(trim(details)) > 0;

    IF v_distinct_reporters >= 5 THEN
      -- Fetch current status/author regardless of which branch we take below.
      IF NEW.target_type = 'story' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.books WHERE id = NEW.target_id;
      ELSIF NEW.target_type = 'thread' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.threads WHERE id = NEW.target_id;
      ELSIF NEW.target_type = 'post' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.posts WHERE id = NEW.target_id;
      ELSIF NEW.target_type = 'critique' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.book_comments WHERE id = NEW.target_id;
      END IF;

      IF v_corroborated_reporters * 2 >= v_distinct_reporters THEN
        -- At least half the recent reporters gave actual detail: treat as
        -- likely-genuine, auto-screen (not hide) pending review.
        IF v_current_status = 'live' THEN
          IF NEW.target_type = 'story' THEN
            UPDATE public.books SET mod_status = 'screening' WHERE id = NEW.target_id;
          ELSIF NEW.target_type = 'thread' THEN
            UPDATE public.threads SET mod_status = 'screening' WHERE id = NEW.target_id;
          ELSIF NEW.target_type = 'post' THEN
            UPDATE public.posts SET mod_status = 'screening' WHERE id = NEW.target_id;
          ELSIF NEW.target_type = 'critique' THEN
            UPDATE public.book_comments SET mod_status = 'screening' WHERE id = NEW.target_id;
          END IF;

          INSERT INTO public.mod_actions (action, target_type, target_id, target_user_id, reason)
          VALUES ('screen', NEW.target_type, NEW.target_id, v_author_id,
                  format('Auto-screened: %s distinct reports in the last hour, %s corroborated', v_distinct_reporters, v_corroborated_reporters));

          INSERT INTO public.notifications (user_id, kind, title, body)
          VALUES (
            v_author_id, 'content_actioned', 'Content Under Review',
            'Your ' || NEW.target_type || ' was automatically placed under review due to multiple community reports. A moderator will review it shortly.'
          );
        END IF;
      ELSE
        -- Low corroboration: shaped like a pile-on. Do NOT touch mod_status.
        -- Raise a flagged mod_actions entry for human review instead.
        INSERT INTO public.mod_actions (action, target_type, target_id, target_user_id, reason)
        VALUES ('pile_on_flag', NEW.target_type, NEW.target_id, v_author_id,
                format('PILE-ON PATTERN: %s distinct reports in the last hour, only %s corroborated with details. No automatic action taken — review needed.', v_distinct_reporters, v_corroborated_reporters));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ======================================================================
-- FROM 20260819020000_automated_mod_status.sql
-- ======================================================================

-- supabase/migrations/20260819020000_automated_mod_status.sql

-- ── 1. Track which reports came from the automated pipeline ─────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'automated'));

-- ── 2. Let a trusted automated caller bypass prevent_mod_status_reset ─
-- Session-local flag, set only inside apply_automated_mod_status() below,
-- never exposed to anon/authenticated. Matches the existing TG_ARGV-based
-- area check already on this trigger.
CREATE OR REPLACE FUNCTION public.prevent_mod_status_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.mod_status IS DISTINCT FROM OLD.mod_status
     AND NOT public.mod_can('hide',   TG_ARGV[0])
     AND NOT public.mod_can('screen', TG_ARGV[0])
     AND coalesce(current_setting('app.automated_mod_action', true), '') <> 'true'
  THEN
    RAISE EXCEPTION 'permission denied: cannot modify mod_status without moderation permission';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. The RPC the classifier pipeline calls ─────────────────────────
-- actor_id is always NULL here — that's the marker this plan uses
-- throughout to distinguish an automated action from a human one (see
-- Task 12's appeal cool-off logic).
CREATE OR REPLACE FUNCTION public.apply_automated_mod_status(
  p_target_type text,
  p_target_id uuid,
  p_status text, -- 'screening' only, in this plan — see Task 7's note on worst-tier
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  IF p_status NOT IN ('screening', 'hidden') THEN
    RAISE EXCEPTION 'apply_automated_mod_status only accepts screening or hidden, got %', p_status;
  END IF;

  PERFORM set_config('app.automated_mod_action', 'true', true);

  IF p_target_type = 'story' THEN
    UPDATE public.books SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'thread' THEN
    UPDATE public.threads SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'post' THEN
    UPDATE public.posts SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'critique' THEN
    UPDATE public.book_comments SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSE
    RAISE EXCEPTION 'Invalid target type: %', p_target_type;
  END IF;

  PERFORM set_config('app.automated_mod_action', 'false', true);

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Content not found';
  END IF;

  INSERT INTO public.mod_actions (actor_id, action, target_type, target_id, target_user_id, reason)
  VALUES (NULL, 'auto_' || p_status, p_target_type, p_target_id, v_author_id, p_reason);

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (
    v_author_id, 'content_actioned', 'Content Under Automated Review',
    'Your ' || p_target_type || ' was automatically placed under review by our safety system. Reason: ' || COALESCE(p_reason, 'No reason provided.')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_automated_mod_status(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_automated_mod_status(text, uuid, text, text) TO service_role;

-- ======================================================================
-- FROM 20260819030000_storm_detection.sql
-- ======================================================================

-- supabase/migrations/20260819030000_storm_detection.sql

CREATE TABLE IF NOT EXISTS public.storm_alerts (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('story','critique','thread','post','user')),
  target_id uuid not null,
  report_count integer not null default 0,
  reply_count integer not null default 0,
  window_start timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','dismissed')),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  unique (target_type, target_id, window_start)
);
create index if not exists idx_storm_alerts_pending on public.storm_alerts(status) where status = 'pending';

alter table public.storm_alerts enable row level security;
drop policy if exists "storm_alerts_mod_select" on public.storm_alerts;
create policy "storm_alerts_mod_select" on public.storm_alerts for select
  using (public.mod_can('handle_report', 'all'));
drop policy if exists "storm_alerts_mod_update" on public.storm_alerts;
create policy "storm_alerts_mod_update" on public.storm_alerts for update
  using (public.mod_can('handle_report', 'all'));

-- Combined velocity check: counts reports AND replies against one target
-- within a 15-minute window. Called from AFTER INSERT triggers below.
-- Threshold: 8 combined events in the window (deliberately higher than
-- PR3's 5-report pile-on threshold, since this is a broader, cross-signal
-- signal meant to catch coordinated multi-channel attacks specifically).
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
    INSERT INTO public.storm_alerts (target_type, target_id, report_count, reply_count, window_start)
    VALUES (p_target_type, p_target_id, v_report_count, v_reply_count, v_window_start)
    ON CONFLICT (target_type, target_id, window_start)
    DO UPDATE SET report_count = excluded.report_count, reply_count = excluded.reply_count;

    IF NOT EXISTS (
      SELECT 1 FROM public.storm_alerts
      WHERE target_type = p_target_type AND target_id = p_target_id
        AND window_start = v_window_start AND status <> 'pending'
    ) THEN
      PERFORM pg_notify('storm_detected', json_build_object(
        'target_type', p_target_type, 'target_id', p_target_id,
        'report_count', v_report_count, 'reply_count', v_reply_count
      )::text);
    END IF;
  END IF;
END;
$$;

-- Trigger wrappers: one per source table, each mapping to a storm check
-- against the report's/reply's target.
CREATE OR REPLACE FUNCTION public.trg_check_storm_on_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.target_type IN ('story', 'thread') THEN
    PERFORM public.check_for_storm(NEW.target_type, NEW.target_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_report_check_storm ON public.reports;
CREATE TRIGGER on_report_check_storm AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_storm_on_report();

CREATE OR REPLACE FUNCTION public.trg_check_storm_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.check_for_storm('story', NEW.book_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_comment_check_storm ON public.book_comments;
CREATE TRIGGER on_comment_check_storm AFTER INSERT ON public.book_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_storm_on_comment();

CREATE OR REPLACE FUNCTION public.trg_check_storm_on_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.check_for_storm('thread', NEW.thread_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_post_check_storm ON public.posts;
CREATE TRIGGER on_post_check_storm AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_storm_on_post();

-- ======================================================================
-- FROM 20260819031000_storm_alert_dispatch.sql
-- ======================================================================

-- supabase/migrations/20260819031000_storm_alert_dispatch.sql

CREATE EXTENSION IF NOT EXISTS pg_net;

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
      -- DEVIATION from 20260819031000_storm_alert_dispatch.sql, added 2026-09-08.
      --
      -- Verified on this project: app.settings.supabase_url and
      -- app.settings.service_role_key are NOT set. current_setting(..., true)
      -- therefore returns NULL, the url concatenates to NULL, and net.http_post
      -- raises -- inside an AFTER INSERT trigger, which would roll back the very
      -- report/comment/post that tripped the check. Unguarded, the first brigade
      -- attempt would start breaking content submission sitewide.
      --
      -- Dispatch is a notification: best-effort by definition. A missed alert is
      -- acceptable; a failed insert is not.
      BEGIN
        IF coalesce(current_setting('app.settings.supabase_url', true), '') <> ''
           AND coalesce(current_setting('app.settings.service_role_key', true), '') <> '' THEN
          PERFORM net.http_post(
            url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-storm-alert',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
            ),
            body := jsonb_build_object(
              'targetType', p_target_type, 'targetId', p_target_id,
              'reportCount', v_report_count, 'replyCount', v_reply_count
            )
          );
        ELSE
          RAISE WARNING 'storm alert not dispatched: app.settings.supabase_url / app.settings.service_role_key are unset. The storm_alerts row was still written and the Terminal will show it.';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'storm alert dispatch failed (row still recorded): %', SQLERRM;
      END;
    END IF;
  END IF;
END;
$$;

-- ======================================================================
-- FROM 20260819032000_resolve_storm.sql
-- ======================================================================

-- supabase/migrations/20260819032000_resolve_storm.sql
CREATE OR REPLACE FUNCTION public.resolve_storm(
  p_storm_id uuid,
  p_confirmed boolean, -- true: exclude these signals from the target's standing. false: dismiss, no change.
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_type text;
  v_target_id uuid;
BEGIN
  IF NOT public.mod_can('handle_report', 'all') THEN
    RAISE EXCEPTION 'Permission denied to resolve storm alerts';
  END IF;

  SELECT target_type, target_id INTO v_target_type, v_target_id
  FROM public.storm_alerts WHERE id = p_storm_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storm alert not found or already resolved';
  END IF;

  UPDATE public.storm_alerts
  SET status = CASE WHEN p_confirmed THEN 'confirmed' ELSE 'dismissed' END,
      resolved_at = timezone('utc', now()),
      resolved_by = v_caller_id
  WHERE id = p_storm_id;

  -- "Excluding from standing" here means: the reports filed during this
  -- storm's window are marked so they no longer count toward PR3's
  -- distinct-reporter pile-on threshold, without deleting them (visibility-
  -- only rule — reports themselves are data, not content, but the same
  -- never-destroy principle applies).
  IF p_confirmed THEN
    UPDATE public.reports
    SET status = 'dismissed', resolution = 'Excluded: part of a confirmed coordinated storm (' || p_storm_id || ')'
    WHERE target_type = v_target_type AND target_id = v_target_id
      AND status = 'open';
  END IF;

  INSERT INTO public.mod_actions (actor_id, action, target_type, target_id, reason, metadata)
  VALUES (
    v_caller_id,
    CASE WHEN p_confirmed THEN 'storm_confirmed' ELSE 'storm_dismissed' END,
    v_target_type, v_target_id, p_note,
    jsonb_build_object('storm_id', p_storm_id)
  );
END;
$$;

-- ======================================================================
-- FROM 20260819040000_appeals.sql
-- ======================================================================

-- supabase/migrations/20260819040000_appeals.sql
CREATE OR REPLACE FUNCTION public.resolve_appeal(
  p_report_id uuid,
  p_upheld boolean, -- true: original action stands. false: original action overturned.
  p_reason text -- REQUIRED — enforced below, not just by convention
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_appeal_created_at timestamptz;
  v_original_action_id uuid;
  v_original_actor_id uuid;
  v_original_target_type text;
  v_original_target_id uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A written reason is required to resolve an appeal';
  END IF;

  SELECT created_at, target_id INTO v_appeal_created_at, v_original_action_id
  FROM public.reports
  WHERE id = p_report_id AND target_type = 'appeal' AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appeal not found or already resolved';
  END IF;

  SELECT actor_id, target_type, target_id INTO v_original_actor_id, v_original_target_type, v_original_target_id
  FROM public.mod_actions WHERE id = v_original_action_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original moderation action not found';
  END IF;

  IF NOT public.mod_can('handle_report', public.mod_area(v_original_target_type)) THEN
    RAISE EXCEPTION 'Permission denied to resolve appeals in this area';
  END IF;

  -- Cool-off: only applies when the resolver is literally the person who
  -- took the original action, and that action was a human one (actor_id
  -- IS NOT NULL). An automated flag's first appeal review IS the first
  -- human look — no cool-off needed there.
  IF v_original_actor_id IS NOT NULL
     AND v_original_actor_id = v_caller_id
     AND (now() - v_appeal_created_at) < interval '24 hours'
  THEN
    RAISE EXCEPTION 'Cool-off period: you took the original action — wait 24 hours after the appeal was filed before resolving it yourself, or have another moderator review it.';
  END IF;

  UPDATE public.reports
  SET status = 'actioned',
      resolution = p_reason,
      resolved_by = v_caller_id,
      resolved_at = timezone('utc', now())
  WHERE id = p_report_id;

  IF NOT p_upheld THEN
    -- Overturned: restore the content to live.
    IF v_original_target_type = 'story' THEN
      UPDATE public.books SET mod_status = 'live' WHERE id = v_original_target_id;
    ELSIF v_original_target_type = 'thread' THEN
      UPDATE public.threads SET mod_status = 'live' WHERE id = v_original_target_id;
    ELSIF v_original_target_type = 'post' THEN
      UPDATE public.posts SET mod_status = 'live' WHERE id = v_original_target_id;
    ELSIF v_original_target_type = 'critique' THEN
      UPDATE public.book_comments SET mod_status = 'live' WHERE id = v_original_target_id;
    END IF;
  END IF;

  INSERT INTO public.mod_actions (actor_id, action, target_type, target_id, reason, metadata)
  VALUES (
    v_caller_id, 'appeal_resolved', v_original_target_type, v_original_target_id, p_reason,
    jsonb_build_object('upheld', p_upheld, 'original_action_id', v_original_action_id)
  );

  -- Notify the appellant (the reporter on the appeal row is the appellant).
  INSERT INTO public.notifications (user_id, kind, title, body)
  SELECT reporter_id, 'appeal_resolved',
    CASE WHEN p_upheld THEN 'Appeal Reviewed — Decision Upheld' ELSE 'Appeal Reviewed — Decision Overturned' END,
    p_reason
  FROM public.reports WHERE id = p_report_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
