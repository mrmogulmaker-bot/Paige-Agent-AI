-- #140 B2 / #557 — the §9 SUBSCRIBE wall for the live-call co-pilot transcript.
--
-- B1 (paige-stt) broadcasts transcripts SERVER-SIDE via a service-role REST POST to
-- /realtime/v1/api/broadcast, keyed on the per-tenant, per-call topic
--     voice-stt:<tenantId>:<callSid>
-- Service-role publish BYPASSES RLS, so the server keeps publishing unchanged. The
-- SUBSCRIBE side, however, was OPEN: any authenticated client that guessed the topic
-- string could ride ANOTHER tenant's call audio. This migration closes that hole the
-- SAME way the presence (20260712170000_user_presence_realtime_topic_rls.sql) and
-- Context Rail (20260712200000_paige_context_rail_step2_realtime.sql) layers do — a
-- SECURITY DEFINER topic-authorizer + a realtime.messages SELECT policy — so the
-- browser can only subscribe as a PRIVATE channel to voice-stt:<theirOwnTenant>:%.
--
-- realtime.messages is RLS-on, deny-all baseline; this ADDS one SELECT policy and
-- nothing else loosens. No INSERT policy: clients never broadcast the transcript —
-- the server-side realtime REST publish (service-role) does, and it needs no policy.
--
-- §32 PERSISTED-APPLY-PROOF OWED: this migration is idempotent + preview-safe, but a
-- rollback/BEGIN..ROLLBACK proof only shows the SQL RUNS. It is not DONE until CI's
-- deploy-migrations pipeline (push-to-main → `supabase db push` → `migration list`
-- verify → move db-live) records version 20260730120000 in prod's
-- supabase_migrations.schema_migrations AND the policy "voice-stt topic read own
-- tenant" is queryable on realtime.messages on prod. Confirm both before calling it
-- applied — never "it should be applied."

-- ── (A) TOPIC AUTHORIZER — who may RECEIVE on a voice-stt topic (the §9 wall) ────
-- Parses the <tenantId> segment out of voice-stt:<tenantId>:<callSid> and authorizes
-- ONLY a same-tenant staff subscriber (or the platform owner). A non-uuid segment or
-- a cross-tenant guess is a non-match, never an error. Lives in public (safe on a
-- preview branch where realtime.* privileges may differ).
CREATE OR REPLACE FUNCTION public.can_access_voice_stt_topic(_topic text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant       uuid := public.current_user_tenant_id();
  v_uid          uuid := auth.uid();
  v_topic_tenant uuid;
BEGIN
  IF v_uid IS NULL OR _topic IS NULL THEN
    RETURN false;
  END IF;
  IF _topic NOT LIKE 'voice-stt:%' THEN
    RETURN false;
  END IF;

  -- Segment 2 of 'voice-stt:<tenantId>:<callSid>' is the tenant uuid. A malformed
  -- (non-uuid) segment is a non-match, not an exception — a guessed topic must fail
  -- CLOSED, never error the whole policy evaluation.
  BEGIN
    v_topic_tenant := split_part(_topic, ':', 2)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF v_topic_tenant IS NULL THEN
    RETURN false;
  END IF;

  -- The subscriber must OWN the topic's tenant AND hold a staff role, OR be the
  -- platform owner. A tenant can NEVER subscribe to another tenant's call audio.
  RETURN public.is_platform_owner()
      OR (v_tenant IS NOT NULL
          AND v_tenant = v_topic_tenant
          AND public.has_any_role(v_uid, ARRAY['admin','super_admin','coach']));
END $$;
REVOKE ALL ON FUNCTION public.can_access_voice_stt_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_voice_stt_topic(text) TO authenticated;

-- ── (B) REALTIME POLICY — receive gate only (server-side REST send needs none) ──
-- PREVIEW-SAFE (#275/#350): realtime.messages may be absent or not owned by the
-- migration role on a Supabase preview branch, where a bare CREATE POLICY hard-fails
-- the whole branch build. Guard it: no-op (with a NOTICE) when the table is missing
-- or privilege is insufficient. On prod the table exists and the policy is created.
-- Idempotent via DROP POLICY IF EXISTS, so a fresh-DB reset re-runs cleanly.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE '[voice-stt rls] realtime.messages absent — skipping topic policy (preview-safe no-op)';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "voice-stt topic read own tenant" ON realtime.messages;
  CREATE POLICY "voice-stt topic read own tenant"
    ON realtime.messages FOR SELECT TO authenticated
    USING (
      realtime.topic() LIKE 'voice-stt:%'
      AND public.can_access_voice_stt_topic(realtime.topic())
    );
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE '[voice-stt rls] insufficient privilege on realtime.messages — skipping topic policy (preview-safe no-op)';
END $$;
