
-- Allow admin UI writes: setters check role internally, then service_role or admin may call.
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT unnest(ARRAY[
      'platform_set_growth_external_source_token(uuid,text)',
      'platform_set_outbound_webhook_url(uuid,text)',
      'platform_set_workflow_webhook_url(text,text)',
      'platform_set_mcp_server_url(uuid,text)',
      'platform_set_n8n_base_url(uuid,text)',
      'platform_set_plaid_access_token(uuid,text)'
    ])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;

-- Add admin gate inside each setter.
CREATE OR REPLACE FUNCTION public.platform_set_growth_external_source_token(_id uuid, _token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_platform_owner(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.growth_external_sources SET webhook_token_ct = public.platform_encrypt(_token) WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.platform_set_outbound_webhook_url(_id uuid, _url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_platform_owner(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.outbound_webhook_configs SET url_ct = public.platform_encrypt(_url) WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.platform_set_workflow_webhook_url(_workflow_slug text, _url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_platform_owner(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.paige_workflow_registry SET n8n_webhook_url_ct = public.platform_encrypt(_url) WHERE workflow_slug = _workflow_slug;
END; $$;

CREATE OR REPLACE FUNCTION public.platform_set_mcp_server_url(_id uuid, _url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_platform_owner(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.paige_mcp_connections SET server_url_ct = public.platform_encrypt(_url) WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.platform_set_n8n_base_url(_id uuid, _url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_platform_owner(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.paige_n8n_connections SET base_url_ct = public.platform_encrypt(_url) WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.platform_set_plaid_access_token(_row_id uuid, _token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_platform_owner(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.connected_bank_account_secrets SET plaid_access_token_ct = public.platform_encrypt(_token) WHERE account_row_id = _row_id;
END; $$;
