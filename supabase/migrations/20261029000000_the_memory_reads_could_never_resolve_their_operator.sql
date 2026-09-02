-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Three semantic reads have been raising on every call. This is the one-line reason.
--
-- WHAT WAS HAPPENING, driven on production rather than read:
--
--   SELECT ... FROM public.match_paige_memory(<1024-dim vector>, <the caller's own id>, ...)
--   ERROR:  42883 operator does not exist: extensions.vector <=> extensions.vector
--
-- as a FULLY AUTHORISED caller — the target was the caller themselves, so the function's own
-- authorization guard passed. The failure is after it, and it is not about permissions at all.
--
-- THE CAUSE. `vector` and all sixteen of its operators (`<=>`, `<->`, `<#>`, …) live in the
-- `extensions` schema on this project; there are ZERO in `public`. These three functions pin
-- `SET search_path = public`, which is correct security practice — a mutable search_path on a
-- SECURITY DEFINER function is a real hazard — but it also means `<=>` cannot be resolved, because
-- the only schema that has it is not on the path. Every call raises before returning a row.
--
-- THE CONTROLLED PROOF, one variable: `match_prompt_memory` pins no search_path at all. Called
-- with the session default it RUNS; called with `SET search_path TO public` and nothing else, the
-- identical call raises 42883. Same function, same arguments, opposite outcomes.
--
-- HOW IT SURVIVED. Each call site wraps the RPC and degrades to an empty result on error, which is
-- the right shape for a retrieval that should never break a conversation — and is exactly why
-- nobody noticed. "No memories matched" and "this function cannot execute" are indistinguishable
-- from the outside. The two NEWEST siblings, `match_paige_owner_memory` and
-- `match_tenant_knowledge`, both carry `search_path = public, extensions` and both work. Whoever
-- hit this before fixed the two they were writing and did not backport it to the three they were
-- not.
--
-- WHAT WAS DEAD, and for whom:
--   match_paige_memory    semantic client memory in chat — every caller
--   match_rag_documents   document retrieval in chat — driven broken as service role
--   match_prompt_memory   the §26 prompt-forge learning loop — whenever the caller's path lacks
--                         `extensions`, which nothing guarantees: no API role pins a search_path
--                         and the database default is unset, so it rests on what PostgREST happens
--                         to set per request. Fragile rather than proven-dead in production, and
--                         stated that way rather than rounded up.
--
-- THE FIX IS THE PATH, NOT THE BODY. `ALTER FUNCTION … SET search_path` changes resolution and
-- nothing else: no body is rewritten, no signature moves, no authorization is touched. Appending
-- `extensions` rather than removing the pin keeps the hardening that made these functions safe.
--
-- The tenant knowledge base is NOT affected — it goes through `match_tenant_knowledge`, which is
-- one of the two that already had this right. Said explicitly so this is not read as wider than
-- it is.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

ALTER FUNCTION public.match_paige_memory(
  extensions.vector, uuid, uuid, double precision, integer, integer
) SET search_path = public, extensions;

ALTER FUNCTION public.match_rag_documents(
  extensions.vector, numeric, integer, text[], jsonb, text
) SET search_path = public, extensions;

-- This one pinned NOTHING, so it also inherited whatever the caller happened to have — a mutable
-- search_path on a function that reads tenant data. Pinning it fixes the resolution and closes
-- that at the same time.
ALTER FUNCTION public.match_prompt_memory(
  uuid, extensions.vector, integer
) SET search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- …and `match_rag_documents` was broken TWICE. Found only by driving it after the path fix.
--
-- With `<=>` resolvable, the very next call got further and then raised:
--
--   ERROR:  42P01 missing FROM-clause entry for table "r"
--
-- The id-collection query aliases its subquery `d` and then aggregates `r.id`. There is exactly
-- one `r.` reference in the whole 3,033-character function, and `r` is defined nowhere: a typo,
-- unreachable until now because the operator error always fired first.
--
-- It sits AFTER `RETURN QUERY`, which in plpgsql does not exit — so the rows were never the
-- problem; the function raised on its way to bumping `usage_count` and writing the retrieval log.
-- The caller's catch turned all of it into an empty result.
--
-- The body is written out in full rather than patched from `pg_get_functiondef` at migration time.
-- Rewriting a function from its own live definition would silently bake in whatever prod happens
-- to hold, including any drift — so what ships is what this file says, reviewable, with one token
-- changed: `array_agg(r.id)` → `array_agg(d.id)`.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_rag_documents(
  _query_embedding extensions.vector,
  _match_threshold numeric DEFAULT 0.75,
  _match_count integer DEFAULT 3,
  _document_types text[] DEFAULT NULL::text[],
  _metadata_filter jsonb DEFAULT NULL::jsonb,
  _query_text text DEFAULT NULL::text)
RETURNS TABLE(id uuid, document_type text, title text, summary text, content text,
              metadata jsonb, similarity double precision, quality_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _ids uuid[];
  _is_staff boolean := false;
  _caller uuid := auth.uid();
  _financial_types text[] := ARRAY[
    'business_credit_snapshot','owner_credit_snapshot','banking_snapshot',
    'cash_flow_snapshot','client_financial_brief'
  ];
BEGIN
  IF _caller IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _caller IS NOT NULL THEN
    _is_staff := public.has_role(_caller, 'admin'::public.app_role)
              OR public.has_role(_caller, 'coach'::public.app_role);
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      d.id, d.document_type, d.title, d.summary, d.content, d.metadata,
      1 - (d.embedding <=> _query_embedding) AS similarity,
      d.quality_score
    FROM public.rag_documents d
    WHERE d.is_published = true
      AND d.embedding IS NOT NULL
      AND (_document_types IS NULL OR d.document_type = ANY (_document_types))
      AND (_metadata_filter IS NULL OR d.metadata @> _metadata_filter)
      AND 1 - (d.embedding <=> _query_embedding) >= _match_threshold
      AND (
        NOT (d.document_type = ANY (_financial_types))
        OR auth.role() = 'service_role'
        OR _is_staff
        OR (d.client_id IS NOT NULL AND d.client_id = _caller)
      )
    ORDER BY d.embedding <=> _query_embedding
    LIMIT GREATEST(_match_count, 1)
  )
  SELECT * FROM ranked;

  -- THE FIX: the subquery below is aliased `d`; this aggregated `r.id`, which is nothing.
  SELECT COALESCE(array_agg(d.id), ARRAY[]::uuid[]) INTO _ids
  FROM (
    SELECT d.id
    FROM public.rag_documents d
    WHERE d.is_published = true
      AND d.embedding IS NOT NULL
      AND (_document_types IS NULL OR d.document_type = ANY (_document_types))
      AND (_metadata_filter IS NULL OR d.metadata @> _metadata_filter)
      AND 1 - (d.embedding <=> _query_embedding) >= _match_threshold
      AND (
        NOT (d.document_type = ANY (_financial_types))
        OR auth.role() = 'service_role'
        OR _is_staff
        OR (d.client_id IS NOT NULL AND d.client_id = _caller)
      )
    ORDER BY d.embedding <=> _query_embedding
    LIMIT GREATEST(_match_count, 1)
  ) d;

  IF array_length(_ids, 1) IS NOT NULL THEN
    UPDATE public.rag_documents
       SET usage_count = usage_count + 1,
           updated_at = now()
     WHERE id = ANY (_ids);
  END IF;

  BEGIN
    INSERT INTO public.rag_retrieval_log (
      user_id, query_embedding, query_text, retrieved_document_ids
    ) VALUES (
      _caller, _query_embedding, _query_text, COALESCE(_ids, ARRAY[]::uuid[])
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;
