-- READ ONLY: Studio policy-shape and storage audit.
-- Run against the intended Supabase project with a metadata-readable role.
-- This script returns catalog evidence only; it performs no DDL or data reads.

-- 1. RLS posture and public grants for the five Studio lifecycle tables.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  coalesce(string_agg(distinct g.grantee || ':' || g.privilege_type, ', ' order by g.grantee || ':' || g.privilege_type), 'none') as grants
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join information_schema.role_table_grants g
  on g.table_schema = n.nspname and g.table_name = c.relname
where n.nspname = 'public'
  and c.relname in ('studio_sessions','studio_artifact_versions','studio_library_items','studio_deliverable','studio_visual_critique_log')
group by n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relname;

-- 2. Full policy inventory. `roles`, command, permissiveness and both expressions are required
-- to reason about Postgres' permissive-OR / restrictive-AND composition.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('studio_sessions','studio_artifact_versions','studio_library_items','studio_deliverable','studio_visual_critique_log')
order by tablename, cmd, policyname;

-- 3. Findings that must be empty before broad tenant-redesign mounting.
select tablename, policyname, 'permissive ALL policy can widen SELECT via OR' as finding
from pg_policies
where schemaname = 'public'
  and tablename in ('studio_sessions','studio_artifact_versions')
  and permissive = 'PERMISSIVE' and cmd = 'ALL'
union all
select tablename, policyname, 'policy targets public rather than explicit role' as finding
from pg_policies
where schemaname = 'public'
  and tablename like 'studio_%'
  and roles::text = '{public}'
union all
select tablename, policyname, 'deprecated auth.role() policy expression' as finding
from pg_policies
where schemaname = 'public'
  and tablename like 'studio_%'
  and (coalesce(qual,'') ilike '%auth.role()%' or coalesce(with_check,'') ilike '%auth.role()%')
order by 1,2,3;

-- 4. Private/public bucket boundary.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('studio-deliverables','growth-assets')
order by id;

-- 5. Storage policy inventory for the private deliverables boundary.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual,'') ilike '%studio-deliverables%'
    or coalesce(with_check,'') ilike '%studio-deliverables%')
order by cmd, policyname;
