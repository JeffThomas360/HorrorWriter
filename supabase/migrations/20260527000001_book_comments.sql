-- Create the book_comments table
create table public.book_comments (
  id uuid default gen_random_uuid() primary key,
  book_id uuid references public.books(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security
alter table public.book_comments enable row level security;

-- Create RLS policies for book_comments
create policy "Book comments are viewable by everyone." on public.book_comments
  for select using (true);

create policy "Users can insert their own book comments." on public.book_comments
  for insert with check (auth.uid() = author_id);

create policy "Users can update own book comments." on public.book_comments
  for update using (auth.uid() = author_id);

create policy "Users can delete own book comments." on public.book_comments
  for delete using (auth.uid() = author_id);

-- Keep updated_at fresh
create trigger book_comments_set_updated_at
  before update on public.book_comments
  for each row execute procedure public.touch_profile_updated_at();

-- Function to increment book comments count
create or replace function public.handle_new_book_comment()
returns trigger as $$
begin
  update public.books
  set comments_count = comments_count + 1
  where id = new.book_id;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to increment comments_count when a comment is added
create trigger on_book_comment_created
  after insert on public.book_comments
  for each row execute procedure public.handle_new_book_comment();
