-- Add content column to books
alter table public.books add column content text;

-- Create posts table for forum thread replies
create table public.posts (
  id uuid default gen_random_uuid() primary key,
  thread_id uuid references public.threads(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security
alter table public.posts enable row level security;

-- Create policies for posts
create policy "Posts are viewable by everyone." on public.posts
  for select using (true);

create policy "Users can insert their own posts." on public.posts
  for insert with check (auth.uid() = author_id);

create policy "Users can update own posts." on public.posts
  for update using (auth.uid() = author_id);

create policy "Users can delete own posts." on public.posts
  for delete using (auth.uid() = author_id);

-- Keep updated_at fresh
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute procedure public.touch_profile_updated_at();

-- Function to increment thread replies count and bump updated_at
create or replace function public.handle_new_post()
returns trigger as $$
begin
  update public.threads
  set replies_count = replies_count + 1,
      updated_at = timezone('utc'::text, now())
  where id = new.thread_id;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to increment thread replies count when a post is added
create trigger on_post_created
  after insert on public.posts
  for each row execute procedure public.handle_new_post();
