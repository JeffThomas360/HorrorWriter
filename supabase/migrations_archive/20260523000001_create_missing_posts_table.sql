-- Recovery migration.
--
-- The remote migration history records 20240520000000_content_schemas.sql as
-- applied, but the public.posts table doesn't actually exist on remote
-- (drift, partial failure, or a manual drop somewhere along the way).
--
-- This migration idempotently creates the missing posts table, the books.content
-- column, the policies, and the triggers. It deliberately does NOT redefine
-- public.handle_new_post() because 20260523000000_fix_replies_count.sql already
-- installed the corrected version that doesn't count the OP as a reply.

-- 1. books.content column (no-op if already present)
alter table public.books add column if not exists content text;

-- 2. posts table
create table if not exists public.posts (
  id uuid default gen_random_uuid() primary key,
  thread_id uuid references public.threads(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. RLS
alter table public.posts enable row level security;

-- 4. Policies (CREATE POLICY has no IF NOT EXISTS, so guard each one)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'posts'
      and policyname = 'Posts are viewable by everyone.'
  ) then
    create policy "Posts are viewable by everyone." on public.posts
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'posts'
      and policyname = 'Users can insert their own posts.'
  ) then
    create policy "Users can insert their own posts." on public.posts
      for insert with check (auth.uid() = author_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'posts'
      and policyname = 'Users can update own posts.'
  ) then
    create policy "Users can update own posts." on public.posts
      for update using (auth.uid() = author_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'posts'
      and policyname = 'Users can delete own posts.'
  ) then
    create policy "Users can delete own posts." on public.posts
      for delete using (auth.uid() = author_id);
  end if;
end $$;

-- 5. updated_at trigger on posts
drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute procedure public.touch_profile_updated_at();

-- 6. Hook posts inserts to our (already-corrected) reply-counter function
drop trigger if exists on_post_created on public.posts;
create trigger on_post_created
  after insert on public.posts
  for each row execute procedure public.handle_new_post();

-- 7. Backfill replies_count now that posts exists. (The earlier fix migration
--    skipped this because posts didn't exist yet.)
update public.threads t
set replies_count = greatest(0, (
  select count(*) - 1
  from public.posts p
  where p.thread_id = t.id
));
