# Tier Matrix — the Canonical Six

> **Status and authority.** This document is a derived implementation reference for the
> §51 "tier-parity railing." The directives in `CLAUDE.md` §9 (platform vs tenant seam),
> §37 (producer inventory), §32 (dual-layer verification), and platform-independence (no hardcoded live
> ids) remain canonical. If this synthesis and `CLAUDE.md` differ, `CLAUDE.md` governs.
> Every future §37 producer inventory, §32 verification walk, and crew brief points HERE
> for the enumeration of who can call an endpoint and how their tenant resolves.

## §56 PRE-BUILD GATE — check this matrix FIRST, before the first line of code

**Owner-ruled 2026-08-10 (CLAUDE.md §56).** This matrix is not only a *post-build* §51
verification reference — it is the **pre-build** design gate. Before building or placing ANY
feature/tile/route/RPC/edge fn/migration/surface/copy, answer, out loud, TWO questions against
the six tiers below:

1. **Which account type(s) is this FOR?** Name them. A solo tenant, a sub-account, and an
   agency-as-a-tenant are NOT interchangeable — each resolves `tenant_id`, lands on a different
   home surface, and hits different gates. "Correct for the account I built on" is the trap.
2. **Does the feature BELONG on each of those tiers — should it appear, or NOT?** Decide
   deliberately, per tier. When the owner says "every tier" (e.g. the Systems Check), it must
   render on **every** account type **regardless of incidental state** (empty book, no data,
   default landing surface) — never hidden by an `emptyBook`/branch/route accident.

**§60 — DECLARE the per-tier answer in the ONE helper, don't inline it.** Once you've decided
which tiers a feature is for (question 2), that decision is ENCODED in
`src/lib/tier/tierFeatures.ts` (the `TIER_FEATURE_BASELINE` map), and every render gate reads it
via `useTierFeatures().has(feature)` / `hasFeature(classification, feature)` — never an inline
`account_type ===` compare (the `lint:tier-features` CI guard rejects those). Enterprise is the only
tier that customizes on top of its (Agency) baseline. Owner-locked cells (2026-08-11):
- **`customer_portal_invite` = Solo + Sub-account + Enterprise** (Enterprise gained it via the HYBRID
  ruling, PR #460 — `ENTERPRISE_FEATURES = SOLO ∪ AGENCY ∪ CREATION`); **Agency + God excluded** (a
  client-book "doing" surface, §61 rule 3 — neither has its own consumer client book). Enforced end-to-end
  (#122 UI helper + lint; **#125 server gate** — `create_tenant_invite_token` raises 42501 on a
  `_kind='consumer'` mint for an **agency** target, §32.a-proven; #460 narrowed that guard to agency-only
  so Enterprise passes).
