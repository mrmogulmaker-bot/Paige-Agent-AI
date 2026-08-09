-- Wave 4 · Slice 4a.2 — L8 Memory Fabric substrate: paige_owner_memory
-- (CLAUDE.md §7 memory is the moat · §8 Owner-Ops team memory · §9/§51 tenant isolation ·
--  §26 ONE voyage-3 @ 1024 embedding space · §34 Paige owns her intelligence end-to-end)
--
-- WHY A NEW TABLE (§18 extend-vs-new, resolved out loud in the PR):
--   The platform already has THREE distinct memory homes, and none of them is the durable,
--   (tenant_id, user_id)-scoped Owner-Ops chat memory this slice needs:
--     • client_memory (+ chat_message_embeddings, RPC match_paige_memory) — the §8 CLIENT-
--       EXPERIENCE team's memory, keyed by the CONSUMER (client_user_id) and RLS-scoped via
--       coach_clients. Different AUDIENCE (§9): bolting operator/staff memory onto it would
--       conflate the two teams and break its consumer/coach RLS model.
--     • paige_prompt_memory (RPC match_prompt_memory) — §26 GENERATION-DNA memory (prompt_text /
--       artifact_url / template_name / modality / tenant_rating). Different CAPABILITY, tenant-
--       scoped only (no user axis). Storing conversational facts here would pollute its schema
--       and collide with match_prompt_memory's artifact-shaped return — the §18 "two capabilities,
--       one confused home" anti-pattern.
--     • paige_chat_threads.summary / summary_through_seq — the PER-THREAD rolling compaction
--       summary. Lives WITH the thread; not cross-thread durable memory.
--   The genuinely missing capability is: durable, cross-session, (tenant_id, user_id)-scoped
--   Owner-Ops memory (facts + summaries) for the operator/staff Paige chat — the Owner-Ops
--   sibling of client_memory. This table is that ONE home. It reuses the SAME canonical voyage-3
--   @ 1024 space (tagged + CHECK-enforced), the SAME ivfflat cosine pattern, and the SAME
--   SECURITY DEFINER match-RPC pattern as match_paige_memory — it is NOT a rival vector space
--   or a second embedder (§26/§17 structural gate holds).
--
--   NOTE for the integrator/owner (§13): docs/doctrine/L8-memory-fabric-workstream.md line 53
--   said "cross-chat memory → EXTEND paige_prompt_memory, do NOT stand up a second memory table."
--   That line assumed cross-chat memory == "retrieve past successful GENERATIONS." It does not fit
--   "Paige remembers what the operator told her" — paige_prompt_memory has no user axis and its
--   columns are generation-artifact-shaped. This slice therefore adds ONE Owner-Ops table (NOT the
--   3 tables the plan hypothesized), reusing the one embedding space. Flagged for owner ratification.
--
-- Idempotent; ADDITIVE only. The vector type lives in the extensions schema (pgvector 0.8.0).

CREATE TABLE IF NOT EXISTS public.paige_owner_memory (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,                 -- the operator/staff user this memory belongs to
                                                    -- (no FK to auth.users, mirroring created_by; RLS pins it)
  memory_type       text NOT NULL,                 -- open vocab (§10 config-as-data): 'fact' | 'summary'
                                                    -- | 'preference' | 'session_summary' | 'insight' | ...
  content           text NOT NULL,
  source_thread_id  uuid,                           -- soft link to paige_chat_threads.id (no hard FK)
  is_active         boolean NOT NULL DEFAULT true,  -- soft-delete / supersede
  embedding         extensions.vector(1024),        -- voyage-3 @ 1024; NULLABLE (a fact may be stored
                                                     -- before it is embedded; semantic recall skips NULLs)
  embedding_model   text NOT NULL DEFAULT 'voyage-3',
  embedding_dim     integer NOT NULL DEFAULT 1024,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- extras — NEVER a secret
  created_by        uuid,                           -- actor stamp; NULL for the service/system seam
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- §26 structural gate: any EMBEDDED row must live in the ONE canonical space. A NULL embedding is
  -- allowed (un-embedded fact); a non-NULL embedding is pinned to voyage-3 @ 1024 so the space can
  -- never silently mix incomparable vectors.
  CONSTRAINT paige_owner_memory_space_chk
    CHECK (embedding IS NULL OR (embedding_model = 'voyage-3' AND embedding_dim = 1024))
);

-- Recent-memory pull: (tenant, user) scoped, active-first, newest-first.
CREATE INDEX IF NOT EXISTS paige_owner_memory_scope_idx
  ON public.paige_owner_memory (tenant_id, user_id, is_active, created_at DESC);

