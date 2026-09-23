# Solo metric dictionary and economic model — PROPOSAL

**Status: PROPOSED. Nothing depends on it. No code, no schema, no surface reads from this yet.**

Phase 1 of the Analytics & Operating Intelligence lane, Solo shell only. The owner confirms every
definition before anything is built on it — that is the point of writing them down before writing
code. Where a word has more than one defensible meaning, this document does not pick one quietly;
it names the choice, recommends an answer, and says what breaks if the other is chosen.

Grounded against `origin/main` `7ebdd9fe`. Every claim below carries a `file:line` or a migration
name. **This session has no database access**, so nothing here asserts what data exists on
production — only what the schema and the code permit. Questions that need a query are collected
in §8 rather than guessed at.

---

## 1. The economic model — what a Solo business actually is, in this schema

A Solo operator is one person selling services to clients. The schema models that as a chain, and
the single most important fact about the chain is that **only one link in it proves money moved.**

```
  offer            deal              agreement            invoice           order
  ─────            ────              ─────────            ───────           ─────
  tenant_products  deals             tenant_client_       paige_invoices    tenant_orders
  tenant_prices    .value_cents      agreements                             status='complete'
                                     .agreed_amount_minor
  ─────────────────────────────────────────────────────────────────────────────────────
  LIST PRICE       ESTIMATED         COMMITTED            BILLED            COLLECTED
  (supply, not     (operator typed   (signed, not         (sent, never      (Stripe confirmed
   demand)          a guess)          paid)                marked paid)      payment_status=paid)
```

- **ESTIMATED** — `deals.value_cents` (`20260627022609:101`). An operator-entered number. Nothing
  about it proves a client agreed, let alone paid.
- **COMMITTED** — `tenant_client_agreements.agreed_amount_minor` (`20261200000000:85`). A real
  commitment with a real counterparty, still not money received.
- **BILLED** — `paige_invoices.amount_total_cents` (`20260629204156:11`).
- **COLLECTED** — `tenant_orders` with `status='complete'`, written **only** at
  `supabase/functions/stripe-webhook/index.ts:548-556`, gated at `:542` on
  `session.payment_status === "paid"`.

**The proposal's central rule: the word "revenue" is reserved for COLLECTED.** The other three
links get their own words — pipeline value, committed value, billed value — and no surface is
allowed to call any of them revenue. This is not pedantry; §3 below shows the product already
breaks this rule today, on a live Solo surface.

### What this model cannot express, structurally

**The cost side exists, but it does not live on this chain.** The chain above is Paige's own
record of a Solo business, and nothing in it carries a cost: `paige_skill_runs.cost_cents`
(`20260630013855:67`) and `browser_use_sessions.cost_cents` (`:263`) are Paige's AI-operation costs,
the platform's, not the tenant's.

Cost arrives instead through an **integration**: `public.quickbooks_financials`
(`20260420201025:56-83`) carries `total_expenses`, `cogs`, `gross_profit`, `gross_margin_percent`,
`operating_expenses` and `net_income`. That changes profit from *absent* to *conditional* — and the
condition is not only "is QuickBooks connected." **That table has no `tenant_id`**; it is keyed on
`user_id` and `business_id` (`:58-59`). Every other metric in this document scopes by tenant, so
admitting this one means establishing its §9 scoping first, deliberately, rather than assuming the
owner's user id is a safe proxy for their tenant.

> **Corrected after the peer gate (§9).** The first draft of this paragraph said margin was
> *"not computable. Not 'hard' — absent."* That was wrong, and wrong in the specific way this lane
> exists to catch: a confident absence claim that one grep would have falsified. `quickbooks_financials`
> was in my own grounding data at the time I wrote it.

---

## 2. The four live defects grounding found — these are in the product now

These are not proposals. They are existing Solo surfaces displaying numbers that do not mean what
their labels say. They are recorded here because a dictionary that does not name them would be
ratifying them.

### L-1 — The Command Center labels an estimate "Revenue this period"

