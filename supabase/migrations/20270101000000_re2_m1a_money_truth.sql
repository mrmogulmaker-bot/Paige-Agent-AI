-- RE-2 M1-a — THE MONEY-TRUTH LAYER: provider-confirmed actual spend + reconciliation + complete receipt.
--
-- Owner rulings 2026-09-06 (autonomy-architecture.md §10.7-§10.9, and two mid-session refinements):
--   • "Provider-confirmed actual amounts are the final financial truth. A planned, estimated, or requested
--      amount is never treated as money spent." (Reserved money is NOT spent money.)
--   • "Reconciliation for delayed, partial, failed, refunded, reversed, or externally-changed provider
--      outcomes." + a complete owner-visible receipt (granted-by, rule, reserved amt, confirmed amt,
--      provider reference, outcome, timestamp, Rail evidence).
--   • "Accept confirmed amounts, reversals, refunds, and references ONLY from an authenticated provider-side
--      receipt/webhook or an equivalently verified provider read." — NEVER client-supplied/optimistic values.
--
-- WHAT THIS SLICE IS. The money-truth layer on top of the PR-1 substrate (20261230000000): the confirmed
-- actual is recorded as the financial truth, the atomic ledger is TRUED-UP to it, and every post-settlement
-- provider outcome (partial/refund/reversal/external-change/void) is reconciled into an APPEND-ONLY immutable
-- audit and reflected in the ledger. Provider-agnostic; generalizes to ads / purchasing / bookkeeping-payments
-- / Marketplace — never one narrow money use case.
--
-- WHAT THIS SLICE IS NOT — DARK, ZERO BEHAVIORAL CHANGE (§13/§32). No execution lane produces confirmed spend
-- yet (that is PR-3). The new columns/table/functions have ZERO runtime producers; the §32 proof drives them
-- with CONTROLLED FIXTURE receipts inside BEGIN..ROLLBACK. No real payment/purchase/ad-spend/provider change
-- happens here. The authenticated end-to-end drive is owed to PR-3 (§32.c).
--
-- FOLDED — §39 adversarial verifier + §5 compliance officer FIX-FIRST findings (2026-09-06), before merge:
--   C1 (§39 CRITICAL) — reconcile now bounds each event's ledger effect to the ACT's OWN contribution
--      (applied_delta = new_confirmed − old_confirmed), NEVER the raw caller delta against the SHARED window
--      baseline — so an over-refund can never erase a sibling act's spend or open phantom cap headroom. The
--      over-refund anomaly keys on the ACT (old_confirmed + delta < 0), not the window total.
--   H1 (§39) — the webhook-idempotency unique index is now PARTIAL on `applied = true`, so an out-of-order
--      event recorded `applied=false` does NOT occupy the slot: a redelivery AFTER confirm re-enters and
--      applies (never permanently swallowed). PR-3's webhook handler owns re-requesting if a provider never
--      redelivers (the orphan carries escalate:true).
--   H2 (§39) — the append-only trigger RAISES on cascade DELETE too, so the audit FKs are ON DELETE RESTRICT
--      (an immutable financial audit legitimately BLOCKS parent hard-deletion; offboarding must archive first —
--      a retention decision flagged to the owner for PR-3). The prior "cascade unaffected" comment was FALSE.
--   H3 (§39) — the 'confirm' reconciliation row carries provider_event_id = NULL (confirm's idempotency is the
--      receipt STATUS gate, not the index), so the charge id never pollutes the event-id namespace or collides.
--   M1 (§39 + §5 F2) — reconcile RECOMPUTES over_cap_breach authoritatively (= fresh per-window check), not a
--      sticky OR, so a refund that brings a window back under cap CLEARS the live escalation flag; the
--      historical breach lives immutably in the anomaly log.
--   M2 (§39) — a minimal reconciliation state guard: a terminal outcome (refunded/reversed/voided) never
--      regresses to partially_refunded; 'void' maps to a real 'voided' status; a post-terminal event is
--      applied to the dollars but flagged 'post_terminal_reconcile'. (Full state-machine + void financial
--      semantics flagged to the owner as a MEDIUM product decision.)
--   M3/B4 — a reconcile on a non-USD-CONFIRMED receipt is labeled 'currency_unhandled' (it WAS confirmed,
--      just not in USD), distinct from a genuinely pre-confirm 'orphaned_pre_confirm'.
--   B1 (§5) — the append-only guard also fires BEFORE TRUNCATE (a statement-level owner bypass).
--   B2 (§5) — confirm/reconcile lock GRANT-FIRST (grant → receipt → window), uniform with reserve; the comment
--      now states the true, deadlock-safe order.
--   B3 (§5) — reconcile INSERTS the immutable event BEFORE mutating the ledger (mirrors reserve's
--      insert-before-increment), so the partial unique index is a real concurrency backstop, not a false claim.
--   L1 (§39) — reconcile rejects a give-back event (refund/reversal/partial) carrying a positive delta
--      (defense-in-depth against a PR-3 caller sign bug).
--
-- DOCTRINE BINDINGS. §18 extends PR-1, forks nothing. §13 confirmed=truth, estimate≠spend, no silent clamp,
-- never-drop. §17 append-only, enforced structurally (UPDATE/DELETE/TRUNCATE trigger + RESTRICT FKs). §38
-- evidence-only of the tenant's own rail; never merchant-of-record. §59 writers service-role-only + in-body
-- scope. §10.9 narrowest-limit / fail-closed (non-USD never coerced into the USD ledger).
--
-- CONCURRENCY. confirm/reconcile take the GRANT-ROW `FOR UPDATE` lock FIRST — the single serialization point
-- PR-1's reserve documents (20261230000000 L273-279) — THEN the receipt row, THEN the window rows. Lock order
-- grant → receipt → window matches reserve, so no lock-order inversion / deadlock, and confirm/reconcile see a
-- consistent multi-window snapshot for the over-cap decision.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RECEIPT COLUMNS — the confirmed actual, its currency, rail evidence, the reconciliation rollup.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.paige_authority_act_runs
  ADD COLUMN IF NOT EXISTS confirmed_cost_usd numeric(12,4)
    CHECK (confirmed_cost_usd IS NULL OR confirmed_cost_usd >= 0),
  ADD COLUMN IF NOT EXISTS confirmed_currency text,
  ADD COLUMN IF NOT EXISTS rail_evidence jsonb,
  -- ORTHOGONAL to `status` (the reserve/consume lifecycle). A refunded act stays status='succeeded' (it
  -- executed) — overloading status would break authority_reserve's exactly-once replay (its L339 branches on
  -- status IN reserved/succeeded) and risk a real-money re-execution. 'voided' is the M2 terminal state.
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'none'
    CHECK (reconciliation_status IN ('none','partially_refunded','refunded','reversed','voided')),
  -- LIVE (not historical): the confirmed actual currently leaves a window past its cap. Recomputed on every
  -- confirm/reconcile against CURRENT caps; a refund that brings the window back under cap clears it. The
  -- historical breach is preserved immutably in the reconciliation anomaly log.
  ADD COLUMN IF NOT EXISTS over_cap_breach boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.paige_authority_act_runs.confirmed_cost_usd IS
  'Provider-CONFIRMED actual spend in USD (financial truth). NULL until confirmed (or when confirmed in a non-USD currency). cost_usd is the reserved ESTIMATE; never conflate (§13). RE-2 M1-a.';
