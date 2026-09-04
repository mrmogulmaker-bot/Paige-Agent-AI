-- Disposable local adapter ONLY; production/full-migration proof uses the real schema in CI.
DO $$ BEGIN IF current_database() <> 'resend_receipt_contract' THEN RAISE EXCEPTION 'isolated database required'; END IF; END $$;
CREATE TABLE public.tenants(id uuid PRIMARY KEY, slug text, name text, status text, account_type text, account_number_prefix text, account_number bigint, features jsonb);
CREATE TABLE public.tenant_invite_tokens(id uuid PRIMARY KEY, tenant_id uuid REFERENCES public.tenants, token text, kind text, default_role text, email text, expires_at timestamptz, uses int, revoked_at timestamptz);
CREATE TABLE public.email_send_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id text, template_name text NOT NULL, recipient_email text NOT NULL, status text NOT NULL, error_message text, metadata jsonb, created_at timestamptz DEFAULT now(), tenant_id uuid REFERENCES public.tenants, sender_account text);
CREATE UNIQUE INDEX idx_email_send_log_message_sent_unique ON public.email_send_log(message_id) WHERE status='sent';
CREATE INDEX idx_email_send_log_message ON public.email_send_log(message_id);
DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON public.email_send_log TO service_role;
GRANT SELECT, UPDATE ON public.tenant_invite_tokens TO service_role;
CREATE SCHEMA cron;
-- Schedule API stub only; this adapter does not claim a real scheduler ran.
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
