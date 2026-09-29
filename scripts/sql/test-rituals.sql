-- Behaviour test for 20260930000000_midnight_ritual.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
-- After merge:  npx supabase db query --linked -f scripts/sql/test-rituals.sql
-- Before merge: powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-rituals.sql -Migration supabase/migrations/20260930000000_midnight_ritual.sql
begin;

do $$ begin
  if to_regclass('public.ritual_prompts') is null then raise exception 'FAIL: ritual_prompts missing'; end if;
end $$;

-- @@TASK2@@
-- @@TASK3@@

select 'ALL PASS' as result;
rollback;
