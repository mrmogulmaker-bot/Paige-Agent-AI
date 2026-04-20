-- =====================================================================
-- RAG Knowledge Base
-- =====================================================================

-- Ensure pgvector exists (it already does, but be defensive).
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------
-- rag_documents
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rag_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type   TEXT NOT NULL CHECK (document_type IN (
                    'outcome_case',
                    'coaching_insight',
                    'credit_strategy',
                    'funding_success',
                    'denial_pattern',
                    'market_intelligence',
                    'pme_framework'
                  )),
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  summary         TEXT,
  embedding       vector(1536),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  source          TEXT NOT NULL DEFAULT 'system_generated' CHECK (source IN (
                    'client_conversation',
                    'admin_entry',
                    'outcome_report',
                    'system_generated'
                  )),
  client_id       UUID NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  is_anonymized   BOOLEAN NOT NULL DEFAULT false,
  is_published    BOOLEAN NOT NULL DEFAULT true,
  quality_score   NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (quality_score BETWEEN 0 AND 1),
  usage_count     INTEGER NOT NULL DEFAULT 0,
  helpful_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rag_documents_type_idx
  ON public.rag_documents (document_type);

CREATE INDEX IF NOT EXISTS rag_documents_published_idx
  ON public.rag_documents (is_published)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS rag_documents_quality_idx
  ON public.rag_documents (quality_score DESC);

CREATE INDEX IF NOT EXISTS rag_documents_metadata_idx
  ON public.rag_documents
  USING gin (metadata);

CREATE INDEX IF NOT EXISTS rag_documents_embedding_idx
  ON public.rag_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read PUBLISHED documents.
DROP POLICY IF EXISTS "Anyone authenticated can read published RAG docs" ON public.rag_documents;
CREATE POLICY "Anyone authenticated can read published RAG docs"
  ON public.rag_documents
  FOR SELECT
  TO authenticated
  USING (is_published = true);

-- Admins can read everything.
DROP POLICY IF EXISTS "Admins can read all RAG docs" ON public.rag_documents;
CREATE POLICY "Admins can read all RAG docs"
  ON public.rag_documents
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admins can insert / update / delete. Service role bypasses RLS automatically.
DROP POLICY IF EXISTS "Admins can insert RAG docs" ON public.rag_documents;
CREATE POLICY "Admins can insert RAG docs"
  ON public.rag_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update RAG docs" ON public.rag_documents;
CREATE POLICY "Admins can update RAG docs"
  ON public.rag_documents
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete RAG docs" ON public.rag_documents;
CREATE POLICY "Admins can delete RAG docs"
  ON public.rag_documents
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at trigger
DROP TRIGGER IF EXISTS rag_documents_set_updated_at ON public.rag_documents;
CREATE TRIGGER rag_documents_set_updated_at
  BEFORE UPDATE ON public.rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- rag_retrieval_log
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rag_retrieval_log (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  query_embedding        vector(1536),
  query_text             TEXT,
  retrieved_document_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  was_helpful            BOOLEAN NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rag_retrieval_log_user_idx
  ON public.rag_retrieval_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rag_retrieval_log_helpful_idx
  ON public.rag_retrieval_log (was_helpful)
  WHERE was_helpful IS NOT NULL;

ALTER TABLE public.rag_retrieval_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can write their own retrieval log" ON public.rag_retrieval_log;
CREATE POLICY "Users can write their own retrieval log"
  ON public.rag_retrieval_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow the most recent entry's was_helpful to be updated by the writer (the heuristic
-- runs on the next user turn). We restrict to the same user_id.
DROP POLICY IF EXISTS "Users can update their own retrieval log" ON public.rag_retrieval_log;
CREATE POLICY "Users can update their own retrieval log"
  ON public.rag_retrieval_log
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read retrieval log" ON public.rag_retrieval_log;
CREATE POLICY "Admins can read retrieval log"
  ON public.rag_retrieval_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------------------
