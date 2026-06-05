-- 1. Add is_admin to profiles
alter table public.profiles add column is_admin boolean default false;

-- 2. Add hidden column to content tables
alter table public.books add column hidden boolean default false;
alter table public.threads add column hidden boolean default false;
alter table public.posts add column hidden boolean default false;
alter table public.book_comments add column hidden boolean default false;

-- 3. Create moderation_flags table
create table public.moderation_flags (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('story', 'critique', 'thread', 'post')),
  target_id uuid not null,
  reason text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint reporter_target_unique unique (reporter_id, target_type, target_id)
);

-- Create index for performance
create index idx_moderation_flags_target on public.moderation_flags(target_type, target_id);

-- 4. Enable Row Level Security on moderation_flags
alter table public.moderation_flags enable row level security;

-- 5. Create RLS Policies for moderation_flags
create policy "Admins can view all flags." on public.moderation_flags
  for select using (coalesce((select is_admin from public.profiles where id = auth.uid()), false) = true);

create policy "Authenticated users can create flags." on public.moderation_flags
  for insert with check (auth.uid() = reporter_id);

create policy "Admins can delete flags." on public.moderation_flags
  for delete using (coalesce((select is_admin from public.profiles where id = auth.uid()), false) = true);

-- 6. Recreate SELECT RLS Policies for content tables to hide moderated items
-- 6a. books
drop policy if exists "Public books are viewable by everyone." on public.books;
create policy "Public books are viewable by everyone." on public.books
  for select using (
    not hidden 
    or auth.uid() = author_id 
    or coalesce((select is_admin from public.profiles where id = auth.uid()), false) = true
  );

-- 6b. threads
drop policy if exists "Threads are viewable by everyone." on public.threads;
create policy "Threads are viewable by everyone." on public.threads
  for select using (
    not hidden 
    or auth.uid() = author_id 
    or coalesce((select is_admin from public.profiles where id = auth.uid()), false) = true
  );

-- 6c. posts
drop policy if exists "Posts are viewable by everyone." on public.posts;
create policy "Posts are viewable by everyone." on public.posts
  for select using (
    not hidden 
    or auth.uid() = author_id 
    or coalesce((select is_admin from public.profiles where id = auth.uid()), false) = true
  );

-- 6d. book_comments (critiques)
drop policy if exists "Book comments are viewable by everyone." on public.book_comments;
create policy "Book comments are viewable by everyone." on public.book_comments
  for select using (
    not hidden 
    or auth.uid() = author_id 
    or coalesce((select is_admin from public.profiles where id = auth.uid()), false) = true
  );

-- 7. Trigger to auto-hide content once it reaches 5 flags
create or replace function public.handle_new_flag()
returns trigger as $$
declare
  v_flag_count integer;
begin
  -- Count flags for the target
  select count(*) into v_flag_count
  from public.moderation_flags
  where target_type = new.target_type and target_id = new.target_id;
  
  -- If target has reached 5 flags, hide it automatically
  if v_flag_count >= 5 then
    if new.target_type = 'story' then
      update public.books set hidden = true where id = new.target_id;
    elsif new.target_type = 'critique' then
      update public.book_comments set hidden = true where id = new.target_id;
    elsif new.target_type = 'thread' then
      update public.threads set hidden = true where id = new.target_id;
    elsif new.target_type = 'post' then
      update public.posts set hidden = true where id = new.target_id;
    end if;
  end if;
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_flag_created
  after insert on public.moderation_flags
  for each row execute procedure public.handle_new_flag();
