-- Compound AI System — tag the existing embedding spaces with their model + dimension (CLAUDE.md §26).
--
-- Every stored embedding on the platform is now the ONE canonical space — voyage-3 @ 1024 dims
-- (_shared/voyage.ts; the R5 resize migration 20260706180000 already sized these columns to 1024).
-- These tag columns make that fact explicit and auditable per-row, so a future model change can be
-- detected and back-filled instead of silently mixing incomparable vectors into one index.
--
-- FAST-DEFAULT + REVERSIBLE: NOT NULL DEFAULT on a new column is a metadata-only change in modern
-- Postgres (no table rewrite), and the reverse is a plain DROP COLUMN — additive and safe. These are
-- the four embedding tables named in the decision; rag_retrieval_log holds a transient query vector
-- (a log, not a stored space) and is intentionally left alone.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). ADDITIVE only.

ALTER TABLE public.chat_message_embeddings
  ADD COLUMN IF NOT EXISTS embedding_model text    NOT NULL DEFAULT 'voyage-3',
  ADD COLUMN IF NOT EXISTS embedding_dim   integer NOT NULL DEFAULT 1024;

ALTER TABLE public.client_memory
  ADD COLUMN IF NOT EXISTS embedding_model text    NOT NULL DEFAULT 'voyage-3',
  ADD COLUMN IF NOT EXISTS embedding_dim   integer NOT NULL DEFAULT 1024;

ALTER TABLE public.rag_documents
  ADD COLUMN IF NOT EXISTS embedding_model text    NOT NULL DEFAULT 'voyage-3',
  ADD COLUMN IF NOT EXISTS embedding_dim   integer NOT NULL DEFAULT 1024;

ALTER TABLE public.tenant_knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_model text    NOT NULL DEFAULT 'voyage-3',
  ADD COLUMN IF NOT EXISTS embedding_dim   integer NOT NULL DEFAULT 1024;
