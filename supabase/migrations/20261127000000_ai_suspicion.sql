-- The staff "Suspected AI" tag, its history, and the evidence record for stories.
--
-- Stories must be written by the member (House Rule 4). Staff who can screen an area
-- can tag a submission there as suspected AI, with a note. The tag is only a mark for
-- staff: it never touches mod_status, never notifies the writer, shows nowhere public.
--
-- Nothing here writes to mod_actions. get_transparency_log() publishes every
-- mod_actions row to the public, which would make the tag public. The trail lives in
-- ai_suspicion_log instead.
--
-- submission_evidence holds, per story, the screening function's machine_written
-- score and the counts the writer's own browser sends at publish (how much was typed,
-- pasted, dictated, imported). Counts only: never keystrokes, never pasted text.
--
-- No client can select from or write to the three tables: RLS on, no policies, table
-- privileges revoked. Everything goes through the security-definer functions below.
--
-- Additive.

-- ── 1. Tables ───────────────────────────────────────────
create table public.ai_suspicions (
  target_type text not null check (target_type in ('story', 'critique', 'thread', 'post')),
  target_id   uuid not null,
  author_id   uuid references public.profiles(id) on delete cascade,
  tagged_by   uuid references public.profiles(id) on delete set null,
  tagged_at   timestamptz not null default now(),
  note        text,
  primary key (target_type, target_id)
);
create index idx_ai_suspicions_author on public.ai_suspicions(author_id);

