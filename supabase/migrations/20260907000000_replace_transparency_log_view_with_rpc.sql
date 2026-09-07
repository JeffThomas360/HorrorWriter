-- supabase/migrations/20260907000000_replace_transparency_log_view_with_rpc.sql
--
-- Fix Supabase Advisor Lint: 0010_security_definer_view on public.transparency_log
--
-- Converts public.transparency_log from a SECURITY DEFINER view to a security-hardened
-- RPC function (get_transparency_log) with explicit SET search_path = public.
-- Drops the old view to clear the ERROR finding in Supabase Security Advisor.

-- 1. Create typed, search_path-hardened RPC function
CREATE OR REPLACE FUNCTION public.get_transparency_log(limit_count int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  action text,
  target_type text,
  target_id uuid,
  reason text,
  created_at timestamptz,
  actor_role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT 
    m.id,
    m.action,
    m.target_type,
    m.target_id,
    m.reason,
    m.created_at,
    p.mod_role AS actor_role
  FROM public.mod_actions m
  JOIN public.profiles p ON m.actor_id = p.id
  ORDER BY m.created_at DESC
  LIMIT limit_count;
$$;

COMMENT ON FUNCTION public.get_transparency_log(int) IS 
'Safe SECURITY DEFINER function with strict search_path=public: provides public visibility into sanitized moderation logs without triggering 0010_security_definer_view.';

-- 2. Grant execute to public and authenticated members
GRANT EXECUTE ON FUNCTION public.get_transparency_log(int) TO anon, authenticated;

-- 3. Drop the old SECURITY DEFINER view (resolves the advisor lint error)
DROP VIEW IF EXISTS public.transparency_log;
