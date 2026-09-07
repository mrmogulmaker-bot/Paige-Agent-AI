\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  actor_id uuid := '00000000-0000-4000-8000-000000000701';
  proof_id uuid := '00000000-0000-4000-8000-000000000702';
  first_id uuid;
  second_id uuid;
  after_release_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO auth.users(id,aud,role) VALUES(actor_id,'authenticated','authenticated') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.paige_voice_provider_verifications(id,provider,provider_voice_ref,key_scope_verified,voice_authorized,retention_policy_approved,zero_retention_confirmed,quota_verified,hard_cost_limit_usd,max_usd_per_1000_chars,verified_at,evidence_ref,verified_by_actor_id)
  VALUES(proof_id,'elevenlabs','proof-fixture-ref',true,true,true,true,true,0.20,0.10,now(),'proof-fixture',actor_id);
  UPDATE public.paige_voice_profiles SET provider='elevenlabs',provider_voice_ref='proof-fixture-ref',revision='proof-fixture-r1',approved=true,active=true,effective_at=now(),provider_verification_id=proof_id,provider_verification_receipt_ref='proof-fixture',provider_verified_at=now() WHERE slot='active';
  UPDATE public.paige_voice_readiness SET transport_enabled=true,availability='PARTIAL',key_scope_verified=true,voice_authorized=true,retention_policy_approved=true,zero_retention_confirmed=true,quota_verified=true,hard_cost_limit_usd=0.20,max_usd_per_1000_chars=0.10,provider_verification_id=proof_id,account_verification_receipt_ref='proof-fixture',account_verified_at=now() WHERE singleton=true;

  first_id := (public.reserve_paige_voice_cost_internal(actor_id,NULL,'proof-fixture-r1',gen_random_uuid(),1000)->>'reservation_id')::uuid;
  IF (public.reserve_paige_voice_cost_internal(actor_id,NULL,'proof-fixture-r1',(SELECT request_ref FROM public.paige_voice_cost_reservations WHERE id=first_id),1000)->>'reservation_id')::uuid<>first_id THEN RAISE EXCEPTION 'idempotent retry changed reservation'; END IF;
  second_id := (public.reserve_paige_voice_cost_internal(actor_id,NULL,'proof-fixture-r1',gen_random_uuid(),1000)->>'reservation_id')::uuid;
  IF first_id IS NULL OR second_id IS NULL THEN RAISE EXCEPTION 'below/exact cap reservation failed'; END IF;
  BEGIN
    PERFORM public.reserve_paige_voice_cost_internal(actor_id,NULL,'proof-fixture-r1',gen_random_uuid(),1);
    RAISE EXCEPTION 'over-cap reservation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '54000' THEN NULL; END;

  PERFORM public.settle_paige_voice_cost_internal(first_id,actor_id,'released');
  after_release_id := (public.reserve_paige_voice_cost_internal(actor_id,NULL,'proof-fixture-r1',gen_random_uuid(),1)->>'reservation_id')::uuid;
  IF after_release_id IS NULL THEN RAISE EXCEPTION 'released reservation did not restore capacity'; END IF;
  PERFORM public.settle_paige_voice_cost_internal(second_id,actor_id,'committed');
  PERFORM public.settle_paige_voice_cost_internal(after_release_id,actor_id,'committed');

  IF position('FOR UPDATE' in pg_get_functiondef('public.reserve_paige_voice_cost_internal(uuid,uuid,text,uuid,integer)'::regprocedure))=0 THEN RAISE EXCEPTION 'reservation is not concurrency locked'; END IF;

  UPDATE public.paige_voice_provider_verifications SET key_scope_verified=false WHERE id=proof_id;
  BEGIN PERFORM public.resolve_paige_voice_profile_internal(now()); RAISE EXCEPTION 'revoked key scope resolved'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  UPDATE public.paige_voice_provider_verifications SET key_scope_verified=true,voice_authorized=false WHERE id=proof_id;
  BEGIN PERFORM public.resolve_paige_voice_profile_internal(now()); RAISE EXCEPTION 'revoked voice resolved'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  UPDATE public.paige_voice_provider_verifications SET voice_authorized=true,retention_policy_approved=false WHERE id=proof_id;
  BEGIN PERFORM public.resolve_paige_voice_profile_internal(now()); RAISE EXCEPTION 'revoked retention resolved'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  UPDATE public.paige_voice_provider_verifications SET retention_policy_approved=true,zero_retention_confirmed=false WHERE id=proof_id;
  BEGIN PERFORM public.resolve_paige_voice_profile_internal(now()); RAISE EXCEPTION 'revoked ZRM resolved'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  UPDATE public.paige_voice_provider_verifications SET zero_retention_confirmed=true,quota_verified=false WHERE id=proof_id;
  BEGIN PERFORM public.resolve_paige_voice_profile_internal(now()); RAISE EXCEPTION 'revoked quota resolved'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  UPDATE public.paige_voice_provider_verifications SET quota_verified=true,hard_cost_limit_usd=0.30 WHERE id=proof_id;
  BEGIN PERFORM public.resolve_paige_voice_profile_internal(now()); RAISE EXCEPTION 'mismatched hard limit resolved'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
END $$;

ROLLBACK;
\echo 'Paige voice cost/revocation proof: PASS (rolled back)'
