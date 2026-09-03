-- ============================================================================
-- DRAFT — NOT A MIGRATION. DO NOT MOVE THIS FILE INTO supabase/migrations/.
--
-- `.github/workflows/deploy-migrations.yml` fires on `supabase/migrations/**`
-- and runs `supabase db push`, which applies EVERY pending file in that
-- directory to production. This resolver has NOT been reviewed, has NO pgTAP
-- proof, and is NOT registered in the PAIGE Spine registry. Putting it back
-- there ships it to prod on the next merge.
--
-- WHAT IT IS. A worked draft of a read-only readiness resolver over
-- `public.tenant_client_agreements`, produced 2026-09-03 as a starting point
-- for Spine item 4 (Clients / Pipeline / Sales) — see issue #890. The session
-- that built the agreements table wrote the source contract
-- (`docs/delivery/sales-agreements-source-contract.md`); the CAPABILITY and its
-- placement belong to the workstream that owns
-- `supabase/functions/_shared/paige-spine/registry.ts`, because that is a single
-- shared file and standing a second Sales capability up in parallel is the
-- duplication §18 exists to prevent.
--
-- STATE, honestly: the resolver body below is drafted and self-consistent, and
-- its authorization reasoning was reached independently of the contract doc and
-- agrees with it. It has NOT been executed, NOT proven against a database, NOT
-- adversarially reviewed, and NOT checked for version collision — the crew that
-- wrote it was stopped before its verification stages ran, precisely because its
-- next step was to edit the shared registry. Treat every line as unverified.
--
-- ONE THING IN HERE IS WORTH READING EVEN IF THE REST IS DISCARDED: the
-- `tenant_id` return column and the comment explaining it. `get_paige_persona_context()`
-- resolves a linked CLIENT's workspace ahead of `current_user_tenant_id()`, so a
-- user who is a client of workspace B and a team member of workspace A holds a
-- conversation scoped to B while this read resolves A. Without that column a Chat
-- adapter cannot bind the rows to the conversation at all.
-- ============================================================================

