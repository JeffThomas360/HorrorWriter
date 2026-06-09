-- Performance: wrap auth.uid() in a scalar subselect so Postgres evaluates it
-- ONCE per query instead of once per row (Supabase advisor 0003, auth_rls_initplan).
-- Behaviour is identical; only the query plan changes.
--
-- Policy definitions below are reproduced from the LIVE database (pg_policies),
-- not the repo migrations, because the auth tables have drifted from the repo.
-- The "viewable by everyone" SELECT policies use `true` and are intentionally
-- left untouched.

-- profiles -------------------------------------------------------------------
drop policy if exists "Users can insert their own profile." on public.profiles;
create policy "Users can insert their own profile." on public.profiles
  for insert with check ((select auth.uid()) = id);

drop policy if exists "Users can update own profile." on public.profiles;
create policy "Users can update own profile." on public.profiles
  for update using ((select auth.uid()) = id);

-- passkey_credentials --------------------------------------------------------
drop policy if exists "Users can view their own passkeys." on public.passkey_credentials;
create policy "Users can view their own passkeys." on public.passkey_credentials
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own passkeys." on public.passkey_credentials;
create policy "Users can delete their own passkeys." on public.passkey_credentials
  for delete using ((select auth.uid()) = user_id);

-- books ----------------------------------------------------------------------
drop policy if exists "Users can insert their own books." on public.books;
create policy "Users can insert their own books." on public.books
  for insert with check ((select auth.uid()) = author_id);

drop policy if exists "Users can update own books." on public.books;
create policy "Users can update own books." on public.books
  for update using ((select auth.uid()) = author_id);

drop policy if exists "Users can delete own books." on public.books;
create policy "Users can delete own books." on public.books
  for delete using ((select auth.uid()) = author_id);

-- threads --------------------------------------------------------------------
drop policy if exists "Users can insert their own threads." on public.threads;
create policy "Users can insert their own threads." on public.threads
  for insert with check ((select auth.uid()) = author_id);

drop policy if exists "Users can update own threads." on public.threads;
create policy "Users can update own threads." on public.threads
  for update using ((select auth.uid()) = author_id);

drop policy if exists "Users can delete own threads." on public.threads;
create policy "Users can delete own threads." on public.threads
  for delete using ((select auth.uid()) = author_id);

-- posts ----------------------------------------------------------------------
drop policy if exists "Users can insert their own posts." on public.posts;
create policy "Users can insert their own posts." on public.posts
  for insert with check ((select auth.uid()) = author_id);

drop policy if exists "Users can update own posts." on public.posts;
create policy "Users can update own posts." on public.posts
  for update using ((select auth.uid()) = author_id);

drop policy if exists "Users can delete own posts." on public.posts;
create policy "Users can delete own posts." on public.posts
  for delete using ((select auth.uid()) = author_id);

-- book_comments --------------------------------------------------------------
drop policy if exists "Users can insert their own book comments." on public.book_comments;
create policy "Users can insert their own book comments." on public.book_comments
  for insert with check ((select auth.uid()) = author_id);

drop policy if exists "Users can update own book comments." on public.book_comments;
create policy "Users can update own book comments." on public.book_comments
  for update using ((select auth.uid()) = author_id);

drop policy if exists "Users can delete own book comments." on public.book_comments;
create policy "Users can delete own book comments." on public.book_comments
  for delete using ((select auth.uid()) = author_id);
