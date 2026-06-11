


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."create_thread_with_post"("p_title" "text", "p_category_id" "text", "p_content" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_thread_id uuid;
begin
  insert into public.threads (title, category_id, author_id)
  values (p_title, p_category_id, auth.uid())
  returning id into v_thread_id;

  insert into public.posts (thread_id, author_id, content)
  values (v_thread_id, auth.uid(), p_content);

  return v_thread_id;
end;
$$;


ALTER FUNCTION "public"."create_thread_with_post"("p_title" "text", "p_category_id" "text", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  recent_count integer;
  limit_count integer;
  limit_interval interval;
begin
  -- 1. Determine limits based on the table being inserted into
  if TG_TABLE_NAME = 'posts' then
    limit_count := 10;
    limit_interval := interval '5 minutes';
  elsif TG_TABLE_NAME = 'threads' then
    limit_count := 5;
    limit_interval := interval '15 minutes';
  elsif TG_TABLE_NAME = 'books' then
    limit_count := 3;
    limit_interval := interval '1 hour';
  else
    return new;
  end if;

  -- 2. Count how many records this user has created within the time window
  -- Using execute format() allows us to dynamically query the correct table
  execute format(
    'select count(*) from public.%I where author_id = $1 and created_at > (now() - $2)',
    TG_TABLE_NAME
  )
  into recent_count
  using auth.uid(), limit_interval;

  -- 3. Throw a Postgres exception if they exceed the limit. 
  -- Supabase/PostgREST will catch this and return it as a clean HTTP 400 error to the frontend.
  if recent_count >= limit_count then
    raise exception 'Rate limit exceeded for %. You must wait before posting again.', TG_TABLE_NAME;
  end if;

  return new;
end;
$_$;


ALTER FUNCTION "public"."enforce_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_book_comment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.books
  set comments_count = comments_count + 1
  where id = new.book_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_book_comment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_post"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  prior_count integer;
begin
  select count(*) into prior_count
  from public.posts
  where thread_id = new.thread_id
    and id <> new.id;

  if prior_count > 0 then
    -- Subsequent post: count it as a reply and bump activity.
    update public.threads
    set replies_count = replies_count + 1,
        updated_at = timezone('utc'::text, now())
    where id = new.thread_id;
  else
    -- Original post: don't count as a reply, but still bump activity.
    update public.threads
    set updated_at = timezone('utc'::text, now())
    where id = new.thread_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_post"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  clean_prefix text;
begin
  -- Force lowercase, strip spaces, and allow only lowercase letters, numbers, dots, hyphens, and underscores
  clean_prefix := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9._-]', '', 'g');
  -- Truncate to make room for suffix
  clean_prefix := substring(clean_prefix from 1 for 25);
  
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    coalesce(clean_prefix || '-' || substr(md5(random()::text), 1, 4), 'user-' || substr(new.id::text, 1, 8)),
    coalesce(split_part(new.email, '@', 1), 'Writer')
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_profile_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_profile_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."book_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "book_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."book_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."books" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "lede" "text" NOT NULL,
    "cover" "text",
    "badge" "text",
    "chapters_info" "text",
    "comments_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "content" "text"
);


ALTER TABLE "public"."books" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."passkey_credentials" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "public_key" "bytea" NOT NULL,
    "transports" "text"[],
    "counter" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone,
    "attachment" "text",
    CONSTRAINT "passkey_credentials_attachment_check" CHECK (("attachment" IN ('platform', 'cross-platform')))
);


ALTER TABLE "public"."passkey_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "handle" "text",
    "display_name" "text",
    "bio" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "location" "text",
    "pronouns" "text",
    "website_url" "text",
    "avatar_url" "text",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_shadowbanned" boolean DEFAULT false NOT NULL,
    "requires_screening" boolean DEFAULT false NOT NULL,
    CONSTRAINT "check_website_url" CHECK ((("website_url" IS NULL) OR ("website_url" = ''::"text") OR ("website_url" ~* '^https?://'::"text")))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "pinned" boolean DEFAULT false,
    "replies_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webauthn_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "challenge" "text" NOT NULL,
    "type" "text" NOT NULL,
    "purpose" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "webauthn_challenges_type_check" CHECK (("type" = ANY (ARRAY['registration'::"text", 'authentication'::"text"])))
);


ALTER TABLE "public"."webauthn_challenges" OWNER TO "postgres";


ALTER TABLE ONLY "public"."book_comments"
    ADD CONSTRAINT "book_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."books"
    ADD CONSTRAINT "books_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."passkey_credentials"
    ADD CONSTRAINT "passkey_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_handle_key" UNIQUE ("handle");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webauthn_challenges"
    ADD CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id");



