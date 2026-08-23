# Platform Operator Console — install plan (rev 2)

**Status.** Revised 2026-08-23 against pack rev 2, by a four-lane delta crew plus a §39
adversarial peer-gate, on top of the rev-1 seven-agent survey. **Nothing is built until the
owner rules on §2.**

**Owner rulings this plan is built on** (2026-08-22/23, verbatim):
1. Does the new design supersede the earlier CD packs? — *"Yes"*
2. Scope — *"strictly just the Super Admin workspace"* (the marketing landing page stays §28 frozen)
3. Strip vs evolve — *"If it's easier or smarter to just strip then let's do it. This new design UI
   will be our main surface moving forward."*
4. *"this will be the absolute source of truth for how we build out every single platform part"*
5. *"I don't think we're going to finish this completely in one pass"* — correct, and the plan is
   built as **18 rounds**, each one shippable on its own.

---

## 0. Two files, two roles — do not confuse them

| File | Role |
|---|---|
| `PAIGE Super Admin Shell v3.dc.html` + `paige-ia.js` + `mind-brain.js` + `support.js` | **Source of truth.** Diff against these. Byte-clean through re-deliveries. |
| `PAIGE Platform Operator - standalone.html` | **Screenshot target only.** Compiled, everything inlined, zero network. Never edit it, never diff it. CD regenerates it each revision. |

`node scripts/live-drive/pack-shoot.mjs` renders all 32 views × 2 themes from the standalone with
network hard-blocked, and asserts CD's rule that **no surface may show a document scrollbar**.
First full run: 64 captured, 0 failed, 0 scrollbars.

**Two edits must be re-applied on every CD re-delivery** — rev 2 arrived with both undone, because
CD regenerates from their own source: the §50 pop-culture mark in `stage2-design-package.md` §9a,
and the real-format SSN/EINs in `paige-ia.js`.

## 1. What rev 2 changed

Campaigns went 4 → 6 views (**Catalog** and **Sales** are net-new). A per-tenant customization
schema landed. Relationships → Segments became a real builder. `SUPER ADMIN` → **`PLATFORM
OPERATOR`**. Three fidelity rules added (11 derived-state-never-chosen, 12 bottom rail, 13
customization-may-not-invent-data). Four rulings closed, including **processor-agnostic**.

Contract now reads **6 slots / 32 views / 28 summons / 13 net-new catalogues**.

The rev-1 headline is unchanged and still gates everything: **there are two live operator consoles**
(`/operator` and `/admin` godMode), different people land on each, and act-as moves one-way between
them via `FleetConsole.tsx:135`. Collapsing them is Slice 0.

## 2. The finding that changes the design — Sales cannot be a ledger

CD's provenance says Catalog and Sales are *"design-led; no repo substrate exists yet."* **That is
not true, and the truth is more interesting than a missing table.**

**There are three distinct commerce layers already shipping, and the pack's Catalog/Sales sits
across two of them:**

| Layer | What ships | Rows on prod |
|---|---|---|
| **L1 — what Paige sells to tenants** | `platform_subscription_plans` (seeded: solo $149/mo, agency $397/mo, enterprise quoted), `platform_subscriptions` | 3 plans |
| **L2 — what a tenant sells to their customer** | `tenant_products` · `tenant_prices` · `tenant_orders` · `tenant_service_subscriptions` · `tenant_stripe_accounts`, plus a **mounted 775-line admin UI** (`StorefrontPanel`, at Setup → General), a public storefront page and a read hook | 0 (unused, but complete) |
| **L3 — marketplace revenue share** | `marketplace_items.take_rate_bps` (default 2000), `marketplace_vendors.stripe_connect_account_id`, and `marketplace-checkout-session` which already implements exactly CD's rule: first-party keeps 100%, third-party gets `transfer_data.destination` + `application_fee_amount` | live |

So **CD's "only the marketplace splits" is not a proposal — it is a description of shipped code.**

