-- Add the editable profile fields the V1 design spec calls for but that the
-- initial profiles migration shipped without. Columns are nullable so existing
-- rows remain valid.

alter table public.profiles
  add column if not exists location    text,
  add column if not exists pronouns    text,
  add column if not exists website_url text,
  add column if not exists avatar_url  text,
  add column if not exists updated_at  timestamptz not null default timezone('utc'::text, now());

-- Keep updated_at fresh on every profile change.
create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_profile_updated_at();

-- Speed up @handle lookups (the public /u/:handle page hits this constantly).
create index if not exists profiles_handle_idx on public.profiles (handle);
