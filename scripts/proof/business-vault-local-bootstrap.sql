-- Minimal disposable PostgreSQL harness for parsing and exercising the Vault migrations.
-- This is not a substitute for Supabase's applied-schema pgTAP run.
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,aud text,role text,email text);
CREATE TABLE public.tenants(
 id uuid PRIMARY KEY,slug text,name text,status text,account_type text,account_number_prefix text,
 account_number bigint,features jsonb
);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,active_tenant_id uuid);
CREATE TABLE public.tenant_members(
 tenant_id uuid,user_id uuid,role text,status text,is_owner boolean,joined_at timestamptz,
 PRIMARY KEY(tenant_id,user_id)
);
CREATE TABLE storage.buckets(
 id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]
);
CREATE TABLE storage.objects(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb,
 UNIQUE(bucket_id,name)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects,storage.buckets TO service_role;
