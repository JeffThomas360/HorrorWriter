-- supabase/migrations/20260908000000_whispers.sql
--
-- Whispers in the Void — short anonymous-to-readers fears, real to moderation.
--
-- Design decision (2026-09-08, vault: work/design-pass-2026-09-08.md):
-- the component previously kept "whispers" in localStorage while presenting them
-- as a "Collective Dread Stream". This makes the feature real.
--
-- Anonymity model: **displayed anonymous, stored attributed.** author_id is
-- always recorded and never exposed to other readers. Truly anonymous rows were
-- considered and rejected: every moderation tool this site owns — is_banned(),
-- mod_can(), sanctions, user_blocks — keys on author_id, so an unattributed row
-- can be deleted but its author cannot be stopped from immediately posting again.
-- With the site now 13+, that asymmetry was not acceptable on a surface whose
-- prompt invites people to disclose the things they don't say out loud.

CREATE TABLE IF NOT EXISTS public.whispers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text        text NOT NULL CHECK (char_length(btrim(text)) BETWEEN 8 AND 280),
  category    text NOT NULL DEFAULT 'Unspoken'
              CHECK (char_length(category) <= 40),
  mod_status  text NOT NULL DEFAULT 'live'
              CHECK (mod_status IN ('live', 'screening', 'hidden')),
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.whispers IS
'Short fears displayed without attribution. author_id is recorded for moderation and never exposed to readers; the client selects only id, text, category, created_at.';
COMMENT ON COLUMN public.whispers.author_id IS
'Never returned to clients. Present so sanctions, bans and blocks apply to this surface like any other.';

CREATE INDEX IF NOT EXISTS whispers_created_at_idx ON public.whispers (created_at DESC);
CREATE INDEX IF NOT EXISTS whispers_author_id_idx  ON public.whispers (author_id);

-- ── updated_at parity (CLAUDE.md trap #5) ────────────────────────────
CREATE OR REPLACE FUNCTION public.whispers_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.whispers_set_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS whispers_set_updated_at ON public.whispers;
CREATE TRIGGER whispers_set_updated_at
  BEFORE UPDATE ON public.whispers
  FOR EACH ROW EXECUTE FUNCTION public.whispers_set_updated_at();

-- ── Rate limiting: extend the existing shared trigger function ────────
-- enforce_rate_limit() dispatches on TG_TABLE_NAME and returns NEW unchanged
-- for unknown tables, so attaching the trigger without this branch would be a
-- silent no-op. 5 per 15 minutes, matching threads.
CREATE OR REPLACE FUNCTION public.enforce_rate_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
    AS $_$
declare
  recent_count integer;
  limit_count integer;
  limit_interval interval;
begin
  if TG_TABLE_NAME = 'posts' then
    limit_count := 10;
    limit_interval := interval '5 minutes';
  elsif TG_TABLE_NAME = 'threads' then
    limit_count := 5;
    limit_interval := interval '15 minutes';
  elsif TG_TABLE_NAME = 'books' then
    limit_count := 3;
    limit_interval := interval '1 hour';
  elsif TG_TABLE_NAME = 'whispers' then
    limit_count := 5;
    limit_interval := interval '15 minutes';
  else
    return new;
  end if;

  execute format(
    'select count(*) from public.%I where author_id = $1 and created_at > (now() - $2)',
    TG_TABLE_NAME
  )
  into recent_count
  using auth.uid(), limit_interval;

  if recent_count >= limit_count then
    raise exception 'Rate limit exceeded for %. You must wait before posting again.', TG_TABLE_NAME;
  end if;

  return new;
end;
$_$;

DROP TRIGGER IF EXISTS rate_limit_whispers ON public.whispers;
CREATE TRIGGER rate_limit_whispers
  BEFORE INSERT ON public.whispers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit();

-- ── mod_status may only be changed by a moderator (or the automated path) ──
DROP TRIGGER IF EXISTS trg_prevent_mod_status_reset_whispers ON public.whispers;
CREATE TRIGGER trg_prevent_mod_status_reset_whispers
  BEFORE UPDATE ON public.whispers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mod_status_reset('forum');

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.whispers ENABLE ROW LEVEL SECURITY;

-- Read: the shared visibility helper handles live/shadowban/ban/own/mod-view
-- and drops rows authored by anyone the reader has blocked.
DROP POLICY IF EXISTS "Whispers are visible per content_visible." ON public.whispers;
CREATE POLICY "Whispers are visible per content_visible." ON public.whispers
  FOR SELECT USING (public.content_visible(mod_status, author_id, 'forum'));

-- Insert: your own only, and not while sanctioned.
DROP POLICY IF EXISTS "Users can insert their own whispers." ON public.whispers;
CREATE POLICY "Users can insert their own whispers." ON public.whispers
  FOR INSERT WITH CHECK (
    (select auth.uid()) = author_id
    AND NOT public.is_banned(author_id)
  );

-- Delete: authors can retract; moderators can remove.
DROP POLICY IF EXISTS "Authors and mods can delete whispers." ON public.whispers;
CREATE POLICY "Authors and mods can delete whispers." ON public.whispers
  FOR DELETE USING (
    (select auth.uid()) = author_id
    OR public.mod_can('hide', 'forum')
  );

-- Update: moderators only. Authors do not edit a whisper; they delete it.
DROP POLICY IF EXISTS "Mods can update whispers." ON public.whispers;
CREATE POLICY "Mods can update whispers." ON public.whispers
  FOR UPDATE USING (public.mod_can('hide', 'forum'))
  WITH CHECK (public.mod_can('hide', 'forum'));

GRANT SELECT, INSERT, DELETE ON public.whispers TO authenticated;
GRANT SELECT ON public.whispers TO anon;

-- ── Wire whispers into the automated classifier + reports ─────────────
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type = ANY (ARRAY['story','critique','thread','post','user','site','appeal','whisper']));

NOTIFY pgrst, 'reload schema';

-- Teach the automated classifier path about whispers. Same body as
-- 20260819020000_automated_mod_status.sql with a 'whisper' branch added;
-- everything else is unchanged and re-stated because this is CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.apply_automated_mod_status(
  p_target_type text,
  p_target_id uuid,
  p_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  IF p_status NOT IN ('screening', 'hidden') THEN
    RAISE EXCEPTION 'apply_automated_mod_status only accepts screening or hidden, got %', p_status;
  END IF;

  PERFORM set_config('app.automated_mod_action', 'true', true);

  IF p_target_type = 'story' THEN
    UPDATE public.books SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'thread' THEN
    UPDATE public.threads SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'post' THEN
    UPDATE public.posts SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'critique' THEN
    UPDATE public.book_comments SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'whisper' THEN
    UPDATE public.whispers SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSE
    RAISE EXCEPTION 'Invalid target type: %', p_target_type;
  END IF;

  PERFORM set_config('app.automated_mod_action', 'false', true);

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Content not found';
  END IF;

  INSERT INTO public.mod_actions (actor_id, action, target_type, target_id, target_user_id, reason)
  VALUES (NULL, 'auto_' || p_status, p_target_type, p_target_id, v_author_id, p_reason);

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (
    v_author_id, 'content_actioned', 'Content Under Automated Review',
    'Your ' || p_target_type || ' was automatically placed under review by our safety system. Reason: ' || COALESCE(p_reason, 'No reason provided.')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_automated_mod_status(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_automated_mod_status(text, uuid, text, text) TO service_role;
