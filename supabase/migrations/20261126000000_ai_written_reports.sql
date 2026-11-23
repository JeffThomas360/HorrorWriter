-- "Written by AI" as a report reason, and a way for the screening function to file
-- a quiet note about a story.
--
-- Stories must be written by the member (House Rule 4). Members can report one that
-- isn't; the publish-time screening can file the same kind of report by itself when a
-- story looks like raw chatbot output. That note is only a note: it never touches
-- mod_status, never notifies the writer, and writes nothing to mod_actions.
--
-- An automated report has no reporter. resolve_report() already skips the
-- notification when there is none.
--
-- Additive: one widened check, one new function, one trigger narrowed.

-- ── 1. The new category ─────────────────────────────────
-- The baseline declared this check inline, so its name was generated. Find it by what
-- it constrains rather than trusting the name.
do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  where con.conrelid = 'public.reports'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%category%'
    and pg_get_constraintdef(con.oid) ilike '%harassment%';
  if v_name is null then
    raise exception 'reports category check not found';
  end if;
  execute format('alter table public.reports drop constraint %I', v_name);
end $$;

alter table public.reports
  add constraint reports_category_check
  check (category in ('harassment', 'spam', 'urgent', 'other', 'ai_written'));

-- ── 2. A note is not a member's report ──────────────────
-- handle_new_report() re-counts the distinct reporters on a target every time a
-- report is inserted, and screens the content at five. A note has no reporter, so
-- it adds nothing to that count, but its insert would still re-run the check
-- against the reports already there: a story five members reported, that a
-- moderator then put back, would be screened again (and its writer notified) by
-- the note alone. Only members' reports run the check.
drop trigger on_report_inserted on public.reports;
create trigger on_report_inserted
  after insert on public.reports
  for each row
  when (new.source <> 'automated')
  execute procedure public.handle_new_report();

-- ── 3. Filing an automatic note ─────────────────────────
-- Returns true when a note was filed, false when an open one of the same kind was
-- already there (a story edited five times gets one note, not five).
create function public.file_automated_report(
  p_target_type text,
  p_target_id   uuid,
  p_category    text,
  p_details     text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.reports
    where target_type = p_target_type
      and target_id = p_target_id
      and category = p_category
      and source = 'automated'
      and status = 'open'
  ) then
    return false;
  end if;

  insert into public.reports (reporter_id, target_type, target_id, category, details, source)
  values (null, p_target_type, p_target_id, p_category, p_details, 'automated');
  return true;
end;
$$;

revoke all on function public.file_automated_report(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.file_automated_report(text, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
