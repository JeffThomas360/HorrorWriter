-- Site event log. client_errors only knew about crashes (island, window,
-- promise). It now also records two more kinds of thing a member runs into:
--   request  a request that failed (action = what was being done, status = HTTP
--            status, 0 for a network failure, code = the database/API error code)
--   shown    an error message the site showed the member
-- Nothing is kept beyond what the Keeper needs to read: urls lose their query
-- string and fragment, user_id is only stored for a real account and goes when
-- the account goes, and rows are kept for 90 days.
--
-- log_client_error() survives, with the same five parameters, because old
-- cached bundles still call it. It gets the same three changes as the new
-- log_site_event(), which is what new code calls.
--
--   select created_at, kind, action, status, code, message, url from public.client_errors order by created_at desc limit 50;

alter table public.client_errors
  add column action text,
  add column status integer,
  add column code   text;

alter table public.client_errors drop constraint if exists client_errors_kind_check;
alter table public.client_errors add constraint client_errors_kind_check
  check (kind in ('island', 'window', 'promise', 'request', 'shown'));

-- user_id was stored unchecked; clear any that point at no account so the foreign key can be added.
update public.client_errors set user_id = null
where user_id is not null
  and not exists (select 1 from auth.users u where u.id = client_errors.user_id);

alter table public.client_errors
  add constraint client_errors_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
create index client_errors_user_id_idx on public.client_errors (user_id) where user_id is not null;

-- Same five parameters as before. Changes: url is stored without query string or
-- fragment; user_id is only set for an account that exists; retention is 90 days.
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
  values (p_kind, left(p_message, 1000), left(p_stack, 4000),
          regexp_replace(left(p_url, 500), '[?#].*$', ''),
          left(p_user_agent, 300),
          (select u.id from auth.users u where u.id = auth.uid()));
  delete from public.client_errors where created_at < now() - interval '90 days';
end;
$$;

-- The wider entry point. Same guards and the same caps; accepts all five kinds.
-- status is stored only when it is a plausible HTTP status (0 = network failure).
create function public.log_site_event(
  p_kind text, p_message text, p_stack text default null,
  p_url text default null, p_user_agent text default null,
  p_action text default null, p_status integer default null, p_code text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_kind not in ('island', 'window', 'promise', 'request', 'shown')
     or coalesce(btrim(p_message), '') = '' then
    return;
  end if;
  if (select count(*) from public.client_errors
      where created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  insert into public.client_errors (kind, message, stack, url, user_agent, user_id, action, status, code)
  values (p_kind, left(p_message, 1000), left(p_stack, 4000),
          regexp_replace(left(p_url, 500), '[?#].*$', ''),
          left(p_user_agent, 300),
          (select u.id from auth.users u where u.id = auth.uid()),
          left(p_action, 120),
          case when p_status between 0 and 599 then p_status end,
          left(p_code, 40));
  delete from public.client_errors where created_at < now() - interval '90 days';
end;
$$;

revoke all on function public.log_site_event(text, text, text, text, text, text, integer, text) from public;
grant execute on function public.log_site_event(text, text, text, text, text, text, integer, text) to anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
