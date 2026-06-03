-- ============================================================
-- Passkeys (WebAuthn credentials) — stored by Edge Functions
-- only; no direct client insert/update/delete.
-- ============================================================
create table public.passkey_credentials (
  id             text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  public_key     bytea not null,
  transports     text[],
  counter        bigint not null default 0,
  created_at     timestamptz default now(),
  last_used_at   timestamptz
);

create index passkey_credentials_user_id_idx on public.passkey_credentials (user_id);

alter table public.passkey_credentials enable row level security;

-- Users can read their own passkeys (for the management UI in Profile)
create policy "Users can view their own passkeys"
  on public.passkey_credentials for select
  using (auth.uid() = user_id);

-- Edge Functions run as service role — they bypass RLS, so we
-- intentionally provide NO insert/update/delete policies here.

-- ============================================================
-- WebAuthn challenges — short-lived nonces for ceremonies.
-- Stored server-side so the browser can't tamper with them.
-- ============================================================
create table public.webauthn_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  challenge   text not null,
  type        text not null check (type in ('registration', 'authentication')),
  purpose     text,
  created_at  timestamptz default now()
);

alter table public.webauthn_challenges enable row level security;
-- No RLS policies — only Edge Functions (service role) touch this table.

-- Auto-expire: delete challenges older than 5 minutes.
-- (Cloudflare Cron or a simple check in the Edge Function is fine;
--  this index makes the lookup fast.)
create index webauthn_challenges_created_at_idx
  on public.webauthn_challenges (created_at);
