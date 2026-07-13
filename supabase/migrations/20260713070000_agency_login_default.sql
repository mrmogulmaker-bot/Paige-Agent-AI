-- Agency login default (Wave 1 IA cleanup) — per-owner post-login landing preference.
--
-- OWNER DECISION (locked): an agency owner's FIRST signup lands on /agency; on
-- ONGOING logins they resume EITHER the agency side or their last active account,
-- governed by this per-owner setting. This migration only ADDS the preference
-- column (and an optional §10 setter). It changes NO landing logic — the frontend
-- (resolveLandingRoute) reads this column and decides the route. SQL stays inert.
--
-- Audience (§9): this is a TENANT/agency-operator preference on their OWN profile,
-- keyed by auth.uid(). It is not a platform/God default and seeds no vertical
-- content. Coaching-generic, §2-clean.
--
-- Eligibility is NEVER account_type (which flips to the child's on entry); the
-- server-proven signal is agency_switch_context().is_agency_manager. This column
-- only expresses WHERE an eligible agency owner lands, not WHETHER they are one.

-- ── (1) The per-owner preference column ───────────────────────────────────────
-- 'agency'       → on login, land on the /agency shell (the default; matches the
--                  first-signup behavior so nothing surprises a fresh owner).
-- 'last_account' → on login, resume the last active account (profiles.active_tenant_id).
-- NOT NULL DEFAULT 'agency' so every existing and future row has a valid value with
-- no backfill; CHECK pins the enum so the frontend can trust it without validating.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agency_login_default text NOT NULL DEFAULT 'agency'
    CHECK (agency_login_default IN ('agency', 'last_account'));

-- ── (2) §10 Paige-callable setter — set_agency_login_default(_pref) ────────────
-- auth.uid()-keyed: the caller's own token IS the scope, nothing to forge (§9/§13).
-- Validates the enum, updates ONLY the caller's own row, returns the stored value.
-- The Settings UI is one caller of this seam; Paige's agent is another (§10) — no
-- preference write lives only inside a React component.
CREATE OR REPLACE FUNCTION public.set_agency_login_default(_pref text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _pref IS NULL OR _pref NOT IN ('agency', 'last_account') THEN
    RAISE EXCEPTION 'invalid_agency_login_default' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET agency_login_default = _pref
   WHERE user_id = auth.uid();

  RETURN jsonb_build_object('agency_login_default', _pref);
END;
$$;

-- ── (3) Least privilege — authenticated only ──────────────────────────────────
-- Keys off auth.uid(), so authenticated is exactly the audience; no anon/public.
REVOKE ALL ON FUNCTION public.set_agency_login_default(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_agency_login_default(text) TO authenticated;
