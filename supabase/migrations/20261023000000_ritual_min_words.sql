-- Midnight Ritual: a response needs at least 100 words to be published.
-- Drafts stay savable at any length. Words are counted without the Markdown
-- marks the editor writes on their own (a scene break line, the > of a quote),
-- mirroring countRitualWords() in src/lib/ritualDraft.js.

create or replace function public.ritual_word_count(p_text text)
returns integer
language sql immutable
set search_path = ''
as $$
  select regexp_count(
    regexp_replace(
      regexp_replace(coalesce(p_text, ''), '^[ \t]*([-*_][ \t]*){3,}[ \t]*$', '', 'gn'),
      '^[ \t]*>+[ \t]?', '', 'gn'),
    '\S+')
$$;
revoke all on function public.ritual_word_count(text) from public, anon;
grant execute on function public.ritual_word_count(text) to authenticated, service_role;

-- Drafts: the 2000-word cap uses the same count.
alter table public.ritual_drafts drop constraint ritual_drafts_content_check;
alter table public.ritual_drafts add constraint ritual_drafts_content_check check (
  public.ritual_word_count(content) between 1 and 2000
  and char_length(content) <= 16000);

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
  if char_length(btrim(coalesce(p_content, ''))) not between 1 and 16000
     or public.ritual_word_count(p_content) > 2000 then
    raise exception 'bad_content' using errcode = 'HW014';
  end if;
  if public.ritual_word_count(p_content) < 100 then
    raise exception 'too_short' using errcode = 'HW023';
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

notify pgrst, 'reload schema';