CREATE INDEX "book_comments_author_id_idx" ON "public"."book_comments" USING "btree" ("author_id");



CREATE INDEX "book_comments_book_id_idx" ON "public"."book_comments" USING "btree" ("book_id");



CREATE INDEX "books_author_id_idx" ON "public"."books" USING "btree" ("author_id");



CREATE INDEX "passkey_credentials_user_id_idx" ON "public"."passkey_credentials" USING "btree" ("user_id");



CREATE INDEX "posts_author_id_idx" ON "public"."posts" USING "btree" ("author_id");



CREATE INDEX "posts_thread_id_idx" ON "public"."posts" USING "btree" ("thread_id");



CREATE INDEX "profiles_handle_idx" ON "public"."profiles" USING "btree" ("handle");



CREATE INDEX "threads_author_id_idx" ON "public"."threads" USING "btree" ("author_id");



CREATE INDEX "threads_category_id_idx" ON "public"."threads" USING "btree" ("category_id");



CREATE INDEX "webauthn_challenges_created_at_idx" ON "public"."webauthn_challenges" USING "btree" ("created_at");



CREATE INDEX "webauthn_challenges_user_id_idx" ON "public"."webauthn_challenges" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "book_comments_set_updated_at" BEFORE UPDATE ON "public"."book_comments" FOR EACH ROW EXECUTE FUNCTION "public"."touch_profile_updated_at"();



CREATE OR REPLACE TRIGGER "on_book_comment_created" AFTER INSERT ON "public"."book_comments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_book_comment"();



CREATE OR REPLACE TRIGGER "on_post_created" AFTER INSERT ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_post"();



CREATE OR REPLACE TRIGGER "posts_set_updated_at" BEFORE UPDATE ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_profile_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."touch_profile_updated_at"();



CREATE OR REPLACE TRIGGER "rate_limit_books" BEFORE INSERT ON "public"."books" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_rate_limit"();



CREATE OR REPLACE TRIGGER "rate_limit_posts" BEFORE INSERT ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_rate_limit"();



CREATE OR REPLACE TRIGGER "rate_limit_threads" BEFORE INSERT ON "public"."threads" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_rate_limit"();



CREATE OR REPLACE TRIGGER "threads_set_updated_at" BEFORE UPDATE ON "public"."threads" FOR EACH ROW EXECUTE FUNCTION "public"."touch_profile_updated_at"();



ALTER TABLE ONLY "public"."book_comments"
    ADD CONSTRAINT "book_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."book_comments"
    ADD CONSTRAINT "book_comments_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."books"
    ADD CONSTRAINT "books_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."passkey_credentials"
    ADD CONSTRAINT "passkey_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."webauthn_challenges"
    ADD CONSTRAINT "webauthn_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Categories are viewable by everyone." ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "Public profiles are viewable by everyone." ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can delete own book comments." ON "public"."book_comments" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can delete own books." ON "public"."books" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can delete own posts." ON "public"."posts" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can delete own threads." ON "public"."threads" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can delete their own passkeys." ON "public"."passkey_credentials" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own book comments." ON "public"."book_comments" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can insert their own books." ON "public"."books" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can insert their own posts." ON "public"."posts" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can insert their own profile." ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can insert their own threads." ON "public"."threads" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can update own book comments." ON "public"."book_comments" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can update own books." ON "public"."books" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can update own posts." ON "public"."posts" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can update own profile." ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can update own threads." ON "public"."threads" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can view their own passkeys." ON "public"."passkey_credentials" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."book_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."books" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."passkey_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webauthn_challenges" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."posts";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




























































































































