-- match_rag_documents RPC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_rag_documents(
  _query_embedding vector(1536),
  _match_threshold numeric DEFAULT 0.75,
  _match_count     integer DEFAULT 3,
  _document_types  text[]  DEFAULT NULL,
  _metadata_filter jsonb   DEFAULT NULL,
  _query_text      text    DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  document_type text,
  title         text,
  summary       text,
  content       text,
  metadata      jsonb,
  similarity    double precision,
  quality_score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ids uuid[];
BEGIN
  -- Anyone signed in (or service role) can call this. We only ever return PUBLISHED rows.
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      d.id,
      d.document_type,
      d.title,
      d.summary,
      d.content,
      d.metadata,
      1 - (d.embedding <=> _query_embedding) AS similarity,
      d.quality_score
    FROM public.rag_documents d
    WHERE d.is_published = true
      AND d.embedding IS NOT NULL
      AND (_document_types IS NULL OR d.document_type = ANY (_document_types))
      AND (_metadata_filter IS NULL OR d.metadata @> _metadata_filter)
      AND 1 - (d.embedding <=> _query_embedding) >= _match_threshold
    ORDER BY d.embedding <=> _query_embedding
    LIMIT GREATEST(_match_count, 1)
  )
  SELECT * FROM ranked;

  -- Capture the IDs we returned so we can update counters + log.
  SELECT COALESCE(array_agg(r.id), ARRAY[]::uuid[]) INTO _ids
  FROM (
    SELECT d.id
    FROM public.rag_documents d
    WHERE d.is_published = true
      AND d.embedding IS NOT NULL
      AND (_document_types IS NULL OR d.document_type = ANY (_document_types))
      AND (_metadata_filter IS NULL OR d.metadata @> _metadata_filter)
      AND 1 - (d.embedding <=> _query_embedding) >= _match_threshold
    ORDER BY d.embedding <=> _query_embedding
    LIMIT GREATEST(_match_count, 1)
  ) d;

  IF array_length(_ids, 1) IS NOT NULL THEN
    UPDATE public.rag_documents
       SET usage_count = usage_count + 1,
           updated_at = now()
     WHERE id = ANY (_ids);
  END IF;

  -- Best-effort log; never block retrieval if the user_id is missing.
  BEGIN
    INSERT INTO public.rag_retrieval_log (
      user_id, query_embedding, query_text, retrieved_document_ids
    ) VALUES (
      auth.uid(), _query_embedding, _query_text, COALESCE(_ids, ARRAY[]::uuid[])
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_rag_documents(vector, numeric, integer, text[], jsonb, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Quality auto-tuning job (called by a weekly cron / manual admin trigger)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rag_recalibrate_quality()
RETURNS TABLE (
  flagged_low      integer,
  boosted_high     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _flagged integer := 0;
  _boosted integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Boost consistently helpful docs (>=10 retrievals, >=70% helpful).
  WITH boosted AS (
    UPDATE public.rag_documents
       SET quality_score = LEAST(quality_score + 0.05, 1.0),
           updated_at = now()
     WHERE usage_count >= 10
       AND (helpful_count::numeric / NULLIF(usage_count,0)) >= 0.7
     RETURNING 1
  )
  SELECT count(*) INTO _boosted FROM boosted;

  -- Flag low-helpfulness docs (>=10 retrievals, <30% helpful) for admin review.
  WITH flagged AS (
    UPDATE public.rag_documents
       SET metadata = jsonb_set(
                        COALESCE(metadata, '{}'::jsonb),
                        '{flagged_low_helpfulness}',
                        'true'::jsonb,
                        true
                      ),
           updated_at = now()
     WHERE usage_count >= 10
       AND (helpful_count::numeric / NULLIF(usage_count,0)) < 0.3
       AND COALESCE(metadata->>'flagged_low_helpfulness','false') <> 'true'
     RETURNING 1
  )
  SELECT count(*) INTO _flagged FROM flagged;

  RETURN QUERY SELECT _flagged, _boosted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rag_recalibrate_quality() TO authenticated, service_role;