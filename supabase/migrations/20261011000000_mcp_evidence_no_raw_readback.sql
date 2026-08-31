-- The evidence reference is not a way back to the raw content.
--
-- WHY
--
-- Provider output is untrusted input: it can carry instructions aimed at a model,
-- credentials, or another tenant's records. The call path already refuses to forward any
-- of it — what reaches Paige is an outcome projection, and the detail is written here
-- encrypted instead. But `get_tenant_mcp_evidence` was granted to `authenticated` and
-- returned that detail DECRYPTED, so any tenant admin's browser session could ask for it
-- by reference. That makes the opaque reference a retrieval path for the very content the
-- boundary exists to contain, and a path into a client-visible surface is exactly where
-- it must not go.
--
-- Being tenant-scoped and admin-gated is not sufficient here. The rule is not only about
-- WHOSE data it is; it is about which surfaces the raw bytes may reach.
--
-- WHAT CHANGES
--
-- A JWT caller now receives metadata only — that a record exists, for which provider and
-- capability, with what outcome and when. Enough to answer "did that run, and what
-- happened", which is what an operator actually asks. The payload itself is returned only
-- in a trusted server-side context (`auth.uid()` is NULL there, and only there, because
-- EXECUTE is never granted to anon — the same distinction `_mcp_resolve_tenant` relies on).
--
-- Nothing else moves: the row, its encryption, its tenancy check and its expiry are as
-- they were. No caller exists today, so nothing breaks; this closes the path before one
-- is written, which is the only time closing it is cheap.
CREATE OR REPLACE FUNCTION public.get_tenant_mcp_evidence(
  _ref       uuid,
  _tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant uuid;
  _row    public.tenant_mcp_call_evidence;
  -- NULL only in a trusted service context; EXECUTE is never granted to anon.
  _caller uuid := auth.uid();
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, true);
  SELECT * INTO _row FROM public.tenant_mcp_call_evidence
   WHERE id = _ref AND tenant_id = _tenant;
  IF _row.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  IF _row.expires_at <= now() THEN
    RETURN jsonb_build_object('found', false, 'expired', true);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'provider', _row.provider,
    'capability', _row.capability,
    'status', _row.status,
    'created_at', _row.created_at,
    -- Stated rather than silently absent, so a caller can tell "there is nothing stored"
    -- from "you are not a context that may read it".
    'payload_available', _row.payload_ct IS NOT NULL,
    'payload', CASE
      WHEN _caller IS NOT NULL THEN NULL
      WHEN _row.payload_ct IS NULL THEN NULL
      ELSE public.platform_decrypt(_row.payload_ct)
    END
  );
END;
$$;