`src/solo/data/useCommandCenter.ts:163` renders `won_value_cents` under the label
**"Revenue this period"**. `won_value_cents` is computed at
`supabase/migrations/20260713152601_tier_dashboard_metrics.sql:38-40` as `SUM(deals.value_cents)`
for deals whose stage has `stage_type='won'`, filtered
`AND d.actual_close_date IS NOT NULL AND d.actual_close_date >= since_date`.

**Be precise about which half of the label is wrong.** Those filters mean the figure genuinely *is*
period-scoped, so *"this period"* is defensible. What is not defensible is *"Revenue."* The number
is a sum of operator-typed estimates on deals someone dragged into a "Won" column; no payment, no
invoice, no agreement is consulted. Under the model in §1 this is ESTIMATED displayed as COLLECTED
— the exact substitution the model exists to prevent.

The shipped Sales surface already refuses that substitution, in its own words
(`src/solo/sales/deriveSalesCommand.ts:17-18`): *"'Actual received' is NOT derived here at all.
There is no connected payment source and `tenant_orders` is never summed into revenue; the surface
renders it unavailable."* Command Center and Sales currently disagree about what revenue means, and
Sales is right.

### L-2 — "Active clients" counts cold leads, because `status` defaults to active

`clients.status` allows `'pending','active','inactive','archived'` (`20260423012456:4-6`) and
**defaults to `'active'`** (`20260411060930:15`). `create_contact` hardcodes `'active'` on every
insert (`20261020010000_client_identity_contract.sql`), regardless of whether the person is a
client or a name someone just typed in.

So `active_clients` (`20260713152601:36`) counts rows whose status is exactly `'active'` — it does
exclude `'pending'`, `'inactive'` and `'archived'` — but because the default lands almost every new
row on `'active'`, a cold lead captured from a form is counted as an "active client." Meanwhile
`clients.lifecycle_stage` carries the values that actually mean something (`20260630200554:26-38`)
and is not consulted by this metric.

### L-3 — ARPC divides a period figure by a point-in-time count, over an inflated denominator

`arpc_cents` (`20260713152601:55`) is `round(v_won_alltime / v_active)` — **all-time** won value
over the **current** active-client count. Two different time bases in one division, and the
denominator is L-2's inflated count. The number is not wrong by a little; it has no coherent
meaning.

### L-4 — The empty funnel shows stage names the tenant never created

When the bundle is `UNAVAILABLE` or has no stages, `src/solo/analytics2.tsx:150` falls through
to a hardcoded list — `["Qualified lead", "Proposal", "Commitment", "Confirmed outcome"]` — and
renders those four as the tenant's funnel.

**Stated precisely, because it is easy to overstate:** no number is fabricated. Each stage shows
*"No proved count"*, the watermark reads *"no implied volume or conversion"*, and the `aria-label`
says the same. The defect is that a brand-new Solo owner is shown a funnel whose **stage names are
not theirs**, with nothing telling them what to do about it. Under §5 this is exactly where an
`UNCONFIGURED` state belongs.

**Recommendation:** L-1 through L-4 are small, local, Solo-scoped, and need no database access to
fix. I propose fixing them in Phase 2 alongside the collection work rather than waiting for the
full dictionary to be built, because each one is currently telling a Solo owner something untrue.

---

## 3. The dictionary — proposed metrics

Each carries the full spec the assignment requires. **Class** is the §1 chain position and is part
of the metric's identity, not a note about it.

### M-1 · `sales_funnel.created_deals_by_current_stage` — SHIPPED, v1.0.0, unchanged

| | |
|---|---|
| **Business definition** | Of the deals this workspace created in the period, where does each one stand right now? |
| **Class** | ESTIMATED (count, not value) |
| **Numerator / denominator** | A count per stage. Not a ratio. **Explicitly not a conversion rate.** |
| **Included** | Deals with `tenant_id` = active account, `created_at` in `[start, end)`, in the tenant's single `is_default=true` pipeline |
| **Excluded** | Deals in a non-default pipeline; deals whose stage is missing, unscoped, or belongs to another pipeline (both already counted and reported as exclusions) |
| **Time basis** | `deals.created_at` — when the deal was made, not when it moved |
| **Currency / entity** | None — a count. Entity: the active tenant |
| **Source of record** | `public.analytics_sales_funnel_evidence_bundle` (`20261004000000:40-238`) |
| **Minimum data quality** | Exactly one default pipeline with ≥1 stage, else `UNAVAILABLE` (`:151-155`) |
| **Owner** | The tenant's pipeline configuration |
| **Target / threshold** | None. A distribution, not a goal |
| **Actual / forecast / estimate** | Actual count of records |

