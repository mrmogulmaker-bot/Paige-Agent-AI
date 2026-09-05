-- Campaigns › Social — the first writer for the accounts a business posts from, and the Spine read
-- that lets PAIGE see them.
--
-- ─── WHAT WAS ACTUALLY BROKEN ────────────────────────────────────────────────────────────────
--
-- `tenants.features->'social_handles'` has been READ since the Systems Check L1 registry shipped:
--   supabase/functions/_shared/systems-check-runners/social_handles_captured.ts  (check #3)
--
-- A repo-wide search for a WRITER returns NOTHING — the same structural gap
-- `declare_client_payment_handling` (20261130000000) was built to close for the two payment
-- columns, and the docs already record it in those words:
--   docs/product/systems-check-operating-readiness-spec.md:414
--     "NONE EXISTS. Verified: no route writes tenants.features.social_handles."
--
-- So check #3 has been structurally unpassable for every tenant since the day it shipped, and the
-- Systems Check destination registry says so out loud — src/solo/systems-check-areas.ts:207-214
-- points the owner at /solo/:account/growth/social and then admits the page "has no way to connect
-- an account yet, so this cannot be finished there today." This migration is the seam that makes
-- that sentence false, and that file's caveat is removed in the same commit.
--
-- ─── WHAT THIS IS, AND EMPHATICALLY IS NOT ───────────────────────────────────────────────────
--
-- §38 CAPTURE-ONLY, in the runner's own words: "Paige does NOT own the tenant's social accounts,
-- so this is a DECLARED-field read, not a live per-network verification." This write matches that
-- exactly. It creates NO external provider state: no OAuth handshake, no token stored, no page or
-- business account bound, no provider API called, nothing published, nothing scheduled, nothing
-- read back from a network. What a person is saying with this write is "these are the accounts my
-- business posts from." It is a RECORD, and every surface that shows it must say so in those words.
--
-- THE LIVE-CONNECTION PATH IS NOT THIS, AND MUST NOT BE CONFUSED WITH IT. `meta-schedule-post`,
-- `meta-get-insights` and `meta-list-comments` exist and call the Graph API, but they read a single
-- PLATFORM-WIDE `META_PAGE_ACCESS_TOKEN`/`META_DEFAULT_PAGE_ID` from the environment and write
-- `paige_social_posts`, a table with NO tenant_id column. Pointing a tenant surface at them would
-- publish every workspace's post to one shared page — a §9 breach, not a feature. Per-tenant live
-- publishing needs per-tenant OAuth (provider app review, per-tenant tokens) and a tenant_id on
-- that table; both are out of this migration's scope and neither is implied by anything here.
--
-- ─── VERSION ─────────────────────────────────────────────────────────────────────────────────
--
-- 20261210000000. Chosen against the repo tree max at authoring time, 20261202000100
-- (_a_connection_survives_a_bad_moment.sql), with a deliberate gap above the 2026120x band so a
-- branch still moving in it cannot collide. The header of 20261130000000 records five collisions
-- in this range across two slices, and its own pre-merge re-verify caught the ledger moving while
-- that slice was open — so RE-VERIFY against the prod ledger before merge if this sits unmerged.
--
-- ─── AUTHORITY ───────────────────────────────────────────────────────────────────────────────
--
-- The writer is copied from `declare_client_payment_handling` (20261130000000) rather than
-- reinvented: session-resolved tenant, refusal-only expected-tenant, authority settled before the
-- row is touched, value read back off the updated row. The reader is copied from
-- `get_business_context_readiness` (20261170000000): same evidence class (a live, stateless read
-- over the workspace's own current record — no Rail signal, because the Rail is contact-scoped and
-- this fact is workspace-scoped), same tenant-scoped role gate, and it RETURNS the workspace it
-- resolved so a Chat caller can refuse rows that are not its conversation's (§9).
--
-- §59: both are SECURITY DEFINER, so both bypass RLS on `tenants`. The bodies re-enforce the
-- caller's scope themselves; the EXECUTE grant is never the guard.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- (A) THE WRITER
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_social_handles(
  _expected_tenant_id uuid,
  _handles            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor  uuid := auth.uid();
  _tenant uuid;
  _row    public.tenants;
  _clean  jsonb := '{}'::jsonb;
  _key    text;
  _value  text;
  -- The union of the two places the platform already names networks in tenant-visible text: the
  -- Systems Check registry question (20260816000000_systems_check_layer1.sql:255 — instagram,
  -- facebook, linkedin, tiktok, x) and the channels the Social surface draws (which adds youtube).
  -- src/solo/social-truth.ts carries the same list; widening one without the other lets a handle
  -- be typed in the form and refused here.
  _allowed constant text[] := ARRAY['instagram','facebook','linkedin','youtube','tiktok','x'];
BEGIN
  -- TWO CALLER CLASSES, and the split is the §59 rule rather than a convenience.
  --
  -- A JWT caller's tenant is ALWAYS server-resolved and the passed one is refusal-only. A
  -- service-role caller (PAIGE's own agent, via paige-mcp) has NO auth.uid() to resolve from, so
  -- the passed tenant is honored there and ONLY there — which is precisely the condition §59 names
  -- as the one place a supplied identity may be trusted. Every other path would be an auth bypass:
  -- if this arm ever became reachable with a live auth.uid(), a caller could name any workspace.
  IF _actor IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant IS NULL THEN
      RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
    END IF;

    -- Refusal-only, never a selector. current_user_tenant_id() reads profiles.active_tenant_id,
    -- which a workspace switch writes BEFORE the browser catches up — so a form opened against one
    -- workspace must abort rather than silently save into another.
    IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
      RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
        USING ERRCODE = '42501';
    END IF;

    -- TENANT-SCOPED, deliberately not a global app_role. `user_roles` carries no tenant_id, so
    -- has_role(caller,'admin') is tenant-agnostic and answers the wrong question in both directions
    -- (§59's global-role trap).
    IF NOT public.is_tenant_admin(_tenant) THEN
      RAISE EXCEPTION 'only an owner or admin may record this business''s social accounts'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := _expected_tenant_id;
    IF _tenant IS NULL THEN
      RAISE EXCEPTION 'a trusted caller must name the workspace it is writing for'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _handles IS NULL OR jsonb_typeof(_handles) <> 'object' THEN
    RAISE EXCEPTION 'social accounts must be sent as an object of network to handle';
  END IF;

  -- A FLAT OBJECT OF STRINGS, and the shape is load-bearing rather than stylistic.
  -- social_handles_captured.ts:21-23 counts an object's values with hasText(), which is true only
  -- of a non-empty STRING. The natural rich shape {instagram:{handle,url}} counts as ZERO there, so
  -- storing it would make the surface show accounts on record while the Systems Check reported none
  -- — on the exact check this seam exists to make passable. Richer per-network metadata, if it is
  -- ever wanted, belongs in a SIBLING key, never nested inside this one.
  FOR _key, _value IN SELECT key, value FROM jsonb_each_text(_handles) LOOP
    IF NOT (_key = ANY (_allowed)) THEN
      RAISE EXCEPTION 'that is not a network this workspace records: %', _key;
    END IF;
    IF jsonb_typeof(_handles -> _key) <> 'string' THEN
      RAISE EXCEPTION 'the handle for % must be text', _key;
    END IF;
    _value := nullif(btrim(_value), '');
    IF _value IS NOT NULL THEN
      IF length(_value) > 120 THEN
        RAISE EXCEPTION 'the handle for % is too long', _key;
      END IF;
      _clean := _clean || jsonb_build_object(_key, _value);
    END IF;
    -- A cleared field is an OMISSION, not a stored blank: hasText() ignores '' anyway, so a stored
    -- empty string would be a key the check cannot count and a person can still see. The surface
    -- and the check must never disagree about how many accounts are on record.
  END LOOP;

  -- ONE KEY, merged server-side. `features` also carries playbook_config, playbook, portal_config,
  -- enabled_skills, __feature_flag_owners (the Blueprint install-ownership registry, read by
  -- uninstall to decide what it may tear down) and system_workspace (which gates the managed email
  -- sender and suppresses the onboarding Systems Check). A tenant admin CAN update tenants.features
  -- directly under the live RLS policy — which is exactly why the write must not be a client-side
  -- read-modify-write of the whole object: it would clobber, forge or erase any of those keys.
  UPDATE public.tenants
     SET features = coalesce(features, '{}'::jsonb) || jsonb_build_object('social_handles', _clean)
   WHERE id = _tenant
   RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'this workspace could not be read, so nothing was written';
  END IF;

  -- Reports what was ACTUALLY written, read back off the updated row (§13). The caller renders this
  -- rather than echoing what it sent, so a value the database normalised or dropped can never be
  -- shown back as though it had been stored.
  RETURN jsonb_build_object(
    'tenant_id', _row.id,
    'social_handles', coalesce(_row.features -> 'social_handles', '{}'::jsonb),
    'recorded_count', (SELECT count(*) FROM jsonb_object_keys(coalesce(_row.features -> 'social_handles', '{}'::jsonb)))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_social_handles(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_social_handles(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_social_handles(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.record_social_handles(uuid, jsonb) IS
  'Records the social accounts a workspace posts from, at tenants.features->social_handles. The '
  'first writer that key has ever had — Systems Check #3 (social_handles_captured) reads it and '
  'nothing could set it. §38 CAPTURE-ONLY: creates no external provider state — no OAuth, no '
  'token, no provider API call, nothing published or scheduled. Merges one key so sibling feature '
  'flags cannot be clobbered.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- (B) THE SPINE READ — capability `social.presence`
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Same evidence class as business_context.readiness and team.authority: a live, stateless read over
-- the workspace's own current record. There is NO Rail signal here and that is deliberate, not an
-- omission — `record_rail_event` writes `paige_client_events`, which is CONTACT-scoped, and a
-- business's own account list names no contact. docs/brain/paige-spine-and-rail-state.md states the
-- distinction directly: a capability whose evidence is a live read over a tenant's own current
-- record "has no signal to resolve", and buys none of the Rail's properties (no history, no
-- citation, no attribution, no freshness boundary — the row is simply current as of the call).
--
-- WHAT IT RETURNS AND WHY THAT MUCH. The network and whether a handle is on record, plus the handle
-- itself. The handle is included where business_context.readiness withholds its raw values, and the
-- reason is a real difference in kind, not a relaxation: a social handle is a PUBLIC identifier the
-- business publishes on purpose, and PAIGE cannot reference an account in a draft without it. A
-- business phone or primary email is not that. The audience gate is identical either way.

CREATE OR REPLACE FUNCTION public.get_social_presence_evidence(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  network text,
  status text,
  handle text,
  as_of timestamptz,
  reason text,
  -- The workspace these rows describe. Returned so a caller can prove the rows belong to the
  -- conversation it is in: get_paige_persona_context() resolves a conversation's tenant
  -- client-link-first, so a user who is a linked CLIENT of workspace B and a member of workspace A
  -- holds a B-scoped conversation while this read resolves A. Without this column the binding is
  -- impossible rather than merely omitted (§9).
  tenant_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_handles jsonb;
  v_updated timestamptz;
  v_networks constant text[] := ARRAY['instagram','facebook','linkedin','youtube','tiktok','x'];
BEGIN
  -- A JWT-authenticated caller's tenant is ALWAYS server-resolved, never client-supplied
  -- (§9/§588). _tenant_id is honored only on the service-role path, where no JWT identity exists.
  IF v_uid IS NOT NULL THEN
    v_tenant := public.current_user_tenant_id();
  ELSE
    v_tenant := _tenant_id;
  END IF;

  IF v_tenant IS NULL THEN
    RETURN QUERY
    SELECT n, 'unavailable'::text, NULL::text, NULL::timestamptz,
           'workspace not resolved'::text, NULL::uuid
      FROM unnest(v_networks) AS n;
    RETURN;
  END IF;

  -- ROLE GATE (§59 — the EXECUTE grant is never the guard). This capability declares audience
  -- owner_internal, and a workspace's own CLIENTS are authenticated users of that same tenant, so
  -- without this gate current_user_tenant_id() would resolve a client-role caller's tenant and hand
  -- them the coach's internal record of which accounts are and are not set up. Tenant-scoped
  -- (is_tenant_admin on the RESOLVED tenant), deliberately not the global has_any_role() check —
  -- see get_business_context_readiness for the measured reason a global gate both wrongly admits
  -- and wrongly refuses here.
  --
  -- GUARDED ON v_uid, and a rollback proof is what proved it has to be. is_tenant_admin() keys on
  -- auth.uid(), which is NULL on the service-role path — so an unguarded gate refuses the trusted
  -- callers this function exists to serve (PAIGE's own agent via paige-mcp, and the Systems Check
  -- runner), while letting no one else through. They hold no JWT identity to carry a role, and
  -- their tenant was already resolved by the caller's own JWT verification before they got here.
  -- This is the same guard, for the same reason, as get_business_context_readiness (20261170000000).
  --
  -- Refused, not empty: the contract promises six rows on every call, so a refusal is six
  -- 'unavailable' rows with a reason — which also leaks nothing about whether any account exists.
  -- The rows still NAME the workspace, so a caller can tell "we may not tell you" from "these rows
  -- are not yours".
  IF v_uid IS NOT NULL
     AND NOT (public.is_tenant_admin(v_tenant) OR public.is_platform_owner())
  THEN
    RETURN QUERY
    SELECT n, 'unavailable'::text, NULL::text, NULL::timestamptz,
           'not permitted for this account'::text, v_tenant
      FROM unnest(v_networks) AS n;
    RETURN;
  END IF;

  SELECT coalesce(t.features -> 'social_handles', '{}'::jsonb), t.updated_at
    INTO v_handles, v_updated
    FROM public.tenants t
   WHERE t.id = v_tenant;

  IF v_handles IS NULL THEN
    RETURN QUERY
    SELECT n, 'unavailable'::text, NULL::text, NULL::timestamptz,
           'workspace record not readable'::text, v_tenant
      FROM unnest(v_networks) AS n;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    n,
    CASE WHEN nullif(btrim(coalesce(v_handles ->> n, '')), '') IS NOT NULL
         THEN 'on_record' ELSE 'not_recorded' END::text,
    nullif(btrim(coalesce(v_handles ->> n, '')), ''),
    -- The workspace row's own last-changed time. It is NOT a per-handle timestamp and must never be
    -- reported as one: nothing records when an individual handle was set, so the honest claim is
    -- "this workspace record last changed then", which is what the Chat renderer says.
    v_updated,
    NULL::text,
    v_tenant
  FROM unnest(v_networks) AS n;
END;
$$;

REVOKE ALL ON FUNCTION public.get_social_presence_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_social_presence_evidence(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_social_presence_evidence(uuid) IS
  'Spine capability social.presence. Live, stateless read of the accounts a workspace has recorded '
  'at tenants.features->social_handles: network, on_record/not_recorded, the declared handle, and '
  'the workspace resolved. Declared capture only — proves the account is claimed, never that it is '
  'connected, and carries no follower, reach, schedule or placement figure because none exists.';