- **`growth` + `studio` (Vibe Studio + Campaigns) = Solo · Sub-account · Enterprise · God — NOT Agency**
  (#125; agency manages sub-accounts, not its own campaign book; god dogfoods per §35). Route-gated via
  `RequireFeature` (`/admin/campaigns`, `/admin/studio`), not nav-only.
- **`subaccount_management` = Agency + Enterprise; `fleet_console` = God** only.

And per §37: when a capability is tier-locked, gate EVERY producer of its underlying seam (UI + the
server RPC), not just the obvious surfaces — a lock that misses one minter, or that stops at the UI, is
not a lock (§9/§13).

## §61 DEFAULT TIER-PLACEMENT RULE — the answer is already known; stop asking per-feature (owner-ruled 2026-08-11)

**Owner-ruled 2026-08-11 (CLAUDE.md §61, PROPOSED pending Cowork's formal wording).** The owner's
framing, verbatim: *"This is yet another time that you guys have asked me… where things should be
placed when we should actually already have this understanding for the entire platform… I would love
for us to lock this in as a complete doctrine."* So the per-feature "which tier gets this?" question
has a **standing default** — decide it from the rule below, do NOT re-ask the owner each time. Deviating
from the default is what requires a specific, named reason (and, for a narrowing, an owner note).

**The standing default distribution — every new `getTierFeatureSet()` feature follows this unless the
owner explicitly rules an exception:**

| Tier | Default | Meaning |
|---|---|---|
| **Super Admin (God)** | **YES** | Has everything (source of truth §57; dogfooding §35). Honest note (§13): God's own baseline still omits a tenant-book flag it has no book for (`customer_portal_invite`, CRM cluster) — it reaches tenant data by act-as (Tier 1), not by carrying the flag. |
| **Solo** | **YES** | Operator running their own business. |
| **Sub-account** | **YES** | Same as Solo (§60). |
| **Agency** | **RESELL** | Does NOT use the feature at its own operator surface; has the ability to RESELL the capability to its sub-accounts via the Marketplace. The Agency `getTierFeatureSet()` does NOT carry the operator flag — resell is the separate Marketplace mechanism. |
| **Enterprise** | **YES + RESELL** | HYBRID — inherits Solo ∪ Agency; gets both operator-use AND reseller ability. |

**Exception rule.** Any deviation from this default requires an explicit owner ruling AND is documented in
the feature's declaration comment in `tierFeatures.ts`. When a new feature matches the default, ship it
WITHOUT asking the owner (note "§61 default: no exception"); only escalate when the feature's nature
suggests it might BE an exception (e.g. an admin-only surface that doesn't fit "operator running a
business"). Asking a tier question the default already answers is the §61 miss (Cowork miss #12).

**Owner-locked exception cells — cross-check any change against them:**
- `customer_portal_invite` = Solo + Sub-account + Enterprise only (Agency + Super Admin excluded).
- `growth` + `studio` = Solo + Sub-account + Super Admin only (Agency EXCLUDED entirely — no resell;
  Enterprise inherits it via the hybrid Solo-union).
- `subaccount_management` = Agency + Enterprise; `fleet_console` = God only.
- **`skills` (Skills Wave, owner-ruled 2026-08-11)** follows the DEFAULT → God YES · Solo YES · Sub-account
  YES · Agency RESELL (skill-library resell via Marketplace) · Enterprise YES + RESELL. **Not** an exception.

If you have NOT named the target tier(s) and confirmed per-tier belonging, you are already in
violation — stop and check this matrix. Log the decision/correction to the master doc §4/§10 and
`docs/brain/` in the SAME PR (§0/§BRAIN).

**Anchoring case (task #99, 2026-08-10):** the tenant Systems Check tile was gated inside the
non-empty branch of `PracticeOverview.tsx`'s `{emptyBook ? … : …}`, so every fresh solo/sub-account
(0 clients) rendered only the "blank canvas" and never saw the setup check; the agency's own default
landing (`/agency` → `AgencyBoard`) carried no tile at all. Not a tier-classification bug — an
**availability-by-accident**. Fix: render it ABOVE the empty/non-empty split on `PracticeOverview`
(solo + sub-account) AND add it to `AgencyBoard` (agency), matching the operator tile on
`OperatorCommandCenter` (God) → uniform across God · agency · solo · sub-account.

## Purpose

Every callable seam in the platform is reached by callers wearing one of **six identity
tiers**. A change that is "correct" for a standalone tenant can silently break, over-expose,
or under-serve a client, a sub-account, or an anonymous visitor — because each tier resolves
its `tenant_id`, carries its auth token, sits under RLS, and is granted RPC scope by a
*different* code path. This doc enumerates all six against the **live prod resolver bodies**
(ref `xygzykjyynhzqytbqnzu`, read via `pg_get_functiondef`, 2026-08-02) so no tier is ever
assumed instead of grounded.

The six tiers are **canonical and closed** — extended only by an explicit owner ruling. No
build invents a seventh tier or collapses two.

## The canonical six

| # | Tier | One-line identity |
|---|---|---|
| 1 | **God / Super Admin** | Platform operator (us). Owns and sees everything; no single home tenant. |
| 2 | **Agency** | Parent tenant that owns sub-accounts. Scoped to its own book **plus** its children. |
| 3 | **Standalone Tenant** | Coach/consultant/agency-of-one with no agency parent. Own book only. |
| 4 | **Sub-account** | Child tenant under an Agency. Own book only; isolated from the parent aggregate. |
| 5 | **Client** | End-consumer under a Tenant. Their own portal only. |
| 6 | **Anonymous** | Unauthenticated public. Public surfaces only; no `auth.uid()`. |

**Live population (grounded 2026-08-02):** `SELECT account_type, count(*), count(parent_tenant_id)
FROM tenants GROUP BY account_type` returns **1 agency** (0 with a parent) and **7 standalone**
(4 of which carry a `parent_tenant_id`). So today: 1 Agency, 3 true Standalone Tenants
(standalone + no parent), and 4 Sub-accounts (standalone + parent set). Sub-account is a
**relationship** (`parent_tenant_id IS NOT NULL`), not a distinct `account_type` value — a
grounding fact that trips anyone who assumes an `account_type = 'sub_account'` exists. It does
not.

## The resolver substrate (read from live bodies)

Every tier's four columns below trace back to these SECURITY DEFINER resolvers. Quoting the
real resolution order matters because the two tenant resolvers **disagree**, and that
disagreement is itself a tier hazard.

### `is_platform_owner()` / `is_platform_owner(uuid)` — the God gate
Both are thin delegates:
```
is_platform_owner()        → SELECT public.is_super_admin()
is_platform_owner(_user_id) → SELECT public.is_super_admin(_user_id)
```
and `is_super_admin()` is:
```
SELECT EXISTS (SELECT 1 FROM public.user_roles
               WHERE user_id = auth.uid() AND role = 'super_admin'::public.app_role)
```
**God is identified by a row in `user_roles` with `role = 'super_admin'` — not a flag on
`tenants`, not `owner_user_id`, not `features`.** A broader sibling, `is_platform_admin()`,
matches `role IN ('platform_admin','super_admin')`; it is the gate that appears inside
`current_user_tenant_id()` (see below), so a `platform_admin` who is not a full `super_admin`
still gets the operator escape hatch there.

### `current_user_tenant_id()` — the primary tenant resolver (Tiers 2/3/4)
```
SELECT COALESCE(
  (SELECT p.active_tenant_id FROM profiles p
     WHERE p.user_id = auth.uid() AND p.active_tenant_id IS NOT NULL
       AND ( EXISTS (SELECT 1 FROM tenant_members m
                       WHERE m.user_id = auth.uid() AND m.tenant_id = p.active_tenant_id
                         AND m.status = 'active')
             OR agency_can_manage_child(p.active_tenant_id, auth.uid())
             OR agency_team_role(p.active_tenant_id, auth.uid()) IS NOT NULL
             OR is_platform_admin(auth.uid()) )),
  (SELECT tenant_id FROM tenant_members
     WHERE user_id = auth.uid() AND status = 'active'
     ORDER BY joined_at ASC LIMIT 1)
);
```
Real resolution order:
1. **`profiles.active_tenant_id`** (keyed on `profiles.user_id = auth.uid()`) — but only if
   the caller is *entitled* to that active tenant by one of four guards: active membership,
   `agency_can_manage_child`, non-null `agency_team_role`, or `is_platform_admin`. This guard
   is what lets an **Agency** user (Tier 2) or a **God** user (Tier 1) legitimately set their
   active tenant to a child/any tenant and have it resolve.
2. **Fallback:** first active `tenant_members` row **`ORDER BY joined_at ASC LIMIT 1`**. This
   fallback **is deterministic on `joined_at`** (ties/NULL `joined_at` aside). Do **not**
   describe this fallback as an unordered `LIMIT 1` — it is ordered. (The unordered hazard
   lives in the *other* resolver; see #589 below.)

### `get_paige_persona_context()` — the Client-first resolver (Tier 5)
```
_tid := (SELECT c.tenant_id FROM clients c
           WHERE c.linked_user_id = auth.uid()
           ORDER BY c.created_at ASC LIMIT 1);
IF _tid IS NULL THEN _tid := (SELECT p.active_tenant_id FROM profiles p WHERE p.id = auth.uid()); END IF;
IF _tid IS NULL THEN _tid := (SELECT m.tenant_id FROM tenant_members m WHERE m.user_id = auth.uid() LIMIT 1); END IF;
IF _tid IS NULL THEN _tid := (SELECT t.id FROM tenants t WHERE t.owner_user_id = auth.uid() LIMIT 1); END IF;
```
Real resolution order: **`clients.linked_user_id` → `profiles.active_tenant_id` →
`tenant_members` → `tenants.owner_user_id`**, then it returns the tenant row with
`funding_enabled` (computed from `features`) and `brand` (via `resolve_tenant_brand`, which
walks `parent_tenant_id` up to depth 10 so a sub-account inherits an agency's brand).

**Two honest hazards in this body — both worth a ledger entry:**
- **`profiles.id = auth.uid()` (not `profiles.user_id`).** The persona resolver keys the
  profile branch on `profiles.id`, while `current_user_tenant_id()` keys on
  `profiles.user_id`. These are **distinct columns** (both `uuid`, both live). For any user
  whose `profiles.id` ≠ `auth.uid()`, the persona resolver's profile branch silently misses
  and falls through. Flag on any change that touches profile→tenant resolution.
- **Steps 3 and 4 are unordered `LIMIT 1`** (no `ORDER BY`). For a user in **multiple**
  tenants who is neither a client nor has an `active_tenant_id`, the resolved tenant is
  **nondeterministic** — this is the ambiguity logged as **#589**. It bites multi-membership
  users; single-membership users resolve deterministically by accident.

### `is_tenant_member(uuid)` / `is_tenant_admin(uuid)` / `is_tenant_admin_as(uuid,uuid)`
```
is_tenant_member(_tenant)   → EXISTS tenant_members WHERE tenant_id=_tenant AND user_id=auth.uid() AND status='active'
is_tenant_admin(_tenant)    → EXISTS tenant_members WHERE tenant_id=_tenant AND user_id=auth.uid() AND status='active' AND role IN ('owner','admin')
is_tenant_admin_as(_actor,_tenant) → same as is_tenant_admin but for an explicit _actor (no auth.uid())
```
These are the per-tenant membership/role gates RLS policies compose. `_as` variants take an
explicit actor so a service-role or delegated call can assert membership on behalf of a named
user rather than `auth.uid()`.

### `agency_can_manage_child(uuid[,uuid])` / `agency_team_role(uuid,uuid)` — the Agency reach
`agency_can_manage_child(_child,_actor)` is true when the child's parent is
`account_type IN ('agency','enterprise')` **and** the actor is either the parent's `owner` via
`tenant_members`, or an `agency_team_members` row with `agency_role IN
('agency_owner','agency_admin','agency_manager')`, or an `agency_specialist` whose
`scoped_subaccounts` array contains the child. `agency_team_role(_agency,_actor)` returns
`'agency_owner'` for the parent owner else the `agency_team_members.agency_role`. **Note:**
`'enterprise'` is an honored `account_type` in these bodies even though **no `enterprise` rows
exist live today** — the code is ahead of the data.

---

## Per-tier matrix

Each tier states its **(a) tenant_id resolution path**, **(b) auth-token flow**, **(c) RLS
posture**, and **(d) permitted-RPC scoping**, each grounded in a named resolver above.

### Tier 1 — God / Super Admin
- **(a) tenant_id resolution.** No home tenant. `current_user_tenant_id()` still returns a
  value *if* they set `profiles.active_tenant_id` — the guard's `OR is_platform_admin(auth.uid())`
  branch lets a platform admin's active tenant be **any** tenant and resolve. This is the
  operator "act-as" seam: God impersonates a tenant by setting active tenant, and every
  tenant-scoped resolver then treats them as that tenant.
- **(b) auth-token flow.** Standard Supabase JWT (`auth.uid()` present). Elevation is **not**
  in the token — it is the `user_roles.role = 'super_admin'` row read by `is_super_admin()`.
  Service-role callers (Paige's headless operator agent) bypass RLS entirely and must self-scope.
- **(c) RLS posture.** Policies that call `is_platform_owner()` / `is_platform_admin()` grant
  read/write across **all** tenants. Everything else is reachable via the act-as active tenant.
  Broadest posture on the platform; the §17 governance laws (immutable audit, two-key on
  destructive ops, never-silent break-glass) bind here, not RLS.
- **(d) permitted-RPC scoping.** All operator RPCs (fleet, provisioning, platform billing,
  default registries) plus, via act-as, any tenant RPC. A God-tier producer in a §37 inventory
  must be listed even when "it's just us" — the operator path is the most powerful caller.

### Tier 2 — Agency
- **(a) tenant_id resolution.** `current_user_tenant_id()` primary branch: their
  `profiles.active_tenant_id`, entitled via `agency_can_manage_child(active, uid)` **or**
  `agency_team_role(active, uid) IS NOT NULL`. This lets an agency user's active tenant be
  **their own** agency tenant *or* any **child** they manage, and it resolves. Fallback is
  their agency membership row (`ORDER BY joined_at ASC`).
- **(b) auth-token flow.** Standard JWT. Agency reach is not in the token — it is the
  `agency_team_members` / parent-owner `tenant_members` rows read by the two agency helpers.
- **(c) RLS posture.** Scoped to **own book + owned sub-accounts**. Policies that compose
  `agency_can_manage_child` expose child-tenant rows to the agency; policies that only check
  `is_tenant_member(child)` do **not** (an agency owner is not automatically a `tenant_members`
  row of the child). Cross-check *which* helper a policy uses before assuming agency reach.
- **(d) permitted-RPC scoping.** Own-tenant RPCs plus child-scoped RPCs gated by the agency
  helpers. An `agency_specialist` is further narrowed to `scoped_subaccounts` — a real
  sub-tier of Agency reach the inventory must not flatten.

### Tier 3 — Standalone Tenant
- **(a) tenant_id resolution.** `current_user_tenant_id()`: `profiles.active_tenant_id`
  entitled by **active `tenant_members`** membership; else the `ORDER BY joined_at ASC LIMIT 1`
  fallback. `parent_tenant_id IS NULL` and no agency relationship — the plain-vanilla path.
- **(b) auth-token flow.** Standard JWT; `auth.uid()` maps to a `tenant_members` row of their
  own tenant.
- **(c) RLS posture.** Own book only. `is_tenant_member(own)` true; `is_tenant_admin(own)` true
  for owner/admin. No child reach, no parent. This is the reference posture most policies are
  written against — which is exactly why the other five tiers must be checked *separately*.
- **(d) permitted-RPC scoping.** All tenant-scoped RPCs for their own `tenant_id`; no operator
  RPCs; no cross-tenant reach.

### Tier 4 — Sub-account
- **(a) tenant_id resolution.** Resolves like a Standalone Tenant for the sub-account's **own**
  members: `current_user_tenant_id()` → their `active_tenant_id`/membership on the child. The
  child is identified by `parent_tenant_id IS NOT NULL` (live: `account_type = 'standalone'`
  with a parent). Its **own** members do not gain the parent's reach.
- **(b) auth-token flow.** Standard JWT of a member of the child tenant. Brand/persona inherit
  upward via `resolve_tenant_brand`'s recursive parent walk, but **authority does not** —
  inheritance is one-directional (brand down, not permissions up).
- **(c) RLS posture.** **Own book only, isolated from the parent aggregate.** The critical
  invariant: a sub-account's own users must never see sibling sub-accounts or the agency
  roll-up. Conversely the agency *does* reach in (Tier 2). Any change touching child data must
  be checked from **both** directions — sub-account-in (must stay isolated) and agency-down
  (must still reach). This is the tier most often missed because it shares `account_type` with
  Tier 3.
- **(d) permitted-RPC scoping.** Own-`tenant_id` RPCs only. Aggregate/roll-up RPCs must
  exclude the sub-account's own users and include the managing agency's — a two-sided check.

### Tier 5 — Client
- **(a) tenant_id resolution.** **Not** `current_user_tenant_id()` — a pure client has no
  `tenant_members` row and (usually) no entitled `active_tenant_id`, so that resolver returns
  **NULL** for them. Clients resolve through **`get_paige_persona_context()`**, whose first
  branch is `clients.linked_user_id = auth.uid() → clients.tenant_id` (earliest by
  `created_at`). Their portal scope is the tenant that owns their `clients` row.
- **(b) auth-token flow.** Standard JWT; `auth.uid()` maps to `clients.linked_user_id`, not to
  a membership row. A client surface that calls `current_user_tenant_id()` instead of the
  persona resolver will get NULL and mis-scope — a common tier bug.
- **(c) RLS posture.** **Own portal only.** Policies gate client-owned rows on the
  `clients`/`linked_user_id` join, never on `is_tenant_member`. A client is not a tenant member
  and must never pass a membership gate.
- **(d) permitted-RPC scoping.** Client-portal RPCs only (their own intake, their own
  documents, their own conversation). No tenant-admin RPCs, no cross-client reach within the
  same tenant.

### Tier 6 — Anonymous
- **(a) tenant_id resolution.** None. `auth.uid()` is NULL, so **every** resolver above returns
  NULL/false. There is no tenant to resolve.
- **(b) auth-token flow.** No JWT (or the anon key only). Reaches only what the `anon` role is
  granted.
- **(c) RLS posture.** Only rows exposed by an explicit `anon`/`public` policy, or data behind
  a SECURITY DEFINER RPC that deliberately serves the public (a public landing config, a public
  form-submit endpoint). Everything gated on a resolver is closed.
- **(d) permitted-RPC scoping.** Public RPCs only — and each such RPC is a §37 producer of the
  **Anonymous** tier that must be inventoried, because "public" is the easiest place to leak
  tenant data. An anonymous producer is never "N/A by default"; it is audited like any other.

---

## Surface ledger — what actually SHIPPED, per tier (§66)

**Bound by `CLAUDE.md` §66:** every merge that changes what shipped, what's gated, or which tiers see
a surface updates this table **in the same commit as the code**. A row records what is **LIVE**, never
what a commit intends to deliver — ticking a box because the slice "is going to" get there is the same
class of lie as a fabricated metric (§13).

Legend: **✓** live · **—** not built · **N/A** tier not opened yet · **403** denied at the route gate.

### The operator console — `/operator/{slot}/{view}`, six slots × thirty-three views

**§66 debt, paid LATE — recorded rather than backfilled quietly.** PR #571 (`24482d15`, *Operator
console: six-slot shell + every shipped feature surfaced in it*) retired the five-sub-tab Fleet
Console addresses this ledger described and replaced them with the six-slot IA. §66 binds that
update to **PR #571's own commit**; it did not happen there, and this entry lands after the fact.
The drift is the point of §66's anchoring value, so it is written down: between `24482d15` and this
commit, this ledger named five addresses that no longer resolved. The five detailed sections below
are the SAME evidence, re-addressed — nothing recorded there is discarded (§58).

**The IA is thirty-three views, not the pack's thirty-two.** `operatorIA.ts`'s own module docblock
(L2) still reads "six slots, thirty-two views" while `OPERATOR_VIEW_COUNT` (L107) derives **33** —
32 from the pack plus Settings → Numbers, added by owner ruling 2026-08-23 (`operatorIA.ts:89–98`)
and asserted as a ruled addition in `operatorIA.test.ts:81–82`. The count is right; the prose above
it is stale.

**The gate, stated once — it is identical for all thirty-three addresses.** `App.tsx:231` mounts
`/operator/*` → `OperatorEntry`, which puts **one** `RequireOperator` above `:section/*`
(`OperatorEntry.tsx:42–49`). That guard asks the server for `is_platform_admin()`
(`RequireOperator.tsx:125`) — `super_admin OR platform_admin`, i.e. §53's `is_platform_operator()`
set. A signed-out caller is sent to `/operator/login?next=` (`RequireOperator.tsx:199–202`); a
signed-in non-operator is sent to `/admin` (`RequireOperator.tsx:236`). No per-view gate exists, so
no view can differ. Because that is uniform, the tier grid is stated once here rather than repeated
thirty-three times — the information is the same, the wall is not:

| Any `/operator/{slot}/{view}` address | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Reaches the console at all | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |

Agency / Enterprise / Solo / Sub-account read **N/A** for the same reason as the sections below:
the owner sequenced the operator tier to completion before any other shell opens, so they are not
denied a capability that exists for them — the console is not their surface. Client and Anonymous
are **403** at `RequireOperator`. A UI guard is not the boundary; RLS and the
`is_platform_operator()`-gated RPCs are (`RequireOperator.tsx:35–37`).

**Four states, and only one of them means "working".** This vocabulary is defined here and used in
the State column below. `ported` was added on 2026-08-24 when BUILD-ORDER Layer 3 began producing
surfaces that are neither a generic spec panel nor reading anything — three states could not say
what those are, and forcing them into `structure-only` would have understated real, behaving code
while forcing them into `wired` would have claimed a read that does not exist.

- **wired** — a bespoke component that reads live data. The only state that means the surface does
  its job.
- **structure-only** — Claude Design's ported panel structure renders (eyebrow, title, KPI ladder,
  block cards, anchors, chips), and **no value behind it is read**. KPIs are `null` → `—`, row sets
  are `[]` → the block's own empty line, some blocks carry CD's authored label rows. **Proven, not
  assumed:** neither `panelSpecs.ts`, any file under `surfaces/specs/`, nor `OperatorPanel.tsx`
  imports `supabase` or performs a fetch (grep returns nothing).
- **ported** — a BESPOKE v3 surface renders its own geometry and interaction (filters, folds,
  tabs, selection, composer), takes its rows as a prop, and ships with none. This is BUILD-ORDER's
  **structure before data** state and it is the finished Layer 3 result, not a half-measure: the
  shape is CD's, every figure with no read behind it is an em-dash or an honest count, and the
  slot's authored absence says what is missing. It differs from **structure-only** in that the
  surface is real code with real behaviour rather than a generic panel driven by a spec, and from
  **wired** in that no hook reads yet. Layer 6 turns `ported` into `wired` by handing each one its
  rows; nothing about the render changes.
- **absence** — the pack's designed absence treatment (`SlotSurfaceBody.tsx:96–107`), which names
  what is missing. A deliberate state, neither shipped nor a gap.

**Per-state counts are deliberately not written here.** They were, and they went stale the first
time a slice moved a row without re-tallying — a number in prose that nothing recomputes is the
same class of claim §66 exists to stop. Count the State column.

**An address that resolves is not a shipped surface.** `src/operator/CLAUDE.md` records the failure
this rule comes from: 78 tabs each resolved a spec, everything typechecked, and every screen was
blank. No row below is ticked for addressability.

| Address | What renders | State | Evidence (file:line) |
|---|---|---|---|
| `/operator/fleet/systems-check` | `SystemsCheckSurface` | **wired** | `viewSources.ts:38` · `SlotSurfaceBody.tsx:58` · `SystemsCheckSurface.tsx:143` → `useSystemsCheck.ts:116` (`systems_check_snapshot`) |
| `/operator/fleet/directory` | `FleetConsole` | **wired** | `viewSources.ts:39` · `SlotSurfaceBody.tsx:57` · `FleetConsole.tsx:106` → `useFleet.ts:113–123` (`tenants`, `tenant_members`, `clients`, `tenant_revenue_classification`) |
| `/operator/fleet/history` | `FleetHistorySurface` | **wired** | `viewSources.ts:40–43` · `SlotSurfaceBody.tsx:59` · `FleetHistorySurface.tsx:49` → `useSystemsCheckHistory.ts:47` (`paige_systems_check_run`) |
| `/operator/relationships/people` | `PeopleSurface` — the book: chip row, list/record fold, ten faces, field rows with source · mask · proposal | **ported** | `viewSources.ts` (`bespoke: "PeopleSurface"`) · `SlotSurfaceBody.tsx` · `PeopleSurface.tsx` ← v3 `peopleVals` L4854 |
| `/operator/relationships/conversations` | `ConversationsSurface` — the three-pane console (threads · thread · person) with `ComposeOutbound` at its foot | **ported** | `viewSources.ts` (`bespoke: "ConversationsSurface"`) · `SlotSurfaceBody.tsx` · `ConversationsSurface.tsx` ← v3 `convoVals` L5300. Replaces 5 panels ported off the RETIRED pack, which read nothing (§58: specs, not capabilities) |
| `/operator/relationships/calendar` | 4 ported panels: `calendar/month`, `booking-links`, `settings`, `tasks` | **structure-only** | `viewSources.ts:53–56` · `opsSpecs.ts:709, 748, 770, 881` |
| `/operator/relationships/segments` | `SegmentsSurface` — the rule said back as words, who it admits, where it is used | **ported** | `viewSources.ts` (`bespoke: "SegmentsSurface"`) · `SlotSurfaceBody.tsx` · `SegmentsSurface.tsx` ← v3 `segVals` L6393 |
| `/operator/campaigns/active` | `CampaignsActive` — state filters, one card per campaign, the step rail | **ported** | `viewSources.ts` (`bespoke: "CampaignsActive"`) · `SlotSurfaceBody.tsx` · `CampaignsActive.tsx` ← v3 `campVals` L5159 |
| `/operator/campaigns/catalog` | `CatalogSurface` — the offerings, their derived state, and what sells them | **ported** | `viewSources.ts` (`bespoke: "CatalogSurface"`) · `SlotSurfaceBody.tsx` · `CatalogSurface.tsx` ← v3 `catVals` |
| `/operator/campaigns/sales` | `SalesSurface` — every figure a sum over the lines, nothing stored | **ported** | `viewSources.ts` (`bespoke: "SalesSurface"`) · `SlotSurfaceBody.tsx` · `SalesSurface.tsx` ← v3 `salesVals` |
| `/operator/campaigns/pipeline` | 1 ported panel: `fleet/prospects` | **structure-only** | `viewSources.ts:72` · `fleetSpecs.ts:283` |
| `/operator/campaigns/social` | 3 ported panels: `growth/social`, `growth/brand-kit`, `growth/assets` | **structure-only** | `viewSources.ts:73–76` · `opsSpecs.ts:408, 362, 521` |
| `/operator/campaigns/performance` | 2 ported panels: `analytics/performance`, `analytics/marketing` | **structure-only** | `viewSources.ts:77–80` · `moneySpecs.ts:876, 748` |
| `/operator/marketplace/storefront` | `StorefrontSurface` — rotating hero, search · kind chips · runnable-here-only, curated shelves | **ported** | `viewSources.ts` (`bespoke: "StorefrontSurface"`) · `SlotSurfaceBody.tsx` · `StorefrontSurface.tsx` ← v3 `storeVals` L10054 |
| `/operator/marketplace/catalog` | `MarketCatalogSurface` — four decisions over five kind shelves; a filter dims rather than removes | **ported** | `viewSources.ts` (`bespoke: "MarketCatalogSurface"`) · `SlotSurfaceBody.tsx` · `MarketCatalogSurface.tsx` ← v3 `catalogVals` L9434 |
| `/operator/marketplace/submissions` | `SubmissionsQueue` — the review queue and its slide-over | **ported** | `viewSources.ts` (`bespoke: "SubmissionsQueue"`) · `SlotSurfaceBody.tsx` · `MarketplaceSubmissionsSurface.tsx` ← v3 `subsVals` L9608. **Row was stale**: it shipped bespoke and the ledger still named its retired panel |
| `/operator/marketplace/publishers` | `PublishersSurface` — four classes, their reach, their split, and which kinds each may ship | **ported** | `viewSources.ts` (`bespoke: "PublishersSurface"`) · `SlotSurfaceBody.tsx` · `PublishersSurface.tsx` ← v3 `pubsVals` L9540 |
| `/operator/analytics/fleet` | 3 ported panels: `analytics/brief`, `analytics/revenue`, `analytics/forecast` | **structure-only** | `viewSources.ts:89–92` · `moneySpecs.ts:355, 414, 832` |
| `/operator/analytics/relationships` | 3 ported panels: `analytics/comms`, `analytics/support`, `analytics/retention` | **structure-only** | `viewSources.ts:93–96` · `moneySpecs.ts:802, 522, 586` |
| `/operator/analytics/campaigns` | 1 ported panel: `analytics/product` | **structure-only** | `viewSources.ts:97` · `moneySpecs.ts:625` |
| `/operator/analytics/autonomy` | `TrustCompass` (READ-ONLY — no `onCommit`) | **wired** | `viewSources.ts:98–101` · `SlotSurfaceBody.tsx:62–66` · `useCompass.ts:44–50` (`paige_departments`, `paige_action_kinds`) |
| `/operator/analytics/platform-health` | `FleetTeamPulseSurface` | **wired** | `viewSources.ts:102` · `SlotSurfaceBody.tsx:61` · `FleetTeamPulseSurface.tsx:27` → `useTeamPulse.ts:39` (`list_platform_staff()`) |
| `/operator/settings/setup` | **`SetupVals` ported whole (Layer 3d)** — 29-step catalogue in 7 groups, the current step with its fields/picks/drop, the ceiling-aware act row, `Lands in …` destinations, and the grouped rail. The §38 money boundary is carried verbatim in CD's own words. | **`ported`** | `viewSources.ts` · `surfaces/settings/setupContract.ts` · `SetupSurface.tsx` · driven: `ported-surfaces-drive.mjs` |
| `/operator/settings/platform` | 2 ported panels: `settings/setup/feature-flags`, `api-mcp` | **structure-only** | `viewSources.ts:109–112` · `platformSpecs.ts:751, 769` |
| `/operator/settings/integrations` | 3 ported panels: `connected`, `health`, `available` | **structure-only** | `viewSources.ts:113–116` · `platformSpecs.ts:793, 839, 863` |
| `/operator/settings/numbers` | absence — the **generic** fallback copy | **absence** | `viewSources.ts:123` · `SlotSurfaceBody.tsx:98–101` (Settings declares no slot `absence`, `operatorIA.ts:87–103`) |
| `/operator/settings/mind` | `KnowledgeSurface` | **wired** | `viewSources.ts:124–127` · `SlotSurfaceBody.tsx:67–69` · `useKnowledge.ts:85–90` (`knowledge_base`) |
| `/operator/settings/automations` | 3 ported panels: `automations/library`, `runs`, `build` | **structure-only** | `viewSources.ts:128–131` · `opsSpecs.ts:586, 618, 657` |
| `/operator/settings/alerts` | `FleetAlertRulesSurface` | **wired** | `viewSources.ts:132` · `SlotSurfaceBody.tsx:60` · `FleetAlertRulesSurface.tsx:51` → `useAlerting.ts:109–131` |
| `/operator/settings/capabilities` | 1 ported panel: `settings/setup/capabilities` | **structure-only** | `viewSources.ts:133–136` · `platformSpecs.ts:691` |
| `/operator/settings/vault` | 3 ported panels: `obligations`, `vendors`, `documents` | **structure-only** | `viewSources.ts:137–140` · `platformSpecs.ts:975, 995, 1017` |
| `/operator/settings/governance` | 3 ported panels: `approvals`, `audit-log`, `security` | **structure-only** | `viewSources.ts:141–144` · `platformSpecs.ts:1036, 1052, 1072` |
| `/operator/settings/team` | 2 ported panels: `settings/team/seats`, `roles` | **structure-only** | `viewSources.ts:145–148` · `platformSpecs.ts:907, 925` |

**Seven wired · twenty-three structure-only · three absence.** The seven wired views are the five
Fleet Console surfaces this ledger already documented (re-addressed below) plus Trust Compass and
Knowledge — i.e. **PR #571 moved and re-housed the shipped work; it did not wire a new read.** No
row above should be read as new capability.

#### Findings from this survey — the code contradicting itself (§13, reported not smoothed over)

These are recorded here because a ledger that only tallies states hides them. Each is read from
source in this commit; none is fixed here (this PR touches only this file).

1. **Six purpose-built surfaces are unreachable in the new shell.** `bespokeSlots()`
   (`bespokeSlots.tsx:30`) hands a real body to six panels — `CalendarMonth` (calendar/month),
   `CalendarWeek` (calendar/settings), `MarketplaceReview` (marketplace/submissions),
   `SupportThread` (support/inbox), `ComposeSurface` (comms/outbound), `IntegrationsGrid`
   (settings/integrations/connected). Its **only caller** is the retired console
   (`legacy/OperatorLegacyApp.tsx:919`, `slots={bespokeSlots(...)}`); `SlotSurfaceBody.tsx:86`
   renders `<OperatorPanel spec={spec} />` with **no `slots` prop**. Those six panel specs each
   carry a `notWired` block precisely because the real body was slotted over it
   (`opsSpecs.ts:736, 789, 809, 314` · `platformSpecs.ts:314, 447, 826`), so in the six-slot shell
   the operator now sees a "not connected" plate where the legacy console rendered the built
   surface. This is failure mode 2 in `src/operator/CLAUDE.md` — "components were imported and never
   rendered" — recurring in the replacement shell, and a §58 regression against the legacy console.
2. ~~**The console has no Paige.**~~ **CLOSED 2026-08-24 — the spine draws all five faces.**
   `RETIRED_ADDRESSES` retires `paige/chat` on the ground that "the spine is Paige's home in this
   shell" (`viewSources.ts`), and that justification is now true at runtime. It was recorded here
   when the spine rendered two empty scroll regions; Chat landed as `SpineConversation`, and
   BUILD-ORDER Layer 5 gave the other four bodies (`spine/faces/SpineFaces.tsx` ← v3 `mindVals`
   L10427), so the strip draws **Chat · Memory · Team · Skills · Code**.
   **State: `ported`** — each renders CD's structure and its own stated absence; none reads yet.
   Driven in Chromium, both themes, every face clicked: `ported-surfaces-drive.mjs`.
   **The Code face's remainder CLOSED the same day (Layer 5b).** It was recorded here as
   materially thinner than CD's frame — and `codeVals` (L10256–L10424) is now ported whole: the
   tab strip with dirty marks and close controls, the meta line, the repo strip with its ceiling
   pill and protected mark, the review block and its merge note, the tokenized line-numbered
   editor and its plain edit buffer, the output block with its run log, the ceiling-derived act
   row and the limits drawer.
   **State: `ported`, with one part genuinely `wired`** — the scratch buffer is real session
   state (create · edit · dirty mark · save · revert · close), and the Trust Compass rung it
   answers to is the live `usePlatformTrust` read, so `held`, the review act and the foot's grant
   are decided by the platform's actual autonomy record. Driven in Chromium end to end:
   `ported-surfaces-drive.mjs`, "Code face · scratch buffer round trip".
   **Setup (Layer 3d, 2026-08-24) is `ported` on the same terms.** The catalogue, the per-step
   forms and the geometry are CD's, verbatim. What does NOT come over is every step's `state` —
   `P.SETUP` marks twelve of them `done`, which is an assertion about what THIS operator has
   finished — so the bar sits at zero, `—% set up` and `— done · — left · —  waiting` render in
   CD's own sentences, and no step shows a green tick it cannot prove. Three `why` lines that
   quote a live figure (the current rung, eight running automations, four alerts needing you) are
   dropped for the same reason and named in the contract. Every write is `disabled` until a seam
   exists, because `setupVals`'s acts claim persistence ("saved", "It lands in the Vault") and a
   control that says that over local state is the §36 defect. Layer 6 turns all of it on.

   **What is still absent, and honestly so:** no repository binding exists — the GitHub provider
   is `planned` (`paige-writes-code.md` §5) — so the repo strip renders its unbound arm and the
   review block does not render at all, which is the pack's OWN `onRepo` conditional rather than a
   stand-in. No runtime is provisioned at any tier, so `Run` requests one, is refused, and the
   refusal lands on the record. Merge is absent at every rung by design, not gated.
3. **Three live dead links out of `FleetConsole`.** `FleetConsole.tsx:277` and `:573` navigate to
   `/operator/provisioning`; `:574` navigates to `/operator/paige`. Neither is a slot, so
   `resolveOperatorAddress` returns `{kind:"unknown"}` (`operatorAddress.ts:55`) and the operator
   lands on the 404 (`OperatorShell.tsx:195, 268`, `UnknownSection`). "Provision a tenant" is a primary
   act on a **wired** surface and it goes nowhere.
4. **No command palette exists in this shell.** `operatorIA.ts:30–33` states that everything without
   a slot "is reached through the command palette", and `OperatorShell.tsx:80–82` declines ⌘K
   because "the command palette has exactly one owner platform-wide (`AgentPresenceContext`)". That
   owner is mounted inside `AdminLayout.tsx:435` only; `/operator/*` mounts `OperatorEntry` directly
   from `App.tsx:231` and never enters `AdminLayout`. So the escape hatch the IA relies on to justify
   six slots is not reachable from the six-slot console.
5. **`settings/numbers` renders the generic absence, not one naming the capability.**
   `viewSources.ts:117–123` says it "renders the absence that NAMES the capability rather than a
   plausible-looking empty inventory" — but absence copy is a **slot** property and Settings declares
   none (`operatorIA.ts:87–103`), so `SlotSurfaceBody.tsx:98–101` prints the generic
   "Not wired yet / This view is specified and has a place in the console…". Twilio number inventory
   is never named on screen.
6. **The Campaigns slot's absence copy can never render.** `operatorIA.ts:71–74` carries a carefully
   written absence ("Substrate exists · one seam missing", naming the `utm_campaign` join gap), but
   all six Campaigns views resolve ported panels, so `SlotSurfaceBody` returns before `Absence` in
   every case (`SlotSurfaceBody.tsx:81–93`). It is dead at runtime.
7. **Nine ported CD panels are carried by a view and composed into none of it.** `carries[]` records
   the capability a view absorbed; for a **bespoke** view that is fine (the component replaces the
   panel). For these there is neither: `growth/builders` (carried by campaigns/active),
   `support/response-policy` (relationships/conversations), `paige/team` (settings/team),
   `paige/skills` · `paige/sub-agents` · `paige/actions` (settings/capabilities),
   `provisioning/pipeline` (fleet/directory), `provisioning/history` and
   `settings/governance/act-as-history` (fleet/history). The last three are partly answered by the
   bespoke surface, but the act-as history rendered by the legacy panel is not on the new History
   surface (`FleetHistorySurface.tsx` reads `paige_systems_check_run` only) — so the §58 audit trail
   `viewSources.test.ts` is meant to protect has a hole it does not catch, because coverage is
   asserted against `carries[]`, not against what renders.

**Verification honesty (§13/§32.c).** Every state and every finding above is read from source in
this repo; **no render was driven and no screenshot was taken** — this session has no browser. So
this ledger records what the code resolves to, which is exactly the class of claim that "the address
resolves" cannot back. A §32.c live-drive of the deployed console by a capable session (Cowork /
Chrome MCP) is **owed** for all thirty-three addresses, and the seven **wired** rows are the ones
worth driving first.

---

**The five sections that follow are the SAME Fleet Console evidence, re-addressed.** Their tables and
notes are unchanged; only the heading each sits under has moved, because PR #571 moved the surface.


### `/operator/fleet/systems-check` — Fleet · Systems check

*Address unchanged by PR #571; it was Fleet Console sub-tab 1.*

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Systems Check tab (pack-faithful, above the fold) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Category drill-in drawer with per-check evidence | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| "Run full sweep" (operator + fleet halves) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Skips reported as their own axis (never folded into pass) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Fed into Paige's briefing (`owner-context.ts`) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| `get_systems_check_status` MCP tool (god-locked) | ✓ | — | — | — | — | — | — |

Shipped 2026-08-19 (PR #554). Owner live-drive passed on all four checks.

### `/operator/fleet/directory` — Fleet · Directory

*Re-addressed by PR #571 (`24482d15`): was `/operator/fleet/tenants`, Fleet Console sub-tab 2. Same `FleetConsole` component, same reads (`viewSources.ts:39`).*

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Orbital field rendered in **React Three Fiber** | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Renders every CUSTOMER tenant on the default All filter | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Hash-seeded **stable** node placement (no reshuffle on filter) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Weight-encoded gravity (heavier tenants orbit closer) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Node sizing in px, and the field fits the box in both axes | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Motion toggle + OS reduced-motion honoured | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Loud, visible failure on WebGL absence/throw | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Table view: tier pill, health, `Enter →`, internal chip | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| **`Enter` performs a real, audited act-as** (scope switches; row lands in `paige_audit_log`) | ✓ | N/A | N/A | N/A | N/A | 401 | 401 |
| Act-as grants **no** `tenant_members` membership | ✓ | N/A | N/A | N/A | N/A | 401 | 401 |
| Exit returns the operator to tenant-less (`active_tenant_id = NULL`) | ✓ | N/A | N/A | N/A | N/A | 401 | 401 |
| Fixed sRGB tier palette on the pinned-dark field (§23) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Tenants **directory** (mini-KPIs, row selects, `Enter` acts-as, §53 audit foot) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| "Needs you today": real findings + Paige's interpretation | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| "Needs you today": at-risk tenant doors (kept from the prior rail, §58) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| "Her read" panel (templated over real reads + chat CTA) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Morning brief carries amber + provisioning counts | — | N/A | N/A | N/A | N/A | 403 | 403 |
| Paige at the orbit core (`paige-bot.glb`) | — | N/A | N/A | N/A | N/A | 403 | 403 |

**Status: PARTIAL.** Two rows remain **—**: the morning-brief counts, and Paige at the orbit core
(filed as its own follow-up, since a 6.5MB GLB on the crash-prone `useGLTF` path needs its own smoke
test rather than a quiet fold-in). Everything else is live.

**The three act-as rows landed 2026-08-20 (Slice 2), and the §18 survey behind them changed the
build.** The shipped CD copy — "Entering a tenant puts you in their shell with their data. Every
session is recorded in Governance." — was false on both halves: `Enter` only wrote `?tenant=` into
the URL (a selection inside the console), and nothing was recorded anywhere.

The survey then found something more important than the missing wire: **operator act-as already
shipped**, via the header `TenantSwitcher` in `AdminLayout`, gated `isPlatformStaff`, writing
`profiles.active_tenant_id` directly through `useTenantContext.switchTenant` — **with no audit row**.
So the capability was not missing; the *audit* was. Building a Fleet-only act-as beside it would have
produced two doors into a tenant with only one of them logged — an audit trail that reads as complete
while a quiet route stays open, which is worse than the original gap. `switchTenant` therefore routes
platform staff through the new `operator_enter_tenant` / `operator_exit_tenant` RPCs, so **every**
operator act-as is audited, whichever control drives it (§18 one home).

**Why act-as grants no membership.** The sibling `agency_enter_subaccount` INSERTs a `tenant_members`
row so RLS resolves inside the child — correct for a parent agency, which genuinely holds a seat. For
the operator it would be a §9 defect: they would silently become a member of every tenant they ever
opened, polluting that tenant's roster, inflating seat counts, and corrupting the operator's own fleet
metrics — `fleet.tenants_at_risk` grades partly on zero active seats, so visiting a seatless tenant
would quietly "fix" its risk grade by joining it. `current_user_tenant_id()` already honours
`active_tenant_id` for `is_platform_admin(auth.uid())` with no membership, so pointing it is both
sufficient and cleaner. Proved on prod: `members_before=0 members_after=0 delta=0`.

**Client/Anonymous read 401, not 403, on the act-as rows.** 403 means a tier is denied a capability
that exists for it; these fail earlier, at authentication — the RPCs raise `operator_scope_forbidden`
(SQLSTATE 42501) for any non-operator caller, driven explicitly in the proof rather than inferred
from the gate's text.

**Four rows above are worded narrowly on purpose — the §39 peer-gate caught each of them claiming
more than the code does.** A ledger row that overstates is worse than a missing one, because the next
session reads it as verified fact (§13/§66):

- **"every CUSTOMER tenant"**, not "every tenant". Platform fixtures and test accounts are hidden by
  default (`showInternal` starts false) and revealed by a chip — never dropped (§58). The unqualified
  wording would have told a later session the field is a complete census when it is deliberately not.
- **"in px, and the field fits the box"**, not "pixel-accurate 26–68px". The 26–68px band is the size
  at the FOCAL PLANE. This is a perspective camera, so a node nearer the viewer draws larger and one
  further draws smaller — across the shell the real on-screen spread is roughly 19–89px. Claiming
  exact on-screen pixels was false.
  **A second peer-gate pass then found the fit half of this row was false too, and it is worth
  recording rather than quietly correcting.** The commit that narrowed this row also added a
  `Math.min(viewport.width/size.width, viewport.height/size.height)` and a comment claiming it stopped
  outer tenants clipping on a narrow box. Both were wrong: R3F derives `viewport.width` as
  `height × (size.width/size.height)`, so those two ratios are ALWAYS equal — the min was a no-op to
  within 1e-19 and world-per-pixel cannot carry aspect at all. The scale stayed a constant that
  ignored the box, and the real clipping (vertical, on a short field column) was untouched. The fit is
  now computed from the world EXTENTS (`min(viewport.width, viewport.height)`), and the smoke asserts
  every node lands inside the frame across six canvas shapes — portrait, landscape, square and 4:1
  both ways — so this row is now backed by an executable check rather than by a comment.
- **"fixed sRGB tier palette"**, not "re-resolves on light/dark flip". It no longer does, by decision.
  The field container is pinned dark in BOTH themes, so pulling theme-flipping ink tokens made it
  worse — in light mode `--primary` resolves to a near-black that vanished against the dark ground.
  A constant ground takes a constant palette; §23 governs the surface, and this surface is one theme.
- **one "Her read" panel, not two.** The rail rendered the same panel twice, in a file whose own
  header argues §18 one-home. The duplicate is gone.

**On the "Her read" panel (§13, stated precisely).** It is **templated over real values**,
not LLM-composed — because no operator-scope narrative endpoint exists on the platform (all 248 edge
functions enumerated 2026-08-19; `owner-context.ts` is a system-prompt composer consumed only inside
`paige-ai-chat`'s streaming path, not a callable). That is also exactly what CD does: its own `read`
is `atRisk.length + " tenants are at risk. " + atRisk[0].name + …`, a sentence frame around live
figures. Every number and name in the panel comes from the fleet read; only the frame is authored,
and the gold CTA hands the actual synthesis to Paige in the chat (§20/§21).

**On the attention cards (§51 caveat).** They read REAL operator findings (`tenant_id IS NULL`), and
each card's prose is Paige's own stored `paige_interpretation` for that check. The fleet-wide
*per-tenant* branch is gated on `is_platform_owner()` — **super_admin only** — and
`systems_check_snapshot` has no all-tenants scope, so a `platform_admin` sees operator findings only.
That is a real tier difference, recorded rather than papered over. `FLEET MRR` and per-row MRR render `—` ("not tracked yet") platform-wide because Money
Spine is deferred by owner ruling — that is an intentional honest absence, not a gap to close here.

**Post-Stage-2 tiers.** Agency / Enterprise / Solo / Sub-account read **N/A** because the owner
sequenced the operator tier to completion before any other shell opens. They are not "broken" and not
"denied" — they have not been opened. Client and Anonymous are denied at the `RequireOperator` route
gate and stay that way.


### `/operator/fleet/history` — Fleet · History

*Address unchanged by PR #571; it was Fleet Console sub-tab 3.*

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Run history feed, newest first (pack `SC_HISTORY`) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Real operator-scope runs, not the pack's fixture rows | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| An incomplete run reads "still running", never a pass/fail it has not reached | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |

**Status: LIVE.** `useSystemsCheckHistory` selects `paige_systems_check_run` at `tenant_id IS NULL`,
capped at 100 — a plain PostgREST read, because the L3 operator-scope migration already widened RLS
to let `is_platform_operator()` see those rows (§18: nothing new to add). §32.c live-drive owed.

### `/operator/settings/alerts` — Settings · Alerts

*Re-addressed by PR #571 (`24482d15`): was `/operator/fleet/alert-rules`, Fleet Console sub-tab 4. Same `FleetAlertRulesSurface` (`viewSources.ts:132`) — the slot changed, the surface did not.*

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Pack structure — KPI ladder, Rules block, foot | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Any alert rule actually read from the platform | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Firing COUNTS (fired today · acknowledged · unacknowledged) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Firing HISTORY list (per-rule, "last N firings") | — | N/A | N/A | N/A | N/A | 403 | 403 |
| Acknowledge a firing from the surface | — | N/A | N/A | N/A | N/A | 403 | 403 |
| "+ New rule" write path | — | N/A | N/A | N/A | N/A | 403 | 403 |

**Status: A1 SCHEMA + A2 EVALUATOR + A3 DELIVERY + A4 SURFACE SHIPPED (2026-08-22); authoring
is the remaining gap.** The substrate is live end to end — `paige_alert_signal` (catalogue,
config-as-data), `paige_alert_rule` and `paige_alert_firing`, all three RLS-forced and gated on
`is_platform_operator()` (§53 — the delegated operator tier, NOT the frozen
`is_platform_owner()`); A2 added the sweep that evaluates them (`alerting-evaluate`, every 5
minutes via `pg_cron`, writing firings); A3 added the delivery leg (`alerting-deliver`, offset to
minute 2 of each 5 so a firing delivers on the same cycle it was created, writing a
`paige_admin_notifications` row); and A4 wired the surface to all of it.

**Four rows are ticked and three are deliberately not.** The tab now reads real rules, renders
each rule's condition as a sentence, and shows four real KPIs — every FIRING figure an exact
head-count, never `rows.length` over an uncapped select (§199). What it does NOT do: list
individual firings (that is A-Weave-1), let an operator acknowledge one (RLS permits it; no
control exists), or author a rule. **"+ New rule" renders DISABLED and says why** rather than as
a live-looking control that silently discards the operator's work — the §13/§36 rule that a
control which looks live and does nothing is worse than one that is visibly not ready yet.

**Live state: 0 rules, 0 firings.** The tab renders its real empty state, and that is correct
rather than a gap: the evaluator has nothing to check until A5 lets an operator author the first
rule. A row here is ticked for what the surface CAN do with real data, not for how much data
happens to exist today.

| A1 capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Read the signal catalogue | ✓ | 403 | 403 | 403 | 403 | 403 | 403 |
| Read / author / pause alert rules | ✓ | 403 | 403 | 403 | 403 | 403 | 403 |
| Read + acknowledge firings | ✓ | 403 | 403 | 403 | 403 | 403 | 403 |
| Hand-write a firing | — | 403 | 403 | 403 | 403 | 403 | 403 |

| A5a capability (the WRITE SEAM) | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Create / edit / pause / delete a rule via `alerting-rule-write` | ✓ | 401 | 401 | 401 | 401 | 401 | 401 |
| Author a rule bound to an UNREADABLE signal | — | 401 | 401 | 401 | 401 | 401 | 401 |
| Declare a delivery channel that does not exist yet | — | 401 | 401 | 401 | 401 | 401 | 401 |
| Delete a rule that has recorded firings | — | 401 | 401 | 401 | 401 | 401 | 401 |
| "+ New rule" button on the Fleet tab | — | N/A | N/A | N/A | N/A | 403 | 403 |

**The seam exists; the button does not yet.** A5a ships the server-side authority — one edge
function that is the ONLY thing allowed to decide whether a rule may be stored — and A5b wires the
form to it. The button row therefore stays `—`: this ledger does not tick a surface row for an
endpoint, the same way it did not tick one for a table or a cron job. `paige-mcp` becomes a second
caller of this same function in A-Weave-2 — tools, not a second write path (§18).

**Three rows are `—` for God too, and each is a refusal rather than a gap.** A rule bound to a
signal with no reader would sit in the operator's list reporting "never evaluated" forever while
they believed something was watching — the same class of defect as a control that looks live and
does nothing (§13/§36), so it is refused with the reason named. A channel other than `in_app` is
refused because nothing sends on it: neither the evaluator nor the delivery leg reads `channels`
at all today (verified — grep returns nothing), so accepting `email` would convert a declaration
into a promise. Deleting a rule with firings is refused because a firing is the record that
something actually happened, and destroying that history to tidy a list is not a trade this seam
makes on its own (§13/§58) — pause is the reversible move and the refusal says so by name.

**Validation is not duplicated into the browser, and that is the point.** The seam calls the SAME
`validateCondition` the evaluator runs, so a rule cannot be accepted in a shape the evaluator will
later reject. That module is Deno and cannot be imported by the form, which is precisely why the
authority is server-side. If the signal catalogue itself cannot be read, the write is REFUSED
(503) rather than allowed through unvalidated.

**Every tenant tier is 403, not N/A — and that is a decision, not an omission.** A rule here
watches the PLATFORM (failing checks, tenants at risk, LLM failover), which is the operator's
book. Tenant-tier alerting is a separate owner decision with its own §51 row and §60 entry;
assuming it now is the §56 pre-build failure the matrix exists to stop. `platform_alerting` is
declared God-only in `getTierFeatureSet()` as a documented §61 exception, the same shape as
`fleet_console`. **Proven, not asserted:** the §32.b rollback proof drove a tenant-tier
(`authenticated`, non-operator) caller and confirmed 0 rules, 0 firings, 0 signals visible.

**"Hand-write a firing" is — for God too.** Firings are written by the evaluator (service_role)
only; an operator-authored firing would be a fabricated event in the one table whose entire job
is recording what actually happened (§13).

| A2 capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Active rules are evaluated on a schedule (every 5 min) | ✓ | N/A | N/A | N/A | N/A | N/A | N/A |
| A tripped rule writes a firing row (`delivery_status='pending'`) | ✓ | N/A | N/A | N/A | N/A | N/A | N/A |
| Force a sweep by calling `alerting-evaluate` | ✓ | 401 | 401 | 401 | 401 | 401 | 401 |
| A firing is DELIVERED anywhere | — | — | — | — | — | — | — |

| A3 capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| A pending firing is DELIVERED to the operator inbox | ✓ | N/A | N/A | N/A | N/A | N/A | N/A |
| A firing on an `autonomy_lane='off'` rule is SKIPPED, not delivered | ✓ | N/A | N/A | N/A | N/A | N/A | N/A |
| External delivery (email / SMS to an operator) | — | — | — | — | — | — | — |
| Force a drain by calling `alerting-deliver` | ✓ | 401 | 401 | 401 | 401 | 401 | 401 |

**`delivery_status` moves to `delivered` ONLY after the notification row really inserts** — a
fire is not a delivery (§13). A rule whose `autonomy_lane` is `off` is marked `skipped` with the
reason recorded and `delivered_at` left NULL, because 🔴 means human-briefed-only (§16) and
auto-delivering it would quietly overrule the lane the operator set. A firing whose rule has been
deleted is marked `failed` with that stated, never dropped silently.

**External delivery is `—` for EVERY tier, including God, and that is an owner-owed decision, not
an oversight.** The platform models tenants and clients; it has no operator address book. "Who
receives the 3am alert email" is a real choice and must not be quietly hardcoded to the owner's
address (§45/§63). The in-app leg needs no such decision, so it shipped first.

**The evaluation rows are N/A, not 403, for every tenant tier** — and the difference is
deliberate. 403 means "this tier is denied a capability that exists"; N/A means the capability has
no tenant-tier meaning at all. A scheduled sweep is not something a tier is denied; it is
platform-scope work with no tenant analogue. The row that IS a denial — an ad-hoc call to the
function — is **401**, not 403, because the gate fails closed at authentication: the function
accepts an internal caller (service-role bearer or `x-cron-token`) or an operator JWT
(`is_platform_operator()`), and everything else is rejected before any rule is read. Never a
tenant JWT, never an identity from the request body (§588).

**"A firing is DELIVERED anywhere" is — for EVERY tier, God included, and that is the point.**
A2 writes firings and stops. Delivery is A3 and routes through `_shared/channel-adapters.ts`
(§18 — the existing single home for multi-channel delivery, not a second stack invented here).
That was written while A3 was still pending, and while it was, every firing sat at
`delivery_status='pending'` — which was the literal truth. **A3 has since landed
(2026-08-22, PR #564)**; see the A3 table above for what delivery now does and does not
cover. The note is kept because its reasoning still binds: a row that said ✓ before the
delivery leg existed would have been the exact "a fire is not a delivery" lie this table's
own design exists to prevent (§13).

**Two signals are honestly UNREADABLE and a rule bound to either reports "never evaluated",
never a pass.** `migrations.drift` — an edge function cannot read git. `llm.failover_rate` — A1
seeded it as readable in error; `paige_llm_trace` records no failover marker (verified against
the live schema, not assumed), so A2 flips it to unreadable and registers `llm.error_rate`, which
the schema genuinely supports, as its own key rather than quietly serving an error rate under a
failover name.

---

**Original gap note (written 2026-08-18, SUPERSEDED — kept for the record, §13 audit trail;
every absence it describes has since been built by A1–A4):** The pack's structure ships through the
generic panel with every KPI at `null` and the block stating "No alert rule is being read from the
platform yet." That is the honest absence, not a stand-in — but it is an absence: there is no
alert-rule table, no firing record, and no delivery path. Building it is a net-new capability with
real design questions (what conditions can be expressed, what channels deliver, whether it consumes
the existing Systems Check finding stream or its own), so it is an owner-scoped slice rather than a
port.

### `/operator/analytics/platform-health` — Analytics · Platform health

*Re-addressed by PR #571 (`24482d15`): was `/operator/fleet/team-pulse`, Fleet Console sub-tab 5. Same `FleetTeamPulseSurface` (`viewSources.ts:102`).*

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Platform-seat roster (real `list_platform_staff()`) | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| SEATS count | ✓ | N/A | N/A | N/A | N/A | 403 | 403 |
| Utilisation / hours booked / where operator time goes | — | N/A | N/A | N/A | N/A | 403 | 403 |

**Status: PARTIAL, by construction.** The roster and seat count are real and reuse the existing
Platform → Team RPC (§18). Utilisation, hours booked and "where operator time goes" render as an
honest absence because **no activity-tracking substrate exists to measure them** — there is nothing
to read, so there is nothing to wire, and a percentage here would be invented (§13). Closing these
rows means building operator activity tracking first, which is its own decision.

**Fleet Console, whole-branch status (recorded 2026-08-20).** Sub-tabs 1, 2, 3 and 5 carry real
reads; sub-tab 4 (Alert rules) was the single remaining backend gap at the time of that survey
and has since been closed by A1–A4 (2026-08-20 → 2026-08-22). This survey corrected a stale
plan that had History queued as the next port — it had already shipped with a real feed, and
rebuilding it would have been the §18 failure of building something that already exists.

**Superseded as an ADDRESS map by PR #571, kept as the record (§13).** The five sub-tabs above no
longer exist as a branch: Systems check, Directory and History are the three Fleet slot views;
Alert rules moved to Settings · Alerts; Team pulse moved to Analytics · Platform health. What each
surface READS is unchanged — the shell around them moved, the reads did not. See the console table
at the top of this ledger for where each one now answers.

## Known ambiguities and hazards (log, don't hide — §13)

| Ref | Hazard | Where |
|---|---|---|
| **#589** | Unordered `LIMIT 1` (no `ORDER BY`) makes tenant resolution **nondeterministic** for multi-tenant users with no client row and no `active_tenant_id`. | `get_paige_persona_context()` steps 3 (`tenant_members`) and 4 (`tenants.owner_user_id`). |
| profile-key drift | `get_paige_persona_context()` keys the profile branch on **`profiles.id = auth.uid()`** while `current_user_tenant_id()` keys on **`profiles.user_id = auth.uid()`** — distinct columns; the persona branch silently misses when they differ. | Two resolvers disagree. |
| `enterprise` phantom | `agency_can_manage_child` honors `account_type IN ('agency','enterprise')` but **no `enterprise` rows exist live**. Code ahead of data; don't assume the enum is exhausted by live values. | `agency_can_manage_child`. |
| sub-account ≠ account_type | Sub-account is `parent_tenant_id IS NOT NULL`, not a distinct `account_type`. Filtering by `account_type = 'sub_account'` matches nothing. | `tenants` shape. |

## Canonical references
- `CLAUDE.md` §61 — default tier-placement rule (the §56/§60 companion; this doc's §61 above is the authoritative home).
- `CLAUDE.md` §9 — platform vs tenant seam ("who is this for?").
- `CLAUDE.md` §37 — producer inventory (this doc is the tier axis it crosses).
- `CLAUDE.md` §32 — dual-layer verification (per-tier smoke walk).
- `CLAUDE.md` platform-independence — no hardcoded live tenant/user ids (this doc names archetypes only). *Owner-ruled but not yet a numbered § in `CLAUDE.md` — pending doctrine paste #591.*
- `CLAUDE.md` §51 — tier-parity railing (the slice this doc grounds); its companion platform-impact-assessment directive is owner-ruled but not yet pasted (pending #591).
- [`producer-inventory-template.md`](./producer-inventory-template.md) — the fillable §37 × tier grid.
- [`compliance-checklist-template.md`](./compliance-checklist-template.md) — the six-row compliance gate.

Grounded from live prod ref `xygzykjyynhzqytbqnzu` on 2026-08-02 via `pg_get_functiondef`
and `information_schema`. Update this doc when a resolver body changes on prod, when the six
tiers are extended by owner ruling, or when a logged hazard (#589, profile-key drift) is fixed
— re-quote the live body, never edit the resolution order from memory.
