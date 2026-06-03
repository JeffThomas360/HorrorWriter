-- Allow users to delete their own passkeys from the Profile page.
-- Insert/update still only happen through Edge Functions (service role).
create policy "Users can delete their own passkeys"
  on public.passkey_credentials for delete
  using (auth.uid() = user_id);
