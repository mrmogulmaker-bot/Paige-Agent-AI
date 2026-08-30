-- Supabase platform shim: the roles, schemas and primitives a hosted project provides
-- before any repo migration runs. NOT part of the product — it stands in for the
-- managed platform so the repo's own 832 migrations can replay on bare Postgres.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_auth_admin login noinherit createrole;
create role supabase_storage_admin login noinherit createrole;
create role supabase_admin login noinherit createrole superuser;
create role authenticator login noinherit;
create role dashboard_user nologin noinherit;
create role supabase_read_only_user nologin noinherit;
create role supabase_realtime_admin nologin noinherit;
create role pgbouncer nologin noinherit;
create role supabase_replication_admin nologin noinherit;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists storage authorization supabase_storage_admin;
create schema if not exists extensions;
create schema if not exists graphql_public;
create schema if not exists realtime;
create schema if not exists supabase_functions;
create schema if not exists vault;
create schema if not exists supabase_migrations;
grant usage on schema auth, storage, extensions, realtime, supabase_functions, vault to postgres, anon, authenticated, service_role;

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_stat_statements;
-- pg_net / pg_graphql / supabase_vault are hosted-only; migrations that need them are recorded below.

-- auth.users — the shape the repo's FKs reference.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text, identity_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
grant all on all tables in schema auth to postgres, service_role, supabase_auth_admin;

-- The request-context primitives every RLS policy in this repo keys on.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'role','')::text;
$$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'email','')::text;
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb, '{}'::jsonb);
$$;
grant execute on all functions in schema auth to postgres, anon, authenticated, service_role;

-- Vault stand-in: migrations create/read secrets by NAME. No real secret is stored here.
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique, description text default '',
  secret text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at, updated_at from vault.secrets;

-- supabase_functions / realtime stand-ins used by a few migrations.
create table if not exists supabase_functions.migrations (version text primary key, inserted_at timestamptz default now());
create table if not exists realtime.messages (
  id bigserial primary key, topic text, extension text,
  payload jsonb, event text, private boolean default false, inserted_at timestamptz default now()
);
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $$ begin
  insert into realtime.messages(topic, extension, payload, event, private) values (topic,'broadcast',payload,event,private);
end $$;

-- The migration ledger the CLI maintains.
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text
);

-- ── Round 2 additions: the hosted primitives the first replay proved were missing.
-- pgcrypto/vector live in `extensions`; the repo calls some of their functions and
-- types UNQUALIFIED, so the database search_path must cover both schemas.
alter database postgres set search_path to public, extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm;
create extension if not exists btree_gist;
create extension if not exists citext;
create extension if not exists pg_net with schema extensions;
-- pg_cron here installs into public and never creates the `cron` schema the repo
-- calls into. Scheduling is irrelevant to a schema replay, so `cron` is stubbed:
-- the migrations' cron.schedule/unschedule calls must not abort the file.
create schema if not exists cron;
create or replace function cron.schedule(job_name text, schedule text, command text)
  returns bigint language sql as $$ select 1::bigint $$;
create or replace function cron.schedule(schedule text, command text)
  returns bigint language sql as $$ select 1::bigint $$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $$ select true $$;
create or replace function cron.unschedule(job_id bigint) returns boolean language sql as $$ select true $$;
create table if not exists cron.job (
  jobid bigserial primary key, schedule text, command text, jobname text,
  nodename text default 'localhost', nodeport int default 5432,
  database text default 'postgres', username text default 'postgres', active boolean default true
);
create publication supabase_realtime;

-- storage schema objects the repo references
create table if not exists storage.buckets (
  id text primary key, name text not null, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text, owner uuid,
  metadata jsonb, path_tokens text[],
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;
create or replace function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name,'/'),1)];
$$;
grant all on all tables in schema storage to postgres, service_role, supabase_storage_admin;

create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')::text;
$$;
