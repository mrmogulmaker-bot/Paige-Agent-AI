-- Solo Beta post-fulfillment welcome lifecycle.
-- The outbox row is created in the same transaction as the immutable fulfillment
-- receipt. Browser roles have no access; only the signed webhook service path can
-- claim or complete delivery.

CREATE TABLE public.solo_beta_welcome_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_event_id text NOT NULL UNIQUE
    REFERENCES public.solo_beta_fulfillment_receipts(event_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  reference_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','sending','sent','retryable_failure','needs_attention')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claim_token uuid,
  claimed_at timestamptz,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.solo_beta_welcome_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solo_beta_welcome_deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.solo_beta_welcome_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.solo_beta_welcome_deliveries TO service_role;

CREATE INDEX solo_beta_welcome_delivery_state_idx
  ON public.solo_beta_welcome_deliveries(state, next_attempt_at);

CREATE OR REPLACE FUNCTION public.solo_beta_queue_verified_welcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.outcome <> 'completed' THEN
    RAISE EXCEPTION 'solo_beta_welcome_requires_completed_fulfillment';
  END IF;
  INSERT INTO public.solo_beta_welcome_deliveries(
    fulfillment_event_id,user_id,tenant_id,reference_id
  ) VALUES (NEW.event_id,NEW.user_id,NEW.tenant_id,NEW.reference_id)
  ON CONFLICT (fulfillment_event_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.solo_beta_queue_verified_welcome() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_queue_verified_welcome() TO service_role;

CREATE TRIGGER solo_beta_queue_verified_welcome_after_fulfillment
AFTER INSERT ON public.solo_beta_fulfillment_receipts
FOR EACH ROW EXECUTE FUNCTION public.solo_beta_queue_verified_welcome();

CREATE OR REPLACE FUNCTION public.solo_beta_claim_welcome_delivery(_event_id text)
RETURNS TABLE(
  claimed boolean,
  lifecycle_state text,
  delivery_id uuid,
  claim_token uuid,
  message_id text,
  recipient_email text,
  recipient_name text,
  tenant_id uuid,
  account_number bigint,
  reference_id uuid,
  subscription_status text,
  trial_ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  _delivery public.solo_beta_welcome_deliveries%ROWTYPE;
  _email text;
  _name text;
  _account bigint;
  _subscription_status text;
  _trial_ends_at timestamptz;
  _token uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;

  SELECT d.* INTO _delivery
  FROM public.solo_beta_welcome_deliveries d
  WHERE d.fulfillment_event_id=_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'welcome_delivery_not_found';
  END IF;

  IF _delivery.state='sent' THEN
    RETURN QUERY SELECT false,'sent'::text,_delivery.id,NULL::uuid,
      ('solo-beta-welcome-'||_delivery.id::text),NULL::text,NULL::text,
      _delivery.tenant_id,NULL::bigint,_delivery.reference_id,NULL::text,NULL::timestamptz;
    RETURN;
  END IF;

  IF _delivery.state='needs_attention' THEN
    RETURN QUERY SELECT false,'needs_attention'::text,_delivery.id,NULL::uuid,
      ('solo-beta-welcome-'||_delivery.id::text),NULL::text,NULL::text,
      _delivery.tenant_id,NULL::bigint,_delivery.reference_id,NULL::text,NULL::timestamptz;
    RETURN;
  END IF;

  IF _delivery.state='retryable_failure' AND _delivery.next_attempt_at > now() THEN
    RETURN QUERY SELECT false,'retrying'::text,_delivery.id,NULL::uuid,
      ('solo-beta-welcome-'||_delivery.id::text),NULL::text,NULL::text,
      _delivery.tenant_id,NULL::bigint,_delivery.reference_id,NULL::text,NULL::timestamptz;
    RETURN;
  END IF;
  IF _delivery.state='sending' AND _delivery.claimed_at > now()-interval '5 minutes' THEN
    RETURN QUERY SELECT false,'sending'::text,_delivery.id,NULL::uuid,
      ('solo-beta-welcome-'||_delivery.id::text),NULL::text,NULL::text,
      _delivery.tenant_id,NULL::bigint,_delivery.reference_id,NULL::text,NULL::timestamptz;
    RETURN;
  END IF;

  -- Resend idempotency keys are bounded in time. Never automatically re-send an
  -- ambiguous stale attempt after the safe window; surface it for reconciliation.
  IF _delivery.first_attempt_at IS NOT NULL
     AND _delivery.first_attempt_at < now()-interval '23 hours'
     AND _delivery.state='sending' THEN
    UPDATE public.solo_beta_welcome_deliveries
      SET state='needs_attention',last_error_code='ambiguous_delivery_window_expired',
          claim_token=NULL,updated_at=now()
      WHERE id=_delivery.id;
    RETURN QUERY SELECT false,'needs_attention'::text,_delivery.id,NULL::uuid,
      ('solo-beta-welcome-'||_delivery.id::text),NULL::text,NULL::text,
      _delivery.tenant_id,NULL::bigint,_delivery.reference_id,NULL::text,NULL::timestamptz;
    RETURN;
  END IF;

  SELECT u.email,
         coalesce(nullif(split_part(coalesce(p.full_name,''),' ',1),''),'there'),
         t.account_number,s.status,s.trial_ends_at
  INTO _email,_name,_account,_subscription_status,_trial_ends_at
  FROM public.solo_beta_fulfillment_receipts r
  JOIN public.solo_beta_enrollments e
    ON e.user_id=r.user_id AND e.tenant_id=r.tenant_id
   AND e.state='fulfilled' AND e.reference_id=r.reference_id
  JOIN public.platform_subscriptions s
    ON s.tenant_id=r.tenant_id AND s.id=r.subscription_id
   AND s.offer_code='paige-solo-beta-monthly-v1'
   AND s.provider_mode='live' AND s.provider_verified_at IS NOT NULL
   AND s.status IN ('trialing','active')
  JOIN public.tenant_members m
    ON m.tenant_id=r.tenant_id AND m.user_id=r.user_id
   AND m.is_owner=true AND m.status='active'
  JOIN public.tenants t
    ON t.id=r.tenant_id AND t.account_type='standalone' AND t.parent_tenant_id IS NULL
  JOIN auth.users u ON u.id=r.user_id
  LEFT JOIN public.profiles p ON p.user_id=r.user_id
  WHERE r.event_id=_event_id AND r.outcome='completed'
    AND r.user_id=_delivery.user_id AND r.tenant_id=_delivery.tenant_id;

  IF _email IS NULL OR _account IS NULL THEN
    UPDATE public.solo_beta_welcome_deliveries
      SET state='needs_attention',last_error_code='verified_delivery_context_missing',
          claim_token=NULL,updated_at=now()
      WHERE id=_delivery.id;
    RETURN QUERY SELECT false,'needs_attention'::text,_delivery.id,NULL::uuid,
      ('solo-beta-welcome-'||_delivery.id::text),NULL::text,NULL::text,
      _delivery.tenant_id,NULL::bigint,_delivery.reference_id,NULL::text,NULL::timestamptz;
    RETURN;
  END IF;

  _token:=gen_random_uuid();
  UPDATE public.solo_beta_welcome_deliveries
  SET state='sending',attempt_count=attempt_count+1,claim_token=_token,
      claimed_at=now(),first_attempt_at=coalesce(first_attempt_at,now()),
      last_error_code=NULL,updated_at=now()
  WHERE id=_delivery.id;

  RETURN QUERY SELECT true,'sending'::text,_delivery.id,_token,
    ('solo-beta-welcome-'||_delivery.id::text),_email,_name,
    _delivery.tenant_id,_account,_delivery.reference_id,_subscription_status,_trial_ends_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.solo_beta_complete_welcome_delivery(
  _delivery_id uuid,_claim_token uuid,_provider_message_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _row public.solo_beta_welcome_deliveries%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  UPDATE public.solo_beta_welcome_deliveries
  SET state='sent',provider_message_id=_provider_message_id,sent_at=now(),
      claim_token=NULL,last_error_code=NULL,updated_at=now()
  WHERE id=_delivery_id AND state='sending' AND claim_token=_claim_token
  RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'welcome_claim_mismatch'; END IF;
  INSERT INTO public.paige_audit_log(
    tenant_id,actor_user_id,actor_role,action,target_type,target_id,payload
  ) VALUES (
    _row.tenant_id,_row.user_id,'system','solo_beta.welcome.sent',
    'tenant',_row.tenant_id,
    jsonb_build_object('reference_id',_row.reference_id,'delivery_id',_row.id,'state','sent')
  );  INSERT INTO public.platform_usage_events(tenant_id,event_type,quantity,metadata)
  VALUES(_row.tenant_id,'solo_beta_welcome_sent',1,
    jsonb_build_object('reference_id',_row.reference_id,'delivery_id',_row.id,'state','sent'));
END;
$$;

CREATE OR REPLACE FUNCTION public.solo_beta_fail_welcome_delivery(
  _delivery_id uuid,_claim_token uuid,_error_code text,_ambiguous boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _row public.solo_beta_welcome_deliveries%ROWTYPE;
DECLARE _next text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO _row FROM public.solo_beta_welcome_deliveries
  WHERE id=_delivery_id AND state='sending' AND claim_token=_claim_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'welcome_claim_mismatch'; END IF;
  _next:=CASE WHEN _ambiguous OR _row.attempt_count>=5
    THEN 'needs_attention' ELSE 'retryable_failure' END;
  UPDATE public.solo_beta_welcome_deliveries
  SET state=_next,last_error_code=CASE
        WHEN _error_code ~ '^[a-z0-9_]{1,80}$' THEN _error_code ELSE 'welcome_delivery_failed' END,
      next_attempt_at=CASE WHEN _next='retryable_failure' THEN now()+interval '5 minutes' ELSE next_attempt_at END,
      claim_token=NULL,updated_at=now()
  WHERE id=_delivery_id;
  INSERT INTO public.paige_audit_log(
    tenant_id,actor_user_id,actor_role,action,target_type,target_id,payload
  ) VALUES (
    _row.tenant_id,_row.user_id,'system','solo_beta.welcome.failed',
    'tenant',_row.tenant_id,
    jsonb_build_object('reference_id',_row.reference_id,'delivery_id',_row.id,
      'state',_next,'attempt',_row.attempt_count,
      'error_code',CASE WHEN _error_code ~ '^[a-z0-9_]{1,80}$' THEN _error_code ELSE 'welcome_delivery_failed' END)
  );  INSERT INTO public.platform_usage_events(tenant_id,event_type,quantity,metadata)
  VALUES(_row.tenant_id,'solo_beta_welcome_failed',1,
    jsonb_build_object('reference_id',_row.reference_id,'delivery_id',_row.id,
      'state',_next,'attempt',_row.attempt_count,
      'error_code',CASE WHEN _error_code ~ '^[a-z0-9_]{1,80}$' THEN _error_code ELSE 'welcome_delivery_failed' END));
END;
$$;

REVOKE ALL ON FUNCTION public.solo_beta_claim_welcome_delivery(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solo_beta_complete_welcome_delivery(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solo_beta_fail_welcome_delivery(uuid,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_claim_welcome_delivery(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.solo_beta_complete_welcome_delivery(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.solo_beta_fail_welcome_delivery(uuid,uuid,text,boolean) TO service_role;

-- Terms acceptance is legal/intake persistence only. It must never dispatch a
-- welcome or imply that the paid Solo workspace was provisioned.
CREATE OR REPLACE FUNCTION public.record_signup_acceptance(_uid uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_terms_ver integer;
  v_terms_str text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF _uid IS NOT NULL AND _uid <> auth.uid() THEN
      RAISE EXCEPTION 'cannot record acceptance for another user' USING ERRCODE='42501';
    END IF;
    v_uid:=auth.uid();
  ELSIF coalesce(auth.role(),'')='service_role' AND _uid IS NOT NULL THEN
    v_uid:=_uid;
  ELSE
    RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000';
  END IF;

  SELECT ld.version INTO v_terms_ver
  FROM public.legal_documents ld
  WHERE ld.slug='terms' AND ld.is_current
  ORDER BY ld.version DESC LIMIT 1;
  v_terms_ver:=coalesce(v_terms_ver,1);
  v_terms_str:='terms@'||v_terms_ver::text;

  UPDATE public.profiles
  SET terms_accepted_at=coalesce(terms_accepted_at,now()),
      terms_version=coalesce(terms_version,v_terms_str)
  WHERE user_id=v_uid;

  INSERT INTO public.legal_acceptances(user_id,document_slug,document_version,context)
  VALUES(v_uid,'terms',v_terms_ver,jsonb_build_object('via','record_signup_acceptance'))
  ON CONFLICT(user_id,document_slug,document_version) DO NOTHING;

  INSERT INTO public.user_roles(user_id,role) VALUES(v_uid,'user')
  ON CONFLICT(user_id,role) DO NOTHING;

  PERFORM public.ensure_provisioning_entitlements(v_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.record_signup_acceptance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_signup_acceptance(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.solo_beta_welcome_deliveries IS
  'Service-only receipt-linked outbox for the verified Solo Beta provisioning welcome.';
COMMENT ON FUNCTION public.record_signup_acceptance(uuid) IS
  'Persists general terms and base signup state. Never sends a welcome; Solo welcome follows verified fulfillment only.';
-- Durable recovery: reuse the repository's Vault-backed cron-token seam to
-- re-drive due welcome rows. The drainer reuses send-transactional-email and
-- never owns recipient, tenant, entitlement, or provider identity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.schedule(
      'solo-beta-welcome-drain',
      '*/5 * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/solo-beta-welcome-drainer',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-cron-token',public.cron_token_header()
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;