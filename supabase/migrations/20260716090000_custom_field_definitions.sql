-- 20260716090000_custom_field_definitions.sql
-- Custom Fields (Task #71/#54) — per-tenant, per-object custom field definitions + per-record
-- values, starting with `clients` (contacts). Closes the confirmed gap where a form's `maps_to`
-- could only ever target a fixed 6-column identity allowlist on `clients`/`businesses` —
-- everything else a tenant wanted to capture (cohort, T-shirt size, program tier…) was a dead
-- letter, surviving only in the raw growth_form_submissions payload, never reaching a real,
-- queryable contact field (§13 — no more silently dropped answers).
--
-- Design notes (house style, matched to growth_forms/growth_form_upsert precedent):
--   * A separate `custom_field_definitions` + `client_custom_field_values` table, NOT a jsonb
--     column bolted onto `clients` — this repo's own `clients` migrations show a consistent
--     "one real column per concept" convention; a values table keeps that clean and lets
--     definitions be added/archived without ever touching the clients table.
--   * `object_type` is present (not hardcoded to `clients`) so a future object (e.g.
--     `businesses`) is a follow-up migration widening one CHECK constraint, not a redesign.
--   * RLS follows the exact idiom this codebase already uses everywhere (growth_forms et al.):
--     `tenant_id = current_user_tenant_id() OR has_role(auth.uid(), 'admin')` — NOT the
--     `is_tenant_member()/is_platform_owner()` pairing, which is Brand-Kit-specific.
--   * Definitions are soft-archived (archived_at), never hard-deleted — a tenant's historical
--     submission/value data is never destroyed out from under them by removing a field.

-- ============================================================
-- 1. custom_field_definitions
-- ============================================================
CREATE TABLE public.custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  object_type text NOT NULL DEFAULT 'clients' CHECK (object_type IN ('clients')),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,49}$'),
  label text NOT NULL CHECK (btrim(label) <> ''),
  field_type text NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'select', 'multiselect')),
  options jsonb,
  help_text text,
  required boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, object_type, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_field_definitions TO authenticated;
GRANT ALL ON public.custom_field_definitions TO service_role;
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_field_definitions_tenant_manage" ON public.custom_field_definitions
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_custom_field_definitions_updated
  BEFORE UPDATE ON public.custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_custom_field_definitions_tenant_object
  ON public.custom_field_definitions (tenant_id, object_type)
  WHERE archived_at IS NULL;

-- ============================================================
-- 2. client_custom_field_values
-- ============================================================
CREATE TABLE public.client_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  field_definition_id uuid NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, field_definition_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_custom_field_values TO authenticated;
GRANT ALL ON public.client_custom_field_values TO service_role;
ALTER TABLE public.client_custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_custom_field_values_tenant_manage" ON public.client_custom_field_values
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_client_custom_field_values_updated
  BEFORE UPDATE ON public.client_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_client_custom_field_values_client ON public.client_custom_field_values (client_id);

