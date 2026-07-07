-- Add series_teaser column and fix series_books RLS ownership checks (Task 0 prerequisite).
--
-- 1. Add series_teaser column to books table: stores pre-extracted opening ~50 words
-- 2. Fix series_books RLS to check BOTH series ownership AND book ownership
--    (previously only checked series ownership, allowing users to add others' books to their series)

-- ==========================================
-- 1. Add series_teaser column to books
-- ==========================================
ALTER TABLE public.books ADD COLUMN series_teaser TEXT;

-- ==========================================
-- 2. Fix series_books RLS policies
-- ==========================================
-- Drop the old policy that only checks series ownership
DROP POLICY IF EXISTS "Authors can manage books in their series" ON public.series_books;

-- Create new INSERT policy: user must own BOTH the series and the book
CREATE POLICY "Authors can add their books to their series"
  ON public.series_books FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = (SELECT author_id FROM public.series WHERE id = series_id)
    AND
    auth.uid() = (SELECT author_id FROM public.books WHERE id = book_id)
  );

-- Create new UPDATE policy: user must own BOTH the series and the book
CREATE POLICY "Authors can update book order in their series"
  ON public.series_books FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = (SELECT author_id FROM public.series WHERE id = series_id)
    AND
    auth.uid() = (SELECT author_id FROM public.books WHERE id = book_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT author_id FROM public.series WHERE id = series_id)
    AND
    auth.uid() = (SELECT author_id FROM public.books WHERE id = book_id)
  );

-- Create new DELETE policy: user must own BOTH the series and the book
CREATE POLICY "Authors can remove books from their series"
  ON public.series_books FOR DELETE
  TO authenticated
  USING (
    auth.uid() = (SELECT author_id FROM public.series WHERE id = series_id)
    AND
    auth.uid() = (SELECT author_id FROM public.books WHERE id = book_id)
  );
