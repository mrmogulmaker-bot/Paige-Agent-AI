-- Doctrine §120 Phase A: align clients.lifecycle_stage to Doctrine §111 canonical enum.
-- Canonical source for this acute fix: Doctrine §111 lifecycle taxonomy used by update_lifecycle_stage MCP.

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_lifecycle_stage_chk;

UPDATE public.clients
SET lifecycle_stage = CASE lifecycle_stage
  WHEN 'lead' THEN 'new_lead'
  WHEN 'mql' THEN 'qualified'
  WHEN 'sql' THEN 'hot_lead'
  WHEN 'opportunity' THEN 'negotiating'
  WHEN 'customer' THEN 'client_active'
  WHEN 'evangelist' THEN 'client_alumni'
  WHEN 'churned' THEN 'client_churned'
  WHEN 'archived' THEN 'client_alumni'
  ELSE lifecycle_stage
END
WHERE lifecycle_stage IN ('lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist', 'churned', 'archived');

ALTER TABLE public.clients
  ALTER COLUMN lifecycle_stage SET DEFAULT 'new_lead';

ALTER TABLE public.clients
  ADD CONSTRAINT clients_lifecycle_stage_chk
  CHECK (lifecycle_stage = ANY (ARRAY[
    'new_lead'::text,
    'qualified'::text,
    'nurturing'::text,
    'hot_lead'::text,
    'negotiating'::text,
    'won'::text,
    'client_active'::text,
    'client_paused'::text,
    'client_churned'::text,
    'client_funded'::text,
    'client_alumni'::text
  ]));

COMMENT ON CONSTRAINT clients_lifecycle_stage_chk ON public.clients IS
  'Doctrine §120: mirrors Doctrine §111 lifecycle taxonomy used by MCP create_contact/update_lifecycle_stage and application enums.';