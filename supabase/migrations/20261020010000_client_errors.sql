-- Client error capture. Before go-live we had no way to see a crash in a
-- visitor's browser. Islands and window-level errors now report here through
-- log_client_error(); the Keeper reads them in the SQL editor:
--   select created_at, kind, message, url from public.client_errors order by created_at desc limit 50;

create table public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('island', 'window', 'promise')),
  message     text not null,
  stack       text,
  url         text,
  user_agent  text,
  user_id     uuid
);
create index client_errors_created_at_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
-- No insert/update/delete policies: writes only via log_client_error().
create policy "Keeper reads client errors" on public.client_errors
  for select to authenticated using (public.mod_can('configure', 'all'));

-- Truncates every field, caps volume at 300 rows per rolling hour so an open
-- anon endpoint can't flood the table, and keeps 30 days.
create or replace function public.log_client_error(
  p_kind text, p_message text, p_stack text default null,
  p_url text default null, p_user_agent text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_kind not in ('island', 'window', 'promise') or coalesce(btrim(p_message), '') = '' then
    return;
  end if;
  if (select count(*) from public.client_errors
      where created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  insert into public.client_errors (kind, message, stack, url, user_agent, user_id)
  values (p_kind, left(p_message, 1000), left(p_stack, 4000), left(p_url, 500),
          left(p_user_agent, 300), auth.uid());
  delete from public.client_errors where created_at < now() - interval '30 days';
end;
$$;

revoke all on function public.log_client_error(text, text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text, text) to anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
