-- §67 SLICE A — THE PROCESS RECORD. Autonomy is granted to a PROCESS, not to a tool.
--
-- Owner ruling, 2026-08-24:
--   "The Trust Compass should be something that Paige can call on and assign to workflows and
--    automations not tools by themselves… The Human user should be able to decide how much of the
--    repeatable task will they allow Paige, her other Agents etc to manage on their own."
--
-- THE GAP THIS FILLS. Everything the ruling needs already exists as separate islands — the action
-- bus governs a KIND OF ACT, `tenant_tool_autonomy` governs a TOOL, `stage_automation_rules`
-- governs one hardwired pipeline path, the n8n mirror governs external workflows. None of them is a
-- PROCESS, and nothing chains them. A human cannot say "run my follow-up sequence on its own",
-- because there is no row that means "my follow-up sequence".
--
-- The two layers that bound a process both now exist and work:
--   · the CEILING — the Trust Compass, made to actually clamp in 20261021000000;
--   · the FLOOR   — the per-tool gate, whose catalogue was completed in 20261020000000.
-- This is the middle layer, the GRANT, and it is the one a human actually reasons about.
--
-- IT EXTENDS THE ACTION BUS, IT DOES NOT FORK IT (§18). `paige_action_kinds` is already the right
-- shape — it carries `executor`, `requires_approval`, `default_autonomy_lane`, and the two
-- structural CHECKs that make autonomy safe as DATABASE LAW rather than convention:
--     CHECK (executor <> 'send_via_approval' OR requires_approval = true)
--     CHECK (default_autonomy_lane <> 'auto' OR executor IN ('record_only','workflow'))
-- An act in a process names an action kind, so those two rules bind every act by construction. A
-- process cannot contain an auto-send however its grant is set, because auto-send is not
-- representable in the thing an act points at.
--
-- §16's `auto | confirm | off` is unchanged and is the vocabulary a grant is expressed in, so the
-- tiers, the audit log and the approvals path all carry over untouched.

-- ── 1. THE TRIGGER CATALOGUE, AS DATA ──
--
-- A process that cannot be TOLD it should run is not running, whatever its grant says. That is the
-- `dark` concept, and it needs a source of truth: a builder must only be able to offer a trigger
-- that can actually fire, and a dark one must say WHY rather than silently never running.
--
-- `is_live` is a fact about whether a seam EMITS this trigger today. It is deliberately not a
-- feature flag — `dark_reason` is NOT NULL exactly when it is false, so "dark" can never be an
-- unexplained state. Platform rows (tenant_id NULL) are the catalogue; a tenant does not author
-- triggers.
CREATE TABLE IF NOT EXISTS public.paige_automation_triggers (
  key           text PRIMARY KEY,
  label         text NOT NULL,
  category      text NOT NULL,
  description   text NOT NULL,
  is_live       boolean NOT NULL DEFAULT false,
  -- WHY it cannot fire. Required when dark, forbidden when live: a live trigger with a reason is a
  -- contradiction, and a dark one without a reason is the silence this column exists to prevent.
  dark_reason   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_automation_triggers_dark_reason_ck
    CHECK ((is_live AND dark_reason IS NULL) OR ((NOT is_live) AND dark_reason IS NOT NULL))
);

ALTER TABLE public.paige_automation_triggers ENABLE ROW LEVEL SECURITY;

-- The catalogue is platform reference data: readable by any authenticated caller (a builder has to
-- offer it), writable by nobody through RLS — it changes by migration, like the action-bus kinds.
DROP POLICY IF EXISTS paige_automation_triggers_read ON public.paige_automation_triggers;
CREATE POLICY paige_automation_triggers_read
  ON public.paige_automation_triggers FOR SELECT TO authenticated
  USING (true);

-- ── 2. THE PROCESS ──
CREATE TABLE IF NOT EXISTS public.paige_automations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  category        text NOT NULL DEFAULT 'general',
  trigger_key     text NOT NULL REFERENCES public.paige_automation_triggers(key),
  -- The trigger's parameters ("no reply for 4 days"), and the conditions that narrow it
  -- ("channel is Email or SMS", "the record is a prospect"). Config-as-data so Paige can author a
  -- process end to end without a code change (§10).
  trigger_config  jsonb NOT NULL DEFAULT '{}'::jsonb,
  conditions      jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- THE GRANT. How much of THIS process the human is willing to let run alone. Defaults to the
  -- most restrictive lane that still does something: a process is born asking.
  granted_lane    text NOT NULL DEFAULT 'confirm'
                  CHECK (granted_lane IN ('auto','confirm','off')),

  -- `draft` — being composed, never fires. `live` — armed. `paused` — kept, deliberately off.
  state           text NOT NULL DEFAULT 'draft'
                  CHECK (state IN ('draft','live','paused')),

  -- WHY THE GRANT IS FINGERPRINTED. The human granted a SPECIFIC chain of acts. If the chain
  -- changes afterwards, the grant they gave no longer describes what would run — so it must not
  -- silently carry over to a process that now does something else. The trigger below recomputes
  -- this on any change to the acts and drops the grant to `confirm` when it moves. This is the
  -- architecture doc's recommendation #2, implemented rather than left as a question.
  acts_fingerprint text,

  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_paige_automations_tenant_state
  ON public.paige_automations (tenant_id, state);

-- ── 3. THE ACTS, ORDERED ──
--
-- Each act names an ACTION KIND (the action bus's unit, which carries the executor and the two
-- structural CHECKs) or a TOOL KEY (the per-tool floor's unit). Exactly one of the two, because an
-- act that named both would have two floors and no way to say which binds.
CREATE TABLE IF NOT EXISTS public.paige_automation_acts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   uuid NOT NULL REFERENCES public.paige_automations(id) ON DELETE CASCADE,
  position        int  NOT NULL,
  action_kind     text REFERENCES public.paige_action_kinds(slug),
  tool_key        text,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_automation_acts_one_unit_ck
    CHECK (num_nonnulls(action_kind, tool_key) = 1),
  UNIQUE (automation_id, position)
);

