-- =============================================================================
-- Spine Wave 0 — Rail Recovery (#746)
--
-- THE DEFECT. `paige_client_events` carries what PAIGE actually did, and the
-- browser cannot read a single row of it. `20260712190000:94` granted SELECT to
-- `authenticated`; `20260712200000:25` revoked it; nothing re-granted it.
-- Verified on production ref xygzykjyynhzqytbqnzu on 2026-09-02:
--
--   has_table_privilege('authenticated','public.paige_client_events','SELECT')
--     -> false
--
-- So every history read returns `42501` BEFORE row-level security is consulted
-- — the privilege check refuses first, and `pce_staff_read` / `pce_client_read`
-- are never evaluated at all. Two of the three shipped consumers then render
-- that refusal as an empty feed, which tells an owner that PAIGE has done
-- nothing. A read that failed and a history that is genuinely empty are
-- different statements, and only one of them was being made.
--
-- WHY A RESOLVER AND NOT A RE-GRANT. Three independent reasons, any one of
-- which is sufficient:
--
--   1. `src/solo/data/useSoloActivityFeed.ts` reads this table with NO `.eq()`
--      filter at all — it leans entirely on `pce_staff_read`. Re-granting SELECT
--      makes an unfiltered browser read of a cross-tenant activity table live,
--      and its correctness then rests on one policy staying exactly as it is.
--   2. PR #644 REVOKEs every remaining browser privilege on this table on its
--      way to an RPC-only boundary. A re-grant would fight it; this agrees with
--      it and reconciles #746 with #735 rather than choosing independently.
--   3. The rail carries producer-authored text. A resolver can return the
--      reviewed subset; a table grant returns whatever the columns hold, now and
--      after every future column is added.
--
-- WHAT ALREADY EXISTS, AND IS NOT REBUILT HERE. `get_client_rail(uuid,integer,
-- text)` already serves the CLIENT-scoped surface: SECURITY DEFINER, pinned
-- search_path, requires `auth.uid()`, resolves the tenant from the contact row
-- server-side, gates on staff-in-active-tenant OR subject linkage, and
-- lens-redacts payload / actor_user_id / ref_* for a client caller. Production
-- confirms `authenticated` already holds EXECUTE on it. The client scope is
-- therefore ADOPTED, not reinvented — this migration adds nothing for it.
--
-- WHAT IS MISSING, AND IS ADDED HERE. There is no TENANT-scoped resolver. The
-- owner's own Command Center rail and the Solo activity feed are workspace
-- reads, and `get_client_rail` is keyed on one contact.
--
-- WHY NOT #644's RESOLVER. `get_solo_mind_rail_events` is Mind-shaped and
-- deliberately returns NO `title`/`summary` — Mind is a model-ingestion surface
-- and producer text must not reach it. An owner-visible feed renders exactly
-- those two fields; adopting that resolver would produce a column of blank
-- rows. These are two contracts over one table, split by AUDIENCE, and this one
-- does not weaken the other: nothing here grants Mind any content it lacks.
--
-- THE AUTHORIZATION IS THE POLICY, RESTATED. A SECURITY DEFINER function
-- bypasses RLS, so §59 requires the body to re-enforce the caller's scope
-- rather than lean on the EXECUTE grant. This reproduces `pce_staff_read`
-- exactly — `is_platform_owner()` OR (row tenant = caller's active tenant AND
-- caller holds a staff role) — through the same canonical helpers the policy
-- itself calls.
--
-- ON `current_user_tenant_id()` RATHER THAN RAW `profiles.active_tenant_id`:
-- the canonical resolver re-checks active membership before honouring a stored
-- active tenant and falls back to the earliest active membership. Reading the
-- column raw is the shape behind the §51 / #588 defect, so this uses the helper
-- the policy uses. That is also what makes "the resolver and the policy cannot
-- drift apart" a true statement rather than an intention.
--
-- THE CALLER CANNOT NAME A TENANT. There is no tenant parameter. A parameter
-- that is always overridden is a parameter someone eventually trusts.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_solo_rail_activity(
  p_limit integer DEFAULT 50
) RETURNS TABLE (
  id              uuid,
  event_kind      text,
  surface         text,
  actor_type      text,
  audience        text,
  visibility      text,
  from_department text,
  to_department   text,
  title           text,
  summary         text,
  occurred_at     timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_owner  boolean;
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  -- The EXECUTE grant is not the guard (§59). No session, no rows.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RAIL_FORBIDDEN';
  END IF;

  v_owner  := public.is_platform_owner();
  v_tenant := public.current_user_tenant_id();

  -- A caller who is neither the platform owner nor a staff member of a resolved
  -- active tenant is REFUSED, not answered with zero rows. An empty result and a
  -- denial are the two states this whole repair exists to keep apart, so the
  -- function must not collapse them either.
  IF NOT v_owner THEN
    IF v_tenant IS NULL
       OR NOT public.has_any_role(v_uid, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RAIL_FORBIDDEN';
    END IF;
  END IF;

  -- A platform owner with no resolved active tenant has not named a workspace,
  -- and this contract has no cross-tenant mode. Refuse rather than invent one.
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RAIL_FORBIDDEN';
  END IF;

  RETURN QUERY
  SELECT e.id, e.event_kind, e.surface, e.actor_type, e.audience, e.visibility,
         e.from_department, e.to_department, e.title, e.summary, e.occurred_at
  FROM public.paige_client_events e
  WHERE e.tenant_id = v_tenant
  ORDER BY e.occurred_at DESC
  LIMIT v_limit;
END $$;

-- NOT RETURNED, and each omission is deliberate:
--   payload        raw producer/provider JSON — never crosses to a browser
--   actor_user_id  an auth identity
--   ref_table/ref_id  internal row references
--   tenant_id      the caller cannot choose it, so it tells them nothing
--   contact_id     an internal client identifier. The tenant-scoped consumers do
--                  not render it; the current direct read selects it anyway, so
--                  routing through this resolver DISCLOSES STRICTLY LESS than
--                  the read it replaces.
REVOKE ALL ON FUNCTION public.get_solo_rail_activity(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_solo_rail_activity(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_solo_rail_activity(integer) IS
  'Owner-visible tenant-scoped Context Rail history. Reproduces pce_staff_read in-body; '
  'returns reviewed display fields only; refuses rather than returning zero rows. '
  'Client-scoped reads use get_client_rail. Mind uses its own content-free resolver (#644).';

-- The table stays RPC-only. This restates the boundary #644 also asserts; it
-- does not widen anything, and it is here so that this migration alone leaves
-- the table correct even if applied on its own.
REVOKE SELECT ON public.paige_client_events FROM authenticated, anon;
