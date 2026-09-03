-- Sales Operations Slice A — the first writer for how a business takes money from its own clients.
--
-- ─── WHAT WAS ACTUALLY BROKEN ────────────────────────────────────────────────────────────────
--
-- `tenants.payment_processor_declared` and `tenants.payment_methods_declared` have shipped since
-- the Systems Check L2 migration, and two runners read them:
--   supabase/functions/_shared/systems-check-runners/payment_processor_connected.ts  (check #9)
--   supabase/functions/_shared/systems-check-runners/payment_methods_declared.ts     (check #10)
--
-- A repo-wide search for a WRITER of either column returns NOTHING. No RPC, no edge function, no
-- UI, no MCP tool, no remediation path. So both checks have been structurally unpassable for every
-- tenant since the day they shipped: the surface tells an owner to "tell Paige which processor the
-- business uses" and there is nowhere in the product that records the answer. This is the seam
-- that closes that.
--
-- ─── WHY THIS IS THE §38-SAFE HALF OF "CONNECT YOUR PROVIDER" ────────────────────────────────
--
-- §38: Paige is never merchant of record for a tenant→client charge, and a tenant brings its own
-- processor. Two functions in this repo already move real money in the other direction and are
-- deliberately NOT touched here:
--
--   tenant-checkout-session   destination charges on PAIGE's platform account — the live §38
--                             violation recorded against #458. Never called from Sales.
--   tenant-stripe-connect     `start_onboarding` mints a real Stripe Express account.
--
-- Both create EXTERNAL PROVIDER STATE. This function creates none: it is two columns on the
-- tenant's own row, and it is processor-AGNOSTIC by construction — the allow-list is the same
-- seven values the CHECK constraint already carries, and Stripe is one of seven rather than the
-- assumed one. Declaring "square" here is exactly as complete as declaring "stripe". That is the
-- §38 correction (master-doc §10 miss #28) applied to the write path instead of only the read.
--
-- What a person is saying with this write is "here is how my clients pay me". It is a RECORD, not
-- a connection: nothing is charged, no account is onboarded, no token is stored, no API is called.
-- The surface must say so in those words, and it does.
--
-- ─── VERSION ─────────────────────────────────────────────────────────────────────────────────
--
-- 20261130000000. The header of 20261110000000 records FIVE version collisions across two slices
-- in this range, so both maxima were checked rather than just the repo's:
--     prod ledger max applied      20261111000000   (MCP query against xygzykjyynhzqytbqnzu)
--     highest on ANY remote branch 20261120000000   (scan of every remote head)
--     in flight, billing branch    20261111050000   _the_workspace_can_connect_a_payment_method
-- 20261130000000 sorts after all three WITH headroom, deliberately skipping the 2026112x band the
-- billing branch is still moving in.
--
-- AND THE PRE-MERGE RE-VERIFY EARNED ITS KEEP. Re-checked immediately before merge, prod's ledger
-- max had MOVED to 20261120000000 — the billing branch merged and applied while this slice was
-- open, which is exactly the window the five prior collisions fell into. 20261130000000 still sorts
-- strictly after it, and a fresh scan of every remote head shows the only 20261130000000 anywhere
-- is this file, so the version stands. The three numbers above are kept as the choosing-time
-- record; this paragraph is the state at merge. Re-verify again if this sits unmerged — the base
-- moves after you look at it, which is the whole reason the step exists.
--
-- ─── AUTHORITY ───────────────────────────────────────────────────────────────────────────────
--
-- Copied from `save_solo_offer` (20261110000000/20261111000000) rather than reinvented:
-- session-resolved tenant, refusal-only expected-tenant, authority settled before the row is
-- touched. §59: this is SECURITY DEFINER, so it bypasses RLS on `tenants` — the body re-enforces
-- the caller's scope itself, and the EXECUTE grant is never the guard.

CREATE OR REPLACE FUNCTION public.declare_client_payment_handling(
  _expected_tenant_id uuid,
  _processor          text,
  _methods            text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor     uuid := auth.uid();
  _tenant    uuid := public.current_user_tenant_id();
  _row       public.tenants;
  -- `_processor` and `_methods` are the PARAMETERS, reassigned in place after normalisation —
  -- the same shape `save_solo_offer` uses for its classified fields. Re-declaring them here would
  -- be a duplicate declaration, not a shadow.
  -- The allow-lists are the CHECK constraints' own values, restated so the caller gets a sentence
  -- naming the field instead of a constraint name. If a later migration widens either CHECK, this
  -- function refuses the new value loudly rather than writing something the surface cannot read —
  -- the same reason `useCatalogOffers` narrows `tenant_prices.kind` instead of passing it through.
  _allowed_processors constant text[] :=
    ARRAY['stripe','paypal','square','bank_merchant','quickbooks_payments','manual','not_yet'];
  _allowed_methods constant text[] :=
    ARRAY['cards','ach','zelle','wire','check','cash','bank_transfer','crypto','other'];
  _bad text;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;

  -- Refusal-only. `current_user_tenant_id()` reads `profiles.active_tenant_id`, which a workspace
  -- switch writes BEFORE the browser catches up, so a form opened against one workspace must never
  -- be saved into another the same person also belongs to. Disagreement aborts; it never redirects.
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may record how this business takes payment'
      USING ERRCODE = '42501';
  END IF;

  _processor := nullif(btrim(coalesce(_processor, '')), '');
  IF _processor IS NULL THEN
    RAISE EXCEPTION 'say which processor this business uses, or say not_yet';
  END IF;
  IF NOT (_processor = ANY (_allowed_processors)) THEN
    RAISE EXCEPTION 'that is not a payment processor this workspace records: %', _processor;
  END IF;

  -- NULL means "leave the methods alone"; an empty array means "clear them". They are different
  -- instructions and collapsing them would make it impossible to change the processor without
  -- also wiping a list the person never touched.
  IF _methods IS NULL THEN
    _methods := NULL;
  ELSE
    SELECT array_agg(DISTINCT m ORDER BY m)
      INTO _methods
      FROM unnest(_methods) AS m
     WHERE nullif(btrim(m), '') IS NOT NULL;
    _methods := coalesce(_methods, ARRAY[]::text[]);

    SELECT m INTO _bad
      FROM unnest(_methods) AS m
     WHERE NOT (m = ANY (_allowed_methods))
     LIMIT 1;
    IF _bad IS NOT NULL THEN
      RAISE EXCEPTION 'that is not a payment method this workspace records: %', _bad;
    END IF;
  END IF;

  UPDATE public.tenants
     SET payment_processor_declared = _processor,
         payment_methods_declared   = coalesce(_methods, payment_methods_declared)
   WHERE id = _tenant
   RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'this workspace could not be read, so nothing was written';
  END IF;

  -- Reports what was ACTUALLY written, read back off the updated row (§13). The caller renders
  -- this rather than echoing what it sent, so a value the database normalised or refused can
  -- never be shown back as if it had been stored.
  RETURN jsonb_build_object(
    'tenant_id', _row.id,
    'payment_processor_declared', _row.payment_processor_declared,
    'payment_methods_declared', to_jsonb(_row.payment_methods_declared)
  );
END;
$function$;

-- The EXECUTE grant is not the access control — the body above is (§59). anon is revoked because
-- how a business takes money is not a public fact, and this function has no token or slug path
-- that would make it one.
REVOKE ALL ON FUNCTION public.declare_client_payment_handling(uuid, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.declare_client_payment_handling(uuid, text, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.declare_client_payment_handling(uuid, text, text[]) TO authenticated;

COMMENT ON FUNCTION public.declare_client_payment_handling(uuid, text, text[]) IS
  'Records how a workspace takes money from its OWN clients: tenants.payment_processor_declared '
  '+ payment_methods_declared. Processor-agnostic (§38) and the first writer either column has '
  'had — Systems Check #9 and #10 read them and nothing could set them. Creates NO external '
  'provider state: no charge, no onboarding, no token, no provider API call.';
