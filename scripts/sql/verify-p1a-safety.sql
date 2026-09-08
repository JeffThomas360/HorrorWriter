-- Post-apply verification for 20260908010000_reapply_p1a_safety.sql
-- Every row must report present = 1. Do not trust the migration tool's exit code.
with expected(mig, kind, name, detail) as (values
 ('010000 report_pileup','function_body','enforce_rate_limit','reports'),
 ('010000 report_pileup','trigger','rate_limit_reports',''),
 ('010000 report_pileup','function_body','handle_new_report','v_corroborated_reporters'),
 ('020000 automated_mod','function','apply_automated_mod_status',''),
 ('020000 automated_mod','column','reports','source'),
 ('020000 automated_mod','function_body','prevent_mod_status_reset','app.automated_mod_action'),
 ('030000 storm','table','storm_alerts',''),
 ('030000 storm','index','idx_storm_alerts_pending',''),
 ('030000 storm','policy','storm_alerts_mod_select',''),
 ('030000 storm','policy','storm_alerts_mod_update',''),
 ('030000 storm','function','trg_check_storm_on_report',''),
 ('030000 storm','function','trg_check_storm_on_comment',''),
 ('030000 storm','function','trg_check_storm_on_post',''),
 ('030000 storm','trigger','on_report_check_storm',''),
 ('030000 storm','trigger','on_comment_check_storm',''),
 ('030000 storm','trigger','on_post_check_storm',''),
 ('031000 dispatch','function_body','check_for_storm','storm alert dispatch failed'),
 ('032000 resolve','function','resolve_storm',''),
 ('040000 appeals','function','resolve_appeal','')
)
select mig, kind, name,
 case kind
  when 'function' then (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name)
  when 'function_body' then (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name and position(detail in p.prosrc)>0)
  when 'table' then (select count(*) from pg_tables where schemaname='public' and tablename=name)
  when 'column' then (select count(*) from information_schema.columns where table_schema='public' and table_name=name and column_name=detail)
  when 'trigger' then (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname=name)
  when 'index' then (select count(*) from pg_indexes where schemaname='public' and indexname=name)
  when 'policy' then (select count(*) from pg_policies where schemaname='public' and policyname=name)
 end as present
from expected order by present, mig, name;
