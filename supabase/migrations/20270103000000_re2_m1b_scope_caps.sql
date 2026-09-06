-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- RE-2 M1-b — CAMPAIGN + CLIENT/ENGAGEMENT SCOPE CAPS (owner ruling 2026-09-06, autonomy-architecture.md
-- §10.8 item 3: the real-money spend-control backbone). DARK. Additive. Extends the merged PR-1 substrate
-- (20261230000000) + M1-a money-truth layer (20270102000000); forks nothing (§18).
--
-- WHY. M1-a proved provider-confirmed spend + reconciliation + receipt for the DAY/WEEK/MONTH caps. The
-- owner requires M1 completeness to also enforce the two NARROWER caps the grant model already declares —
-- campaign_budget_usd and client_period_budget_usd — "wherever a canonical campaign or client/engagement
-- boundary exists. Where a requested scope selector has no canonical boundary yet, fail closed for that
-- selector and state it unavailable — never silently ignore the narrower cap." Both caps are currently
-- REFUSED wholesale by reserve's unenforceable_cap_kind allowlist. M1-b applies the owner rule PER SELECTOR,
-- against grounded reality:
--
--   • client_period_budget_usd  → ENFORCED. tenant_client_agreements IS a canonical client-engagement
--       boundary (tenant_id NOT NULL → tenants; a real period starts_on/ends_on; a lifecycle status
--       draft|active|paused|completed|cancelled). The grant must name ONE engagement in
--       scope.client_agreement_id. Every §9 / state / period failure fails CLOSED with a SPECIFIC reason;
--       the cap is NEVER silently skipped. A person-level (clients.id) scope is deliberately NOT accepted —
--       a person has many engagements, so it is ambiguous, and ambiguity fails closed here.
--
--   • campaign_budget_usd       → FAIL-CLOSED-UNAVAILABLE. There is NO canonical durable campaign boundary:
--       no campaigns table exists; campaign_briefs (20261225000000) is an owner-authored PLANNING record
--       that explicitly is NOT a live-campaign-state source and carries no spend window; scope.campaign_id /
--       ad_account are EXTERNAL provider ids (Meta/Google Ads) with no internal row to derive a window from.
--       So a grant declaring campaign_budget_usd is REFUSED with a SPECIFIC reason (campaign_boundary_
--       unavailable), not the generic unenforceable_cap_kind, so the unavailability is legible (§13). When a
--       canonical campaign boundary (a real campaigns table, or a provider-campaign registry) later lands,
--       a follow-up enforces it the same way client_period is enforced here.
--
-- THE client_period WINDOW is GRANT-CUMULATIVE, not calendar. It accumulates all spend under this grant for
-- its named engagement over the grant's life. There is exactly ONE client_period window per grant, so the
-- (grant_id,'client_period') pair is the REAL key; window_start is a FIXED NON-CALENDAR SENTINEL, CLIENT_PERIOD_ANCHOR
-- (DATE '2000-01-01'), used byte-identically in all five primitives.
-- WHY A CONSTANT, NOT effective_at (§39 verifier Finding 1, folded): an earlier draft anchored on
-- (grant.effective_at)::date, but effective_at is MUTABLE (paige_authority_grants_admin_write is FOR ALL TO
-- authenticated; service_role bypasses RLS; the grants guard trigger never protects it). A reschedule of a live
-- grant would then compute a different window_start in release/confirm/reconcile than reserve used, ORPHANING the
-- window — a capacity leak + a missed true-up + a missed over-cap breach, none of which a BEGIN..ROLLBACK proof
-- reaches. A constant depends on no mutable column, so the window key can never drift. (day/week/month are immune
-- for the same reason by construction — they anchor on the receipt's immutable reserved_at, not on the grant.)
-- paige_authority_budget_windows.window_kind already admits 'client_period' (PR-1 CHECK).
-- (Per-renewal-period reset is a deliberate NON-goal: cumulative-over-grant can only UNDER-spend vs a resetting
-- period, so it is the safe/fail-closed default; a resetting semantics is a flagged owner decision. Likewise, if an
-- admin re-points a live grant's scope.client_agreement_id to a DIFFERENT same-tenant engagement, the one
-- grant-cumulative window keeps bounding total spend at the cap (fail-safe, same-tenant, not a §9 leak); strict
-- per-engagement window isolation is a flagged follow-up, not built here.)
-- RESOLVER COMMENT (§39 Finding 2, MINOR): the untouched PR-2 resolver (20261231000000) still says its cap-peek
-- uses the "same allowlist authority_reserve enforces"; after M1-b reserve's allowlist also admits
-- client_period_budget_usd, so that inline comment is now stale-BUT-FUNCTIONALLY-MOOT (a client_period/campaign
-- grant is triply excluded from the resolver's lift — see below), and is left for refresh when the resolver is
-- next materially touched rather than re-emitting the whole function for a comment.
--
-- §37 LOCKSTEP — every primitive that walks reserved_windows must handle the new kind, or the ledger drifts:
--   reserve (validate boundary + enforce headroom + record the window) · release (reverse it, else a failed
--   client_period reservation LEAKS capacity) · confirm + reconcile (true the window up to the confirmed
--   actual, else the cumulative cap never reflects real spend) · remaining_capacity (report it). All five are
--   re-emitted below. Signatures are UNCHANGED, so grants persist (CREATE OR REPLACE preserves ACLs).
--
-- RESOLVER (20261231000000) — REVIEWED, DELIBERATELY UNCHANGED. Its lockstep note says "a new cap kind added
-- to authority_reserve must be added here in the same PR." The correct action for BOTH new cap kinds is NO
-- change, and here is the proof: the resolver only floor-lifts grants whose scope carries ONLY
-- allowed_action_kinds/allowed_tool_keys AND whose provider_account IS NULL. A client_period grant carries
-- scope.client_agreement_id (excluded by the scope-key whitelist) AND, per the grants spend_needs_provider
-- CHECK, a non-null provider_account (excluded by the rail rule) — DOUBLY excluded, never lifted. A campaign
-- grant is excluded the same way (campaign_id/ad_account scope + provider_account). A client_period/campaign
-- cap with NEITHER a target scope key would still be caught by the resolver's own unenforceable_cap_kind
-- allowlist (unchanged) → fail closed. So the resolver already refuses exactly what reserve refuses; adding
-- these kinds to its lift allowlist would be WRONG (a lift reserve would then reject). Lockstep is HELD by
-- omission, documented here per the invariant. (§32 asserts both below.)
--
-- SETTLEMENT-TRUTH / SECURITY (unchanged from PR-1/M1-a): every primitive is SECURITY DEFINER with in-body
-- §59 caller scope (auth.uid() NULL = service role; a JWT caller must be operator or a member of the grant's
-- tenant); writers are service-role EXECUTE only; provider-authenticated values only. DARK: zero producers
-- (nothing calls reserve/confirm/reconcile for execution yet — PR-3). No table/column/RLS/grant change.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. authority_reserve — add the campaign fail-closed, the client_period boundary validation, and the
--    client_period window to PASS 1 (headroom) + PASS 2 (commit). day/week/month logic is byte-unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.authority_reserve(
  _grant_id uuid,
  _act_key text,
  _idempotency_key text,
  _cost_usd numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _g                record;
  _existing         record;
  _cost             numeric := COALESCE(_cost_usd, 0);
  _today            date := (now() AT TIME ZONE 'UTC')::date;
  _wk               date := date_trunc('week',  now() AT TIME ZONE 'UTC')::date;
  _mo               date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  _cp               date;                       -- M1-b: client_period window anchor = CLIENT_PERIOD_ANCHOR (fixed sentinel)
  _cp_agreement     text;                       -- M1-b: scope.client_agreement_id (the named engagement)
  _agr              record;                     -- M1-b: the canonical engagement boundary row
  _win              record;
  _used_actions     int;
  _used_spend       numeric;
  _reserved_windows jsonb := '[]'::jsonb;
  _receipt_id       uuid;
BEGIN
  IF _idempotency_key IS NULL OR length(_idempotency_key) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_required');
  END IF;
  IF _cost < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'negative_cost');
  END IF;

  -- Lock the GRANT ROW — the load-bearing serialization point (see the header comment). Held to
  -- end-of-transaction; its lifecycle cannot flip (pause/revoke) mid-reservation.
  SELECT * INTO _g FROM public.paige_authority_grants WHERE id = _grant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'grant_not_found');
  END IF;

  -- §59 in-body scope. Service role (NULL subject) is Paige's trusted runtime; a JWT caller must own it.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_platform_operator()
     AND NOT public.is_tenant_member(_g.tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  -- Idempotent replay: same key on same grant.
  --   reserved  → a LIVE reservation already exists; return it (proceed, exactly-once).
  --   succeeded → the act already ran exactly once; return it (the caller must NOT re-execute).
  --   failed/released → the prior attempt's reserved capacity was ALREADY given back, so there is no live
  --     reservation under this key. Returning ok:true would be a §13 lie that lets PR-3 proceed
  --     reservation-less; fail closed — a consequential retry must mint a NEW idempotency key.
  SELECT * INTO _existing
    FROM public.paige_authority_act_runs
   WHERE grant_id = _grant_id AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF _existing.status IN ('reserved','succeeded') THEN
      RETURN jsonb_build_object('ok', true, 'receipt_id', _existing.id, 'replay', true, 'status', _existing.status);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'prior_attempt_failed', 'status', _existing.status);
  END IF;

  -- Active? (state/window/expiry/stops). Inlined rather than calling authority_grant_active so the
  -- FOR UPDATE lock above is the one that decides — no TOCTOU between the check and the write.
  IF NOT (_g.state = 'active'
          AND _g.paused_at IS NULL AND _g.revoked_at IS NULL AND _g.emergency_stopped_at IS NULL
          AND _g.effective_at <= now()
          AND (_g.expires_at IS NULL OR _g.expires_at > now())) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'grant_inactive');
  END IF;

  -- Single-action cap (§10.9).
  IF (_g.caps ? 'max_per_action_usd')
     AND _cost > (_g.caps->>'max_per_action_usd')::numeric THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'over_single_action_cap');
  END IF;

  -- M1-b: campaign-scoped budget has NO canonical boundary (no durable campaigns table; campaign_briefs is a
  -- planning record, not live-campaign state; scope.campaign_id/ad_account are EXTERNAL provider ids with no
  -- internal row). Per the owner rule, REFUSE with a SPECIFIC reason so the unavailability is legible — never
  -- the generic unenforceable_cap_kind, and never silently ignored.
  IF (_g.caps ? 'campaign_budget_usd') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_boundary_unavailable');
  END IF;

  -- FAIL-CLOSED on any DECLARED cap kind this primitive cannot yet evaluate (§10.7 "any layer unreadable,
  -- fails closed"). Enforced here: the single-action cap, the day/week/month action-count + spend caps, and
  -- (M1-b) client_period_budget_usd. A grant that declares any OTHER cap kind is REFUSED, not silently
  -- under-enforced — "narrowest-limit-wins across every declared cap" stays TRUE by construction.
  -- (campaign_budget_usd is handled above with its own specific reason and never reaches here.)
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(_g.caps) AS k(key)
     WHERE k.key NOT IN ('max_per_action_usd','max_per_day','max_per_week','max_per_month',
                         'daily_budget_usd','weekly_budget_usd','monthly_budget_usd',
                         'client_period_budget_usd')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unenforceable_cap_kind');
  END IF;

  -- M1-b: client/engagement-scoped budget — enforce ONLY against a canonical engagement boundary.
  -- tenant_client_agreements is that boundary. The grant must name ONE engagement in scope.client_agreement_id
  -- (a person/client_id is ambiguous and fails closed). Every §9 / state / period failure fails CLOSED with a
  -- specific reason BEFORE any window is touched; the cap is NEVER silently skipped. reserve is SECURITY
  -- DEFINER (RLS-bypassing), so the tenant match below is the §9 gate, done in-body.
  IF (_g.caps ? 'client_period_budget_usd') THEN
    _cp_agreement := NULLIF(_g.scope->>'client_agreement_id', '');
    IF _cp_agreement IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'client_period_boundary_unspecified');
    END IF;
    IF _cp_agreement !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'client_agreement_id_invalid');
    END IF;
    SELECT tenant_id, status, starts_on, ends_on INTO _agr
      FROM public.tenant_client_agreements WHERE id = _cp_agreement::uuid;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'client_agreement_not_found');
    END IF;
    IF _agr.tenant_id <> _g.tenant_id THEN
      -- §9: never enforce (nor accrue) against an engagement in another tenant's book.
      RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
    END IF;
    IF _agr.status <> 'active' THEN
      -- Only an ACTIVE engagement accrues autonomous spend; draft/paused/completed/cancelled fail closed.
      RETURN jsonb_build_object('ok', false, 'reason', 'client_agreement_inactive', 'status', _agr.status);
    END IF;
    IF _agr.starts_on IS NOT NULL AND _today < _agr.starts_on THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'client_agreement_not_started');
    END IF;
    IF _agr.ends_on IS NOT NULL AND _today > _agr.ends_on THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'client_agreement_ended');
    END IF;
    _cp := DATE '2000-01-01';   -- CLIENT_PERIOD_ANCHOR: fixed non-calendar sentinel, one window per grant, immune to grant mutation (§39/§5 F1)
  END IF;

  -- PASS 1: verify headroom for every DECLARED window under a row lock, and record which windows this
  -- reservation will touch so RELEASE later reverses EXACTLY these (robust to a cap edited between reserve and
  -- release). If ANY window is exhausted, return refused having written NOTHING. The client_period row is
  -- present only when the cap is declared (its cap_spend is non-null); its window_start is the grant anchor.
  FOR _win IN
    SELECT * FROM (VALUES
      ('day',           _today, (_g.caps->>'max_per_day')::int,   (_g.caps->>'daily_budget_usd')::numeric),
      ('week',          _wk,    (_g.caps->>'max_per_week')::int,  (_g.caps->>'weekly_budget_usd')::numeric),
      ('month',         _mo,    (_g.caps->>'max_per_month')::int, (_g.caps->>'monthly_budget_usd')::numeric),
      ('client_period', _cp,    NULL::int,                        (_g.caps->>'client_period_budget_usd')::numeric)
    ) AS v(window_kind, window_start, cap_actions, cap_spend)
    WHERE v.cap_actions IS NOT NULL OR v.cap_spend IS NOT NULL
  LOOP
    SELECT actions_used, spend_used_usd INTO _used_actions, _used_spend
      FROM public.paige_authority_budget_windows
     WHERE grant_id = _grant_id AND window_kind = _win.window_kind AND window_start = _win.window_start
     FOR UPDATE;
    IF NOT FOUND THEN
      _used_actions := 0; _used_spend := 0;
    END IF;
    IF _win.cap_actions IS NOT NULL AND _used_actions + 1 > _win.cap_actions THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'over_action_count_cap', 'window', _win.window_kind);
    END IF;
    IF _win.cap_spend IS NOT NULL AND _used_spend + _cost > _win.cap_spend THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'over_spend_cap', 'window', _win.window_kind);
    END IF;
    _reserved_windows := _reserved_windows || to_jsonb(_win.window_kind);
  END LOOP;

  -- Mint the receipt BEFORE incrementing windows, so a duplicate-key race returns the winner's row
  -- WITHOUT leaving an orphaned window increment (the increment-then-insert order could leak a +1 on the
  -- unique_violation path). The grant-row lock already prevents a concurrent same-key reserve from
  -- reaching here; this ordering is defense-in-depth if that lock is ever weakened.
  BEGIN
    INSERT INTO public.paige_authority_act_runs
      (tenant_id, grant_id, automation_id, act_key, idempotency_key, cost_usd, reserved_windows)
    VALUES (_g.tenant_id, _grant_id, _g.automation_id, _act_key, _idempotency_key, _cost, _reserved_windows)
    RETURNING id INTO _receipt_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO _existing FROM public.paige_authority_act_runs
      WHERE grant_id = _grant_id AND idempotency_key = _idempotency_key;
    IF _existing.status IN ('reserved','succeeded') THEN
      RETURN jsonb_build_object('ok', true, 'receipt_id', _existing.id, 'replay', true, 'status', _existing.status);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'prior_attempt_failed', 'status', _existing.status);
  END;

  -- PASS 2: all windows have room and the receipt exists — commit the increments for EXACTLY the windows
  -- verified in PASS 1. (Grant + window locks still held in this txn.)
  FOR _win IN
    SELECT * FROM (VALUES
      ('day',           _today, (_g.caps->>'max_per_day')::int,   (_g.caps->>'daily_budget_usd')::numeric),
      ('week',          _wk,    (_g.caps->>'max_per_week')::int,  (_g.caps->>'weekly_budget_usd')::numeric),
      ('month',         _mo,    (_g.caps->>'max_per_month')::int, (_g.caps->>'monthly_budget_usd')::numeric),
      ('client_period', _cp,    NULL::int,                        (_g.caps->>'client_period_budget_usd')::numeric)
    ) AS v(window_kind, window_start, cap_actions, cap_spend)
    WHERE v.cap_actions IS NOT NULL OR v.cap_spend IS NOT NULL
  LOOP
    INSERT INTO public.paige_authority_budget_windows (grant_id, window_kind, window_start, actions_used, spend_used_usd)
    VALUES (_grant_id, _win.window_kind, _win.window_start, 1, _cost)
    ON CONFLICT (grant_id, window_kind, window_start)
      DO UPDATE SET actions_used = paige_authority_budget_windows.actions_used + 1,
                    spend_used_usd = paige_authority_budget_windows.spend_used_usd + _cost,
                    updated_at = now();
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'receipt_id', _receipt_id, 'replay', false);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. authority_release — reverse the client_period window too (else a released client_period reservation
--    leaks capacity). Uses the fixed CLIENT_PERIOD_ANCHOR — no grant read needed, immune to grant edits (§39/§5 F1).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.authority_release(_receipt_id uuid, _failed boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _r      record;
  _kind   text;
  _wstart date;
BEGIN
  SELECT * INTO _r FROM public.paige_authority_act_runs WHERE id = _receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receipt_not_found');
  END IF;
  IF auth.uid() IS NOT NULL
     AND NOT public.is_platform_operator()
     AND NOT public.is_tenant_member(_r.tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;
  IF _r.status <> 'reserved' THEN
    -- Already settled — nothing to give back. Not an error (idempotent).
    RETURN jsonb_build_object('ok', true, 'receipt_id', _receipt_id, 'status', _r.status, 'noop', true);
  END IF;

  -- Reverse EXACTLY the windows this receipt incremented (recorded in reserved_windows at reserve time),
  -- recomputing each window_start from the receipt's OWN reserved_at (calendar windows) or the fixed
  -- CLIENT_PERIOD_ANCHOR (client_period) so the reversed window matches the reserved one. Not a fixed
  -- day/week/month assumption — so a cap added to the grant after this receipt reserved can never make release
  -- decrement a window this receipt never touched (§32). No grant read needed: the client_period anchor is a
  -- constant, immune to any grant-column edit (§39/§5 F1). Clamped at zero (never drive a counter negative).
  FOR _kind IN SELECT jsonb_array_elements_text(_r.reserved_windows)
  LOOP
    _wstart := CASE _kind
                 WHEN 'day'           THEN (_r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'week'          THEN date_trunc('week',  _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'month'         THEN date_trunc('month', _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'client_period' THEN DATE '2000-01-01'   -- CLIENT_PERIOD_ANCHOR (§39/§5 F1)
                 ELSE NULL
               END;
    IF _wstart IS NOT NULL THEN
      UPDATE public.paige_authority_budget_windows
         SET actions_used = GREATEST(0, actions_used - 1),
             spend_used_usd = GREATEST(0, spend_used_usd - _r.cost_usd),
             updated_at = now()
       WHERE grant_id = _r.grant_id AND window_kind = _kind AND window_start = _wstart;
    END IF;
  END LOOP;

  UPDATE public.paige_authority_act_runs
     SET status = CASE WHEN _failed THEN 'failed' ELSE 'released' END, settled_at = now()
   WHERE id = _receipt_id;
  RETURN jsonb_build_object('ok', true, 'receipt_id', _receipt_id, 'status', CASE WHEN _failed THEN 'failed' ELSE 'released' END);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. authority_confirm — true up the client_period window to the confirmed actual, same as day/week/month.
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Codex P1: a MISSING confirmed amount is ABSENT financial truth, NOT zero (§13). COALESCE-to-0 would
  -- strip the reserved estimate, mark the receipt 'succeeded', and send the corrected redelivery down the
  -- status-replay path (real amount lost). Fail closed on NULL BEFORE any mutation.
  IF _confirmed_cost_usd IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_confirmed_amount');
  END IF;
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
  -- client_period (M1-b) trues up the SAME way, on the fixed CLIENT_PERIOD_ANCHOR window (the reserve anchor).
  _delta := _confirmed - COALESCE(_r.cost_usd, 0);
  FOR _kind IN SELECT jsonb_array_elements_text(_r.reserved_windows) LOOP
    _wstart := CASE _kind WHEN 'day' THEN (_r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'week' THEN date_trunc('week', _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'month' THEN date_trunc('month', _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'client_period' THEN DATE '2000-01-01' ELSE NULL END;  -- CLIENT_PERIOD_ANCHOR (fixed sentinel, §39/§5 F1)
    IF _wstart IS NULL THEN CONTINUE; END IF;
    SELECT spend_used_usd INTO _before FROM public.paige_authority_budget_windows
      WHERE grant_id = _r.grant_id AND window_kind = _kind AND window_start = _wstart FOR UPDATE;
    IF NOT FOUND THEN _before := 0; END IF;
    UPDATE public.paige_authority_budget_windows SET spend_used_usd = GREATEST(0, _before + _delta), updated_at = now()
     WHERE grant_id = _r.grant_id AND window_kind = _kind AND window_start = _wstart RETURNING spend_used_usd INTO _after;
    _cap := CASE _kind WHEN 'day' THEN (_g.caps->>'daily_budget_usd')::numeric
              WHEN 'week' THEN (_g.caps->>'weekly_budget_usd')::numeric
              WHEN 'month' THEN (_g.caps->>'monthly_budget_usd')::numeric
              WHEN 'client_period' THEN (_g.caps->>'client_period_budget_usd')::numeric ELSE NULL END;
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
-- 4. authority_reconcile — true up the client_period window on post-settlement events too (both passes).
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Codex P1: a MISSING delta is ABSENT financial truth, NOT zero (§13). COALESCE-to-0 would record a
  -- zero-dollar applied=true row that occupies the idempotency slot, so a corrected redelivery no-ops and the
  -- real refund/reversal never reaches the ledger. Fail closed on NULL BEFORE any mutation.
  IF _delta_usd IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_delta', 'event_type', _event_type);
  END IF;
  -- Codex P1: a PROVIDER-originated event (refund/reversal/partial/external_change) MUST carry the provider's
  -- own stable event id — without it, it bypasses both the replay lookup and the partial unique index, so a
  -- duplicate webhook delivery double-applies its delta and opens phantom cap headroom. Internal operator
  -- corrections (adjust/void) may remain keyless (single-shot, not webhook-replayed).
  IF _event_type IN ('refund','reversal','partial','external_change')
     AND (_provider_event_id IS NULL OR length(_provider_event_id) = 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'provider_event_id_required', 'event_type', _event_type);
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

  -- PASS 1 (compute-only): read each window, project _after, detect over-cap. No write yet. client_period
  -- (M1-b) is on the fixed CLIENT_PERIOD_ANCHOR window (the reserve anchor).
  FOR _kind IN SELECT jsonb_array_elements_text(_r.reserved_windows) LOOP
    _wstart := CASE _kind WHEN 'day' THEN (_r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'week' THEN date_trunc('week', _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'month' THEN date_trunc('month', _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'client_period' THEN DATE '2000-01-01' ELSE NULL END;  -- CLIENT_PERIOD_ANCHOR (fixed sentinel, §39/§5 F1)
    IF _wstart IS NULL THEN CONTINUE; END IF;
    SELECT spend_used_usd INTO _before FROM public.paige_authority_budget_windows
      WHERE grant_id = _r.grant_id AND window_kind = _kind AND window_start = _wstart FOR UPDATE;
    IF NOT FOUND THEN _before := 0; END IF;
    _after := GREATEST(0, _before + _applied_delta);
    _cap := CASE _kind WHEN 'day' THEN (_g.caps->>'daily_budget_usd')::numeric
              WHEN 'week' THEN (_g.caps->>'weekly_budget_usd')::numeric
              WHEN 'month' THEN (_g.caps->>'monthly_budget_usd')::numeric
              WHEN 'client_period' THEN (_g.caps->>'client_period_budget_usd')::numeric ELSE NULL END;
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
                 WHEN 'month' THEN date_trunc('month', _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'client_period' THEN DATE '2000-01-01' ELSE NULL END;  -- CLIENT_PERIOD_ANCHOR (fixed sentinel, §39/§5 F1)
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
-- 5. authority_remaining_capacity — report the client_period window too (§10.9 "show remaining capacity").
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.authority_remaining_capacity(_grant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _g     record;
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _wk    date := date_trunc('week',  now() AT TIME ZONE 'UTC')::date;
  _mo    date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  _cp    date;
  _used  jsonb := '{}'::jsonb;
  _row   record;
BEGIN
  SELECT * INTO _g FROM public.paige_authority_grants WHERE id = _grant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF auth.uid() IS NOT NULL
     AND NOT public.is_platform_operator()
     AND NOT public.is_tenant_member(_g.tenant_id) THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  _cp := DATE '2000-01-01';   -- CLIENT_PERIOD_ANCHOR: fixed non-calendar sentinel (§39/§5 F1)
  FOR _row IN
    SELECT window_kind, actions_used, spend_used_usd
      FROM public.paige_authority_budget_windows
     WHERE grant_id = _grant_id
       AND ((window_kind='day' AND window_start=_today)
         OR (window_kind='week' AND window_start=_wk)
         OR (window_kind='month' AND window_start=_mo)
         OR (window_kind='client_period' AND window_start=_cp))
  LOOP
    _used := _used || jsonb_build_object(_row.window_kind,
               jsonb_build_object('actions_used', _row.actions_used, 'spend_used_usd', _row.spend_used_usd));
  END LOOP;
  RETURN jsonb_build_object(
    'found', true,
    'state', _g.state,
    'active', public.authority_grant_active(_grant_id),
    'caps', _g.caps,
    'used', _used
  );
END;
$$;

COMMENT ON FUNCTION public.authority_reserve(uuid, text, text, numeric) IS
  'RE-2 reserve (PR-1 + M1-b). Atomic pre-action headroom check across day/week/month + client_period caps; client_period is enforced against tenant_client_agreements (scope.client_agreement_id) and campaign_budget_usd fails closed (campaign_boundary_unavailable — no canonical campaign boundary). Fail-closed, service-role only, §59 in-body scope. DARK (autonomy-architecture.md §10.8).';
COMMENT ON FUNCTION public.authority_remaining_capacity(uuid) IS
  'RE-2 remaining capacity (PR-1 + M1-b). Reports day/week/month + client_period window usage for the §10.9 surface. Scope-checked read.';
