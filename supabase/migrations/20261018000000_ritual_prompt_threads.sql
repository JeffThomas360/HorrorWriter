-- Midnight Rituals Critique Room: one thread per prompt.
-- The first published entry for a prompt creates its thread (system-authored,
-- opening post = the prompt). Every later entry joins that thread. Critique is
-- a comment on a single entry (posts.parent_post_id, one level deep).

-- 1. Category name
update public.categories
set name = 'Midnight Rituals Critique Room',
    description = 'One thread per Midnight Ritual prompt. Each entry is a story; critique it in its comments.'
where id = 'rituals';

-- 2. Entries carry their own title; comments point at an entry
alter table public.posts
  add column if not exists title text check (title is null or char_length(btrim(title)) between 1 and 200),
  add column if not exists parent_post_id uuid references public.posts(id) on delete cascade;
create index if not exists posts_parent_post_id_idx on public.posts (parent_post_id) where parent_post_id is not null;

create or replace function public.check_post_parent()
returns trigger language plpgsql set search_path = '' as $$
declare v_parent public.posts;
begin
  if new.parent_post_id is null then return new; end if;
  select * into v_parent from public.posts where id = new.parent_post_id;
  if v_parent.thread_id is distinct from new.thread_id then
    raise exception 'parent_other_thread' using errcode = 'HW020';
  end if;
  if v_parent.parent_post_id is not null then
    raise exception 'parent_not_top_level' using errcode = 'HW021';
  end if;
  return new;
end $$;
drop trigger if exists on_post_check_parent on public.posts;
create trigger on_post_check_parent before insert or update of parent_post_id, thread_id on public.posts
  for each row execute function public.check_post_parent();

-- 3. Fold existing per-submission ritual threads into one thread per prompt.
--    Old opening post -> entry (titled with the old thread title);
--    old replies -> comments on that entry.
do $$
declare r record; v_new uuid; v_op uuid;
begin
  for r in select distinct t.prompt_id, p.body
           from public.threads t join public.ritual_prompts p on p.id = t.prompt_id
           where t.category_id = 'rituals' loop
    insert into public.threads (title, category_id, author_id, prompt_id)
    values (left(r.body, 200), 'rituals', null, null) returning id into v_new;
    insert into public.posts (thread_id, author_id, content) values (v_new, null, r.body);

    for v_op in select distinct on (t.id) p.id
                from public.threads t join public.posts p on p.thread_id = t.id
                where t.prompt_id = r.prompt_id and t.id <> v_new
                order by t.id, p.created_at, p.id loop
      update public.posts c set parent_post_id = v_op
        where c.thread_id = (select thread_id from public.posts where id = v_op) and c.id <> v_op;
      update public.posts e set title = (select title from public.threads where id = e.thread_id)
        where e.id = v_op;
      update public.posts set thread_id = v_new
        where thread_id = (select thread_id from public.posts where id = v_op);
    end loop;

    delete from public.threads where prompt_id = r.prompt_id;
    update public.threads set prompt_id = r.prompt_id,
      replies_count = (select count(*) - 1 from public.posts where thread_id = v_new and mod_status = 'live')
      where id = v_new;
  end loop;
end $$;

create unique index if not exists threads_one_per_prompt on public.threads (prompt_id) where prompt_id is not null;

-- 4. Publish an entry: get-or-create the prompt's thread, add the entry.
create or replace function public.ritual_publish_entry(p_prompt_id uuid, p_title text, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_prompt public.ritual_prompts;
  v_thread uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if public.is_banned(v_uid) then raise exception 'banned' using errcode = '42501'; end if;
  if char_length(v_title) not between 1 and 200 then raise exception 'bad_title' using errcode = 'HW013'; end if;
  if char_length(btrim(coalesce(p_content, ''))) not between 1 and 6000 then
    raise exception 'bad_content' using errcode = 'HW014';
  end if;
  select * into v_prompt from public.ritual_prompts
  where id = p_prompt_id and status = 'scheduled' and goes_live_at <= now();
  if not found then raise exception 'prompt_not_live' using errcode = 'P0002'; end if;

  insert into public.threads (title, category_id, author_id, prompt_id)
  values (left(v_prompt.body, 200), 'rituals', null, p_prompt_id)
  on conflict (prompt_id) where prompt_id is not null do nothing
  returning id into v_thread;
  if v_thread is null then
    select id into v_thread from public.threads where prompt_id = p_prompt_id;
  else
    insert into public.posts (thread_id, author_id, content) values (v_thread, null, v_prompt.body);
  end if;

  insert into public.posts (thread_id, author_id, content, title)
  values (v_thread, v_uid, p_content, v_title);
  return v_thread;
end $$;
revoke all on function public.ritual_publish_entry(uuid, text, text) from public, anon;
grant execute on function public.ritual_publish_entry(uuid, text, text) to authenticated;

-- 5. Both existing publish paths now go through ritual_publish_entry.
create or replace function public.share_ritual_draft(p_draft_id uuid, p_title text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_draft public.ritual_drafts; v_thread uuid;
begin
  select * into v_draft from public.ritual_drafts where id = p_draft_id and author_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_thread := public.ritual_publish_entry(v_draft.prompt_id, p_title, v_draft.content);
  delete from public.ritual_drafts where id = v_draft.id;
  return v_thread;
end $$;

create or replace function public.create_thread_with_post(
  p_title text, p_category_id text, p_content text, p_prompt_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_thread_id uuid;
begin
  if p_category_id = 'rituals' then
    if p_prompt_id is null then raise exception 'ritual_needs_prompt' using errcode = 'HW022'; end if;
    return public.ritual_publish_entry(p_prompt_id, p_title, p_content);
  end if;
  insert into public.threads (title, category_id, author_id) values (p_title, p_category_id, auth.uid())
  returning id into v_thread_id;
  insert into public.posts (thread_id, author_id, content) values (v_thread_id, auth.uid(), p_content);
  return v_thread_id;
end $$;

notify pgrst, 'reload schema';
