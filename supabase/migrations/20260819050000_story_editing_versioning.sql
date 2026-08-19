-- supabase/migrations/20260819050000_story_editing_versioning.sql

-- ── 1. Add version tracking to books & book_comments ─────────────────
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.book_comments
  ADD COLUMN IF NOT EXISTS book_version integer NOT NULL DEFAULT 1;

-- ── 2. Automatic version stamping trigger for new critiques ─────────
CREATE OR REPLACE FUNCTION public.stamp_book_comment_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT version INTO NEW.book_version
  FROM public.books
  WHERE id = NEW.book_id;

  IF NEW.book_version IS NULL THEN
    NEW.book_version := 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_book_comment_version ON public.book_comments;
CREATE TRIGGER trg_stamp_book_comment_version
  BEFORE INSERT ON public.book_comments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_book_comment_version();
