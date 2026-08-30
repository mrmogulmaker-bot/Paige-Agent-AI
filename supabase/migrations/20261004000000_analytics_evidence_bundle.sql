-- Analytics Phase 1: one tenant-safe, read-only evidence bundle and opaque reference.
--
-- This contract intentionally supports ONE metric only:
--   sales_funnel.created_deals_by_current_stage@1.0.0
--
-- It reuses the canonical tenant-owned deals / pipelines / pipeline_stages records.
-- It is not a metric warehouse, Context Rail, Action Bus, Trust authority, memory
-- store, recommendation engine, or PAIGE workspace. The registry stores reference
-- lifecycle and a source-revision digest only; it never stores metric values.

BEGIN;

CREATE TABLE public.analytics_evidence_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  issued_to uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_id text NOT NULL CHECK (metric_id = 'sales_funnel.created_deals_by_current_stage'),
  range_key text NOT NULL CHECK (range_key IN ('last_30_days', 'current_quarter', 'year_to_date')),
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  source_revision_ref text NOT NULL CHECK (source_revision_ref ~ '^sr_v1_[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (range_start < range_end),
  CHECK (expires_at > issued_at)
);

CREATE INDEX analytics_evidence_reference_actor_idx
  ON public.analytics_evidence_reference (issued_to, tenant_id, metric_id, expires_at DESC);
CREATE INDEX analytics_evidence_reference_expiry_idx
  ON public.analytics_evidence_reference (expires_at);