-- Client Agreements Readiness — the one safe Sales-Ops projection that may cross into Spine.
--
-- ─── WHAT CROSSES, AND WHAT ABSOLUTELY DOES NOT ──────────────────────────────────────────────
--
-- Owner instruction, verbatim and outranking every convenience below: "no amounts, client details,
-- payment credentials, or contract terms into Spine, Rail, or Mind."
--
-- `public.tenant_client_agreements` (20261200000000) is the most commercially sensitive record this
-- product holds: a NAMED client bound to a NEGOTIATED amount. So this contract is deliberately not a
-- projection of that row at all. It is four DERIVED facts about the workspace's own sales state,
-- every one of them computed into a scalar inside this function and emitted as a LITERAL from a
-- closed vocabulary. Nothing selected from any source table ever reaches the output text.
--
-- NEVER READ BY THIS FUNCTION, in any branch: agreed_amount_minor · agreed_currency ·
-- catalog_price_id · catalog_price_snapshot_minor / _currency / _interval / _kind / _at ·
-- contact_id · offer_id · title · notes · starts_on · renews_on · ends_on · created_by. Grep the
-- body: those identifiers do not appear in it. The only columns it touches anywhere are
-- `tenant_id` (scope), `status` (a CHECK-closed workflow vocabulary) and `updated_at` (record
-- metadata, which is the freshness signal the brief asks for and is not a negotiated date).
--
-- §38 restated because this is a money-adjacent surface: nothing here touches a payment provider,
-- reads a provider identifier, or observes whether anything was paid, invoiced or delivered. The
-- source table cannot observe those either, and its status vocabulary has no word for any of them.
--
-- ─── WHY THESE FOUR FACTS, AND WHY NOT A COUNT (§18) ─────────────────────────────────────────
--
-- The brief permits four things: readiness, a count/status band, a source-backed next action, and
-- freshness. Each is one row, always:
--
--   recording_ready      -- can an agreement be recorded in this workspace at all, and if not,
--                           which precondition is missing
--   agreements_recorded  -- the volume BAND across every recorded agreement
--   live_agreements      -- the volume BAND of the ones currently live (active or paused)
--   next_action          -- the single next step, DERIVED from what the read above actually found
--
-- A BAND RATHER THAN A COUNT, and the reason is structural rather than taste. The Spine registry
-- requires an enumerable allow-list for every fact key -- `factValues: Record<string, SpineFact[]>`
-- in _shared/paige-spine/contracts.ts, and validateSpineRegistry() fails a capability whose fact key
-- has no listed values. An unbounded integer cannot be allow-listed, so a raw count would either
-- force the registry entry to lie or force an exception to the rule that makes the allow-list worth
-- having. The band boundary (0 / 1-9 / 10+) is a deliberate COARSENING, not a measurement: it is
-- chosen so the projection can never become a precise cardinality, and the exact number stays behind
-- the surface's own tenant-scoped read, where the person who owns the data already sees it.
--
-- NO CLIENT COUNT, EVER, AND NOT ONLY FOR PRIVACY (§18). The Systems Check runner
-- `crm_has_customers` (supabase/functions/_shared/systems-check-runners/crm_has_customers.ts)
-- already counts `clients` for a tenant and publishes both an evidence field `customer_count` and a
-- metric `crm_customer_count`. Projecting a second, separately-computed customer count here would be
-- a rival answer to a question already answered -- the exact drift `team.authority` refused when it
-- declined to re-project member_count. What that runner does NOT answer is whether an AGREEMENT can
-- be recorded, which depends on the client book AND the catalog together; that composite judgement
-- is the fact genuinely absent, and it is all this function emits. It reports a BLOCKER, never a
-- population.
--
-- The catalog half has no such owner: nothing under systems-check-runners/ reads `tenant_products`
-- or `tenant_prices` at all (verified, not assumed), so offer existence is not shadowing anyone.
--
-- ─── HOW `recording_ready` IS DERIVED, AND WHY "ANY STATUS" IS THE HONEST TEST ────────────────
--
-- `tenant_client_agreements` declares contact_id and offer_id NOT NULL, and `save_client_agreement`
-- refuses unless BOTH resolve inside the caller's own tenant. So a recording is possible exactly
-- when the workspace has at least one client and at least one catalog offer.
--
-- The offer test is deliberately NOT filtered to status='active'. The writer applies no status
-- filter (`PERFORM 1 FROM tenant_products p WHERE p.id = _offer_id AND p.tenant_id = _tenant`), and
-- the drawer's own picker lists `offers.offers` unfiltered (src/solo/sales-ops.tsx), so a workspace
-- holding only draft or archived offers CAN in fact record an agreement against one. Reporting it
-- `blocked_no_offers` would be a readiness answer the product contradicts the moment a human tries
-- it -- the failure mode §70 exists to catch, where the projection is internally tidy and wrong
-- about what a person can actually do.
--
-- ─── WHAT "SOURCE-BACKED NEXT ACTION" CAN HONESTLY MEAN HERE ──────────────────────────────────
--
-- Every value of next_action is entailed by something this read actually found, and the precedence
-- deliberately mirrors the empty-state precedence the surface already uses (clients first, then
-- catalog -- src/solo/sales-ops.tsx), so Sales and Spine cannot tell the same workspace two
-- different next steps (§57):
--
--   no clients                          -> add_a_client
--   clients but no offers               -> add_a_catalog_offer
--   both, and nothing recorded          -> record_first_agreement
--   something recorded, none live, >=1 draft -> complete_a_draft
--   otherwise                           -> none_pending
--
-- `complete_a_draft` deliberately does NOT distinguish "this draft needs a start date" from "this
-- draft is ready to activate". That distinction is only visible by reading `starts_on` and
-- `price_basis` -- both contract terms -- and disclosing WHICH is missing would put contract-term
-- information across the seam to buy a slightly sharper verb. One key covers both, and it is
-- completable either way: open the draft and finish it.
--
-- WHAT IS DELIBERATELY NOT DERIVED, stated plainly rather than quietly omitted. The obvious
-- remaining candidate is a renewal or expiry prompt -- "an agreement's renews_on has passed". It is
-- NOT emitted, and it will not be, because it cannot be said without disclosing a contract term: in
-- a workspace holding one live agreement, `renewal_due` tells the consumer that that agreement's
-- renews_on is on or before today, which is exactly the reconstruction the owner prohibited. A
-- generic "record a new one" is not an honest substitute either -- it is a suggestion, not a
-- finding, and the brief asks for the second. So a workspace whose agreements are all completed or
-- cancelled reports `none_pending`: this read genuinely finds nothing that requires action, and
-- says so rather than inventing one.
--
-- ─── FRESHNESS ───────────────────────────────────────────────────────────────────────────────
--
-- SUPERSEDED IN PART BY THE SOURCE CONTRACT (§13). After this draft was written,
-- docs/delivery/sales-agreements-source-contract.md §3 classified `updated_at` as crossable ONLY
-- WHEN QUANTIZED. The reasoning below is why `as_of` exists and still holds; the RAW timestamps it
-- emits do not. In a workspace with one live agreement, max(updated_at) FILTER (WHERE status IN
-- ('active','paused')) IS the commencement date -- a contract term. Both as_of values must be
-- coarsened to a day or week bucket, or reduced to a boolean staleness flag, before this is used.
--
-- There is no cached snapshot anywhere in this contract: every value is computed live from the
-- source tables on every call, so the projection cannot go stale relative to the record. `as_of`
-- therefore carries the different, useful fact -- when the counted set last changed
-- (max(updated_at)) -- which lets a consumer know that nothing has moved in Sales for a long time.
-- It is NULL on the two rows that are live judgements with no meaningful "as of" (recording_ready,
-- next_action) and on a set that is empty. A NULL as_of is never confusable with a failed read,
-- because `status` and `reason` carry that distinction on every row.
--
-- ─── VERSION ─────────────────────────────────────────────────────────────────────────────────
--
-- 20261210000000. State at authoring: the highest version in supabase/migrations/ is
-- 20261200000000; a scan of all 450 remote branches plus every local ref tops out at the same
-- number; nothing exists in the 2026119x, 2026120x or 2026121x band. This sorts strictly after both
-- and skips 2026120x in case another slice is moving there unmerged -- the same precaution
-- 20261200000000 took after a live collision at 20261180000000. Re-verify if this sits unmerged:
-- the base moves after you look at it.

