-- 20260719130001_match_prompt_memory.sql
-- Studio #343 (U3) — Phase B cross-session recall. Additive, idempotent.
--
-- WHY THIS EXISTS: recallSimilar() in _shared/prompt-forge.ts needs a vector top-N query over
-- public.paige_prompt_memory, which PostgREST cannot express directly. This adds a single read-only
-- SQL function that returns the tenant's most-similar prior approved artifacts (few-shot anchors),
-- mirroring the existing match_tenant_knowledge precedent.
--
-- §9 tenant isolation: the function takes an EXPLICIT p_tenant_id and filters on it; it is NOT
-- SECURITY DEFINER, so a caller only ever sees rows the paige_prompt_memory RLS already lets them
-- read (the tenant_read policy). The trusted edge caller (service role, RLS-exempt) passes the
-- resolved tenant_id; an authenticated caller is additionally constrained by RLS. §17: comparisons
-- happen only within the one voyage-3 @ 1024 space (embedding_dim guard).
-- Reverse with: DROP FUNCTION public.match_prompt_memory(uuid, extensions.vector(1024), int);

CREATE OR REPLACE FUNCTION public.match_prompt_memory(
  p_tenant_id        uuid,
  p_query_embedding  extensions.vector(1024),
  p_match_count      int DEFAULT 3
)
RETURNS TABLE (
  prompt_text  text,
  artifact_url text,
  user_intent  text,
  similarity   float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.prompt_text,
    m.artifact_url,
    m.user_intent,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM public.paige_prompt_memory m
  WHERE m.tenant_id = p_tenant_id
    AND m.embedding_dim = 1024          -- §17: never mix incomparable vectors
    AND m.artifact_url IS NOT NULL      -- anchors must be real, produced artifacts (§13)
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 10));
$$;

GRANT EXECUTE ON FUNCTION public.match_prompt_memory(uuid, extensions.vector(1024), int)
  TO authenticated, service_role;