ALTER TABLE public.analytics_evidence_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_evidence_reference FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.analytics_evidence_reference
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.analytics_sales_funnel_evidence_bundle(
  p_tenant_id uuid,
  p_range_key text,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_queried_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _pipeline_id uuid;
  _pipeline_label text;
  _default_pipeline_count bigint;
  _stage_definition_count bigint := 0;
  _candidate_count bigint := 0;
  _contributing_count bigint := 0;
  _non_default_count bigint := 0;
  _unsafe_stage_count bigint := 0;
  _unavailable_source_count bigint := 0;
  _excluded_count bigint := 0;
  _source_updated_through timestamptz;
  _stage_updated_through timestamptz;
  _pipeline_updated_through timestamptz;
  _stages jsonb := '[]'::jsonb;
  _truth_state text;
  _coverage_state text;
  _source_revision_ref text;
  _account_epoch_ref text;
BEGIN
  SELECT count(*)
    INTO _default_pipeline_count
    FROM public.pipelines p
   WHERE p.tenant_id = p_tenant_id
     AND p.is_default = true;

  IF _default_pipeline_count = 1 THEN
    SELECT p.id, left(regexp_replace(p.name, '[[:cntrl:]]', '', 'g'), 80), p.updated_at
      INTO _pipeline_id, _pipeline_label, _pipeline_updated_through
      FROM public.pipelines p
     WHERE p.tenant_id = p_tenant_id
       AND p.is_default = true
     LIMIT 1;
  END IF;

  SELECT count(*), max(d.updated_at)
    INTO _candidate_count, _source_updated_through
    FROM public.deals d
   WHERE d.tenant_id = p_tenant_id
     AND d.created_at >= p_range_start
     AND d.created_at < p_range_end;

  IF _default_pipeline_count = 1 THEN
    SELECT count(*), max(ps.updated_at)
      INTO _stage_definition_count, _stage_updated_through
      FROM public.pipeline_stages ps
     WHERE ps.tenant_id = p_tenant_id
       AND ps.pipeline_id = _pipeline_id;

    SELECT
      count(*) FILTER (
        WHERE d.pipeline_id = _pipeline_id
          AND ps.id IS NOT NULL
          AND ps.tenant_id = p_tenant_id
          AND ps.pipeline_id = _pipeline_id
      ),
      count(*) FILTER (WHERE d.pipeline_id <> _pipeline_id),
      count(*) FILTER (
        WHERE d.pipeline_id = _pipeline_id
          AND (ps.id IS NULL OR ps.tenant_id IS DISTINCT FROM p_tenant_id OR ps.pipeline_id IS DISTINCT FROM _pipeline_id)
      )
      INTO _contributing_count, _non_default_count, _unsafe_stage_count
      FROM public.deals d
      LEFT JOIN public.pipeline_stages ps ON ps.id = d.stage_id
     WHERE d.tenant_id = p_tenant_id
       AND d.created_at >= p_range_start
       AND d.created_at < p_range_end;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'stage_key', 'stage_' || ordered.stage_number::text,
      'label', ordered.safe_label,
      'stage_type', ordered.stage_type,
      'order', ordered.order_index,
      'count', ordered.deal_count
    ) ORDER BY ordered.order_index, ordered.safe_label), '[]'::jsonb)
      INTO _stages
      FROM (
        SELECT
          row_number() OVER (ORDER BY ps.order_index, ps.label, ps.id) AS stage_number,
          left(regexp_replace(ps.label, '[[:cntrl:]]', '', 'g'), 80) AS safe_label,
          ps.stage_type,
          ps.order_index,
          count(d.id)::bigint AS deal_count
        FROM public.pipeline_stages ps
        LEFT JOIN public.deals d
          ON d.stage_id = ps.id
         AND d.pipeline_id = _pipeline_id
         AND d.tenant_id = p_tenant_id
         AND d.created_at >= p_range_start
         AND d.created_at < p_range_end
        WHERE ps.tenant_id = p_tenant_id
          AND ps.pipeline_id = _pipeline_id
        GROUP BY ps.id, ps.label, ps.stage_type, ps.order_index
      ) ordered;
  END IF;

  _unavailable_source_count := CASE WHEN _default_pipeline_count <> 1 THEN _candidate_count ELSE 0 END;
  _excluded_count := _non_default_count + _unsafe_stage_count + _unavailable_source_count;
  _truth_state := CASE
    WHEN _default_pipeline_count <> 1 OR _stage_definition_count = 0 THEN 'UNAVAILABLE'
    WHEN _excluded_count > 0 THEN 'PARTIAL'
    ELSE 'LIVE'
  END;
  _coverage_state := CASE _truth_state
    WHEN 'LIVE' THEN 'complete'
    WHEN 'PARTIAL' THEN 'partial'
    ELSE 'unavailable'
  END;

  _account_epoch_ref := 'ae_v1_' || encode(
    extensions.digest(convert_to(p_tenant_id::text, 'UTF8'), 'sha256'),
    'hex'
  );
  _source_revision_ref := 'sr_v1_' || encode(
    extensions.digest(convert_to(concat_ws('|',
      p_tenant_id::text,
      COALESCE(_pipeline_id::text, ''),
      p_range_start::text,
      p_range_end::text,
      _default_pipeline_count::text,
      _stage_definition_count::text,
      _candidate_count::text,
      _contributing_count::text,
      _excluded_count::text,
      COALESCE(_source_updated_through::text, ''),
      COALESCE(_stage_updated_through::text, ''),
      COALESCE(_pipeline_updated_through::text, '')
    ), 'UTF8'), 'sha256'),
    'hex'
  );

  RETURN jsonb_build_object(
    'metric', jsonb_build_object(
      'id', 'sales_funnel.created_deals_by_current_stage',
      'label', 'Deals created by current stage',
      'definition', 'Count of deal records created in the exact range within the active tenant, grouped by each record''s current stage in the tenant''s unique default pipeline.',
      'formula', 'count(deals.id) where tenant=active account and created_at >= range.start and created_at < range.end and pipeline=unique tenant default; group by current tenant-scoped stage',
      'version', '1.0.0'
    ),
    'range', jsonb_build_object(
      'key', p_range_key,
      'start', p_range_start,
      'end', p_range_end
    ),
    'source_references', jsonb_build_array(
      jsonb_build_object('source', 'public.deals', 'boundary', 'active tenant; created_at in exact half-open range; unique tenant default pipeline'),
      jsonb_build_object('source', 'public.pipelines', 'boundary', 'active tenant; exactly one tenant-owned default pipeline at queried time'),
      jsonb_build_object('source', 'public.pipeline_stages', 'boundary', 'active tenant; same default pipeline; current stage at queried time')
    ),
    'contributing_record_count', _contributing_count,
    'coverage', jsonb_build_object(
      'state', _coverage_state,
      'candidate_count', _candidate_count,
      'contributing_count', _contributing_count,
      'excluded_count', _excluded_count,
      'default_pipeline_count', _default_pipeline_count,
      'stage_definition_count', _stage_definition_count
    ),
    'exclusions', jsonb_build_array(
      jsonb_build_object('reason', 'a unique tenant-owned default pipeline is unavailable', 'count', _unavailable_source_count),
      jsonb_build_object('reason', 'deal belongs to a non-default pipeline', 'count', _non_default_count),
      jsonb_build_object('reason', 'deal stage is missing, unscoped, or belongs to another pipeline/account', 'count', _unsafe_stage_count)
    ),
    'freshness', jsonb_build_object(
      'queried_at', p_queried_at,
      'source_updated_through', _source_updated_through,
      'stage_definitions_updated_through', _stage_updated_through,
      'pipeline_updated_through', _pipeline_updated_through
    ),
    'truth_state', _truth_state,
    'account_epoch_ref', _account_epoch_ref,
    'source_revision_ref', _source_revision_ref,
    'values', jsonb_build_object(
      'kind', 'sales_funnel_stages',
      'pipeline_label', CASE WHEN _default_pipeline_count = 1 THEN _pipeline_label ELSE NULL END,
      'stages', CASE WHEN _truth_state = 'UNAVAILABLE' THEN '[]'::jsonb ELSE _stages END
    ),
    'caveats', jsonb_build_array(
      'Stage counts use each deal record''s current stage at queried time; they are not historical stage-entry counts.',
      'Counts are records, not revenue, conversion, attribution, benchmark, or outcome claims.',
      'Saved views and range controls cannot change this formula or suppress exclusions.'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_analytics_evidence_reference(
  p_evidence_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _active_tenant_id uuid := public.current_user_tenant_id();
  _reference public.analytics_evidence_reference%ROWTYPE;
  _bundle jsonb;
BEGIN
  IF _actor_id IS NULL
     OR _active_tenant_id IS NULL
     OR p_evidence_ref IS NULL
     OR p_evidence_ref !~ '^aneb_v1_[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ANALYTICS_EVIDENCE_UNAVAILABLE';
  END IF;

  SELECT ref.* INTO _reference
    FROM public.analytics_evidence_reference ref
   WHERE ref.issued_to = _actor_id
     AND ref.tenant_id = _active_tenant_id
     AND ref.revoked_at IS NULL
     AND ref.expires_at > clock_timestamp()
     AND ref.token_digest = encode(
       extensions.digest(convert_to(p_evidence_ref, 'UTF8'), 'sha256'),
       'hex'
     )
   LIMIT 1;

  IF NOT FOUND
     OR NOT (public.is_tenant_admin(_active_tenant_id) OR public.is_platform_owner())
     OR NOT EXISTS (
       SELECT 1 FROM public.tenants t
        WHERE t.id = _active_tenant_id
          AND t.status::text IN ('trial', 'active', 'past_due')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ANALYTICS_EVIDENCE_UNAVAILABLE';
  END IF;

  _bundle := public.analytics_sales_funnel_evidence_bundle(
    _reference.tenant_id,
    _reference.range_key,
    _reference.range_start,
    _reference.range_end,
    _reference.issued_at
  );

  IF _bundle->>'source_revision_ref' IS DISTINCT FROM _reference.source_revision_ref THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ANALYTICS_EVIDENCE_UNAVAILABLE';
  END IF;

  RETURN _bundle || jsonb_build_object('reference_expires_at', _reference.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_analytics_evidence_bundle(
  p_metric_id text,
  p_range_key text,
  p_account_epoch uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _active_tenant_id uuid := public.current_user_tenant_id();
  _issued_at timestamptz := clock_timestamp();
  _range_start timestamptz;
  _range_end timestamptz := _issued_at;
  _evidence_ref text;
  _bundle jsonb;
BEGIN
  IF _actor_id IS NULL
     OR _active_tenant_id IS NULL
     OR p_account_epoch IS NULL
     OR p_account_epoch IS DISTINCT FROM _active_tenant_id
     OR p_metric_id IS DISTINCT FROM 'sales_funnel.created_deals_by_current_stage'
     OR p_range_key IS NULL
     OR p_range_key NOT IN ('last_30_days', 'current_quarter', 'year_to_date')
     OR NOT (public.is_tenant_admin(_active_tenant_id) OR public.is_platform_owner())
     OR NOT EXISTS (
       SELECT 1 FROM public.tenants t
        WHERE t.id = _active_tenant_id
          AND t.status::text IN ('trial', 'active', 'past_due')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ANALYTICS_EVIDENCE_UNAVAILABLE';
  END IF;

  _range_start := CASE p_range_key
    WHEN 'last_30_days' THEN _range_end - interval '30 days'
    WHEN 'current_quarter' THEN date_trunc('quarter', _range_end AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    WHEN 'year_to_date' THEN date_trunc('year', _range_end AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  END;

  _bundle := public.analytics_sales_funnel_evidence_bundle(
    _active_tenant_id,
    p_range_key,
    _range_start,
    _range_end,
    _issued_at
  );

  PERFORM pg_advisory_xact_lock(hashtextextended(
    _actor_id::text || ':' || _active_tenant_id::text || ':' || p_metric_id || ':' || p_range_key,
    0
  ));

  DELETE FROM public.analytics_evidence_reference ref
   WHERE ref.issued_to = _actor_id
     AND ref.tenant_id = _active_tenant_id
     AND ref.expires_at < _issued_at - interval '24 hours';

  UPDATE public.analytics_evidence_reference ref
     SET revoked_at = _issued_at
   WHERE ref.issued_to = _actor_id
     AND ref.tenant_id = _active_tenant_id
     AND ref.metric_id = p_metric_id
     AND ref.range_key = p_range_key
     AND ref.revoked_at IS NULL;

  _evidence_ref := 'aneb_v1_' || encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.analytics_evidence_reference (
    token_digest, issued_to, tenant_id, metric_id, range_key,
    range_start, range_end, source_revision_ref, issued_at, expires_at
  ) VALUES (
    encode(extensions.digest(convert_to(_evidence_ref, 'UTF8'), 'sha256'), 'hex'),
    _actor_id,
    _active_tenant_id,
    p_metric_id,
    p_range_key,
    _range_start,
    _range_end,
    _bundle->>'source_revision_ref',
    _issued_at,
    _issued_at + interval '15 minutes'
  );

  -- Resolve through the public read seam before returning. VOLATILE is required:
  -- the resolver must see the reference inserted earlier in this statement.
  _bundle := public.resolve_analytics_evidence_reference(_evidence_ref);

  RETURN jsonb_build_object('evidence_ref', _evidence_ref, 'bundle', _bundle);
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_sales_funnel_evidence_bundle(uuid, text, timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.issue_analytics_evidence_bundle(text, text, uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.resolve_analytics_evidence_reference(text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.issue_analytics_evidence_bundle(text, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_analytics_evidence_reference(text)
  TO authenticated;

COMMENT ON TABLE public.analytics_evidence_reference IS
  'Ephemeral Analytics reference registry. Stores only actor/account binding, metric/range identity, source-revision digest, and lifecycle timestamps; never metric values, raw events, prompts, recommendations, actions, or outcomes.';
COMMENT ON FUNCTION public.issue_analytics_evidence_bundle(text, text, uuid) IS
  'Issues one actor/account-bound Analytics Evidence Bundle plus a 15-minute opaque reference after server-side account epoch, role, lifecycle, range, coverage, and source validation. Read-only against business sources.';
COMMENT ON FUNCTION public.resolve_analytics_evidence_reference(text) IS
  'Resolves an opaque Analytics reference to the same presentation-safe bundle only while actor, active account, role, expiry, and source revision remain valid. Performs no business write or action.';

COMMIT;
