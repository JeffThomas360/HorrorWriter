-- supabase/migrations/20260819001000_fix_block_insert_rls.sql

-- The WITH CHECK subqueries added in 20260819000000_user_blocks.sql query
-- user_blocks directly, which is RLS-protected to blocker_id = auth.uid().
-- Under a commenter's/poster's own session, the relevant block row
-- (blocker_id = content owner, a different user) is invisible, so the
-- check never fires. Elevate via a SECURITY DEFINER helper, mirroring
-- content_visible()'s existing pattern, so the lookup bypasses that RLS
-- restriction the same way content_visible() already does.
CREATE OR REPLACE FUNCTION public.is_blocked_by(p_content_owner uuid, p_actor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE blocker_id = p_content_owner AND blocked_id = p_actor
  );
$$;

DROP POLICY IF EXISTS "Users can insert their own book comments." ON public.book_comments;
CREATE POLICY "Users can insert their own book comments." ON public.book_comments
  FOR INSERT WITH CHECK (
    (select auth.uid()) = author_id
    AND NOT public.is_blocked_by(
      (SELECT author_id FROM public.books WHERE id = book_id),
      author_id
    )
  );

DROP POLICY IF EXISTS "Users can insert their own posts." ON public.posts;
CREATE POLICY "Users can insert their own posts." ON public.posts
  FOR INSERT WITH CHECK (
    (select auth.uid()) = author_id
    AND NOT public.is_blocked_by(
      (SELECT author_id FROM public.threads WHERE id = thread_id),
      author_id
    )
  );
