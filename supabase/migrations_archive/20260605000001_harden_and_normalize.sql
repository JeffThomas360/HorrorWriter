-- 1. Add website URL check constraint to protect against javascript: URL injections
alter table public.profiles 
  add constraint check_website_url 
  check (website_url is null or website_url = '' or website_url ~* '^https?://');

-- 2. Update handle_new_user trigger function to normalize handles
create or replace function public.handle_new_user()
returns trigger as $$
declare
  clean_prefix text;
begin
  -- Force lowercase, strip spaces, and allow only lowercase letters, numbers, dots, hyphens, and underscores
  clean_prefix := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9._-]', '', 'g');
  -- Truncate to make room for suffix
  clean_prefix := substring(clean_prefix from 1 for 25);
  
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    coalesce(clean_prefix || '-' || substr(md5(random()::text), 1, 4), 'user-' || substr(new.id::text, 1, 8)),
    coalesce(split_part(new.email, '@', 1), 'Writer')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 3. Create atomic thread and post creation RPC
create or replace function public.create_thread_with_post(
  p_title text,
  p_category_id uuid,
  p_content text
) returns uuid as $$
declare
  v_thread_id uuid;
begin
  insert into public.threads (title, category_id, author_id)
  values (p_title, p_category_id, auth.uid())
  returning id into v_thread_id;

  insert into public.posts (thread_id, author_id, content)
  values (v_thread_id, auth.uid(), p_content);

  return v_thread_id;
end;
$$ language plpgsql security definer set search_path = '';

-- Grant execute to authenticated users (so they can call RPC from client)
grant execute on function public.create_thread_with_post(text, uuid, text) to authenticated;
