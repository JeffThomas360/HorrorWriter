-- Fix: saving a new announcement (or maintenance message) failed with
--   malformed array literal: "announcement_text changed"
--
-- In 20260822010000_site_settings.sql the audit list is built with
--   v_changes := v_changes || 'announcement_text changed';
-- v_changes is text[], and a bare string literal is type `unknown`, so
-- Postgres resolves `text[] || unknown` as array || array and tries to parse
-- the literal as an array. The format(...) lines worked only because format()
-- returns text. Casting the two literals to text makes them array || element.
--
-- Same signature, so CREATE OR REPLACE keeps the function's existing ACL; the
-- REVOKE/GRANT below restate 20260910000000's lockdown so this file stands on
-- its own. Body is otherwise unchanged.

CREATE OR REPLACE FUNCTION public.set_site_setting(
  p_registration_open     boolean DEFAULT NULL,
  p_maintenance_mode      boolean DEFAULT NULL,
  p_maintenance_message   text    DEFAULT NULL,
  p_announcement_text     text    DEFAULT NULL,
  p_announcement_active   boolean DEFAULT NULL,
  p_announcement_severity text    DEFAULT NULL
)
RETURNS public.site_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row     public.site_settings;
  v_changes text[] := '{}';
BEGIN
  IF NOT public.mod_can('configure', 'all') THEN
    RAISE EXCEPTION 'Not authorised to change site settings';
  END IF;

  -- Build a human-readable change list for the audit entry. COALESCE means a
  -- NULL argument leaves that column alone, so callers send only what changed.
  SELECT * INTO v_row FROM public.site_settings WHERE id = 1;

  IF p_registration_open IS NOT NULL AND p_registration_open IS DISTINCT FROM v_row.registration_open THEN
    v_changes := v_changes || format('registration_open=%s', p_registration_open);
  END IF;
  IF p_maintenance_mode IS NOT NULL AND p_maintenance_mode IS DISTINCT FROM v_row.maintenance_mode THEN
    v_changes := v_changes || format('maintenance_mode=%s', p_maintenance_mode);
  END IF;
  IF p_announcement_active IS NOT NULL AND p_announcement_active IS DISTINCT FROM v_row.announcement_active THEN
    v_changes := v_changes || format('announcement_active=%s', p_announcement_active);
  END IF;
  IF p_announcement_text IS NOT NULL AND p_announcement_text IS DISTINCT FROM v_row.announcement_text THEN
    v_changes := v_changes || 'announcement_text changed'::text;
  END IF;
  IF p_maintenance_message IS NOT NULL AND p_maintenance_message IS DISTINCT FROM v_row.maintenance_message THEN
    v_changes := v_changes || 'maintenance_message changed'::text;
  END IF;
  IF p_announcement_severity IS NOT NULL AND p_announcement_severity IS DISTINCT FROM v_row.announcement_severity THEN
    v_changes := v_changes || format('announcement_severity=%s', p_announcement_severity);
  END IF;

  UPDATE public.site_settings SET
    registration_open     = COALESCE(p_registration_open,     registration_open),
    maintenance_mode      = COALESCE(p_maintenance_mode,      maintenance_mode),
    maintenance_message   = COALESCE(p_maintenance_message,   maintenance_message),
    announcement_text     = COALESCE(p_announcement_text,     announcement_text),
    announcement_active   = COALESCE(p_announcement_active,   announcement_active),
    announcement_severity = COALESCE(p_announcement_severity, announcement_severity),
    updated_at            = now(),
    updated_by            = (SELECT auth.uid())
  WHERE id = 1
  RETURNING * INTO v_row;

  IF array_length(v_changes, 1) > 0 THEN
    INSERT INTO public.mod_actions (actor_id, action, target_type, reason)
    VALUES (
      (SELECT auth.uid()),
      'site_setting_changed',
      'site',
      array_to_string(v_changes, ', ')
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_site_setting(boolean, boolean, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_site_setting(boolean, boolean, text, text, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
