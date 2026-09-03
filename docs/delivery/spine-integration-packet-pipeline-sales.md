# Spine item 4 — Clients / Pipeline / Sales: source-to-Spine packet

**Recommendation: do NOT register a new Spine capability for this domain.** The reads already
exist, are already tenant-scoped, and are already wired into PAIGE. A new `sales.*` or
`pipeline.*` capability would be a second home for a job that has one (§18) — the same conclusion,
reached the same way, as the Connections packet.

Everything below was measured on production (`xygzykjyynhzqytbqnzu`) or read from the deployed
source on `main`. Nothing here is inferred from a table's existence.

---

## 1. What the stores actually hold

| Store | Rows | Tenants | Reading |
|---|---|---|---|
| `pipeline_stages` | 89 | 12 | real, and broadly configured |
| `pipelines` | 17 | 12 | real, and broadly configured |
| `clients` | 7 | 3 | thin — **10 of 13 workspaces have an empty book** |
| `deals` | 1 | 1 | real, but one row |
| `tenant_products` | 0 | 0 | not active |
| `tenant_prices` | 0 | 0 | not active |
| `tenant_service_subscriptions` | 0 | 0 | not active |
| `orders` | 0 | — | **not a Sales store — see §3** |

### The single deal is real, and that changes the reasoning rather than the conclusion

I was about to record it as fixture-like. It is not: it sits on a real workspace, carries a value,
is staged, has a linked contact, has status `open`, and was updated after creation on 2026-08-14.
A person entered it.

That does not make it an aggregate. **One deal cannot support velocity, forecast, win rate, average
cycle time, or any trend** — those need a population, and there isn't one. So the conclusion holds
("no aggregates"), but the honest reason is *"one real deal is not a sample"*, not *"the data is
fake"*. Recording the wrong reason would have justified the right answer for a reason that stops
being true the moment a second deal exists.

### Structure is real; activity is not

The split matters for what may honestly be said. **Pipeline structure is genuinely configured
platform-wide** — 12 of 13 workspaces have pipelines and stages. **Sales activity barely exists.**
A read that says "your pipeline has 5 stages" is true today; a read that says anything about how
deals move through it is not.

---

## 2. §18 — this already has a home, in two places

**PAIGE already reads this domain every time she is asked to.** Wired in `paige-ai-chat`:

| Tool | Reads |
|---|---|
| `crm_pipeline_summary` | pipelines, stages, clients by lifecycle, open deals, tasks |
| `crm_list_deals` | deals, filtered by status/stage/contact/owner |
| `crm_search_contacts`, `crm_get_contact_summary` | contacts |
| `crm_list_tasks` | tasks |

plus governed writes (`deal_create`, `deal_move_stage`, `crm_create_contact`, `pipeline_configure`,
…) already carrying confirm-gating and autonomy-lane classification.

**And an aggregate read already exists in SQL:** `practice_dashboard_metrics(p_window_days)` —
`SECURITY DEFINER`, granted to `authenticated`, tenant server-resolved via
`current_user_tenant_id()` with `practice_scope_forbidden` raised when it is null. It returns
`active_clients`, `new_clients`, `won_value_cents`, `pipeline_value_cents`, `active_retainers`,
`deals_by_stage` and `arpc_cents`.

So the question a Spine capability would answer is answered twice already. Registering a third
answer is the drift §18 exists to prevent, and it would be the *worst* kind — a rival aggregate
that can disagree with the dashboard the tenant is looking at (§57).

### A hypothesis I tested and withdrew

`practice_dashboard_metrics` has **no role gate** — its only guard is `t IS NULL`. I expected that
to mean a workspace's own clients could read its revenue aggregates, since `get_business_context_readiness`
explicitly added a gate against exactly that.

**It does not.** The deployed `current_user_tenant_id()` has no `clients.linked_user_id` branch: it
resolves via `profiles.active_tenant_id` (itself guarded by membership, agency, or platform-admin)
or an active `tenant_members` row. A client with no membership resolves `NULL` and is refused. I had
conflated it with `get_paige_persona_context()`, which *does* resolve `linked_user_id` first.

No defect. Recorded because the reasoning nearly produced a false finding, and because that same
conflation — in the opposite direction — *is* a real defect elsewhere (§4).

---

## 3. `orders` is Platform Billing wearing a Sales name

The brief requires Sales stay separate from Platform Billing. `orders` looks like the natural Sales
store and is not one. Its columns:

```
id · user_id · stripe_session_id · plan_type · amount · currency · status · created_at · updated_at
```

**There is no `tenant_id` at all.** It is keyed to a `user_id` and a Stripe checkout session for a
`plan_type` — that is a tenant paying *Paige* (§38 L1), not a tenant's client paying the tenant.
Reading it as a Sales source would breach the exact separation the brief demands, and would
attribute platform subscription revenue to tenant sales.

Tenant-side commerce lives in `tenant_products` / `tenant_prices` / `tenant_service_subscriptions`,
all of which are **empty**. So tenant commerce is `NOT_CONNECTED`, not "zero revenue".

---

## 4. What Spine should report today

Honest states, no manufactured activity:

| Fact | State | Why |
|---|---|---|
| Pipeline configured | **LIVE** — already served by `crm_pipeline_summary` | real on 12 of 13 workspaces |
| Client book size | **LIVE**, and honestly **0** for 10 of 13 | an empty book is a true answer, not a missing one |
| Deal activity | **PARTIAL** — one deal exists; no aggregate is derivable | one row is not a sample |
| Revenue / velocity / forecast | **UNAVAILABLE** | would require manufacturing |
| Tenant commerce (products, prices, subscriptions) | **NOT_CONNECTED** | zero rows, zero tenants configured |
| Payment completion | **UNAVAILABLE** to Sales | `orders` is Platform Billing (§3) |

**A configured-but-empty source stays honestly empty.** "10 of 13 workspaces have no contacts" is
a real, useful, decision-relevant answer. Inventing a pipeline metric to fill the space would not be.

---

## 5. What would change this recommendation

Register a capability when there is a question PAIGE cannot already answer *and* the data can
answer it honestly. Concretely, revisit when **either**:

- deals reach a population where movement is measurable (a workspace with enough deals that stage
  transitions mean something), **or**
- tenant commerce is actually configured (`tenant_products` / `tenant_prices` non-empty), which is a
  genuinely new source rather than a second view of an existing one.

Neither is true today, and building for either now would mean shipping a read whose only honest
output is "nothing yet" — through a seam that already says that.

---

## 6. One thing this packet did surface, and it is not a Spine gap

Grounding the CRM read path found a live §9 defect in how PAIGE reaches it: the tool role gate is
global (`user_roles` has no `tenant_id`, §59) while the conversation's tenant resolves the
`clients.linked_user_id` branch first. Combined, a global admin/coach of workspace A who is a linked
client of workspace B drove the service-role CRM handlers against **B**.

Proven on prod, latent today (zero linked clients), fixed in its own PR rather than folded in here.
It is recorded in this packet because it is the reason item 4's grounding was worth doing at all —
the domain's Spine answer is "already has a home", and the value was in checking whether that home
was sound.
