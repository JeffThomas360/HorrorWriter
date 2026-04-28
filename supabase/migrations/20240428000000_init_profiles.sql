-- Create the profiles table
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  handle text unique,
  display_name text,
  bio text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security
alter table public.profiles enable row level security;

-- Create policies
create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (true);

create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on public.profiles
  for update using (auth.uid() = id);

-- Create a trigger to automatically create a profile when a new user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    -- Default handle: part of email or generated UUID string
    coalesce(split_part(new.email, '@', 1) || '-' || substr(md5(random()::text), 1, 4), 'user-' || substr(new.id::text, 1, 8)),
    coalesce(split_part(new.email, '@', 1), 'Writer')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
