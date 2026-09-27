-- Closes a race in delete_member: two tabs sealing at once both pass the Edge
-- Function's profile check, so the second upsert could overwrite the first
-- seal with a different code. Locking the profile row serialises concurrent
-- deletions of the same member, and makes a retry a true no-op: the first
-- transaction locks the row, a second one waits, then finds no row and
-- returns without touching sealed_bundles.
--
-- The race LOSER (the second, blocked call) needs to know it lost, not just
-- that nothing blew up: it's the one whose collected bundle never got stored,
-- so if it's a seal, the caller must treat it exactly like the already-gone
-- retry path and point the member back at their FIRST attempt's code. That
-- means the function can no longer return void -- it returns true when it
-- actually ran (found and locked the profile row), false when it found the
-- profile already gone. A return-type change needs drop + create, not
-- create or replace.
-- Spec: docs/superpowers/specs/2026-09-26-account-deletion-and-sealing-design.md
-- Test: scripts/sql/test-delete-member.sql (rolls back; must print ALL PASS)

drop function if exists public.delete_member(uuid, text, bytea);

create function public.delete_member(
  p_user uuid, p_email_key text default null, p_bundle bytea default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null then
    raise exception 'delete_member: p_user is required';
  end if;
  if (p_email_key is null) <> (p_bundle is null) then
    raise exception 'delete_member: email key and bundle go together';
  end if;

  -- Serialise concurrent deletions of the same member and make a retry (or the
  -- loser of a race) a no-op: the first transaction locks the profile row; a
  -- second one waits, then finds no row and returns false without touching
  -- sealed_bundles.
  perform 1 from public.profiles where id = p_user for update;
  if not found then
    return false;
  end if;

  -- Sealing again while an earlier seal for the same email is still waiting
  -- (a member who came back, never unsealed, and is now leaving again) must
  -- never overwrite it: that bundle holds writing only its own code opens.
  -- Refuse before anything is deleted; the Edge Function maps HW001 to a 409
  -- telling the member to unseal first.
  if p_email_key is not null
     and exists (select 1 from public.sealed_bundles where email_key = p_email_key) then
    raise exception 'seal_exists' using errcode = 'HW001';
  end if;

  if p_bundle is not null then
    insert into public.sealed_bundles (email_key, bundle)
    values (p_email_key, p_bundle)
    on conflict (email_key) do update
      set bundle = excluded.bundle, sealed_at = now(), expires_at = now() + interval '7 years';
  end if;

  -- Series (and their series_books) cascade with the profile; follows, blocks,
  -- notifications and mod_notes about the member cascade too (mod_notes
  -- authored BY the member instead keep the note and clear author_id).
  delete from public.profiles where id = p_user;
  return true;
end;
$$;

-- drop function above discards any grants the old signature had; reapply the
-- service_role-only ACL exactly as 20260927000000 set it up.
revoke all on function public.delete_member(uuid, text, bytea) from public, anon, authenticated;
grant execute on function public.delete_member(uuid, text, bytea) to service_role;

comment on function public.delete_member(uuid, text, bytea) is
'SECURITY DEFINER, service_role only (delete-account Edge Function). Locks and validates the profile row, stores a sealed bundle when given one, and deletes the profile -- the erase_member_content trigger does the content work. Raises HW001 ''seal_exists'' (deleting nothing) when a seal for the email key is already waiting. Returns true if it ran, false if the profile was already gone (a retry, or the loser of a concurrent-deletion race).';

notify pgrst, 'reload schema';