**And the collision.** `tenant_revenue_classification` (operator-only, `force row level security`,
`is_platform_owner()`) plus `20260815120000_revenue_integrity_chain.sql` already enforce — via a
CONSTRAINT TRIGGER, because a CHECK cannot hold a subquery — that a tenant may only **rest** at
`revenue_class='paid'` when three gates hold at once. That migration's own header calls it *"the
investor-grade 'we are not lying about revenue' enforcement, at the DB layer (a broken app can never
mint a false-green paid row)."*

An operator Sales surface with **hand-typed booked amounts** would be a second, unenforced revenue
truth sitting beside a DB-enforced one. That is precisely the §57 divergence class — and this repo
built the enforcement specifically to stop it.

### The recommendation (R6, below)

- **Operator Catalog** = `platform_subscription_plans` (already seeded, already read by four live
  surfaces) **plus** a small operator-services table for one-time work (migration, setup) that has
  no home today. It does **not** reuse `tenant_products` — that is the tenant's storefront, a
  different layer and a different audience (§9).
- **Operator Sales** = a **read** over `platform_subscriptions` + `tenant_revenue_classification`,
  not a hand-kept ledger. Every figure the pack shows as a sum stays a sum — of the enforced truth.
  Where a line has no verified value, it renders `—`, which the pack already does correctly for
  "Deals in flight."
- **`tenant_products`/`_prices`/`_orders`/`_service_subscriptions` is untouched.** It is the
  tenant-tier storefront and it is what the later tenant rollout builds on.

This keeps one home per layer (§18), derives from the enforced record rather than beside it (§57),
and changes nothing about merchant-of-record (§38).

**Peer-gate corrections folded in** (the delta lanes got these wrong and were caught):
- `tenant_orders` **cannot** hold a Sales line regardless: it has exactly one policy, `SELECT`-only,
  so authenticated writes are denied — only the webhook's service_role inserts. Its states barely
  overlap and it carries no stage, tier, campaign, counterparty or close-reason column.
- Pointing the shipped cluster at the **Paige Operator Workspace** is wrong three ways: its frontend
  resolver was deleted as dead code, the "~56 call sites" figure is a sentence in a comment rather
  than a count (real count: 3 files), and that workspace is deliberately classified `internal_test`
  **so revenue aggregates exclude it**.
- The B-iv Connect posture fix is **not** one file: `stripe-webhook` has zero `event.account`
  handling, so a direct charge would complete and never be recorded.

## 3. Owner rulings needed before code

### R1 is DISSOLVED, not answered (owner/CD, 2026-08-23)

There were never two consoles to choose between. **`admin` is never a URL** — there is one
operator console, and godMode/admin is a **role and scope band inside it**. The question was
malformed, so it does not get a ruling and it no longer gates anything. Rounds 0–2 proceed.

Two consequences, both concrete:

- **The scope band already exists in the design.** The top band reading
  `Platform scope · No tenant · operator surface · tenant_id IS NULL`, shifting tone through
  read and act scopes, is where admin-as-role lives. It is drawn. **It needs wiring, not
  designing** — do not re-design it, and do not invent a second place for role/scope to live.
- **The divergent landing constants are a bug, not a decision.** `resolveLandingRoute.ts:208`
  sends `super_admin` to `/operator/fleet/tenants` while `JoinPlatform.tsx:23` sends the same
  role to `/admin/platform/tenants`. With one console, that is simply two entry points that
  disagree — Round 0 reconciles them rather than choosing between worlds.

### The design is the source of truth at the FUNCTION level, not just the surface level

The 2026-08-18 ruling ("if Claude Design made it, that's how it's supposed to be") previously
read as *whole surfaces*. It now reads one level down: **individual functions too.**

**The Trust Compass is the worked example.** The function is the same, but *where it lands* and
*how it reads* belong to the design. The existing implementation gets re-imagined behind that
surface — not the reverse.

**The practical form, binding on every round:**

> A round never begins by asking whether the design can accommodate an existing shape.
> It begins by asking **what wiring the designed shape requires.**

