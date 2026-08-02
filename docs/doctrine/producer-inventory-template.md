# Producer Inventory Template — §37 × Tier Axis

> **Status and authority.** Fillable template for the §37 producer inventory, extended with
> the six-tier axis of [`tier-matrix.md`](./tier-matrix.md) per the §51 tier-parity railing.
> `CLAUDE.md` §37 (producer inventory), §9 (tenant seam), and §32 (verification) remain
> canonical. Copy this file into the PR/handoff for the change under review and fill it — do
> not fill it in place.

## Why the tier axis

§37 already mandates walking **eight caller classes** for every contract-changing endpoint. A
green walk of all eight can still ship a tier regression: the *same* frontend component calls
an RPC as a **Standalone Tenant** in one flow and as an **Agency** managing a child in another;
a `pg_cron` job calls with **no JWT** (effectively operator/service-role); a public form-submit
is reached **Anonymous**. The class tells you *what kind of caller*; the tier tells you *whose
tenant resolves and what RLS lets through*. Both are required.

> **The rule:** *A producer whose tier isn't named is a producer that wasn't audited.*

The six tiers (from `tier-matrix.md`): **God/Super Admin · Agency · Standalone Tenant ·
Sub-account · Client · Anonymous.** For each, the tenant-resolution path is fixed by a named
resolver — restate it in the row so the reviewer sees the actual resolution, not "it's scoped."

| Tier | Resolver that fires | Resolves to |
|---|---|---|
| God / Super Admin | `is_platform_owner()`→`is_super_admin()` (`user_roles.role='super_admin'`); acts-as via `current_user_tenant_id()` `is_platform_admin` guard | all tenants / chosen active tenant |
| Agency | `current_user_tenant_id()` via `agency_can_manage_child` / `agency_team_role` | own tenant + managed children |
| Standalone Tenant | `current_user_tenant_id()` via active `tenant_members` | own tenant |
| Sub-account | `current_user_tenant_id()` via own membership on child (`parent_tenant_id IS NOT NULL`) | own child tenant, isolated from parent aggregate |
| Client | `get_paige_persona_context()` via `clients.linked_user_id` | tenant owning their `clients` row (NULL from `current_user_tenant_id()`) |
| Anonymous | none (`auth.uid()` NULL) | nothing; public policies/RPCs only |

---

## Section A — Endpoint under review

- **Endpoint / RPC / edge fn:** `__________`
- **Change type:** ☐ request-contract tighten  ☐ response-contract change  ☐ new endpoint  ☐ RLS/policy change
- **Resolver(s) it relies on:** `__________` (name every resolver from `tier-matrix.md`)
- **Which tiers are *expected* to reach it (before the change):** `__________`
- **Which tiers *should* reach it (after the change):** `__________`
- **If a tier is intentionally dropped, name it + the §14 replacement plan:** `__________`

## Section B — Producer inventory: 8 caller classes × 6 tiers

For **each** of the eight §37 caller classes, add one row **per producer found**. Every row
names the **tier** it calls from, that tier's **tenant resolution** (restate the real path),
and the **expected outcome** (200 + correct scope / 4xx / N/A-and-why). A class with no
producers is marked "none found" **with the grep/search that proved it** — an empty cell is
not an audited cell.

> Fill the `Tier` column with one of the canonical six. If a single producer calls from
> multiple tiers (e.g. a component used by both a standalone owner and an agency managing a
> child), give it **one row per tier** — those are different resolution paths and different
> expected outcomes.

### B1 — Frontend callers
_(React components, admin surfaces, tenant/client UI, hooks, service-layer wrappers. Grep the
endpoint name AND any URL/RPC-name resolving to it.)_

| Producer (file:symbol) | Tier | Tenant resolution (real path) | Sends what | Expected outcome | Verified |
|---|---|---|---|---|---|
| `______` | `______` | `______` | `______` | 200+scope / 4xx / N-A | ☐ |

### B2 — Sibling edge functions
_(Other functions invoking this one via `supabase.functions.invoke()` or direct HTTP.)_

| Producer | Tier (usually service-role → operator/act-as) | Tenant resolution | Sends what | Expected outcome | Verified |
|---|---|---|---|---|---|
| `______` | `______` | `______` | `______` | `______` | ☐ |

### B3 — Database triggers
_(`AFTER INSERT/UPDATE/DELETE` triggers calling out via `pg_net` or a queue-drainer.)_

| Producer (trigger + table) | Tier | Tenant resolution | Sends what | Expected outcome | Verified |
|---|---|---|---|---|---|
| `______` | `______` | `______` | `______` | `______` | ☐ |

### B4 — `pg_cron` / `pg_net` migrations
_(Scheduled jobs. Grep every migration for the function name AND the request-body shape.)_

| Producer (job name / migration) | Tier (typically no-JWT → service/operator) | Tenant resolution | Sends what | Expected outcome | Verified |
|---|---|---|---|---|---|
| `______` | `______` | `______` | `______` | `______` | ☐ |

### B5 — GitHub Actions
_(CI workflows hitting the endpoint: deploy previews, smoke tests, scheduled probes.)_

