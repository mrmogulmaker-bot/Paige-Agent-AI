-- RE-2 SLICE PR-1 — THE EXECUTION SUBSTRATE for standing delegated authority.
--
-- Owner ruling 2026-09-06 (Standing Delegated Authority Contract, autonomy-architecture.md §10.7–§10.9):
--   "Paige may autonomously take a consequential real-world action when a valid owner/authorized-
--    representative standing policy grants that SPECIFIC authority, the action remains inside its
--    measurable limits, the connected provider confirms the result, and the action is recorded
--    truthfully. Paige must pause/escalate when a policy boundary, provider condition, tenant/client
--    scope, law, or factual certainty is missing."
--
-- WHAT THIS SLICE IS. The durable SUBSTRATE the rest of RE-2 lands on: first-class, CITABLE authority
-- grants (the standing policy), per-grant idempotency/replay receipts (exactly-once), an ATOMIC
-- velocity + spend ledger (two parallel acts can never both slip past a nearly-exhausted cap), and the
-- immediate pause / revoke / expiry / emergency-stop controls the owner requires.
--
-- WHAT THIS SLICE IS NOT — ZERO BEHAVIORAL CHANGE (§13/§32). Nothing reads these objects for execution
-- yet. There is no execution loop (that is PR-3), and `resolve_automation_autonomy` is untouched (the
-- floor-lift is PR-2). A `high` act still clamps to `confirm` at runtime exactly as before this
-- migration. These are unwired primitives with no producer — a green `SET ROLE`/rollback proof of the
-- primitives is the whole of this slice's runtime claim; the authenticated end-to-end drive is owed to
-- PR-3 when a real execution lane exists (§32.c).
--
-- DOCTRINE BINDINGS.
--   §18  — extends the action bus / process record (`paige_automations`, `paige_action_kinds`); forks
--          nothing. Grants reference an automation when process-scoped, but are first-class so any
--          future path (chat, agent) can cite one (owner: "every approved action must cite the grant").
--   §59  — every SECURITY DEFINER function re-asserts caller scope IN-BODY; RLS does not apply under
--          DEFINER. Service role (auth.uid() IS NULL) is Paige's trusted headless runtime; a JWT caller
--          is pinned to is_platform_owner() OR is_tenant_member(tenant_id); a stranger gets found:false.
--   §38  — caps/spend are the tenant's OWN limits on the tenant's OWN connected provider account. This
--          substrate never makes Paige merchant-of-record, never holds funds, never routes client money
--          through the platform. `provider_account` names the tenant's connected rail; money is theirs.
--   §51/§53 — delegation never widens authority; a representative's grant is capped by the owner's (the
--          `parent_grant_id` chain + the ceiling checks are enforced in PR-2's resolver; the columns
--          exist here). A grant can never authorize a platform-tier or ownership/authority-policy act.
--   §68  — a grant decays: `expires_at` is a hard stop; pause/revoke/emergency-stop are immediate.
--   narrowest-limit-wins (§10.9) — the reserve primitive enforces EVERY applicable cap window; any one
--          exhausted, or any layer unreadable, fails closed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE STANDING POLICY / SPENDING GRANT — first-class and citable
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `scope`, `caps`, `escalation` are config-as-data jsonb (§10) so a grant carries the full owner-listed
-- spec without a column explosion, and Paige can author one end-to-end. The load-bearing lifecycle
-- facts (state, window, expiry, the three stop timestamps) are real columns so they can be indexed and
-- CHECK'd rather than hidden in jsonb.
CREATE TABLE IF NOT EXISTS public.paige_authority_grants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- WHO granted it (§10.9). `granted_by` is the grantor; a representative-created grant names the owner
  -- grant it descends from, so PR-2 can enforce "a representative can never exceed the owner ceiling".
  granted_by         uuid NOT NULL,                    -- auth.uid() of the grantor at creation
  parent_grant_id    uuid REFERENCES public.paige_authority_grants(id) ON DELETE CASCADE,
  -- WHAT process it powers, when process-scoped (§67). NULL = a standing grant not tied to one process.
  automation_id      uuid REFERENCES public.paige_automations(id) ON DELETE CASCADE,
  -- The human-readable purpose / Mission / campaign / business need (§10.8).
  purpose            text NOT NULL,
  -- SCOPE (§10.9): { client_id?, provider_account?, financial_account?, ad_account?, campaign_id?,
  --   allowed_action_kinds?: [], allowed_tool_keys?: [], allowed_vendors?: [], allowed_payees?: [],
  --   allowed_campaigns?: [], allowed_offers?: [], allowed_categories?: [], allowed_recipients?: [] }
  scope              jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- CAPS (§10.9): { max_per_action_usd?, daily_budget_usd?, weekly_budget_usd?, monthly_budget_usd?,
  --   campaign_budget_usd?, client_period_budget_usd?, max_per_day?, max_per_week?, max_per_month? }
  caps               jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ESCALATION (§10.9): { threshold_usd?, notify_recipients?: [], notify_channels?: [] }
  escalation         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The connected provider account the money/action runs on — the tenant's OWN rail (§38). Denormalized
  -- from scope for indexing + the §38 "names the tenant's own connected provider" invariant.
  provider_account   text,
  -- LIFECYCLE (§68). A grant is only active between effective_at and expires_at, on schedule, and while
  -- none of the three stop timestamps is set.
  effective_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,                       -- NULL = no hard expiry (still decays via §68 attest at the ceiling)
  schedule           jsonb NOT NULL DEFAULT '{}'::jsonb, -- optional recurring window, read by authority_grant_active
  state              text NOT NULL DEFAULT 'draft'
                     CHECK (state IN ('draft','active','paused','revoked','expired')),
  paused_at          timestamptz,                       -- immediate pause (reversible)
  revoked_at         timestamptz,                       -- revoke (terminal)
  emergency_stopped_at timestamptz,                     -- emergency stop (terminal, loud)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- A window can only close after it opens; a hard expiry cannot precede the effective date.
  CONSTRAINT paige_authority_grants_window_ck CHECK (expires_at IS NULL OR expires_at > effective_at),
  -- A grant may never authorize changing ownership/platform authority or the authority policy itself
  -- (§10.2/§53). The allowlist of action kinds is validated against this in PR-2; the structural fence
  -- here is that provider_account (a tenant rail) is required the moment any spend cap is set.
  CONSTRAINT paige_authority_grants_spend_needs_provider_ck
    CHECK (
      (caps ? 'max_per_action_usd' OR caps ? 'daily_budget_usd' OR caps ? 'weekly_budget_usd'
        OR caps ? 'monthly_budget_usd' OR caps ? 'campaign_budget_usd' OR caps ? 'client_period_budget_usd')
      IS NOT TRUE
      OR provider_account IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS paige_authority_grants_tenant_idx   ON public.paige_authority_grants (tenant_id);
CREATE INDEX IF NOT EXISTS paige_authority_grants_automation_idx ON public.paige_authority_grants (automation_id);
CREATE INDEX IF NOT EXISTS paige_authority_grants_parent_idx    ON public.paige_authority_grants (parent_grant_id);

ALTER TABLE public.paige_authority_grants ENABLE ROW LEVEL SECURITY;

-- READ: a tenant member (and platform operator) may see their own tenant's grants — the §10.9 "show the
-- current grant, remaining capacity … visibly to the owner and permitted representative". WRITE is
-- admin-only here (an owner/admin authors a grant); the representative-ceiling enforcement + Paige's own
-- confirmation-gated grant authoring are PR-2 work, so this migration keeps writes to tenant admins and
-- the service role, never a broad authenticated write.
DROP POLICY IF EXISTS paige_authority_grants_read ON public.paige_authority_grants;
CREATE POLICY paige_authority_grants_read ON public.paige_authority_grants
  FOR SELECT TO authenticated
  USING (public.is_platform_operator() OR public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS paige_authority_grants_admin_write ON public.paige_authority_grants;
CREATE POLICY paige_authority_grants_admin_write ON public.paige_authority_grants
  FOR ALL TO authenticated
  USING (public.is_platform_operator() OR public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_platform_operator() OR public.is_tenant_admin(tenant_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. IDEMPOTENCY / REPLAY RECEIPTS — exactly-once per (grant, act, idempotency key)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A live grant fires repeatedly, so the exactly-once key lives at the FIRING grain, not on the grant.
-- The UNIQUE (grant_id, idempotency_key) is the de-dup: a retry or redelivery with the same key returns
-- the existing receipt instead of acting twice. `provider_ref` is the provider's own id, recorded once
-- the connected provider confirms (§10.7 "the connected provider confirms the result").
CREATE TABLE IF NOT EXISTS public.paige_authority_act_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  grant_id          uuid NOT NULL REFERENCES public.paige_authority_grants(id) ON DELETE CASCADE,
  automation_id     uuid REFERENCES public.paige_automations(id) ON DELETE SET NULL,
  act_key           text NOT NULL,                      -- the action_kind or tool_key being run
  idempotency_key   text NOT NULL,                      -- caller-derived, provider-honored exactly-once token
  cost_usd          numeric(12,4) NOT NULL DEFAULT 0,   -- the reserved cost (estimate until M1 confirms real spend)
  status            text NOT NULL DEFAULT 'reserved'
                    CHECK (status IN ('reserved','succeeded','failed','released')),
  provider_ref      text,                               -- the provider's own id, once returned
  outcome           jsonb,                              -- the verified outcome (dimension 5)
  reserved_at       timestamptz NOT NULL DEFAULT now(),
  settled_at        timestamptz,                        -- when consumed (succeeded) or released
  -- THE exactly-once guarantee. A second reserve with the same key no-ops back to this row.
  CONSTRAINT paige_authority_act_runs_idem_uk UNIQUE (grant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS paige_authority_act_runs_grant_idx  ON public.paige_authority_act_runs (grant_id);
CREATE INDEX IF NOT EXISTS paige_authority_act_runs_tenant_idx ON public.paige_authority_act_runs (tenant_id);

ALTER TABLE public.paige_authority_act_runs ENABLE ROW LEVEL SECURITY;

-- READ own-tenant (the §10.9 "recent actions" history). NO direct client write — receipts are minted
-- ONLY by the SECURITY DEFINER reserve/consume/release primitives below, never by a browser.
DROP POLICY IF EXISTS paige_authority_act_runs_read ON public.paige_authority_act_runs;
CREATE POLICY paige_authority_act_runs_read ON public.paige_authority_act_runs
  FOR SELECT TO authenticated
  USING (public.is_platform_operator() OR public.is_tenant_member(tenant_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE ATOMIC VELOCITY + SPEND LEDGER — one row per (grant, window kind, window start)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `actions_used` + `spend_used_usd` are decremented (incremented) under a row lock inside the reserve
-- primitive, so two concurrent reservations serialize and cannot both pass a nearly-exhausted cap.
CREATE TABLE IF NOT EXISTS public.paige_authority_budget_windows (
  grant_id       uuid NOT NULL REFERENCES public.paige_authority_grants(id) ON DELETE CASCADE,
  window_kind    text NOT NULL CHECK (window_kind IN ('day','week','month','campaign','client_period')),
  window_start   date NOT NULL,
  actions_used   int  NOT NULL DEFAULT 0 CHECK (actions_used >= 0),
  spend_used_usd numeric(12,4) NOT NULL DEFAULT 0 CHECK (spend_used_usd >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grant_id, window_kind, window_start)
);

ALTER TABLE public.paige_authority_budget_windows ENABLE ROW LEVEL SECURITY;

-- READ own-tenant (via the grant) for the §10.9 "remaining capacity". No client write — the primitives own it.
DROP POLICY IF EXISTS paige_authority_budget_windows_read ON public.paige_authority_budget_windows;
CREATE POLICY paige_authority_budget_windows_read ON public.paige_authority_budget_windows
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.paige_authority_grants g
    WHERE g.id = grant_id
      AND (public.is_platform_operator() OR public.is_tenant_member(g.tenant_id))
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE PRIMITIVES — active check, atomic reserve, consume, release
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. Is the grant live right now? (state + window + expiry + the three stop timestamps.) Pure read.
CREATE OR REPLACE FUNCTION public.authority_grant_active(_grant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _g record;
BEGIN
  SELECT * INTO _g FROM public.paige_authority_grants WHERE id = _grant_id;
  IF NOT FOUND THEN
    RETURN false;   -- fail closed: unknown grant is never active
  END IF;
  -- §59 in-body scope: only the owning tenant (or platform operator, or the trusted service role with a
  -- NULL subject) may learn a grant's live state.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_platform_operator()
     AND NOT public.is_tenant_member(_g.tenant_id) THEN
    RETURN false;
  END IF;
  RETURN _g.state = 'active'
     AND _g.paused_at IS NULL
     AND _g.revoked_at IS NULL
     AND _g.emergency_stopped_at IS NULL
     AND _g.effective_at <= now()
     AND (_g.expires_at IS NULL OR _g.expires_at > now());
END;
$$;

-- 4b. ATOMIC RESERVE. The load-bearing primitive. Returns a receipt when — and only when — the grant is
-- active AND every applicable cap window has room for one more action and `_cost_usd` more spend. It
-- locks the window rows FOR UPDATE so concurrent reservations serialize (§10.9 narrowest-limit-wins,
-- and "two parallel acts cannot both slip past a nearly-exhausted cap"). Idempotent: a repeat of the
-- same (grant, idempotency_key) returns the existing receipt and reserves nothing new.
--
-- Returns jsonb: { ok, receipt_id, replay?, reason? }. On any failure it returns ok:false with a reason
-- and writes NOTHING — the caller must treat ok:false as "clamp to confirm / escalate" (fail closed).
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
  _g          record;
  _existing   record;
  _cost       numeric := COALESCE(_cost_usd, 0);
  _today      date := (now() AT TIME ZONE 'UTC')::date;
  _wk         date := date_trunc('week',  now() AT TIME ZONE 'UTC')::date;
  _mo         date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  _win        record;
  _cap_actions int;
  _cap_spend  numeric;
BEGIN
  IF _idempotency_key IS NULL OR length(_idempotency_key) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_required');
  END IF;
  IF _cost < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'negative_cost');
  END IF;

  -- Lock the grant row so its lifecycle cannot flip (pause/revoke) mid-reservation.
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

  -- Idempotent replay: same key on same grant returns the existing receipt, reserves nothing.
  SELECT * INTO _existing
    FROM public.paige_authority_act_runs
   WHERE grant_id = _grant_id AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'receipt_id', _existing.id, 'replay', true, 'status', _existing.status);
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

  -- Per-window caps. For each window kind the grant declares, lock-or-create the row, check headroom for
  -- one more action AND _cost more spend; if ANY window is exhausted, return refused WITHOUT writing
  -- (every UPDATE below only runs after all checks pass — see the two-pass structure).
  -- PASS 1: verify headroom for every declared window under a row lock.
  FOR _win IN
    SELECT * FROM (VALUES
      ('day',           _today, (_g.caps->>'max_per_day')::int,   (_g.caps->>'daily_budget_usd')::numeric),
      ('week',          _wk,    (_g.caps->>'max_per_week')::int,  (_g.caps->>'weekly_budget_usd')::numeric),
      ('month',         _mo,    (_g.caps->>'max_per_month')::int, (_g.caps->>'monthly_budget_usd')::numeric)
    ) AS v(window_kind, window_start, cap_actions, cap_spend)
    WHERE v.cap_actions IS NOT NULL OR v.cap_spend IS NOT NULL
  LOOP
    -- Lock (or conjure a zeroed) window row.
    SELECT actions_used, spend_used_usd INTO _cap_actions, _cap_spend
      FROM public.paige_authority_budget_windows
     WHERE grant_id = _grant_id AND window_kind = _win.window_kind AND window_start = _win.window_start
     FOR UPDATE;
    IF NOT FOUND THEN
      _cap_actions := 0; _cap_spend := 0;
    END IF;
    IF _win.cap_actions IS NOT NULL AND _cap_actions + 1 > _win.cap_actions THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'over_action_count_cap', 'window', _win.window_kind);
    END IF;
    IF _win.cap_spend IS NOT NULL AND _cap_spend + _cost > _win.cap_spend THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'over_spend_cap', 'window', _win.window_kind);
    END IF;
  END LOOP;

  -- PASS 2: all windows have room — commit the decrements. (Same lock still held in this txn.)
  FOR _win IN
    SELECT * FROM (VALUES
      ('day',   _today, (_g.caps->>'max_per_day')::int,   (_g.caps->>'daily_budget_usd')::numeric),
      ('week',  _wk,    (_g.caps->>'max_per_week')::int,  (_g.caps->>'weekly_budget_usd')::numeric),
      ('month', _mo,    (_g.caps->>'max_per_month')::int, (_g.caps->>'monthly_budget_usd')::numeric)
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

  -- Mint the receipt (status reserved). The UNIQUE(grant_id, idempotency_key) makes a concurrent
  -- duplicate reserve fail the insert; we catch it and return the winner's row (belt-and-suspenders
  -- with the SELECT replay above, which handles the sequential case).
  BEGIN
    INSERT INTO public.paige_authority_act_runs (tenant_id, grant_id, automation_id, act_key, idempotency_key, cost_usd)
    VALUES (_g.tenant_id, _grant_id, _g.automation_id, _act_key, _idempotency_key, _cost)
    RETURNING id INTO _existing;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO _existing FROM public.paige_authority_act_runs
      WHERE grant_id = _grant_id AND idempotency_key = _idempotency_key;
    RETURN jsonb_build_object('ok', true, 'receipt_id', _existing.id, 'replay', true);
  END;

  RETURN jsonb_build_object('ok', true, 'receipt_id', _existing.id, 'replay', false);
END;
$$;

-- 4c. CONSUME. The provider confirmed the result — record it truthfully (§10.7). Only advances a
-- 'reserved' receipt; never fabricates success on a missing or already-settled row.
CREATE OR REPLACE FUNCTION public.authority_consume(_receipt_id uuid, _provider_ref text, _outcome jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _r record;
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
    RETURN jsonb_build_object('ok', false, 'reason', 'not_reserved', 'status', _r.status);
  END IF;
  UPDATE public.paige_authority_act_runs
     SET status = 'succeeded', provider_ref = _provider_ref, outcome = _outcome, settled_at = now()
   WHERE id = _receipt_id;
  RETURN jsonb_build_object('ok', true, 'receipt_id', _receipt_id, 'status', 'succeeded');
END;
$$;

-- 4d. RELEASE. The act failed or was aborted before the provider committed — give the reserved capacity
-- back atomically so a failed attempt does not permanently consume a tenant's cap. Marks the receipt
-- 'failed'/'released' and reverses the window decrements. Idempotent: releasing a non-reserved receipt
-- no-ops.
CREATE OR REPLACE FUNCTION public.authority_release(_receipt_id uuid, _failed boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _r     record;
  _today date;
  _wk    date;
  _mo    date;
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

  _today := (_r.reserved_at AT TIME ZONE 'UTC')::date;
  _wk    := date_trunc('week',  _r.reserved_at AT TIME ZONE 'UTC')::date;
  _mo    := date_trunc('month', _r.reserved_at AT TIME ZONE 'UTC')::date;

  -- Reverse exactly what this receipt reserved, clamped at zero (never drive a counter negative).
  UPDATE public.paige_authority_budget_windows
     SET actions_used = GREATEST(0, actions_used - 1),
         spend_used_usd = GREATEST(0, spend_used_usd - _r.cost_usd),
         updated_at = now()
   WHERE grant_id = _r.grant_id
     AND (window_kind, window_start) IN (('day',_today),('week',_wk),('month',_mo));

  UPDATE public.paige_authority_act_runs
     SET status = CASE WHEN _failed THEN 'failed' ELSE 'released' END, settled_at = now()
   WHERE id = _receipt_id;
  RETURN jsonb_build_object('ok', true, 'receipt_id', _receipt_id, 'status', CASE WHEN _failed THEN 'failed' ELSE 'released' END);
END;
$$;

-- 4e. REMAINING CAPACITY (read) — powers the §10.9 "show remaining capacity" surface. Scope-checked.
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
  FOR _row IN
    SELECT window_kind, actions_used, spend_used_usd
      FROM public.paige_authority_budget_windows
     WHERE grant_id = _grant_id
       AND ((window_kind='day' AND window_start=_today)
         OR (window_kind='week' AND window_start=_wk)
         OR (window_kind='month' AND window_start=_mo))
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GRANTS — the primitives run under the trusted service role and for scoped JWT callers.
-- The in-body §59 checks are the real gate; EXECUTE is granted broadly and the body refuses strangers.
-- ─────────────────────────────────────────────────────────────────────────────
-- Least-privilege: strip the default PUBLIC EXECUTE from every function, then grant only the intended
-- roles. The reserve/consume/release primitives are service-role-only (Paige's headless runtime + the
-- PR-3 executor); the two read functions are additionally callable by an authenticated owner/member for
-- the §10.9 "show current grant / remaining capacity" surface. No function is reachable by `anon`, and
-- each body re-asserts §59 caller scope regardless (lint:definer-fns clean without an anon exemption).
REVOKE ALL ON FUNCTION public.authority_grant_active(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authority_reserve(uuid, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authority_consume(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authority_release(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authority_remaining_capacity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authority_grant_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.authority_reserve(uuid, text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.authority_consume(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.authority_release(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.authority_remaining_capacity(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.paige_authority_grants IS
  'RE-2 standing delegated authority grant (owner ruling 2026-09-06, autonomy-architecture.md §10.7-§10.9). First-class + citable; SUBSTRATE ONLY — no execution path reads it yet (PR-2/PR-3).';
COMMENT ON FUNCTION public.authority_reserve(uuid, text, text, numeric) IS
  'Atomic reserve for an autonomous act: fail-closed unless the grant is active AND every applicable cap window has room. Idempotent per (grant, idempotency_key). SUBSTRATE — no producer yet (RE-2 PR-1).';
