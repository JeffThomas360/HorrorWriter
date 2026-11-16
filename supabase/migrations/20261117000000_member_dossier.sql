-- Keeper insight, pieces 3 and 4: how a member arrived, where people give up, and the
-- Dossier that puts what happened after joining on one screen.
--
-- Three tables, none readable by a member. Row-level security is on with no policies and
-- table privileges are revoked, so everything goes through the functions below.
--
--   member_arrivals  one row per member: the tag on the link they followed (utm_source),
--                    the name of the site that sent them, the page they landed on, and
--                    their own answer to "What brought you here?". Filled once, by them,
--                    within a day (arrival) or a week (answer) of joining.
--   member_steps     one row per member, flow, step and day: that they reached a step of
--                    publishing, entering a Ritual and so on. A name, never what they wrote.
--   step_tallies     a number per day and Join step, for visitors who have no account yet.
--                    No id, no address, no device: a count, not a record of a person.
--
-- The Dossier itself stores nothing. mod_user_dossier() works it out on demand from tables
-- that already exist. It never reads auth.sessions.ip, an email address, or anything a
-- member has read.

-- ── 1. Tables ────────────────────────────────────────────────────────────────
create table public.member_arrivals (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  source_tag    text,
  referrer_host text,
  landing_path  text,
  found_via     text,
  asked_at      timestamptz,
  created_at    timestamptz not null default now()
);

create table public.member_steps (
  user_id uuid not null references auth.users(id) on delete cascade,
  flow    text not null,
  step    text not null,
  day     date not null default ((now() at time zone 'utc')::date),
  primary key (user_id, flow, step, day)
);

create table public.step_tallies (
  day  date not null,
  flow text not null,
  step text not null,
  n    integer not null default 0,
  primary key (day, flow, step)
);

alter table public.member_arrivals enable row level security;
alter table public.member_steps    enable row level security;
alter table public.step_tallies    enable row level security;
revoke all on table public.member_arrivals from anon, authenticated;
revoke all on table public.member_steps    from anon, authenticated;
revoke all on table public.step_tallies    from anon, authenticated;

-- ── 2. The fixed list of steps (private) ─────────────────────────────────────
-- The one place that says which steps exist. A name not on this list is never stored.
-- ord keeps each flow's steps in the order a person meets them; "finished" (added by
-- admin_step_funnel from real rows) sorts after them.
create function public.known_steps()
returns table (flow text, step text, ord integer)
language sql immutable set search_path = '' as $$
  values
    ('join',     'opened',         1),
    ('join',     'age_passed',     2),
    ('join',     'method_chosen',  3),
    ('publish',  'opened',        11),
    ('publish',  'started',       12),
    ('publish',  'submitted',     13),
    ('ritual',   'opened',        21),
    ('ritual',   'started',       22),
    ('ritual',   'submitted',     23),
    ('critique', 'started',       31),
    ('critique', 'submitted',     32),
    ('post',     'opened',        41),
    ('post',     'started',       42),
    ('post',     'submitted',     43),
    ('ticket',   'opened',        51),
    ('ticket',   'submitted',     52);
$$;
revoke all on function public.known_steps() from public, anon, authenticated;

create function public.step_is_known(p_flow text, p_step text)
returns boolean
language sql immutable set search_path = '' as $$
  select exists (select 1 from public.known_steps() k where k.flow = p_flow and k.step = p_step);
$$;
revoke all on function public.step_is_known(text, text) from public, anon, authenticated;

-- ── 3. Arrival: written by the member, once ──────────────────────────────────
-- Each of these is a silent no-op for a caller it is not meant for. The browser calls
-- them in the background; none may ever raise at a member.

