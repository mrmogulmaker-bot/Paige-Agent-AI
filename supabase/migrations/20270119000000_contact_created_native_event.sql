-- ─────────────────────────────────────────────────────────────────────────────
-- Main Paige Operational Chat · P3 (MPC-4) — the reusable contact.created native event
--
-- The owner's named foundation: "a durable tenant-safe event → approved subscriber → safe
-- retry → recorded delivery → Paige reports whether a notification actually fired." It is built
-- as a REUSABLE native-event bus (not a contact-only table), because the owner framed it as the
-- foundation for Telegram/onboarding/pipeline/automation/reminders/analytics — `contact.created`
-- is simply its first producer. It EXTENDS, never forks:
--   • subscribers are §67 Process Records — `paige_automations` rows whose trigger_key matches the
--     event (a new `is_live` row is added to the `paige_automation_triggers` catalogue here);
--   • durable fire-once delivery MIRRORS the proven growth-submission pattern exactly
--     (20260714092000 + 20260715125000): an AFTER-INSERT producer → swallow-and-notice
--     net.http_post enqueue → an atomic claim ledger → a per-(event,subscriber) dispatch ledger
--     with a UNIQUE fire-once key → an edge drainer → a pg_cron sweeper backstop.
--
-- SCOPE (honest, §13/§947): this ships the EVENT SUBSTRATE and its fire-once delivery. It does NOT
-- execute a subscriber's acts and performs NO external send — Telegram stays off until its own
-- Vault/security design lands (owner directive). The MVP subscriber consumption is a recorded
-- delivery, so Paige can truthfully say the event fired and reached its subscribers without
-- claiming a notification was sent that was not.
--
-- Depends on 20270118000000 (create_contact_v2 / public.clients). Ordered after it so the clients
-- table + the genuine-insert path exist. §9 tenant-scoped throughout; §59 the service-only claim
-- RPCs re-enforce caller scope IN-BODY (auth.uid() IS NULL), the grant is never the guard.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Catalogue row — contact.created is LIVE because its substrate ships HERE ──────────────
-- Unlike record.lifecycle_moved (dark: no substrate), this trigger can actually fire the moment
-- this migration applies, so it is is_live=true with no dark_reason (the CHECK enforces that pair).
INSERT INTO public.paige_automation_triggers (key, label, category, description, is_live, dark_reason)
VALUES
  ('contact.created', 'A new contact is added', 'records',
   'A brand-new contact/client record is created, by anyone or any path.', true, NULL)
ON CONFLICT (key) DO NOTHING;

