-- Task #15 (§13/§70) — VERSION PRESERVATION on the marketing_content reuse UPDATE.
--
-- `save_marketing_content(p_id => …)` refines an image IN PLACE by overwriting the row's image_url /
-- image_path / size. Until now that silently DISCARDED the prior image (marketing_content carries one
-- image at a time and has no history column; the only version store, `studio_artifact_versions`, is
-- structurally bound to a `studio_sessions` row a dedicated chat never has). The owner requires that a
-- prior image is NEVER silently overwritten, so before the UPDATE swaps the picture this snapshots the
-- CURRENT image into `meta.versions[]`.
--
-- Design (additive, lowest-blast-radius): the history lives in the existing `meta jsonb` on the same
-- row — no new table, no schema change, and NO touch to the shipped, session-coupled
-- `studio_artifact_versions` or its RLS (§18 one home, §58-safe, §9 unchanged: the UPDATE stays
-- `WHERE id = p_id AND tenant_id = _tenant`). Through THIS RPC the history is SERVER-OWNED: it is based
-- on the row's existing `meta.versions`, NOT on caller-supplied p_meta (a caller driving Paige's refine
-- through this function cannot forge or wipe it), capped to the most-recent 20 so it cannot grow without
-- bound. HONEST SCOPE (§13, Codex round-5): this is NOT a security boundary. `marketing_content` carries
-- a `marketing_content_tenant_manage` FOR ALL policy, so a tenant admin/coach can still edit their OWN
-- tenant's `meta.versions` (or replace image_url without a snapshot) by direct Data-API DML — that is
-- their shipped, tenant-scoped capability, never a cross-tenant leak. The lineage is a within-tenant
-- convenience audit of Paige's refine chain, and the invariant it guarantees is exactly "the RPC never
-- silently loses a prior image," which holds. Enforcing lineage at the raw-table boundary (a trigger on
-- `marketing_content` protecting the `versions` key) is a possible FUTURE hardening, deliberately out of
-- this slice's scope (task #15 is the dedicated-chat refine, not a rewrite of the core library's RLS).
--
-- Snapshot fires ONLY when the image is genuinely being REPLACED with a DIFFERENT one — a text/document
-- reuse (no p_image_url) or an idempotent re-save of the same url records no version. Every other line
-- of the function (roles/tenant guards, the INSERT branch, the audit row, the return contract) is
-- byte-for-byte the live definition from 20260821010000; only the p_id UPDATE branch changed.
-- §37: the only reuse producers are the Studio canvas clamp and the §33 critique-loop, both of which
-- keep an honest per-change history for free; neither's request body or response contract changes.

