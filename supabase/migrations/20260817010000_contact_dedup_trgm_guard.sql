-- =============================================================================
-- Contact dedup guard — pg_trgm + trigram index + tenant-scoped fuzzy-match RPC
-- =============================================================================
-- DOCTRINE HEADER (§9 / §13 / §15 / §18 / §39 / §51)  — #27/#28 dedup bundle.
--  WHAT: Backs the crm_create_contact dedup guard in paige-ai-chat. Before Paige
--        blind-inserts a contact (the root cause of the duplicate "Tashia Anderson"
--        rows — one real manual row + two source='paige' inserts a minute apart),
--        the edge now fuzzy-matches existing contacts in the SAME tenant and asks
--        the operator "is this the same person?" (§15) instead of silently creating
--        a third row. Platform-wide by construction: the guard lives in the ONE
--        paige-ai-chat crm_create_contact tool that every Paige chat surface (solo,
--        sub-account, agency, operator/super-admin, floating chatbot, Studio) routes
--        through (§18) — one seam, all tiers.
--
--  1) CREATE EXTENSION pg_trgm — was NOT installed on prod (§30-verified).
--
--  2) A GIN trigram EXPRESSION index over the normalized full name so the fuzzy
--     lookup is index-accelerated.
--     NOTE (§13, get-this-right): a gin_trgm_ops index is used by the % / %> / <%
--     / <-> / LIKE operators — NOT by a plain `similarity() > c` comparison. So the
--     RPC below drives the lookup with the `%` operator (which IS index-eligible)
--     and refines with `similarity() > 0.6` as a post-filter. `%` uses the default
--     pg_trgm.similarity_threshold (0.3), a strict superset of `>0.6`, so the index
--     narrows candidates and the 0.6 precision still holds.
--     concat_ws() is only STABLE and Postgres rejects it in an index expression;
--     lower(coalesce(first_name,'')||' '||coalesce(last_name,'')) is fully IMMUTABLE
--     and index-eligible, and is reused VERBATIM by the RPC so the planner matches it.
--     CONCURRENTLY is intentionally NOT used: `supabase db push` wraps each migration
--     in a transaction and CREATE INDEX CONCURRENTLY cannot run inside one. The
--     clients table is small; a brief build-time lock is acceptable.
--
--  3) A partial UNIQUE index on (tenant_id, lower(btrim(email))) WHERE email is set —
--     the DB-level backstop for the TOCTOU window the advisory fuzzy check cannot
--     close (§39 finding: two near-simultaneous creates could both pass the lookup).
--     §30-verified SAFE to add: prod has ZERO existing (tenant_id, lower(email))
--     duplicate groups, so the index builds without violating existing data. Email
--     only (never name) — two different real people legitimately share a name, so a
--     name-unique would wrongly reject them; email is the safe uniqueness key. The
--     edge's create path catches a 23505 and surfaces it as a dedup hit (see §13 note
--     in the edge diff), so the constraint is the guarantee and the fuzzy RPC is the UX.
--
--  4) find_duplicate_contacts(p_tenant_id, p_first, p_last, p_email, p_limit):
--     runs the fuzzy match SERVER-SIDE (supabase-js cannot express a trigram filter),
--     ordered email-exact first, then similarity desc, then created_at asc (the
--     oldest/original row wins), LIMIT<=10.
--  §9/§39 IDOR GUARD: the RPC is SECURITY DEFINER and takes p_tenant_id, so a JWT
--     caller passing an arbitrary tenant could otherwise fuzzy-read another tenant's
--     book (the §45/§39 peer-gate lesson). EXECUTE is therefore REVOKED from
--     public/anon/authenticated and GRANTED ONLY to service_role. The edge invokes it
--     with the ADMIN (service-role) client, always passing the SERVER-RESOLVED tenant
--     — never a request-body value. A sub-account can never match the parent agency's
--     book (§9/§51). Isolation rests on the `WHERE c.tenant_id = p_tenant_id` predicate
--     (service_role bypasses RLS by design), so that predicate is load-bearing.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- (2) Normalized full-name trigram index (immutable expression — see header).
CREATE INDEX IF NOT EXISTS idx_clients_fullname_trgm
  ON public.clients
  USING gin ((lower(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) gin_trgm_ops);

-- (3) DB-level uniqueness backstop for the TOCTOU window (email only; §30-verified
--     zero existing collisions on prod). btrim+lower so casing/whitespace variants
--     collide too.
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_tenant_email
  ON public.clients (tenant_id, lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE OR REPLACE FUNCTION public.find_duplicate_contacts(
  p_tenant_id  uuid,
  p_first_name text,
  p_last_name  text DEFAULT NULL,
  p_email      text DEFAULT NULL,
  p_limit      int  DEFAULT 3
)
RETURNS TABLE (
  id              uuid,
  first_name      text,
  last_name       text,
  email           text,
  phone           text,
  entity_name     text,
  lifecycle_stage text,
  source          text,
  created_at      timestamptz,
  name_similarity real,
  email_exact     boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      lower(btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''))) AS full_name,
      nullif(btrim(lower(p_email)), '') AS email_norm
  )
  SELECT
    c.id, c.first_name, c.last_name, c.email, c.phone,
    c.entity_name, c.lifecycle_stage, c.source, c.created_at,
    similarity(
      lower(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
      params.full_name
    ) AS name_similarity,
    (params.email_norm IS NOT NULL AND lower(btrim(c.email)) = params.email_norm) AS email_exact
  FROM public.clients c, params
  WHERE c.tenant_id = p_tenant_id   -- §9: hard tenant scope; caller cannot widen it
    AND (
      (
        params.full_name <> ''
        -- `%` is index-accelerated (uses idx_clients_fullname_trgm); similarity()>0.6
        -- refines it to a strong match (see header note 2).
        AND lower(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) % params.full_name
        AND similarity(
              lower(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
              params.full_name
            ) > 0.6
      )
      OR (params.email_norm IS NOT NULL AND lower(btrim(c.email)) = params.email_norm)
    )
  ORDER BY email_exact DESC, name_similarity DESC, c.created_at ASC
  LIMIT greatest(1, least(coalesce(p_limit, 3), 10));
$$;

-- §9/§39: lock invocation to the service role only. The edge (service-role) is the
-- sole caller and always passes the server-resolved tenant; no JWT/anon path can
-- reach it with an arbitrary p_tenant_id.
REVOKE ALL ON FUNCTION public.find_duplicate_contacts(uuid, text, text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_duplicate_contacts(uuid, text, text, text, int) FROM anon;
REVOKE ALL ON FUNCTION public.find_duplicate_contacts(uuid, text, text, text, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_duplicate_contacts(uuid, text, text, text, int) TO service_role;

COMMENT ON FUNCTION public.find_duplicate_contacts(uuid, text, text, text, int) IS
  'Tenant-scoped fuzzy contact dedup lookup (§15/§18). Trigram % (index-accelerated) refined by similarity()>0.6 on normalized full name, OR exact email; service_role-only (§9/§39 IDOR guard). Backs crm_create_contact dedup confirmation.';
