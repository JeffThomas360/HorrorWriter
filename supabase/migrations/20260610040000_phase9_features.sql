-- ==========================================
-- 1. User Follows / Subscriptions
-- ==========================================
CREATE TABLE public.user_follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view followers" 
  ON public.user_follows FOR SELECT 
  USING (true);

CREATE POLICY "Users can follow others" 
  ON public.user_follows FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow others" 
  ON public.user_follows FOR DELETE 
  TO authenticated
  USING (auth.uid() = follower_id);

-- ==========================================
-- 2. Series & Anthologies
-- ==========================================
CREATE TABLE public.series (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Series are readable by everyone" 
  ON public.series FOR SELECT 
  USING (true);

CREATE POLICY "Authors can create series" 
  ON public.series FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their series" 
  ON public.series FOR UPDATE 
  TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can delete their series" 
  ON public.series FOR DELETE 
  TO authenticated
  USING (auth.uid() = author_id);

-- ==========================================
-- 3. Series Books (Many-to-Many join table)
-- ==========================================
CREATE TABLE public.series_books (
  series_id uuid references public.series(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  sort_order int not null default 0,
  primary key (series_id, book_id)
);

ALTER TABLE public.series_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Series books are readable by everyone" 
  ON public.series_books FOR SELECT 
  USING (true);

-- To insert/update/delete a book from a series, the user must own the series
CREATE POLICY "Authors can manage books in their series" 
  ON public.series_books FOR ALL 
  TO authenticated
  USING (auth.uid() = (SELECT author_id FROM public.series WHERE id = series_id))
  WITH CHECK (auth.uid() = (SELECT author_id FROM public.series WHERE id = series_id));
