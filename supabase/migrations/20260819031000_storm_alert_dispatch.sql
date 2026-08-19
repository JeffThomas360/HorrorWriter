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
    END IF;
  END IF;
END;
$$;
