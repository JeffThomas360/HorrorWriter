-- ── 1. user_blocks table ─────────────────────────────────────────────
create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);
create index idx_user_blocks_blocker on public.user_blocks(blocker_id);
create index idx_user_blocks_blocked on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

-- A user can see and manage only their own block list. Being blocked is not
-- discoverable by the blocked party (avoids retaliation), so there's no
-- policy exposing rows where blocked_id = auth.uid().
create policy "user_blocks_select_own" on public.user_blocks for select
  using (blocker_id = (select auth.uid()));

create policy "user_blocks_insert_own" on public.user_blocks for insert
  with check (blocker_id = (select auth.uid()));

create policy "user_blocks_delete_own" on public.user_blocks for delete
  using (blocker_id = (select auth.uid()));

-- ── 2. Extend content_visible() to hide blocked authors' content ────────
-- Replaces the Step 4 function from 00000000000000_baseline.sql. Adds one
-- clause: a viewer who has blocked p_author never sees that author's
-- content, regardless of mod_status. This covers books/threads/posts/
-- book_comments in one place since all four SELECT policies already call
-- this function.
create or replace function public.content_visible(p_status text, p_author uuid, p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (
      ( p_status = 'live'
        and not coalesce((select is_shadowbanned from public.profiles where id = p_author), false) )
      or (select auth.uid()) = p_author
      or public.mod_can('view_hidden', p_area)
    )
    and not exists (
      select 1 from public.user_blocks
      where blocker_id = (select auth.uid()) and blocked_id = p_author
    );
$$;

-- ── 3. Enforce at write time: a blocked author cannot comment on or reply
--    to content owned by the person who blocked them ───────────────────
-- book_comments: cannot critique a story whose author has blocked you.
drop policy if exists "Users can insert their own book comments." on public.book_comments;
create policy "Users can insert their own book comments." on public.book_comments
  for insert with check (
    (select auth.uid()) = author_id
    and not exists (
      select 1 from public.user_blocks ub
      join public.books b on b.id = book_id
      where ub.blocker_id = b.author_id and ub.blocked_id = author_id
    )
  );

-- posts: cannot reply in a thread whose author has blocked you.
drop policy if exists "Users can insert their own posts." on public.posts;
create policy "Users can insert their own posts." on public.posts
  for insert with check (
    (select auth.uid()) = author_id
    and not exists (
      select 1 from public.user_blocks ub
      join public.threads t on t.id = thread_id
      where ub.blocker_id = t.author_id and ub.blocked_id = author_id
    )
  );
