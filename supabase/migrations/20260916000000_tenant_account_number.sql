-- ============================================================================
-- §65 R0 substrate — tenants.account_number (owner-locked 2026-08-17)
--
-- The permanent, unique, per-account URL address the route tree is rooted at
-- (`/agency/{account_number}/…`). Owner rulings encoded here:
--   • OFFSET/SCRAMBLED, not raw sequential — a 7-digit number in [1000000,9999999]
--     assigned at RANDOM. Owner intent: a raw grep of URLs in the wild must NOT
--     reveal the platform tenant count or signup order. Random assignment reveals
--     neither (there is no sequence to reverse), which satisfies that bar more
--     strongly than a reversible multiplicative scramble would.
--   • PERMANENT — assigned once at creation, never reused, never changed by this
--     migration's logic. It survives tier promotions, vanity-URL edits, redirects
--     (a later vanity `url_segment` is a SEPARATE, editable column; this number is
--     the stable fallback that always resolves — taxonomy §2b).
--   • ADDRESS, NOT A GRANT (§9) — the number only addresses an account; every read
--     is still gated by session + RLS / the §51 firewall. A guessed number exposes
--     nothing; it just fails the auth/scope check.
--
-- §37: a BEFORE INSERT trigger assigns the number on EVERY tenant-creation path
-- (provision_tenant, create_subaccount, MCP, manual) with zero per-caller change.
--
-- Honest note (§13): the number space is 9,000,000. At platform scale this is
-- ample; the generator retries on the (vanishingly rare) collision and raises if a
-- bounded retry budget is exhausted, so a silent duplicate is impossible (the
-- UNIQUE constraint is the backstop). If cryptographic order-hiding is ever
-- required beyond "raw grep reveals nothing", widen the space or add a keyed
-- permutation in a follow-up — not needed for the owner's stated constraint.
-- ============================================================================

-- 1. The column — unique, nullable during backfill, no default (the trigger fills it).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS account_number bigint;

-- Unique index (partial-safe: allows the brief NULL window during backfill).
CREATE UNIQUE INDEX IF NOT EXISTS tenants_account_number_key
  ON public.tenants (account_number)
  WHERE account_number IS NOT NULL;

-- 2. The generator — a random unused 7-digit number. SECURITY DEFINER so the
--    INSERT trigger (and backfill) can read the full account_number set to avoid
--    collisions regardless of the caller's RLS scope. Returns ONLY a generated
--    integer; it exposes no tenant data (so no §59 caller-scope leak), and it is
--    internal-only (REVOKEd from anon/authenticated below).
CREATE OR REPLACE FUNCTION public.gen_tenant_account_number()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate bigint;
  attempts  int := 0;
BEGIN
  LOOP
    -- 7-digit space [1000000, 9999999]: no leading zero, not a low guessable start.
    candidate := floor(random() * 9000000)::bigint + 1000000;
    PERFORM 1 FROM public.tenants WHERE account_number = candidate;
    IF NOT FOUND THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts >= 100 THEN
      -- Astronomically unlikely at any realistic tenant count; fail LOUD, never
      -- silently return a colliding number (§13/§32).
      RAISE EXCEPTION 'gen_tenant_account_number: exhausted % attempts finding a free number', attempts;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.gen_tenant_account_number() FROM PUBLIC, anon, authenticated;

-- 3. Assign-on-insert trigger — fires on ALL creation paths (§37). Only sets the
--    number when absent, so an explicit value (e.g. a data migration) is respected.
CREATE OR REPLACE FUNCTION public.assign_tenant_account_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_number IS NULL THEN
    NEW.account_number := public.gen_tenant_account_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_tenant_account_number ON public.tenants;
CREATE TRIGGER trg_assign_tenant_account_number
  BEFORE INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_tenant_account_number();

-- 4. Backfill every existing tenant (13 today) — one at a time so each collision
--    check sees the rows already assigned in this loop.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.tenants WHERE account_number IS NULL LOOP
    UPDATE public.tenants
      SET account_number = public.gen_tenant_account_number()
      WHERE id = r.id;
  END LOOP;
END;
$$;

-- 5. Now that every row is filled, enforce NOT NULL so no tenant can ever exist
--    without an address.
ALTER TABLE public.tenants
  ALTER COLUMN account_number SET NOT NULL;

COMMENT ON COLUMN public.tenants.account_number IS
  '§65 R0: permanent unique random 7-digit URL address (/agency/{n}/…). Offset/scrambled per owner ruling 2026-08-17 (reveals no count/order). Assigned by trg_assign_tenant_account_number on every insert. Address not a grant (§9) — RLS still gates every read.';
