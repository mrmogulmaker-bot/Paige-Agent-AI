
-- Wave 3 — Hybrid RLS + Claim + SLA dedupe + Round-robin

CREATE UNIQUE INDEX IF NOT EXISTS paige_coach_assignments_unique_active
  ON public.paige_coach_assignments (contact_id, assigned_role)
  WHERE active = true;

CREATE OR REPLACE FUNCTION public.tier_pool_for_role(_role app_role)
RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT CASE _role
    WHEN 'sales_rep'::app_role THEN ARRAY['lead','standard']::text[]
    WHEN 'cs_rep'::app_role    THEN ARRAY['standard','premium','vip','internal']::text[]
    ELSE ARRAY[]::text[]
  END
$$;

CREATE OR REPLACE FUNCTION public.assignment_role_for(_role app_role)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role
    WHEN 'sales_rep'::app_role THEN 'lead_owner'
    WHEN 'cs_rep'::app_role    THEN 'cs_primary'
    WHEN 'coach'::app_role     THEN 'coach'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_client(
  _user uuid, _client uuid, _assignment_role text DEFAULT NULL
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.paige_coach_assignments
    WHERE contact_id = _client AND rep_user_id = _user AND active = true
      AND (_assignment_role IS NULL OR assigned_role = _assignment_role)
  )
$$;

CREATE OR REPLACE FUNCTION public.client_has_role_assigned(
  _client uuid, _assignment_role text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.paige_coach_assignments
    WHERE contact_id = _client AND assigned_role = _assignment_role AND active = true
  )
$$;

-- Replace clients policies
DROP POLICY IF EXISTS "Admins can manage all clients" ON public.clients;
DROP POLICY IF EXISTS "Assigned coaches can manage their clients" ON public.clients;
DROP POLICY IF EXISTS "Coaches can manage own clients" ON public.clients;

CREATE POLICY "clients_admins_full" ON public.clients FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']::text[]));

CREATE POLICY "clients_coaches_assigned" ON public.clients FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'coach'::app_role) AND (
      assigned_coach_user_id = auth.uid()
      OR created_by = auth.uid()
      OR public.is_assigned_to_client(auth.uid(), id, 'coach')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coach'::app_role) AND (
      assigned_coach_user_id = auth.uid()
      OR created_by = auth.uid()
      OR public.is_assigned_to_client(auth.uid(), id, 'coach')
    )
  );

CREATE POLICY "clients_sales_rep_assigned_full" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'sales_rep'::app_role) AND public.is_assigned_to_client(auth.uid(), id, 'lead_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'sales_rep'::app_role) AND public.is_assigned_to_client(auth.uid(), id, 'lead_owner'));

CREATE POLICY "clients_sales_rep_pool_read" ON public.clients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'sales_rep'::app_role) AND tier = ANY(ARRAY['lead','standard']::text[]));

CREATE POLICY "clients_cs_rep_assigned_full" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'cs_rep'::app_role) AND public.is_assigned_to_client(auth.uid(), id, 'cs_primary'))
  WITH CHECK (public.has_role(auth.uid(), 'cs_rep'::app_role) AND public.is_assigned_to_client(auth.uid(), id, 'cs_primary'));

CREATE POLICY "clients_cs_rep_pool_read" ON public.clients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'cs_rep'::app_role) AND tier = ANY(ARRAY['standard','premium','vip','internal']::text[]));

CREATE POLICY "clients_finance_read" ON public.clients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "clients_viewer_read" ON public.clients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'viewer'::app_role));

CREATE POLICY "clients_linked_self_read" ON public.clients FOR SELECT TO authenticated
  USING (linked_user_id = auth.uid());

-- Broaden assignment-table reads for staff
DROP POLICY IF EXISTS "Admins and coaches read coach assignments" ON public.paige_coach_assignments;
CREATE POLICY "assignments_staff_read" ON public.paige_coach_assignments FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- claim_client RPC
CREATE OR REPLACE FUNCTION public.claim_client(_client_id uuid)
RETURNS public.paige_coach_assignments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _client_tier text;
  _role app_role;
  _assignment_role text;
  _pool text[];
  _row public.paige_coach_assignments;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;

  IF public.has_role(_uid, 'sales_rep'::app_role) THEN
    _role := 'sales_rep'::app_role;
  ELSIF public.has_role(_uid, 'cs_rep'::app_role) THEN
    _role := 'cs_rep'::app_role;
  ELSE
    RAISE EXCEPTION 'role_not_eligible_to_claim' USING ERRCODE = '42501';
  END IF;

  _assignment_role := public.assignment_role_for(_role);
  _pool := public.tier_pool_for_role(_role);

  SELECT tier INTO _client_tier FROM public.clients WHERE id = _client_id;
  IF _client_tier IS NULL OR NOT (_client_tier = ANY(_pool)) THEN
    RAISE EXCEPTION 'client_not_in_pool' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.paige_coach_assignments
    (contact_id, assigned_role, rep_user_id, active, metadata)
  VALUES
    (_client_id, _assignment_role, _uid, true,
     jsonb_build_object('source','self_claim','claimed_at', now()))
  ON CONFLICT (contact_id, assigned_role) WHERE active = true DO NOTHING
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'claim_race_lost' USING ERRCODE = '40001';
  END IF;

  RETURN _row;
