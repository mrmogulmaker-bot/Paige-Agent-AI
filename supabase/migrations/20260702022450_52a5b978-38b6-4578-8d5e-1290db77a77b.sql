
-- =====================================================================
-- SPRINT C.1.5 — §190 Column Encryption Sweep + growth_forms + paige_config
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Platform column-encryption key (stored in already-locked _internal_secrets)
-- ---------------------------------------------------------------------
INSERT INTO public._internal_secrets(key, value)
VALUES ('platform_column_key', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Encrypt / decrypt helpers (SECURITY DEFINER; execute limited to service_role)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_encrypt(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE k text;
BEGIN
  IF plaintext IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO k FROM public._internal_secrets WHERE key='platform_column_key';
  IF k IS NULL THEN RAISE EXCEPTION 'platform_column_key not seeded'; END IF;
  RETURN pgp_sym_encrypt(plaintext, k);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_decrypt(ciphertext bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE k text;
BEGIN
  IF ciphertext IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO k FROM public._internal_secrets WHERE key='platform_column_key';
  IF k IS NULL THEN RAISE EXCEPTION 'platform_column_key not seeded'; END IF;
  RETURN pgp_sym_decrypt(ciphertext, k);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_encrypt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_decrypt(bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_encrypt(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_decrypt(bytea) TO service_role;

-- ---------------------------------------------------------------------
-- 3. Generic BEFORE trigger — encrypts <col_plain> into <col_ct>, then nulls plaintext
--    Configured per-table below via CREATE TRIGGER referencing arg columns.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_encrypt_col_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plain_col text := TG_ARGV[0];
  ct_col    text := TG_ARGV[1];
  plain_val text;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', plain_col) INTO plain_val USING NEW;
  IF plain_val IS NOT NULL THEN
    NEW := NEW #= hstore(ct_col, encode(public.platform_encrypt(plain_val), 'base64'));
    -- Fallback via direct assignment (hstore may not be installed); use dynamic SQL:
    EXECUTE format('SELECT ($1 #= hstore(%L, %L))::%I', ct_col, NULL, TG_RELID::regclass);
  END IF;
  RETURN NEW;
END;
$$;

-- The hstore approach is fragile; use per-column dedicated trigger functions instead.
DROP FUNCTION IF EXISTS public.platform_encrypt_col_trg() CASCADE;

-- ---------------------------------------------------------------------
-- 4. Per-column encryption: add _ct BYTEA, backfill, drop plaintext, add trigger
--    Reads happen through SECURITY DEFINER RPCs (service_role only).
-- ---------------------------------------------------------------------

-- 4a. growth_external_sources.webhook_token
ALTER TABLE public.growth_external_sources
  ADD COLUMN IF NOT EXISTS webhook_token_ct bytea;
UPDATE public.growth_external_sources
  SET webhook_token_ct = public.platform_encrypt(webhook_token)
  WHERE webhook_token IS NOT NULL AND webhook_token_ct IS NULL;
ALTER TABLE public.growth_external_sources DROP COLUMN IF EXISTS webhook_token;

CREATE OR REPLACE FUNCTION public.trg_encrypt_ges_webhook_token()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN NEW; END; $$;
-- No plaintext column remains; writes must call platform_set_webhook_token RPC.

CREATE OR REPLACE FUNCTION public.platform_set_growth_external_source_token(
  _id uuid, _token text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.growth_external_sources
    SET webhook_token_ct = public.platform_encrypt(_token)
    WHERE id = _id;
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_growth_external_source_token(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_growth_external_source_token(uuid,text) TO service_role;

-- 4b. outbound_webhook_configs.url
ALTER TABLE public.outbound_webhook_configs
  ADD COLUMN IF NOT EXISTS url_ct bytea;
UPDATE public.outbound_webhook_configs
  SET url_ct = public.platform_encrypt(url)
  WHERE url IS NOT NULL AND url_ct IS NULL;
ALTER TABLE public.outbound_webhook_configs DROP COLUMN IF EXISTS url;

CREATE OR REPLACE FUNCTION public.platform_set_outbound_webhook_url(
  _id uuid, _url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.outbound_webhook_configs
    SET url_ct = public.platform_encrypt(_url)
    WHERE id = _id;
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_outbound_webhook_url(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_outbound_webhook_url(uuid,text) TO service_role;

-- 4c. paige_workflow_registry.n8n_webhook_url
ALTER TABLE public.paige_workflow_registry
  ADD COLUMN IF NOT EXISTS n8n_webhook_url_ct bytea;
UPDATE public.paige_workflow_registry
  SET n8n_webhook_url_ct = public.platform_encrypt(n8n_webhook_url)
  WHERE n8n_webhook_url IS NOT NULL AND n8n_webhook_url_ct IS NULL;
ALTER TABLE public.paige_workflow_registry DROP COLUMN IF EXISTS n8n_webhook_url;

-- Existing admin_get_workflow_webhook_url RPC must be updated to decrypt from _ct.
CREATE OR REPLACE FUNCTION public.admin_get_workflow_webhook_url(_workflow_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ct bytea;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_platform_owner(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT n8n_webhook_url_ct INTO ct FROM public.paige_workflow_registry
    WHERE workflow_slug = _workflow_slug LIMIT 1;
  RETURN public.platform_decrypt(ct);
END; $$;

CREATE OR REPLACE FUNCTION public.platform_set_workflow_webhook_url(
  _workflow_slug text, _url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.paige_workflow_registry
    SET n8n_webhook_url_ct = public.platform_encrypt(_url)
    WHERE workflow_slug = _workflow_slug;
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_workflow_webhook_url(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_workflow_webhook_url(text,text) TO service_role;

-- 4d. paige_mcp_connections.server_url
ALTER TABLE public.paige_mcp_connections
  ADD COLUMN IF NOT EXISTS server_url_ct bytea;
UPDATE public.paige_mcp_connections
  SET server_url_ct = public.platform_encrypt(server_url)
  WHERE server_url IS NOT NULL AND server_url_ct IS NULL;
ALTER TABLE public.paige_mcp_connections DROP COLUMN IF EXISTS server_url;

CREATE OR REPLACE FUNCTION public.platform_set_mcp_server_url(_id uuid, _url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.paige_mcp_connections
    SET server_url_ct = public.platform_encrypt(_url)
    WHERE id = _id;
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_mcp_server_url(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_mcp_server_url(uuid,text) TO service_role;

-- 4e. paige_n8n_connections.base_url
ALTER TABLE public.paige_n8n_connections
  ADD COLUMN IF NOT EXISTS base_url_ct bytea;
UPDATE public.paige_n8n_connections
  SET base_url_ct = public.platform_encrypt(base_url)
  WHERE base_url IS NOT NULL AND base_url_ct IS NULL;
ALTER TABLE public.paige_n8n_connections DROP COLUMN IF EXISTS base_url;

CREATE OR REPLACE FUNCTION public.platform_set_n8n_base_url(_id uuid, _url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.paige_n8n_connections
    SET base_url_ct = public.platform_encrypt(_url)
    WHERE id = _id;
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_n8n_base_url(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_n8n_base_url(uuid,text) TO service_role;

-- 4f. connected_bank_account_secrets.plaid_access_token
ALTER TABLE public.connected_bank_account_secrets
  ADD COLUMN IF NOT EXISTS plaid_access_token_ct bytea;
UPDATE public.connected_bank_account_secrets
  SET plaid_access_token_ct = public.platform_encrypt(plaid_access_token)
  WHERE plaid_access_token IS NOT NULL AND plaid_access_token_ct IS NULL;
ALTER TABLE public.connected_bank_account_secrets DROP COLUMN IF EXISTS plaid_access_token;

CREATE OR REPLACE FUNCTION public.platform_set_plaid_access_token(_row_id uuid, _token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.connected_bank_account_secrets
    SET plaid_access_token_ct = public.platform_encrypt(_token)
    WHERE account_row_id = _row_id;
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_plaid_access_token(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_plaid_access_token(uuid,text) TO service_role;

-- Lock down direct SELECT on all _ct columns (service_role bypasses RLS)
REVOKE SELECT (webhook_token_ct) ON public.growth_external_sources FROM anon, authenticated, PUBLIC;
REVOKE SELECT (url_ct) ON public.outbound_webhook_configs FROM anon, authenticated, PUBLIC;
REVOKE SELECT (n8n_webhook_url_ct) ON public.paige_workflow_registry FROM anon, authenticated, PUBLIC;
REVOKE SELECT (server_url_ct) ON public.paige_mcp_connections FROM anon, authenticated, PUBLIC;
REVOKE SELECT (base_url_ct) ON public.paige_n8n_connections FROM anon, authenticated, PUBLIC;
REVOKE SELECT (plaid_access_token_ct) ON public.connected_bank_account_secrets FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------
-- 5. growth_forms — allow public read of PUBLISHED forms only
-- ---------------------------------------------------------------------
GRANT SELECT ON public.growth_forms TO anon;

DROP POLICY IF EXISTS growth_forms_public_read_published ON public.growth_forms;
CREATE POLICY growth_forms_public_read_published
  ON public.growth_forms
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- ---------------------------------------------------------------------
-- 6. paige_config — restrict read to platform owner + service_role only
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins read config" ON public.paige_config;
DROP POLICY IF EXISTS "Admins insert config" ON public.paige_config;
DROP POLICY IF EXISTS "Admins update config" ON public.paige_config;

CREATE POLICY paige_config_platform_owner_read
  ON public.paige_config
  FOR SELECT
  TO authenticated
  USING (public.is_platform_owner(auth.uid()));

CREATE POLICY paige_config_platform_owner_write
  ON public.paige_config
  FOR ALL
  TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.paige_config FROM anon;
