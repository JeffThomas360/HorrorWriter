-- Rename two forum categories so the forum speaks to adult writers about their
-- craft instead of in costume. Display names only: the ids ('coven', 'seance')
-- are internal and may appear in links, so they stay.
--
-- Also removes the one placeholder thread in the craft category ("Hello",
-- a test post by the site owner, 2026-08-19). Its posts go with it through
-- posts_thread_id_fkey ON DELETE CASCADE. Matched by id, so this deletes
-- nothing else if the row is already gone.

update public.categories set name = 'Notice Board · Announcements' where id = 'coven';
update public.categories set name = 'The Writing Desk · Craft'     where id = 'seance';

delete from public.threads where id = '9f34e80c-6d1c-404a-b4b1-bb4a06ab1b04';

notify pgrst, 'reload schema';
