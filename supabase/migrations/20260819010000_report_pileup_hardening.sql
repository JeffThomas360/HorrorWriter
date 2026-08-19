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
