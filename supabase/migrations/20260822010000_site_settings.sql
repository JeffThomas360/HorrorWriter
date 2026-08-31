-- supabase/migrations/20260822010000_site_settings.sql
--
-- Foundation for the admin panel's Site tab: a single-row settings table the
-- whole site reads and only a Keeper can write.
--
-- Single-row by constraint (id is always 1) rather than a key/value table —
-- at this site's size a typed row with real columns is easier to read, easier
-- to query, and gets actual type checking. Add a column per setting.
--
-- Admin writes go through set_site_setting(), a SECURITY DEFINER RPC that
-- checks mod_can('configure') and records the change to mod_actions. That
-- keeps one audit trail rather than a second admin-only one — transparency_log
-- already reads mod_actions.

-- ── 1. Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_settings (
  id                    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  registration_open     boolean NOT NULL DEFAULT true,
  maintenance_mode      boolean NOT NULL DEFAULT false,
  maintenance_message   text,
  announcement_text     text,
  announcement_active   boolean NOT NULL DEFAULT false,
  announcement_severity text NOT NULL DEFAULT 'info'
    CHECK (announcement_severity IN ('info', 'warning', 'critical')),
  updated_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Readable by everyone (signed in or not): the banner and maintenance notice
-- have to render for anonymous visitors too.
DROP POLICY IF EXISTS "site_settings_select" ON public.site_settings;
CREATE POLICY "site_settings_select" ON public.site_settings
  FOR SELECT USING (true);

-- No direct client writes at all — everything goes through the RPC below, so
-- there is exactly one audited path to changing site configuration.
DROP POLICY IF EXISTS "site_settings_no_direct_write" ON public.site_settings;
CREATE POLICY "site_settings_no_direct_write" ON public.site_settings
  FOR ALL USING (false) WITH CHECK (false);

-- ── 2. Keeper-only setter, audited ────────────────────────────────────
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
    v_changes := v_changes || 'announcement_text changed';
  END IF;
  IF p_maintenance_message IS NOT NULL AND p_maintenance_message IS DISTINCT FROM v_row.maintenance_message THEN
    v_changes := v_changes || 'maintenance_message changed';
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

REVOKE ALL ON FUNCTION public.set_site_setting(boolean, boolean, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_site_setting(boolean, boolean, text, text, boolean, text) TO authenticated;
