-- Admin → Overview → "Download all members' writing": one readable .zip of everything members
-- have published, so their work survives whatever happens to the database or its backups.
--
-- A keeper reading the tables directly would miss rows: content_visible() hides a member's work
-- from anyone who has blocked them. So this is one SECURITY DEFINER read, gated to keepers, that
-- returns every member's published writing as it stands now:
--   books          member stories (not the classics, not ones the author removed)
--   threads        every thread the author hasn't removed, prompt threads included (titles for
--                  the posts inside them)
--   posts          forum posts, replies, ritual entries and ritual critiques
--   book_comments  critiques on stories
--   series, series_books, ritual_prompts (the prompt text behind ritual threads)
--   members        every profile's id and handle
-- Hidden and screening rows are included with their status. Rows with no author (an account that
-- was deleted) are left out, as are ritual drafts (private and unpublished) and anything a member
-- kept in their vault (encrypted with a code only they hold).

create function public.admin_export_writing()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.mod_can('configure', 'all') then
    raise exception 'Only a keeper can download everyone''s writing' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle) order by p.handle)
        from public.profiles p), '[]'::jsonb),
    'books', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'author_id', b.author_id, 'title', b.title, 'lede', b.lede,
               'content', b.content, 'cover', b.cover, 'mod_status', b.mod_status,
               'prompt_id', b.prompt_id, 'created_at', b.created_at, 'updated_at', b.updated_at)
             order by b.created_at, b.id)
        from public.books b
       where b.author_id is not null and b.archive_author is null and not b.removed_by_author), '[]'::jsonb),
    'threads', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'author_id', t.author_id, 'title', t.title, 'category_id', t.category_id,
               'mod_status', t.mod_status, 'prompt_id', t.prompt_id, 'created_at', t.created_at)
             order by t.created_at, t.id)
        from public.threads t
       where not t.removed_by_author), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'author_id', p.author_id, 'thread_id', p.thread_id,
               'parent_post_id', p.parent_post_id, 'title', p.title, 'content', p.content,
               'mod_status', p.mod_status, 'created_at', p.created_at, 'updated_at', p.updated_at)
             order by p.created_at, p.id)
        from public.posts p
       where p.author_id is not null), '[]'::jsonb),
    'book_comments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'author_id', c.author_id, 'book_id', c.book_id, 'content', c.content,
               'mod_status', c.mod_status, 'created_at', c.created_at)
             order by c.created_at, c.id)
        from public.book_comments c
       where c.author_id is not null), '[]'::jsonb),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'author_id', s.author_id, 'title', s.title,
               'description', s.description, 'created_at', s.created_at)
             order by s.created_at, s.id)
        from public.series s), '[]'::jsonb),
    'series_books', coalesce((
      select jsonb_agg(jsonb_build_object(
               'series_id', sb.series_id, 'book_id', sb.book_id, 'sort_order', sb.sort_order)
             order by sb.series_id, sb.sort_order, sb.book_id)
        from public.series_books sb), '[]'::jsonb),
    'ritual_prompts', coalesce((
      select jsonb_agg(jsonb_build_object('id', rp.id, 'body', rp.body) order by rp.id)
        from public.ritual_prompts rp
       where exists (select 1 from public.threads t where t.prompt_id = rp.id)), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_export_writing() from public, anon;
grant execute on function public.admin_export_writing() to authenticated;

NOTIFY pgrst, 'reload schema';