It is honest about its own limit in its own words (`:231`): *"Stage counts use each deal record's
current stage at queried time; they are not historical stage-entry counts."* Keep that. It is the
model for every caveat below.

### M-2 · `money.collected_value` — PROPOSED · **the only metric that may be called revenue**

| | |
|---|---|
| **Business definition** | Money this workspace has actually received through its storefront in the period |
| **Class** | **COLLECTED** |
| **Numerator** | `SUM(tenant_orders.amount_total)` where `status='complete'` |
| **Denominator** | None |
| **Included** | Orders Stripe confirmed as paid — the only rows in the schema with that guarantee |
| **Excluded** | Every other order status; all deals, agreements and invoices regardless of state |
| **Time basis** | `created_at`. **Open decision D-2** — this is session-create time, not payment time |
| **Currency / entity** | Per currency, never summed across. Entity: the active tenant |
| **Source of record** | `public.tenant_orders` (`20260629182422:146-163`) |
| **Minimum data quality** | A connected Stripe account. Without one this is honestly `UNAVAILABLE`, not zero |
| **Owner** | The tenant's storefront configuration |
| **Target / threshold** | Owner-set. Proposed default: none until a baseline exists |
| **Actual / forecast / estimate** | **Actual.** The only one in this document |

**Honest bound:** this covers storefront sales only. A Solo operator invoicing by bank transfer
has collected money this metric cannot see, and the metric must say so rather than imply their
revenue is zero.

### M-3 · `pipeline.open_value` — PROPOSED

| | |
|---|---|
| **Business definition** | What the operator estimates their live opportunities are worth |
| **Class** | **ESTIMATED** |
| **Numerator** | `SUM(deals.value_cents)` where the deal's stage has `stage_type='open'` |
| **Included / excluded** | Open stages only; archived stages excluded — note `20260713152601:49-54` does **not** filter `archived_at IS NULL`, which is a defect to fix, not a definition to copy |
| **Time basis** | Point-in-time. No date filter — this is a snapshot of now |
| **Currency / entity** | Per currency. **`deals.currency` exists and is currently discarded** (`:38-40` sums `value_cents` across all rows) — open decision D-3 |
| **Source of record** | `public.deals` + `public.pipeline_stages` |
| **Minimum data quality** | ≥1 open stage defined |
| **Target / threshold** | Owner-set |
| **Actual / forecast / estimate** | **Estimate, operator-entered.** Must be labelled as such on every surface |

### M-4 · `pipeline.won_value` — PROPOSED (this is what L-1 currently mislabels)

Same shape as M-3, filtered to `stage_type='won'` and dated by `actual_close_date`.
**Class: ESTIMATED.** Proposed surface label: *"Won (estimated value)"*, never *"Revenue."*

**Open decision D-4:** two definitions of "won" coexist and can disagree —
`deals.status='won'` (used by `contact_deal_rollup`, `20260627024041:34`) versus
`pipeline_stages.stage_type='won'` (used by `practice_dashboard_metrics`). Migration
`20261204000000_closing_a_deal_on_the_solo_board_records_it.sql` records that the governed Solo
board historically set **neither** `status` nor `actual_close_date` on a won move, so deals closed
before it are in a won stage with no close date and drop out of any dated figure.

### M-5 · `agreements.committed_value` — PROPOSED

