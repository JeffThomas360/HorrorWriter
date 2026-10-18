-- Replies to critiques. Depth is capped at two: entry -> critique -> replies.
-- A reply to a reply attaches to the same critique (the UI only offers that).
create or replace function public.check_post_parent()
returns trigger language plpgsql set search_path = '' as $$
declare v_parent public.posts; v_grand public.posts;
begin
  if new.parent_post_id is null then return new; end if;
  select * into v_parent from public.posts where id = new.parent_post_id;
  if v_parent.thread_id is distinct from new.thread_id then
    raise exception 'parent_other_thread' using errcode = 'HW020';
  end if;
  if v_parent.parent_post_id is not null then
    select * into v_grand from public.posts where id = v_parent.parent_post_id;
    if v_grand.parent_post_id is not null then
      raise exception 'parent_too_deep' using errcode = 'HW021';
    end if;
  end if;
  return new;
end $$;