-- The tag, referring site and landing page the browser noted on the visitor's first page.
-- Only within a day of joining, and only once: a later call changes nothing. A row their
-- answer created first (all three fields still empty) is filled in.
create function public.record_arrival(p_source_tag text, p_referrer_host text, p_landing_path text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_tag  text;
  v_host text;
  v_path text;
begin
  select u.id into v_user
    from auth.users u
   where u.id = auth.uid() and u.created_at > now() - interval '24 hours';
  if v_user is null then
    return;
  end if;

  -- The browser cleans these too. It is not trusted to.
  v_tag := left(lower(btrim(coalesce(p_source_tag, ''))), 64);
  if v_tag !~ '^[a-z0-9._-]+$' then v_tag := null; end if;

  v_host := left(lower(btrim(coalesce(p_referrer_host, ''))), 100);
  if v_host !~ '^[a-z0-9.-]+$' then v_host := null; end if;

  v_path := left(regexp_replace(btrim(coalesce(p_landing_path, '')), '[?#].*$', ''), 200);
  if v_path !~ '^/' then v_path := null; end if;

  insert into public.member_arrivals as a (user_id, source_tag, referrer_host, landing_path)
  values (v_user, v_tag, v_host, v_path)
  on conflict (user_id) do update
     set source_tag = excluded.source_tag,
         referrer_host = excluded.referrer_host,
         landing_path = excluded.landing_path
   where a.source_tag is null and a.referrer_host is null and a.landing_path is null;
end $$;
revoke all on function public.record_arrival(text, text, text) from public, anon;
grant execute on function public.record_arrival(text, text, text) to authenticated;

-- Their answer to "What brought you here?", or a Skip (empty). Within a week of joining,
-- and once: asked_at is stamped either way, so no device asks again.
create function public.record_found_via(p_text text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  select u.id into v_user
    from auth.users u
   where u.id = auth.uid() and u.created_at > now() - interval '7 days';
  if v_user is null then
    return;
  end if;

  insert into public.member_arrivals as a (user_id, found_via, asked_at)
  values (v_user, nullif(btrim(left(coalesce(p_text, ''), 200)), ''), now())
  on conflict (user_id) do update
     set found_via = excluded.found_via,
         asked_at = excluded.asked_at
   where a.asked_at is null;
end $$;
revoke all on function public.record_found_via(text) from public, anon;
grant execute on function public.record_found_via(text) to authenticated;

-- Whether to show this member the card: joined within a week, not yet asked.
create function public.arrival_prompt_due()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u
                  where u.id = auth.uid() and u.created_at > now() - interval '7 days')
     and not exists (select 1 from public.member_arrivals a
                      where a.user_id = auth.uid() and a.asked_at is not null);
$$;
revoke all on function public.arrival_prompt_due() from public, anon;
grant execute on function public.arrival_prompt_due() to authenticated;

-- ── 4. Steps: where people give up ───────────────────────────────────────────
-- A signed-in member reached a step. One row per member, flow, step and day, kept 90 days.
-- Join is not logged here: before there is an account there is nobody to log it against.
create function public.log_member_step(p_flow text, p_step text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if p_flow is null or p_flow = 'join' or not public.step_is_known(p_flow, p_step) then
    return;
  end if;
  select u.id into v_user from auth.users u where u.id = auth.uid();
  if v_user is null then
    return;
  end if;

  insert into public.member_steps (user_id, flow, step)
  values (v_user, p_flow, p_step)
  on conflict do nothing;

  delete from public.member_steps where day < (now() at time zone 'utc')::date - 90;
end $$;
revoke all on function public.log_member_step(text, text) from public, anon;
grant execute on function public.log_member_step(text, text) to authenticated;

-- A visitor reached a step of joining. Adds one to today's count and keeps nothing else.
-- The table has no timestamps on purpose, so the flood cap is per day, not per hour:
-- once 5000 have been counted today, the rest are dropped.
create function public.tally_step(p_flow text, p_step text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if p_flow is distinct from 'join' or not public.step_is_known(p_flow, p_step) then
    return;
  end if;
  if (select coalesce(sum(t.n), 0) from public.step_tallies t where t.day = v_today) >= 5000 then
    return;
  end if;

  insert into public.step_tallies as t (day, flow, step, n)
  values (v_today, 'join', p_step, 1)
  on conflict (day, flow, step) do update set n = t.n + 1;

  delete from public.step_tallies where day < v_today - 90;
end $$;
revoke all on function public.tally_step(text, text) from public;
grant execute on function public.tally_step(text, text) to anon, authenticated;

-- ── 5. Two shared definitions (private) ──────────────────────────────────────
-- A response: something live that someone else wrote on a member's work. A critique on
-- their story, an answer to their Ritual entry, or a post in a forum thread they started.
create function public.member_responses_index()
returns table (owner_id uuid, piece_type text, piece_id uuid, responder_id uuid, created_at timestamptz)
language sql stable set search_path = '' as $$
  select b.author_id, 'story', b.id, c.author_id, c.created_at
    from public.book_comments c
    join public.books b on b.id = c.book_id
   where c.mod_status = 'live'
     and b.author_id is not null and b.archive_author is null
     and c.author_id is distinct from b.author_id
  union all
  select e.author_id, 'ritual', e.id, r.author_id, r.created_at
    from public.posts r
    join public.posts e on e.id = r.parent_post_id
    join public.threads t on t.id = e.thread_id
   where r.mod_status = 'live'
     and t.prompt_id is not null and e.parent_post_id is null
     and e.author_id is not null
     and r.author_id is distinct from e.author_id
  union all
  select t.author_id, 'thread', t.id, p.author_id, p.created_at
    from public.posts p
    join public.threads t on t.id = p.thread_id
   where p.mod_status = 'live'
     and t.prompt_id is null and t.author_id is not null
     and p.author_id is distinct from t.author_id;
$$;
revoke all on function public.member_responses_index() from public, anon, authenticated;

-- The UTC days a member was seen: the day they joined, their last sign-in, each session's
-- start and refreshes, and anything they posted. Approximate: signing out removes a
-- session, so a quiet visit can go uncounted. auth.sessions.ip is never read.
create function public.member_seen_index()
returns table (user_id uuid, day date)
language sql stable set search_path = '' as $$
  select distinct x.user_id, x.day
    from (
      select u.id as user_id, (u.created_at at time zone 'utc')::date as day from auth.users u
      union all
      select u.id, (u.last_sign_in_at at time zone 'utc')::date from auth.users u
      union all
      select s.user_id, (s.created_at at time zone 'utc')::date from auth.sessions s
      union all
      select s.user_id, (s.updated_at at time zone 'utc')::date from auth.sessions s
      union all
      -- refreshed_at is a timestamp without a zone, already in UTC.
      select s.user_id, s.refreshed_at::date from auth.sessions s
      union all
      select i.author_id, (i.created_at at time zone 'utc')::date from public.member_submissions_index() i
    ) x
   where x.user_id is not null and x.day is not null;
$$;
revoke all on function public.member_seen_index() from public, anon, authenticated;

-- ── 6. The Dossier: one member, worked out on demand. Keeper only ────────────
-- Returns null for an id that is no member. Every key is always present; a part with
-- nothing to say is null (or an empty list), never missing.
create function public.mod_user_dossier(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_joined timestamptz;
begin
  if not public.mod_can('configure', 'all') then
    raise exception 'Only a keeper can open a dossier' using errcode = '42501';
  end if;

  select u.created_at into v_joined from auth.users u where u.id = p_user;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'joined_at', v_joined,

    'sign_in', jsonb_build_object(
      'providers', coalesce(
        (select jsonb_agg(d.provider order by d.provider)
           from (select distinct i.provider from auth.identities i where i.user_id = p_user) d),
        '[]'::jsonb),
      'passkeys', (select count(*) from public.passkey_credentials k where k.user_id = p_user)
    ),

    'user_agents', coalesce(
      (select jsonb_agg(a.user_agent order by a.latest desc nulls last)
         from (select s.user_agent, max(greatest(s.created_at, s.updated_at)) as latest
                 from auth.sessions s
                where s.user_id = p_user and s.user_agent is not null
                group by s.user_agent
                order by 2 desc nulls last
                limit 10) a),
      '[]'::jsonb),

    'arrival', (
      select jsonb_build_object(
               'source_tag', a.source_tag, 'referrer_host', a.referrer_host,
               'landing_path', a.landing_path, 'found_via', a.found_via, 'asked_at', a.asked_at)
        from public.member_arrivals a
       where a.user_id = p_user),

    'first', (
      select jsonb_build_object('kind', s.kind, 'title', coalesce(b.title, t.title), 'created_at', s.created_at)
        from public.member_submissions_index() s
        left join public.books b on s.target_type = 'story' and b.id = s.id
        left join public.threads t on s.target_type = 'thread' and t.id = s.id
       where s.author_id = p_user
       order by s.created_at asc
       limit 1),

    'wrote', (
      select jsonb_build_object(
               'story',    count(*) filter (where s.kind = 'story'),
               'thread',   count(*) filter (where s.kind = 'thread'),
               'reply',    count(*) filter (where s.kind = 'reply'),
               'ritual',   count(*) filter (where s.kind = 'ritual'),
               'critique', count(*) filter (where s.kind = 'critique'))
        from public.member_submissions_index() s
       where s.author_id = p_user),

    'responses', (
      select jsonb_build_object('count', count(*), 'first_at', min(r.created_at))
        from public.member_responses_index() r
       where r.owner_id = p_user),

    -- Their first piece (a story, a thread or a Ritual entry) and how long it waited.
    'first_piece', (
      select jsonb_build_object(
               'kind', s.kind, 'title', coalesce(b.title, t.title), 'created_at', s.created_at,
               'first_response_at', (select min(r.created_at)
                                       from public.member_responses_index() r
                                      where r.owner_id = p_user and r.piece_id = s.id))
        from public.member_submissions_index() s
        left join public.books b on s.target_type = 'story' and b.id = s.id
        left join public.threads t on s.target_type = 'thread' and t.id = s.id
       where s.author_id = p_user and s.kind in ('story', 'thread', 'ritual')
       order by s.created_at asc
       limit 1),

    'seen_days', coalesce(
      (select jsonb_agg(to_char(d.day, 'YYYY-MM-DD') order by d.day)
         from (select x.day from public.member_seen_index() x
                where x.user_id = p_user
                order by x.day desc
                limit 400) d),
      '[]'::jsonb),

    -- The most recent thing that left a row: a submission, or a Ritual draft for a prompt
    -- they never entered.
    'last', (
      select jsonb_build_object('what', l.what, 'title', l.title, 'at', l.happened_at)
        from (
          select s.kind as what, coalesce(b.title, t.title) as title, s.created_at as happened_at
            from public.member_submissions_index() s
            left join public.books b on s.target_type = 'story' and b.id = s.id
            left join public.threads t on s.target_type = 'thread' and t.id = s.id
           where s.author_id = p_user
          union all
          select 'draft', null, d.updated_at
            from public.ritual_drafts d
           where d.author_id = p_user
             and not exists (select 1
                               from public.posts e
                               join public.threads pt on pt.id = e.thread_id
                              where pt.prompt_id = d.prompt_id
                                and e.author_id = p_user and e.parent_post_id is null)
        ) l
       order by l.happened_at desc
       limit 1),

    'errors', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', e.id, 'created_at', e.created_at, 'kind', e.kind, 'message', e.message,
                'action', e.action, 'status', e.status, 'code', e.code,
                'url', e.url, 'user_agent', e.user_agent) order by e.created_at desc)
         from (select c.* from public.client_errors c
                where c.user_id = p_user
                order by c.created_at desc
                limit 20) e),
      '[]'::jsonb),
    'error_count', (select count(*) from public.client_errors c where c.user_id = p_user),

    'tickets', (
      select jsonb_build_object('total', count(*), 'open', count(*) filter (where k.status <> 'closed'))
        from public.tickets k
       where k.user_id = p_user),

    'steps', coalesce(
      (select jsonb_agg(jsonb_build_object('flow', m.flow, 'step', m.step, 'day', to_char(m.day, 'YYYY-MM-DD'))
                        order by m.day desc, m.flow, m.step)
         from public.member_steps m
        where m.user_id = p_user),
      '[]'::jsonb)
  );