| Producer (workflow / script) | Tier | Tenant resolution | Sends what | Expected outcome | Verified |
|---|---|---|---|---|---|
| `______` | `______` | `______` | `______` | `______` | ☐ |

### B6 — External webhooks / OAuth providers
_(Third parties POSTing in — Stripe, Plaid, iSoftpull, DocuSign, Meta, etc. Cross-check the
provider's ACTUAL payload against the new guard.)_

| Producer (provider + event) | Tier (usually Anonymous+signature or service) | Tenant resolution (how the payload maps to a tenant) | Sends what | Expected outcome | Verified |
|---|---|---|---|---|---|
| `______` | `______` | `______` | `______` | `______` | ☐ |

### B7 — n8n / Zapier / MCP callers
_(Paige-driven tool invocations, workflow automations, other agent frameworks. Grep MCP tool
defs AND the workflow registry.)_

| Producer (tool / workflow) | Tier (God act-as, or the tenant Paige resolved) | Tenant resolution | Sends what | Expected outcome | Verified |
|---|---|---|---|---|---|
| `______` | `______` | `______` | `______` | `______` | ☐ |

### B8 — Tests / operational scripts
_(Anything under `scripts/`, `tests/`, `.github/scripts/`, or runbooks exercising the endpoint.)_

| Producer (path) | Tier it simulates | Tenant resolution | Sends what | Expected outcome | Verified |
|---|---|---|---|---|---|
| `______` | `______` | `______` | `______` | `______` | ☐ |

## Section C — Tier coverage assertion (must be complete to ship)

For every one of the six tiers, assert its coverage across the inventory above. A tier with
**no producer** is a positive finding ("no caller reaches this endpoint from Tier X"), not a
blank — state it and say how you proved it.

| Tier | Producers found (count) | Every one passes the new guard? | If a break: producer changed / guard widened / producer removed (§14) |
|---|---|---|---|
| God / Super Admin | `__` | ☐ yes ☐ n/a | `______` |
| Agency | `__` | ☐ yes ☐ n/a | `______` |
| Standalone Tenant | `__` | ☐ yes ☐ n/a | `______` |
| Sub-account | `__` | ☐ yes ☐ n/a | `______` |
| Client | `__` | ☐ yes ☐ n/a | `______` |
| Anonymous | `__` | ☐ yes ☐ n/a | `______` |

## Section D — Response-consumer inventory (if the response contract changed)

Per §37, a response change requires the matching **consumer** inventory across the same eight
classes — follow the response through every downstream transformer that reads, maps, branches
on, stores, or forwards a field. Cross with tier where the consumer's tier changes what it
expects back.

| Consumer (file:symbol) | Class | Tier | Field/shape it reads | Still resolves after change? | Fix if not |
|---|---|---|---|---|---|
| `______` | `______` | `______` | `______` | ☐ yes | `______` |

## Section E — Sub-account two-sided check (mandatory when child data is touched)

Sub-account (Tier 4) is the tier most often missed because it shares `account_type='standalone'`
with Tier 3. When the change touches any child-tenant data, both directions must be asserted:

- **Isolation (sub-account-in):** a sub-account's own users still CANNOT see sibling
  sub-accounts or the parent aggregate. Proof: `______`
- **Reach (agency-down):** the managing agency CAN still reach the child via
  `agency_can_manage_child` / `agency_team_role` (and `agency_specialist` still limited to
  `scoped_subaccounts`). Proof: `______`

## Rules of this template

1. **Every producer row names a tier.** Unnamed tier = unaudited producer = do not ship.
2. **Restate the real resolution path**, don't write "scoped" — cite the resolver from
   `tier-matrix.md` (e.g. "Client → `get_paige_persona_context()` via `clients.linked_user_id`;
   `current_user_tenant_id()` returns NULL here").
3. **No blank cells.** "None found" is a valid, required answer — with the search that proved it.
4. **Half-hardened is worse than un-hardened** (§37). A guard that passes Tier 3 but 4xxs an
   Agency or silently mis-scopes a Client looks fixed while it is broken.
5. **The adversarial verifier owns this inventory** (§14/§32) — it is the behavioral verifier's
   mandatory pre-check, not optional paperwork.

## Canonical references
- `CLAUDE.md` §37 — producer inventory (the 8 caller classes + response-consumer rule).
- `CLAUDE.md` §9 — tenant/operator seam.
- `CLAUDE.md` §32 — dual-layer verification.
- `CLAUDE.md` platform-independence — no hardcoded live ids (name tiers/archetypes, never live tenant/user ids). *Owner-ruled but not yet a numbered § in `CLAUDE.md` — pending doctrine paste #591.*
- `CLAUDE.md` §51 — tier-parity railing; its companion platform-impact-assessment directive is owner-ruled but not yet pasted (pending #591).
- [`tier-matrix.md`](./tier-matrix.md) — the canonical six tiers + live-grounded resolvers.
- [`compliance-checklist-template.md`](./compliance-checklist-template.md) — the six-row gate.
