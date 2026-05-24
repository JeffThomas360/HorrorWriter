-- Add missing columns to webauthn_challenges table
-- (original table was created without type/user_id columns)

alter table public.webauthn_challenges
  add column if not exists type text check (type in ('registration', 'authentication')),
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
