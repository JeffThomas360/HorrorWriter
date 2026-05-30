-- Defense-in-depth for the WebAuthn credential tables.
--
-- Context: by Supabase default, the `anon` and `authenticated` API roles hold
-- ALL table privileges (incl. INSERT/UPDATE/TRUNCATE) on these tables, with RLS
-- as the only gate. RLS does NOT cover TRUNCATE, and these tables should never be
-- written from the client at all — registration/authentication happen exclusively
-- in the WebAuthn Edge Functions, which run as the `service_role` (unaffected by
-- the revokes below). So we strip the API roles down to the minimum.

-- webauthn_challenges: short-lived nonces, only Edge Functions touch them.
-- No client access whatsoever.
revoke all on table public.webauthn_challenges from anon, authenticated;

-- passkey_credentials: clients never insert/update directly. Keep owner-gated
-- SELECT + DELETE for the Profile passkey-management UI (RLS restricts both to
-- auth.uid() = user_id). Stored data is only PUBLIC keys + counters — never a
-- secret — but we still minimise the surface.
revoke all on table public.passkey_credentials from anon, authenticated;
grant select, delete on table public.passkey_credentials to authenticated;
