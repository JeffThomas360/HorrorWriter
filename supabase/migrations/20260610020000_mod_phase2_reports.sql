-- Phase 2: Reports, Inline Takedowns, and Notifications
-- This migration provides the RPCs and triggers needed for Phase 2.

-- 1. resolve_report(p_report_id, p_action_taken, p_resolution_note)
CREATE OR REPLACE FUNCTION public.resolve_report(
  p_report_id uuid,
  p_action_taken text, -- 'actioned' or 'dismissed'
  p_resolution_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_target_type text;
  v_reporter_id uuid;
  v_caller_id uuid := auth.uid();
BEGIN
  -- Get report info
  SELECT target_type, reporter_id INTO v_report_target_type, v_reporter_id
  FROM public.reports WHERE id = p_report_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  -- Verify capability
  IF NOT public.mod_can('handle_report', public.mod_area(v_report_target_type)) THEN
    RAISE EXCEPTION 'Permission denied to handle reports in this area';
  END IF;

  -- Update report
  UPDATE public.reports
  SET status = p_action_taken,
      resolution = p_resolution_note,
      resolved_by = v_caller_id,
      resolved_at = timezone('utc', now())
  WHERE id = p_report_id;

  -- Log to mod_actions
  INSERT INTO public.mod_actions (actor_id, action, target_type, target_id, reason)
  VALUES (
    v_caller_id, 
    CASE WHEN p_action_taken = 'actioned' THEN 'action_report' ELSE 'dismiss_report' END,
    'report', 
    p_report_id, 
    p_resolution_note
  );

  -- Notify reporter
  IF v_reporter_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (
      v_reporter_id,
      'report_resolved',
      'Report Reviewed',
      CASE 
        WHEN p_action_taken = 'actioned' THEN 'Your report was reviewed and action has been taken. Thank you for keeping the community safe.'
        ELSE 'Your report was reviewed but no action was deemed necessary at this time.'
      END
    );
  END IF;
END;
$$;


-- 2. handle_new_report() Trigger for Auto-Hide Threshold
CREATE OR REPLACE FUNCTION public.handle_new_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distinct_reporters integer;
  v_current_status text;
  v_author_id uuid;
BEGIN
  -- Only care about content targets for auto-hide
  IF NEW.target_type IN ('story', 'critique', 'thread', 'post') THEN
    
    -- Count distinct reporters for this target
    SELECT count(distinct reporter_id) INTO v_distinct_reporters
    FROM public.reports
    WHERE target_type = NEW.target_type AND target_id = NEW.target_id;

    IF v_distinct_reporters >= 5 THEN
      -- Get current status depending on target_type
      IF NEW.target_type = 'story' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.books WHERE id = NEW.target_id;
        IF v_current_status = 'live' THEN
          UPDATE public.books SET mod_status = 'hidden' WHERE id = NEW.target_id;
        END IF;
      ELSIF NEW.target_type = 'thread' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.threads WHERE id = NEW.target_id;
        IF v_current_status = 'live' THEN
          UPDATE public.threads SET mod_status = 'hidden' WHERE id = NEW.target_id;
        END IF;
      ELSIF NEW.target_type = 'post' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.posts WHERE id = NEW.target_id;
        IF v_current_status = 'live' THEN
          UPDATE public.posts SET mod_status = 'hidden' WHERE id = NEW.target_id;
        END IF;
      ELSIF NEW.target_type = 'critique' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.book_comments WHERE id = NEW.target_id;
        IF v_current_status = 'live' THEN
          UPDATE public.book_comments SET mod_status = 'hidden' WHERE id = NEW.target_id;
        END IF;
      END IF;

      -- If we actually transitioned from live to hidden
      IF v_current_status = 'live' THEN
        -- Log auto-hide action
        INSERT INTO public.mod_actions (action, target_type, target_id, target_user_id, reason)
        VALUES ('hide', NEW.target_type, NEW.target_id, v_author_id, 'Auto-hidden: reached report threshold (5)');
        
        -- Insert a notification to the author
        INSERT INTO public.notifications (user_id, kind, title, body)
        VALUES (
          v_author_id,
          'content_actioned',
          'Content Hidden (Under Review)',
          'Your ' || NEW.target_type || ' was automatically hidden due to multiple community reports. A moderator will review it shortly.'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_report_inserted ON public.reports;
CREATE TRIGGER on_report_inserted
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_report();


-- 3. set_content_mod_status(p_target_type, p_target_id, p_status, p_reason)
CREATE OR REPLACE FUNCTION public.set_content_mod_status(
  p_target_type text,
  p_target_id uuid,
  p_status text, -- 'hidden', 'live', 'screening'
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_author_id uuid;
  v_area text := public.mod_area(p_target_type);
  v_action text;
BEGIN
  -- 1. Determine capability required
  IF p_status = 'hidden' THEN
    v_action := 'hide';
  ELSIF p_status = 'screening' THEN
    v_action := 'screen';
  ELSIF p_status = 'live' THEN
    v_action := 'hide'; -- Required to unhide
  ELSE
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF NOT public.mod_can(v_action, v_area) THEN
    RAISE EXCEPTION 'Permission denied to % in area %', v_action, v_area;
  END IF;

  -- 2. Update and get author
  IF p_target_type = 'story' THEN
    UPDATE public.books SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'thread' THEN
    UPDATE public.threads SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'post' THEN
    UPDATE public.posts SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'critique' THEN
    UPDATE public.book_comments SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSE
    RAISE EXCEPTION 'Invalid target type';
  END IF;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Content not found';
  END IF;

  -- 3. Log to mod_actions
  INSERT INTO public.mod_actions (actor_id, action, target_type, target_id, target_user_id, reason)
  VALUES (
    v_caller_id, 
    CASE WHEN p_status = 'live' THEN 'unhide' WHEN p_status = 'hidden' THEN 'hide' ELSE 'screen' END,
    p_target_type, 
    p_target_id, 
    v_author_id,
    p_reason
  );

  -- 4. Notify author if hidden
  IF p_status = 'hidden' THEN
    INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (
      v_author_id,
      'content_actioned',
      'Content Hidden',
      'Your ' || p_target_type || ' was hidden by a moderator. Reason: ' || COALESCE(p_reason, 'No reason provided.')
    );
  END IF;
END;
$$;
