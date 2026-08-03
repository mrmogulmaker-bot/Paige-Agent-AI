-- supabase/migrations/20260803180000_hotfix_614_tenant_member_consent.sql
--
-- #614 (§9 HIGH) — Close the non-consensual foreign tenant_members ACTIVE-membership forge.
-- This is the separately-tracked "#612-follow" hole that #612 explicitly deferred: the earlier
-- #612 work established that "target is an ACTIVE tenant_members row of the caller's tenant" is a
-- consent oracle other surfaces trust — and that oracle is admin-forgeable, because the "Tenant
-- admins manage members" ALL policy (USING/CHECK = is_platform_owner() OR is_tenant_admin(tenant_id))
-- lets a tenant admin write {their tenant, ANY foreign user_id, status='active'} with NO consent
-- from that user.
--
-- OWNER RULING #614 = Option C (HYBRID with pending status), enforced by ROW STATE — no
-- user-callable GUC sentinel. An admin-initiated attempt to make a FOREIGN membership active is
-- neutralized at the table into an inert 'pending' seat, exactly like the #612 clients
-- linking-integrity trigger neutralizes a foreign client link.
--
-- THE INVARIANT (one rule closes every path): a JWT caller (auth.uid() NOT NULL) may never leave a
-- tenant_members row `status='active'` for a user OTHER than themselves UNLESS that exact
-- (user_id, active) membership already existed. Every way to newly mint a foreign-active row —
--   (1) a fresh INSERT {foreign, active},
--   (2) a non-active -> active transition (the insert-pending-then-activate bypass), AND
--   (3) a user_id repoint onto an already-active row (UPDATE ... SET user_id=<foreign> on a row
--       whose OLD.status='active' — which the naive "only guard status transitions" design misses,
--       because OLD.status is already 'active" so no status transition occurs)
-- — is COERCED to 'pending'. Case (3) was the residual hole the adversarial §9 pass found in the
-- first draft; folding it into the same "would the row END UP foreign-active, and was it not
-- foreign-active-for-this-same-user before?" test closes it with no extra branch.
--
-- WHY COERCE, NOT RAISE (this is the load-bearing refinement; RAISE was proven to break prod):
-- the legitimate admin "add teammate / grant coach" flow is a TWO-STEP writer — grant_tenant_member_role()
-- first INSERTs user_roles, whose AFTER trigger sync_user_role_to_tenant_member() INSERTs a
-- tenant_members row, THEN the RPC's own `INSERT ... status='active' ON CONFLICT DO UPDATE SET
-- status='active'` upserts it. Under a RAISE-on-foreign-activation design the reverse-sync's row is
-- coerced to 'pending', then the RPC's own upsert tries pending->active and RAISEs 42501, aborting
-- the whole RPC — killing admin add-member across god/agency/standalone/sub-account (verified by the
-- §37 producer inventory + §51 per-tier compliance pass). COERCING instead of raising closes the
-- IDENTICAL hole (the foreign seat still never becomes active) while letting those writers succeed:
-- their upsert simply lands an inert 'pending' invite. This IS "Option C hybrid pending status" —
-- coerce-to-pending is the mechanism the ruling names, not a deviation from it.
--
-- WHY A pending ROW GRANTS NOTHING: every membership predicate on this platform gates on
-- status='active' (is_tenant_admin / is_tenant_member / current_user_tenant_id /
-- agency_can_manage_child — verified via pg_get_functiondef), and the AFTER trigger
-- sync_tenant_member_to_user_roles() grants user_roles ONLY when NEW.status='active'. So a coerced
-- 'pending' seat yields zero roles, zero visibility, zero aggregate leak — it is a shown-but-inert
-- "invited, not yet joined" seat until the user themselves accepts.
--
-- WHY SECURITY INVOKER + search_path='': the trigger must observe the REAL caller (auth.uid(),
-- which reads request.jwt.claims), never a definer identity. SECURITY DEFINER does NOT change
-- request.jwt.claims, so inside grant_tenant_member_role() / change_user_role() /
-- sync_user_role_to_tenant_member() the caller is still the admin and the target still foreign —
-- this UNCONDITIONAL trigger therefore fires on their writes too and coerces them, with no RPC edits.
--
-- LEGITIMATE PATHS THAT STAY OPEN (proven, see harness): self-add and self-accept (NEW.user_id =
-- caller — genuine consent), all service-role / SECURITY DEFINER provisioning with no JWT
-- (auth.uid() IS NULL — accept-invite edge fn, provision_tenant, subaccount_inheritance, signup
-- feed), and role changes on an EXISTING active member (OLD active + same user_id — consent was
-- established when the row first went active).
--
-- GRANDFATHER: not retroactive — existing rows are untouched. Prod today holds 13 tenant_members
-- rows, all status='active', all legitimately provisioned (self / service-role / consent paths);
-- zero non-active rows exist, so nothing pre-existing can be laundered into a foreign-active forge.
--
-- KNOWN SEPARABLE FOLLOW-UP (NOT in-slice, filed as #614-follow-b): the direct `INSERT user_roles`
-- inside grant_tenant_member_role() / change_user_role() can still persist a GLOBAL app_role for a
-- foreign user in the cross-tenant-admin edge (_tenant != current_user_tenant_id()). That is a
-- global role, NOT an active tenant membership, and does NOT satisfy the #612 active-membership
-- oracle (its reverse-sync into tenant_members is coerced to pending by THIS trigger). It is a
-- lesser residual to close on the paired track, not required to close #614.
--
-- Proven end-to-end on prod inside ONE self-rolling-back statement (cases A–H, all PASS) before
-- merge — see the paired pre-merge proof. Idempotent: CREATE OR REPLACE FUNCTION; DROP TRIGGER IF
-- EXISTS then CREATE.

--------------------------------------------------------------------------------
-- PART 1 — Consent-enforcement trigger function.
-- SECURITY INVOKER + search_path='' so it observes the real caller (auth.uid()), never a definer.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_tenant_member_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  -- Service-role / SECURITY DEFINER paths with no JWT (signup, edge functions, provisioning)
  -- have no auth.uid(); they are trusted to write membership directly.
  IF _caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Would this write leave the row ACTIVE for someone other than the caller?
  IF NEW.status = 'active' AND NEW.user_id <> _caller THEN
    -- Allowed ONLY when the row was ALREADY active for this SAME user (e.g. a role change on an
    -- existing, already-consented member). Consent was established when it first went active.
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'active'
       AND OLD.user_id = NEW.user_id THEN
      NULL; -- pre-existing active membership for the same user — allow.
    ELSE
      -- Every newly-minted foreign-active outcome — fresh INSERT, non-active -> active flip, OR a
      -- user_id repoint onto an already-active row — is neutralized to an inert 'pending' seat.
      NEW.status := 'pending';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

--------------------------------------------------------------------------------
-- PART 2 — Attach the trigger. Fires on every INSERT and every UPDATE (incl. the ON CONFLICT
-- DO UPDATE reactivation path used by the SECURITY DEFINER RPCs and any direct-DML repoint).
-- Name sorts before trg_tenant_members_updated_at (c < u) so consent evaluates first among the
-- BEFORE triggers; updated_at touches no status/user_id, so ordering is immaterial to correctness.
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_tenant_members_consent ON public.tenant_members;
CREATE TRIGGER trg_tenant_members_consent
  BEFORE INSERT OR UPDATE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_member_consent();