| | |
|---|---|
| **Business definition** | What clients have actually agreed to pay, across live agreements |
| **Class** | **COMMITTED** |
| **Numerator** | `SUM(agreed_amount_minor)` on `status='active'` agreements, grouped by `agreed_currency` |
| **Time basis** | Point-in-time |
| **Source of record** | `public.tenant_client_agreements` (`20261200000000:85-86`) |
| **Recurring convention** | **Monthly-equivalent, not annualised.** This is the already-shipped choice, documented at `src/solo/sales/deriveSalesCommand.ts:14-16`: *"Recurring is reported as a monthly-equivalent, NOT annualized into a single contracted figure it does not prove."* Adopting it rather than inventing a second convention (§18) |
| **Actual / forecast / estimate** | Committed — a real counterparty commitment, not received money |

**Honest bound:** `term_kind` spans `one_time`, `recurring`, `installment`, `deposit`. Summing
mixed term shapes into one figure is incoherent; the metric groups by term kind.

### M-6 · `book.contacts_by_lifecycle` — PROPOSED (replaces the L-2 trap)

| | |
|---|---|
| **Business definition** | How many people are in the book, and where each stands |
| **Class** | Count |
| **Numerator** | `count(*)` grouped by `clients.lifecycle_stage` |
| **Included / excluded** | All non-archived rows. **`clients.status` is deliberately not used** — it defaults to `'active'` and therefore measures nothing (§2, L-2) |
| **Time basis** | Point-in-time, plus a created-in-period variant on `created_at` |
| **Source of record** | `public.clients`, `lifecycle_stage` CHECK at `20260630200554:26-39` |
| **Owner** | Open decision D-1 — the lead/client boundary is not declared anywhere |

### M-7 · `outcomes.by_type` — PROPOSED

`pipeline_deal_outcomes` grouped by `outcome_type` over `outcome_date`
(`20261224000001:9-12`). **Deduplicated to the latest outcome per deal** — the table is append-only
with `reopened` a legal outcome, so a deal closed, reopened and re-closed produces three rows and a
naive count double-counts.

### M-8 · `work.capability_runs` — PROPOSED (the operating-intelligence metric)

What Paige actually did for this workspace in the period, by capability and result. This is the
one metric in the dictionary that measures the product rather than the business, and it is the
honest seed of "operating intelligence." Source and exact shape are pending the day-one track's
return; specified in the Phase 2 slice rather than asserted here.

---

## 4. What can and cannot be built, per lens

> **This section was rewritten after the peer gate (§9).** Its first draft marked four lenses
> NOT BUILDABLE, and four of those verdicts were wrong. The pattern is worth naming because it is
> the failure mode this whole lane exists to prevent: I checked the obvious table, found the column
> missing, and generalised from *"this table does not have it"* to *"the platform does not have
> it"* — without following a foreign key or checking a sibling integration. Three of the four
> refutations came out of my own grounding data, which had already listed the tables I then claimed
> did not exist.

| Lens | Verdict | Where it actually stands |
|---|---|---|
| `money` | **Shipped — with a caveat that matters** | M-1 is live, but it explicitly disclaims being money: `20261004000000:232` — *"Counts are records, not revenue, conversion, attribution, benchmark, or outcome claims."* The actual money metric (M-2) is unbuilt. Calling this lens "done" would repeat §2's substitution at the lens level |
| `brief` | **Buildable** | Composable from M-1 to M-8 |
| `profit` | **Conditionally buildable** | `public.quickbooks_financials` (`20260420201025:56-83`) carries a full P&L: `total_expenses`, `cogs`, `gross_profit`, `gross_margin_percent`, `operating_expenses`, `net_income`, plus `accounts_receivable` and `cash_runway_months`. **Two real conditions, not one:** it requires a connected QuickBooks, and — the part that needs design attention — **it has no `tenant_id`.** It is keyed on `user_id` and `business_id` (`:58-59`), a different scoping model from every other metric here, so §9 scoping has to be established before a single figure is read |
| `ret` | **Partially buildable — over agreements, not over the contact book** | `tenant_client_agreements` carries `starts_on`, `renews_on` and `ends_on` (`20261200000000:101-103`) plus `'completed'`/`'cancelled'` states (`:114-115`) — a real cohort boundary and a real end event, on the table this document already uses for M-5. What does **not** exist is retention over the whole contact book: `clients` has no end date, and `lifecycle_stage` carries `'client_churned'` (`20260630200554:34`) as a **state, not a dated event** — you can count who is churned now, never how many churned in a period |
| `mkt` | **Partially buildable — for form-originated contacts** | The attribution does not need copying forward, because the row holding it already points at both: `growth_form_submissions.contact_id` is an FK to `public.clients` (`20260630004505:133`), with `utm_json` at `:139` and `referrer` at `:140`, all tenant-scoped (`:132`). So UTM is one join from a contact. **Coverage is partial by construction** — only contacts that arrived through a Paige form carry it — which is exactly what the contract's `PARTIAL` state and its exclusion counts exist to express. Caveat: `deal_id` (`:134`) is a bare `uuid` with **no foreign key**, so the deal-side join is unenforced |
| `dec` | **Blocked, not absent** | Needs the governed runtime binding Phase 4 waits on from the Platform Reach Lane. The lens already marks only Human/Read/Page live (`analytics2.tsx:222`) |

