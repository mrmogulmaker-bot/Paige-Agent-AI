-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- match_paige_memory — resource-scoped, in-body caller authorization (§53/§59, R3a).
--
-- WHY. `public.match_paige_memory` is a SECURITY DEFINER function (RLS bypassed) granted to
-- `authenticated`, and its authorization guard had two confirmed defects (R1 audit §4c,
-- `docs/audits/R1-role-call-site-inventory.md`; re-affirmed open in the Paige Memory contract
-- 2026-09-05, `docs/brain/paige-memory-contract.md`):
--
--   1. FORGED-ID structural bypass. The guard passed when `auth.uid() = _target_client_id`. Because
--      `_target_client_id` is a CALLER-SUPPLIED parameter, an authenticated caller could pass
--      `_target_client_id := auth.uid()` (self) together with `_target_user_id := <victim>`; the
--      `auth.uid() IS DISTINCT FROM _target_client_id` conjunct went FALSE, the whole AND went
--      FALSE, and the RAISE never fired — while the DATA predicate still keyed on the
--      attacker-controlled `_target_user_id`, returning the victim's `client_memory.content` and
--      `chat_message_embeddings.content_excerpt`. `_match_threshold` is caller-supplied, so `-1`
--      turned similarity search into a full dump.
--   2. GLOBAL-ROLE trap (§53/§59). `has_role(auth.uid(),'admin')` is TENANT-AGNOSTIC — `user_roles`
--      has no `tenant_id`, and every tenant owner is a global `admin` (the tenant_members→user_roles
--      sync). So any tenant owner could read any user's memory across ALL tenants.
--
-- Both are LATENT today (both `client_memory` and `chat_message_embeddings` were 0 rows at the
-- 2026-08-18 audit); the fix hardens the door before rows exist. Re-confirming current row counts
-- is owed to a DB-capable session (this session's SQL inspection was permission-denied).
--
-- THE FIX (owner-directed 2026-09-13; keep the slice narrow and evidence-led):
--   • Authority is derived from SERVER facts, PER TARGET — never from a caller-supplied id matching
--     itself. Removing the `IS DISTINCT FROM _target_client_id` self-reference closes defect 1.
--   • The global `has_role('admin')` disjunct is replaced by resource-scoped checks. Cross-USER
--     access (rows keyed on `_target_user_id`) is limited to SELF and platform operator
--     (`is_platform_operator`, §53 — the same helper the `client_memory` RESTRICTIVE fence uses).
--     Cross-CONTACT access (rows keyed on `_target_client_id`, a `clients.id`) goes through the
--     canonical `can_access_contact`, which resolves THAT contact's own tenant. Closes defect 2.
--   • A per-user coach/tenant-admin cross-user grant was deliberately NOT used (§39 Finding 1): a
--     `client_memory` row's tenant is optional (`client_id` nullable) and `chat_message_embeddings`
--     has NO tenant column, so a per-user staff grant cannot be tenant-scoped and would over-return a
--     MULTI-TENANT subject's other-tenant rows. Staff read a specific client's memory via the CLIENT
--     branch, where `can_access_contact` is per-contact tenant-correct. No current authenticated
--     producer needs the cross-user staff path (the sole runtime caller is service_role), so this is
--     "preserve only where source evidence proves required", not a capability regression.
--   • Each DATA-predicate branch is gated on its OWN per-target authorization flag, so a caller
--     authorized for target A can never pull target B's rows in the same call.
--   • Search parameters are BOUNDED so they cannot widen disclosure: the similarity threshold is
--     clamped to [0,1] (a negative threshold no longer dumps) and the row counts to [0,50].
--   • The service role (Paige's server) is trusted to pass server-resolved ids — exactly as the
--     governed memory seam (record_/get_/forget_paige_memory) trusts it — because the sole runtime
--     caller (`paige-ai-chat`) resolves caller→client authorization server-side BEFORE this call
--     (JWT tenant-equality; operator bypass). Without this branch the function raised 'Unauthorized'
--     for its only caller (auth.uid() is NULL under the service role), so legitimate memory
--     retrieval could never run. This restores the legitimate, server-resolved path the owner
--     requires; it does not widen access — a JWT caller is still scoped in-body.
--   • Failure is truthful and minimal: 'Unauthorized' carries no content or metadata (§13).
--
-- NOT CHANGED (out of scope, §13): the data-matching columns/joins (product retrieval semantics),
-- the return shape, and the caller `paige-ai-chat` (its server-side scope resolution is unchanged).
-- The `ce.client_user_id = _target_client_id` disjunct compares an auth-uid column to a clients.id
-- and therefore never matches — a PRE-EXISTING under-match, not an authority defect; left as-is and
-- recorded as a follow-up rather than altered here.
--
-- search_path stays `public, extensions` (the fix in 20261029000000 — CREATE OR REPLACE resets
-- attributes, so it is re-declared here; omitting `extensions` would re-break the `<=>` operator).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_paige_memory(
  _query_embedding extensions.vector,
  _target_user_id uuid,
  _target_client_id uuid DEFAULT NULL::uuid,
  _match_threshold double precision DEFAULT 0.7,
  _memory_count integer DEFAULT 5,
  _message_count integer DEFAULT 5
)
RETURNS TABLE(source text, id uuid, memory_type text, content text, similarity double precision, created_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_service boolean := COALESCE(auth.role() = 'service_role', false);
  _may_user boolean := false;
  _may_client boolean := false;
  -- Bound every search parameter that could widen disclosure (§13): a negative threshold turned
  -- similarity search into a full dump; an unbounded count paginates the table.
  _threshold double precision := LEAST(GREATEST(COALESCE(_match_threshold, 0.7), 0.0), 1.0);
  _mem_count integer := LEAST(GREATEST(COALESCE(_memory_count, 5), 0), 50);
  _msg_count integer := LEAST(GREATEST(COALESCE(_message_count, 5), 0), 50);
BEGIN
  -- A caller with neither a resolved identity nor the trusted service role has no basis for access.
  IF _caller IS NULL AND NOT _is_service THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _is_service THEN
    -- Paige's server (service_role) resolved caller->target scope UPSTREAM (paige-ai-chat proves
    -- JWT tenant-equality / operator access before this call). Trusted to pass server-derived ids,
    -- exactly as the governed memory seam (record_/get_/forget_paige_memory) trusts service_role.
    _may_user := (_target_user_id IS NOT NULL);
    _may_client := (_target_client_id IS NOT NULL);
  ELSE
    -- Authenticated caller. Authority is derived from SERVER facts per target — NEVER from the
    -- caller-supplied id matching itself (that self-reference was the forged-id bypass, R1 §4c).
    --
    -- USER-keyed rows (`_target_user_id` is an auth user id → cm.client_user_id / ce.user_id):
    -- limited to SELF and platform operator. A per-user coach/tenant-admin grant CANNOT be made
    -- tenant-safe here (§39 Finding 1): a `client_memory` row's tenant is optional (`client_id`
    -- nullable) and `chat_message_embeddings` has NO tenant column at all, so a per-user staff grant
    -- over-returns a MULTI-TENANT subject's other-tenant rows — the exact §9/§53 cross-tenant read
    -- this slice exists to close. Staff reach a specific client's memory through the CLIENT branch
    -- below, where `can_access_contact` resolves THAT contact's own tenant. Self reads own memory
    -- (the client_memory RLS "own memory" arm); operator is the sanctioned cross-tenant read (§53,
    -- the helper the client_memory RESTRICTIVE fence itself uses). No current authenticated producer
    -- exists (the sole runtime caller is service_role); this leaves a tenant-safe §10 direct-API path.
    _may_user := _target_user_id IS NOT NULL AND (
         _caller = _target_user_id
      OR public.is_platform_operator()
    );
    -- CLIENT-keyed rows (`_target_client_id` is a clients.id → cm.client_id): the canonical
    -- resource-scoped helper resolves THAT contact's tenant (operator / same-tenant owner-admin /
    -- direct relationship / active assignment), so this branch is per-contact tenant-correct and
    -- cannot over-return across tenants. can_access_contact(caller, <an auth uid>) is FALSE — no
    -- clients row has that id — so a forged `_target_client_id := auth.uid()` never self-authorizes.
    _may_client := _target_client_id IS NOT NULL
                   AND public.can_access_contact(_caller, _target_client_id);
  END IF;

  -- Refuse before returning any content or metadata; the message carries no data (§13).
  IF NOT _may_user AND NOT _may_client THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  (
    SELECT
      'memory'::text AS source,
      cm.id,
      cm.memory_type,
      cm.content,
      1 - (cm.embedding <=> _query_embedding) AS similarity,
      cm.created_at
    FROM public.client_memory cm
    WHERE cm.is_active = true
      AND cm.embedding IS NOT NULL
      AND (
        (_may_user AND cm.client_user_id = _target_user_id)
        OR (_may_client AND cm.client_id = _target_client_id)
      )
      AND 1 - (cm.embedding <=> _query_embedding) >= _threshold
    ORDER BY cm.embedding <=> _query_embedding
    LIMIT _mem_count
  )
  UNION ALL
  (
    SELECT
      'chat'::text AS source,
      ce.message_id AS id,
      ce.role AS memory_type,
      ce.content_excerpt AS content,
      1 - (ce.embedding <=> _query_embedding) AS similarity,
      ce.created_at
    FROM public.chat_message_embeddings ce
    WHERE ce.embedding IS NOT NULL
      AND (
        (_may_user AND ce.user_id = _target_user_id)
        OR (_may_client AND ce.client_user_id = _target_client_id)
      )
      AND 1 - (ce.embedding <=> _query_embedding) >= _threshold
    ORDER BY ce.embedding <=> _query_embedding
    LIMIT _msg_count
  );
END;
$function$;

-- Deterministic, §59-lint-clean grant end-state: never anon/PUBLIC; the two real callers only.
REVOKE ALL ON FUNCTION public.match_paige_memory(extensions.vector, uuid, uuid, double precision, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_paige_memory(extensions.vector, uuid, uuid, double precision, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.match_paige_memory(extensions.vector, uuid, uuid, double precision, integer, integer) TO authenticated, service_role;
