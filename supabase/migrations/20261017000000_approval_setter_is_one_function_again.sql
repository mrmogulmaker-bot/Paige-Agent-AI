-- The capability-name check moves into the setter that is actually called, and the
-- overload that should never have come back is dropped again.
--
-- WHAT WENT WRONG
--
-- 20261008 created the four-argument setter (`_pins`) and then DROPPED the three-argument
-- one, with a comment saying why in as many words: "two overloads differing only in an
-- optional argument is how a caller silently keeps using the version that does not pin."
--
-- 20261015 then re-created the three-argument signature to add name validation to it. That
-- reintroduced precisely the trap the drop existed to close, and did so twice over:
--
--   1. The validation never ran. `tenant-mcp-connect` calls the setter WITH `_pins`, so
--      PostgreSQL resolves the four-argument function. The new `_bad` check sat in a body
--      no production caller reaches, and an out-of-grammar name fell through to the table
--      CHECK -- a generic constraint violation instead of the named error the change was
--      written to produce.
--   2. It re-exposed a way to approve without pinning. The three-argument function was
--      granted to `authenticated`, and it writes `approved_capabilities` while leaving
--      `capability_pins` untouched. Approvals and pins could then describe different sets:
--      a capability approved with a stale pin, or none, is exactly the drift the pin
--      mechanism exists to prevent.
--
-- Neither was caught by a test, because the tests exercised the function by name and got
-- whichever overload their argument list resolved to.

CREATE OR REPLACE FUNCTION public.set_tenant_mcp_approved_capabilities(
  _provider     text,
  _capabilities text[],
  _tenant_id    uuid DEFAULT NULL,
  _pins         jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _p      text := public._mcp_check_provider(_provider);
  _tenant uuid;
  _clean  text[];
  _pinmap jsonb;
  _bad    integer;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, true);

  -- Refuse by name rather than letting the table CHECK reject the statement generically.
  -- A blank entry is still dropped quietly, because that is a UI artefact rather than a
  -- decision; a real name that cannot be stored raises, so an admin is never told that
  -- five capabilities were approved when one of them was silently discarded.
  SELECT count(*) INTO _bad
    FROM unnest(COALESCE(_capabilities, ARRAY[]::text[])) AS c
   WHERE btrim(c) <> '' AND c !~ '^[A-Za-z0-9_.:-]{1,64}$';

  IF _bad > 0 THEN
    -- The offending name is deliberately NOT echoed back: it is provider-controlled text,
    -- and an error message is one more place it would travel.
    RAISE EXCEPTION 'MCP_INVALID_CAPABILITY_NAME: % capability name(s) are not valid tool names and were not approved', _bad
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c ORDER BY c), ARRAY[]::text[]) INTO _clean
    FROM unnest(COALESCE(_capabilities, ARRAY[]::text[])) AS c
   WHERE btrim(c) <> '';

  IF COALESCE(array_length(_clean, 1), 0) > 200 THEN
    RAISE EXCEPTION 'MCP_TOO_MANY_CAPABILITIES' USING ERRCODE = '22023';
  END IF;

  -- Only pins for names actually being approved are kept. A pin for anything else is
  -- dropped rather than stored, so the pin map can never describe a capability the
  -- workspace did not approve.
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO _pinmap
    FROM jsonb_each(COALESCE(_pins, '{}'::jsonb)) e
   WHERE e.key = ANY(_clean);

  UPDATE public.tenant_mcp_connections
     SET approved_capabilities = to_jsonb(_clean),
         capability_pins       = _pinmap,
         updated_at            = now(),
         updated_by            = auth.uid()
   WHERE tenant_id = _tenant AND provider = _p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP_NOT_CONNECTED: connect the provider before approving anything'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'provider', _p,
    'approved_count', COALESCE(array_length(_clean, 1), 0),
    -- Reported so a caller can see when it approved something it could not pin, rather
    -- than discovering it later as a capability that refuses to run.
    'pinned_count', (SELECT count(*) FROM jsonb_object_keys(_pinmap))
  );
END;
$$;

-- Dropped again, for the reason 20261008 gave the first time. Approving and pinning are
-- one act; a signature that performs only half of it is a way to get them out of step.
DROP FUNCTION IF EXISTS public.set_tenant_mcp_approved_capabilities(text, text[], uuid);

REVOKE ALL ON FUNCTION public.set_tenant_mcp_approved_capabilities(text, text[], uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_mcp_approved_capabilities(text, text[], uuid, jsonb) TO authenticated, service_role;
