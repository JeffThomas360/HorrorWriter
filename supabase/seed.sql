-- Local-only seed. `npx supabase db reset` replays every migration from empty, then runs this.
-- Never runs against production: the GitHub integration applies migrations, not seed files.
--
-- Three accounts. Sign in with the magic link; the email lands in Inbucket at
-- http://localhost:54324. Password for all three (Studio / API testing): localdev-only
--   keeper@horrorwriter.local   mod_role = keeper (admin + moderation)
--   writer@horrorwriter.local   ordinary member
--   reader@horrorwriter.local   ordinary member
-- The four classics arrive with migration 20261011000000; no member content is seeded.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('localdev-only', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'keeper@horrorwriter.local'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'writer@horrorwriter.local'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'reader@horrorwriter.local')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users
where email like '%@horrorwriter.local';

-- handle_new_user() has created the profiles; give them stable handles.
-- auth.uid() is null here, so the self-escalation guard allows the role change.
update public.profiles p set handle = v.handle, display_name = v.display_name, mod_role = v.mod_role
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'keeper', 'Local Keeper', 'keeper'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'writer', 'Local Writer', null),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'reader', 'Local Reader', null)
) as v(id, handle, display_name, mod_role)
where p.id = v.id;