create or replace function public.get_client_agreements_readiness(_tenant_id uuid default null)
returns table (
  fact_key text,
  status text,
  source text,
  as_of timestamptz,
  reason text,
  -- The workspace these rows describe. Returned for the reason get_business_context_readiness and
  -- get_team_authority_readiness both return it (20261170000000): get_paige_persona_context()
  -- resolves a linked CLIENT's workspace AHEAD of current_user_tenant_id(), so a user who is a
  -- client of B and a team member of A holds a conversation scoped to B while this read resolves A.
  -- Without this column a Chat adapter cannot bind the rows to the conversation -- the binding is
  -- impossible rather than merely omitted. It leaks nothing: it is the caller's own resolved
  -- workspace, already in their session.
  tenant_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_has_clients boolean := false;
  v_has_offers boolean := false;
  v_total bigint := 0;
  v_live bigint := 0;
  v_draft bigint := 0;
  v_as_of_all timestamptz;
  v_as_of_live timestamptz;
  v_ready text;
  v_next text;
begin
  -- The caller may not pass a tenant when a real identity exists (§9/§588): a JWT-authenticated
  -- caller's tenant is ALWAYS server-resolved, never client-supplied. _tenant_id is honored only
  -- where no JWT identity exists to resolve from.
  --
  -- HONEST NOTE ON THAT SECOND PATH (§13). Unlike get_business_context_readiness, this function is
  -- granted to `authenticated` ONLY -- see the grants at the foot of this file -- so no service-role
  -- caller can reach the branch today. It is defined rather than omitted so the semantics are fixed
  -- NOW: if a future Systems Check runner needs this read, the change is one GRANT plus a §37
  -- producer inventory, not an invitation to invent looser rules at that point. Whoever takes that
  -- grant inherits the whole trust boundary, because with auth.uid() null the role gate below is
  -- skipped and the named tenant is honored outright -- exactly as systems-check-http.ts
  -- resolveTenantFromJwt already resolves its tenant safely before calling.
  if v_uid is not null then
    v_tenant := public.current_user_tenant_id();
  else
    v_tenant := _tenant_id;
  end if;

  if v_tenant is null then
    return query
    select f.fact_key, 'unavailable'::text, null::text, null::timestamptz,
           'workspace not resolved'::text, null::uuid
    from unnest(array['recording_ready','agreements_recorded','live_agreements','next_action'])
      as f(fact_key);
    return;
  end if;

  -- ROLE GATE (§59 — the EXECUTE grant is never the guard).
  --
  -- WHY IT IS TENANT-SCOPED AND NOT GLOBAL. `public.user_roles` carries NO tenant_id, so
  -- has_role()/has_any_role() is tenant-agnostic and answers the wrong question in both directions
  -- (§59's global-role trap, the same one 20261180000000 removed from get_tenant_people):
  --   * it WRONGLY ADMITS -- a caller who holds 'admin' because of workspace X passes while
  --     current_user_tenant_id() resolves workspace Y, where they may be a plain member or a
  --     client. On this contract that hands them another workspace's commercial posture.
  --   * it WRONGLY REFUSES -- the deferred-signup path (record_signup_acceptance / provision_tenant,
  --     20260808190000) grants a new owner the BASE role 'user' and nothing else, so a freshly
  --     provisioned Solo owner holds no 'admin' row at all. A global gate would silently refuse the
  --     exact persona this capability exists for, and the failure is invisible: PAIGE just says
  --     nothing.
  -- is_tenant_admin() asks the only question that matters -- is this caller an owner or admin OF
  -- THE WORKSPACE THESE ROWS DESCRIBE -- and it is the SAME predicate both writers already use
  -- (save_client_agreement, set_client_agreement_status), so this read can never reach anyone who
  -- could not already have written the record it summarises.
  --
  -- WHY IT IS STRICTER THAN THIS TABLE'S OWN RLS, deliberately. `tca_visible_with_its_client` admits
  -- anyone who can see the client, so an assigned COACH legitimately reads SOME agreement rows. But
  -- this function runs as DEFINER and aggregates across the WHOLE tenant, so its answer deliberately
  -- exceeds any row-filtered caller's own view: handing a coach a workspace-wide band would disclose
  -- the existence of agreements they are not entitled to see. A workspace-wide aggregate has to be
  -- gated by workspace-wide authority, not by a row predicate.
  --
  -- is_platform_owner() matches the sibling readiness reads. It is knowingly NARROWER than the
  -- is_platform_operator() gate 20261180000000 chose: that widening existed to avoid removing a
  -- SHIPPED operator capability under §58, and nothing has shipped here to remove. Widening the
  -- readiness family is a decision for the family, not a third gate invented in this file (§18).
  --
  -- Refused, not empty: the contract promises exactly four rows on every call, so a refusal is four
  -- 'unavailable' rows carrying a reason -- which also leaks nothing about the real state, since
  -- every other column is null and the statuses are identical for a busy workspace and an empty one.
  -- Callers tell "we may not tell you" from "the read broke" by `reason`.
  if v_uid is not null
     and not (public.is_tenant_admin(v_tenant) or public.is_platform_owner())
  then
    return query
    select f.fact_key, 'unavailable'::text, null::text, null::timestamptz,
           'not permitted for this account'::text, v_tenant
    from unnest(array['recording_ready','agreements_recorded','live_agreements','next_action'])
      as f(fact_key);
    return;
  end if;

  -- EVERY column reference below is alias-qualified, and that is load-bearing rather than tidy:
  -- `status` and `tenant_id` are BOTH OUT parameters of this function (they are in the RETURNS TABLE
  -- above), so a bare reference to either is ambiguous between the column and the variable, and
  -- Postgres refuses at RUNTIME -- not at create time. 20261170000000 hit exactly this on
  -- `tenant_id`; this function has the same hazard twice.

  -- EXISTS, never a row: the preconditions are booleans, so no client or offer record is read even
  -- into a local variable. (DEFINER bypasses RLS on both tables; the caller's scope is re-enforced
  -- by the server-resolved tenant above and the role gate above it.)
  select exists (select 1 from public.clients c where c.tenant_id = v_tenant)
    into v_has_clients;

  -- Any status. See the header: the writer and the picker both accept any, so filtering here would
  -- report a workspace blocked that is not.
  select exists (select 1 from public.tenant_products p where p.tenant_id = v_tenant)
    into v_has_offers;

  -- The only read of the agreements table in this function. Three cardinalities and two timestamps;
  -- `a.status` is the CHECK-closed workflow vocabulary and `a.updated_at` is record metadata. No
  -- amount, party, offer, title, note or negotiated date is selected, and an aggregate always
  -- returns exactly one row, so an empty workspace yields 0/0/0/null/null rather than NOT FOUND.
  --
  -- 'active','paused' is not an invented grouping: it is the same live set the table's own partial
  -- unique index uq_tca_live_per_client_offer treats as live.
  select count(*),
         count(*) filter (where a.status in ('active','paused')),
         count(*) filter (where a.status = 'draft'),
         max(a.updated_at),
         -- BARRED AS WRITTEN (contract §3): in a one-live-agreement workspace this scalar IS
         -- the commencement date. Quantize before emitting.
         max(a.updated_at) filter (where a.status in ('active','paused'))
    into v_total, v_live, v_draft, v_as_of_all, v_as_of_live
  from public.tenant_client_agreements a
  where a.tenant_id = v_tenant;

  -- Readiness names the FULL blocker set, because a consumer deciding what to show needs to know
  -- whether one thing or two are missing.
  v_ready := case
    when v_has_clients and v_has_offers then 'ready'
    when not v_has_clients and not v_has_offers then 'blocked_no_clients_or_offers'
    when not v_has_clients then 'blocked_no_clients'
    else 'blocked_no_offers'
  end;

  -- The next action names ONE step, clients before catalog, mirroring the surface's own empty-state
  -- precedence so the two can never disagree (§57).
  v_next := case
    when not v_has_clients then 'add_a_client'
    when not v_has_offers then 'add_a_catalog_offer'
    when v_total = 0 then 'record_first_agreement'
    when v_live = 0 and v_draft > 0 then 'complete_a_draft'
    else 'none_pending'
  end;

  -- Every value below is either a literal written in this file or a scalar computed above. No value
  -- read out of clients, tenant_products or tenant_client_agreements is interpolated into any output
  -- column, which is what makes the leak proof a matter of reading this list rather than trusting it.
  return query
  select 'recording_ready'::text,
    v_ready,
    'derived'::text,
    null::timestamptz,
    null::text,
    v_tenant
  union all
  select 'agreements_recorded'::text,
    case when v_total = 0 then 'none' when v_total < 10 then 'a_few' else 'many' end,
    'agreements'::text,
    v_as_of_all,
    null::text,
    v_tenant
  union all
  select 'live_agreements'::text,
    case when v_live = 0 then 'none' when v_live < 10 then 'a_few' else 'many' end,
    'agreements'::text,
    v_as_of_live,
    null::text,
    v_tenant
  union all
  select 'next_action'::text,
    v_next,
    'derived'::text,
    null::timestamptz,
    null::text,
    v_tenant;
end;
$$;

comment on function public.get_client_agreements_readiness(uuid) is
  'Spine-owned narrow readiness projection over Sales Ops client agreements: four derived facts '
  '(recording_ready, agreements_recorded, live_agreements, next_action) as closed-vocabulary status '
  'values, plus the freshness of the counted set. Carries NO amount, currency, catalog price '
  'snapshot, client or offer identifier, title, notes or negotiated date -- none of those columns is '
  'read in any branch, and every emitted status is a literal from this function rather than a value '
  'from a row (owner instruction: no amounts, client details, payment credentials or contract terms '
  'into Spine, Rail or Mind). Volumes are BANDS, not counts, because the Spine registry requires an '
  'enumerable allow-list per fact key; no customer count is projected at all, because the Systems '
  'Check runner crm_has_customers already owns that number (§18). Tenant-authenticated callers are '
  'server-resolved via current_user_tenant_id() and _tenant_id is IGNORED for them (§9); the '
  '_tenant_id branch is honored only where auth.uid() is null, and no role is granted that path '
  'today. Gated on is_tenant_admin() of the RESOLVED tenant (the same predicate both writers use), '
  'or is_platform_owner() -- deliberately stricter than this table''s RLS, because the aggregate '
  'spans the whole workspace and so exceeds any row-filtered caller''s own view (§59). Always returns '
  'exactly four rows, including on refusal, so a consumer can never confuse "no signal" with "the '
  'read failed". Records no payment, invoice, provider subscription or fulfilment status (§38). '
  'Sales Ops owns the underlying facts; this function never writes.';

-- The EXECUTE grant is not the access control -- the body above is (§59). `authenticated` only:
-- anon has no business knowing whether a workspace has commercial arrangements, and service_role is
-- deliberately NOT granted because no server-side consumer exists yet. A grant with no consumer is
-- an open path nobody is auditing; adding one later is one line plus a §37 producer inventory.
revoke all on function public.get_client_agreements_readiness(uuid) from public, anon;
grant execute on function public.get_client_agreements_readiness(uuid) to authenticated;