CREATE INDEX IF NOT EXISTS idx_paige_automation_acts_automation
  ON public.paige_automation_acts (automation_id, position);

-- ── 4. RLS — a process belongs to ONE tenant and is visible to that tenant only (§9) ──
ALTER TABLE public.paige_automations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_automation_acts  ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE, so no future permissive policy can widen it — the same shape the chat threads use.
DROP POLICY IF EXISTS paige_automations_tenant_isolation ON public.paige_automations;
CREATE POLICY paige_automations_tenant_isolation
  ON public.paige_automations AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id())
  WITH CHECK (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

-- Only a tenant ADMIN authors processes. §51: an agency acting on a sub-account does so by
-- switching INTO it (its active tenant becomes the child), never by reaching across — delegation
-- divides authority, it never widens it. That is the architecture doc's recommendation #3.
DROP POLICY IF EXISTS paige_automations_read ON public.paige_automations;
CREATE POLICY paige_automations_read
  ON public.paige_automations FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS paige_automations_write ON public.paige_automations;
CREATE POLICY paige_automations_write
  ON public.paige_automations FOR ALL TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin(tenant_id));

-- Acts inherit their parent's scope exactly, so there is one answer to "whose is this".
DROP POLICY IF EXISTS paige_automation_acts_tenant_isolation ON public.paige_automation_acts;
CREATE POLICY paige_automation_acts_tenant_isolation
  ON public.paige_automation_acts AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.paige_automations a
                  WHERE a.id = automation_id
                    AND (public.is_platform_owner() OR a.tenant_id = public.current_user_tenant_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.paige_automations a
                       WHERE a.id = automation_id
                         AND (public.is_platform_owner() OR a.tenant_id = public.current_user_tenant_id())));

DROP POLICY IF EXISTS paige_automation_acts_read ON public.paige_automation_acts;
CREATE POLICY paige_automation_acts_read
  ON public.paige_automation_acts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.paige_automations a
                  WHERE a.id = automation_id
                    AND (public.is_platform_owner() OR public.is_tenant_member(a.tenant_id))));

DROP POLICY IF EXISTS paige_automation_acts_write ON public.paige_automation_acts;
CREATE POLICY paige_automation_acts_write
  ON public.paige_automation_acts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.paige_automations a
                  WHERE a.id = automation_id
                    AND (public.is_platform_owner() OR public.is_tenant_admin(a.tenant_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.paige_automations a
                       WHERE a.id = automation_id
                         AND (public.is_platform_owner() OR public.is_tenant_admin(a.tenant_id))));

-- ── 5. THE GRANT DOES NOT SURVIVE A CHANGE TO THE CHAIN ──
--
-- A human granted a specific sequence of acts. Editing that sequence afterwards and keeping the
-- grant would mean they authorised something they never saw — the same defect as an approval bound
-- to a boolean rather than to a call. So the fingerprint is recomputed on every change to the acts,
-- and a change drops the grant back to `confirm`.
--
-- Deliberately NOT dropped to `off`: silently disabling a process a human built is its own kind of
-- surprise. `confirm` keeps it working while putting the human back in the loop, which is what they
-- would have had before they granted it.
CREATE OR REPLACE FUNCTION public.paige_automation_acts_fingerprint(_automation_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT md5(coalesce(string_agg(
           a.position::text || ':' || coalesce(a.action_kind, '') || ':' || coalesce(a.tool_key, '')
             || ':' || a.config::text,
           '|' ORDER BY a.position), ''))
    FROM public.paige_automation_acts a
   WHERE a.automation_id = _automation_id;
$$;
REVOKE ALL ON FUNCTION public.paige_automation_acts_fingerprint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paige_automation_acts_fingerprint(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.paige_automation_acts_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _id uuid := COALESCE(NEW.automation_id, OLD.automation_id);
  _fp text;
BEGIN
  _fp := public.paige_automation_acts_fingerprint(_id);
  UPDATE public.paige_automations
     SET granted_lane = CASE
           -- Only ever MORE restrictive. A chain that changed loses its grant; one that did not
           -- keeps it. `off` stays `off` — a human who turned it off did not ask for it back.
           WHEN acts_fingerprint IS DISTINCT FROM _fp AND granted_lane = 'auto' THEN 'confirm'
           ELSE granted_lane
         END,
         acts_fingerprint = _fp,
         updated_at = now()
   WHERE id = _id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_paige_automation_acts_changed ON public.paige_automation_acts;
CREATE TRIGGER trg_paige_automation_acts_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.paige_automation_acts
  FOR EACH ROW EXECUTE FUNCTION public.paige_automation_acts_changed();

COMMENT ON TABLE public.paige_automations IS
  '§67 — a repeatable PROCESS: a trigger, its conditions, and an ordered chain of acts, with the lane a human granted it. The unit autonomy is actually granted to. Bounded above by the Trust Compass ceiling and below by each act''s own floor; a change to the acts drops an `auto` grant back to `confirm`, because the human granted a specific chain.';
COMMENT ON TABLE public.paige_automation_acts IS
  '§67 — one act in a process, in order. Names an action kind (carrying the action bus''s executor and its two structural CHECKs) or a tool key (carrying the per-tool floor). Exactly one, so an act has exactly one floor.';
COMMENT ON TABLE public.paige_automation_triggers IS
  '§67 — the trigger catalogue. `is_live` says whether a seam actually emits this trigger today; `dark_reason` is required exactly when it does not, so a process that can never fire says why instead of failing silently.';