### Also revised: MRR/ARR is buildable

The first draft said `tenant_service_subscriptions` "has no amount column at all." The table does
carry `application_fee_amount` (`20260702005950:121`) — though that is *Paige's* cut, not the
subscription price, so the original instinct was pointing at something real. The price itself is one
hop away: `price_id` (`:114`) references `tenant_prices`, which supplies `unit_amount`, `currency`,
`billing_interval` and `interval_count` (`20260629182422:102-105`), and the subscription carries its
own `billing_period` (`:116`).

So MRR **is** schema-permitted. Two caveats belong in the definition rather than in a refusal:
`tenant_prices.unit_amount` is the **list** price, not necessarily what this client pays; and
`price_id` is `ON DELETE SET NULL`, so a deleted price silently orphans a subscription's amount and
drops it from the sum.

### What genuinely remains unbuildable

Stated narrowly this time, with the search that supports each.

- **Refunds and chargebacks netted out of a revenue figure.** `tenant_orders.status` permits
  `'refunded'` (`20260629182422:158`) but no shipped code writes it; the `charge.refunded` handler at
  `supabase/functions/stripe-webhook/index.ts:571` does not touch `tenant_orders`.
- **Accounts receivable from Paige's own invoices.** `paige_invoices.paid_at` is never written and
  `'paid'` is never set, so "outstanding" means "ever sent." (Note: `quickbooks_financials` does
  carry `accounts_receivable`, so AR is available on the same conditional footing as `profit`.)
- **Lifetime value grounded in money actually received.** `tenant_orders` has no contact FK at all —
  it identifies the buyer by free-text `customer_email` / `customer_name` (`20260629182422:154-155`),
  so collected money cannot be attributed to a client record.
- **Conversion rate between stages.** No stage-entry history exists anywhere: `lifecycle_stage` is a
  single mutable value with no transition log, and the funnel bundle says so itself
  (`20261004000000:231`).

## 5. Day-one behaviour — the owner's standing requirement

*A newly created Solo account must have working analytics from the moment it is populated.*

**A new Solo account gets no pipeline and no stages.** `20260915000000_remove_starter_auto_provisioner.sql:26-42`
drops the `trg_tenants_seed_starter_business` trigger, unschedules the `starter-provisioning-drain`
cron job, and drops both `seed_starter_business` and `trg_seed_starter_business`. It was removed
deliberately, on an owner ruling recorded in the migration header at `:3-6`:

> *"NEVER MAKE ANYONE DEFAULT TO ANYTHING; the platform must NOT auto-build a business the tenant
> didn't ask for. EVERYONE goes through Setup and chooses (playbook/pipeline/calendar)."*

So the chain is: no pipeline at provisioning → `_default_pipeline_count = 0` → **`UNAVAILABLE`**
(`20261004000000:151-155`). The one live metric is unavailable for every new Solo account until its
owner builds a pipeline by hand in Setup.

> **Correction, recorded rather than quietly fixed (§13).** An earlier draft of this section stated
> the opposite — that a new tenant is seeded a default pipeline asynchronously by a trigger and a
> cron drain. That was true of `20260711180000_starter_business_provisioner.sql` and false of the
> current schema, because the later migration above removed it. The error was reading a July
> migration and not checking whether a September one repealed it.

