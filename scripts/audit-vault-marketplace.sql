-- Read-only Business Vault / Marketplace catalog audit.
-- No DDL and no protected secret values or tenant rows are selected.

select n.nspname as schema_name, c.relname as object_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p','v')
  and c.relname = any (array[
    'businesses','business_certifications','business_financial_docs',
    'business_public_presence','business_vendors','legal_documents',
    'tenant_legal_profile','tenant_email_domains','documents','client_files',
    '_internal_secrets','connected_bank_account_secrets',
    'marketplace_vendors','marketplace_items','marketplace_item_versions',
    'marketplace_installs','marketplace_install_ledger','marketplace_install_bundle_links'
  ])
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, permissive, qual, with_check
from pg_policies
where schemaname = 'public'
  and (tablename like 'marketplace_%'
    or tablename = any (array['_internal_secrets','connected_bank_account_secrets']))
order by tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = any (array['_internal_secrets','connected_bank_account_secrets'])
order by table_name, grantee, privilege_type;

select id, name, public
from storage.buckets
where id ~* '(vault|document|business|marketplace)'
order by id;
