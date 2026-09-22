-- INT-163 — the signer seam, the tier gate, and the grant that had to be narrowed.
--
-- The independent review found that no code path anywhere inserted a signer, so every control below
-- the send was unreachable. These assertions exist because "unreachable" is exactly the class of
-- defect a schema proof cannot see by reading: every trigger fired correctly, on rows that could
-- never exist in production. N1 is therefore the most important line in this file — it drives the
-- product's own create path and counts what came out.
\set QUIET on
\set ON_ERROR_STOP on

SET test.uid   = '11111111-0000-4000-8000-00000000000a';
SET test.admin = 'true';
SET test.member= 'true';

-- ── N1 — creating an agreement makes its counterparty, derived from the client it is with ────────
SET test.tenant = 'aaaaaaaa-0000-4000-8000-000000000001';
DO $$
DECLARE _a jsonb; _id uuid; _n int; _mail text; _ord int;
BEGIN
  _a := public.save_paige_agreement(
    _expected_tenant_id := 'aaaaaaaa-0000-4000-8000-000000000001',
    _agreement_id := NULL,
    _contact_id := 'c1111111-0000-4000-8000-000000000001',
    _title := 'Seam control',
    _body_markdown := 'Terms.');
  _id := (_a ->> 'id')::uuid;
  SELECT count(*) INTO _n FROM public.paige_agreement_signers WHERE agreement_id = _id;
  SELECT email, signing_order INTO _mail, _ord
    FROM public.paige_agreement_signers WHERE agreement_id = _id;
  RAISE NOTICE 'N1 signers=% email=% order=%', _n, _mail, _ord;

  -- And the link the product actually issues now succeeds, which it could not before.
  PERFORM public.issue_agreement_signing_link('aaaaaaaa-0000-4000-8000-000000000001', _id, 30);
  RAISE NOTICE 'N1 link issued = %', (SELECT status FROM public.paige_agreements WHERE id = _id);
END $$;

-- ── N2 — a top-level agency holds no client book, so it holds no agreements (§61) ────────────────
SET test.tenant = 'dddddddd-0000-4000-8000-000000000004';
DO $$
DECLARE _s text;
BEGIN
  PERFORM public.save_paige_agreement(
    _expected_tenant_id := 'dddddddd-0000-4000-8000-000000000004',
    _agreement_id := NULL,
    _contact_id := 'c4444444-0000-4000-8000-000000000004',
    _title := 'Agency attempt',
    _body_markdown := 'Terms.');
  RAISE NOTICE 'N2 UNEXPECTED — a top-level agency created an agreement';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE;
  RAISE NOTICE 'N2 agency refused % %', _s, CASE WHEN _s = '42501' THEN 'PASS' ELSE 'UNEXPECTED' END;
END $$;

-- ── N3/N4 — explicit signers: next distinct order, duplicate refused, non-draft refused ──────────
SET test.tenant = 'aaaaaaaa-0000-4000-8000-000000000001';
DO $$
DECLARE _a jsonb; _id uuid; _r jsonb; _s text;
BEGIN
  _a := public.save_paige_agreement(
    _expected_tenant_id := 'aaaaaaaa-0000-4000-8000-000000000001',
    _agreement_id := NULL,
    _contact_id := 'c1111111-0000-4000-8000-000000000001',
    _title := 'Two parties',
    _body_markdown := 'Terms.');
  _id := (_a ->> 'id')::uuid;

  _r := public.add_agreement_signer('aaaaaaaa-0000-4000-8000-000000000001', _id,
        'Second Party', 'Second@Example.com', 'tenant_signatory');
  RAISE NOTICE 'N3 added order=% email=%', _r ->> 'signing_order', _r ->> 'email';

  BEGIN
    PERFORM public.add_agreement_signer('aaaaaaaa-0000-4000-8000-000000000001', _id,
            'Clash', 'clash@example.com', 'witness', 1);
    RAISE NOTICE 'N4a UNEXPECTED — two signers took the same position';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE;
    RAISE NOTICE 'N4a duplicate order refused % %', _s, CASE WHEN _s = '23505' THEN 'PASS' ELSE 'UNEXPECTED' END;
  END;

  BEGIN
    PERFORM public.add_agreement_signer('aaaaaaaa-0000-4000-8000-000000000001', _id,
            'Same Person', 'second@example.com', 'witness');
    RAISE NOTICE 'N4b UNEXPECTED — the same address was asked twice';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE;
    RAISE NOTICE 'N4b duplicate email refused % %', _s, CASE WHEN _s = '23505' THEN 'PASS' ELSE 'UNEXPECTED' END;
  END;

  PERFORM public.issue_agreement_signing_link('aaaaaaaa-0000-4000-8000-000000000001', _id, 30);
  BEGIN
    PERFORM public.add_agreement_signer('aaaaaaaa-0000-4000-8000-000000000001', _id,
            'Too Late', 'late@example.com', 'witness');
    RAISE NOTICE 'N4c UNEXPECTED — a signer joined a document already out for signature';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE;
    RAISE NOTICE 'N4c after-send refused % %', _s, CASE WHEN _s = '23514' THEN 'PASS' ELSE 'UNEXPECTED' END;
  END;
END $$;

-- ── N5 — a foreign workspace cannot add a signer to somebody else's agreement ────────────────────
DO $$
DECLARE _a jsonb; _id uuid; _s text;
BEGIN
  _a := public.save_paige_agreement(
    _expected_tenant_id := 'aaaaaaaa-0000-4000-8000-000000000001',
    _agreement_id := NULL,
    _contact_id := 'c1111111-0000-4000-8000-000000000001',
    _title := 'Foreign target', _body_markdown := 'Terms.');
  _id := (_a ->> 'id')::uuid;
  PERFORM set_config('test.tenant', 'bbbbbbbb-0000-4000-8000-000000000002', false);
  BEGIN
    PERFORM public.add_agreement_signer('bbbbbbbb-0000-4000-8000-000000000002', _id,
            'Intruder', 'intruder@example.com');
    RAISE NOTICE 'N5 UNEXPECTED — a foreign workspace added a signer';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _s = RETURNED_SQLSTATE;
    RAISE NOTICE 'N5 foreign refused % %', _s, CASE WHEN _s = '42501' THEN 'PASS' ELSE 'UNEXPECTED' END;
  END;
  PERFORM set_config('test.tenant', 'aaaaaaaa-0000-4000-8000-000000000001', false);
END $$;

-- ── N6 — the grant. A column-level REVOKE under a table-level GRANT is a no-op in PostgreSQL, so
-- this asserts the privilege itself rather than the presence of a REVOKE statement.
DO $$
DECLARE _hash boolean; _name boolean;
BEGIN
  _hash := has_column_privilege('authenticated','public.paige_agreement_signers','token_hash','SELECT');
  _name := has_column_privilege('authenticated','public.paige_agreement_signers','full_name','SELECT');
  RAISE NOTICE 'N6 token_hash readable=% full_name readable=% %',
    _hash, _name, CASE WHEN _hash = false AND _name = true THEN 'PASS' ELSE 'UNEXPECTED' END;
END $$;
