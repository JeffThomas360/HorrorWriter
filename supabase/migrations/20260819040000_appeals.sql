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