end $$;
revoke all on function public.mod_user_dossier(uuid) from public, anon;
grant execute on function public.mod_user_dossier(uuid) to authenticated;

-- ── 7. The roll-up above the member list. Keeper only ────────────────────────
-- Same definitions as the Dossier. "Came back" = seen on a later UTC day than the day
-- they joined. Keepers are left out: the question is about members, not the person asking.
create function public.admin_member_funnel()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.mod_can('configure', 'all') then
    raise exception 'Only a keeper can read the member roll-up' using errcode = '42501';
  end if;

  return (
    with wrote as (
      select distinct s.author_id as id from public.member_submissions_index() s
    ), answered as (
      select distinct r.owner_id as id from public.member_responses_index() r
    ), returned as (
      select distinct x.user_id as id
        from public.member_seen_index() x
        join auth.users u on u.id = x.user_id
       where x.day > (u.created_at at time zone 'utc')::date
    )
    select jsonb_build_object(
             'members',      count(*),
             'wrote',        count(*) filter (where p.id in (select w.id from wrote w)),
             'got_response', count(*) filter (where p.id in (select a.id from answered a)),
             'came_back',    count(*) filter (where p.id in (select b.id from returned b)))
      from public.profiles p
     where p.mod_role is distinct from 'keeper'
  );
