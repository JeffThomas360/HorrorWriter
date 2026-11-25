-- supabase/migrations/20261125000000_report_pileup_screening_fix.sql
--
-- The fifth report on one item was refused, and the item was never screened.
--
-- handle_new_report() runs AFTER INSERT on public.reports. When five distinct members
-- report the same story, critique, thread or post inside an hour, and at least half of
-- them wrote details, it sets the item's mod_status to 'screening'. That UPDATE fires
-- prevent_mod_status_reset(), which raises unless the caller is a moderator or the
-- transaction flag app.automated_mod_action is 'true'. handle_new_report() never set
-- the flag, and the caller is the fifth reporter, so the guard raised
--   permission denied: cannot modify mod_status without moderation permission
-- and took the reporter's own insert down with it. Since 20260819020000 (which added
-- the guard's flag) the auto-screen has therefore never happened in production.
--
-- The fix is the pattern apply_automated_mod_status() already uses: turn the flag on
-- immediately before the status UPDATE and off immediately after. Nothing else in the
-- function changes. The flag is transaction-local and is off again before the trigger
-- returns, so a member still cannot change mod_status themselves.
--
-- Behaviour test: scripts/sql/test-report-pileup.sql

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
          -- The reporter is not a moderator. Let this one UPDATE past
          -- prevent_mod_status_reset(), then close the door again.
          PERFORM set_config('app.automated_mod_action', 'true', true);

          IF NEW.target_type = 'story' THEN
            UPDATE public.books SET mod_status = 'screening' WHERE id = NEW.target_id;
          ELSIF NEW.target_type = 'thread' THEN
            UPDATE public.threads SET mod_status = 'screening' WHERE id = NEW.target_id;
          ELSIF NEW.target_type = 'post' THEN
            UPDATE public.posts SET mod_status = 'screening' WHERE id = NEW.target_id;
          ELSIF NEW.target_type = 'critique' THEN
            UPDATE public.book_comments SET mod_status = 'screening' WHERE id = NEW.target_id;
          END IF;

          PERFORM set_config('app.automated_mod_action', 'false', true);

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

-- CREATE OR REPLACE keeps the existing ACL (20260702000000_revoke_trigger_fn_execute):
-- no client role may call this. Restated so the intent travels with the definition.
REVOKE ALL ON FUNCTION public.handle_new_report() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
