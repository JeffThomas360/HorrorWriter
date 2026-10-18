-- Midnight Rituals in The Crypt (Forum)
-- Stories written for the Midnight Ritual are published to The Crypt (threads/posts)
-- under category 'rituals' rather than The Library (books).
-- Five weekly rotating prompts form sub-categories where members submit entries
-- and receive community critiques.

-- 1. Ensure 'rituals' category exists in public.categories
insert into public.categories (id, name, description, sort_order)
values (
  'rituals',
  'Midnight Rituals · Prompts',
  'Five weekly rotating ritual prompts and member story submissions for critique.',
  0
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- 2. Link threads to ritual_prompts
alter table public.threads
  add column if not exists prompt_id uuid references public.ritual_prompts(id) on delete set null;

create index if not exists threads_prompt_id_idx on public.threads (prompt_id) where prompt_id is not null;

-- 3. Update create_thread_with_post to accept optional prompt_id
create or replace function public.create_thread_with_post(
  p_title text,
  p_category_id text,
  p_content text,
  p_prompt_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_thread_id uuid;
begin
  insert into public.threads (title, category_id, author_id, prompt_id)
  values (p_title, p_category_id, auth.uid(), p_prompt_id)
  returning id into v_thread_id;

  insert into public.posts (thread_id, author_id, content)
  values (v_thread_id, auth.uid(), p_content);

  return v_thread_id;
end;
$$;

revoke all on function public.create_thread_with_post(text, text, text, uuid) from public, anon;
grant execute on function public.create_thread_with_post(text, text, text, uuid) to authenticated;
grant execute on function public.create_thread_with_post(text, text, text, uuid) to service_role;

-- 4. Update share_ritual_draft to publish into The Crypt (threads/posts)
create or replace function public.share_ritual_draft(p_draft_id uuid, p_title text)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_draft public.ritual_drafts;
  v_title text := btrim(coalesce(p_title, ''));
  v_thread_id uuid;
begin
  if char_length(v_title) not between 1 and 200 then
    raise exception 'bad_title' using errcode = 'HW013';
  end if;
  select * into v_draft from public.ritual_drafts
  where id = p_draft_id and author_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  insert into public.threads (title, category_id, author_id, prompt_id)
  values (v_title, 'rituals', auth.uid(), v_draft.prompt_id)
  returning id into v_thread_id;

  insert into public.posts (thread_id, author_id, content)
  values (v_thread_id, auth.uid(), v_draft.content);

  delete from public.ritual_drafts where id = v_draft.id;
  return v_thread_id;
end $$;

revoke all on function public.share_ritual_draft(uuid, text) from public, anon;
grant execute on function public.share_ritual_draft(uuid, text) to authenticated;

notify pgrst, 'reload schema';
