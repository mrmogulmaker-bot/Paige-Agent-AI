-- Lane A2 Finding 1 (§9 IDOR) — close cross-tenant private-KB read via match_tenant_knowledge.
--
-- match_tenant_knowledge(p_tenant_id, ...) is SECURITY DEFINER, filters `WHERE c.tenant_id =
-- p_tenant_id` on the CALLER-supplied p_tenant_id, and is GRANTed to `authenticated` — so any
-- authenticated user could call it directly with another tenant's id and read that tenant's
-- Tier-2 private knowledge-base chunk content. (The kb-search edge fn also trusted body.tenant_id;
-- that half is fixed in the function itself.)
--
-- Fix (the #149 pattern): add a JWT-caller guard. A direct JWT caller (auth.uid() IS NOT NULL) may
-- only search their OWN validated tenant — p_tenant_id must equal current_user_tenant_id() (which
-- itself validates membership/agency/admin, hardened 20260714144656), unless they're a platform
-- admin. A service-role caller (auth.uid() IS NULL — the kb-search edge fn's admin client, which
-- now derives the tenant from the caller before calling) is trusted. Converted to plpgsql only to
-- carry the guard; the query body is byte-identical to the prior sql definition.
CREATE OR REPLACE FUNCTION public.match_tenant_knowledge(
  p_tenant_id uuid,
  p_query_embedding vector,
  p_match_count integer DEFAULT 6
)
 RETURNS TABLE(source_tier text, doc_id uuid, chunk_id uuid, title text, content text, similarity double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- §9: a JWT caller may only search their own tenant; service-role (edge fn) is pre-scoped.
  IF auth.uid() IS NOT NULL
     AND p_tenant_id IS DISTINCT FROM public.current_user_tenant_id()
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'KB_FORBIDDEN: cross-tenant knowledge search denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    'tenant'::text                                 AS source_tier,
    c.doc_id                                        AS doc_id,
    c.id                                            AS chunk_id,
    d.title                                         AS title,
    c.content                                       AS content,
    1 - (c.embedding <=> p_query_embedding)::float  AS similarity
  FROM public.tenant_knowledge_chunks c
  JOIN public.tenant_knowledge_docs d ON d.id = c.doc_id
  WHERE c.tenant_id = p_tenant_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
END
$function$;
