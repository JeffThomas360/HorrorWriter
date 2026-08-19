-- supabase/migrations/20260819030000_storm_detection.sql

CREATE TABLE public.storm_alerts (
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
create index idx_storm_alerts_pending on public.storm_alerts(status) where status = 'pending';

alter table public.storm_alerts enable row level security;
create policy "storm_alerts_mod_select" on public.storm_alerts for select
  using (public.mod_can('handle_report', 'all'));
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