This inverts the default instinct of every round below. Where a round's text still reads as
"reconcile the design with what ships," read it in this direction instead.

### The rulings that remain

| # | Question | Recommendation |
|---|---|---|
| **R2** | **§60 collision** — v3 gives the operator People/Pipeline/Conversations, which `tierFeatures.ts:236-247` explicitly denies God. | **New operator-scoped Features**, not the tenant bits. Borrowing them silently widens every tier check that reads them. |
| **R3** | **19 shipped sub-tabs have no home** (§58). Worst: Platform Support (3) and Provisioning (2). | Retain those outside the six, or rule them dropped **explicitly** — today they'd vanish silently, since `OperatorApp.tsx:358` redirects unknown sections to Fleet rather than 404ing. |
| **R4** | **Trust Compass** — v3 is a 5-level ceiling; we ship a 3-value enum and no `autonomy_lanes` table. | Build the real substrate (#165). Until then render the dial **read-only with the reason** — a dial that appears to clamp and doesn't is the §13 failure. |
| **R5** | **`PLATFORM OPERATOR` rename** — CD asks us to "rename it in the codebase's tier enum too, or record why not." | **Rename the label, not the role.** `super_admin` is a DB enum under RLS policies and CI guards; `is_platform_operator()` already means exactly what CD's tier name means. §65: the name maps to the mental model, the name is never the authority. Record the why-not. |
| **R6** | **Sales: derived read, or hand-kept ledger?** (§2 above) | **Derived read.** A typed ledger beside the revenue-integrity chain is a second truth the DB was built to prevent. |
| **R7** | **Does the operator need a one-time-services catalog at all** (migration, setup fees), or is L1 subscriptions the whole operator offering? | Ship L1-only first; add services when a real one is sold. Cheaper to add a table than to unpick a speculative one. |

## 4. The 18 rounds

Each round is one PR: §32 verified, §39 peer-gated, tier matrix updated in the same commit (§66),
and **screenshots captured before and after** so the delta is visible rather than asserted.

### Foundation — must land in order

| # | Round | Delivers | Gate |
|---|---|---|---|
| **0** | One operator door | The divergent landing constants reconciled (a bug, not a choice — see §3). Act-as gains a real exit instead of `window.location.assign("/admin")`. The scope band wired to role, per the design that already draws it. | — (unblocked) |
| **1** | Shell geometry | Three-column grid + full-width scope band + command-bar row, on scoped `--pg-*` tokens, self-hosted fonts, `useReducedMotion` wired, `IA.DEST` lookup guarded, unknown section 404s. Old spec registries deleted (§30 strip). | 0 |
| **2** | The two shell-wide primitives | The bottom rail and the control chrome, as shared primitives (§18) — **before** any surface uses them, so they are not retrofitted 30 views later. | 1 |

### Proving ground

| # | Round | Delivers | Gate |
|---|---|---|---|
| **3** | Fleet (3 views) | Systems check · Directory · History. The only slot live end to end today, so it proves the new shell and both primitives against real data. Keeps the R3F orbit. | 2 |

### Backends — pulled early, run in parallel

| # | Round | Delivers | Gate |
|---|---|---|---|
| **4** | Operator commerce read-model | Catalog over `platform_subscription_plans`; Sales as a derived read over `platform_subscriptions` + `tenant_revenue_classification`. No new ledger. | **R6** |
| **5** | Processor adapter boundary | CD's five needs as a `_shared` seam with Stripe as the first adapter. Includes the `event.account` gap in `stripe-webhook` that would otherwise make a direct charge silently never complete. §37 producer inventory across every Stripe caller. | 4 |
| **6** | Tenant customization schema | `CAMP_SCHEMA` + `CARD_FACTS` as config-as-data behind a Paige-callable atomic jsonb merge RPC (§10). Rule 13 enforced structurally: an enabled fact with no substrate renders `—`. | 1 |

### Surfaces — 7 through 13 are independent of each other

| # | Round | Delivers | Gate |
|---|---|---|---|
| **7** | Settings (10 views) | The largest slot. Re-establishes the §53 owner/staff split that `/admin` has and `/operator` lacks. | R2 |
| **8** | Campaigns shell + Active · Social · Performance | The 6-view tab row, routed **by name** — rev 2 moved the indices. | 2, 6 |
| **9** | Campaigns → Catalog | The offering surface over round 4's read-model. Derived state, never a picker (rule 11). | 4, 8 |
| **10** | Campaigns → Sales | The figures strip, target bar, timeline and four tables — every figure a sum of the enforced record. | 4, 8 |
| **11** | Campaigns → Pipeline | Over the existing `pipelines`/`pipeline_stages`/`deals` cluster, which already carries `probability`, `value_cents`, `status` and `lost_reason`. Needs an operator-scoped pipeline; `deals.tenant_id` is nullable today. | 8 |
| **12** | Analytics (5 lenses) | Charts, with "a chart with no substrate draws no line" as a hard requirement. | 2 |
| **13** | Marketplace (4 views) | Richer substrate than CD knew — seven authoring RPCs ship. **Build survives** (§58). | 2 |

### Relationships — split, because Segments is its own problem

| # | Round | Delivers | Gate |
|---|---|---|---|
| **14** | Relationships → People · Conversations · Calendar | Read surfaces over the operator book. Conversations has real substrate CD didn't credit: three migrations plus two live operator SMS functions. | R2 |
| **15** | Relationships → Segments | The clause builder. **Two hard requirements**: a `{field, op, value}` triple compiled server-side against an allowlist and never string-concatenated; and a saved segment that **stores the triple, not prose** — the pack's `segSave` currently persists English and freezes the count, so its own "recomputed on read" label is a claim the implementation does not honour. Plus a §9 hole neither lane raised: a saved segment is a stored query later executed by a **service-role sender, where RLS does not apply** — it must carry and re-assert its scope. | 14, R2 |

### Tail

| # | Round | Delivers | Gate |
|---|---|---|---|
| **16** | Capabilities + Trust Compass | The ten verbs, the ⌘K palette, the ceiling as real substrate. | 7, **R4**, #165 |
| **17** | The Mind | Light mode authored (`mind-brain.js:384` hardcodes `const light = false`), conduction driven by real events or honestly at rest. Converges with #163 Brain-Live rather than forking a second brain. CD's advice: do this **last**, it eats a pass on its own. | 7 |
| **18** | Detach / multi-window | Only after the transport's session token is server-issued — today it is `Math.random()` from a URL param, broadcast in cleartext. | 1, #215 |

**Parallelism.** 0 → 1 → 2 → 3 is strictly sequential. After round 3: rounds 4+6 run together;
7, 12, 13, 14 are mutually independent; 8 → 9/10/11 is a chain. 16, 17, 18 are the tail.

## 5. Verification, every round

`npm run ci:tsc` (the ratchet) · `eslint` + `gold-discipline-lint` on changed files · the four
whole-repo `lint:*` guards · `npm run test` · `npm run build` · §37 producer inventory on any
RLS/RPC change · §32.b proof pre-merge and §32.a persisted-apply post-merge on any migration ·
**`pack-shoot.mjs` before and after**, at 1600 and ~900 wide, both themes.

## 6. Honest limits

- **No surface has been rendered from our own app** — only the pack. The operator console is
  auth-gated and this session cannot reach prod. A §32.c live drive is owed at every round.
- The rev-1 lanes were briefed on the wrong premise (that `src/operator` is the only console). The
  peer-gate caught it, but the per-lane detail beneath is still scoped there, so **`/admin` godMode
  needs its own survey pass before round 0 is written**.
- The rev-2 lanes under-counted the commerce substrate four times and missed the revenue-integrity
  chain entirely; the peer-gate caught that. It will have its own misses — §39 is a layer, not proof.
- Line counts and sizings are the crews', spot-checked rather than independently recounted.