end $$;
revoke all on function public.admin_member_funnel() from public, anon;
grant execute on function public.admin_member_funnel() to authenticated;

-- ── 8. Where people give up, over the last p_days (1 to 90). Keeper only ─────
-- One object per known step, plus a "finished" per flow read from the real rows: the
-- account, the story, the entry. Join steps count visits; the rest count distinct members.
create function public.admin_step_funnel(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_days  integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_day   date := (now() at time zone 'utc')::date - v_days;
begin
  if not public.mod_can('configure', 'all') then
    raise exception 'Only a keeper can read the step roll-up' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object('flow', q.flow, 'step', q.step, 'n', q.n) order by q.ord), '[]'::jsonb)
      from (
        select k.flow, k.step, k.ord,
               case when k.flow = 'join'
                    then (select coalesce(sum(t.n), 0)
                            from public.step_tallies t
                           where t.flow = 'join' and t.step = k.step and t.day > v_day)
                    else (select count(distinct m.user_id)
                            from public.member_steps m
                           where m.flow = k.flow and m.step = k.step and m.day > v_day)
               end as n
          from public.known_steps() k
        union all
        select 'join', 'finished', 4,
               (select count(*) from public.profiles p where p.created_at > v_since)
        union all
        select 'publish', 'finished', 14,
               (select count(distinct s.author_id) from public.member_submissions_index() s
                 where s.kind = 'story' and s.created_at > v_since)
        union all
        select 'ritual', 'finished', 24,
               (select count(distinct s.author_id) from public.member_submissions_index() s
                 where s.kind = 'ritual' and s.created_at > v_since)
        union all
        select 'critique', 'finished', 34,
               (select count(distinct s.author_id) from public.member_submissions_index() s
                 where s.kind = 'critique' and s.created_at > v_since)
        union all
        select 'post', 'finished', 44,
               (select count(distinct s.author_id) from public.member_submissions_index() s
                 where s.kind in ('thread', 'reply') and s.created_at > v_since)
        union all
        select 'ticket', 'finished', 54,
               (select count(distinct k.user_id) from public.tickets k where k.created_at > v_since)
      ) q
  );
end $$;
revoke all on function public.admin_step_funnel(integer) from public, anon;
grant execute on function public.admin_step_funnel(integer) to authenticated;

NOTIFY pgrst, 'reload schema';
