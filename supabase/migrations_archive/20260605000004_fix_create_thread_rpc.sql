-- Drop the old function with the incorrect signature
drop function if exists public.create_thread_with_post(text, uuid, text);

-- Recreate with the correct text parameter type for category_id
create or replace function public.create_thread_with_post(
  p_title text,
  p_category_id text,
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

-- Grant execute to authenticated users
grant execute on function public.create_thread_with_post(text, text, text) to authenticated;
