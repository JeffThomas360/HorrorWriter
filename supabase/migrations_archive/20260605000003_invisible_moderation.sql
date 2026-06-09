-- 1. Add columns is_shadowbanned and requires_screening to profiles
alter table public.profiles add column is_shadowbanned boolean default false not null;
alter table public.profiles add column requires_screening boolean default false not null;

-- 2. Add approved column to content tables
alter table public.books add column approved boolean default true not null;
alter table public.threads add column approved boolean default true not null;
alter table public.posts add column approved boolean default true not null;
alter table public.book_comments add column approved boolean default true not null;

-- 3. Create before insert trigger function to auto-unapprove content for screened users
create or replace function public.check_requires_screening()
returns trigger as $$
declare
  v_requires_screening boolean;
begin
  select requires_screening into v_requires_screening
  from public.profiles
  where id = new.author_id;

  if coalesce(v_requires_screening, false) then
    new.approved := false;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Attach trigger to public.books, public.threads, public.posts, public.book_comments
create trigger check_book_screening
  before insert on public.books
  for each row execute procedure public.check_requires_screening();

create trigger check_thread_screening
  before insert on public.threads
  for each row execute procedure public.check_requires_screening();

create trigger check_post_screening
  before insert on public.posts
  for each row execute procedure public.check_requires_screening();

create trigger check_comment_screening
  before insert on public.book_comments
  for each row execute procedure public.check_requires_screening();

-- 4. Recreate RLS SELECT Policies to account for shadowbans and screening
-- 4a. books
drop policy if exists "Public books are viewable by everyone." on public.books;
create policy "Public books are viewable by everyone." on public.books
  for select using (
    (
      not hidden 
      and approved 
      and not coalesce((select is_shadowbanned from public.profiles where id = author_id), false)
    )
    or (select auth.uid()) = author_id 
    or coalesce((select is_admin from public.profiles where id = (select auth.uid())), false) = true
  );

-- 4b. threads
drop policy if exists "Threads are viewable by everyone." on public.threads;
create policy "Threads are viewable by everyone." on public.threads
  for select using (
    (
      not hidden 
      and approved 
      and not coalesce((select is_shadowbanned from public.profiles where id = author_id), false)
    )
    or (select auth.uid()) = author_id 
    or coalesce((select is_admin from public.profiles where id = (select auth.uid())), false) = true
  );

-- 4c. posts
drop policy if exists "Posts are viewable by everyone." on public.posts;
create policy "Posts are viewable by everyone." on public.posts
  for select using (
    (
      not hidden 
      and approved 
      and not coalesce((select is_shadowbanned from public.profiles where id = author_id), false)
    )
    or (select auth.uid()) = author_id 
    or coalesce((select is_admin from public.profiles where id = (select auth.uid())), false) = true
  );

-- 4d. book_comments (critiques)
drop policy if exists "Book comments are viewable by everyone." on public.book_comments;
create policy "Book comments are viewable by everyone." on public.book_comments
  for select using (
    (
      not hidden 
      and approved 
      and not coalesce((select is_shadowbanned from public.profiles where id = author_id), false)
    )
    or (select auth.uid()) = author_id 
    or coalesce((select is_admin from public.profiles where id = (select auth.uid())), false) = true
  );

-- 5. Add update policies for admins to update profiles and all content tables
drop policy if exists "Admins can update all profiles." on public.profiles;
create policy "Admins can update all profiles." on public.profiles
  for update using (coalesce((select is_admin from public.profiles where id = (select auth.uid())), false) = true);

drop policy if exists "Admins can update all books." on public.books;
create policy "Admins can update all books." on public.books
  for update using (coalesce((select is_admin from public.profiles where id = (select auth.uid())), false) = true);

drop policy if exists "Admins can update all threads." on public.threads;
create policy "Admins can update all threads." on public.threads
  for update using (coalesce((select is_admin from public.profiles where id = (select auth.uid())), false) = true);

drop policy if exists "Admins can update all posts." on public.posts;
create policy "Admins can update all posts." on public.posts
  for update using (coalesce((select is_admin from public.profiles where id = (select auth.uid())), false) = true);

drop policy if exists "Admins can update all book comments." on public.book_comments;
create policy "Admins can update all book comments." on public.book_comments
  for update using (coalesce((select is_admin from public.profiles where id = (select auth.uid())), false) = true);
