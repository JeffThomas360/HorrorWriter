-- supabase/migrations/20260822000000_enforce_sanctions.sql
--
-- Fixes a real gap found while rebuilding the moderation Terminal's admin
-- tools: the Sanctions tab (and now the unified case-file UI) has always
-- written `profiles.banned_until`, but nothing else in the schema ever read
-- it. content_visible() only checks the separate `is_shadowbanned` boolean,
-- which no UI anywhere sets, and no insert policy checks either column. A
-- "Permanent Shadowban" click changed a timestamp and had zero actual effect
-- on what the sanctioned user could post or what anyone else could see.
--
-- This migration makes `banned_until` the single, functioning source of
-- truth for an active sanction: a helper `is_banned()`, content_visible()
-- extended to hide a banned author's content, and every content INSERT
-- policy extended to reject a banned author's new posts. `is_shadowbanned`
-- is left untouched (still checked, still available) in case it's wanted as
-- a distinct permanent-and-silent flag later — this migration doesn't try
-- to unify the two, just makes the one the UI actually uses do something.

-- ── 1. is_banned() helper ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_banned(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT banned_until IS NOT NULL AND banned_until > now() FROM public.profiles WHERE id = p_user),
    false
  );
$$;

-- ── 2. content_visible(): also hide a banned author's content ─────────
-- Supersedes the version in 20260819000000_user_blocks.sql — same shape,
-- plus the is_banned() check.
CREATE OR REPLACE FUNCTION public.content_visible(p_status text, p_author uuid, p_area text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (
      ( p_status = 'live'
        AND NOT coalesce((SELECT is_shadowbanned FROM public.profiles WHERE id = p_author), false)
        AND NOT public.is_banned(p_author) )
      OR (SELECT auth.uid()) = p_author
      OR public.mod_can('view_hidden', p_area)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks
      WHERE blocker_id = (SELECT auth.uid()) AND blocked_id = p_author
    );
$$;

-- ── 3. Block new content from a currently-sanctioned author ───────────
-- books/threads never had a blocking-related override, so this is the only
-- change to those two. book_comments/posts already carry the is_blocked_by
-- check from 20260819001000_fix_block_insert_rls.sql — preserved as-is,
-- with is_banned() added alongside it.

DROP POLICY IF EXISTS "Users can insert their own books." ON public.books;
CREATE POLICY "Users can insert their own books." ON public.books
  FOR INSERT WITH CHECK (
    (select auth.uid()) = author_id
    AND NOT public.is_banned(author_id)
  );

DROP POLICY IF EXISTS "Users can insert their own threads." ON public.threads;
CREATE POLICY "Users can insert their own threads." ON public.threads
  FOR INSERT WITH CHECK (
    (select auth.uid()) = author_id
    AND NOT public.is_banned(author_id)
  );

DROP POLICY IF EXISTS "Users can insert their own book comments." ON public.book_comments;
CREATE POLICY "Users can insert their own book comments." ON public.book_comments
  FOR INSERT WITH CHECK (
    (select auth.uid()) = author_id
    AND NOT public.is_banned(author_id)
    AND NOT public.is_blocked_by(
      (SELECT author_id FROM public.books WHERE id = book_id),
      author_id
    )
  );

DROP POLICY IF EXISTS "Users can insert their own posts." ON public.posts;
CREATE POLICY "Users can insert their own posts." ON public.posts
  FOR INSERT WITH CHECK (
    (select auth.uid()) = author_id
    AND NOT public.is_banned(author_id)
    AND NOT public.is_blocked_by(
      (SELECT author_id FROM public.threads WHERE id = thread_id),
      author_id
    )
  );
