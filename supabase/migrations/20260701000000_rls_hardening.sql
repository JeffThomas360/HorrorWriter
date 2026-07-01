-- RLS hardening: close two gaps found in P2 audit (2026-06-30)
--
-- GAP 1 (CRITICAL): profiles UPDATE has no column restriction.
--   Any authenticated user can run:
--     UPDATE profiles SET mod_role = 'keeper' WHERE id = auth.uid()
--   Fix: BEFORE UPDATE trigger that blocks non-mods from touching mod fields.
--
-- GAP 2 (MEDIUM): content table UPDATE has no column restriction.
--   An author can re-live their own moderated content:
--     UPDATE books SET mod_status = 'live' WHERE id = <my_book>
--   Fix: BEFORE UPDATE trigger that blocks non-mods from changing mod_status.

-- ─── 1. Profile mod-field protection ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_profile_mod_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (
    NEW.mod_role         IS DISTINCT FROM OLD.mod_role
    OR NEW.mod_scope     IS DISTINCT FROM OLD.mod_scope
    OR NEW.is_shadowbanned IS DISTINCT FROM OLD.is_shadowbanned
    OR NEW.banned_until  IS DISTINCT FROM OLD.banned_until
    OR NEW.ban_reason    IS DISTINCT FROM OLD.ban_reason
    OR NEW.requires_screening IS DISTINCT FROM OLD.requires_screening
  )
  AND NOT public.mod_can('ban',       'all')
  AND NOT public.mod_can('shadowban', 'all')
  AND NOT public.mod_can('configure', 'all')
  THEN
    RAISE EXCEPTION 'permission denied: cannot modify moderation fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_profile_mod_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_mod_escalation();

-- ─── 2. Content mod_status protection ─────────────────────────────────────

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
  THEN
    RAISE EXCEPTION 'permission denied: cannot modify mod_status without moderation permission';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_mod_status_reset_books
  BEFORE UPDATE ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_mod_status_reset('library');

CREATE TRIGGER trg_prevent_mod_status_reset_threads
  BEFORE UPDATE ON public.threads
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_mod_status_reset('forum');

CREATE TRIGGER trg_prevent_mod_status_reset_posts
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_mod_status_reset('forum');

CREATE TRIGGER trg_prevent_mod_status_reset_book_comments
  BEFORE UPDATE ON public.book_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_mod_status_reset('library');
