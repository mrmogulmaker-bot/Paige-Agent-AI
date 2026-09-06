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
--   narrowest-limit-wins (§10.9) — the reserve primitive enforces the single-action cap and every DECLARED
--          day/week/month action-count + spend window; any one exhausted fails closed. A grant that
--          declares a cap this slice cannot yet evaluate (campaign_budget_usd / client_period_budget_usd —
--          PR-3) is REFUSED at reserve, not silently under-enforced, so "any layer unreadable, fails
--          closed" holds by construction rather than by comment.

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
  granted_by         uuid NOT NULL DEFAULT auth.uid(), -- the grantor; a BEFORE-INSERT trigger forces this = auth.uid() on JWT writes so it cannot be spoofed (§10.9 audit integrity). Service-role (headless) writes supply the real grantor.
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

-- READ: a tenant member (and any platform operator) may see their own tenant's grants — the §10.9 "show
-- the current grant, remaining capacity … visibly to the owner and permitted representative".
-- WRITE is admin-only, and deliberately ASYMMETRIC to READ (§53): a tenant admin authors their OWN
-- tenant's grant, but on the PLATFORM side only super_admin (is_platform_owner) — NOT a delegated
-- platform_admin — may author a tenant's SPENDING authority. Authoring a tenant's spending authority is a
-- God-tier act, not a delegated-operator one, so it does not ride is_platform_operator(). The
-- representative-ceiling enforcement + Paige's own confirmation-gated grant authoring are PR-2 work.
DROP POLICY IF EXISTS paige_authority_grants_read ON public.paige_authority_grants;
CREATE POLICY paige_authority_grants_read ON public.paige_authority_grants
  FOR SELECT TO authenticated
  USING (public.is_platform_operator() OR public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS paige_authority_grants_admin_write ON public.paige_authority_grants;
CREATE POLICY paige_authority_grants_admin_write ON public.paige_authority_grants
  FOR ALL TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin(tenant_id));

