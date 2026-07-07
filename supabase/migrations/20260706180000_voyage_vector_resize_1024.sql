-- SPRINT P.S.M — R5: resize embedding vectors 1536/3072 -> 1024 for Voyage voyage-3.
-- All RAG/memory tables are empty on BYO (clean rebuild), so no re-embedding is needed.
-- Drop ivfflat cosine indexes, resize columns, recreate indexes at the new dimension.

DROP INDEX IF EXISTS public.chat_message_embeddings_vec_idx;
DROP INDEX IF EXISTS public.client_memory_embedding_idx;
DROP INDEX IF EXISTS public.rag_documents_embedding_idx;

ALTER TABLE public.chat_message_embeddings ALTER COLUMN embedding      TYPE vector(1024) USING NULL::vector(1024);
ALTER TABLE public.client_memory           ALTER COLUMN embedding      TYPE vector(1024) USING NULL::vector(1024);
ALTER TABLE public.rag_documents           ALTER COLUMN embedding      TYPE vector(1024) USING NULL::vector(1024);
ALTER TABLE public.rag_retrieval_log       ALTER COLUMN query_embedding TYPE vector(1024) USING NULL::vector(1024);
ALTER TABLE public.tenant_knowledge_chunks ALTER COLUMN embedding      TYPE vector(1024) USING NULL::vector(1024);

CREATE INDEX chat_message_embeddings_vec_idx ON public.chat_message_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');
CREATE INDEX client_memory_embedding_idx     ON public.client_memory           USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');
CREATE INDEX rag_documents_embedding_idx      ON public.rag_documents           USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');
