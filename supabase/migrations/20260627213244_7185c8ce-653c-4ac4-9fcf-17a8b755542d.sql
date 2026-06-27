
-- 1) Extend rag_documents document_type whitelist to allow financial brief types
ALTER TABLE public.rag_documents
  DROP CONSTRAINT IF EXISTS rag_documents_document_type_check;

ALTER TABLE public.rag_documents
  ADD CONSTRAINT rag_documents_document_type_check CHECK (document_type = ANY (ARRAY[
    'outcome_case','coaching_insight','credit_strategy','funding_success',
    'denial_pattern','market_intelligence','pme_framework',
    'business_credit_snapshot','owner_credit_snapshot','banking_snapshot',
    'cash_flow_snapshot','client_financial_brief'
  ]));

-- Index for fast dedupe by source row
CREATE INDEX IF NOT EXISTS rag_documents_source_row_idx
  ON public.rag_documents ((metadata->>'source_table'), (metadata->>'source_row_id'));

-- 2) Harden match_rag_documents so financial briefs are gated to admin/coach/owner
CREATE OR REPLACE FUNCTION public.match_rag_documents(
  _query_embedding extensions.vector,
  _match_threshold numeric DEFAULT 0.75,
  _match_count integer DEFAULT 3,
  _document_types text[] DEFAULT NULL::text[],
  _metadata_filter jsonb DEFAULT NULL::jsonb,
  _query_text text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, document_type text, title text, summary text, content text, metadata jsonb, similarity double precision, quality_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ids uuid[];
  _is_staff boolean := false;
  _caller uuid := auth.uid();
  _financial_types text[] := ARRAY[
    'business_credit_snapshot','owner_credit_snapshot','banking_snapshot',
    'cash_flow_snapshot','client_financial_brief'
  ];
BEGIN
  IF _caller IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _caller IS NOT NULL THEN
    _is_staff := public.has_role(_caller, 'admin'::public.app_role)
              OR public.has_role(_caller, 'coach'::public.app_role);
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      d.id, d.document_type, d.title, d.summary, d.content, d.metadata,
      1 - (d.embedding <=> _query_embedding) AS similarity,
      d.quality_score
    FROM public.rag_documents d
    WHERE d.is_published = true
      AND d.embedding IS NOT NULL
      AND (_document_types IS NULL OR d.document_type = ANY (_document_types))
      AND (_metadata_filter IS NULL OR d.metadata @> _metadata_filter)
      AND 1 - (d.embedding <=> _query_embedding) >= _match_threshold
      AND (
        NOT (d.document_type = ANY (_financial_types))
        OR auth.role() = 'service_role'
        OR _is_staff
        OR (d.client_id IS NOT NULL AND d.client_id = _caller)
      )
    ORDER BY d.embedding <=> _query_embedding
    LIMIT GREATEST(_match_count, 1)
  )
  SELECT * FROM ranked;

  SELECT COALESCE(array_agg(r.id), ARRAY[]::uuid[]) INTO _ids
  FROM (
    SELECT d.id
    FROM public.rag_documents d
    WHERE d.is_published = true
      AND d.embedding IS NOT NULL
      AND (_document_types IS NULL OR d.document_type = ANY (_document_types))
      AND (_metadata_filter IS NULL OR d.metadata @> _metadata_filter)
      AND 1 - (d.embedding <=> _query_embedding) >= _match_threshold
      AND (
        NOT (d.document_type = ANY (_financial_types))
        OR auth.role() = 'service_role'
        OR _is_staff
        OR (d.client_id IS NOT NULL AND d.client_id = _caller)
      )
    ORDER BY d.embedding <=> _query_embedding
    LIMIT GREATEST(_match_count, 1)
  ) d;

  IF array_length(_ids, 1) IS NOT NULL THEN
    UPDATE public.rag_documents
       SET usage_count = usage_count + 1,
           updated_at = now()
     WHERE id = ANY (_ids);
  END IF;

  BEGIN
    INSERT INTO public.rag_retrieval_log (
      user_id, query_embedding, query_text, retrieved_document_ids
    ) VALUES (
      _caller, _query_embedding, _query_text, COALESCE(_ids, ARRAY[]::uuid[])
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

-- 3) Generic trigger function that pings embed-client-financials
CREATE OR REPLACE FUNCTION public.notify_embed_client_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _service_key text;
  _contact_id uuid;
  _row_id uuid;
BEGIN
  SELECT value INTO _service_key
  FROM public._internal_secrets
  WHERE key = 'service_role_key' LIMIT 1;

  IF _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  _row_id := NEW.id;
  IF TG_TABLE_NAME = 'paige_bank_transactions' THEN
    SELECT contact_id INTO _contact_id
    FROM public.paige_bank_connections
    WHERE id = NEW.bank_connection_id;
  ELSE
    _contact_id := NEW.contact_id;
  END IF;

  IF _contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/embed-client-financials',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'source_table', TG_TABLE_NAME,
      'source_row_id', _row_id,
      'contact_id', _contact_id
    )::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_embed_client_financials failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- 4) Triggers on the 5 financial tables
DROP TRIGGER IF EXISTS trg_embed_pbcp ON public.paige_business_credit_profiles;
CREATE TRIGGER trg_embed_pbcp
  AFTER INSERT OR UPDATE ON public.paige_business_credit_profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_embed_client_financials();

DROP TRIGGER IF EXISTS trg_embed_pocs ON public.paige_owner_credit_snapshots;
CREATE TRIGGER trg_embed_pocs
  AFTER INSERT ON public.paige_owner_credit_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.notify_embed_client_financials();

DROP TRIGGER IF EXISTS trg_embed_pbc ON public.paige_bank_connections;
CREATE TRIGGER trg_embed_pbc
  AFTER INSERT OR UPDATE ON public.paige_bank_connections
  FOR EACH ROW EXECUTE FUNCTION public.notify_embed_client_financials();

DROP TRIGGER IF EXISTS trg_embed_pcfs ON public.paige_cash_flow_snapshots;
CREATE TRIGGER trg_embed_pcfs
  AFTER INSERT ON public.paige_cash_flow_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.notify_embed_client_financials();

-- Skip per-transaction firing (too noisy); rely on nightly rebuild + connection updates instead.

-- 5) Nightly composite-brief rebuild cron (3am UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('rebuild-client-financial-brief-nightly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'rebuild-client-financial-brief-nightly',
  '0 3 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/rebuild-client-financial-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public._internal_secrets WHERE key = 'service_role_key' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'cron', 'time', now())
  ) AS request_id;
  $cron$
);
