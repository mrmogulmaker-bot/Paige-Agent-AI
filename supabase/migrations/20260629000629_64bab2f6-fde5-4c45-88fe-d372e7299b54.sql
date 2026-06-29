
CREATE OR REPLACE FUNCTION public.admin_set_meta_capi_token(_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _token IS NULL OR length(btrim(_token)) = 0 THEN
    DELETE FROM public._internal_secrets WHERE key = 'meta_capi_access_token';
  ELSE
    INSERT INTO public._internal_secrets (key, value)
    VALUES ('meta_capi_access_token', _token)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

  INSERT INTO public.paige_audit_log (actor_user_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'admin_set_meta_capi_token', 'paige_config', NULL,
          jsonb_build_object('cleared', _token IS NULL OR length(btrim(coalesce(_token,'')))=0));
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_set_meta_capi_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_meta_capi_token(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_meta_capi_token_is_set()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public._internal_secrets WHERE key = 'meta_capi_access_token' AND length(coalesce(value,'')) > 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_meta_capi_token_is_set() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_meta_capi_token_is_set() TO authenticated;
