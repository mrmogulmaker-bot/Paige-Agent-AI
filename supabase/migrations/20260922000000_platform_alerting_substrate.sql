-- =============================================================================
-- Platform Alerting Substrate — A1 (schema only)
-- =============================================================================
-- Owner-ruled 2026-08-20: build the FULL alerting substrate — its own condition
-- language over arbitrary platform signals, multi-channel delivery, escalation.
-- Architecture + the §18 survey that shaped it: docs/architecture/platform-alerting-substrate.md
--
-- ADDITIVE ONLY. Three new tables. No ALTER on anything shipped, no data
-- migration, no backfill — so this is reversible and §4 merge-on-verified applies
-- rather than the irreversible-migration pause.
--
-- WHAT THIS DELIBERATELY DOES NOT ADD (§18, each checked against the code):
--   * No delivery machinery. `_shared/channel-adapters.ts` already declares itself
--     the single home for multi-channel delivery (email/sms/whatsapp/instagram/
--     facebook/voice → one NormalizedMessage, dispatcher `send-message`). Slice A3
--     routes through it. A second delivery path here would be the exact §18
--     violation the architecture doc exists to prevent.
--   * No notification inbox. `paige_admin_notifications` already is one.
--   * No approval path. The action bus + `autonomy_lane` already carry escalation
--     (§16 is explicit that the three tiers ARE the existing enum, not a new one).
--   * No widening of `stage_automation_rules` (FK-bound to pipelines/stages — it
--     structurally cannot hold a platform-signal condition) or `paige_sla_alert_log`
--     (hardcoded to client SLA). Both are adjacent and stay untouched (§58).
--
-- §9/§51/§53 — OPERATOR SCOPE ONLY. Gated on `is_platform_operator()` (super_admin
-- OR platform_admin), NOT the frozen `is_platform_owner()` which stays super_admin-only
-- and load-bearing under the integrity gates. No tenant tier can read or write here.
-- Tenant-tier alerting is a SEPARATE decision with its own §51 matrix and §60 entry;
-- baking a tenant assumption in now is precisely what §56 exists to stop.
-- =============================================================================

