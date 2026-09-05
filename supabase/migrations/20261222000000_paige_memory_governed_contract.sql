-- Recovery lane · Release C — the governed backend contract for Paige MEMORY (continuity).
--
-- (CLAUDE.md §7 memory is the moat · §8 Owner-Ops vs Client-Experience audiences · §9/§51 tenant
--  isolation · §10 callable seam · §18 ONE home, extend don't fork · §59 in-body caller scope ·
--  §13 honest · §32 provable · connections-rail-contract §0 "do not build a parallel memory store")
--
-- WHAT THIS IS, AND WHAT IT IS NOT.
--   Rail records ACTIVITY. Spine supplies safe CURRENT evidence. Mind is curated usable KNOWLEDGE.
--   MEMORY is Paige's CONTINUITY — durable owner-confirmed facts, decisions, commitments, corrections,
--   preferences, and scoped agent outcomes/lessons. These are four distinct concepts; this migration
--   does NOT merge them into one unbounded store, and it adds NO new table and NO Command Center tab.
--
-- WHY NO NEW TABLE (§18, verified 2026-09-05 against current main):
--   The four memory AUDIENCES already have homes, or extend one:
--     • WORKSPACE memory  → public.paige_owner_memory (this table; (tenant_id,user_id)-scoped,
--                            operator rows tenant-less). Governance already complete.
--     • CLIENT memory     → public.client_memory (Client-Experience team; tenant derived via
--                            clients.tenant_id RESTRICTIVE). Governance already complete. NOT touched here.
--     • CONVERSATION memory → paige_owner_memory, via the memory_type vocab below
--                            ('decision' | 'commitment' | 'correction'). NEVER raw transcript — the
--                            per-thread rolling summary stays in paige_chat_threads.summary.
--     • AGENT memory      → paige_owner_memory, via ('agent_outcome' | 'agent_lesson'). Scoped task
--                            outcomes + lessons ONLY — never hidden reasoning or an unrestricted scratchpad.
--   paige_owner_memory.memory_type is OPEN VOCAB by design (§10 config-as-data — no CHECK), so the two
--   homeless types need NO schema change. What is genuinely missing is a GOVERNED, callable seam that
--   stamps every one of the six governance fields the contract requires and enforces caller scope
--   IN-BODY (§59) — not a raw INSERT a UI hand-builds.
--
-- THE SIX GOVERNANCE FIELDS, and where each is realized (per the task's contract):
--   source      → source_thread_id (soft link to the originating thread) + created_by (the actor).
--   scope       → tenant_id + user_id, SERVER-RESOLVED here (current_user_tenant_id()/auth.uid()),
--                 NEVER from a JWT caller's arguments (§9/§59). Operator memory is tenant-less (NULL).
--   timestamp   → created_at / updated_at (the table default + tg_paige_owner_memory_touch trigger).
--   visibility  → the table's own RLS (own-user own-tenant, or platform-owner) + memory_type as the
--                 audience marker; these DEFINER seams read/write only the caller's own scope.
--   correction  → record_paige_memory(p_supersede_prior) marks prior active rows of the same
--                 (scope, type) is_active=false, so the newest fact wins without deleting history.
--   deletion    → forget_paige_memory soft-deletes (is_active=false), scoped to the caller's OWN
--                 (user, tenant) — a service_role caller passes both and cannot wildcard tenants.
-- PLUS a confidence/confirmation field (Relationship Context contract Layer 2): record_paige_memory
--   stamps metadata.confirmation_state ∈ {proposed,confirmed,corrected,retired}, defaulting to
--   'proposed' so an inference is never stored as canonical truth; get_paige_memory returns metadata
--   so a reader can see it. created_by is NULL for the service/system seam (never the subject uid).
--
-- SCOPE / caller model — mirrors match_paige_owner_memory (§45): a JWT caller is CONFINED to
-- auth.uid() + current_user_tenant_id() and its p_user_id/p_tenant_id arguments are IGNORED; a
-- service_role caller (Paige's headless agent, which resolved scope server-side) passes them. Both
-- paths write/read only ONE (tenant,user). SECURITY DEFINER with a pinned search_path; anon revoked.
--
-- HONEST, DEFERRED (§13 — not claimed as delivered here):
--   • The chat-runtime AUTO-WRITE of conversation/agent memory (slice 4b) is NOT wired; this ships the
--     callable seam it will use. A capable caller (Paige's MCP agent) can drive it today.
--   • match_paige_memory (the CLIENT-memory recall RPC) carries a §59 global-role trap (latent —
--     callers pass authorized ids). It is a DIFFERENT table/audience and is filed as a follow-up, not
--     folded into this release (it would touch a live retrieval RPC with its own §37 producer set).
--   • GDPR bulk hard-delete via process-data-deletion is a follow-up; self-serve forget ships here.
--
-- Idempotent; ADDITIVE only (CREATE OR REPLACE functions; no table/column/policy change).

-- ── record_paige_memory — the governed WRITE seam (§10). ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_paige_memory(
  p_memory_type        text,
  p_content            text,
  p_source_thread_id   uuid    DEFAULT NULL,
  p_metadata           jsonb   DEFAULT '{}'::jsonb,
  p_supersede_prior    boolean DEFAULT false,
  p_confirmation_state text    DEFAULT 'proposed', -- governance field: proposed|confirmed|corrected|retired
  p_user_id            uuid    DEFAULT NULL,   -- honored ONLY for service_role (server-resolved)
  p_tenant_id          uuid    DEFAULT NULL    -- honored ONLY for service_role (server-resolved)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service boolean := auth.role() = 'service_role';
  v_uid        uuid;
  v_tenant     uuid;
  v_created_by uuid;
  v_metadata   jsonb;
  v_new_id     uuid;
BEGIN
  -- Caller scope, resolved in-body — never trusted from a JWT caller's arguments (§59/§9).
  IF v_is_service THEN
    v_uid := p_user_id;
    v_tenant := p_tenant_id;                 -- the trusted server already resolved these
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'PAIGE_MEMORY_SERVICE_USER_REQUIRED' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'PAIGE_MEMORY_UNAUTHENTICATED' USING ERRCODE = '42501';  -- fail closed
    END IF;
    -- p_user_id / p_tenant_id are IGNORED for a JWT caller. Scope is the caller's own.
    v_tenant := public.current_user_tenant_id();
    IF v_tenant IS NULL AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'PAIGE_MEMORY_NO_WORKSPACE' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Actor attribution (source field): a JWT caller IS the human actor; a service/system write has
  -- NO human actor, so created_by is NULL — the convention paige_owner_memory.created_by documents
  -- ("actor stamp; NULL for the service/system seam", 20260810120000). Never stamp the subject uid.
  v_created_by := CASE WHEN v_is_service THEN NULL ELSE v_uid END;

  -- Governed vocab (§10) — the four memory audiences, enumerated as the contract. An unknown type
  -- is refused so this seam cannot become a raw event dump.
  IF p_memory_type IS NULL OR btrim(p_memory_type) = '' THEN
    RAISE EXCEPTION 'PAIGE_MEMORY_TYPE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_memory_type NOT IN (
    -- workspace memory (owner-confirmed business facts, goals, operating preferences, strategy)
    'fact','preference','active_priority','permission_note','known_context',
    'goal','operating_preference','strategic_context',
    -- conversation memory (durable decisions/commitments/corrections — NEVER raw transcript)
    'decision','commitment','correction',
    -- agent memory (scoped task outcomes + lessons — NEVER hidden reasoning)
    'agent_outcome','agent_lesson',
    -- general kinds the table ALREADY carries (kept so the seam is a strict superset, not a fork):
    -- summary/session_summary/insight, and 'identity' (the §52 operator-briefing type seeded in
    -- 20260816120000 and read by _shared/owner-context.ts) — omitting it would make the governed
    -- seam unable to record or supersede a type the platform already stores (peer-gate, §39).
    'summary','session_summary','insight','identity'
  ) THEN
    RAISE EXCEPTION 'PAIGE_MEMORY_TYPE_UNKNOWN: %', p_memory_type USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'PAIGE_MEMORY_CONTENT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Confirmation state (the governance field that keeps an inference from masquerading as truth,
  -- per the Relationship Context & Governed Memory contract Layer 2): a memory is 'proposed' by
  -- default and only 'confirmed' through an explicit path. The validated argument is authoritative
  -- and is merged LAST so it wins over any confirmation_state a caller also put in p_metadata.
  IF p_confirmation_state IS NULL
     OR p_confirmation_state NOT IN ('proposed','confirmed','corrected','retired') THEN
    RAISE EXCEPTION 'PAIGE_MEMORY_CONFIRMATION_STATE_INVALID: %', p_confirmation_state
      USING ERRCODE = '22023';
  END IF;
  v_metadata := COALESCE(p_metadata, '{}'::jsonb)
                || jsonb_build_object('confirmation_state', p_confirmation_state);

  -- Correction path: supersede prior active rows of the same (scope, type). IS NOT DISTINCT FROM so
  -- a tenant-less operator's rows match on NULL (the '=' trap match_paige_owner_memory documents).
  IF p_supersede_prior THEN
    UPDATE public.paige_owner_memory
       SET is_active = false
     WHERE user_id = v_uid
       AND memory_type = p_memory_type
       AND is_active = true
       AND tenant_id IS NOT DISTINCT FROM v_tenant;
  END IF;

  INSERT INTO public.paige_owner_memory
    (tenant_id, user_id, memory_type, content, source_thread_id, metadata, created_by)
  VALUES
    (v_tenant, v_uid, p_memory_type, p_content, p_source_thread_id, v_metadata, v_created_by)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_paige_memory(text,text,uuid,jsonb,boolean,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_paige_memory(text,text,uuid,jsonb,boolean,text,uuid,uuid) TO authenticated, service_role;

-- ── get_paige_memory — the governed READ seam (server-resolved scope + audience filter). ─────────
CREATE OR REPLACE FUNCTION public.get_paige_memory(
  p_memory_types text[] DEFAULT NULL,   -- optional audience/kind filter; NULL = all active
  p_limit        integer DEFAULT 50,
  p_user_id      uuid    DEFAULT NULL,   -- honored ONLY for service_role
  p_tenant_id    uuid    DEFAULT NULL    -- honored ONLY for service_role
)
RETURNS TABLE(id uuid, memory_type text, content text, source_thread_id uuid, metadata jsonb, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service boolean := auth.role() = 'service_role';
  v_uid    uuid;
  v_tenant uuid;
BEGIN
  IF v_is_service THEN
    v_uid := p_user_id;
    v_tenant := p_tenant_id;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'PAIGE_MEMORY_SERVICE_USER_REQUIRED' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'PAIGE_MEMORY_UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;
    v_tenant := public.current_user_tenant_id();
    IF v_tenant IS NULL AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'PAIGE_MEMORY_NO_WORKSPACE' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT m.id, m.memory_type, m.content, m.source_thread_id, m.metadata, m.created_at, m.updated_at
  FROM public.paige_owner_memory m
  WHERE m.is_active = true
    AND m.user_id = v_uid
    AND m.tenant_id IS NOT DISTINCT FROM v_tenant
    AND (p_memory_types IS NULL OR m.memory_type = ANY(p_memory_types))
  ORDER BY m.created_at DESC
  LIMIT GREATEST(1, LEAST(200, COALESCE(p_limit, 50)));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_paige_memory(text[],integer,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paige_memory(text[],integer,uuid,uuid) TO authenticated, service_role;

-- ── forget_paige_memory — the governed DELETION seam (soft-delete; the table's retention model). ─
CREATE OR REPLACE FUNCTION public.forget_paige_memory(
  p_id        uuid,
  p_user_id   uuid DEFAULT NULL,   -- honored ONLY for service_role (server-resolved)
  p_tenant_id uuid DEFAULT NULL    -- honored ONLY for service_role (server-resolved)
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service boolean := auth.role() = 'service_role';
  v_uid    uuid;
  v_tenant uuid;
  v_rows   integer;
BEGIN
  IF v_is_service THEN
    v_uid := p_user_id;
    v_tenant := p_tenant_id;  -- the trusted server resolved BOTH; deletion is scoped to that (user,tenant)
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'PAIGE_MEMORY_SERVICE_USER_REQUIRED' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'PAIGE_MEMORY_UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;
    -- p_tenant_id is IGNORED for a JWT caller; scope is the caller's own resolved workspace.
    v_tenant := public.current_user_tenant_id();
  END IF;

  -- Only the caller's OWN memory can be forgotten, AND only within its resolved workspace. A
  -- service_role caller is pinned to the (user, tenant) it named — it can no longer wildcard across
  -- every tenant a user belongs to (a multi-tenant user's other-workspace rows are untouched). The
  -- operator branch lets a platform owner forget their tenant-less rows even if they also resolve a
  -- tenant; it never fires for service_role (auth.uid() is NULL there, so is_platform_owner()=false).
  -- A row that is not the caller's (user AND tenant) is untouched → returns false.
  UPDATE public.paige_owner_memory m
     SET is_active = false
   WHERE m.id = p_id
     AND m.user_id = v_uid
     AND (
       m.tenant_id IS NOT DISTINCT FROM v_tenant
       OR (public.is_platform_owner() AND m.tenant_id IS NULL)
     );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.forget_paige_memory(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forget_paige_memory(uuid,uuid,uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.record_paige_memory(text,text,uuid,jsonb,boolean,text,uuid,uuid) IS
  'Governed WRITE seam for durable Paige memory (§10). Server-resolves (tenant,user) in-body; a JWT '
  'caller''s p_user_id/p_tenant_id are IGNORED (§59). Stamps source (created_by NULL for the '
  'service/system seam), scope, timestamp; p_supersede_prior realizes the correction path; '
  'p_confirmation_state (proposed|confirmed|corrected|retired) is merged into metadata so an '
  'inference is stored ''proposed'', never as canonical truth. Vocab: workspace/conversation/agent.';
COMMENT ON FUNCTION public.get_paige_memory(text[],integer,uuid,uuid) IS
  'Governed READ seam for durable Paige memory: server-resolved (tenant,user), own rows only, '
  'optional memory_type audience filter. Returns metadata (confirmation_state/provenance readable). '
  'Semantic recall stays match_paige_owner_memory.';
COMMENT ON FUNCTION public.forget_paige_memory(uuid,uuid,uuid) IS
  'Governed DELETION seam (soft-delete via is_active) for the caller''s OWN memory row, scoped to '
  'its resolved (user,tenant); a service_role caller passes both and cannot wildcard across tenants.';