### The requirement and the 2026-08-16 ruling do not actually conflict

They appear to: *working analytics from the moment it is populated* against *never make anyone
default to anything*. The resolution is in the requirement's own wording — **from the moment it is
populated.** An empty account has nothing to measure, and manufacturing something to show is the
behaviour this whole lane exists to end. What the account needs is for the product to say so
properly:

- **Before the tenant builds a pipeline** — a designed state that says *you have not set this up
  yet, here is the one step*. Today this is `UNAVAILABLE`, which means *cannot be measured* and
  reads as broken.
- **The moment they create a pipeline and a first deal** — `LIVE`, immediately. No seeding, no
  backfill, no configuration step, nothing to wait for. **This half already works**: deal count is
  not part of the truth-state expression (`20261004000000:151-155`), so an account with a pipeline
  and zero deals returns `LIVE` with honest zeroes rather than an error.

Two supporting facts verified first-hand: the lifecycle gate admits `trial|active|past_due`
(`20261004000000:329-332`) and `tenants.status` defaults to `'trial'` (`20260629175341:32`), so a
new account passes it; and `create_pipeline_with_stages` falls back to five coaching-generic
`_default_stages` when handed `'[]'` (`20260710200000:66-68`), so whenever the tenant does build a
pipeline through Setup it arrives with usable stages.

**Proposal: a fourth truth state, `UNCONFIGURED`.** `UNAVAILABLE` currently does the work of two
different sentences — *this cannot be measured* and *you have not set this up yet* — and a new
account deserves the second, with the next action named. This is a coverage-layer addition, not a
new contract, and it satisfies both owner rulings instead of trading one against the other.

## 6. Decisions owed by the owner

Each is a real fork. Each has a recommendation. **None is being taken silently.**

| # | The decision | Recommendation | Cost of the other choice |
|---|---|---|---|
| **D-1** | Where is the lead/client boundary? Four competing answers exist (`clients.status`, `lifecycle_stage`, `client_types`, deal state) with **no declared precedence** | `lifecycle_stage` is the single source; `status` is never used for measurement | Every people metric stays ambiguous and L-2 recurs under a new name |
| **D-2** | Is `tenant_orders.created_at` the right time basis for collected money? It is session-create time, not payment time | Use it, and label the metric's time basis honestly on the surface | Needs a schema addition to capture payment time |
| **D-3** | Sum across currencies, or refuse to? `deals.currency` exists and is currently discarded | **Never sum across currencies.** Group by currency; show one figure only when one currency is present | A mixed-currency tenant gets a meaningless number that looks precise |
| **D-4** | Which "won" — `deals.status='won'` or `stage_type='won'`? | `stage_type`, and backfill the pre-`20261204000000` deals | Two surfaces disagree about the same deals, permanently |
| **D-5** | Gross or net for collected revenue? `application_fee_amount` is Paige's cut | Net (what the tenant receives) as the headline; gross available beside it | The tenant's "revenue" includes money they never got |
| **D-6** | Recurring convention for committed value | Monthly-equivalent — adopt the shipped choice, do not invent a second | A second convention in the codebase, and §18 drift |
| **D-7** | Is the at-risk threshold (21 days, hardcoded) tenant-configurable? | Yes, defaulting to 21 | Every business is assumed to have the same cadence |
| **D-8** | Fix L-1/L-2/L-3 in Phase 2, or wait for the full dictionary? | Fix in Phase 2 — they are telling owners untrue things now | Known-false numbers stay on screen for longer |

---

## 7. What Phase 2 does with this, once confirmed

1. Lift the payload shape out of the pinned plpgsql body into a **metric definition table**, and
   make `sales_funnel.created_deals_by_current_stage` its first row (§18 — extend the one contract, never
   build a second beside it). The `metric_id` CHECK at `20261004000000:18` and the hardcoded
   metric gate at `:323` (`OR p_metric_id IS DISTINCT FROM 'sales_funnel.created_deals_by_current_stage'`)
   are what make a second metric a schema change today. **The prefix is `sales_funnel.`, not
   `funnel.`** — the CHECK permits exactly one literal, so the definition table must be seeded with
   the shipped string or every insert fails 23514. (`:325` is the range-key whitelist, a different
   gate; relaxing it admits nothing new.)
