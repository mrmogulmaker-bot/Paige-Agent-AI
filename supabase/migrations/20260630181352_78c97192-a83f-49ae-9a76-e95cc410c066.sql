
-- =============================================================================
-- TIER 2: Tenant-private knowledge docs
-- =============================================================================
CREATE TABLE public.tenant_knowledge_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  summary text,
  category text,
  tags text[] DEFAULT '{}'::text[],
  source text NOT NULL DEFAULT 'paste' CHECK (source IN ('upload','url','paste','sync')),
  source_url text,
  share_to_network boolean NOT NULL DEFAULT false,
  network_review_status text NOT NULL DEFAULT 'none'
    CHECK (network_review_status IN ('none','pending','approved','rejected')),
  network_reviewed_at timestamptz,
  network_reviewed_by uuid,
  promoted_to_canon_id uuid REFERENCES public.knowledge_base(id) ON DELETE SET NULL,
  token_count integer,
  chunk_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tkd_tenant ON public.tenant_knowledge_docs(tenant_id);
CREATE INDEX idx_tkd_share ON public.tenant_knowledge_docs(share_to_network) WHERE share_to_network = true;
CREATE INDEX idx_tkd_review ON public.tenant_knowledge_docs(network_review_status) WHERE network_review_status = 'pending';
CREATE INDEX idx_tkd_tags ON public.tenant_knowledge_docs USING gin(tags);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_knowledge_docs TO authenticated;
GRANT ALL ON public.tenant_knowledge_docs TO service_role;
ALTER TABLE public.tenant_knowledge_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tkd_tenant_read" ON public.tenant_knowledge_docs
  FOR SELECT TO authenticated
  USING (is_platform_owner() OR is_tenant_member(tenant_id));

CREATE POLICY "tkd_tenant_write" ON public.tenant_knowledge_docs
  FOR INSERT TO authenticated
  WITH CHECK (
    (is_platform_owner() OR is_tenant_member(tenant_id))
    AND created_by = auth.uid()
  );

CREATE POLICY "tkd_tenant_update" ON public.tenant_knowledge_docs
  FOR UPDATE TO authenticated
  USING (is_platform_owner() OR is_tenant_member(tenant_id))
  WITH CHECK (is_platform_owner() OR is_tenant_member(tenant_id));

CREATE POLICY "tkd_tenant_delete" ON public.tenant_knowledge_docs
  FOR DELETE TO authenticated
  USING (is_platform_owner() OR is_tenant_member(tenant_id));

CREATE TRIGGER tkd_updated_at BEFORE UPDATE ON public.tenant_knowledge_docs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- TIER 2: Embedded chunks (RAG retrieval)
-- =============================================================================
CREATE TABLE public.tenant_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  doc_id uuid NOT NULL REFERENCES public.tenant_knowledge_docs(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding extensions.vector(3072),
  token_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tkc_tenant ON public.tenant_knowledge_chunks(tenant_id);
CREATE INDEX idx_tkc_doc ON public.tenant_knowledge_chunks(doc_id);
-- Note: HNSW on vector(3072) exceeds the 2000-dim index limit; we rely on
-- post-fetch filtering by tenant_id and a sequential scan within the tenant's
-- chunks (typically small). Add HNSW later if a tenant's corpus grows past ~50k chunks.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_knowledge_chunks TO authenticated;
GRANT ALL ON public.tenant_knowledge_chunks TO service_role;
ALTER TABLE public.tenant_knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tkc_tenant_read" ON public.tenant_knowledge_chunks
  FOR SELECT TO authenticated
  USING (is_platform_owner() OR is_tenant_member(tenant_id));

CREATE POLICY "tkc_tenant_write" ON public.tenant_knowledge_chunks
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_owner() OR is_tenant_member(tenant_id));

CREATE POLICY "tkc_tenant_delete" ON public.tenant_knowledge_chunks
  FOR DELETE TO authenticated
  USING (is_platform_owner() OR is_tenant_member(tenant_id));

