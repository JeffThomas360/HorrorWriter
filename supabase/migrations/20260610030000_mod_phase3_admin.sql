-- Profiles already has banned_until

-- Mod Notes Table for UserModProfile context
CREATE TABLE public.mod_notes (
    id uuid primary key default gen_random_uuid(),
    target_user_id uuid not null references public.profiles(id) on delete cascade,
    author_id uuid not null references public.profiles(id) on delete set null,
    note text not null,
    created_at timestamptz not null default timezone('utc', now())
);

-- Index for quickly fetching a user's notes
CREATE INDEX idx_mod_notes_target ON public.mod_notes(target_user_id);

ALTER TABLE public.mod_notes ENABLE ROW LEVEL SECURITY;

-- Mods can view notes
CREATE POLICY "mod_notes_select" ON public.mod_notes FOR SELECT USING (
    public.mod_can('read_audit', 'all')
);

-- Mods can insert notes
CREATE POLICY "mod_notes_insert" ON public.mod_notes FOR INSERT WITH CHECK (
    author_id = (select auth.uid()) AND public.mod_can('read_audit', 'all')
);

-- Transparency Log View (Redacts PII)
CREATE VIEW public.transparency_log WITH (security_invoker = false) AS
SELECT 
    m.id,
    m.action,
    m.target_type,
    m.target_id,
    m.reason,
    m.created_at,
    p.mod_role as actor_role -- Only expose the role, not the exact handle
FROM public.mod_actions m
JOIN public.profiles p ON m.actor_id = p.id;

-- Grant public read access to the view
GRANT SELECT ON public.transparency_log TO anon, authenticated;
