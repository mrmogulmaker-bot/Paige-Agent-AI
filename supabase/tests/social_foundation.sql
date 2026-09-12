-- Social Foundation canonical schema and access contract.
-- Synthetic fixtures only; the enclosing transaction is always rolled back.
begin;
select plan(36);

select ok(to_regclass('private.paige_social_posts_legacy_20260627') is not null,'fresh replay preserves the legacy operator table in private quarantine');
select ok(to_regclass('public.paige_social_posts') is not null,'canonical Social posts exist');
select ok(to_regclass('public.paige_social_post_versions') is not null,'canonical immutable versions exist');
select ok(to_regclass('public.paige_social_targets') is not null,'canonical tenant account targets exist');
select ok(to_regclass('public.paige_social_jobs') is not null,'Social durable-job adapter rows exist');
select ok(to_regclass('public.paige_social_provider_results') is not null,'provider readback records exist');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.paige_social_accounts'::regclass),'accounts force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.paige_social_posts'::regclass),'posts force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.paige_social_post_versions'::regclass),'versions force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.paige_social_targets'::regclass),'targets force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.paige_social_jobs'::regclass),'jobs force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.paige_social_provider_results'::regclass),'provider results force RLS');

select ok(not has_table_privilege('anon','public.paige_social_posts','SELECT,INSERT,UPDATE,DELETE'),'anonymous has no Social post access');
select ok(not has_table_privilege('authenticated','public.paige_social_accounts','SELECT,INSERT,UPDATE,DELETE'),'browser cannot read Vault-bearing accounts or write them');
select ok(not has_table_privilege('authenticated','public.paige_social_posts','INSERT,UPDATE,DELETE'),'browser cannot mutate Social posts directly');
select ok(has_table_privilege('authenticated','public.paige_social_posts','SELECT'),'authenticated has tenant-filtered post reads');
select ok(has_table_privilege('authenticated','public.paige_social_post_versions','SELECT'),'authenticated has tenant-filtered version reads');
select ok(has_table_privilege('authenticated','public.paige_social_targets','SELECT'),'authenticated has tenant-filtered target reads');
select ok(has_table_privilege('authenticated','public.paige_social_jobs','SELECT'),'authenticated has tenant-filtered job reads');
select ok(not has_table_privilege('authenticated','public.paige_social_provider_results','SELECT'),'browser cannot read raw provider payloads');
select ok(has_function_privilege('authenticated','public.social_account_status()','EXECUTE'),'authenticated can reach the redacted account-status lens');
select ok(not has_function_privilege('anon','public.social_account_status()','EXECUTE'),'anonymous cannot reach account status');
select ok((select prosecdef from pg_proc where oid='public.social_account_status()'::regprocedure),'account status lens is SECURITY DEFINER');
select ok((select proconfig @> array['search_path=public, pg_catalog'] from pg_proc where oid='public.social_account_status()'::regprocedure),'account status lens pins its search path');

select ok(exists(select 1 from pg_constraint where conrelid='public.paige_social_targets'::regclass and conname='paige_social_targets_account_fk'),'target account relationship is tenant-composite');
select ok(exists(select 1 from pg_constraint where conrelid='public.paige_social_targets'::regclass and conname='paige_social_targets_version_fk'),'target version relationship is tenant-composite');
select ok(exists(select 1 from pg_constraint where conrelid='public.paige_social_jobs'::regclass and conname='paige_social_jobs_idempotency_key'),'job idempotency is tenant-unique');
select ok(exists(select 1 from pg_constraint where conrelid='public.paige_social_jobs'::regclass and conname='paige_social_jobs_external_approval'),'external jobs require approval');
select ok(exists(select 1 from pg_constraint where conrelid='public.paige_social_provider_results'::regclass and conname='paige_social_provider_results_confirmation'),'confirmed provider results require canonical readback');
select ok(exists(select 1 from pg_constraint where conrelid='public.paige_pending_approvals'::regclass and conname='paige_pending_approvals_type_check' and pg_get_constraintdef(oid) like '%social_publish%'),'canonical approval lane admits Social publication');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='paige_social_provider_results_request_key'),'provider request correlation is tenant-unique');
select ok(exists(select 1 from pg_trigger where tgrelid='public.paige_social_post_versions'::regclass and tgname='paige_social_versions_immutable' and not tgisinternal),'version history has an immutable evidence guard');
select ok(exists(select 1 from pg_trigger where tgrelid='public.paige_social_provider_results'::regclass and tgname='paige_social_provider_results_immutable' and not tgisinternal),'provider evidence has an immutable evidence guard');
select ok((select not enabled and default_autonomy_lane='off' from public.paige_action_kinds where slug='social.post_publish'),'legacy Social action kind is disabled and off');
select is(public.resolve_tool_autonomy(null,'social_post'),'off','legacy Social Chat tool is hard-off at the shared resolver');
select ok(not has_function_privilege('service_role','public.social_account_status()','EXECUTE'),'service callers cannot impersonate an account-status viewer');

select * from finish();
rollback;