-- Survives an untag and the submission's deletion; goes when the author's account does.
create table public.ai_suspicion_log (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id   uuid not null,
  author_id   uuid references public.profiles(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null check (action in ('tag', 'untag')),
  note        text,
  created_at  timestamptz not null default now()
);
create index idx_ai_suspicion_log_target on public.ai_suspicion_log(target_type, target_id, created_at desc);
create index idx_ai_suspicion_log_author on public.ai_suspicion_log(author_id);

-- One row per writer per publish: the screening function writes a 'machine' row, the
-- author's browser a 'compose' row.
create table public.submission_evidence (
  id            uuid primary key default gen_random_uuid(),
  story_id      uuid not null,
  author_id     uuid references public.profiles(id) on delete cascade,
  source        text not null check (source in ('machine', 'compose')),
  machine_score numeric,
  compose       jsonb,
  recorded_at   timestamptz not null default now()
);
create index idx_submission_evidence_story on public.submission_evidence(story_id, recorded_at desc);
create index idx_submission_evidence_author on public.submission_evidence(author_id);

alter table public.ai_suspicions       enable row level security;
alter table public.ai_suspicion_log    enable row level security;
alter table public.submission_evidence enable row level security;
revoke all on public.ai_suspicions       from public, anon, authenticated;
revoke all on public.ai_suspicion_log    from public, anon, authenticated;
revoke all on public.submission_evidence from public, anon, authenticated;

-- ── 2. Tag and untag ────────────────────────────────────
-- Timestamps are clock_timestamp(), not now(): several calls in one transaction must
-- still read back in the order they were made.
create function public.mod_set_ai_suspected(
  p_target_type text,
  p_target_id   uuid,
  p_suspected   boolean,
  p_note        text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_exists boolean := false;
  v_note   text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
begin
  if p_target_type is null or p_target_type not in ('story', 'critique', 'thread', 'post') then
    raise exception 'Invalid target type' using errcode = '22023';
  end if;
  if not public.mod_can('screen', public.mod_area(p_target_type)) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  -- The author may be null (their account is gone), so existence is asked separately.
  if p_target_type = 'story' then
    select true, b.author_id into v_exists, v_author from public.books b where b.id = p_target_id;
  elsif p_target_type = 'critique' then
    select true, c.author_id into v_exists, v_author from public.book_comments c where c.id = p_target_id;
  elsif p_target_type = 'thread' then
    select true, t.author_id into v_exists, v_author from public.threads t where t.id = p_target_id;
  else
    select true, p.author_id into v_exists, v_author from public.posts p where p.id = p_target_id;
  end if;
  if v_exists is not true then
    raise exception 'Content not found' using errcode = 'P0002';
  end if;

  if coalesce(p_suspected, false) then
    insert into public.ai_suspicions (target_type, target_id, author_id, tagged_by, tagged_at, note)
    values (p_target_type, p_target_id, v_author, (select auth.uid()), clock_timestamp(), v_note)
    on conflict (target_type, target_id) do update
      set note = excluded.note, tagged_by = excluded.tagged_by,
          tagged_at = excluded.tagged_at, author_id = excluded.author_id;
  else
    delete from public.ai_suspicions s
     where s.target_type = p_target_type and s.target_id = p_target_id;
    if not found then
      return;  -- it was not tagged: nothing changed, nothing to record
    end if;
  end if;

  insert into public.ai_suspicion_log (target_type, target_id, author_id, actor_id, action, note, created_at)
  values (p_target_type, p_target_id, v_author, (select auth.uid()),
          case when coalesce(p_suspected, false) then 'tag' else 'untag' end, v_note, clock_timestamp());
end;
$$;
revoke all on function public.mod_set_ai_suspected(text, uuid, boolean, text) from public, anon;
grant execute on function public.mod_set_ai_suspected(text, uuid, boolean, text) to authenticated;

-- ── 3. Everything tagged, newest first ──────────────────
-- A caller sees only the areas they can screen; with none, zero rows rather than an error.
create function public.mod_ai_suspected_list(p_author uuid default null)
returns table (
  target_type text, target_id uuid, author_id uuid, author_handle text, title text,
  story_id uuid, thread_id uuid, note text, tagged_by_handle text, tagged_at timestamptz,
  machine_score numeric
)
language sql stable security definer set search_path = ''
as $$
  select s.target_type, s.target_id, s.author_id, author.handle,
         case s.target_type
           when 'story'    then b.title
           when 'thread'   then t.title
           when 'critique' then left(c.content, 120)
           else                 left(p.content, 120)
         end,
         case s.target_type when 'story' then s.target_id when 'critique' then c.book_id end,
         case s.target_type when 'thread' then s.target_id when 'post' then p.thread_id end,
         s.note, tagger.handle, s.tagged_at,
         case when s.target_type = 'story' then
           (select e.machine_score from public.submission_evidence e
             where e.story_id = s.target_id and e.source = 'machine'
             order by e.recorded_at desc limit 1)
         end
    from public.ai_suspicions s
    left join public.profiles author on author.id = s.author_id
    left join public.profiles tagger on tagger.id = s.tagged_by
    left join public.books b         on s.target_type = 'story'    and b.id = s.target_id
    left join public.book_comments c on s.target_type = 'critique' and c.id = s.target_id
    left join public.threads t       on s.target_type = 'thread'   and t.id = s.target_id
    left join public.posts p         on s.target_type = 'post'     and p.id = s.target_id
   where public.mod_can('screen', public.mod_area(s.target_type))
     and (p_author is null or s.author_id = p_author)
   order by s.tagged_at desc;
$$;
revoke all on function public.mod_ai_suspected_list(uuid) from public, anon;
grant execute on function public.mod_ai_suspected_list(uuid) to authenticated;

-- ── 4. What staff read when they judge one submission ───
-- machine and compose are the latest of each, and exist only for stories. An edit
-- opens with the text already in the editor, so the latest compose record alone would
-- make any edited story look hand-typed: compose_first is the earliest record kept
-- (the first publish, until twenty edits push it out) and compose_count how many there
-- are. reports counts members' "written by AI" reports; the screening function's own
-- note is not a member's report and is left out.
create function public.mod_ai_evidence(p_target_type text, p_target_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_target_type is null or p_target_type not in ('story', 'critique', 'thread', 'post') then
    raise exception 'Invalid target type' using errcode = '22023';
  end if;
  if not public.mod_can('screen', public.mod_area(p_target_type)) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'tag', (
      select jsonb_build_object('note', s.note, 'tagged_by_handle', tagger.handle, 'tagged_at', s.tagged_at)
        from public.ai_suspicions s
        left join public.profiles tagger on tagger.id = s.tagged_by
       where s.target_type = p_target_type and s.target_id = p_target_id),
    'machine', (
      select jsonb_build_object('score', e.machine_score, 'recorded_at', e.recorded_at)
        from public.submission_evidence e
       where p_target_type = 'story' and e.story_id = p_target_id and e.source = 'machine'
       order by e.recorded_at desc limit 1),
    'compose', (
      select e.compose || jsonb_build_object('recorded_at', e.recorded_at)
        from public.submission_evidence e
       where p_target_type = 'story' and e.story_id = p_target_id and e.source = 'compose'
       order by e.recorded_at desc limit 1),
    'compose_first', (
      select e.compose || jsonb_build_object('recorded_at', e.recorded_at)
        from public.submission_evidence e
       where p_target_type = 'story' and e.story_id = p_target_id and e.source = 'compose'
       order by e.recorded_at asc limit 1),
    'compose_count', (
      select count(*) from public.submission_evidence e
       where p_target_type = 'story' and e.story_id = p_target_id and e.source = 'compose'),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('action', l.action, 'note', l.note,
                                          'actor_handle', actor.handle, 'created_at', l.created_at)
                       order by l.created_at desc)
        from public.ai_suspicion_log l
        left join public.profiles actor on actor.id = l.actor_id
       where l.target_type = p_target_type and l.target_id = p_target_id), '[]'::jsonb),
    'reports', (
      select count(*) from public.reports r
       where r.target_type = p_target_type and r.target_id = p_target_id
         and r.category = 'ai_written' and r.source <> 'automated')
  );
