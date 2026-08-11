-- #612 (§9 HIGH) — Close the forgeable clients.linked_user_id oracle that re-opens the
-- credit-report-uploads read closed by #611, and that also backs tasks,
-- quickbooks_connections/financials/transactions, and chat_message_embeddings.
--
-- Root cause: clients.linked_user_id is admin/staff-writable with no linking check, so a
-- tenant-admin can forge {their tenant, victim uid} and pass the #611 storage-policy join.
--
-- Load-bearing fix (Part 2): a BEFORE INSERT OR UPDATE OF linked_user_id trigger — NOT a
-- per-policy WITH CHECK, because WITH CHECK cannot see OLD and permissive policies are OR'd,
-- so a forge can slip through any single permissive CHECK. The trigger is unconditional.
--
-- Parts:
--   1. Trigger fn enforce_clients_linking_integrity() + GUC allowlist for handle_new_user.
--   2. The trigger itself.
--   3. Tenant-scope clients_admins_full (owner-ruled full scope).
--
-- Idempotent: CREATE OR REPLACE FUNCTION / DROP ... IF EXISTS / DROP POLICY IF EXISTS.
--
-- CONSENT-BASED linking (why there is no foreign-linking RPC): the "Move to Internal" browser
-- flow (ClientManagementDashboard) now creates an UNLINKED internal client (like
-- AddInternalClientDialog); linkage to the auth user happens ONLY through the existing
-- invite-accept path (accept_tenant_invite), consistent with how the app already models
-- linked_user_id ("Not Invited" / "Locked until invite accepted"). An earlier draft added a
-- link_auth_user_to_internal_client() SECURITY DEFINER RPC that validated "target is an active
-- tenant_members row of the caller's tenant" — the adversarial §9 verifier proved that oracle
-- is itself admin-forgeable (the "Tenant admins manage members" policy lets a tenant-admin mint
-- an active membership for any uid WITHOUT consent), which re-opened the forge at 2 steps.
-- Dropping the RPC and linking only via consent closes the forge with ZERO residual. The
-- forgeable-membership hole is a separate, pre-existing §9 bug tracked independently (#612-follow).

--------------------------------------------------------------------------------
-- PART 1a — Linking-integrity trigger function (SECURITY INVOKER: it must observe the
-- REAL caller via auth.uid(), never a definer identity).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_clients_linking_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  -- Allowlisted server linker (defensive handle_new_user) sets this txn-local GUC.
  IF current_setting('paige.link_ok', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- Trusted service-role / definer paths with no JWT (signup, edge functions) have no auth.uid().
  IF _caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A JWT caller may only create a row linked to THEIR OWN uid (self-link), never a foreign one.
    IF NEW.linked_user_id IS NOT NULL AND NEW.linked_user_id <> _caller THEN
      RAISE EXCEPTION
        'clients.linked_user_id may only be set to the linking caller''s own uid; forging a link to a foreign user is not permitted'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- A JWT caller may only (re)link a row to THEIR OWN uid; they may not relink to a foreign
    -- user and may not unlink (NULL) — unlink/foreign-relink must go through an allowlisted seam.
    IF NEW.linked_user_id IS DISTINCT FROM OLD.linked_user_id
       AND (NEW.linked_user_id IS NULL OR NEW.linked_user_id <> _caller) THEN
      RAISE EXCEPTION
        'clients.linked_user_id may only be changed to the linking caller''s own uid; foreign relink/unlink is not permitted'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

--------------------------------------------------------------------------------
-- PART 1b — Defensive GUC allowlist inside handle_new_user().
-- handle_new_user runs on signup with auth.uid() = NULL, so the trigger's NULL-caller branch
-- already passes it; the set_config line makes that intent explicit and future-proof if the
-- signup path ever gains a JWT. Body reproduced VERBATIM from prod (pg_get_functiondef); the
-- ONLY change is the `perform set_config(...)` line immediately after `begin`.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ref_code  text;
  v_full_name text;
  v_first     text;
  v_last      text;
  v_owner_id  uuid;
begin
  -- #612: allowlist this postgres-owned linker so the clients linking-integrity trigger
  -- never blocks the signup auto-create (txn-local; auto-clears at commit).
  perform set_config('paige.link_ok', '1', true);

  v_ref_code := nullif(upper(trim(new.raw_user_meta_data->>'referral_code')), '');
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');

  insert into public.profiles (user_id, full_name, referral_code)
  values (new.id, nullif(v_full_name, ''), v_ref_code);

  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  -- Auto-create CRM contact for every new signup (skip admins; there are none at insert time anyway).
  v_first := coalesce(nullif(split_part(v_full_name, ' ', 1), ''), split_part(coalesce(new.email, ''), '@', 1));
  v_last  := coalesce(nullif(substring(v_full_name from position(' ' in v_full_name) + 1), ''), '');

  -- Owner of the platform owns auto-created contacts so admins can see them
  select u.id into v_owner_id
  from auth.users u
  join public.app_settings_owner o on lower(u.email) = lower(o.owner_email)
  limit 1;

  if v_owner_id is null then
    v_owner_id := new.id; -- fallback so NOT NULL constraint holds
  end if;

  begin
    insert into public.clients (
      created_by, first_name, last_name, email, linked_user_id,
      lifecycle_stage, source, status, created_by_channel_type
    ) values (
      v_owner_id,
      coalesce(nullif(v_first, ''), 'New'),
      v_last,
      new.email,
      new.id,
      'lead',
      'signup',
      'active',
      'signup'
    );
  exception when others then
    raise warning 'handle_new_user: client autocreate failed: %', sqlerrm;
  end;

  return new;
end;
$function$;

--------------------------------------------------------------------------------
-- PART 2 — Attach the trigger. Fires on every INSERT and on any UPDATE that touches
-- linked_user_id.
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_clients_linking_integrity ON public.clients;
CREATE TRIGGER trg_clients_linking_integrity
  BEFORE INSERT OR UPDATE OF linked_user_id ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clients_linking_integrity();

--------------------------------------------------------------------------------
-- PART 3 — Tenant-scope the clients_admins_full policy (owner-ruled FULL SCOPE).
-- Live USING/CHECK = has_any_role(auth.uid(), {admin,super_admin}) UNSCOPED, which let any
-- global admin reach every tenant's clients. Rewrite BOTH USING and WITH CHECK to require
-- either platform ownership OR the row's tenant matching the caller's active tenant.
-- OQ#1: the only global admin who is NOT a tenant-admin is admin@paigeagent.ai, which holds
-- super_admin = platform owner, covered by is_platform_owner(). So this breaks no operator.
-- Preserves the original AS PERMISSIVE / FOR ALL / TO authenticated shape.
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS clients_admins_full ON public.clients;
CREATE POLICY clients_admins_full ON public.clients
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
    AND (
      public.is_platform_owner()
      OR (tenant_id IS NOT NULL AND tenant_id = public.current_user_tenant_id())
    )
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
    AND (
      public.is_platform_owner()
      OR (tenant_id IS NOT NULL AND tenant_id = public.current_user_tenant_id())
    )
  );
