-- Paige-authored pipelines (#102) + §2 compliance fix.
--
-- (A) §2/§9 BLOCKER: the shipped default pipeline was funding-branded
--     ('Funding Deals' / 'Default sales pipeline for funding opportunities.') —
--     that ships to EVERY tenant, a platform-default finance violation. Reseed it
--     to coaching-generic. Guarded so a tenant who already renamed it is untouched.
--
-- (B) The callable pipeline seam (§10) so Paige AND the UI create pipelines through
--     ONE validated path instead of the raw React inserts in PipelineSettings.tsx.
--     Dual-caller: a service-role caller (Paige, auth.uid() IS NULL) is trusted
--     because the paige-ai-chat tool branch already role-gates admin|coach and
--     passes a resolved tenant_id; a JWT caller must be platform owner or tenant
--     admin. tenant_id is stamped explicitly on the pipeline AND every stage
--     (service-role bypasses the stamp trigger), and the default flag is cleared
--     tenant-scoped (fixes a cross-tenant default-clobber).

-- (A) Generic default -------------------------------------------------------
UPDATE public.pipelines
   SET name = 'Sales Pipeline',
       description = 'Default pipeline for tracking new business.'
 WHERE is_default = true
   AND name = 'Funding Deals'
   AND description = 'Default sales pipeline for funding opportunities.';

-- (B) create_pipeline_with_stages ------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pipeline_with_stages(
  _tenant_id  uuid,
  _name       text,
  _stages     jsonb   DEFAULT '[]'::jsonb,
  _description text    DEFAULT NULL,
  _color      text    DEFAULT '#CFAE70',
  _is_default boolean DEFAULT false,
  _created_by uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(_tenant_id, public.current_user_tenant_id());
  _pid uuid;
  _stage jsonb;
  _idx int := 0;
  _default_stages jsonb := '[
    {"label":"Lead","color":"#94a3b8","probability":10,"stage_type":"open"},
    {"label":"Qualified","color":"#3b82f6","probability":25,"stage_type":"open"},
    {"label":"Proposal","color":"#8b5cf6","probability":50,"stage_type":"open"},
    {"label":"Won","color":"#10b981","probability":100,"stage_type":"won"},
    {"label":"Lost","color":"#ef4444","probability":0,"stage_type":"lost"}
  ]'::jsonb;
BEGIN
  -- JWT callers must be platform owner or tenant admin; a NULL caller is the
  -- trusted service-role path (Paige), already role-gated before it gets here.
  IF _caller IS NOT NULL AND NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant)) THEN
    RAISE EXCEPTION 'PIPELINE_FORBIDDEN: admin privileges required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'PIPELINE_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(_name), '') = '' THEN
    RAISE EXCEPTION 'PIPELINE_NAME_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF _stages IS NULL OR jsonb_typeof(_stages) <> 'array' OR jsonb_array_length(_stages) = 0 THEN
    _stages := _default_stages;
  END IF;

  -- Tenant-scoped default clear (never touches another tenant's default).
  IF _is_default THEN
    UPDATE public.pipelines SET is_default = false, updated_at = now()
     WHERE tenant_id = _tenant AND is_default = true;
  END IF;

  INSERT INTO public.pipelines (name, description, color, is_default, created_by, tenant_id)
  VALUES (btrim(_name), _description, COALESCE(_color, '#CFAE70'), _is_default, _created_by, _tenant)
  RETURNING id INTO _pid;

  FOR _stage IN SELECT * FROM jsonb_array_elements(_stages)
  LOOP
    _idx := _idx + 1;
    INSERT INTO public.pipeline_stages
      (pipeline_id, label, color, order_index, probability, stage_type, tenant_id)
    VALUES (
      _pid,
      COALESCE(NULLIF(btrim(_stage->>'label'), ''), 'Stage ' || _idx),
      COALESCE(NULLIF(_stage->>'color', ''), '#94a3b8'),
      COALESCE((_stage->>'order_index')::int, _idx),
      LEAST(100, GREATEST(0, COALESCE((_stage->>'probability')::numeric, 0))),
      CASE WHEN _stage->>'stage_type' IN ('open','won','lost') THEN _stage->>'stage_type' ELSE 'open' END,
      _tenant
    );
  END LOOP;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'pipeline', 'create_pipeline_with_stages', _pid,
          jsonb_build_object('tenant_id', _tenant, 'name', _name, 'stage_count', jsonb_array_length(_stages)));

  RETURN _pid;
