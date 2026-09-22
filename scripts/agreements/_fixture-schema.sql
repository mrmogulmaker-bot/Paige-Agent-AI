DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  -- service_role mirrors prod: bypasses RLS, NOT a superuser, NOT a member of the table owner.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name,'/') $$;

CREATE TABLE public.tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES public.tenants(id), linked_user_id uuid, email text);
CREATE TABLE public.tenant_products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES public.tenants(id));
CREATE TABLE public.tenant_prices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, product_id uuid);
CREATE TABLE public.tenant_client_agreements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES public.tenants(id), contact_id uuid REFERENCES public.clients(id));
CREATE TABLE public.tenant_agreement_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES public.tenants(id));

-- Session-scoped stand-ins for the real auth helpers.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;
CREATE FUNCTION public.current_user_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.tenant', true),'')::uuid $$;
CREATE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.owner', true)::boolean, false) $$;
CREATE FUNCTION public.is_tenant_admin(_t uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.admin', true)::boolean, false) $$;
CREATE FUNCTION public.is_tenant_member(_t uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.member', true)::boolean, true) $$;
CREATE FUNCTION public.tenant_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

INSERT INTO public.tenants (id,name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','Tenant A'),
  ('bbbbbbbb-0000-4000-8000-000000000002','Tenant B');
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_name text;
INSERT INTO public.clients (id,tenant_id,email) VALUES
  ('c1111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','a-client@example.com'),
  ('c2222222-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','b-client@example.com');
