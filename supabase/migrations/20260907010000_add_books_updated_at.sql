-- supabase/migrations/20260907010000_add_books_updated_at.sql

-- 1. Add updated_at column to books table
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;

-- 2. Attach updated_at auto-updating trigger matching posts, threads, and book_comments
CREATE OR REPLACE TRIGGER books_set_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_profile_updated_at();
