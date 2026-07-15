-- (A) audit-log columns
CREATE OR REPLACE FUNCTION public.expire_stale_readiness_proposals()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE expired_count int;
BEGIN
  UPDATE public.paige_readiness_proposals
     SET status = 'expired', updated_at = now()
   WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;

  INSERT INTO public.paige_audit_log (action, target_type, payload, created_at)
  VALUES (
    'readiness_proposal_ttl_sweep',
    'paige_readiness_proposals',
    jsonb_build_object('expired_count', expired_count, 'ran_at', now()),
    now()
  );
  RETURN expired_count;
END;
$function$;

-- (B) rebind refresh-analytics-views-daily to net.http_post
DO $$
DECLARE
  _svc text;
  _cmd text;
BEGIN
  SELECT value INTO _svc FROM public._internal_secrets WHERE key = 'service_role_key' LIMIT 1;
  IF _svc IS NULL THEN
    RAISE NOTICE 'skipping refresh-analytics-views-daily rebind: service_role_key not in _internal_secrets';
    RETURN;
  END IF;

  _cmd := format($cron$
    SELECT net.http_post(
      url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/rest/v1/rpc/refresh_analytics_views',
      headers := jsonb_build_object(
        'apikey', %L,
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || %L
      ),
      body := '{}'::jsonb
    );
  $cron$, _svc, _svc);

  BEGIN
    PERFORM cron.unschedule('refresh-analytics-views-daily');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM cron.schedule('refresh-analytics-views-daily', '0 3 * * *', _cmd);
END $$;

-- (C) persona context: correct profile join
CREATE OR REPLACE FUNCTION public.get_paige_persona_context()
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  playbook_config jsonb,
  playbook_slug text,
  funding_enabled boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _tid uuid;
BEGIN
  SELECT c.tenant_id INTO _tid
  FROM public.clients c
  WHERE c.linked_user_id = auth.uid()
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF _tid IS NULL THEN
    SELECT p.active_tenant_id INTO _tid FROM public.profiles p WHERE p.user_id = auth.uid();
  END IF;
  IF _tid IS NULL THEN
    SELECT m.tenant_id INTO _tid FROM public.tenant_members m WHERE m.user_id = auth.uid() LIMIT 1;
  END IF;
  IF _tid IS NULL THEN
    SELECT t.id INTO _tid FROM public.tenants t WHERE t.owner_user_id = auth.uid() LIMIT 1;
  END IF;

  IF _tid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    (t.features -> 'playbook_config'),
    NULLIF(t.features ->> 'playbook', ''),
    COALESCE(
      (t.features ->> 'paige_funding_skill') = 'true'
        OR (t.features ->> 'playbook') = 'funding'
        OR (t.features -> 'playbook_config' ->> 'slug') = 'funding'
        OR (t.features -> 'enabled_skills') @> '["funding"]'::jsonb,
      false
    )
  FROM public.tenants t
  WHERE t.id = _tid;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_paige_persona_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paige_persona_context() TO authenticated;