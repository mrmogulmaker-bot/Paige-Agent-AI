-- tenant_knowledge_chunks.embedding was resized from vector(3072) to
-- vector(1024) in 20260706180000 (Voyage voyage-3), but no vector index was
-- (re)built for it — the original 3072-dim column couldn't be indexed
-- (ivfflat/HNSW cap at 2000 dims). At 1024 dims an ivfflat cosine index is now
-- feasible, so tenant KB retrieval (match_tenant_knowledge) scales past a
-- per-tenant sequential scan as libraries grow.
CREATE INDEX IF NOT EXISTS tenant_knowledge_chunks_embedding_idx
  ON public.tenant_knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ANALYZE public.tenant_knowledge_chunks;
