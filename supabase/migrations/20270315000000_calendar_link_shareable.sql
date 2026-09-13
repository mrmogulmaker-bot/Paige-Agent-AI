-- ---------------------------------------------------------------------------
-- E7 — Governed Calendar-link sharing: the shareability gate (ONE new function).
-- ---------------------------------------------------------------------------
-- Paige may PREPARE and (after the confirm gate) SEND a published calendar's
-- public booking link to a tenant contact. Before composing any link or invoking
-- the comms send seam, the caller must be able to answer ONE authoritative
-- question against the server: "is calendar X publicly shareable, in tenant T,
-- right now?"  That truth already lives in the public-booking resolver
-- (`loadCalendar`): a calendar is publicly reachable iff `enabled = true` AND it
-- has at least one host row. Every other lifecycle state — draft, paused,
-- archived, or setup-required — has `enabled <> true` and MUST refuse sharing.
--
-- This migration adds NO table, NO column, and NO second shareability model. It
-- exposes that single fact through one SECURITY DEFINER reader that:
--   • REUSES the ONE calendar caller-scope gate `_assert_can_manage_preset`
--     (§18/§59) — which raises P0002 (not found) or 42501 (forbidden / cross-
--     tenant) IN-BODY, never via the EXECUTE grant; and
--   • mirrors `public-booking` `loadCalendar` EXACTLY (`enabled = true` AND
--     `host_count >= 1`) rather than the publish-readiness bar
--     `_calendar_preset_block_reason` (which answers "can it be published", a
--     different question from "does the live link resolve now").
--
-- §208/§213 shape: additive DDL only (one CREATE OR REPLACE FUNCTION + its
-- grants). No writes, no schema change; STABLE-shaped read behind the caller gate.
-- §9/§51: cross-tenant / forged access is refused by the reused assert, so a
-- Client / Anonymous / cross-tenant caller can never learn a calendar's slug.
-- §2: coaching-generic; zero finance/credit wording.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calendar_link_shareable(_cal uuid, _tenant uuid DEFAULT NULL)
RETURNS TABLE(shareable boolean, reason text, slug text, title text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tid uuid; _enabled boolean; _slug text; _title text; _hosts int;
BEGIN
  -- Caller scope FIRST (§59 in-body): raises P0002 / 42501 before any field is read.
  -- JWT caller  -> requires can_manage_calendar(_cal); _tenant is ignored.
  -- Service role -> requires the passed _tenant to equal the calendar's tenant.
  _tid := public._assert_can_manage_preset(_cal, _tenant);

  SELECT c.enabled, c.slug, c.title
    INTO _enabled, _slug, _title
    FROM public.calendars c
   WHERE c.id = _cal;

  SELECT count(*) INTO _hosts
    FROM public.calendar_hosts
   WHERE calendar_id = _cal;

  -- Shareability truth mirrors public-booking `loadCalendar`: enabled = true AND >= 1 host.
  IF _enabled IS TRUE AND _hosts >= 1 THEN
    RETURN QUERY SELECT true, NULL::text, _slug, _title;
  ELSE
    RETURN QUERY SELECT
      false,
      CASE
        WHEN _enabled IS NOT TRUE THEN 'CALENDAR_NOT_PUBLIC'  -- draft / paused / archived / setup-required
        ELSE 'CALENDAR_NO_HOST'                               -- enabled but no host can take the meeting
      END,
      _slug,
      _title;
  END IF;
END $$;

-- Never anon (a public visitor must not probe shareability); the two legitimate
-- callers are an authenticated admin/coach (JWT -> can_manage_calendar) and the
-- service role (Paige's server path, gated on the tenant it resolved).
REVOKE ALL ON FUNCTION public.calendar_link_shareable(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_link_shareable(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.calendar_link_shareable(uuid, uuid) IS
  'E7 governed calendar-link sharing: authoritative "is this calendar publicly shareable in this tenant right now?" reader. Reuses _assert_can_manage_preset for §59 caller scope (P0002/42501 in-body); mirrors public-booking loadCalendar (enabled=true AND >=1 host). Returns (shareable, reason, slug, title); never emits a slug to a caller who cannot manage the calendar.';