-- ── 1. Signal registry — config-as-data (§10) ────────────────────────────────
-- A signal is a named, operator-scoped, evaluable fact about the platform. It lives
-- as a ROW rather than a hardcoded enum so Paige can reason over the catalogue and
-- author a rule against it by voice or text without a code change (§10: "could Paige
-- do this from the chat, with no human in the UI?").
CREATE TABLE IF NOT EXISTS public.paige_alert_signal (
  key           text PRIMARY KEY,
  label         text NOT NULL,
  description   text NOT NULL,
  -- 'count' | 'boolean' | 'rate' — tells the evaluator how to compare, and the UI
  -- which operators to offer.
  value_kind    text NOT NULL CHECK (value_kind IN ('count','boolean','rate')),
  -- §13, LOAD-BEARING: false means "registered, but nothing can read it yet". A rule
  -- bound to an unreadable signal must report "never evaluated" — never a false green.
  -- `migrations.drift` ships false on purpose: an edge function cannot read git, the
  -- same reason the two Wave-S3 git-tag checks are honestly DEFERRED.
  is_readable   boolean NOT NULL DEFAULT true,
  -- Where the evaluator gets it. Free text on purpose — the evaluator (A2) maps this
  -- to a reader; a CHECK here would mean an ALTER every time a signal is added.
  reader        text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.paige_alert_signal IS
  'Operator-scope platform signals a rule can watch. Config-as-data (§10) so Paige can author rules from chat without a code change.';
COMMENT ON COLUMN public.paige_alert_signal.is_readable IS
  '§13 — false means no reader exists yet. A rule on this signal reports "never evaluated", never a pass.';

-- ── 2. Rules ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paige_alert_rule (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,

  -- The condition. A VALIDATED JSONB SHAPE, deliberately not an expression language:
  --   { "signal": "systems_check.failing_count", "op": "gte", "value": 1, "for_minutes": 15 }
  -- composed with { "all_of": [ ... ] } / { "any_of": [ ... ] }.
  -- A parser is what turns this into a maintenance problem; a triple is what lets
  -- Paige author a rule from chat (§10) and lets the evaluator validate before it runs.
  -- If a rule ever needs arbitrary logic, that is a NEW SIGNAL with its own reader,
  -- never a bigger language.
  condition     jsonb NOT NULL,

  -- §16 — which of the 10 departments owns this, and at what autonomy tier.
  -- SHIPPED IN A1 ON PURPOSE so A-Weave-4 (routing firings onto the action bus) is
  -- wiring rather than a migration. The lane vocabulary is the EXISTING autonomy_lane
  -- enum: 'auto' (🟢) | 'confirm' (🟡) | 'off' (🔴). §16 is explicit that these tiers
  -- are not to be reinvented.
  department    text,
  autonomy_lane text NOT NULL DEFAULT 'confirm'
                CHECK (autonomy_lane IN ('auto','confirm','off')),

  -- Delivery targets for A3, as data. Shape is owned by the channel layer
  -- (`_shared/channel-adapters.ts`), NOT re-declared here — this column records WHICH
  -- channels a rule uses; HOW to send is the channel layer's business (§18).
  channels      jsonb NOT NULL DEFAULT '[]'::jsonb,

  severity      text NOT NULL DEFAULT 'warning'
                CHECK (severity IN ('info','warning','urgent')),

  -- Off by default, matching `stage_automation_rules`' own safe default: a rule that
  -- starts firing the moment it is created is a rule nobody got to review.
  is_active     boolean NOT NULL DEFAULT false,

  -- §13 — the pack's own foot says it: "A rule that has never fired is not proof of
  -- health — it may simply be wrong. Test it." These make NEVER FIRED answerable.
  last_evaluated_at timestamptz,
  last_fired_at     timestamptz,

  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.paige_alert_rule IS
  'Operator-scope alert rules. Condition is a validated JSONB triple (§10 Paige-authorable); department + autonomy_lane ship here so A-Weave-4 is wiring, not a migration.';

CREATE INDEX IF NOT EXISTS paige_alert_rule_active_idx
  ON public.paige_alert_rule (is_active, last_evaluated_at NULLS FIRST);

-- ── 3. Firings ───────────────────────────────────────────────────────────────
-- RECORDED FIRST, DELIVERED SECOND — always. A firing is a row before it is a
-- message, so "did it fire?" stays answerable when delivery fails. §13: a fire is
-- NOT a delivery, and this table is what keeps us from ever conflating them.
CREATE TABLE IF NOT EXISTS public.paige_alert_firing (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       uuid NOT NULL REFERENCES public.paige_alert_rule(id) ON DELETE CASCADE,
  fired_at      timestamptz NOT NULL DEFAULT now(),

  -- What the signal ACTUALLY read at fire time. Evidence, not a restatement of the
  -- rule (§13) — this is what lets a later reader tell a real firing from a bug.
  observed      jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- WHICH TENANT this firing is ABOUT — distinct from ownership (rules are always
  -- operator-owned). Null for a platform-scope firing (migration drift, LLM failover).
  -- A-Weave-3 opens the tenant peek drawer from this; where it is null the affordance
  -- must be ABSENT rather than opening an empty drawer.
  scope_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,

  delivery_status text NOT NULL DEFAULT 'pending'
                  CHECK (delivery_status IN ('pending','delivered','failed','skipped')),
  delivered_at    timestamptz,
  delivery_error  text,

  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Extension point for the weaves (e.g. A-Weave-4's action-bus link) without an
  -- ALTER on a shipped table.
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.paige_alert_firing IS
  'One row per rule firing. Written BEFORE delivery is attempted (§13 — a fire is not a delivery). Read by A-Weave-1 (History), A-Weave-2 (Chat) and A-Weave-6 (Paige recall).';
COMMENT ON COLUMN public.paige_alert_firing.scope_tenant_id IS
  'The tenant this firing is ABOUT (null = platform-scope). Rules are always operator-owned; this is not ownership.';

CREATE INDEX IF NOT EXISTS paige_alert_firing_rule_time_idx
  ON public.paige_alert_firing (rule_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS paige_alert_firing_unacked_idx
  ON public.paige_alert_firing (fired_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS paige_alert_firing_scope_idx
  ON public.paige_alert_firing (scope_tenant_id, fired_at DESC) WHERE scope_tenant_id IS NOT NULL;

-- ── 4. RLS — operator only, FORCE'd ──────────────────────────────────────────
-- FORCE so even a table owner is subject to the policies, matching the
-- paige_systems_check_* family.
ALTER TABLE public.paige_alert_signal  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_alert_signal  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.paige_alert_rule    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_alert_rule    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.paige_alert_firing  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_alert_firing  FORCE ROW LEVEL SECURITY;

-- Signals: operators read the catalogue. Writes are migration/service-role only —
-- the catalogue is platform config, not operator-authored content (§9).
DROP POLICY IF EXISTS "alert_signal_operator_read" ON public.paige_alert_signal;
CREATE POLICY "alert_signal_operator_read" ON public.paige_alert_signal
  FOR SELECT TO authenticated
  USING (public.is_platform_operator());

-- Rules: operators read and author.
DROP POLICY IF EXISTS "alert_rule_operator_read" ON public.paige_alert_rule;
CREATE POLICY "alert_rule_operator_read" ON public.paige_alert_rule
  FOR SELECT TO authenticated
  USING (public.is_platform_operator());

DROP POLICY IF EXISTS "alert_rule_operator_insert" ON public.paige_alert_rule;
CREATE POLICY "alert_rule_operator_insert" ON public.paige_alert_rule
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_operator());

DROP POLICY IF EXISTS "alert_rule_operator_update" ON public.paige_alert_rule;
CREATE POLICY "alert_rule_operator_update" ON public.paige_alert_rule
  FOR UPDATE TO authenticated
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

DROP POLICY IF EXISTS "alert_rule_operator_delete" ON public.paige_alert_rule;
CREATE POLICY "alert_rule_operator_delete" ON public.paige_alert_rule
  FOR DELETE TO authenticated
  USING (public.is_platform_operator());

-- Firings: operators read and acknowledge. They do NOT hand-write firings —
-- a firing is written by the evaluator (service_role). An operator-authored firing
-- would be a fabricated event in the one table whose whole job is recording what
-- actually happened (§13).
DROP POLICY IF EXISTS "alert_firing_operator_read" ON public.paige_alert_firing;
CREATE POLICY "alert_firing_operator_read" ON public.paige_alert_firing
  FOR SELECT TO authenticated
  USING (public.is_platform_operator());

DROP POLICY IF EXISTS "alert_firing_operator_ack" ON public.paige_alert_firing;
CREATE POLICY "alert_firing_operator_ack" ON public.paige_alert_firing
  FOR UPDATE TO authenticated
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

-- ── 5. Grants ────────────────────────────────────────────────────────────────
-- RLS is the gate; these are the coarse table privileges beneath it. service_role
-- gets ALL because the evaluator (A2) runs there — and because the systems-check
-- family shipped WITHOUT service_role grants and produced a runtime "permission
-- denied" that the BEGIN..ROLLBACK proofs structurally could not catch (they run as
-- owner, not as service_role). That was hotfix #94; not repeating it here.
GRANT SELECT ON public.paige_alert_signal TO authenticated;
GRANT ALL    ON public.paige_alert_signal TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_alert_rule TO authenticated;
GRANT ALL    ON public.paige_alert_rule TO service_role;

GRANT SELECT, UPDATE ON public.paige_alert_firing TO authenticated;
GRANT ALL    ON public.paige_alert_firing TO service_role;

-- ── 6. Seed the signal catalogue ─────────────────────────────────────────────
-- Every signal below is backed by a read that ALREADY ships, except the one marked
-- unreadable — which is registered precisely so its absence is visible rather than
-- discovered later as a surprise.
INSERT INTO public.paige_alert_signal (key, label, description, value_kind, is_readable, reader, notes)
VALUES
  ('systems_check.failing_count',
   'Failing platform checks',
   'How many operator-scope Systems Check findings are failing and unresolved.',
   'count', true, 'paige_systems_check_finding',
   'Operator scope = tenant_id IS NULL. Skips are not failures (§13).'),

  ('systems_check.blocking_present',
   'A blocking check is failing',
   'Whether any operator-scope finding at blocking severity is unresolved.',
   'boolean', true, 'paige_systems_check_finding', NULL),

  ('fleet.tenants_at_risk',
   'Tenants at risk',
   'How many customer tenants are graded at risk — suspended, or with no seats.',
   'count', true, 'tenants',
   'Server-side twin of the health derivation the Fleet Console renders; the twin lands with A2.'),

  ('llm.failover_rate',
   'LLM failover rate',
   'Share of model calls that fell through to a fallback provider.',
   'rate', true, 'paige_llm_trace', NULL),

  ('migrations.drift',
   'Migrations ahead of prod',
   'How many migrations are merged but not yet persisted on prod.',
   'count',
   false,   -- §13: NO READER EXISTS. See notes.
   NULL,
   'NOT READABLE. An edge function cannot read git, which is the same reason the two Wave-S3 git-tag checks are honestly DEFERRED rather than faked. A rule bound to this signal must report "never evaluated" — never a pass. Becomes readable only once CI publishes drift as a row.')
ON CONFLICT (key) DO NOTHING;
