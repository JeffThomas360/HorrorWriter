-- supabase/migrations/20260924000000_block_mod_self_escalation.sql
--
-- Close a self-promotion hole in prevent_profile_mod_escalation (20260701000000).
--
-- The profiles UPDATE policy lets a user update their own row with no column
-- restriction; this trigger is the only thing guarding the moderation fields.
-- It let through ANY caller passing mod_can('ban','all'), and every warden
-- does. So a warden could run
--     update profiles set mod_role = 'keeper' where id = auth.uid()
-- and become a keeper with no audit row, or clear their own ban. A warden
-- could also ban or shadowban the keeper.
--
-- New rules, checked in this order:
--   1. No signed-in user (auth.uid() is null): SQL editor, migrations,
--      service_role. Allowed, as before.
--   2. mod_role / mod_scope: keeper only. The app changes these solely through
--      set_mod_role(), which already requires a keeper and refuses self-changes.
--   3. Nobody signed in may change the sanction fields on their OWN row.
--   4. Only a keeper may change the sanction fields on a KEEPER's row.
--   5. Otherwise the sanction fields need ban / shadowban / configure, as before.
--
-- Behaviour test: scripts/sql/test-mod-escalation.sql (rolls back; must print
-- ALL PASS).
--
-- CREATE OR REPLACE keeps the existing ACL (EXECUTE revoked from client roles
-- by 20260702000000), so no grant statements are needed here.

CREATE OR REPLACE FUNCTION public.prevent_profile_mod_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := (select auth.uid());
  v_role_changed boolean :=
       NEW.mod_role  IS DISTINCT FROM OLD.mod_role
    OR NEW.mod_scope IS DISTINCT FROM OLD.mod_scope;
  v_sanction_changed boolean :=
       NEW.is_shadowbanned    IS DISTINCT FROM OLD.is_shadowbanned
    OR NEW.banned_until       IS DISTINCT FROM OLD.banned_until
    OR NEW.ban_reason         IS DISTINCT FROM OLD.ban_reason
    OR NEW.requires_screening IS DISTINCT FROM OLD.requires_screening;
BEGIN
  IF NOT (v_role_changed OR v_sanction_changed) OR v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_role_changed AND NOT public.mod_can('assign_role', 'all') THEN
    RAISE EXCEPTION 'permission denied: only a Keeper may change moderation roles'
      USING ERRCODE = '42501';
  END IF;

  IF v_sanction_changed THEN
    IF OLD.id = v_actor THEN
      RAISE EXCEPTION 'permission denied: cannot change sanctions on your own profile'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.mod_role = 'keeper' AND NOT public.mod_can('configure', 'all') THEN
      RAISE EXCEPTION 'permission denied: only a Keeper may sanction a Keeper'
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.mod_can('ban',       'all')
       AND NOT public.mod_can('shadowban', 'all')
       AND NOT public.mod_can('configure', 'all')
    THEN
      RAISE EXCEPTION 'permission denied: cannot modify moderation fields'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
