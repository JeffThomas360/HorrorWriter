-- Create the books table
create table public.books (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  lede text not null,
  cover text, -- e.g. 'red', 'bone', 'cyan'
  badge text,
  chapters_info text,
  comments_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security
alter table public.books enable row level security;

-- Create policies
create policy "Public books are viewable by everyone." on public.books
  for select using (true);

create policy "Users can insert their own books." on public.books
  for insert with check (auth.uid() = author_id);

create policy "Users can update own books." on public.books
  for update using (auth.uid() = author_id);

create policy "Users can delete own books." on public.books
  for delete using (auth.uid() = author_id);
