-- Holds in-flight WebAuthn ceremony challenges (registration + authentication).
-- Rows are short-lived: written by the *-begin Edge Function and consumed
-- by the *-complete function within the configured TTL. A scheduled cleanup
-- job (or simple `delete from webauthn_challenges where created_at < now() - interval '5 minutes'`)
-- can prune anything left behind by abandoned ceremonies.

create table if not exists public.webauthn_challenges (
  id         uuid primary key default gen_random_uuid(),
  challenge  text not null,
  user_id    uuid references auth.users(id) on delete cascade,
  purpose    text not null check (purpose in ('register', 'authenticate')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists webauthn_challenges_challenge_idx
  on public.webauthn_challenges (challenge);

alter table public.webauthn_challenges enable row level security;

-- No policies declared on purpose. Clients have zero access. Only Edge
-- Functions running with the service_role key may read or write this table.