END $$;

REVOKE ALL ON FUNCTION public.claim_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_client(uuid) TO authenticated;

-- unassigned queue scoped to caller's pool
CREATE OR REPLACE FUNCTION public.unassigned_queue_for_caller()
RETURNS SETOF public.paige_unassigned_queue
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _pool text[] := ARRAY[]::text[];
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;

  IF public.has_any_role(_uid, ARRAY['admin','super_admin']::text[]) THEN
    RETURN QUERY SELECT * FROM public.paige_unassigned_queue;
    RETURN;
  END IF;

  IF public.has_role(_uid, 'sales_rep'::app_role) THEN
    _pool := _pool || public.tier_pool_for_role('sales_rep'::app_role);
  END IF;
  IF public.has_role(_uid, 'cs_rep'::app_role) THEN
    _pool := _pool || public.tier_pool_for_role('cs_rep'::app_role);
  END IF;

  IF array_length(_pool, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY SELECT q.* FROM public.paige_unassigned_queue q WHERE q.tier = ANY(_pool);
END $$;

REVOKE ALL ON FUNCTION public.unassigned_queue_for_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unassigned_queue_for_caller() TO authenticated;

-- SLA alert dedupe log
CREATE TABLE IF NOT EXISTS public.paige_sla_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  category text NOT NULL,
  severity text NOT NULL,
  hours_unassigned numeric,
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.paige_sla_alert_log TO service_role;
ALTER TABLE public.paige_sla_alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_log_admins_read" ON public.paige_sla_alert_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']::text[]));
CREATE INDEX IF NOT EXISTS paige_sla_alert_log_client_cat_idx
  ON public.paige_sla_alert_log (client_id, category, severity, sent_at DESC);

-- Assignment policy table
CREATE TABLE IF NOT EXISTS public.paige_assignment_policy (
  tier text PRIMARY KEY,
  strategy text NOT NULL DEFAULT 'manual'
    CHECK (strategy IN ('manual','round_robin','load_balanced')),
  target_role text NOT NULL DEFAULT 'lead_owner'
    CHECK (target_role IN ('lead_owner','cs_primary')),
  eligible_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.paige_assignment_policy TO authenticated;
GRANT ALL ON public.paige_assignment_policy TO service_role;
ALTER TABLE public.paige_assignment_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignment_policy_staff_read" ON public.paige_assignment_policy FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "assignment_policy_admin_write" ON public.paige_assignment_policy FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']::text[]));

INSERT INTO public.paige_assignment_policy(tier, strategy, target_role) VALUES
  ('lead',     'manual', 'lead_owner'),
  ('standard', 'manual', 'lead_owner'),
  ('premium',  'manual', 'cs_primary'),
  ('vip',      'manual', 'cs_primary'),
  ('internal', 'manual', 'cs_primary')
ON CONFLICT (tier) DO NOTHING;

-- Round-robin trigger
CREATE OR REPLACE FUNCTION public.apply_assignment_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _policy public.paige_assignment_policy;
  _chosen uuid;
BEGIN
  IF NEW.tier IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _policy FROM public.paige_assignment_policy WHERE tier = NEW.tier;
  IF NOT FOUND OR _policy.strategy = 'manual'
     OR _policy.eligible_user_ids IS NULL
     OR array_length(_policy.eligible_user_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.paige_coach_assignments
    WHERE contact_id = NEW.id AND assigned_role = _policy.target_role AND active = true
  ) THEN RETURN NEW; END IF;

  SELECT u INTO _chosen
  FROM unnest(_policy.eligible_user_ids) AS u
  LEFT JOIN public.paige_coach_assignments a
    ON a.rep_user_id = u AND a.assigned_role = _policy.target_role AND a.active = true
  GROUP BY u
  ORDER BY count(a.id) ASC, random()
  LIMIT 1;

  IF _chosen IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.paige_coach_assignments
    (contact_id, assigned_role, rep_user_id, active, metadata)
  VALUES
    (NEW.id, _policy.target_role, _chosen, true,
     jsonb_build_object('source', _policy.strategy))
  ON CONFLICT (contact_id, assigned_role) WHERE active = true DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clients_apply_assignment_policy ON public.clients;
CREATE TRIGGER trg_clients_apply_assignment_policy
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.apply_assignment_policy();
