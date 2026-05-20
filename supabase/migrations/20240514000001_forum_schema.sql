-- Create categories table
create table public.categories (
  id text primary key, -- 'crypt', 'seance', etc.
  name text not null,
  description text,
  sort_order integer default 0
);

-- Pre-populate categories
insert into public.categories (id, name, sort_order) values
  ('crypt', 'The Crypt · Critique', 1),
  ('seance', 'The Séance · Craft', 2),
  ('dispatch', 'Dispatches · Market', 3),
  ('hours', 'After Hours', 4),
  ('coven', 'The Coven · Announcements', 5);

-- Create threads table
create table public.threads (
  id uuid default gen_random_uuid() primary key,
  category_id text references public.categories(id) on delete restrict not null,
  title text not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  pinned boolean default false,
  replies_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security
alter table public.categories enable row level security;
alter table public.threads enable row level security;

-- Create policies for categories (read-only for public)
create policy "Categories are viewable by everyone." on public.categories
  for select using (true);

-- Create policies for threads
create policy "Threads are viewable by everyone." on public.threads
  for select using (true);

create policy "Users can insert their own threads." on public.threads
  for insert with check (auth.uid() = author_id);

create policy "Users can update own threads." on public.threads
  for update using (auth.uid() = author_id);

create policy "Users can delete own threads." on public.threads
  for delete using (auth.uid() = author_id);

-- Keep updated_at fresh
create trigger threads_set_updated_at
  before update on public.threads
  for each row execute procedure public.touch_profile_updated_at(); -- Reusing existing function