end;
$$;
revoke all on function public.mod_ai_evidence(text, uuid) from public, anon;
grant execute on function public.mod_ai_evidence(text, uuid) to authenticated;

-- ── 5. The writer's browser reports how the text arrived ─
-- One key of the browser's report as a whole number between 0 and the cap. Anything
-- that is not a JSON number counts as 0.
create function public.evidence_count(p_signals jsonb, p_key text, p_cap numeric)
returns bigint language sql immutable set search_path = '' as $$
  select trunc(least(greatest(
           case when jsonb_typeof(p_signals -> p_key) = 'number'
                then (p_signals ->> p_key)::numeric else 0 end,
           0), p_cap))::bigint;
$$;
revoke all on function public.evidence_count(jsonb, text, numeric) from public, anon, authenticated;

-- Only the story's own author is listened to; anyone else's call does nothing and says
-- nothing. Only the ten keys below are read, so nothing else a browser sends is stored.
create function public.record_compose_signals(p_story_id uuid, p_signals jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not exists (
    select 1 from public.books b where b.id = p_story_id and b.author_id = v_uid
  ) then
    return;
  end if;

  insert into public.submission_evidence (story_id, author_id, source, compose, recorded_at)
  values (p_story_id, v_uid, 'compose', jsonb_build_object(
    'typed',         public.evidence_count(p_signals, 'typed',         2000000),
    'pasted',        public.evidence_count(p_signals, 'pasted',        2000000),
    'dictated',      public.evidence_count(p_signals, 'dictated',      2000000),
    'imported',      public.evidence_count(p_signals, 'imported',      2000000),
    'largest_paste', public.evidence_count(p_signals, 'largest_paste', 2000000),
    'chars_at_open', public.evidence_count(p_signals, 'chars_at_open', 2000000),
    'chars_final',   public.evidence_count(p_signals, 'chars_final',   2000000),
    'pastes',        public.evidence_count(p_signals, 'pastes',        10000),
    'sittings',      public.evidence_count(p_signals, 'sittings',      1000),
    'active_ms',     public.evidence_count(p_signals, 'active_ms',     2592000000)
  ), clock_timestamp());

  delete from public.submission_evidence e
   where e.id in (
     select old.id from public.submission_evidence old
      where old.story_id = p_story_id and old.source = 'compose'
      order by old.recorded_at desc, old.id
      offset 20);
end;
$$;
revoke all on function public.record_compose_signals(uuid, jsonb) from public, anon;
grant execute on function public.record_compose_signals(uuid, jsonb) to authenticated;

-- ── 6. The screening function saves its score ───────────
create function public.record_machine_score(p_story_id uuid, p_score numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_exists boolean := false;
begin
  if p_score is null or p_score < 0 or p_score > 1 then
    return;
  end if;
  select true, b.author_id into v_exists, v_author from public.books b where b.id = p_story_id;
  if v_exists is not true then
    return;
  end if;

  insert into public.submission_evidence (story_id, author_id, source, machine_score, recorded_at)
  values (p_story_id, v_author, 'machine', p_score, clock_timestamp());

  delete from public.submission_evidence e
   where e.id in (
     select old.id from public.submission_evidence old
      where old.story_id = p_story_id and old.source = 'machine'
      order by old.recorded_at desc, old.id
      offset 20);
end;
$$;
revoke all on function public.record_machine_score(uuid, numeric) from public, anon, authenticated;
grant execute on function public.record_machine_score(uuid, numeric) to service_role;

-- ── 7. Deleted work takes its tag and evidence with it ──
-- The site's deletion policy. Security definer because the member deleting their own
-- work has no rights on these tables. Row-level, so cascaded deletes (a story's
-- critiques, a thread's posts) are covered too.
create function public.forget_ai_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_suspicions s
   where s.target_type = tg_argv[0] and s.target_id = old.id;
  if tg_argv[0] = 'story' then
    delete from public.submission_evidence e where e.story_id = old.id;
  end if;
  return old;
end;
$$;
revoke all on function public.forget_ai_records() from public, anon, authenticated;

create trigger forget_ai_records after delete on public.books
  for each row execute function public.forget_ai_records('story');
create trigger forget_ai_records after delete on public.book_comments
  for each row execute function public.forget_ai_records('critique');
create trigger forget_ai_records after delete on public.threads
  for each row execute function public.forget_ai_records('thread');
create trigger forget_ai_records after delete on public.posts
  for each row execute function public.forget_ai_records('post');

notify pgrst, 'reload schema';