GRANT ALL ON FUNCTION "public"."create_thread_with_post"("p_title" "text", "p_category_id" "text", "p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_thread_with_post"("p_title" "text", "p_category_id" "text", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_thread_with_post"("p_title" "text", "p_category_id" "text", "p_content" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_rate_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_rate_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_book_comment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_book_comment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_post"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_post"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_profile_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_profile_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."book_comments" TO "anon";
GRANT ALL ON TABLE "public"."book_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."book_comments" TO "service_role";



GRANT ALL ON TABLE "public"."books" TO "anon";
GRANT ALL ON TABLE "public"."books" TO "authenticated";
GRANT ALL ON TABLE "public"."books" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."passkey_credentials" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."passkey_credentials" TO "authenticated";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."threads" TO "anon";
GRANT ALL ON TABLE "public"."threads" TO "authenticated";
GRANT ALL ON TABLE "public"."threads" TO "service_role";



GRANT ALL ON TABLE "public"."webauthn_challenges" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

































-- ════════════════════════════════════════════════════════════════════
-- Cross-schema objects omitted by the --schema public dump
-- ════════════════════════════════════════════════════════════════════

-- (Step C.1) auth.users trigger that calls public.handle_new_user()
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- (Step C.2) storage avatars bucket + policies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars',true,2097152,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatars are publicly readable"     on storage.objects;
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Avatars are publicly readable" on storage.objects for select using (bucket_id = 'avatars');
create policy "Users can upload their own avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can update their own avatar" on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can delete their own avatar" on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);


-- ════════════════════════════════════════════════════════════════════
-- Categories seed (forum) — re-seed in case the dump captured DDL only
-- ════════════════════════════════════════════════════════════════════
insert into public.categories (id, name, sort_order) values
  ('crypt', 'The Crypt · Critique', 1),
  ('seance', 'The Séance · Craft', 2),
  ('dispatch', 'Dispatches · Market', 3),
  ('hours', 'After Hours', 4),
  ('coven', 'The Coven · Announcements', 5)
on conflict (id) do nothing;


-- ════════════════════════════════════════════════════════════════════
-- MODERATION DATA MODEL (Task 3)
-- ════════════════════════════════════════════════════════════════════

-- ── Step 1: Moderation: roles & user standing ─────────────────────────
-- (requires_screening / is_shadowbanned already exist from the dump — omitted here)
alter table public.profiles
  add column mod_role  text     check (mod_role in ('sentinel','moderator','warden','keeper')),
  add column mod_scope text     not null default 'all' check (mod_scope in ('all','forum','library')),
  add column banned_until        timestamptz,
  add column ban_reason          text;

-- ── Step 2: mod_status on every content table ─────────────────────────
alter table public.books         add column mod_status text not null default 'live' check (mod_status in ('live','screening','hidden'));
alter table public.threads       add column mod_status text not null default 'live' check (mod_status in ('live','screening','hidden'));
alter table public.posts         add column mod_status text not null default 'live' check (mod_status in ('live','screening','hidden'));
alter table public.book_comments add column mod_status text not null default 'live' check (mod_status in ('live','screening','hidden'));

create index idx_books_modstatus         on public.books(mod_status)         where mod_status <> 'live';
create index idx_threads_modstatus       on public.threads(mod_status)       where mod_status <> 'live';
create index idx_posts_modstatus         on public.posts(mod_status)         where mod_status <> 'live';
create index idx_book_comments_modstatus on public.book_comments(mod_status) where mod_status <> 'live';

-- ── Step 3: Capability helper mod_can(action, area) ──────────────────
-- Maps a content target_type to its moderation area.
create or replace function public.mod_area(p_target_type text)
returns text language sql immutable as $$
  select case
    when p_target_type in ('story','critique') then 'library'
    when p_target_type in ('thread','post')    then 'forum'
    else 'all'
  end;
$$;

-- True if the CURRENT user may perform p_action in p_area.
-- Keepers can do anything; wardens/keepers are always scope='all'.
create or replace function public.mod_can(p_action text, p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (
    select mod_role as r, mod_scope as s
    from public.profiles
    where id = (select auth.uid())
  )
  select coalesce((
    select case
      when r = 'keeper' then true
      when r is null    then false
      when not (s = 'all' or s = p_area or p_area = 'all') then false
      else case p_action
        when 'view_hidden'   then r in ('sentinel','moderator','warden')
        when 'handle_report' then r in ('sentinel','moderator','warden')
        when 'hide'          then r in ('sentinel','moderator','warden')
        when 'screen'        then r in ('moderator','warden')
        when 'shadowban'     then r in ('warden')
        when 'ban'           then r in ('warden')
        when 'read_audit'    then r in ('warden')
        else false  -- 'assign_role','configure' => keeper-only (handled above)
      end
    end
    from me
  ), false);
$$;

-- ── Step 4: Content visibility helper ────────────────────────────────
-- A content row is visible if it's live & author not shadowbanned,
-- OR the viewer is the author, OR the viewer may view hidden content here.
create or replace function public.content_visible(p_status text, p_author uuid, p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    ( p_status = 'live'
      and not coalesce((select is_shadowbanned from public.profiles where id = p_author), false) )
    or (select auth.uid()) = p_author
    or public.mod_can('view_hidden', p_area);
$$;

-- ── Step 5: New moderation tables ────────────────────────────────────
-- Reports (content / user / site / appeal)
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('story','critique','thread','post','user','site','appeal')),
  target_id   uuid,
  category    text not null check (category in ('harassment','spam','urgent','other')),
  details     text,
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution  text,
  created_at  timestamptz not null default timezone('utc', now())
);
create index idx_reports_status on public.reports(status) where status = 'open';
create index idx_reports_target on public.reports(target_type, target_id);

-- Append-only audit log
create table public.mod_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action   text not null,
  target_type    text,
  target_id      uuid,
  target_user_id uuid references public.profiles(id) on delete set null,
  reason   text,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index idx_mod_actions_created on public.mod_actions(created_at desc);

-- Closed-loop notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind  text not null,
  title text not null,
  body  text,
  read_at    timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
create index idx_notifications_user_unread on public.notifications(user_id) where read_at is null;

-- Keeper-configurable role badges
create table public.mod_role_badges (
  role  text primary key check (role in ('sentinel','moderator','warden','keeper')),
  emoji text not null,
  label text not null
);

-- Keeper-editable submission filter rules
create table public.filter_rules (
  id uuid primary key default gen_random_uuid(),
  kind    text not null check (kind in ('phrase','max_links','duplicate','new_account_flood')),
  value   text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

-- ── Step 6: Final content SELECT policies ────────────────────────────
create policy "books_select" on public.books for select
  using (public.content_visible(mod_status, author_id, 'library'));

create policy "threads_select" on public.threads for select
  using (public.content_visible(mod_status, author_id, 'forum'));

create policy "posts_select" on public.posts for select
  using (public.content_visible(mod_status, author_id, 'forum'));

create policy "book_comments_select" on public.book_comments for select
  using (public.content_visible(mod_status, author_id, 'library'));

-- ── Step 7: Moderator UPDATE policies on content ─────────────────────
create policy "books_mod_update" on public.books for update
  using (public.mod_can('hide','library') or public.mod_can('screen','library'));
create policy "threads_mod_update" on public.threads for update
  using (public.mod_can('hide','forum') or public.mod_can('screen','forum'));
create policy "posts_mod_update" on public.posts for update
  using (public.mod_can('hide','forum') or public.mod_can('screen','forum'));
create policy "book_comments_mod_update" on public.book_comments for update
  using (public.mod_can('hide','library') or public.mod_can('screen','library'));

-- ── Step 8: RLS for the new tables ───────────────────────────────────
alter table public.reports         enable row level security;
alter table public.mod_actions     enable row level security;
alter table public.notifications   enable row level security;
alter table public.mod_role_badges enable row level security;
alter table public.filter_rules    enable row level security;

-- reports: reporter sees own; mods see those in their area; anyone authed can file
create policy "reports_select" on public.reports for select using (
  reporter_id = (select auth.uid())
  or public.mod_can('handle_report', public.mod_area(target_type))
);
create policy "reports_insert" on public.reports for insert with check (
  reporter_id = (select auth.uid())
);
create policy "reports_update" on public.reports for update using (
  public.mod_can('handle_report', public.mod_area(target_type))
);

-- mod_actions: append-only; readable by warden+; insertable by any current mod as themselves
create policy "mod_actions_select" on public.mod_actions for select using (
  public.mod_can('read_audit','all')
);
create policy "mod_actions_insert" on public.mod_actions for insert with check (
  actor_id = (select auth.uid())
  and (select mod_role from public.profiles where id = (select auth.uid())) is not null
);

-- notifications: owner reads & marks read; INSERTs come only from SECURITY DEFINER
-- functions (added in later phases), so no client insert policy.
create policy "notifications_select" on public.notifications for select using (
  user_id = (select auth.uid())
);
create policy "notifications_update" on public.notifications for update using (
  user_id = (select auth.uid())
);

-- badges: world-readable; only keeper writes
create policy "badges_select" on public.mod_role_badges for select using (true);
create policy "badges_write"  on public.mod_role_badges for all
  using (public.mod_can('configure','all'))
  with check (public.mod_can('configure','all'));

-- filter rules: keeper only (read + write)
create policy "filters_all" on public.filter_rules for all
  using (public.mod_can('configure','all'))
  with check (public.mod_can('configure','all'));

-- ── Step 9: Seed badge defaults ──────────────────────────────────────
insert into public.mod_role_badges (role, emoji, label) values
  ('keeper',   '🗝️', 'Keeper'),
  ('warden',   '🕯️', 'Warden'),
  ('moderator','👁️', 'Moderator'),
  ('sentinel', '🔦', 'Sentinel')
on conflict (role) do nothing;