COMMENT ON COLUMN public.paige_authority_act_runs.reconciliation_status IS
  'Post-settlement outcome, ORTHOGONAL to status: none/partially_refunded/refunded/reversed/voided. A refunded act keeps status=succeeded (it executed). RE-2 M1-a.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE APPEND-ONLY RECONCILIATION AUDIT — one immutable row per provider outcome event.
-- ─────────────────────────────────────────────────────────────────────────────
-- FKs are ON DELETE RESTRICT (H2): an immutable financial audit BLOCKS hard-deletion of its tenant/grant/
-- receipt. This is deliberate — money records are not silently cascade-wiped. Tenant offboarding / GDPR
-- erasure must ARCHIVE-then-detach the audit first (a retention flow owned by PR-3/ops; flagged to the owner).
CREATE TABLE IF NOT EXISTS public.paige_authority_reconciliations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  receipt_id         uuid NOT NULL REFERENCES public.paige_authority_act_runs(id) ON DELETE RESTRICT,
  grant_id           uuid NOT NULL REFERENCES public.paige_authority_grants(id) ON DELETE RESTRICT,
  event_type         text NOT NULL
                     CHECK (event_type IN ('confirm','partial','adjust','refund','reversal','external_change','void')),
  -- The SIGNED ledger delta this event REQUESTED (+consumes, −gives back). Stored as requested even when a
  -- bound-to-contribution/clamp applied less to the counter, so an over-refund is auditable (§13), never swallowed.
  delta_usd          numeric(12,4) NOT NULL,
  -- The receipt's confirmed_cost_usd AFTER this event (snapshot, for a self-contained audit trail).
  confirmed_total_usd numeric(12,4) NOT NULL,
  currency           text NOT NULL DEFAULT 'USD',
  -- The PROVIDER's own id for THIS event (a refund id ≠ the charge id) — the webhook-replay idempotency anchor.
  -- NULL for internal/confirm/orphaned events (they are not de-duped by the provider-event index).
  provider_event_id  text,
  reason             text,
  evidence           jsonb,           -- the authenticated provider-side payload for this event
  -- Whether this event was APPLIED to the USD ledger. false = recorded-but-not-applied (out-of-order /
  -- pre-confirm / non-USD) — never dropped; flagged in `anomaly` + escalated; does NOT hold the idempotency
  -- slot, so a later real application can still land (§13, H1).
  applied            boolean NOT NULL DEFAULT true,
  -- jsonb ARRAY of anomaly objects, NULL when clean: {kind: over_cap|over_refund|orphaned_pre_confirm|
  --   currency_unhandled|post_terminal_reconcile, window?, cap?, requested_delta?, applied_delta?, ...}.
  anomaly            jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Webhook-replay idempotency: a genuine APPLIED provider event lands at most once per receipt. PARTIAL on
