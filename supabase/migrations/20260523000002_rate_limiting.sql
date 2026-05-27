-- Rate Limiting Enforcement Trigger
-- Prevents a single user from spamming the database with inserts.

create or replace function public.enforce_rate_limit()
returns trigger as $$
declare
  recent_count integer;
  limit_count integer;
  limit_interval interval;
begin
  -- 1. Determine limits based on the table being inserted into
  if TG_TABLE_NAME = 'posts' then
    limit_count := 10;
    limit_interval := interval '5 minutes';
  elsif TG_TABLE_NAME = 'threads' then
    limit_count := 5;
    limit_interval := interval '15 minutes';
  elsif TG_TABLE_NAME = 'books' then
    limit_count := 3;
    limit_interval := interval '1 hour';
  else
    return new;
  end if;

  -- 2. Count how many records this user has created within the time window
  -- Using execute format() allows us to dynamically query the correct table
  execute format(
    'select count(*) from public.%I where author_id = $1 and created_at > (now() - $2)',
    TG_TABLE_NAME
  )
  into recent_count
  using auth.uid(), limit_interval;

  -- 3. Throw a Postgres exception if they exceed the limit. 
  -- Supabase/PostgREST will catch this and return it as a clean HTTP 400 error to the frontend.
  if recent_count >= limit_count then
    raise exception 'Rate limit exceeded for %. You must wait before posting again.', TG_TABLE_NAME;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Attach the trigger to the tables
drop trigger if exists rate_limit_posts on public.posts;
create trigger rate_limit_posts
  before insert on public.posts
  for each row execute procedure public.enforce_rate_limit();

drop trigger if exists rate_limit_threads on public.threads;
create trigger rate_limit_threads
  before insert on public.threads
  for each row execute procedure public.enforce_rate_limit();

drop trigger if exists rate_limit_books on public.books;
create trigger rate_limit_books
  before insert on public.books
  for each row execute procedure public.enforce_rate_limit();
