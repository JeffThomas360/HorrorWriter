-- Fix stale thread reply counts (P3 audit finding, 2026-07-03).
--
-- handle_new_post() increments threads.replies_count unconditionally at insert
-- time, before moderation review. When a reply is later hidden or moved to
-- screening (mod_status leaves 'live'), the counter stays inflated relative to
-- the posts actually visible to readers (RLS's content_visible() filters those
-- out). This adds the missing decrement/re-increment on mod_status transitions.
--
-- The thread's original post (OP) is never counted in replies_count (see
-- handle_new_post's prior_count check), so this trigger must skip the OP too —
-- identified here as the earliest post by created_at in the thread.

CREATE OR REPLACE FUNCTION "public"."adjust_replies_count_on_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  is_op boolean;
begin
  if new.mod_status is distinct from old.mod_status then
    select not exists (
      select 1 from public.posts
      where thread_id = new.thread_id
        and created_at < new.created_at
    ) into is_op;

    if not is_op then
      if old.mod_status = 'live' and new.mod_status <> 'live' then
        update public.threads
        set replies_count = greatest(replies_count - 1, 0)
        where id = new.thread_id;
      elsif old.mod_status <> 'live' and new.mod_status = 'live' then
        update public.threads
        set replies_count = replies_count + 1
        where id = new.thread_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

ALTER FUNCTION "public"."adjust_replies_count_on_status_change"() OWNER TO "postgres";

CREATE TRIGGER "trg_posts_adjust_replies_on_status_change"
  AFTER UPDATE ON "public"."posts"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."adjust_replies_count_on_status_change"();

-- Trigger-only function; same hardening as 20260702000000_revoke_trigger_fn_execute.sql.
REVOKE ALL ON FUNCTION public.adjust_replies_count_on_status_change() FROM PUBLIC, anon, authenticated;