-- ============================================================
-- 3. custom_field_definition_upsert — SECURITY DEFINER RPC (house pattern, cf. growth_form_upsert)
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_field_definition_upsert(
  p_tenant_id uuid,
  p_key text,
  p_label text,
  p_field_type text,
  p_options jsonb DEFAULT NULL,
  p_help_text text DEFAULT NULL,
  p_required boolean DEFAULT false,
  p_position integer DEFAULT 0,
  p_id uuid DEFAULT NULL
)
RETURNS public.custom_field_definitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _clean_key text := lower(btrim(COALESCE(p_key, '')));
  _row public.custom_field_definitions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin', 'super_admin']) THEN
      RAISE EXCEPTION 'CUSTOM_FIELDS_FORBIDDEN: admin or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
  ELSE
    _tenant := p_tenant_id;
  END IF;

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF _clean_key !~ '^[a-z][a-z0-9_]{1,49}$' THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_INVALID_KEY: key must be lowercase snake_case, 2-50 chars, starting with a letter' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_label, '')) = '' THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_INVALID_LABEL: label is required' USING ERRCODE = '22023';
  END IF;
  IF p_field_type NOT IN ('text', 'number', 'date', 'boolean', 'select', 'multiselect') THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_INVALID_TYPE: field_type must be text, number, date, boolean, select or multiselect' USING ERRCODE = '22023';
  END IF;
  IF p_field_type IN ('select', 'multiselect')
     AND (p_options IS NULL OR jsonb_typeof(p_options) <> 'array' OR jsonb_array_length(p_options) = 0) THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_MISSING_OPTIONS: select/multiselect fields need at least one option' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.custom_field_definitions SET
      label = btrim(p_label),
      field_type = p_field_type,
      options = CASE WHEN p_field_type IN ('select', 'multiselect') THEN p_options ELSE NULL END,
      help_text = NULLIF(btrim(COALESCE(p_help_text, '')), ''),
      required = COALESCE(p_required, false),
      position = COALESCE(p_position, 0)
    WHERE id = p_id AND tenant_id = _tenant AND object_type = 'clients'
    RETURNING * INTO _row;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'CUSTOM_FIELDS_NOT_FOUND: field not found in this tenant' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.custom_field_definitions (
      tenant_id, object_type, key, label, field_type, options, help_text, required, position, created_by
    ) VALUES (
      _tenant, 'clients', _clean_key, btrim(p_label), p_field_type,
      CASE WHEN p_field_type IN ('select', 'multiselect') THEN p_options ELSE NULL END,
      NULLIF(btrim(COALESCE(p_help_text, '')), ''), COALESCE(p_required, false), COALESCE(p_position, 0), _caller
    )
    RETURNING * INTO _row;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'custom_field_definitions', 'custom_field_definition_upsert', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'key', _row.key, 'field_type', _row.field_type));

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.custom_field_definition_upsert(uuid, text, text, text, jsonb, text, boolean, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.custom_field_definition_upsert(uuid, text, text, text, jsonb, text, boolean, integer, uuid) TO authenticated, service_role;

-- ============================================================
-- 4. custom_field_definition_archive — soft delete
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_field_definition_archive(p_id uuid)
RETURNS public.custom_field_definitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _row public.custom_field_definitions;
BEGIN
  IF NOT public.has_any_role(_caller, ARRAY['admin', 'super_admin']) THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_FORBIDDEN: admin or super_admin required' USING ERRCODE = '42501';
  END IF;
  _tenant := public.current_user_tenant_id();
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.custom_field_definitions
  SET archived_at = now()
  WHERE id = p_id AND tenant_id = _tenant AND archived_at IS NULL
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_NOT_FOUND: field not found or already archived' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'custom_field_definitions', 'custom_field_definition_archive', _row.id, jsonb_build_object('key', _row.key));

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.custom_field_definition_archive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.custom_field_definition_archive(uuid) TO authenticated, service_role;

-- ============================================================
-- 5. client_custom_fields_upsert — bulk value writer, keyed by definition `key` (not id), so
--    callers (the frontend AND growth-process-submission's service-role executor) never need to
--    resolve a definition id first. Unknown/archived keys are silently skipped (never fabricate
--    a column that doesn't exist for this tenant) rather than failing the whole call — one bad
--    key in a batch must not block the rest of a legitimate submission (§13).
-- ============================================================
CREATE OR REPLACE FUNCTION public.client_custom_fields_upsert(
  p_client_id uuid,
  p_tenant_id uuid,
  p_values jsonb
)
RETURNS SETOF public.client_custom_field_values
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _client_tenant uuid;
  _key text;
  _val jsonb;
  _def public.custom_field_definitions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin', 'super_admin', 'coach']) THEN
      RAISE EXCEPTION 'CUSTOM_FIELDS_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
  ELSE
    _tenant := p_tenant_id;
  END IF;

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_values, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_INVALID_VALUES: p_values must be a JSON object of key -> value' USING ERRCODE = '22023';
  END IF;

  SELECT tenant_id INTO _client_tenant FROM public.clients WHERE id = p_client_id;
  IF _client_tenant IS NULL OR _client_tenant <> _tenant THEN
    RAISE EXCEPTION 'CUSTOM_FIELDS_FORBIDDEN: client does not belong to this tenant' USING ERRCODE = '42501';
  END IF;

  FOR _key, _val IN SELECT * FROM jsonb_each(COALESCE(p_values, '{}'::jsonb))
  LOOP
    SELECT * INTO _def FROM public.custom_field_definitions
      WHERE tenant_id = _tenant AND object_type = 'clients' AND key = _key AND archived_at IS NULL;
    CONTINUE WHEN _def.id IS NULL;

    INSERT INTO public.client_custom_field_values (tenant_id, client_id, field_definition_id, value)
    VALUES (_tenant, p_client_id, _def.id, _val)
    ON CONFLICT (client_id, field_definition_id)
    DO UPDATE SET value = EXCLUDED.value;
  END LOOP;

  RETURN QUERY SELECT * FROM public.client_custom_field_values WHERE client_id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.client_custom_fields_upsert(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_custom_fields_upsert(uuid, uuid, jsonb) TO authenticated, service_role;

-- ============================================================
-- 6. Extend the maps_to allowlist on BOTH existing validators to also accept `custom.<key>`.
--    growth_validate_form_schema is the new shared validator (20260715123000); growth_form_upsert
--    still carries its own un-migrated inline copy (that migration's own comment already flags
--    this as a known, tracked duplication) — both must move together or a form saved through one
--    path would accept a custom-field mapping the other path rejects.
-- ============================================================
CREATE OR REPLACE FUNCTION public.growth_validate_form_schema(p_schema jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _schema_ok boolean; _sections jsonb; _section jsonb; _field jsonb;
  _vw jsonb; _cond jsonb; _seen text[] := ARRAY[]::text[];
  _key text; _ftype text; _maps text; _fieldcount int := 0;
BEGIN
  _schema_ok := p_schema IS NOT NULL AND (
       (jsonb_typeof(p_schema) = 'object' AND jsonb_typeof(p_schema->'sections') = 'array')
    OR (jsonb_typeof(p_schema) = 'array'));
  IF NOT _schema_ok THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: schema_json must be {sections:[…]} or an array of sections' USING ERRCODE = '22023';
  END IF;

  _sections := CASE WHEN jsonb_typeof(p_schema) = 'array' THEN p_schema ELSE p_schema->'sections' END;
  IF jsonb_array_length(_sections) > 40 THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: too many sections (max 40)' USING ERRCODE = '22023';
  END IF;

  FOR _section IN SELECT value FROM jsonb_array_elements(_sections) LOOP
    _vw := _section->'visible_when';
    IF jsonb_typeof(_vw) = 'object' THEN
      FOR _cond IN SELECT value FROM jsonb_array_elements(
             (CASE WHEN jsonb_typeof(_vw->'all') = 'array' THEN _vw->'all' ELSE '[]'::jsonb END)
          || (CASE WHEN jsonb_typeof(_vw->'any') = 'array' THEN _vw->'any' ELSE '[]'::jsonb END)) LOOP
        IF _cond->>'field' IS NULL OR NOT (_cond->>'field' = ANY(_seen)) THEN
          RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: a section branches on unknown or later field "%"',
            COALESCE(_cond->>'field', '(null)') USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    IF jsonb_typeof(_section->'fields') <> 'array' THEN
      RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: each section must have a fields array' USING ERRCODE = '22023';
    END IF;

    FOR _field IN SELECT value FROM jsonb_array_elements(_section->'fields') LOOP
      _fieldcount := _fieldcount + 1;
      IF _fieldcount > 200 THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: too many fields (max 200)' USING ERRCODE = '22023';
      END IF;
      _key := NULLIF(btrim(COALESCE(_field->>'key', '')), '');
      IF _key IS NULL THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: every field needs a non-empty key' USING ERRCODE = '22023';
      END IF;
      _vw := _field->'visible_when';
      IF jsonb_typeof(_vw) = 'object' THEN
        FOR _cond IN SELECT value FROM jsonb_array_elements(
               (CASE WHEN jsonb_typeof(_vw->'all') = 'array' THEN _vw->'all' ELSE '[]'::jsonb END)
            || (CASE WHEN jsonb_typeof(_vw->'any') = 'array' THEN _vw->'any' ELSE '[]'::jsonb END)) LOOP
          IF _cond->>'field' IS NULL OR NOT (_cond->>'field' = ANY(_seen)) THEN
            RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" branches on unknown or later field "%"',
              _key, COALESCE(_cond->>'field', '(null)') USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END IF;
      IF _key = ANY(_seen) THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: duplicate field key "%"', _key USING ERRCODE = '22023';
      END IF;
      _ftype := _field->>'type';
      IF _ftype IN ('select','radio','checkbox') THEN
        IF jsonb_typeof(_field->'options') <> 'array' OR jsonb_array_length(_field->'options') = 0 THEN
          RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" (%) needs at least one option', _key, _ftype USING ERRCODE = '22023';
        END IF;
      END IF;
      _maps := NULLIF(btrim(COALESCE(_field->>'maps_to', '')), '');
      IF _maps IS NOT NULL AND _maps !~ '^(clients|businesses)\.[a-z0-9_]+$' AND _maps !~ '^custom\.[a-z][a-z0-9_]{1,49}$' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" maps_to must target clients.<column>, businesses.<column>, or custom.<key>', _key USING ERRCODE = '22023';
      END IF;
      _seen := array_append(_seen, _key);
    END LOOP;
  END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.growth_form_upsert(
  p_tenant_id  uuid,
  p_slug       text,
  p_name       text,
  p_schema_json jsonb,
  p_success_action_json jsonb DEFAULT NULL,
  p_auto_create_contact boolean DEFAULT true,
  p_pipeline_id uuid DEFAULT NULL,
  p_stage_id    uuid DEFAULT NULL,
  p_id          uuid DEFAULT NULL
)
RETURNS public.growth_forms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _slug   text := NULLIF(btrim(p_slug), '');
  _row    public.growth_forms;
  _schema_ok boolean;
  _sections  jsonb;
  _section   jsonb;
  _field     jsonb;
  _vw        jsonb;
  _cond      jsonb;
  _seen      text[] := ARRAY[]::text[];
  _key       text;
  _ftype     text;
  _maps      text;
  _fieldcount int := 0;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'GROWTH_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
  ELSE
    _tenant := p_tenant_id;
  END IF;

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'GROWTH_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF _slug IS NULL THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SLUG: a non-empty slug is required' USING ERRCODE = '22023';
  END IF;

  -- Validate schema shape: an object with a `sections` array, or a bare array of sections.
  _schema_ok := p_schema_json IS NOT NULL AND (
       (jsonb_typeof(p_schema_json) = 'object' AND jsonb_typeof(p_schema_json->'sections') = 'array')
    OR (jsonb_typeof(p_schema_json) = 'array')
  );
  IF NOT _schema_ok THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: schema_json must be {sections:[…]} or an array of sections'
      USING ERRCODE = '22023';
  END IF;

  -- Walk sections→fields (GrowthFormSchema contract). Fields are validated in document
  -- order so a visible_when branch can only reference a field declared before it.
  _sections := CASE WHEN jsonb_typeof(p_schema_json) = 'array'
                    THEN p_schema_json ELSE p_schema_json->'sections' END;
  IF jsonb_array_length(_sections) > 40 THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: too many sections (max 40)' USING ERRCODE = '22023';
  END IF;

  FOR _section IN SELECT value FROM jsonb_array_elements(_sections) LOOP
    -- section-level visible_when may only reference fields from EARLIER sections.
    _vw := _section->'visible_when';
    IF jsonb_typeof(_vw) = 'object' THEN
      FOR _cond IN SELECT value FROM jsonb_array_elements(
             (CASE WHEN jsonb_typeof(_vw->'all') = 'array' THEN _vw->'all' ELSE '[]'::jsonb END)
          || (CASE WHEN jsonb_typeof(_vw->'any') = 'array' THEN _vw->'any' ELSE '[]'::jsonb END)
      ) LOOP
        IF _cond->>'field' IS NULL OR NOT (_cond->>'field' = ANY(_seen)) THEN
          RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: a section branches on unknown or later field "%"',
            COALESCE(_cond->>'field', '(null)') USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    IF jsonb_typeof(_section->'fields') <> 'array' THEN
      RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: each section must have a fields array' USING ERRCODE = '22023';
    END IF;

    FOR _field IN SELECT value FROM jsonb_array_elements(_section->'fields') LOOP
      _fieldcount := _fieldcount + 1;
      IF _fieldcount > 200 THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: too many fields (max 200)' USING ERRCODE = '22023';
      END IF;

      _key := NULLIF(btrim(COALESCE(_field->>'key', '')), '');
      IF _key IS NULL THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: every field needs a non-empty key' USING ERRCODE = '22023';
      END IF;

      -- field-level visible_when must reference an EARLIER key (checked before this key is
      -- appended to _seen, so a field can never branch on itself or a later field).
      _vw := _field->'visible_when';
      IF jsonb_typeof(_vw) = 'object' THEN
        FOR _cond IN SELECT value FROM jsonb_array_elements(
               (CASE WHEN jsonb_typeof(_vw->'all') = 'array' THEN _vw->'all' ELSE '[]'::jsonb END)
            || (CASE WHEN jsonb_typeof(_vw->'any') = 'array' THEN _vw->'any' ELSE '[]'::jsonb END)
        ) LOOP
          IF _cond->>'field' IS NULL OR NOT (_cond->>'field' = ANY(_seen)) THEN
            RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" branches on unknown or later field "%"',
              _key, COALESCE(_cond->>'field', '(null)') USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END IF;

      IF _key = ANY(_seen) THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: duplicate field key "%"', _key USING ERRCODE = '22023';
      END IF;

      -- choice fields require at least one option.
      _ftype := _field->>'type';
      IF _ftype IN ('select','radio','checkbox') THEN
        IF jsonb_typeof(_field->'options') <> 'array'
           OR jsonb_array_length(_field->'options') = 0 THEN
          RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" (%) needs at least one option',
            _key, _ftype USING ERRCODE = '22023';
        END IF;
      END IF;

      -- maps_to allowlist: clients.<column>, businesses.<column>, or custom.<key>.
      _maps := NULLIF(btrim(COALESCE(_field->>'maps_to', '')), '');
      IF _maps IS NOT NULL
         AND _maps !~ '^(clients|businesses)\.[a-z0-9_]+$'
         AND _maps !~ '^custom\.[a-z][a-z0-9_]{1,49}$' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" maps_to must target clients.<column>, businesses.<column>, or custom.<key>',
          _key USING ERRCODE = '22023';
      END IF;

      _seen := array_append(_seen, _key);
    END LOOP;
  END LOOP;

  IF p_id IS NOT NULL THEN
    UPDATE public.growth_forms SET
      slug                = _slug,
      name                = COALESCE(NULLIF(btrim(p_name), ''), name),
      schema_json         = p_schema_json,
      success_action_json = COALESCE(p_success_action_json, success_action_json),
      auto_create_contact = COALESCE(p_auto_create_contact, auto_create_contact),
      pipeline_id         = COALESCE(p_pipeline_id, pipeline_id),
      stage_id            = COALESCE(p_stage_id, stage_id)
    WHERE id = p_id AND tenant_id = _tenant
    RETURNING * INTO _row;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'GROWTH_NOT_FOUND: form not found in this tenant' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.growth_forms (
      tenant_id, slug, name, status, schema_json, success_action_json,
      auto_create_contact, pipeline_id, stage_id, created_by
    ) VALUES (
      _tenant, _slug, COALESCE(NULLIF(btrim(p_name), ''), 'Lead form'), 'active',
      p_schema_json,
      COALESCE(p_success_action_json,
               '{"type":"thank_you","message":"Thanks — we''ll be in touch."}'::jsonb),
      COALESCE(p_auto_create_contact, true), p_pipeline_id, p_stage_id, _caller
    )
    ON CONFLICT (tenant_id, slug) DO UPDATE SET
      name                = COALESCE(NULLIF(btrim(EXCLUDED.name), ''), public.growth_forms.name),
      schema_json         = EXCLUDED.schema_json,
      success_action_json = COALESCE(EXCLUDED.success_action_json, public.growth_forms.success_action_json),
      auto_create_contact = EXCLUDED.auto_create_contact,
      pipeline_id         = COALESCE(EXCLUDED.pipeline_id, public.growth_forms.pipeline_id),
      stage_id            = COALESCE(EXCLUDED.stage_id, public.growth_forms.stage_id)
    RETURNING * INTO _row;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'growth_forms', 'growth_form_upsert', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'slug', _row.slug));

  RETURN _row;
END;
$$;