-- INTEGRITY TRIGGER (§10.9 audit integrity + §9/§51 tenant seam). Fires on every write to
-- paige_authority_grants:
--   • granted_by cannot be spoofed — a JWT write (auth.uid() present) has granted_by FORCED to auth.uid(),
--     so a caller can never author a grant "as" someone else. A service-role/headless write (auth.uid()
--     IS NULL) is Paige's trusted runtime and supplies the real grantor (the NOT NULL column makes an
--     omitted grantor fail closed).
--   • the delegation chain never crosses the tenant seam — parent_grant_id and automation_id must both
--     reference rows in the SAME tenant as the grant (§9/§51). SECURITY DEFINER so the EXISTS checks are
--     authoritative regardless of the writer's own read grants; it mutates nothing and is EXECUTE-granted
--     to no one (a trigger runs as the table owner), so it is outside the lint:definer-fns anon surface.
--   • updated_at is maintained on every write.
CREATE OR REPLACE FUNCTION public.paige_authority_grants_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.granted_by := auth.uid();   -- forbid spoofing the grantor on a JWT write
  END IF;
  IF NEW.parent_grant_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.paige_authority_grants p
                      WHERE p.id = NEW.parent_grant_id AND p.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'parent_grant_id % must belong to tenant %', NEW.parent_grant_id, NEW.tenant_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.automation_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.paige_automations a
                      WHERE a.id = NEW.automation_id AND a.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'automation_id % must belong to tenant %', NEW.automation_id, NEW.tenant_id
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.paige_authority_grants_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_paige_authority_grants_guard ON public.paige_authority_grants;
CREATE TRIGGER trg_paige_authority_grants_guard
  BEFORE INSERT OR UPDATE ON public.paige_authority_grants
  FOR EACH ROW EXECUTE FUNCTION public.paige_authority_grants_guard();

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
  cost_usd          numeric(12,4) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0), -- reserved cost (estimate until M1 confirms real spend); reserve also guards this, CHECK is defense-in-depth
  -- The exact velocity/spend window kinds this receipt incremented (e.g. ["day","week"]). RELEASE reverses
  -- PRECISELY these, so a cap edited between reserve and release can never make release touch a window the
  -- reserve did not increment (§32 correctness — the release-over-reversal MINOR).
  reserved_windows  jsonb NOT NULL DEFAULT '[]'::jsonb,
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
-- active AND the single-action cap plus every DECLARED day/week/month cap window has room for one more
-- action and `_cost_usd` more spend. Serialization is provided by the GRANT-ROW `FOR UPDATE` lock (a
-- concurrent same-grant reserve blocks on it until this txn commits), so two parallel acts cannot both
-- slip past a nearly-exhausted cap (§10.9 narrowest-limit-wins). The window-row `FOR UPDATE` below cannot
-- do this alone — it locks nothing when the window row does not yet exist — so the grant-row lock is the
-- load-bearing serialization point; do not weaken it. Idempotent: a repeat of the same
-- (grant, idempotency_key) returns the existing receipt and reserves nothing new.
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
  _g                record;
  _existing         record;
  _cost             numeric := COALESCE(_cost_usd, 0);
  _today            date := (now() AT TIME ZONE 'UTC')::date;
  _wk               date := date_trunc('week',  now() AT TIME ZONE 'UTC')::date;
  _mo               date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
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

  -- FAIL-CLOSED on any DECLARED cap kind this primitive cannot yet evaluate (§10.7 "any layer unreadable,
  -- fails closed"). Only the single-action cap and the day/week/month action-count + spend caps are
  -- enforced here. A grant that declares campaign_budget_usd / client_period_budget_usd (which need a
  -- campaign_id / client-period boundary in scope to derive a window_start — PR-3 work) is REFUSED, not
  -- silently under-enforced. This makes "narrowest-limit-wins across every declared cap" TRUE by
  -- construction: reserve cannot pass a grant carrying a cap it does not enforce.
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(_g.caps) AS k(key)
     WHERE k.key NOT IN ('max_per_action_usd','max_per_day','max_per_week','max_per_month',
                         'daily_budget_usd','weekly_budget_usd','monthly_budget_usd')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unenforceable_cap_kind');
  END IF;

  -- PASS 1: verify headroom for every DECLARED day/week/month window under a row lock, and record which
  -- windows this reservation will touch so RELEASE later reverses EXACTLY these (robust to a cap edited
  -- between reserve and release). If ANY window is exhausted, return refused having written NOTHING.
  FOR _win IN
    SELECT * FROM (VALUES
      ('day',   _today, (_g.caps->>'max_per_day')::int,   (_g.caps->>'daily_budget_usd')::numeric),
      ('week',  _wk,    (_g.caps->>'max_per_week')::int,  (_g.caps->>'weekly_budget_usd')::numeric),
      ('month', _mo,    (_g.caps->>'max_per_month')::int, (_g.caps->>'monthly_budget_usd')::numeric)
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

  -- PASS 2: all windows have room and the receipt exists — commit the decrements for EXACTLY the windows
  -- verified in PASS 1. (Grant + window locks still held in this txn.)
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

  RETURN jsonb_build_object('ok', true, 'receipt_id', _receipt_id, 'replay', false);
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
  -- recomputing each window_start from the receipt's OWN reserved_at so the reversed window matches the
  -- reserved one across a day/week/month boundary. Not a fixed day/week/month assumption — so a cap
  -- added to the grant after this receipt reserved can never make release decrement a window this
  -- receipt never touched (§32 correctness). Clamped at zero (never drive a counter negative).
  FOR _kind IN SELECT jsonb_array_elements_text(_r.reserved_windows)
  LOOP
    _wstart := CASE _kind
                 WHEN 'day'   THEN (_r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'week'  THEN date_trunc('week',  _r.reserved_at AT TIME ZONE 'UTC')::date
                 WHEN 'month' THEN date_trunc('month', _r.reserved_at AT TIME ZONE 'UTC')::date
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
  'Atomic reserve for an autonomous act: fail-closed unless the grant is active AND the single-action cap plus every declared day/week/month cap window has room; a declared cap this slice cannot evaluate (campaign_budget_usd/client_period_budget_usd) is REFUSED (unenforceable_cap_kind). Idempotent per (grant, idempotency_key); a failed/released key fails closed (prior_attempt_failed). SUBSTRATE — no producer yet (RE-2 PR-1).';