-- =============================================================================
-- CENTRAL TELEMETRY: metadata only, NEVER raw query or doc text
-- =============================================================================
CREATE TABLE public.kb_query_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  query_hash text NOT NULL,                 -- sha256 of the query
  query_length integer,
  query_intent_tags text[] DEFAULT '{}'::text[],
  result_count integer NOT NULL DEFAULT 0,
  top_similarity numeric(5,4),
  had_global_match boolean NOT NULL DEFAULT false,
  had_tenant_match boolean NOT NULL DEFAULT false,
  feedback text CHECK (feedback IN ('helpful','not_helpful')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbqt_tenant_date ON public.kb_query_telemetry(tenant_id, created_at DESC);
CREATE INDEX idx_kbqt_intent ON public.kb_query_telemetry USING gin(query_intent_tags);

GRANT SELECT, INSERT ON public.kb_query_telemetry TO authenticated;
GRANT ALL ON public.kb_query_telemetry TO service_role;
ALTER TABLE public.kb_query_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kbqt_tenant_read" ON public.kb_query_telemetry
  FOR SELECT TO authenticated
  USING (is_platform_owner() OR is_tenant_member(tenant_id));

CREATE POLICY "kbqt_insert" ON public.kb_query_telemetry
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IS NULL OR is_platform_owner() OR is_tenant_member(tenant_id));

CREATE TABLE public.kb_coverage_signal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  topic_cluster text NOT NULL,
  doc_count integer NOT NULL DEFAULT 0,
  query_count integer NOT NULL DEFAULT 0,
  unanswered_count integer NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (tenant_id, topic_cluster, date)
);

CREATE INDEX idx_kbcs_tenant_date ON public.kb_coverage_signal(tenant_id, date DESC);

GRANT SELECT, INSERT, UPDATE ON public.kb_coverage_signal TO authenticated;
GRANT ALL ON public.kb_coverage_signal TO service_role;
ALTER TABLE public.kb_coverage_signal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kbcs_tenant_read" ON public.kb_coverage_signal
  FOR SELECT TO authenticated
  USING (is_platform_owner() OR is_tenant_member(tenant_id));

CREATE POLICY "kbcs_platform_write" ON public.kb_coverage_signal
  FOR ALL TO authenticated
  USING (is_platform_owner())
  WITH CHECK (is_platform_owner());

-- =============================================================================
-- Semantic search: tenant chunks + global canon (text fallback for canon)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.match_tenant_knowledge(
  p_tenant_id uuid,
  p_query_embedding extensions.vector(3072),
  p_match_count int DEFAULT 6
)
RETURNS TABLE (
  source_tier text,
  doc_id uuid,
  chunk_id uuid,
  title text,
  content text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT
    'tenant'::text                                AS source_tier,
    c.doc_id                                       AS doc_id,
    c.id                                           AS chunk_id,
    d.title                                        AS title,
    c.content                                      AS content,
    1 - (c.embedding <=> p_query_embedding)::float AS similarity
  FROM public.tenant_knowledge_chunks c
  JOIN public.tenant_knowledge_docs d ON d.id = c.doc_id
  WHERE c.tenant_id = p_tenant_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count
$$;

REVOKE ALL ON FUNCTION public.match_tenant_knowledge(uuid, extensions.vector, int) FROM public;
GRANT EXECUTE ON FUNCTION public.match_tenant_knowledge(uuid, extensions.vector, int) TO authenticated, service_role;

COMMENT ON TABLE public.tenant_knowledge_docs IS 'Tier 2 — per-tenant private KB. RLS isolated. Opt-in share_to_network promotes via admin review to Tier 1 (knowledge_base).';
COMMENT ON TABLE public.kb_query_telemetry IS 'Central telemetry — metadata only. Never store raw query text or document content.';