-- ── 1. The event outbox + atomic claim ledger (mirrors growth_form_submissions' dual role) ────
-- One row per native event. The producer sets a dedup_key so the SAME occurrence is never
-- recorded twice (contact.created uses 'contact.created:<client id>' → exactly one per contact,
-- idempotent even if the trigger somehow fires twice). The processing_state/attempts/claimed_at
-- columns are the atomic claim ledger the drainer + sweeper coordinate on.
CREATE TABLE IF NOT EXISTS public.paige_native_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key     text NOT NULL REFERENCES public.paige_automation_triggers(key),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject_table text NOT NULL,
  subject_id    uuid NOT NULL,
  -- occurrence identity — one event per (producer-chosen) key; the UNIQUE guard is event-level fire-once
  dedup_key     text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  -- atomic claim ledger (service-only writers drive these via the RPCs below)
  processing_state text NOT NULL DEFAULT 'pending'
    CHECK (processing_state IN ('pending','claimed','done','error')),
  attempts      int NOT NULL DEFAULT 0,
  claimed_at    timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_pne_sweep   ON public.paige_native_events (processing_state, claimed_at);
CREATE INDEX IF NOT EXISTS idx_pne_tenant  ON public.paige_native_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pne_key     ON public.paige_native_events (event_key, tenant_id);

ALTER TABLE public.paige_native_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.paige_native_events TO authenticated;   -- READ own tenant only; writes are service-role
GRANT ALL    ON public.paige_native_events TO service_role;

DROP POLICY IF EXISTS pne_tenant_read ON public.paige_native_events;
CREATE POLICY pne_tenant_read ON public.paige_native_events FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS pne_no_direct_write ON public.paige_native_events;
CREATE POLICY pne_no_direct_write ON public.paige_native_events FOR ALL TO authenticated
  USING (false) WITH CHECK (false);   -- service-only writers (the trigger + drainer run as definer/service)

-- ── 2. The per-(event, subscriber) dispatch ledger — UNIQUE = fire once per subscriber ────────
CREATE TABLE IF NOT EXISTS public.paige_event_dispatches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.paige_native_events(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.paige_automations(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'done' CHECK (status IN ('done','error','skipped')),
  result        jsonb NOT NULL DEFAULT '{}'::jsonb,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, automation_id)
);

CREATE INDEX IF NOT EXISTS idx_ped_event  ON public.paige_event_dispatches (event_id);
CREATE INDEX IF NOT EXISTS idx_ped_tenant ON public.paige_event_dispatches (tenant_id);

ALTER TABLE public.paige_event_dispatches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.paige_event_dispatches TO authenticated;
GRANT ALL    ON public.paige_event_dispatches TO service_role;

DROP POLICY IF EXISTS ped_tenant_read ON public.paige_event_dispatches;
CREATE POLICY ped_tenant_read ON public.paige_event_dispatches FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS ped_no_direct_write ON public.paige_event_dispatches;
CREATE POLICY ped_no_direct_write ON public.paige_event_dispatches FOR ALL TO authenticated
  USING (false) WITH CHECK (false);   -- service-only writers

-- ── 3. Lifecycle RPCs (service-only; §59 caller-scope IN-BODY: auth.uid() IS NULL) ────────────
-- 3a. Atomic single-UPDATE claim. Loser gets zero rows → no double-drain. Re-claimable after a
--     stale 5-minute lease (crashed drainer); attempts<5 caps retries; terminal never re-claimed.
CREATE OR REPLACE FUNCTION public.paige_claim_event(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.paige_native_events%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'EVENT_CLAIM_FORBIDDEN: service role only' USING ERRCODE='42501';
  END IF;

  UPDATE public.paige_native_events
     SET processing_state = 'claimed',
         attempts         = attempts + 1,
         claimed_at       = now()
   WHERE id = p_event_id
     AND attempts < 5
     AND ( processing_state = 'pending'
        OR (processing_state = 'claimed' AND claimed_at < now() - interval '5 minutes') )
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'claimed', true,
    'event_id', _row.id, 'tenant_id', _row.tenant_id,
    'event_key', _row.event_key, 'subject_table', _row.subject_table,
    'subject_id', _row.subject_id, 'payload', _row.payload, 'attempts', _row.attempts
  );
END $function$;

-- 3b. Complete — terminal success (all subscribers dispatched).
CREATE OR REPLACE FUNCTION public.paige_complete_event(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.paige_native_events%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'EVENT_COMPLETE_FORBIDDEN: service role only' USING ERRCODE='42501';
  END IF;

  UPDATE public.paige_native_events
     SET processing_state = 'done', last_error = NULL
   WHERE id = p_event_id
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  RETURN jsonb_build_object('ok', true, 'event_id', _row.id, 'status', 'done');
END $function$;

-- 3c. Fail — reset to 'pending' for retry, terminal 'error' after 5 attempts.
CREATE OR REPLACE FUNCTION public.paige_fail_event(p_event_id uuid, p_error text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.paige_native_events%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'EVENT_FAIL_FORBIDDEN: service role only' USING ERRCODE='42501';
  END IF;

  UPDATE public.paige_native_events
     SET processing_state = CASE WHEN attempts >= 5 THEN 'error' ELSE 'pending' END,
         last_error       = p_error,
         claimed_at       = now()
   WHERE id = p_event_id
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  RETURN jsonb_build_object(
    'ok', true, 'event_id', _row.id,
    'status', _row.processing_state, 'terminal', (_row.processing_state = 'error')
  );
END $function$;

REVOKE ALL ON FUNCTION public.paige_claim_event(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paige_complete_event(uuid)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paige_fail_event(uuid, text)       FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paige_claim_event(uuid)         TO service_role;
GRANT EXECUTE ON FUNCTION public.paige_complete_event(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION public.paige_fail_event(uuid, text)    TO service_role;

-- ── 4. Fire helper — DB→edge invoke of the dispatcher (mirrors growth_fire_submission_processor) ─
-- Swallow-and-notice so a failed enqueue can NEVER abort the producer's write; the sweeper is the
-- durable retry. Service-role/internal only; reused by the trigger AND the cron sweeper (one seam).
CREATE OR REPLACE FUNCTION public.paige_fire_event_processor(
  p_event_id uuid,
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  edge_url text;
  service_key text;
BEGIN
  SELECT decrypted_secret INTO edge_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF edge_url IS NULL OR service_key IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := edge_url || '/functions/v1/paige-native-event-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),
    body := jsonb_build_object('event_id', p_event_id, 'tenant_id', p_tenant_id)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'paige_fire_event_processor failed: %', SQLERRM;
END;
$function$;

-- ── 5. The first producer — AFTER INSERT on public.clients emits contact.created ──────────────
-- Fires on a GENUINE new contact only: AFTER INSERT runs once per real row, so "new contact only"
-- is satisfied structurally (an existing-row resolve by create_contact_v2 does NO insert → no
-- event). The payload carries §9-minimal, within-tenant display facts (ids + account_number +
-- first_name + lifecycle_stage + source) — NOT email/phone; a subscriber reads full PII by id
-- within the tenant if it ever needs it. Swallow-and-notice so eventing can never abort the create.
CREATE OR REPLACE FUNCTION public.trg_clients_emit_contact_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _event_id uuid;
BEGIN
  -- TRANSACTIONAL OUTBOX (§32/§13, tightened by the §39 peer-gate): the event row is written in the
  -- SAME transaction as the contact and its failure is NOT swallowed. An event bus that silently
  -- drops its source event is worthless to every downstream subscriber, and the sweeper can only
  -- re-drive rows that EXIST — a never-written event is unrecoverable. The ONLY expected conflict
  -- (the same contact twice) is absorbed by ON CONFLICT DO NOTHING; any OTHER failure (a real bug, a
  -- future constraint, a serialization conflict) rolls the whole statement back LOUDLY so the caller
  -- sees it and retries idempotently (create_contact_v2 dedup + this dedup_key make the retry safe)
  -- — never a contact created with its event lost in silence. This is deliberately STRONGER than the
  -- growth reference, whose producer swallowed. Only the net.http_post FIRE is best-effort, and its
  -- OWN handler inside paige_fire_event_processor swallows that (the pg_cron sweeper is its backstop).
  INSERT INTO public.paige_native_events
    (event_key, tenant_id, subject_table, subject_id, dedup_key, payload)
  VALUES (
    'contact.created', NEW.tenant_id, 'clients', NEW.id,
    'contact.created:' || NEW.id::text,
    jsonb_build_object(
      'contact_id',      NEW.id,
      'account_number',  NEW.account_number,
      'first_name',      NEW.first_name,
      'lifecycle_stage', NEW.lifecycle_stage,
      'source',          NEW.source
    )
  )
  ON CONFLICT (dedup_key) DO NOTHING
  RETURNING id INTO _event_id;

  -- Only enqueue when we actually recorded a new event (ON CONFLICT → _event_id NULL → skip).
  IF _event_id IS NOT NULL THEN
    PERFORM public.paige_fire_event_processor(_event_id, NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- CONSTRAINT (§37, flagged by the §5 compliance pass): this is FOR EACH ROW, and each row does
-- 2× vault reads + one net.http_post enqueue. Every contact-insert path today is single-row
-- (create_contact_v2, the portal/sub-account/agency invites, public booking, solo/zapier/skool
-- intake) — inventoried, so the per-row cost is fine now. But if a BULK/CSV import-insert path is
-- ever added, it must suppress per-row firing (e.g. a session GUC the trigger checks) and enqueue
-- the batch once — otherwise an N-row import fires N events + N HTTP posts + 2N vault decrypts in
-- one statement. The growth reference never faced this (form submissions are inherently one at a
-- time); we do, the moment bulk import lands. Do NOT add a bulk path without that suppression.
DROP TRIGGER IF EXISTS trg_clients_emit_contact_created ON public.clients;
CREATE TRIGGER trg_clients_emit_contact_created
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_clients_emit_contact_created();

-- ── 6. Sweeper — re-drive stuck events (the durable backstop for the fire-and-forget trigger) ──
CREATE OR REPLACE FUNCTION public.paige_sweep_stuck_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _row record; _count int := 0;
BEGIN
  FOR _row IN
    SELECT id, tenant_id
      FROM public.paige_native_events
     WHERE processing_state IN ('pending','claimed')
       AND attempts < 5
       AND created_at < now() - interval '5 minutes'
     ORDER BY created_at
     LIMIT 100
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.paige_fire_event_processor(_row.id, _row.tenant_id);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'paige_sweep_stuck_events: event % failed to re-drive: %', _row.id, SQLERRM;
    END;
  END LOOP;
  RETURN _count;
END;
$function$;

-- §59 least-privilege: these two are INTERNAL-only (invoked by the AFTER-INSERT trigger and the
-- cron sweeper, both SECURITY DEFINER owned by a superuser, which bypass EXECUTE grants). Lock them
-- to service_role so no tenant JWT can drive a net.http_post enqueue or the sweeper directly — the
-- grant is never the guard, but least privilege still applies (better than the growth reference,
-- which left these at the PUBLIC default).
REVOKE ALL ON FUNCTION public.paige_fire_event_processor(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paige_sweep_stuck_events()             FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paige_fire_event_processor(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.paige_sweep_stuck_events()             TO service_role;

-- ── 7. Schedule the sweeper every 5 minutes (cron.schedule upserts by jobname → re-runnable) ──
SELECT cron.schedule(
  'paige-native-event-sweeper',
  '*/5 * * * *',
  $cron$ SELECT public.paige_sweep_stuck_events(); $cron$
);
