# Source contract — `tenant_client_agreements` (Solo Sales)

What the client-agreements store may and may not expose to Spine, Rail or Mind.

**Status.** The source is live: migration `20261200000000`, merged `096d6c9d`, verified persisted on
production (`xygzykjyynhzqytbqnzu`) — the ledger row is present and is the ledger head, so there is
zero drift. **No Spine capability is registered against it.** That placement decision belongs to the
Spine source-contracts workstream (item 4, Clients / Pipeline / Sales), not to this document — see
issue #890 for why. This file supplies only the part that had to come from the session that built
the table: what is safe to let out of it.

---

## 1. What this source is

Where a Solo business records **the commercial agreement it has with one of its own existing
clients** — the arrangement, the negotiated figure, the cadence, the dates, and where in its life the
agreement currently sits.

It is emphatically **not** a billing store. PAIGE is never merchant of record for a tenant's client
revenue; nothing in this table is collected, settled, metered or reconciled by the platform, and no
row here has ever touched a payment provider. A row is a record of *what was agreed*, written by the
business, for the business. Anything that reads it and implies otherwise has broken the money
boundary regardless of how the data is shaped.

The tenant's own surface reads it through `src/solo/useSoloAgreements.ts`. Anything Spine-side must
be a **second consumer of the same guarded read**, never a second source of truth.

---

## 2. The constraint, verbatim

> no amounts, client details, payment credentials, or contract terms into Spine, Rail, or Mind

That is the owner's wording and it is the binding rule for this source. What remains permissible is
narrow and deliberate: **readiness, count/status, a source-backed next action, and freshness.**

"Source-backed" is doing real work in that sentence. A next action may only state something the read
actually established — *there are no catalog offers yet, so no agreement can be recorded* — and may
never be a generic suggestion dressed as a finding. If a next action cannot be derived from what was
read, the honest output is no next action, not an invented one.

---

## 3. Column classification

Every column is on exactly one side of this line. There is no discretionary middle.

### May never cross

| Column | Why |
|---|---|
| `agreed_amount_minor` | an amount |
| `agreed_currency` | pairs with the amount to reconstruct it |
| `catalog_price_id` | dereferences to a price |
| `catalog_price_snapshot_minor` | an amount |
| `catalog_price_snapshot_currency` | as above |
| `catalog_price_snapshot_interval` | a contract term |
| `catalog_price_snapshot_kind` | a contract term |
| `contact_id` | client identity |
| `offer_id` | identifies what a named client bought |
| `title` | tenant-authored free text; routinely carries the client's name |
| `notes` | tenant-authored free text; unbounded |
| `billing_interval`, `interval_count`, `installments_total`, `payment_schedule` | contract terms |
| `starts_on`, `renews_on`, `ends_on` | a date range **is** a term; a renewal date is a term with a deadline |
| `created_by` | identifies a person |

`title` and `notes` deserve their own line. They are free text a human types, so no classifier can
bound what they contain — assume every one of them holds a client's name and a price, because in
practice some will. They never cross under any summarisation, truncation or paraphrase.

### May cross

| Column | As what |
|---|---|
| `status` | a closed vocabulary: `draft` · `active` · `paused` · `completed` · `cancelled` |
| `term_kind` | a closed vocabulary — but see the caution below |
| `price_basis` | a closed vocabulary: `catalog` · `negotiated` · `quote_pending` |
| `updated_at` | freshness only |
| *(derived)* row counts | as a count or a band, never joined to an identity |

**Caution on `term_kind`.** `one_time` / `recurring` / `installment` / `deposit` / `custom_quote` is
arguably itself a contract term. It is listed as permissible **only** in aggregate — "three recurring
agreements are active" — and never attached to a single row, because a single row plus a term kind
plus a count of one is a description of one named client's contract by another route.

That is the general rule this table needs and the reason the classification above is not sufficient
on its own:

> **A count of one is an identity.** In a workspace with one client, every aggregate is that client's
> private business restated. Any projection must either suppress below a threshold or carry nothing
> that becomes identifying at n=1.

---

## 4. Authorization facts a resolver inherits

Measured on production, not recalled.

- **Table grants:** `authenticated` → `SELECT` only. `anon` → nothing at all. Every write goes
  through `save_client_agreement` / `set_client_agreement_status`, both `SECURITY DEFINER`, both
  executable by `authenticated` only, with `anon` and `PUBLIC` revoked.
- **Policies:** `tca_tenant_isolation` (RESTRICTIVE / ALL) and `tca_visible_with_its_client`
  (PERMISSIVE / SELECT). Postgres requires every RESTRICTIVE policy to pass *and* at least one
  PERMISSIVE, so agreement visibility is deliberately inherited from the client it belongs to.

Two traps, both of which have already cost time elsewhere in this repo:

**A denied read is indistinguishable from an empty one.** `SELECT` is granted to `authenticated` and
scope is enforced by RLS, so a caller outside the policy receives `200` / `[]` / **no error** — byte
for byte what an empty book returns. A resolver that models authorization as an error channel will
therefore report a confident, false *zero* to exactly the callers it was supposed to refuse. Derive
readability from **authority**; say *unknown* where you cannot prove *none*.

**A workspace's own clients are authenticated users of that workspace.** So `current_user_tenant_id()`
resolves happily for a client-role caller and will hand them their coach's commercial position unless
the body gates on it. The gate must be tenant-scoped (`is_tenant_admin` on the resolved tenant), not
a tenant-agnostic global role — `user_roles` carries no `tenant_id`, so a global check both wrongly
admits (admin of workspace X resolving workspace Y) and wrongly refuses (a freshly provisioned Solo
owner holds only the base role). `get_business_context_readiness` documents this at length and is the
pattern to copy.

---

## 5. What is not decided here

- **Whether a capability should exist at all**, and if so whether it belongs as a new registry entry
  or as an extension of an existing aggregate. `practice_dashboard_metrics` already aggregates
  pipeline + deals + clients with the tenant server-resolved; it does not cover agreements, because
  it predates them. Whether it should is a §18 call for the workstream that owns that seam.
- **The projection's exact shape** — row set, closed vocabularies, refusal shape. Constrained by §3
  above, but authored wherever the capability lands.

Neither is withheld for lack of an opinion. They are withheld because `registry.ts` is a single
shared file with one owner, and resolving that seam before building is the part of §18 that actually
prevents the duplication rather than describing it afterwards.
