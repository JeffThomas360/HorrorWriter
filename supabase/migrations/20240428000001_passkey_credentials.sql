-- Create the passkey credentials table
create table public.passkey_credentials (
  id text primary key, -- Base64URL encoded credential ID
  user_id uuid references public.profiles(id) on delete cascade not null,
  public_key bytea not null,
  transports text[] not null default '{}',
  counter bigint not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_used_at timestamp with time zone
);

-- Turn on Row Level Security
alter table public.passkey_credentials enable row level security;

-- Policies: users can see and manage their own passkeys
create policy "Users can view their own passkeys." on public.passkey_credentials
  for select using (auth.uid() = user_id);

create policy "Users can delete their own passkeys." on public.passkey_credentials
  for delete using (auth.uid() = user_id);

-- Note: Insert and Update operations for passkeys will be handled exclusively via
-- the Supabase Edge Functions using the service_role key to bypass RLS,
-- ensuring that clients cannot inject arbitrary credential data.