CREATE OR REPLACE FUNCTION public.save_marketing_content(p_kind text, p_title text, p_body text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_image_path text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_brief text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb, p_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _kind text := CASE WHEN p_kind IN ('text','image','video','document') THEN p_kind ELSE 'text' END;
  _id uuid;
  _cur record;
  _new_image text := NULLIF(btrim(p_image_url), '');
  _versions jsonb;
  _merged_meta jsonb;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTENT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  -- §9/#117: membership is required for a JWT caller; a global 'admin' role no longer
  -- exempts a cross-tenant write (platform owner still may).
  IF _caller IS NOT NULL
     AND NOT public.is_tenant_member(_tenant)
     AND NOT public.is_platform_owner(_caller) THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN: tenant not in your membership' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NOT NULL THEN
    -- Read + LOCK the CURRENT row (tenant-scoped) so we can preserve the prior image before overwriting
    -- it. FOR UPDATE serializes concurrent refines of the SAME row, so a double-submit cannot lose a
    -- version to a read-modify-write race.
    SELECT image_url, image_path, size, meta INTO _cur
    FROM public.marketing_content
    WHERE id = p_id AND tenant_id = _tenant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONTENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- p_meta (when supplied) still replaces the caller-facing meta, BUT `versions` is SERVER-OWNED: it
    -- is ALWAYS re-asserted from the row's own history below, so a caller can neither forge it (a
    -- caller-supplied meta.versions is ignored) nor wipe it (a non-image reuse with p_meta='{}' cannot
    -- drop it) — the §70 "prior image is never silently lost" invariant holds on EVERY reuse path.
    _merged_meta := COALESCE(p_meta, _cur.meta, '{}'::jsonb);
    _versions := _cur.meta -> 'versions';
    IF _versions IS NULL OR jsonb_typeof(_versions) <> 'array' THEN
      _versions := '[]'::jsonb;
    END IF;

    -- Version preservation: when the image is actually being replaced with a different one, append the
    -- OUTGOING (prior) image as the newest history entry (capped to the most-recent 20).
    IF _new_image IS NOT NULL AND _cur.image_url IS NOT NULL AND _new_image <> _cur.image_url THEN
      _versions := _versions || jsonb_build_array(jsonb_build_object(
        'image_url', _cur.image_url,
        'image_path', _cur.image_path,
        'size', _cur.size,
        'at', now()
      ));
      IF jsonb_array_length(_versions) > 20 THEN
        SELECT COALESCE(jsonb_agg(v ORDER BY ord), '[]'::jsonb)
          INTO _versions
        FROM jsonb_array_elements(_versions) WITH ORDINALITY AS t(v, ord)
        WHERE ord > jsonb_array_length(_versions) - 20;
      END IF;
    END IF;
    -- server-owned versions ALWAYS win over any caller-supplied meta.versions (forge/wipe-proof).
    -- p_meta is arbitrary jsonb (its generated client type permits strings/numbers/booleans/arrays),
    -- and jsonb_set cannot install an object key into a scalar/array root — it would return the root
    -- unchanged and SILENTLY DROP the versions snapshot, breaking the un-wipeable-history contract
    -- (Codex P2). Normalize a non-object merged meta to an object first so `versions` always persists.
    IF _merged_meta IS NULL OR jsonb_typeof(_merged_meta) <> 'object' THEN
      _merged_meta := '{}'::jsonb;
    END IF;
    _merged_meta := jsonb_set(_merged_meta, '{versions}', _versions, true);

    UPDATE public.marketing_content SET
      title = COALESCE(NULLIF(btrim(p_title), ''), title),
      body = COALESCE(p_body, body),
      channel = COALESCE(p_channel, channel),
      brief = COALESCE(p_brief, brief),
      meta = _merged_meta,
      image_url = COALESCE(_new_image, image_url),
      image_path = COALESCE(NULLIF(btrim(p_image_path), ''), image_path),
      size = COALESCE(NULLIF(btrim(p_size), ''), size)
    WHERE id = p_id AND tenant_id = _tenant
    RETURNING id INTO _id;
    IF _id IS NULL THEN
      RAISE EXCEPTION 'CONTENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RETURN _id;
  END IF;

  -- §13 (Codex P2): `versions` is SERVER-OWNED lineage; a brand-new row has none. Strip any
  -- caller-supplied `meta.versions` on INSERT so a caller cannot plant fabricated history that a later
  -- reuse would then treat as authentic server-owned lineage (the reuse branch above re-asserts history
  -- from the row's OWN meta, so a forged initial `versions` would otherwise be carried forward). Only an
  -- object meta can carry the key; a scalar/array meta can't, so it is left as-is.
  _merged_meta := COALESCE(p_meta, '{}'::jsonb);
  IF jsonb_typeof(_merged_meta) = 'object' THEN
    _merged_meta := _merged_meta - 'versions';
  END IF;

  INSERT INTO public.marketing_content (
    tenant_id, created_by, kind, channel, title, body,
    image_url, image_path, size, brief, meta
  ) VALUES (
    _tenant, _caller, _kind, NULLIF(btrim(p_channel), ''),
    COALESCE(NULLIF(btrim(p_title), ''), 'Untitled'), p_body,
    NULLIF(btrim(p_image_url), ''), NULLIF(btrim(p_image_path), ''),
    NULLIF(btrim(p_size), ''), p_brief, _merged_meta
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'marketing_content', 'save_marketing_content', _id,
          jsonb_build_object('tenant_id', _tenant, 'kind', _kind, 'channel', p_channel));

  RETURN _id;
END;
$function$;