END;
$$;

REVOKE ALL   ON FUNCTION public.create_pipeline_with_stages(uuid, text, jsonb, text, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pipeline_with_stages(uuid, text, jsonb, text, text, boolean, uuid) TO authenticated, service_role;

-- add_pipeline_stage --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_pipeline_stage(
  _pipeline_id uuid,
  _label       text,
  _color       text    DEFAULT '#94a3b8',
  _probability numeric DEFAULT 0,
  _stage_type  text    DEFAULT 'open',
  _order_index int     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _pos int;
  _sid uuid;
BEGIN
  SELECT tenant_id INTO _tenant FROM public.pipelines WHERE id = _pipeline_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'PIPELINE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF _caller IS NOT NULL AND NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant)) THEN
    RAISE EXCEPTION 'PIPELINE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  _pos := COALESCE(_order_index,
    (SELECT COALESCE(MAX(order_index), 0) + 1 FROM public.pipeline_stages WHERE pipeline_id = _pipeline_id));

  INSERT INTO public.pipeline_stages
    (pipeline_id, label, color, order_index, probability, stage_type, tenant_id)
  VALUES (_pipeline_id, COALESCE(NULLIF(btrim(_label), ''), 'Stage'),
          COALESCE(_color, '#94a3b8'), _pos,
          LEAST(100, GREATEST(0, COALESCE(_probability, 0))),
          CASE WHEN _stage_type IN ('open','won','lost') THEN _stage_type ELSE 'open' END,
          _tenant)
  RETURNING id INTO _sid;
  RETURN _sid;
END;
$$;

REVOKE ALL   ON FUNCTION public.add_pipeline_stage(uuid, text, text, numeric, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_pipeline_stage(uuid, text, text, numeric, text, int) TO authenticated, service_role;

-- reorder_pipeline_stages ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_pipeline_stages(
  _pipeline_id uuid,
  _ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _i int;
BEGIN
  SELECT tenant_id INTO _tenant FROM public.pipelines WHERE id = _pipeline_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'PIPELINE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF _caller IS NOT NULL AND NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant)) THEN
    RAISE EXCEPTION 'PIPELINE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  FOR _i IN 1 .. array_length(_ordered_ids, 1) LOOP
    UPDATE public.pipeline_stages SET order_index = _i, updated_at = now()
     WHERE id = _ordered_ids[_i] AND pipeline_id = _pipeline_id;
  END LOOP;
END;
$$;

REVOKE ALL   ON FUNCTION public.reorder_pipeline_stages(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_pipeline_stages(uuid, uuid[]) TO authenticated, service_role;

-- delete_pipeline (cascades stages via FK) ----------------------------------
CREATE OR REPLACE FUNCTION public.delete_pipeline(_pipeline_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _is_default boolean;
BEGIN
  SELECT tenant_id, is_default INTO _tenant, _is_default FROM public.pipelines WHERE id = _pipeline_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'PIPELINE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF _caller IS NOT NULL AND NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant)) THEN
    RAISE EXCEPTION 'PIPELINE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _is_default THEN
    RAISE EXCEPTION 'PIPELINE_IS_DEFAULT: set another pipeline as default first' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.pipelines WHERE id = _pipeline_id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'pipeline', 'delete_pipeline', _pipeline_id, jsonb_build_object('tenant_id', _tenant));
END;
$$;

REVOKE ALL   ON FUNCTION public.delete_pipeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_pipeline(uuid) TO authenticated, service_role;
