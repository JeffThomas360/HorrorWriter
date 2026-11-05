-- Ticket messages: the minimum goes from 20 to 25 characters (Jeff, 2026-11-05), for opening a
-- ticket and for a member's reply, so the one bad_body sentence stays true for both.
-- Bodies are copied from production (pg_get_functiondef) with only the 20 changed.
-- CREATE OR REPLACE keeps each function's existing grants (service_role / authenticated).

create or replace function public.open_ticket(p_user_id uuid, p_topic text, p_subject text, p_body text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  v_body := public.ticket_body(p_body, 25);
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
end $function$;

create or replace function public.reply_ticket(p_ticket uuid, p_body text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  v_body := public.ticket_body(p_body, 25);
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
end $function$;

notify pgrst, 'reload schema';