-- ivfflat cosine index for semantic retrieval. Opclass schema-qualified (extensions) so it builds
-- regardless of the migration search_path; lists=100 matches the sibling embedding indexes.
CREATE INDEX IF NOT EXISTS paige_owner_memory_embedding_idx
  ON public.paige_owner_memory
  USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE public.paige_owner_memory IS
  'L8 Memory Fabric — durable cross-session Owner-Ops Paige-chat memory, scoped to (tenant_id, user_id). The §8 Owner-Ops sibling of client_memory (Client-Experience). One voyage-3 @ 1024 space (§26). NOT platform/God memory; not consumer memory (that is client_memory).';

ALTER TABLE public.paige_owner_memory ENABLE ROW LEVEL SECURITY;

-- ── RLS (§9/§51) — own user, own tenant, and nothing else. ──────────────────────────────────────
-- Tier roll-up (agency aggregate view across sub-accounts, opt-in per #218) is a LATER slice; the
-- substrate stays strictly own-user own-tenant so there is no over-exposure to tighten back later.

DROP POLICY IF EXISTS paige_owner_memory_own_read ON public.paige_owner_memory;
CREATE POLICY paige_owner_memory_own_read ON public.paige_owner_memory
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS paige_owner_memory_own_insert ON public.paige_owner_memory;
CREATE POLICY paige_owner_memory_own_insert ON public.paige_owner_memory
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS paige_owner_memory_own_update ON public.paige_owner_memory
;
CREATE POLICY paige_owner_memory_own_update ON public.paige_owner_memory
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND user_id = auth.uid())
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND user_id = auth.uid());

-- Service-role seam: Paige's headless agent (paige-ai-chat / pillars) writes memory it has already
-- resolved the (tenant_id, user_id) for, server-side (§9 — never from a request body).
DROP POLICY IF EXISTS paige_owner_memory_service ON public.paige_owner_memory;
CREATE POLICY paige_owner_memory_service ON public.paige_owner_memory
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- No anon. No authenticated DELETE (soft-delete via is_active). Grants match the policies.
GRANT SELECT, INSERT, UPDATE ON public.paige_owner_memory TO authenticated;
GRANT ALL ON public.paige_owner_memory TO service_role;

-- ── Retrieval RPC — semantic recall, (tenant,user)-scoped, IDOR-guarded (§9/§39/§45). ───────────
-- Mirrors match_paige_memory: SECURITY DEFINER for the vector scan, but a JWT caller may ONLY query
-- for THEIR OWN (auth.uid(), current_user_tenant_id()) — the passed args are re-checked against the
-- caller's real identity, so the definer cannot be turned into a cross-tenant read (the §45 lesson).
-- A service_role caller passes the (tenant,user) it already resolved server-side.
CREATE OR REPLACE FUNCTION public.match_paige_owner_memory(
  _query_embedding vector,
  _tenant_id       uuid,
  _user_id         uuid,
  _match_threshold double precision DEFAULT 0.7,
  _match_count     integer DEFAULT 8
)
RETURNS TABLE(id uuid, memory_type text, content text, similarity double precision, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
-- 'extensions' is required so the pgvector <=> operator (installed in the extensions schema,
-- matching the extensions.vector(1024) column) resolves inside this fixed search_path.
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- §9 authorization: a JWT caller is confined to their own tenant + own user; service_role trusts
  -- the server-resolved args it passes. Anything else is refused — no cross-tenant/user reads.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS DISTINCT FROM _user_id
       OR _tenant_id IS DISTINCT FROM public.current_user_tenant_id() THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  RETURN QUERY
  SELECT m.id, m.memory_type, m.content,
         1 - (m.embedding <=> _query_embedding) AS similarity,
         m.created_at
  FROM public.paige_owner_memory m
  WHERE m.is_active = true
    AND m.embedding IS NOT NULL
    AND m.tenant_id = _tenant_id
    AND m.user_id = _user_id
    AND 1 - (m.embedding <=> _query_embedding) >= _match_threshold
  ORDER BY m.embedding <=> _query_embedding
  LIMIT _match_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.match_paige_owner_memory(vector, uuid, uuid, double precision, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.match_paige_owner_memory(vector, uuid, uuid, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_paige_owner_memory(vector, uuid, uuid, double precision, integer) TO service_role;

-- keep updated_at honest on UPDATE (mirrors client_memory maintenance)
CREATE OR REPLACE FUNCTION public.tg_paige_owner_memory_touch()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_paige_owner_memory_touch ON public.paige_owner_memory;
CREATE TRIGGER trg_paige_owner_memory_touch
  BEFORE UPDATE ON public.paige_owner_memory
  FOR EACH ROW EXECUTE FUNCTION public.tg_paige_owner_memory_touch();