2. Add `UNCONFIGURED` to the coverage layer, and give it the next action (§5), so a new
   account is guided rather than told its analytics cannot be measured.
3. Fix L-1, L-2, L-3, L-4.
4. Consolidate the capture readers onto one pipe, per the original Phase 2 assignment.

---

## 8. Questions that need database access

Unanswerable from this session; collected rather than guessed.

1. Do any Solo tenants currently have **two** `is_default=true` pipelines, or none? Both yield
   `UNAVAILABLE`, and the seeding guard in §5 makes "none" reachable.
2. How many deals carry a `currency` other than the tenant's primary — i.e. is D-3 theoretical or live?
3. Has any `tenant_orders` row ever reached `status='complete'`? If not, M-2 is correct but has
   never produced a non-zero figure, which changes how it should be introduced.
4. How many deals sit in a won stage with `actual_close_date IS NULL` (the pre-`20261204000000`
   population that D-4 turns on)?
5. How many existing Solo tenants have **zero** pipelines — i.e. how many are sitting on
   `UNAVAILABLE` right now because they were created after the auto-provisioner was removed?
   This decides whether §5 is a new-account edge case or the current majority experience.
6. For tenants that do have pipelines, how many were created before `20260915000000` (and so were
   auto-seeded) versus built by hand in Setup afterwards?
7. Does any Solo tenant have a live QuickBooks connection with `quickbooks_financials` rows? This
   decides whether the `profit` lens is conditionally live or conditionally empty, and it is the
   difference between shipping a lens and shipping a prompt to connect an integration.
8. What fraction of a Solo tenant's contacts arrived through a `growth_form_submissions` row? That
   fraction **is** the `mkt` lens's coverage number, and it has to be shown next to any acquisition
   figure rather than assumed high.
9. How many `tenant_service_subscriptions` rows are `status='active'` with a non-null `price_id`?
   Rows with a null `price_id` carry no amount and would silently drop out of an MRR sum.

---

## 9. What the peer gate changed, and why it is recorded rather than quietly fixed

An independent adversarial pass read this document against the code before it was proposed, under
the §39 peer gate. It checked 64 citations across two completed lenses and confirmed 45. Its
verdicts were **FIX_FIRST** and **BLOCK**, and it was right on every point I re-verified myself.

**What survived unchanged**, which matters as much as what did not: the economic model in §1 — the
`tenant_orders` COLLECTED anchor, its `payment_status === "paid"` gate, and the fact that it is the
only writer of `status='complete'` — plus the absence of any cost table *on the chain*, the
`useCommandCenter.ts:163` mislabel, the truth-state expression, and the default-stage fallback.

**What it caught:**

| Class | Count | Example |
|---|---|---|
| Wrong lens verdict | 4 | `mkt` marked NOT BUILDABLE; the attribution row holds an FK to `clients` |
| Wrong metric identity | 1 | `funnel.` where the shipped CHECK permits only `sales_funnel.` |
| Wrong description of a live metric | 1 | `active_clients` described as "every non-archived row" |
| Off-by-one or wrong-range citation | 7 | `amount_total_cents` cited at `:15`, which is `memo text` |

**The instructive pattern**, and the reason this section exists rather than a silent edit: every
wrong lens verdict was an **absence claim** — *"no such table exists"* — and three of the four were
refuted by tables **listed in my own grounding data**. The evidence was in hand; the generalisation
from *this table lacks the column* to *the platform lacks the capability* is what failed. A dictionary
whose whole purpose is to stop the product asserting things it cannot prove nearly shipped four
assertions it could not prove.

One place the gate itself overstated, verified rather than relayed: it reported the empty-funnel
fallback renders "four invented values." It renders four invented **labels**, each showing
*"No proved count"* under a watermark reading *"no implied volume or conversion."* No number is
fabricated. L-4 is written to the milder, accurate version.