-- `applied` (H1) so a recorded-but-unapplied orphan does NOT occupy the slot — a redelivery after confirm
-- can still apply. Also partial on NOT NULL (internal events carry no provider event id).
CREATE UNIQUE INDEX IF NOT EXISTS paige_authority_reconciliations_provider_event_uk
  ON public.paige_authority_reconciliations (receipt_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL AND applied = true;
CREATE INDEX IF NOT EXISTS paige_authority_reconciliations_receipt_idx
  ON public.paige_authority_reconciliations (receipt_id);
CREATE INDEX IF NOT EXISTS paige_authority_reconciliations_tenant_idx
  ON public.paige_authority_reconciliations (tenant_id);

ALTER TABLE public.paige_authority_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paige_authority_reconciliations_read ON public.paige_authority_reconciliations;
CREATE POLICY paige_authority_reconciliations_read ON public.paige_authority_reconciliations
  FOR SELECT TO authenticated
  USING (public.is_platform_operator() OR public.is_tenant_member(tenant_id));

-- APPEND-ONLY, enforced STRUCTURALLY (§17). RLS does not stop the table owner, and a SECURITY DEFINER fn runs
-- AS the owner — so a "no write policy" would not prevent a DEFINER fn or migration from rewriting/wiping
-- audit history. This RAISES on UPDATE, DELETE, AND TRUNCATE (B1 — TRUNCATE is a statement-level owner bypass
-- the row trigger alone would miss). The RESTRICT FKs above mean a cascade delete never reaches this table
-- (the parent delete is blocked first), so the DELETE branch is belt-and-suspenders for a direct attempt.
CREATE OR REPLACE FUNCTION public.paige_authority_reconciliations_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'paige_authority_reconciliations is append-only (§17): % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
REVOKE ALL ON FUNCTION public.paige_authority_reconciliations_append_only() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_paige_authority_reconciliations_append_only ON public.paige_authority_reconciliations;
CREATE TRIGGER trg_paige_authority_reconciliations_append_only
  BEFORE UPDATE OR DELETE ON public.paige_authority_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.paige_authority_reconciliations_append_only();
DROP TRIGGER IF EXISTS trg_paige_authority_reconciliations_no_truncate ON public.paige_authority_reconciliations;
CREATE TRIGGER trg_paige_authority_reconciliations_no_truncate
  BEFORE TRUNCATE ON public.paige_authority_reconciliations
  FOR EACH STATEMENT EXECUTE FUNCTION public.paige_authority_reconciliations_append_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. authority_confirm — the provider-confirmed-actual entry. Supersedes the estimate-only authority_consume.
-- ─────────────────────────────────────────────────────────────────────────────
-- Records the confirmed actual as truth and TRUES-UP the atomic ledger by (confirmed − reserved) on EACH
-- window the reserve touched — that delta is bounded to THIS act's own reserved contribution (confirmed ≥ 0),
-- so it never disturbs a sibling act's spend. actions_used is NEVER touched (the act happened once; dollars
-- only). Over-cap on confirm RECORDS truth (over_cap_breach) + escalates, never rejects (money already spent
-- on the tenant's own rail; the cap is a PRE-action control). A non-USD settlement is recorded as truth but
-- NOT applied to the USD ledger (fail-closed, flagged; multi-currency FX is a deferred owner decision).
--
-- SETTLEMENT-TRUTH CONTRACT (§13/§32, owner ruling): the caller (PR-3's provider webhook/verified-read handler)
-- passes ONLY provider-authenticated values. Service-role EXECUTE only — never a human click with a self-
-- asserted amount. Idempotent by the receipt STATUS gate + the grant-row lock: only 'reserved' advances.
CREATE OR REPLACE FUNCTION public.authority_confirm(
  _receipt_id uuid,
  _confirmed_cost_usd numeric,
  _provider_ref text,
  _rail_evidence jsonb DEFAULT NULL,
  _confirmed_currency text DEFAULT 'USD',
  _outcome jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _grant_id  uuid;
  _r         record;
  _g         record;
  _confirmed numeric := COALESCE(_confirmed_cost_usd, 0);
  _delta     numeric;
  _kind      text;
  _wstart    date;
  _before    numeric;
  _after     numeric;
  _cap       numeric;
  _breach    boolean := false;
  _anomaly   jsonb := NULL;
  _recon_id  uuid;
BEGIN
  IF _confirmed < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'negative_confirmed_amount');
  END IF;

  -- Lock order grant → receipt → window (B2). Read the receipt's grant_id non-locking (grant_id is immutable),
  -- lock the grant FIRST (the ledger serialization point), then lock + re-read the receipt.
  SELECT grant_id INTO _grant_id FROM public.paige_authority_act_runs WHERE id = _receipt_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receipt_not_found');
  END IF;
  SELECT * INTO _g FROM public.paige_authority_grants WHERE id = _grant_id FOR UPDATE;
  SELECT * INTO _r FROM public.paige_authority_act_runs WHERE id = _receipt_id FOR UPDATE;

  IF auth.uid() IS NOT NULL
     AND NOT public.is_platform_operator()
     AND NOT public.is_tenant_member(_r.tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  IF _r.status = 'succeeded' THEN
    RETURN jsonb_build_object('ok', true, 'receipt_id', _receipt_id, 'replay', true, 'status', 'succeeded');
  END IF;
  IF _r.status <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_reserved', 'status', _r.status);
  END IF;

  -- CURRENCY FAIL-CLOSED (§10.9). Record the non-USD actual as truth (confirmed_currency), but do NOT apply it
  -- to the USD ledger (cannot compare to a USD cap). confirmed_cost_usd stays NULL. Flagged + escalated.
  IF upper(COALESCE(_confirmed_currency, 'USD')) <> 'USD' THEN
    UPDATE public.paige_authority_act_runs
       SET status = 'succeeded', confirmed_cost_usd = NULL, confirmed_currency = upper(_confirmed_currency),
           rail_evidence = _rail_evidence, provider_ref = _provider_ref, outcome = _outcome, settled_at = now()
     WHERE id = _receipt_id;
    _anomaly := jsonb_build_array(jsonb_build_object('kind','currency_unhandled','currency',upper(_confirmed_currency),'confirmed_amount',_confirmed));
    INSERT INTO public.paige_authority_reconciliations
      (tenant_id, grant_id, receipt_id, event_type, delta_usd, confirmed_total_usd, currency, provider_event_id, reason, evidence, applied, anomaly)
    VALUES (_r.tenant_id, _r.grant_id, _receipt_id, 'confirm', 0, 0, upper(_confirmed_currency), NULL,
            'non-USD settlement recorded; USD ledger not adjusted (fail-closed)', _rail_evidence, false, _anomaly)
    RETURNING id INTO _recon_id;
    RETURN jsonb_build_object('ok', true, 'receipt_id', _receipt_id, 'status', 'succeeded', 'currency_deferred', true, 'escalate', true, 'reconciliation_id', _recon_id);
  END IF;

  -- USD path: true-up each reserved window by (confirmed − reserved). Bounded to this act's own reserved
  -- contribution (confirmed ≥ 0, and each window holds ≥ this act's reserved cost), so no sibling is disturbed.
  _delta := _confirmed - COALESCE(_r.cost_usd, 0);
  FOR _kind IN SELECT jsonb_array_elements_text(_r.reserved_windows) LOOP
    _wstart := CASE _kind WHEN 'day' THEN (_r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'week' THEN date_trunc('week', _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'month' THEN date_trunc('month', _r.reserved_at AT TIME ZONE 'UTC')::date ELSE NULL END;
    IF _wstart IS NULL THEN CONTINUE; END IF;
    SELECT spend_used_usd INTO _before FROM public.paige_authority_budget_windows
      WHERE grant_id = _r.grant_id AND window_kind = _kind AND window_start = _wstart FOR UPDATE;
    IF NOT FOUND THEN _before := 0; END IF;
    UPDATE public.paige_authority_budget_windows SET spend_used_usd = GREATEST(0, _before + _delta), updated_at = now()
     WHERE grant_id = _r.grant_id AND window_kind = _kind AND window_start = _wstart RETURNING spend_used_usd INTO _after;
    _cap := CASE _kind WHEN 'day' THEN (_g.caps->>'daily_budget_usd')::numeric
              WHEN 'week' THEN (_g.caps->>'weekly_budget_usd')::numeric
              WHEN 'month' THEN (_g.caps->>'monthly_budget_usd')::numeric ELSE NULL END;
    IF _cap IS NOT NULL AND _after > _cap THEN
      _breach := true;
      _anomaly := COALESCE(_anomaly, '[]'::jsonb) || jsonb_build_object('kind','over_cap','window',_kind,'cap',_cap,'confirmed',_confirmed,'window_spend',_after);
    END IF;
  END LOOP;

  UPDATE public.paige_authority_act_runs
     SET status = 'succeeded', confirmed_cost_usd = _confirmed, confirmed_currency = 'USD',
         rail_evidence = _rail_evidence, provider_ref = _provider_ref, outcome = _outcome, over_cap_breach = _breach, settled_at = now()
   WHERE id = _receipt_id;

  -- The 'confirm' event carries provider_event_id = NULL (H3): confirm is de-duped by the receipt status gate,
  -- not the provider-event index, so the charge id never pollutes the event-id namespace.
  INSERT INTO public.paige_authority_reconciliations
    (tenant_id, grant_id, receipt_id, event_type, delta_usd, confirmed_total_usd, currency, provider_event_id, reason, evidence, applied, anomaly)
  VALUES (_r.tenant_id, _r.grant_id, _receipt_id, 'confirm', _delta, _confirmed, 'USD', NULL, 'provider-confirmed settlement', _rail_evidence, true, _anomaly)
  RETURNING id INTO _recon_id;

  RETURN jsonb_build_object('ok', true, 'receipt_id', _receipt_id, 'status', 'succeeded', 'confirmed_cost_usd', _confirmed,
                           'over_cap_breach', _breach, 'reconciliation_id', _recon_id, 'escalate', (_breach OR _anomaly IS NOT NULL));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. authority_reconcile — post-settlement outcomes: partial / refund / reversal / external-change / adjust / void.
-- ─────────────────────────────────────────────────────────────────────────────
-- Bounds each event's ledger effect to the ACT's OWN contribution (C1): applied_delta = new_confirmed −
-- old_confirmed, so an over-refund can never erase a sibling's spend or open phantom cap headroom. INSERTS the
-- immutable event BEFORE mutating the ledger (B3), so the partial unique index is a real replay backstop.
-- Recomputes over_cap_breach authoritatively (M1). actions_used never touched. Out-of-order / pre-confirm /
-- non-USD events are recorded (applied=false) + escalated, never dropped (§13); they do not hold the
-- idempotency slot, so a later real application can still land (H1). Service-role only; provider-authenticated
-- values only.
CREATE OR REPLACE FUNCTION public.authority_reconcile(
  _receipt_id uuid,
  _event_type text,
  _delta_usd numeric,
  _provider_event_id text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _evidence jsonb DEFAULT NULL,
  _currency text DEFAULT 'USD'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _grant_id     uuid;
  _r            record;
  _g            record;
  _delta        numeric := COALESCE(_delta_usd, 0);
  _applied_delta numeric;
  _existing     record;
  _kind         text;
  _wstart       date;
  _before       numeric;
  _after        numeric;
  _cap          numeric;
  _breach       boolean := false;
  _is_terminal  boolean;
  _new_total    numeric;
  _new_status   text;
  _anomaly      jsonb := NULL;
  _recon_id     uuid;
BEGIN
  IF _event_type NOT IN ('partial','adjust','refund','reversal','external_change','void') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_event_type', 'event_type', _event_type);
  END IF;
  -- L1 defense-in-depth: a give-back event carrying a positive delta is a caller sign bug.
  IF _event_type IN ('refund','reversal','partial') AND _delta > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_delta_sign', 'event_type', _event_type, 'delta', _delta);
  END IF;

  -- Lock order grant → receipt → window (B2).
  SELECT grant_id INTO _grant_id FROM public.paige_authority_act_runs WHERE id = _receipt_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receipt_not_found');
  END IF;
  SELECT * INTO _g FROM public.paige_authority_grants WHERE id = _grant_id FOR UPDATE;
  SELECT * INTO _r FROM public.paige_authority_act_runs WHERE id = _receipt_id FOR UPDATE;

  IF auth.uid() IS NOT NULL
     AND NOT public.is_platform_operator()
     AND NOT public.is_tenant_member(_r.tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  -- Replay: an already-APPLIED event with this provider id returns noop. (applied=false rows do not match, so
  -- an orphan never blocks a later real application — H1.)
  IF _provider_event_id IS NOT NULL THEN
    SELECT * INTO _existing FROM public.paige_authority_reconciliations
      WHERE receipt_id = _receipt_id AND provider_event_id = _provider_event_id AND applied = true;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'reconciliation_id', _existing.id, 'replay', true, 'noop', true);
    END IF;
  END IF;

  -- NON-USD-CONFIRMED receipt (M3): confirmed in a non-USD currency (status succeeded, confirmed_cost_usd NULL,
  -- confirmed_currency <> USD). It WAS confirmed — label currency_unhandled, not orphaned. No USD baseline to apply to.
  IF _r.status = 'succeeded' AND _r.confirmed_cost_usd IS NULL
     AND COALESCE(_r.confirmed_currency,'USD') <> 'USD' THEN
    _anomaly := jsonb_build_array(jsonb_build_object('kind','currency_unhandled','receipt_currency',_r.confirmed_currency));
    INSERT INTO public.paige_authority_reconciliations
      (tenant_id, grant_id, receipt_id, event_type, delta_usd, confirmed_total_usd, currency, provider_event_id, reason, evidence, applied, anomaly)
    VALUES (_r.tenant_id, _r.grant_id, _receipt_id, _event_type, _delta, 0, COALESCE(upper(_currency),'USD'),
            _provider_event_id, COALESCE(_reason,'') || ' [non-USD-confirmed receipt; USD ledger not adjusted]', _evidence, false, _anomaly)
    RETURNING id INTO _recon_id;
    RETURN jsonb_build_object('ok', true, 'reconciliation_id', _recon_id, 'applied', false, 'currency_deferred', true, 'escalate', true);
  END IF;

  -- OUT-OF-ORDER (§13 never drop). A post-settlement event on a not-yet-USD-confirmed receipt cannot apply to a
  -- baseline that does not exist. Record (applied=false, orphaned) + escalate; it does NOT hold the idempotency
  -- slot, so a redelivery after confirm applies (H1).
  IF _r.status <> 'succeeded' OR _r.confirmed_cost_usd IS NULL THEN
    _anomaly := jsonb_build_array(jsonb_build_object('kind','orphaned_pre_confirm','receipt_status',_r.status));
    INSERT INTO public.paige_authority_reconciliations
      (tenant_id, grant_id, receipt_id, event_type, delta_usd, confirmed_total_usd, currency, provider_event_id, reason, evidence, applied, anomaly)
    VALUES (_r.tenant_id, _r.grant_id, _receipt_id, _event_type, _delta, COALESCE(_r.confirmed_cost_usd,0), COALESCE(upper(_currency),'USD'),
            _provider_event_id, COALESCE(_reason,'') || ' [recorded before confirm; not applied]', _evidence, false, _anomaly)
    RETURNING id INTO _recon_id;
    RETURN jsonb_build_object('ok', true, 'reconciliation_id', _recon_id, 'applied', false, 'reason', 'orphaned_pre_confirm', 'escalate', true);
  END IF;

  -- Non-USD EVENT currency against the USD ledger: record truth, do not apply, flag + escalate.
  IF upper(COALESCE(_currency,'USD')) <> 'USD' THEN
    _anomaly := jsonb_build_array(jsonb_build_object('kind','currency_unhandled','currency',upper(_currency)));
    INSERT INTO public.paige_authority_reconciliations
      (tenant_id, grant_id, receipt_id, event_type, delta_usd, confirmed_total_usd, currency, provider_event_id, reason, evidence, applied, anomaly)
    VALUES (_r.tenant_id, _r.grant_id, _receipt_id, _event_type, _delta, _r.confirmed_cost_usd, upper(_currency),
            _provider_event_id, COALESCE(_reason,'') || ' [non-USD event; USD ledger not adjusted]', _evidence, false, _anomaly)
    RETURNING id INTO _recon_id;
    RETURN jsonb_build_object('ok', true, 'reconciliation_id', _recon_id, 'applied', false, 'currency_deferred', true, 'escalate', true);
  END IF;

  -- C1: bound the ledger effect to THIS act's own contribution — never the raw caller delta.
  _new_total := GREATEST(0, COALESCE(_r.confirmed_cost_usd,0) + _delta);
  _applied_delta := _new_total - COALESCE(_r.confirmed_cost_usd,0);
  -- Over-refund: the requested give-back exceeded what this act holds (act-level, NOT the shared window).
  IF COALESCE(_r.confirmed_cost_usd,0) + _delta < 0 THEN
    _anomaly := COALESCE(_anomaly,'[]'::jsonb) || jsonb_build_object(
      'kind','over_refund','requested_delta',_delta,'applied_delta',_applied_delta,'act_contribution',COALESCE(_r.confirmed_cost_usd,0));
  END IF;

  -- M2: a terminal outcome never regresses; a post-terminal event is applied to dollars but flagged.
  _is_terminal := _r.reconciliation_status IN ('refunded','reversed','voided');
  _new_status := CASE
                   WHEN _is_terminal THEN _r.reconciliation_status
                   WHEN _event_type = 'void' THEN 'voided'
                   WHEN _event_type = 'reversal' THEN 'reversed'
                   WHEN _event_type = 'refund' THEN (CASE WHEN _new_total <= 0 THEN 'refunded' ELSE 'partially_refunded' END)
                   WHEN _event_type = 'partial' THEN 'partially_refunded'
                   ELSE _r.reconciliation_status  -- adjust / external_change keep prior
                 END;
  IF _is_terminal THEN
    _anomaly := COALESCE(_anomaly,'[]'::jsonb) || jsonb_build_object('kind','post_terminal_reconcile','prior_status',_r.reconciliation_status,'event',_event_type);
  END IF;

  -- PASS 1 (compute-only): read each window, project _after, detect over-cap. No write yet.
  FOR _kind IN SELECT jsonb_array_elements_text(_r.reserved_windows) LOOP
    _wstart := CASE _kind WHEN 'day' THEN (_r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'week' THEN date_trunc('week', _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'month' THEN date_trunc('month', _r.reserved_at AT TIME ZONE 'UTC')::date ELSE NULL END;
    IF _wstart IS NULL THEN CONTINUE; END IF;
    SELECT spend_used_usd INTO _before FROM public.paige_authority_budget_windows
      WHERE grant_id = _r.grant_id AND window_kind = _kind AND window_start = _wstart FOR UPDATE;
    IF NOT FOUND THEN _before := 0; END IF;
    _after := GREATEST(0, _before + _applied_delta);
    _cap := CASE _kind WHEN 'day' THEN (_g.caps->>'daily_budget_usd')::numeric
              WHEN 'week' THEN (_g.caps->>'weekly_budget_usd')::numeric
              WHEN 'month' THEN (_g.caps->>'monthly_budget_usd')::numeric ELSE NULL END;
    IF _cap IS NOT NULL AND _after > _cap THEN
      _breach := true;
      _anomaly := COALESCE(_anomaly,'[]'::jsonb) || jsonb_build_object('kind','over_cap','window',_kind,'cap',_cap,'window_spend',_after);
    END IF;
  END LOOP;

  -- INSERT the immutable event BEFORE mutating the ledger (B3): the partial unique index catches a concurrent
  -- double-delivery HERE, before any window/receipt change, so its subtransaction rollback truly leaves the
  -- ledger untouched (mirrors reserve's insert-before-increment, §18).
  BEGIN
    INSERT INTO public.paige_authority_reconciliations
      (tenant_id, grant_id, receipt_id, event_type, delta_usd, confirmed_total_usd, currency, provider_event_id, reason, evidence, applied, anomaly)
    VALUES (_r.tenant_id, _r.grant_id, _receipt_id, _event_type, _delta, _new_total, 'USD', _provider_event_id, _reason, _evidence, true, _anomaly)
    RETURNING id INTO _recon_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO _existing FROM public.paige_authority_reconciliations
      WHERE receipt_id = _receipt_id AND provider_event_id = _provider_event_id AND applied = true;
    RETURN jsonb_build_object('ok', true, 'reconciliation_id', _existing.id, 'replay', true, 'noop', true);
  END;

  -- PASS 2 (apply): move each window by the ACT-BOUNDED applied_delta. GREATEST(0,…) is now only defensive —
  -- applied_delta can never remove more than this act put in, so a sibling's spend is preserved.
  FOR _kind IN SELECT jsonb_array_elements_text(_r.reserved_windows) LOOP
    _wstart := CASE _kind WHEN 'day' THEN (_r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'week' THEN date_trunc('week', _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'month' THEN date_trunc('month', _r.reserved_at AT TIME ZONE 'UTC')::date ELSE NULL END;
    IF _wstart IS NULL THEN CONTINUE; END IF;
    UPDATE public.paige_authority_budget_windows SET spend_used_usd = GREATEST(0, spend_used_usd + _applied_delta), updated_at = now()
     WHERE grant_id = _r.grant_id AND window_kind = _kind AND window_start = _wstart;
  END LOOP;

  -- actions_used NEVER touched (a refunded/reversed act still HAPPENED). over_cap_breach recomputed live (M1).
  UPDATE public.paige_authority_act_runs
     SET confirmed_cost_usd = _new_total, reconciliation_status = _new_status,
         over_cap_breach = _breach, rail_evidence = COALESCE(_evidence, rail_evidence)
   WHERE id = _receipt_id;

  RETURN jsonb_build_object('ok', true, 'reconciliation_id', _recon_id, 'applied', true, 'reconciliation_status', _new_status,
                           'confirmed_cost_usd', _new_total, 'over_cap_breach', _breach, 'escalate', (_breach OR _anomaly IS NOT NULL));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. authority_receipt — the complete owner-visible receipt (§10.9), read-only + scope-checked.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.authority_receipt(_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _r record; _g record; _events jsonb;
BEGIN
  SELECT * INTO _r FROM public.paige_authority_act_runs WHERE id = _receipt_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  IF auth.uid() IS NOT NULL
     AND NOT public.is_platform_operator()
     AND NOT public.is_tenant_member(_r.tenant_id) THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT * INTO _g FROM public.paige_authority_grants WHERE id = _r.grant_id;
  SELECT COALESCE(jsonb_agg(e ORDER BY e.created_at), '[]'::jsonb) INTO _events FROM (
    SELECT id, event_type, delta_usd, confirmed_total_usd, currency, provider_event_id, reason, applied, anomaly, created_at
      FROM public.paige_authority_reconciliations WHERE receipt_id = _receipt_id) e;
  RETURN jsonb_build_object(
    'found', true, 'receipt_id', _r.id, 'tenant_id', _r.tenant_id, 'grant_id', _r.grant_id, 'act_key', _r.act_key,
    'policy', jsonb_build_object('granted_by', _g.granted_by, 'purpose', _g.purpose, 'scope', _g.scope, 'caps', _g.caps, 'provider_account', _g.provider_account),
    'reserved_cost_usd', _r.cost_usd, 'confirmed_cost_usd', _r.confirmed_cost_usd, 'confirmed_currency', _r.confirmed_currency,
    'status', _r.status, 'reconciliation_status', _r.reconciliation_status, 'over_cap_breach', _r.over_cap_breach,
    'provider_ref', _r.provider_ref, 'rail_evidence', _r.rail_evidence, 'outcome', _r.outcome,
    'reserved_at', _r.reserved_at, 'settled_at', _r.settled_at, 'reconciliation_events', _events);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Retire the estimate-only settle (DARK, zero producers — §37 verified; §58 flagged, not silent). An
--    estimate-only settle that records no confirmed truth is a §13 footgun; every settle now goes through
--    authority_confirm. DROP removes its grants with it.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.authority_consume(uuid, text, jsonb);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. GRANTS (§59). Writers service-role EXECUTE only (provider-confirmed spend is Paige's headless job fed by a
--    verified provider webhook/read — never a human click). Reader authenticated + service_role.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.authority_confirm(uuid, numeric, text, jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authority_reconcile(uuid, text, numeric, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authority_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authority_confirm(uuid, numeric, text, jsonb, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.authority_reconcile(uuid, text, numeric, text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.authority_receipt(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.paige_authority_reconciliations IS
  'RE-2 M1-a append-only (§17) provider-outcome audit: one immutable row per confirm/partial/adjust/refund/reversal/external_change/void. Enforced append-only by UPDATE/DELETE/TRUNCATE triggers + RESTRICT FKs. DARK — no producer yet (PR-3).';
COMMENT ON FUNCTION public.authority_confirm(uuid, numeric, text, jsonb, text, jsonb) IS
  'RE-2 M1-a: record the PROVIDER-CONFIRMED actual as financial truth; true-up each reserved window by (confirmed-reserved), bounded to this act''s own contribution; actions_used untouched; over-cap RECORDS truth never rejects; non-USD fails closed. Grant->receipt->window lock. Service-role only; provider-authenticated values only (§13/§32). No producer yet (PR-3).';
COMMENT ON FUNCTION public.authority_reconcile(uuid, text, numeric, text, text, jsonb, text) IS
  'RE-2 M1-a: post-settlement reconciliation (partial/refund/reversal/external_change/adjust/void). Ledger effect BOUNDED to the act''s own contribution (never erases a sibling); insert-before-apply; idempotent per (receipt_id, provider_event_id) on APPLIED rows; out-of-order/non-USD recorded (applied=false)+escalated, never dropped; over_cap_breach recomputed live. Service-role only. No producer yet (PR-3).';
