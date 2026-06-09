-- Add covering indexes for foreign keys (Supabase advisor 0001, unindexed_foreign_keys).
-- Without these, joins and ON DELETE CASCADE checks on the parent side do sequential
-- scans. Cheap to add; high value once the tables hold real rows. Idempotent.
--
-- Note: plain CREATE INDEX (not CONCURRENTLY) because migrations run inside a
-- transaction. Brief locks are fine at current table sizes.

create index if not exists book_comments_author_id_idx     on public.book_comments (author_id);
create index if not exists book_comments_book_id_idx        on public.book_comments (book_id);
create index if not exists books_author_id_idx              on public.books (author_id);
create index if not exists posts_author_id_idx              on public.posts (author_id);
create index if not exists posts_thread_id_idx              on public.posts (thread_id);
create index if not exists threads_author_id_idx            on public.threads (author_id);
create index if not exists threads_category_id_idx          on public.threads (category_id);
create index if not exists passkey_credentials_user_id_idx  on public.passkey_credentials (user_id);
create index if not exists webauthn_challenges_user_id_idx  on public.webauthn_challenges (user_id);
