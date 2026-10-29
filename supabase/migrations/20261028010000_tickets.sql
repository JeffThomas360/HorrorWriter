-- Member tickets: two tables, guarded RPCs, a `ticket` keeper-task type, a daily
-- auto-close, and the open Moderation -> Support requests moved over.
-- Spec: docs/superpowers/specs/2026-10-28-member-tickets-design.md
-- Needs keeper_dispatch() from 20261028000000_keeper_alerts.sql.
--
-- Every guard lives here; the client only mirrors them for friendly copy. There
-- are deliberately no INSERT/UPDATE/DELETE policies: writes go only through the
-- functions below (same pattern as keeper_tasks). Errors are raised with the key
-- as the message, and the client maps them by message: not_signed_in, too_new,
-- banned, too_many_open, daily_limit, message_limit, bad_topic, bad_subject,
-- bad_body, duplicate, not_found, closed, not_allowed, bad_reason.
--
-- A ticket has at most one open keeper task, and only while it waits on the
-- keeper. open_ticket, and a member reply to an answered ticket, create one; a
-- keeper reply or close resolves it. resolve_keeper_task refuses ticket tasks
-- (use_ticket_actions), so a ticket and its task can never disagree. The one
-- exception is an orphan: a task whose ticket row no longer exists (deleted by hand)
-- can be dismissed, since there is no ticket left to disagree with.
--
-- "Unseen" (the member's reply banner) is status answered or closed with
-- member_seen_at null. A keeper reply, or a close with a note, sets it null; a
-- close without a note sets it now(); mark_ticket_seen sets it; auto-close leaves it.
--
-- Text is normalised (whitespace runs -> one space, ends trimmed) before the
-- length and duplicate checks, so padding can't stretch or disguise a message.
-- Bodies are stored trimmed with their line breaks kept.
--
-- Ticket actions are logged to mod_actions like every keeper action, but they
-- are support work, not moderation: get_transparency_log (public, anon) now
-- leaves out target_type 'ticket' (section 7). Ticket rows also keep `reason`
-- null and put details in metadata. Pushes carry only the topic and @handle,
-- never ticket text.
--
-- Behaviour test: scripts/sql/test-tickets.sql (rolls back; must print ALL PASS).

-- ── 1. Tables ──────────────────────────────────────────────────────────────
create table public.tickets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  topic          text not null check (topic in ('signing-in', 'my-writing', 'rituals', 'another-member', 'broken', 'other')),
  subject        text not null check (char_length(subject) between 1 and 120),
  status         text not null default 'waiting' check (status in ('waiting', 'answered', 'closed')),
  close_reason   text check (close_reason in ('resolved', 'dismissed', 'inactive')),
  member_seen_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  closed_at      timestamptz,
  constraint tickets_closed_consistent check ((status = 'closed') = (closed_at is not null))
);
create index tickets_user_created_idx on public.tickets (user_id, created_at);

create table public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  from_keeper boolean not null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index ticket_messages_ticket_created_idx on public.ticket_messages (ticket_id, created_at);

alter table public.tickets         enable row level security;
alter table public.ticket_messages enable row level security;

create policy tickets_read on public.tickets
  for select to authenticated
  using (user_id = (select auth.uid()) or public.mod_can('configure', 'all'));

create policy ticket_messages_read on public.ticket_messages
  for select to authenticated
  using (
    exists (select 1 from public.tickets t
             where t.id = ticket_messages.ticket_id and t.user_id = (select auth.uid()))
    or public.mod_can('configure', 'all')
  );

revoke all on public.tickets         from anon, authenticated;
revoke all on public.ticket_messages from anon, authenticated;
grant select on public.tickets         to authenticated;
grant select on public.ticket_messages to authenticated;

-- ── 2. Internal helpers ────────────────────────────────────────────────────
create function public.ticket_norm(p text)
returns text
language sql immutable
set search_path = ''
as $$ select btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')) $$;

-- A message body as stored: trimmed, line breaks kept. Measured normalised
-- (p_min .. 2000), and the stored text must also fit the 2000 column check.
create function public.ticket_body(p_body text, p_min integer)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare v_body text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
begin
  if char_length(public.ticket_norm(v_body)) not between p_min and 2000 or char_length(v_body) > 2000 then
    raise exception 'bad_body';
  end if;
  return v_body;
end $$;

