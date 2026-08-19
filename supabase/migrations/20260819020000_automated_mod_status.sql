-- supabase/migrations/20260819020000_automated_mod_status.sql

-- ── 1. Track which reports came from the automated pipeline ─────────
ALTER TABLE public.reports
  ADD COLUMN source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'automated'));

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
