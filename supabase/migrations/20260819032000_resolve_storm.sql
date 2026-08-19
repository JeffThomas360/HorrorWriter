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