-- Who may write a ticket message: an account at least an hour old, with a
-- profile, and not banned. Returns the handle. Then takes a per-member
-- transaction lock, so two requests at once can't both slip under the count
-- guards that follow.
-- The age comes from auth.users.created_at, which clients cannot write.
-- profiles.created_at is no use here: members may UPDATE their own profiles row,
-- created_at included. A missing auth timestamp counts as brand new (fail closed).
create function public.ticket_require_member(p_uid uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_handle  text;
  v_created timestamptz;
  v_banned  timestamptz;
begin
  if p_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select p.handle, u.created_at, p.banned_until into v_handle, v_created, v_banned
    from public.profiles p join auth.users u on u.id = p.id
   where p.id = p_uid;
  if not found then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if coalesce(v_created, now()) > now() - interval '1 hour' then raise exception 'too_new'; end if;
  if v_banned > now() then raise exception 'banned' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ticket_member:' || p_uid::text, 0));
  return v_handle;
end $$;

-- At most 10 member messages per rolling 24 h across all tickets, and never the
-- same (normalised) text twice in that window.
create function public.ticket_check_limits(p_uid uuid, p_body text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.ticket_messages m join public.tickets t on t.id = m.ticket_id
       where t.user_id = p_uid and not m.from_keeper and m.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'message_limit';
  end if;
  if exists (select 1 from public.ticket_messages m join public.tickets t on t.id = m.ticket_id
              where t.user_id = p_uid and not m.from_keeper and m.created_at > now() - interval '24 hours'
                and public.ticket_norm(m.body) = public.ticket_norm(p_body)) then
    raise exception 'duplicate';
  end if;
end $$;

-- ── 3. Member functions ────────────────────────────────────────────────────
-- service_role only: the open-ticket Edge Function calls this after it has
-- verified the member's JWT and their Turnstile token, passing the member's id.
create function public.open_ticket(p_user_id uuid, p_topic text, p_subject text, p_body text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_handle  text;
  v_subject text;
  v_body    text;
  v_ticket  uuid;
  v_msg     uuid;
begin
  v_handle := public.ticket_require_member(p_user_id);
  if p_topic is null or p_topic not in ('signing-in', 'my-writing', 'rituals', 'another-member', 'broken', 'other') then
    raise exception 'bad_topic';
  end if;
  v_subject := public.ticket_norm(p_subject);
  if char_length(v_subject) not between 5 and 120 then raise exception 'bad_subject'; end if;
  v_body := public.ticket_body(p_body, 20);
  if (select count(*) from public.tickets where user_id = p_user_id and status <> 'closed') >= 3 then
    raise exception 'too_many_open';
  end if;
  if (select count(*) from public.tickets where user_id = p_user_id and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'daily_limit';
  end if;
  perform public.ticket_check_limits(p_user_id, v_body);

  insert into public.tickets (user_id, topic, subject)
  values (p_user_id, p_topic, v_subject)
  returning id into v_ticket;
  insert into public.ticket_messages (ticket_id, author_id, from_keeper, body)
  values (v_ticket, p_user_id, false, v_body)
  returning id into v_msg;

  perform public.create_keeper_task('ticket', 'ticket:' || v_ticket || ':' || v_msg, 'ticket', v_ticket,
    jsonb_build_object('topic', p_topic, 'subject', v_subject, 'handle', v_handle), 0::smallint);
  perform public.keeper_dispatch('send-keeper-alert',
    jsonb_build_object('kind', 'ticket_new', 'topic', p_topic, 'handle', v_handle));
  return v_ticket;
end $$;

create function public.reply_ticket(p_ticket uuid, p_body text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_handle text;
  v_ticket public.tickets;
  v_body   text;
  v_msg    uuid;
begin
  v_handle := public.ticket_require_member(v_uid);
  select * into v_ticket from public.tickets where id = p_ticket and user_id = v_uid for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_ticket.status = 'closed' then raise exception 'closed'; end if;
  v_body := public.ticket_body(p_body, 20);
  perform public.ticket_check_limits(v_uid, v_body);

  insert into public.ticket_messages (ticket_id, author_id, from_keeper, body)
  values (p_ticket, v_uid, false, v_body)
  returning id into v_msg;

  if v_ticket.status = 'answered' then
    -- Back to the keeper: waiting again, a fresh task, one push.
    update public.tickets set status = 'waiting', updated_at = now() where id = p_ticket;
    perform public.create_keeper_task('ticket', 'ticket:' || p_ticket || ':' || v_msg, 'ticket', p_ticket,
      jsonb_build_object('topic', v_ticket.topic, 'subject', v_ticket.subject, 'handle', v_handle), 0::smallint);
    perform public.keeper_dispatch('send-keeper-alert',
      jsonb_build_object('kind', 'ticket_reply', 'handle', v_handle));
  else
    -- Already waiting: its task is still open, so just add the message.
    update public.tickets set updated_at = now() where id = p_ticket;
  end if;
  return v_msg;
end $$;

-- Any status: a closed ticket can carry an unseen closing note (keeper_close_ticket).
create function public.mark_ticket_seen(p_ticket uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.tickets set member_seen_at = now() where id = p_ticket and user_id = v_uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- ── 4. Keeper functions ────────────────────────────────────────────────────
-- Follow-up replies are allowed while the ticket is open; a reply or close on a
-- closed ticket (a stale tab) fails `closed`.
create function public.keeper_reply_ticket(p_ticket uuid, p_body text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_body   text;
  v_msg    uuid;
begin
  perform public.keeper_task_require_keeper();
  select * into v_ticket from public.tickets where id = p_ticket for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_ticket.status = 'closed' then raise exception 'closed'; end if;
  v_body := public.ticket_body(p_body, 1);

  insert into public.ticket_messages (ticket_id, author_id, from_keeper, body)
  values (p_ticket, auth.uid(), true, v_body)
  returning id into v_msg;
  update public.tickets
     set status = 'answered', member_seen_at = null, updated_at = now()
   where id = p_ticket;
  update public.keeper_tasks
     set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolution = 'replied'
   where type = 'ticket' and target_id = p_ticket and status = 'open';
  insert into public.notifications (user_id, kind, title, body)
  values (v_ticket.user_id, 'ticket_reply', 'The Keeper answered your ticket', v_ticket.subject);
  insert into public.mod_actions (actor_id, action, target_type, target_id, target_user_id, metadata)
  values (auth.uid(), 'ticket_replied', 'ticket', p_ticket, v_ticket.user_id,
          jsonb_build_object('message_id', v_msg));
  return v_msg;
end $$;

create function public.keeper_close_ticket(p_ticket uuid, p_reason text, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_note   text;
begin
  perform public.keeper_task_require_keeper();
  if p_reason is null or p_reason not in ('resolved', 'dismissed') then raise exception 'bad_reason'; end if;
  select * into v_ticket from public.tickets where id = p_ticket for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_ticket.status = 'closed' then raise exception 'closed'; end if;

  if public.ticket_norm(p_note) <> '' then
    v_note := public.ticket_body(p_note, 1);
    insert into public.ticket_messages (ticket_id, author_id, from_keeper, body)
    values (p_ticket, auth.uid(), true, v_note);
    insert into public.notifications (user_id, kind, title, body)
    values (v_ticket.user_id, 'ticket_closed', 'Your ticket was closed', v_ticket.subject);
  end if;

  -- A closing note is the Keeper's last word: unseen, so the member's banner shows it.
  -- A close without one leaves nothing new to read: seen now, so it never does.
  update public.tickets
     set status = 'closed', close_reason = p_reason, closed_at = now(), updated_at = now(),
         member_seen_at = case when v_note is null then now() else null end
   where id = p_ticket;
  update public.keeper_tasks
     set status = case p_reason when 'resolved' then 'resolved' else 'dismissed' end,
         resolved_at = now(), resolved_by = auth.uid(), resolution = p_reason
   where type = 'ticket' and target_id = p_ticket and status = 'open';
  insert into public.mod_actions (actor_id, action, target_type, target_id, target_user_id, metadata)
  values (auth.uid(), 'ticket_closed', 'ticket', p_ticket, v_ticket.user_id,
          jsonb_build_object('reason', p_reason, 'note', v_note is not null));
end $$;

-- ── 5. Auto-close: answered and quiet for 14 days ──────────────────────────
-- No message is added; the member sees "Closed — no reply for 14 days".
-- An answered ticket has no open task, so there is none to resolve.
-- member_seen_at is left as it is: an answer the member never opened stays unseen
-- (the banner keeps showing it), one they read stays read.
create function public.close_inactive_tickets()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare v_n integer;
begin
  update public.tickets t
     set status = 'closed', close_reason = 'inactive', closed_at = now(), updated_at = now()
   where t.status = 'answered'
     and (select max(m.created_at) from public.ticket_messages m where m.ticket_id = t.id) < now() - interval '14 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

select cron.schedule('close-inactive-tickets', '17 4 * * *', 'select public.close_inactive_tickets()');

-- ── 6. Ticket tasks resolve only through the ticket functions ──────────────
-- Same as 20261005000000 plus the `ticket` branch. CREATE OR REPLACE keeps the ACL.
-- A ticket task may be dismissed here only when its ticket is gone, so the work
-- queue can clear a task that points at nothing. While the ticket exists, every
-- generic action is refused: the ticket functions are the only way to act on it.
create or replace function public.keeper_task_apply_action(p_task public.keeper_tasks, p_action text, p_note text)
returns text
language plpgsql security definer
set search_path = ''
as $$
begin
  case p_task.type
    when 'manual' then
      if p_action = 'done' then return 'resolved'; end if;
      if p_action = 'dismiss' then return 'dismissed'; end if;
    when 'ticket' then
      if p_action = 'dismiss' and not exists (select 1 from public.tickets where id = p_task.target_id) then
        return 'dismissed';
      end if;
      raise exception 'use_ticket_actions' using errcode = 'HW012';
    else
      null;
  end case;
  raise exception 'unknown_action' using errcode = 'HW012';
end $$;

-- ── 7. Keep ticket activity off the public transparency log ──────────────
-- Verbatim from 20260907000000 (nothing since redefines it) plus the WHERE.
-- IS DISTINCT FROM keeps rows whose target_type is NULL. CREATE OR REPLACE
-- keeps the signature, the grants (anon, authenticated; PUBLIC revoked in
-- 20260910000000) and the comment.
CREATE OR REPLACE FUNCTION public.get_transparency_log(limit_count int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  action text,
  target_type text,
  target_id uuid,
  reason text,
  created_at timestamptz,
  actor_role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT 
    m.id,
    m.action,
    m.target_type,
    m.target_id,
    m.reason,
    m.created_at,
    p.mod_role AS actor_role
  FROM public.mod_actions m
  JOIN public.profiles p ON m.actor_id = p.id
  WHERE m.target_type IS DISTINCT FROM 'ticket'
  ORDER BY m.created_at DESC
  LIMIT limit_count;
$$;

-- ── 8. Grants ──────────────────────────────────────────────────────────────
revoke all on function public.ticket_norm(text)               from public, anon, authenticated;
revoke all on function public.ticket_body(text, integer)      from public, anon, authenticated;
revoke all on function public.ticket_require_member(uuid)     from public, anon, authenticated;
revoke all on function public.ticket_check_limits(uuid, text) from public, anon, authenticated;
revoke all on function public.close_inactive_tickets()        from public, anon, authenticated;
revoke all on function public.keeper_task_apply_action(public.keeper_tasks, text, text) from public, anon, authenticated;

revoke all on function public.open_ticket(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.open_ticket(uuid, text, text, text) to service_role;

revoke all on function public.reply_ticket(uuid, text)              from public, anon;
revoke all on function public.mark_ticket_seen(uuid)                from public, anon;
revoke all on function public.keeper_reply_ticket(uuid, text)       from public, anon;
revoke all on function public.keeper_close_ticket(uuid, text, text) from public, anon;
grant execute on function public.reply_ticket(uuid, text)              to authenticated;
grant execute on function public.mark_ticket_seen(uuid)                to authenticated;
grant execute on function public.keeper_reply_ticket(uuid, text)       to authenticated;
grant execute on function public.keeper_close_ticket(uuid, text, text) to authenticated;

-- ── 9. Move the open Support requests over ─────────────────────────────────
-- Each open site report with a reporter becomes a waiting "Something's broken"
-- ticket dated as the report, its details the first message, with a queue task.
-- The report is then closed. No pushes. Resolved site reports stay as they are.
do $$
declare
  r        record;
  v_ticket uuid;
  v_msg    uuid;
begin
  for r in
    select rp.id, rp.reporter_id, rp.details, rp.created_at, p.handle
      from public.reports rp
      join public.profiles p on p.id = rp.reporter_id
     where rp.target_type = 'site' and rp.status = 'open' and rp.reporter_id is not null
     order by rp.created_at
  loop
    insert into public.tickets (user_id, topic, subject, created_at, updated_at)
    values (r.reporter_id, 'broken', 'Support request', r.created_at, r.created_at)
    returning id into v_ticket;
    -- left(): report details had no length cap; the message column does.
    insert into public.ticket_messages (ticket_id, author_id, from_keeper, body, created_at)
    values (v_ticket, r.reporter_id, false,
            left(coalesce(nullif(btrim(r.details), ''), '(no details given)'), 2000), r.created_at)
    returning id into v_msg;
    perform public.create_keeper_task('ticket', 'ticket:' || v_ticket || ':' || v_msg, 'ticket', v_ticket,
      jsonb_build_object('topic', 'broken', 'subject', 'Support request', 'handle', r.handle), 0::smallint);
    update public.reports
       set status = 'actioned', resolved_at = now(), resolution = 'moved to tickets'
     where id = r.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
