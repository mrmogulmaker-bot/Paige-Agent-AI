# Tier Matrix — the Canonical Six

> **Status and authority.** This document is a derived implementation reference for the
> §51 "tier-parity railing." The directives in `CLAUDE.md` §9 (platform vs tenant seam),
> §37 (producer inventory), §32 (dual-layer verification), and platform-independence (no hardcoded live
> ids) remain canonical. If this synthesis and `CLAUDE.md` differ, `CLAUDE.md` governs.
> Every future §37 producer inventory, §32 verification walk, and crew brief points HERE
> for the enumeration of who can call an endpoint and how their tenant resolves.

## §56 PRE-BUILD GATE — check this matrix FIRST, before the first line of code

**Solo Conversations placement (owner-approved 2026-08-28).** This presentation is for the Solo
Clients workspace only. It does not change the tier feature map, Sub-account/Agency/Enterprise/God
surfaces, provider authority, or server access. The visible canvas begins below the shared Clients
subtabs; Conversations consumes People-owned relationship identity and Settings-owned readiness but
does not duplicate either editor. Every unsupported channel remains visibly PARTIAL, UNAVAILABLE, or
PROPOSED rather than being promoted from connector presence.

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
- **Solo Campaigns -> Pipeline (Gate 1 approved; draft, not live as of 2026-08-31):** follows the existing Growth exception: Solo + Sub-account + Enterprise + God, not Agency. The base capability is tenant-owned multiple pipelines, explicit stage lifecycle management, board-first deal context, and compact focused-stage operation. Read-only members receive the projection but not stage/pipeline writes. This row remains **DRAFT / UNVERIFIED** until Gate 2, merge, persisted migration apply, and authenticated owner-flow proof; it must not be represented as shipped beforehand.

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
| `/operator/settings/capabilities` | **`capsVals` ported AND WIRED (Layer 3d)** — the real `list_tool_autonomy()` catalogue, its four counts as filters, per-tool `Autopilot / Ask first / Off` writing through `set_tool_autonomy()`, the Trust Compass clamp applied at render, and the schema's no-autopilot rule shown struck through rather than hidden. | **`wired`** | `surfaces/settings/CapabilitiesSurface.tsx` · `data/useToolAutonomy.ts` · driven: `ported-surfaces-drive.mjs` |
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
   **Capabilities (Layer 3d, 2026-08-24) is the first `wired` surface in this layer**, because it
   did not have to wait for Layer 6: `list_tool_autonomy()` and `set_tool_autonomy()` both ship,
   and CD drew against them by name. Tools, modes, counts and the write are real.
   **What it reports that nothing else did:** 23 of the 46 tools the runtime gates are missing
   from that catalogue, so they are governed invisibly — the operator cannot turn them off,
   including a permanent workflow delete. CD's foot said four; the ledger said five; the measured
   number is 23, and the surface states the measured one. `lint:tool-catalogue` holds it from
   growing until the catalogue is completed (task #217).

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

### `/admin/conversations/settings` — Communications › A2P registration (`A2PTab`)

**Shipped by PR #665 (this commit), §66 paid ON TIME.** The surface already existed; what changed is
that preparing a registration now **persists**. Before this, `comms-a2p-draft` performed two reads and
no write, so the prepared draft died with the HTTP response.

**The gate.** `Admin.tsx:534` mounts `conversations/settings` with **no `RoleGate`** — it inherits
whatever guards `/admin`. The authority that actually decides is server-side, in
`tenant_a2p_registration_save_draft`: `is_platform_owner() OR has_any_role(uid,{admin,coach})`, with
the tenant derived from `current_user_tenant_id()` and never from the request body (§9). A
service-role caller (Paige headless, §10) is the only caller that may name a tenant.

| | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Read the registration | ✓ (all tenants, RLS) | ✓ own | ✓ own | ✓ own | ✓ own | 403 | 403 |
| Prepare / save a draft | ✓ | ✓ admin·coach | ✓ admin·coach | ✓ admin·coach | ✓ admin·coach | 403 | 403 |
| Submit to a carrier | — | — | — | — | — | — | — |

**Updated 2026-08-30 (PR #672), §66 paid in the same commit.** The prepared draft now keeps
all seven reviewed fields (three new nullable columns) and can be REOPENED for editing on a
return visit — #665 persisted four fields and could not reopen any of them, so the surface
promised an edit it could not deliver. Tier rows below are unchanged: this changes what the
surface can do for the tiers that already had it, not which tiers see it.

**Submission-owned state is now enforced by the database, not just by code paths (PR #672).**
Eight columns — `submitted_at`, `approved_at`, `status`, `brand_status`, `campaign_status`,
`brand_sid`, `campaign_sid`, `messaging_service_sid` — refuse a write from any direct caller
at every tier, including a platform operator using PostgREST. Only server-side authority may
move them. This does not change which tiers see the surface; it removes a tenant admin's
ability to make an unsent registration render as filed.

Two further freezes landed in the same PR, after a review found the first one partial.
`20261004040000` freezes the seven DRAFT columns (`use_case`, `campaign_description`,
`sample_messages`, `optin_flow`, and the three reply messages) once
`a2p_registration_is_immutable(old)` — so a tenant admin at any tier can still edit a **pending**
draft freely, but cannot rewrite the copy of record of a registration that has left preparation
while the surface tells them it is locked. `20261004050000` freezes `id` and `created_at` for a
direct caller at **all** stages, after a review executed a rewrite of both on a frozen row and it
succeeded, orphaning the audit link. `20261004060000` adds `tenant_id` to that freeze: it had been
delegated to the update policy, whose `is_platform_owner() OR (tenant_id = … AND …)` is true for an
operator whatever the column holds, so the tenant_id test can never refuse their write (a fact about
the disjunction's truth value, not about an evaluation order PostgreSQL does not guarantee) — so an **operator** could NULL or reassign a carrier-approved registration
(measured, all four cases — with one qualification: the reassign is allowed onto a tenant that has no registration row; onto an occupied one the unique constraint refuses it first, which is why the proof pins the refusal HINT rather than the refusal alone). That is the one column on which this section's "including a platform
operator using PostgREST" claim had not been true. Again: no change to which tiers see the surface —
only to what a direct PostgREST caller at any tier may write.

**Submission is `—` for every tier, and that is the shipped state, not an omission.** There is no
carrier integration: `comms-a2p-submit` persists the reviewed copy and returns an explicit
*prepared, not submitted* refusal. `submitted_at` is never set by any shipped path. A row therefore
means **prepared**, and the surface says so — the banner and pills key on `submitted_at` rather than
on "a row exists", which is what let an earlier revision of this very PR render "Submitted for
review" over a registration nobody had filed.

**A tenant-tier dependency worth recording:** preparing requires
`tenant_legal_profile.legal_business_name`, which lives behind `/admin/setup/legal` — an
**`AdminOnly`** route. So a **coach** can reach the A2P surface and be blocked by a record only an
**admin** can create. That is the shipped behaviour, not a bug: the surface names the requirement and
tells a non-admin who to ask, rather than offering a link that denies them. On production today
**0 of 13 tenants** carry that record, so this is the first-use path for every tenant.

### The Solo shell — Settings › Connections, `/solo/{account}/settings/connections`

**§66 debt, paid LATE and recorded rather than backfilled quietly.** PR #660 (`089b55b3`) shipped the
Calendars segment of this surface and did NOT add a ledger row; this section is written at the next
touch, which is the density pass. What follows is read from source in that commit, not remembered.

`SoloSettings` is mounted **only** by `SoloApp.tsx:214`, so the whole Settings branch — Connections
included — is a **Solo-shell** surface. Sub-accounts reach their workspace through `AgencyApp`
(`mode="subaccount"`, the `/business/{n}` tree) and therefore do NOT see this surface today; that is
a routing fact, not a deliberate tier exclusion, and it is the honest reason the sub-account column
below reads N/A rather than ✓.

Legend as above: **✓** live · **—** not built · **N/A** tier not opened yet.

| Segment | What it is | State | Operator | Agency | Solo | Sub-account | Client |
|---|---|---|---|---|---|---|---|
| `connections/communications` | **Live business-phone search, purchase, rename and choose-what-you-send-from**, the PAIGE-managed sending identity, **operable custom sending domains**, **Google sending-account connect/disconnect** | **wired** — search/purchase run `comms-search-numbers` / `comms-purchase-number` against the tenant's own Twilio subaccount; rename and set-primary run `tenant_phone_number_rename` / `tenant_phone_number_set_primary`; domains via `manage-tenant-domain`; the Google account reads `channel_connectors` and connects via `gmail-oauth-start`/`gmail-disconnect`. **Paige can drive the PHONE half** — eight `comms_*` tools cover search, purchase, rename, set-primary and registration; **domains and the Google sending account stay click-only** and Paige has no tool for either | N/A | N/A | ✓ | N/A | — |
| `connections/calendars` | Connected accounts (Google ✓ real · Zoom ✓ real · Apple honestly *not built*) + the ten-area booking-preset builder over the `calendars` row | **wired** — reads `calendars`, `calendar_hosts`, `profiles`, `staff_calendar_settings`; writes the preset patch and the Live/Draft flag | N/A | N/A | ✓ | N/A | — |
| `connections/registration` | Carrier (10DLC) registration: **PAIGE drafts the regulatory copy**, **the reviewed copy is saved**. The legal identity is SHOWN, not edited — Setup owns it | **partly wired** — `comms-a2p-draft` (a real model call) and `comms-a2p-submit` (save only) both run; **filing with a carrier does not exist** and the surface says so rather than reporting a submitted state it cannot produce. The grading ladder stays in `communications`; this area holds the acts (§18) | N/A | N/A | ✓ | N/A | — |
| `connections/health` | Provider-readiness and failure-state vocabulary | **structure-only** — every row reports "Not reported" rather than a measured value | N/A | N/A | ✓ | N/A | — |
| `connections/available` | The provider catalogue with per-provider truth badges | **structure-only** — a static catalogue, deliberately | N/A | N/A | ✓ | N/A | — |

**The caller-ID defect this slice found, recorded because it shipped invisibly (§13).**
`tenant_phone_numbers.is_primary` decides which number a workspace's outbound calls and texts come
FROM — `voice-twiml` and `send-message` both order by it to pick the caller ID — and NOTHING in the
repository had ever written it. The only `SET is_primary = true` anywhere was on `public.businesses`,
an unrelated table. Measured on production before the fix: **2 active numbers, 0 primaries, 1
workspace** — so that workspace's outbound calls resolved to whichever row Postgres returned, and
`voice-twiml` has no secondary sort at all. Buying a second number for a different part of the
business made the first one unpredictable. Migration `20260901010000` adds the two write seams that
did not exist (`tenant_phone_number_set_primary`, `tenant_phone_number_rename`) and backfills a
deterministic primary for any workspace left in that tie; the backfill was proven in a rollback
transaction on prod (0 → 1 primary) before merge.

**Paige-callable, and governed (§10/§67).** Before this slice `paige-ai-chat` registered 82 tools and
none of them touched numbers, calls or carrier registration — the capability was reachable only by a
human click. It now carries eight `comms_*` tools. Four mutate and are in `MUTATING_TOOLS` with
catalogue rows under a new `Comms` category, so each defaults to `confirm` and the operator can turn
it off: buying a number (a real monthly charge), choosing what the business sends from (what a client
sees on their phone), renaming, and drafting the registration (a paid model call that overwrites
saved compliance copy). **What they do NOT cover, stated so the row above is not read as more than
it says:** the sending domains and the Google sending account. Both are operable by a person on this
surface and neither has a Paige tool, so that half of Connections is still click-only. Naming the
gap here rather than letting "Paige-callable comms" imply the whole surface is the point of the
entry. `comms_connection_summary` is the safe read Paige starts from — channels,
number, registration state, and which comms actions this workspace currently permits. It carries no
credentials, tokens, domains or provider payloads by construction, naming each field it returns
rather than spreading a record. **Honest limit:** the Trust Compass ceiling clamps these at RENDER
only (`clampMode` in `useToolAutonomy`); `resolve_tool_autonomy`, which the runtime actually
consults, never reads the compass. The per-tool floor is the enforcement today. That gap predates
this slice and is not closed by it. **Two smaller limits, recorded at the seam** (header of
`20260901010000`): an operator acting as a tenant cannot reach the two new RPCs through Paige,
because the executor calls them with `_id` alone and never passes the act-as tenant — a refusal,
not a leak; and the role half of their gate is tenant-agnostic (`user_roles` has no `tenant_id`),
inherited verbatim from the table's own RLS policy so the write seam admits exactly who the read
seam does.

**Attributable evidence.** `comms-purchase-number` now writes an `audit_logs` row
(`comms:number_purchased`) naming the caller, tenant, number and SID — at **all four** exits
that follow a real charge, including the one where the provider took the money and our own insert
then failed. (This sentence said **three** when the slice merged. It was wrong: an independent
review of the merged diff found `twilio_purchase_missing_sid`, which returns further upstream and
is also past the charge, writing nothing at all. Corrected here rather than edited away, per §13 —
the count was stated as verified twice and was wrong both times.) That last row carries `recorded: false`, because a purchase we could not write down is
exactly the event an audit trail exists for; an earlier revision of this branch declared the writer
inside the insert-race branch, so two of the three money-spent exits recorded nothing. It records `price_recorded:
false` rather than a price, because that seam genuinely never receives one — the retail figure lives
in `comms-search-numbers`. The Rail is deliberately not used and cannot be: `record_rail_event` is
contact-keyed and a purchased number belongs to the workspace, not to any one client.

**Four defects found AFTER that slice merged, recorded because green gates did not catch them
(§13/§39).** An independent review of the pushed diff — run after CI was green, the migrations were
persisted on production and the PR was merged — found four things that every gate had passed over.
None was hypothetical; each was reproduced before it was fixed.

1. **The one-time backfill aborted in exactly the state its own guard was written for.** Review had
   added `and p.status = 'active'` so a workspace whose only primary is released still gets
   backfilled — correct reasoning — but `uq_tenant_phone_numbers_primary` is
   `UNIQUE (tenant_id) WHERE is_primary` with no status predicate, so the released row still holds
   the slot and the UPDATE collides. Reproduced on production inside a rollback transaction:
   `ABORTED 23505`. The proof that had blessed that guard ran the SELECT and never the UPDATE.
   `20261020000000` makes the state unreachable with a BEFORE trigger (a number leaving `active`
   loses the flag rather than the write being refused), repairs any existing row, and finishes the
   backfill. **One honest correction to the shipped comment:** it claimed such a workspace has its
   caller ID "pointing at a dead number". It does not — `voice-twiml` and `send-message` both filter
   `status = 'active'`. The real damage was the occupied unique slot.
2. **`money_already_spent` never reached Paige.** `comms-purchase-number` returns
   `` `number_bought_but_record_failed: ${insErr.message}` `` — prose — and the consumer compared it
   with `===` against the bare token, so the flag marking the one path where money had already left
   was silently never set. The response now carries a stable `code`; the consumer matches on it.
3. **The purchase confirmation named no amount.** "This starts a monthly charge" is not something a
   person can meaningfully approve. `comms_buy_number` now requires the quoted `monthly_cents`,
   the confirmation renders it, and — this is what makes it more than a display —
   `comms-purchase-number` re-checks it against `platform_number_pricing` **before** buying and
   refuses on mismatch (`price_changed`) or when it cannot be verified (`price_unverifiable`). An
   operator can no longer be shown one price and charged another. §37: the two UI producers send no
   price and are byte-for-byte unaffected; only the agent path is verified.
4. **The fourth money-spent exit.** See the correction above.

`scripts/comms-purchase-safety-smoke.mjs` drives the **real** handler (bundled, `Deno.serve`
captured, real `Request`/`Response`; only the Supabase client and the Twilio purchase substituted)
and is wired unconditionally into CI. Each of its 21 assertions was proven to discriminate by
reverting the corresponding fix — without the price check, a stale 99¢ quote returns
`{"purchased": true}`.

**Two ledger corrections, recorded rather than backfilled quietly (§13/§66).**
The `connections/communications` row above previously claimed **editable business details**. That
editor was DELETED in `22271bbb` on an owner ruling — the business owner, legal name, address and
phone belong to Setup, and Connections owns only what the platform hands the tenant from its own
server. The row is corrected here rather than left describing a surface that no longer exists. The
same row also described number search as `PROPOSED` and non-mutating; it is now live, which is the
other half of this touch.

**What `connections/registration` proves about itself, and what it does not (§13/§32).**
`src/solo/settings.registration.test.tsx` (12 tests, mounted) covers the ways this surface can
lie, and all four were proven to FAIL against a deliberately broken implementation before being
trusted: an unresolved workspace or a failed read collapsing into "nothing registered" above a PAID
re-draft that would overwrite reviewed copy; a registration past preparation still offering an
editor the save seam refuses; and a saved registration reported as filed. **Filing is genuinely
absent** — the TrustHub calls were removed and `comms-a2p-submit` returns `a2p_submit_wired: false`
— so no state on this surface may read as submitted, and scoping the submission path is separate
work. What is NOT proven: authenticated runtime. No live model draft was run and no registration was
saved against production by the session that built this (§32.c).

**Two defects the peer-gate (§39) caught that the green suite could not, recorded because both were
green for the SAME reason — a fixture written from the same belief as the code.**
The number search read `retail_price.retail_monthly_cents`, which is the DATABASE column; the
response key is `monthly_cents`. Every price therefore resolved to null, every row rendered "—"
*without* the "pricing pending" note (suppressed because the server correctly reported the type as
priced), and the purchase confirm offered "an unlisted monthly price" for a charge whose amount the
response was carrying. Both the unit fixture and the harness stub encoded the wrong key, so a
CORRECT implementation would have failed those tests and the broken one passed. Separately, the
registration form rendered the legal name, website and EIN as editable inputs over fields
`comms-a2p-submit` documents as "validated and then DISCARDED" — a save that reports success and
throws the typing away (§70). Both fixtures now carry the real shapes, the identity fields are
read-only reflections pointing at Setup, and the browser drive asserts no typeable box exists over
them.

**What `connections/communications` proves about itself, and what it does not (§13/§32).**

The three action layers added on 2026-08-31 are covered by
`src/solo/settings.connections-actions.test.tsx` (14 tests, mounted so effects run) and by the
tenant-resolution smoke `scripts/tenant-for-user-smoke.mts` (8 checks, wired into CI). Both honesty
rows — a rejected write never rendering as success, and an unreadable connector record never
rendering as "not connected" — were proven to FAIL against a deliberately broken implementation
before being trusted.

What is NOT proven: authenticated runtime. No OAuth was performed and no sending domain was created
against a live provider by the session that built this, so "the owner can complete the Google
connect flow end to end" is OWED to a session that drives it, or to the owner. The scope granted is
`gmail.send` — this surface connects a SENDING account and proves nothing about inbound mail, and
there is no Outlook function in the repo at all.

**What `connections/calendars` proves about itself, and what it does not (§13/§32).**
Its geometry, scroll ownership and fold-out behaviour are MEASURED, not asserted:
`scripts/live-drive/connections-calendars-drive.mjs` renders the shipped component and CSS against
the real `--pg` tokens at 1440/1024/720 in both themes and checks that the document never scrolls
sideways, that no element inside the surface owns a scrollbar, that no control is clipped past the
surface edge, that all ten areas collapse and expand, that a closed area still answers, and that the
sub-navigation actually pins. It does NOT prove production behaviour: the rows are synthetic and the
render is local.

**REACHABILITY is a separate proof from geometry, and it needs the REAL component tree.**
`scripts/live-drive/calendar-settings-usable-drive.mjs` drives the surface inside the REAL merged
`SoloApp` — not a reproduction of the shell — at 1536×770, 1366×768, 1024×768 and 900×1000 in both
themes, with every area open, and asserts the final actionable control is reached by wheel, trackpad,
touch, keyboard from the real arrival state, and sequential Tab, with the scrollbar unsuppressed in
both the `scrollbar-width` and `::-webkit-scrollbar` lanes. It exists because a harness that
REPRODUCES the chain can pass while the surface is unusable: two separate harnesses returned green on
this surface while `.paige-solo main{overflow:hidden!important}` was beating `SoloApp`'s inline
`overflow:auto` on its own screen host, leaving Settings with ZERO scroll owners. One omitted the
screen host; the other omitted `solo-tokens.css`. Mounting the real `SoloApp` makes the chain shipped
by construction rather than by claim. **The authenticated live drive of the DEPLOYED surface is owed to a session that
holds credentials** — these headless sessions hold none (§32.c).

**Write authority is `is_current_user_tenant_admin()`.** A caller without it reads the whole
configuration with every control disabled rather than hidden. Send capability is REPORTED from the
four `comms_configured` seams and never asserted here, and it is only readable for the caller's own
tenant — an operator or agency acting as another account gets `outOfScope`, which the surface states
as "not readable from here" rather than as a negative.

### PAIGE Chat — the document proposal seam, `/solo/{account}/paige/chat`

**§66, same commit as the ship.** A document dropped into PAIGE Chat now ends in a PROPOSAL a
person approves, not a write that already happened.

| Surface | God | Agency | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|
| Document upload in chat | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |
| Credit-report auto-write on upload | — | — | — | — | — | — | 403 |
| `extraction_proposal` card rendered | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| `paige-apply-extraction` (approval writes) | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| A truthful `sync_status` on a document turn | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |

**§13 — THE TWO CLIENT ROWS SAID ✓ AND WERE FALSE, in the ledger §66 exists to keep true.** The
client portal DOES ship an `ExtractionProposalCard`, but it is fed by a client-side regex over
TYPED TEXT (`conversationalExtractor`), posts VALUES to `paige-write-back`, and has no consumer for
the server's `extraction_proposal` frame at all; nothing under `src/components/app/` calls
`paige-apply-extraction`. Recording a capability on a tier that does not have it is precisely the
failure mode that makes a session answer "do we have this?" wrongly from the source of truth. Caught
by an independent reviewer grepping the claim rather than reading it.

The portal and the floating widget DO parse `sync_status`, so the document turn keeps emitting one
alongside the proposal — otherwise those two surfaces would have gone from showing a sync panel to
showing nothing, which is a §58 silent removal. That frame now reports `success: false` on a turn
that wrote nothing, because `SyncStatusPanel` keys "✅ Profile Sync Complete" off `success` and a
completed sync is not what happened.

**§58 — A SHIPPED CAPABILITY WAS DELIBERATELY REMOVED, and this row is the explicit call-out the
section requires.** Until this change, a credit-report PDF dropped into chat caused
`sync-credit-report-data` to write eight tables immediately: three FICO columns on `profiles`,
`credit_negative_items`, `credit_accounts`, `credit_inquiries`, `credit_factor_scores`,
`funding_readiness_scores`, and two further `profiles` columns. That path is gone from chat. It is
not a regression to repair — it is the owner's ruling ("never auto-write extracted fields")
applied — but it IS a behaviour a tenant could previously rely on, so it is named here rather than
left to be discovered, and it needs owner sign-off at Gate 2 like any other removal.

**What is NOT changed (§37).** `sync-credit-report-data` itself, and its four non-chat producers —
`CreditReportUploader`, `ReportUploadTab`, `CreditIntelligence`, and `analyze-credit-report`. Those
surfaces keep their existing behaviour. Only the chat caller stops writing without asking.

**Gating.** No new tier flag. Document upload is not tier-gated today and this slice does not
introduce a gate; the proposal follows the document wherever the document is already allowed.

### PAIGE Chat — the autonomy gate, `/solo/{account}/paige/chat` and every other chat surface

**§66, same commit as the ship.** Every mutating tool Paige can call is gated: at `auto` she acts,
at `confirm` she proposes and waits, at `off` it is refused. What changed is how a person's YES
reaches the gate — and this row exists because the first attempt silently removed the capability on
five of six surfaces without any ledger row noticing.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|
| Mutating tool gated before it runs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |
| Operator can see/flip every gated tool (51/51) | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| ORDINARY action approvable by `confirm: true` (no card needed) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |
| HIGH-RISK action approvable — rendered card only | — | — | — | ✓ | ✓ | — | 403 |
| OWNER-ONLY action approvable from chat | — | — | — | — | — | — | 403 |
| Unclassified write refused before dispatch | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |
| `update_client_data` completable by a client seat | n/a | n/a | n/a | n/a | n/a | ✓ | 403 |
| One approval executes exactly once | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |
| A declined proposal is cancelled, not left live | — | — | — | ✓ | ✓ | — | 403 |
| Every executed write files an attribution row | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |
| …and the actor can record their OWN action (`paige_audit_log` INSERT) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |
| Reads their own tenant's audit rows | ✓ | ✓ (admin) | ✓ (admin) | ✓ (admin) | ✓ (admin) | own rows only | 403 |
| Reads ANOTHER tenant's audit rows | ✓ (operator) | — | — | — | — | — | 403 |
| Per-client rail names the record it changed (`ref_id`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |
| Opens knowing what it is carrying (`paige_operating_memory`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |
| …scoped to THEIR tenant, and their own work within it | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 403 |
| …narrowed to the focused client when one is in focus | — | — | — | ✓ | ✓ | ✓ | 403 |
| Reads client memory for their OWN tenant's clients | ✓ | ✓ (admin) | ✓ (admin) | ✓ (admin) | ✓ (admin) | own only | 403 |
| Reads ANOTHER tenant's client memory | ✓ (operator) | — | — | — | — | — | 403 |
| Writes client memory into another tenant's client | ✓ (operator) | — | — | — | — | — | 403 |
| Files a note onto their OWN client (`crm_add_note`) | ✓ | ✓ (admin/coach) | ✓ (admin/coach) | ✓ (admin/coach) | ✓ (admin/coach) | — | 403 |
| Files a note onto ANOTHER tenant's client | ✓ (operator) | — | — | — | — | — | 403 |
| A client can read notes filed about them | — | — | — | — | — | — | 403 |

**The echo row is an honest `—`, not a gap.** Only `PaigeAIChat` (Solo and Sub-account) renders a
confirm card and echoes back the fingerprint of what it displayed. `useSoloChat`, `FloatingChatbot`,
`PaigeChat`, `useOperatorChat` and `StudioChat` send no echo and never have. That is why the echo
cannot be the ONLY way to approve: a rule five of six callers cannot obey is not a rule, it is an
outage. The token path works on all six, so no tier loses the capability; the echo remains as
stronger evidence where a surface can supply it — a human demonstrably clicked.

**§58 — the row this table would have caught.** `update_client_data` is the single tool a
client-portal seat may call. Putting it behind an echo-only gate, on a surface with no confirm
affordance, removed the Client tier's only write outright. Filling this row honestly at the time
would have surfaced that before it shipped; it took an independent reviewer instead. Proven
released by case C8 of the migration's §32 proof — a seat with no thread and no focused client can
claim its approval.

**Gating.** No new tier flag. Autonomy is resolved per tenant per tool by `resolve_tool_autonomy`,
clamped by the Trust Compass ceiling (`20261039000000` — renumbered from `20261021000000` on the
2026-09-02 merge, which collided with main's already-applied tool-confirmation binding); the token changes only how consent is
carried, never who may act.

**A TOKEN CANNOT BE REDEEMED BY THE TURN THAT MINTED IT — the correction to the row above.** The
first version of the token gate returned `confirm_token` in the TOOL RESULT, which the agentic loop
pushes straight back into the model's own context before any human sees anything. The model could
re-emit the call carrying it and execute, one round after proposing — with no operator involved, on
all 48 gated tools including role grants, deletes and `automation_set_grant` itself. The property
that had been holding was structural: `approvedConfirmations` comes only from the request body, and
a model cannot write a request body. Handing it the token destroyed that.

The floor is now that a proposal records the request that minted it and the claim excludes it. A
model cannot start an HTTP request; only a person sending another message can. Approval therefore
still works on every surface — including the five with no confirm card — but never within the turn
that proposed it. The request-body echo remains accepted as stronger evidence where a surface can
supply it. See `20261026000000`, and checks 18.0–18.4 in the authz harness, which drive a genuinely
self-approving model rather than describing one.

**AND THE LIMIT, STATED RATHER THAN IMPLIED.** A new request proves a person sent another message.
It does NOT prove that message was a yes. On the five surfaces with no confirm card the yes is
still the model reading prose and asserting it — the trust level those surfaces have always had,
now with the arguments pinned, the claim single-use, and scope re-checked. Only a surface that
renders the summary and echoes back the fingerprint of what it displayed turns "a person replied"
into "a person approved THIS", and exactly one surface does that today. Building the card on the
other five is the real close-out; it is interface work, and it is owed to Claude Design (§00).

**THE RISK SPLIT IS A POLICY, NOT A COMMENT — and the token is gone entirely.** Two rows above
changed shape, so the reason is recorded rather than left to a diff.

The token described below was re-obtainable. It is the fingerprint of an ACTION rather than a
secret, so any later request that re-proposed the same call was handed it straight back and could
spend it immediately — including a request whose human message was "No. Do not do that." Driven,
that executed arbitrary stored calls and raised an autonomy grant from `confirm` to `auto`. Removed
rather than patched: a key anyone can ask for is not a key.

What replaces it is `supabase/functions/_shared/action-risk.ts`, the ONE place that classifies every
mutation. `classifyAction` takes a tool name and nothing else — no request, no arguments, no calling
surface — so nothing in a turn can argue about its own risk:

| Class | Count | What it means | How a yes reaches it |
|---|---:|---|---|
| `ordinary` | 28 | Reversible, in-tenant, effects stay in the workspace | `confirm: true` (the model reporting a yes) **or** a rendered card |
| `high` | 21 | Irreversible · changes who may do what · reaches outside the platform · spends money · goes public | The rendered card ONLY. The model's word is refused. |
| `owner_only` | 2 | Raising Paige's own autonomy | Nothing. Not approvable here at any strength. |
| *unclassified* | 0 | — | Refused before dispatch, both at the gate and ahead of it |

`owner_only` is `automation_set_grant` and `automation_set_state`, per the owner's ruling of
2026-09-01: *"Paige may never grant or raise her own autonomy through Chat, regardless of action
class or owner wording. That remains an owner-controlled Settings policy."* Turning a process LIVE is
the same decision wearing different clothes, so both refuse. **Consequence, stated rather than
buried: `paige_automations.granted_lane` and `.state` are currently settable by nothing** — the chat
tools refuse and no Settings control exists yet. Automations were already inert (no trigger emits —
slice D), so nothing regressed; the Settings control is owed, and it is interface work belonging to
Claude Design (§00).

**The gated set is now the policy's key set.** `MUTATING_TOOLS` used to be a literal beside the gate;
two lists that must agree eventually do not, and the permissive answer was the one that came free.
CI (`lint:action-risk`) fails any change that adds a write tool without classifying it, or that
reintroduces the hand-list, or that classifies a delete/publish/grant as `ordinary`. The runtime
carries the same rule as a last line: a tool whose name reads as a write and carries no
classification is refused before dispatch, so a missed classification is inert rather than
ungoverned.

**EVERY WRITE IS ATTRIBUTABLE — and the Client row above changed from a `—` to a `✓`.** One seam,
at the point every executed tool passes through, files a `paige_audit_log` row carrying the entity
and record touched, the actor, the tenant, the risk class, **the authority it ran on**, and the real
outcome. `standing_autonomy_setting` (the operator's earlier decision) and `operator_card` (a yes
given in this conversation) are recorded as different things, because they are.

Two policy defects had to close first, both confirmed against production before being fixed and both
in migration `20261027000000`:

1. **The INSERT policy required `is_staff()`**, so a `client` seat could never record its own action
   — and that seat's one write (`update_client_data`, on their own record) was the single write the
   trail structurally could not cover. Now `actor_user_id = auth.uid()`, which loses nothing: an
   actor could only ever insert a row naming themselves.
2. **A tenant-level `admin` could read every UNTENANTED audit row.** Near-harmless while almost
   nothing was written there; not once every write files one. §58: this is a narrowing — a tenant
   admin loses a read they had — and it is a leak closing, not a capability going.

**§13 — a correction to how this was nearly done.** The first version of that migration was
justified by "a tenant admin can read every tenant's audit rows", read out of the migration history.
Production says otherwise: a RESTRICTIVE `tenant_isolation` policy exists on this table that **no
migration in this repository creates**, and it already ANDs tenant scope onto every read. The
migration was rewritten against the defects that are actually there. The live catalogue is the
source of truth about the live database; a grep of `supabase/migrations/` is not.

**Still open, named rather than implied:** `delegate_to_subagent` is classified `high`, so
dispatching a specialist needs the approval card — but the orchestrator it calls runs under the
service role, so what that specialist then does is governed by its own surface, not by this gate.
The dispatch is attributable; the specialist's own writes are the orchestrator's to account for.

**PAIGE OPENS KNOWING WHAT SHE IS CARRYING — composed, never stored.** A transcript is what was
SAID, not what is OWED, and it does not survive a new thread, a compaction, or a person coming back
a week later. `paige_operating_memory()` composes the four records that already held the answer:
open commitments (`plan_items`), live processes (`paige_automations`), work in flight including
anything stopped at an approval (`paige_actions`), and what she last did WITH ITS REAL OUTCOME
(`paige_audit_log`, from C1).

There is no fifth table and no copy that can go stale. A summary store would need a writer on every
one of those four paths and would be wrong the moment one was missed.

**Scope is derived, not passed.** The function takes NO tenant argument — it resolves from
`auth.uid()` and `current_user_tenant_id()` — so nothing in a request can aim it at another tenant
(#588's lesson). It is SECURITY INVOKER (§59), so RLS remains the boundary rather than this body
re-implementing four isolation rules correctly and forever. When a client is in focus it narrows to
that client, which is what stops a switch carrying the previous client's open work into the new
scope (§S2). Proven on production across two tenants seeded identically: A sees all four of its own
sections, none of B's, and not a teammate's commitment inside its own tenant.

**§13 — an unavailable read renders NOTHING.** "Nothing outstanding" is a claim, and a read that
failed is not entitled to make it. The failure is logged instead.

**THE AUTONOMY LANE GOVERNS `paige-ai-chat`, NOT `paige-mcp` — stated rather than implied.** An
earlier commit message said two tools "both default to confirm now"; that is true inside the chat
function and NOT over MCP. `paige-mcp` performs zero autonomy resolution for ANY tool — this is a
pre-existing architectural gap, not a regression introduced with the gate — so an MCP caller
(including the Super Admin connector) reaches `delegate_to_subagent` and every other write governed
only by its permission scope (`workflows.run`, enforced at `paige-mcp/index.ts:5159`), never by the
tenant's autonomy setting or the Trust Compass ceiling.

It is recorded here rather than fixed in passing, deliberately. MCP callers have no confirm
affordance at all, so bolting the lane onto that surface would make every gated MCP write
permanently un-executable — which is precisely the failure the confirm-gate repair above exists to
undo, repeated on a second surface. Closing it properly means giving MCP a way to carry consent
(the proposal token is the obvious candidate, since it needs no UI), and that is its own slice with
its own §37 producer inventory. Until then the honest statement is the one above: two different
boundaries, both real, governing different things.

### PAIGE Chat — a proposal you did not act on is reachable again

**§66, same commit as the ship.** The extraction card is live-turn only and is never rehydrated
into a reloaded thread, so a person who read Paige's findings and got distracted had no route back
to them: the row sat at `awaiting_review` forever while every other surface correctly reported the
upload as analysed. Migration `20261019000000` added a partial index for exactly this question and
nothing ever asked it.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|
| `document_pending_reviews` (what is still waiting on me) | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| `document_resume_review` (put the card back) | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| The resumed card actually renders | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |

**Chat, not a new surface (§21).** This is something Paige can raise and act on in the
conversation; it is not a tab, a queue screen, or an inbox. Both tools are READ-only — resuming
re-shows what was already found and writes nothing, asserted by check 17.4.

**The Client row is `—` for the same reason as the rest of the extraction seam:**
`clientSeatToolAllowed` admits only `update_client_data`, so neither tool reaches dispatch from a
portal seat.

**Scope is RLS, not a tenant argument.** Both read `credit_report_uploads` as the caller, so a
person sees only uploads they can already see. The proposal is re-derived from the stored reading
via the same `buildCreditProposal` the apply function uses, never trusted from the request — what
can be re-offered is exactly what could have been offered the first time.

**§13 note on where the frame is emitted.** The agentic path does not pass through the close-out
chain the document-UPLOAD path uses. The first implementation set the proposal on a variable
nothing on that path read: the tool reported success, Paige said the choices were back on screen,
and nothing appeared. Caught by driving it (check 17.2), not by reading it.

### PAIGE Chat — repeatable processes (§67 automations), every chat surface

**§66, same commit as the ship.** A tenant can now describe work they do the same way every time
and have Paige build it as a process: a trigger, conditions, and an ordered chain of acts, with a
lane the human grants it.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|
| See what can start a process (`automation_triggers_list`) | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| List processes + their resolved posture | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Paige builds one from a description | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Grant a process a lane (`automation_set_grant`) | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Turn one on / pause it | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Operator can switch these three tools off | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |

**The Client row is a hard `—`, enforced twice.** `clientSeatToolAllowed` admits exactly one tool
for a client-portal seat (`update_client_data`), so none of these reach dispatch; and RLS on
`paige_automations` is admin-only within the tenant. Proven by check 15.0 in the authz harness,
which drives a real client seat and asserts nothing is written — it exists because the harness
defaults to a client seat and that is how the boundary was noticed at all.

**Authoring is not granting, and the tables enforce it.** Paige creates every process at
`granted_lane='confirm'`, `state='draft'`, explicitly, regardless of what the request said — an
agent that could compose a process and authorise it in one call would be granting itself autonomy.
Raising the lane is `automation_set_grant`, which is itself confirm-gated, so a human says yes to
that specific change. And per `20261022000000`, changing the chain afterwards drops an `auto` grant
back to `confirm`, because the human approved a specific sequence.

**The resolved posture is what any surface must show, not the stored grant.** A process set to
`auto` can still be asking — because the Trust Compass ceiling holds it, or because one of its own
acts always requires approval. `resolve_automation_autonomy` returns both plus `capped_by`, and the
tool results carry it so Paige tells the operator what will ACTUALLY happen (§13). A surface that
renders `granted_lane` alone would be reporting a request as an outcome.

**§61 default: no exception.** These follow the standing distribution — God/Solo/Sub-account yes,
Agency by resell, Enterprise both — so no owner ruling was sought. Agency's ✓ above is for acting
inside a tenant workspace it has switched into (§51), not a cross-tenant reach.

### Solo Settings → Team — removing someone from a workspace, `/solo/{account}/settings/team`

**§66 — `SHIPPED`, and this row records what is LIVE, confirmed by query rather than by merge.**
PR #799 merged as `5ca7893d`; `deploy-migrations.yml` applied `20261048000000` automatically on the
push to `main` (`supabase db push --include-all`, which is also what applies a version numbered
below ones already on `main`). Read back from production:

- `supabase_migrations.schema_migrations` contains `20261048000000`.
- `to_regprocedure('public.remove_solo_team_member(uuid,uuid)')` is non-null.
- `tenant_members` grants **no** INSERT/UPDATE/DELETE/TRUNCATE to `anon` or `authenticated`;
  `SELECT` is deliberately retained.
- Control, so those eight `false`s are a measurement and not a description of the environment:
  `public.tenants` — untouched by this migration — still grants `anon` TRUNCATE.

The prerequisite half of the program, #827 (`20261047000000`, the invitation-lifecycle repair that
stops an invitation reaching a workspace the operator never named), was released first and is also
applied.

**Still owed, and not implied by any of the above: `Authenticated Runtime Proof Owed`.** Applied is
not driven, and driven is not the same as a person completing the flow. Neither #799 nor #815 is
closed as fully proven until the owner confirms the live flow. Post-release audit backlog is on the
#799 release comment.

An Owner can remove one **Admin or Member** from the workspace they are currently in, from the
existing member editor on the Team screen. Not only an *active* one: the target lookup deliberately
carries no status filter, because `UNIQUE (tenant_id, user_id)` means a filter could only hide a row
— and a hidden row is both unremovable here and still counted as "already belongs to the workspace"
by the invitation functions. A suspended membership is removable, and the roster already shows it. `remove_solo_team_member(_member_user_id,
_expected_tenant_id)` derives the actor from `auth.uid()` and the workspace from
`current_user_tenant_id()`; the tenant argument is a **refusal-only** confirmation token that can
abort the call and can never select a workspace.

| Capability | God | Agency (own roster) | Agency (switched into a sub-account) | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|---|
| Remove an Admin or Member (Owner only) | — | ✓ | **✗** | ✓ | ✓ | ✓ | — | 403 |
| Remove an Owner or co-Owner | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | 403 |
| Remove yourself | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | 403 |
| Remove a legacy specialised permission (e.g. Coach) | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | 403 |
| Remove somebody by direct table write | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

The ✓ cells are Owner-only *within* that tier: an Admin is refused by the same function that serves
the Owner.

**The switched-into-a-sub-account column is `✗`, and an earlier draft of this row got it wrong.**
It said `✓` and glossed it as "acting inside a tenant workspace it has switched into". That is false,
and the correction is recorded rather than quietly edited because this table is the source of truth
other sessions answer from. `agency_enter_subaccount()` — both overloads, read on production — seats
the manager as `role = 'admin'` and never sets `is_owner`, preserving `'owner'` only on a row that
was already one. `remove_solo_team_member` gates on `is_tenant_owner(_actor, _tenant)`, which
requires `is_owner = true`. So a switched-in agency manager is an Admin in that child workspace and
is refused with *"only the workspace owner may remove someone from this workspace"*. An Agency's own
Owner removing someone from the Agency tenant's own roster is the `✓`.

The God row is `—` for the same honest reason the Chat seam's is: a tenant-less operator has no
`current_user_tenant_id()`, so the function raises rather than reaching across tenants.

**The last row is the part that makes the others true.** Before this change,
`GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` (`20260629175341:62`) plus the `FOR ALL`
policy `Tenant admins manage members` let any tenant **Admin** `DELETE` any membership row —
including every Owner's — straight through PostgREST, and `anon` and `authenticated` both held
`TRUNCATE`, which row-level security does not gate at all (measured, not assumed:
`docs/evidence/team-removal/`). The same migration revokes `INSERT, UPDATE, DELETE, TRUNCATE` from
both browser roles. `SELECT` is untouched. Every writer of the table is a `SECURITY DEFINER`
function owned by `postgres`, so no legitimate path loses anything.

**Removal ends one workspace's access and nothing wider**, proven against production with a person
holding memberships in two workspaces: the other membership, that workspace's roster, the person's
platform identity, their profile and their authored history are all untouched, and a global role
they still earn elsewhere is retained. A re-invitation through the existing path remains possible.

### PAIGE Chat — the Solo Team seam, `/solo/{account}/paige/chat` and every other chat surface

**§66, same commit as the ship.** Paige could already READ a workspace's team — the roster, each
person's enforced permission, their work details, and every invitation with its lifecycle, injected
each turn by `get_paige_team_context`. She could do nothing with any of it. Five tools now let her
act, and they call the SAME server seam the Team screen calls: `set_solo_team_member_work_profile`
and `set_solo_team_member_permission` through the caller's own JWT, and the three invitation acts
through `solo-team-invitations`, whose RPCs are revoked from `authenticated` entirely.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|
| Read the roster + invitations (already shipped) | — | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Edit a teammate's work details (`team_set_work_profile`) | — | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Change a teammate's permission (`team_set_permission`) | — | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Invite someone (`team_invite_member`) | — | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Resend / withdraw an invitation | — | ✓ | ✓ | ✓ | ✓ | — | 403 |

**The God row is a `—`, and it is honest rather than a gate.** Every function in this seam derives
its workspace from `current_user_tenant_id()`, which is null for a tenant-less platform operator, so
the RPC raises `no active workspace`. The new tenant-agreement precondition refuses first, in words,
for the same reason. An operator acting inside a tenant they have switched into resolves as that
tenant and is the Agency ✓ case (§51) — not a cross-tenant reach.

**The Client row is a hard `—`, enforced before dispatch.** `clientSeatToolAllowed`
(`_shared/actorTier.ts:64`) admits exactly one tool for a client-portal seat, `update_client_data`,
so none of these five reach the executor at all.

**Describing a job cannot grant one, and that is structural in three places at once.**
`set_solo_team_member_work_profile` writes two text columns and cannot reach `permission`; the tool
that calls it takes no permission argument (asserted in `paige-team-capability.test.ts`); and the
context block marks tenant-authored titles and responsibilities as reference data that never confers
authority. This is why the work-details tool is `ordinary` while everything else here is `high`.

**Nobody can be made an owner from a conversation, and nobody can raise themselves.**
`set_solo_team_member_permission` admits only the tenant owner, refuses `owner` as a target value,
and refuses to touch any row that is already an owner — so the caller's own row is unreachable
through it. Invitations may grant only Admin or Member, on creation and again on resend. The tool
schemas offer `["admin","member"]` only, so the operator is never read a card describing something
that will then fail.

**The write now fails closed on the same disagreement the read already did.** The Team seam resolves
its workspace with `current_user_tenant_id()`; the conversation resolves its own with
`get_paige_persona_context`, which prefers a linked `clients` row. For a speaker who is a member of
one workspace and a client of another these are different tenants — the read handles it
(`buildTenantTeamContextBlock` returns null and Paige sees no roster) and the write did not, while
member ids for the other tenant remain obtainable from `crm_list_team`. `teamSeamTenantMismatch`
asks the read's question before every one of the five acts and refuses on mismatch, on an
unresolvable persona tenant, and on a roster that will not load.

**An invitation that was created but not emailed says so.** `solo-team-invitations` creates the
invitation first and delivers second, and the delivery fails on its own — returning `emailed:false`
beside a live invitation. That flag travels into the tool result with the sentence Paige is expected
to say, because reporting a send that did not happen leaves the operator waiting on someone who was
never contacted (§13).

**The class outranks the autonomy switch, platform-wide.** Found while adding these five and older
than them: the whole risk gate sits inside `if (autoMode === "confirm")`, and `set_tool_autonomy`
accepts auto|confirm|off for any tool key without consulting its class — so a tenant admin could put
`automation_set_grant` (owner_only, because it changes how much Paige may do alone) on auto and have
Paige raise her own autonomy from a conversation. The handler now clamps `auto` down to `confirm` for
any `high` or `owner_only` action, above the branch and keyed on the class, so it covers all thirty
rather than the five added with it. `off` survives the clamp: a brake is the operator's to pull at any
class. The setter still PERSISTS the now-inert `auto` and the capabilities surface still offers it —
reported, not silently changed, because that RPC has its own callers.

**§61 default: no exception.** God/Solo/Sub-account per the standing distribution, Agency inside a
workspace it has switched into, Enterprise both. No owner ruling was sought, and none was needed.

### Solo Team — an invitation goes to the workspace the operator named, `/solo/{account}/settings/team`

**§66, same commit as the ship. NOT YET RELEASED — this records the change under review in #815, not
live availability.** Nothing below is shipped truth until the PR merges and `20261047000000` is
confirmed persisted on prod; this row is written now because §66 binds the ledger to the commit, and
it will be corrected to SHIPPED or removed rather than left ambiguous.

**The defect.** `create_/resend_/revoke_solo_team_invite` read `profiles.active_tenant_id` **raw**
while `get_solo_team_workspace` — the read that decides whether the Invite button is even offered —
used `current_user_tenant_id()`, which COALESCEs to the caller's earliest active membership. The two
disagreed, and a sole owner whose pointer was null read their own roster, was offered the button, and
was told *"only an owner or admin may invite team members"* about a workspace they own. The
null-pointer population is manufactured continuously: provisioning never writes the column, the
client computes a working value and declines to persist it (so the null survives every login), tenant
deletion clears it, and removing somebody from a workspace clears it by design.

**The repair.** Authority is proved against a workspace the caller NAMES.
`solo_team_invite_authority(_actor, _expected_tenant_id)` requires an active `tenant_members` row
with owner or admin authority in that exact workspace — no COALESCE, no ORDER BY, no LIMIT. The Team
screen sends the `tenant_id` it rendered the roster and workspace name from; PAIGE sends the tenant
the conversation is already reconciled to. The parameter is **refusal-only**: it can abort a call and
can never select a workspace the caller has no authority in.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|
| Invite / resend / revoke, workspace named and proved | — | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Invite without naming a workspace | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| Invite into a workspace the caller is not an owner/admin of | 403 | 403 | 403 | 403 | 403 | 403 | 403 |

The God `—` is unchanged and still honest rather than a gate: a tenant-less operator has no
membership row to prove, so the resolver refuses. An operator switched into a tenant is the Agency ✓
case (§51). Anon and `authenticated` cannot execute any of the three at all — service_role only.

**Why the read's fallback was deliberately not inherited (owner ruling, 2026-09-02).** Guessing the
earliest active membership is cheap for a roster read, which self-corrects on screen. An invitation
emails a live 7-day access token to a stranger and cannot be recalled. A guess is acceptable only
where a harmless read can self-correct, so the invite family takes the same refusal-only
expected-workspace token that member removal takes rather than a fallback designed for reads.

**PAIGE's workaround was deleted, not moved.** `inviteSeamBlocked` pre-read the raw pointer so that
at least her refusal named a true cause. With the cause gone it would have become the only thing
refusing an invitation that now succeeds — the same false refusal one layer further from the truth,
where the database can no longer falsify it. `teamSeamTenantMismatch` remains and still runs ahead
of every invitation act; it is what makes the workspace PAIGE names trustworthy.

**§61 default: no exception.** Distribution is unchanged from the Team seam rows above; this repairs
how an existing capability resolves its workspace and grants nobody anything new.

**Owed:** authenticated runtime proof. Authorized as immediate post-release owner acceptance
(2026-09-02) rather than a release blocker, and the surface stays **Authenticated Runtime Proof
Owed** until the owner confirms the live flow.

### PAIGE Mind — Pipeline deal-stage evidence, `/solo/{account}/growth` → deal → Ask PAIGE

**§66, same commit as the ship.** The first Mind binding: PAIGE states what a recorded Pipeline
stage outcome proves for a selected client, cites its opaque `rail:` reference, and refuses to
infer past it. Read-only. **SHIPPED 2026-09-02** — PR #747 merged as `dcddf6761e`, production-
deployed, and migration `20261041000000` persisted on prod ref `xygzykjyynhzqytbqnzu`. Read these
rows as live availability; read the truth label below as the capability's maturity, which is lower.
**The first row's entry path was broken and is now repaired (#765, PR #773 `f7fe9718`).** The
`paige:open` scope used to be released again immediately on any account holding a saved
conversation, so on every real account that row was reachable in code and not completable by a
person. Fail-closed throughout, and repaired 2026-09-02 along with three connected defects in the
same auto-resume. The repair is code-proven and mutation-tested; it does not by itself make the row
owner-completable evidence — see the UNVERIFIED note below.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|
| Point PAIGE at a deal's client (`paige:open`) | — (no Solo book) | — | ✓ | ✓ | ✓ | — | — |
| Read the Mind evidence (`get_pipeline_spine_evidence`) | ✓ | — | ✓ | ✓ | ✓ | ✗ 0 rows | ✗ EXECUTE revoked |
| Move/create/archive a deal from Mind or Chat | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**Agency is excluded, following the locked Pipeline row** (§61 exception, same reason: an Agency
manages sub-accounts, not its own client book). God holds no Solo client book either, so the deal
card is not its surface; the adapter still admits an operator caller, which is the dogfooding path
(§35) and not a second book.

**Client and Anonymous are denied at three independent layers**, not one: `EXECUTE` on the adapter
is revoked from `anon` and `service_role`; the adapter requires a live `auth.uid()` and a canonical
staff role; and direct `SELECT` on `paige_client_events` has been revoked from `authenticated`
since `20260712200000`. An ordinary tenant member who is not staff receives zero rows — proven by
`supabase/tests/paige_spine_foundation.sql`.

**The mutation row is a hard `✗` for every tier including God, and it is structural rather than a
policy.** No Chat tool is registered for a Pipeline write, so there is no approval channel to
argue with; the capability declares `classification: read`, `riskPolicyKey: read_only`,
`approvalAuthority: none`. The separately-scoped Pipeline Chat Write Bridge lane will need its own
Gate 1 before any of that changes.

**The client scope is an address, never a grant.** A deal card hands PAIGE a `client_id` only when
that client is already visible to the caller — the identifier is read off the visibility-filtered
clients join, so it is null exactly where the name is (`20261041000000`, mutation-tested in
`scripts/proof/pipeline-deal-client-ref-local-proof.sql`). The server then re-resolves tenant by
`current_user_tenant_id()` and re-authorizes the client by tenant equality before any read.

**UNVERIFIED at this ledger entry, after the release:** authenticated runtime on any tier, and
rendered proof at the four viewports. Both remain owed — and the missing authenticated drive is
precisely what left #765 undetected until a post-merge review found it. It is still missing after
the repair, so the same gap that hid #765 is still open. The post-merge persisted-apply confirmation
is **no longer owed** — it was taken on prod on 2026-09-02 and is recorded in the Master Project File
§4. **No tier row above has been driven by an authenticated session**; every ✓ and ✗ is proven by the
adapter's own grants, in-body predicates and contract tests, which is a weaker class of evidence than
a drive. The Mind binding is `PARTIAL`, not `LIVE`, and must not be represented otherwise.

### Platform metering — LLM usage, `meter_llm_usage` (no surface, operator-only seam)

**§66, same commit as the ship.** Paige's model spend is now carried from `paige_llm_trace` into
`platform_usage_events` as `llm_tokens` usage. This is a BACKEND seam with no tenant-facing surface
in this slice, so the ledger row records who may INVOKE it, not who may see it.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|
| Run the drain (`meter_llm_usage`) | — | — | — | — | — | — | — |
| …as `service_role` (Paige's own worker) | ✓ (service context only) | | | | | | |
| Read one's own usage rows | — (no surface yet) | — | — | — | — | — | 403 |

**Every human tier is a hard `—`, including God, and that is deliberate.** A tenant must never be
able to write their own usage records, and neither must an operator: the meter derives usage from
traces, and a hand-invocable meter is a hand-editable bill. `EXECUTE` is revoked from `PUBLIC`,
`anon` and `authenticated`, and the function additionally raises `42501` when `auth.uid()` is
non-null — so the guard survives a future grant that a migration adds by accident (§59: the grant is
never the guard). Proven by case P8 of `scripts/sql/meter-llm-usage-proof.sql`, which drives a real
`SET LOCAL ROLE authenticated` and asserts the refusal.

**No consumer surface exists yet, and none is claimed.** Nothing reads these rows today — no
dashboard, no invoice, no plan allowance. Recording usage is not charging for it, and the ledger
says so rather than letting a future reader infer that billing shipped.

**§13 — what the rows honestly contain.** `quantity` is tokens, measured. The cost is an ESTIMATE in
metadata, explicitly labelled, never promoted to a billing column, and **null on 197 of the first
228 rows** because those calls were never priced upstream. The key is always present so the absence
is stated. See the decision log entry for MET1.

### Workspace entry and containment — `/solo/*`, `/business/*`, `/agency/*`, `/choose-account`

**§66, same commit as the ship.** Owner ruling 2026-09-02: account choice happens at ENTRY, never
inside a workspace. This row records who may MOUNT each shell after the change, and — because the
defect that forced it was a person being placed in a mode they do not operate in — which tier each
route now refuses.

| Route root | Mounts | God | Agency | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|---|
| `/solo/*` | Solo shell | — (no tenant ⇒ held) | → `/agency/{n}` | → `/agency/{n}` | ✓ | → `/business/{n}` | — | → `/auth` |
| `/business/*` | Sub-account shell (`AgencyApp mode="subaccount"`) | — (no tenant ⇒ held) | → `/agency/{n}` | → `/agency/{n}` | → `/solo/{n}` | ✓ | — | → `/auth` |
| `/agency/*` numeric | Agency shell | unchanged | ✓ | ✓ | **unchanged — see below** | ✓ *(acting-child)* | — | unchanged |
| `/agency/*` non-numeric | Legacy board | unchanged | ✓ | ✓ | unchanged | unchanged | — | unchanged |
| `/choose-account` | Entry chooser | → `/admin` | ✓ | ✓ | ✓ | ✓ | — | → `/auth` |

**`/agency/*` is deliberately NOT gated, and that is a stated gap rather than an oversight.** A first
revision of this change gated the numeric leg too, and CI proved it destroyed a shipped capability
(§58): during an agency act-as, `activeTenant` becomes the CHILD while the operator's authority comes
from the parent, so a tier gate read `sub_account` and ejected the operator out of the
`/agency/{parent}/sub/{child}/…` path that exists to serve exactly that flow. The hole the gate was
reaching for — a Solo caller who TYPES `/agency/{n}` mounts the agency shell and is never sent home,
because `AgencyApp`'s own guard returns early when the caller owns no agency — is real, is reachable
only by typing a URL (nothing routes a Solo caller there), belongs to the Agency tier, and is tracked
separately rather than closed by a guess about agency behaviour.

**A `—` in the God column is a HOLD, not a refusal.** An operator with no active tenant has no tenant
classification, and the entries refuse to classify an unresolved caller at all: a null `activeTenant`
is "we do not know yet", not "tier solo". That distinction is load-bearing — `switchTenant` commits
the new active id before the tenant list refetches, so treating the gap as a tier would eject an
owner mid-switch out of a workspace they legitimately hold.

**Entry now ASKS at both doors, where it previously asked at only one.** A fresh sign-in already
routed a multi-context person to `/choose-account` (`Auth.tsx`, via `shouldOfferAccountPicker`). A
RESTORED session came through `/admin` and silently resumed whichever context `active_tenant_id` was
parked on — which is how an owner who expected their Solo workspace was placed in a sub-account left
behind by an earlier agency act-as (#806). `/admin` now applies the same shipped predicate. **This is
the one change here with cross-tier reach:** an agency or enterprise operator holding more than one
active tenant now sees the chooser on the `/admin` door too, where before they went straight through.

**THE FILTER THAT ACTUALLY SEALED THE RECOVERY PATH, found live rather than in review.** The owner,
locked into a sub-account, was sent to `/choose-account` and it bounced him straight back. Two of his
three workspaces are on `trial`, and the chooser, the exit control and the door each counted only
tenants whose status was exactly `active` — so he read as a one-workspace person, the picker decided
there was nothing to choose, and returned him to the context he was escaping. Production carries 8
`active`, 4 `trial`, 1 `canceled`. All three surfaces now count one shared population,
`enterableWorkspaces`, which excludes only workspaces that are genuinely gone and is written as a
DENY list so a status nobody anticipated cannot silently trap anyone again.

**A SEPARATE, PRE-EXISTING SETUP CYCLE IS NOT CLOSED BY THIS, and the distinction matters.** The
gate below adds no leg to it, but `RequireSetupComplete` holds a playbook-less Solo or sub-account
tenant on `/admin/marketplace` while `Admin`'s own shell gates are not path-scoped, so a CANARY-ON
tenant bounces between that path and its shell root forever. Measured on production: 4 tenants carry
the Solo canary, 4 the agency canary, and exactly 1 canary-on tenant has no playbook — a top-level
**agency**, which the setup gate deliberately exempts. So the defect is real in code and unreachable
in data today, and a Solo canary rollout (#790) is precisely what would activate it. Tracked as #826;
the fix touches a standing shell-ownership directive and wants an owner ruling.

**IT FIRES ON THE DOOR — the exact path `/admin` — AND NOT ON THE SUBTREE, which is the whole of a
confirmed infinite redirect.** `/admin/*` is a single route element, so a check in `Admin`'s render
body runs for every path beneath it, `/admin/marketplace` and `/admin/setup` included — the two paths
`RequireSetupComplete` deliberately exempts so a tenant can choose a playbook. A multi-context tenant
mid-setup then cycled forever (chooser → their workspace root → setup gate → `/admin/marketplace` →
chooser) and could never reach Setup to break out. Found by the §39 peer-gate, not by any test,
because nothing in the repository rendered `Admin` at all; `Admin.entryGate.test.tsx` is its first,
and three of its nine cases go red against the unscoped gate.

**`/admin` IS ALSO A DESTINATION, and every producer of it had to be inventoried (§37).** Two shipped
controls drill an agency operator into an authorized sub-account — `AccountSwitcher`'s row and
`AgencyBoard`'s card — and both call `agency_enter_subaccount(child)` and then
`window.location.assign("/admin")`. An agency owner is ALWAYS multi-context, because provisioning
gives them an active owner membership in every child they create, so the door would have intercepted
a drill-down that had already happened and sent them to the chooser instead of the child. Both
producers now record the entry before handing off: an act-as IS an explicit choice of operating
context. `actAsLanding.test.ts` guards the wiring at both: it fails if either drops the call, reorders it after
the hand-off, or passes the wrong child. It is a source-reading guard and cannot see a call made
unreachable, so it is a removal guard rather than a proof of runtime behaviour — stated here so the
row is not read as more than it is. A third producer, `AgencyApp`'s own `syncIntoChild`, records the
entry too; it stays inside the agency shell, so it never reached the door, but leaving one producer
out of the inventory is how the last two rounds went.

**The settlement record survives navigation, and its predecessor did not.** `hasEnteredWorkspace`
reads a session key written by the chooser before it leaves. It replaced a `?picked=1` URL marker
that survived exactly one navigation — any in-app link pushes a history entry with no query string,
so the first click anywhere re-armed the gate. The key is the TENANT ID, not a boolean: a context the
person did not choose re-arms the question by itself, which is the situation this whole repair exists
for. It carries no claim about what may be read — scope stays `active_tenant_id` behind its
membership trigger plus `current_user_tenant_id()` on every read — so it is a loop breaker, never a
grant. A `?picked=1` marker survives alongside it as a strictly SECONDARY signal covering the one
case the record cannot: storage that throws, where a canary-off tenant would otherwise bounce one hop
per click forever. The door is also compared case-insensitively, because React Router matches routes
that way and `/Admin` would otherwise walk straight past the question.

**The chooser leaves only when it has actually learned something.** A failed membership read is not
zero choices: it renders the error card and its Retry rather than navigating, which is what makes
that card reachable at all — an earlier revision navigated away on error and turned any transient
failure on one query into a redirect storm. And when there is genuinely nothing to offer, it settles
the door against the active context before leaving, because the zero-choice branch is exactly where
this page's membership query and the door's tenant-context count disagree.

**The chooser respects the per-tenant shell canaries (§57/§58).** `workspaceRootForTenant` returns a
root only when that tenant's own `solo_shell_enabled` / `agency_shell_enabled` is set, and only for a
LITERAL `standalone` account_type in the Solo case — both copied from the gates in `Admin.tsx`, which
promise to be byte-unchanged while those operator-set flags are unset. A flag-off tenant resolves to
null and enters inline at `/admin`, exactly as today. Without this the chooser would have handed the
un-canaried shell to tenants whose operator had not enabled it, and routed a freshly-provisioned
`account_type: null` tenant into the Solo shell — the case that gate rejects in as many words.

**Choosing a DIFFERENT workspace drops the previous one's identity and navigation state.** A full
page load already clears React state and the query cache; what survives is browser storage. **Three**
session keys named the OLD account rather than a preference belonging to the person — an impersonated
contact, a client-view latch, and a stashed OAuth return path, the last being literally a route back
into the previous workspace. All three are cleared when the chosen tenant differs from the active one;
re-picking the workspace you are already in changes nothing and discards nothing.

A fourth, `paige.activeBusinessId`, was in that list and was **removed after checking its owning
module**: `BusinessContext` selects by `owner_user_id`, so it names the PERSON, not the account they
were in. Clearing it would have been over-clearing justified by a comment that did not match the code
— the same class of mistake as prose asserting a protection, which is what this repair keeps being
caught by. Tenant-keyed values and pure cosmetics (theme, density, rail collapse) are likewise left
alone.

**No in-shell picker survives.** `MemberAccountSwitcher` — which listed every readable tenant with no
status filter and PERSISTED `active_tenant_id` on selection — is deleted; `WorkspaceExitControl`
replaces it in the Solo and legacy `/admin` shells and only navigates OUT to the chooser. **It is not
mounted in the sub-account shell**, whose account slot is pack-locked (§00, `src/agency/CLAUDE.md`)
and whose pack is silent on such a control; tracked as #808. So recovery from inside `/business/*`
depends on the entry rule above, not on a control in that shell — stated here rather than left for a
reader to assume the coverage is complete.

**Evidence class.** Every row is proven by component-level tests that drive the real entry with a
mocked tenant context and read the resulting router location, plus the pure rule's own unit tests —
`SoloEntry.test.tsx`, `BusinessEntry.test.tsx`, `ChooseAccount.test.tsx`, `workspaceEntry.test.ts`,
each proven red against the pre-change code. **No row has been driven by an authenticated session**,
which is a weaker class of evidence than a drive and must not be represented as one.
### Platform Billing — Foundation A seams (branch `claude/billing-foundation-a`, PR #816) — **NOT LIVE**
### Platform Billing — Foundation A seams (PR #816, merged `f455d8a5` 2026-09-03) — **LIVE**

**§66.** Nothing owner-visible ships in A (the Solo Billing screen is Foundation C, not built). What
changes per tier is the set of Paige-callable billing seams (§10) and who they refuse. **Migration
`20261045000000` is APPLIED on prod** — the version is in `supabase_migrations.schema_migrations`,
and the 3 tables, 12 functions, 6 policies and 4 triggers were queried directly on ref
`xygzykjyynhzqytbqnzu` (2026-09-03), so the rows below are shipped truth, not a design claim. They
were also proven pre-merge inside `BEGIN … ROLLBACK` (64/64 properties, 5/5 mutants caught).

**§13 correction, 2026-09-03:** this block said `20261047000000` — PR #827 renamed the version
inside it to its own migration while editing the file. Foundation A's migration is `20261045000000`;
`20261047000000` is the invitation slice. Corrected here rather than left to mislead the next reader.

**Still not live, deliberately:** `PLATFORM_BILLING_PORTAL_ENABLED` is not flipped, so the portal row
below refuses every caller `not_enabled` regardless of tier until an authenticated owner drive lands.

| Capability | God | Agency | Enterprise | Solo Owner | Solo Admin / Member | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|---|
| `get_workspace_billing_authority()` (the one read; never a Stripe id) | `scope=none` (act-as pointer with no seat resolves to nothing) | `scope=agency`, everything `not_applicable` | `scope=enterprise`, `not_applicable` | `can_manage_billing` / `can_view_billing` = true; mapping state absent / ambiguous / mapped | false / false; state still truthful | `scope=sub_account`, `not_applicable` | non-owner path (false) or `scope=none` | EXECUTE revoked |
| `platform-billing-portal` (hosted Stripe portal, flag default OFF) | `no_active_workspace` | `not_applicable_scope` | `not_applicable_scope` | the only allowed caller (and only when `mapped`, flag on, keys named) | `owner_only` | `not_applicable_scope` | `owner_only` / `no_active_workspace` | 401 |
| `platform_billing_contact_designate` / `_revoke` (primary billing contact = verified current Owner; billing delegate = verified current Admin) | `no_active_workspace` | `billing_not_applicable` | `billing_not_applicable` | ✓ (Owner-only, audited) | `billing_workspace_owner_only` | `billing_not_applicable` | `billing_workspace_owner_only` | EXECUTE revoked |
| `get_workspace_billing_contacts()` (Owner-only view; no email column) | `no_active_workspace` | `billing_not_applicable` | `billing_not_applicable` | ✓ | `billing_workspace_owner_only` (never an empty set) | `billing_not_applicable` | `billing_workspace_owner_only` | EXECUTE revoked |
| `platform_billing_paid_activation_ready(tenant)` (R19 gate; **no caller yet**) | ✓ (operator) | 42501 | 42501 | 42501 | 42501 | 42501 | 42501 | EXECUTE revoked |
| `platform_billing_account_reconcile()` (backfill; ambiguous/shared RETURNED, never inserted) | ✓ (operator / service) | 42501 | 42501 | 42501 | 42501 | 42501 | 42501 | EXECUTE revoked |
| Tables `platform_billing_accounts` / `_contacts` / `_notification_log` (direct SELECT) | operator read (RLS) | 0 rows | 0 rows | 0 rows | 0 rows | 0 rows | 0 rows | no grant |

**Receive / view / manage are three permissions, enforced separately.** A billing delegate reads
`receives_billing_notices=true` and nothing else; `can_view_billing` / `can_manage_billing` stay
Owner-only. **No delivery exists:** "receives" means designated, not delivered to. **Neither
designation creates, changes, transfers, implies, or records legal ownership, equity, corporate or
trust ownership, trustee or co-owner status** (owner ruling R27, 2026-09-02).

### Platform Billing — Foundation C, the Solo Billing screen (PR #833) — **BUILT, NOT MERGED**

**§66.** Foundation A's seams had no renderer. Foundation C mounts them. The row below records what
each tier SEES on `Solo Settings › Billing` once this merges; until it does, the shipped surface is
still the pre-C tab, which rendered the plan CATALOGUE price for every workspace.

**The §13 correction this slice makes.** The shipped tab joined `get_tenant_platform_subscription()`
to `platform_subscription_plans` and rendered `Solo · Active · $149.00/month · Renews 5 Aug 2027`.
All four live `platform_subscriptions` rows carry a NULL `stripe_customer_id` AND a NULL
`stripe_subscription_id`; three are `test_seed: true` and the fourth is `revenue_class:
promotional`, `provider_state: not_created` (queried on ref `xygzykjyynhzqytbqnzu`, 2026-09-03). A
catalogue row is a price LIST. The catalogue is no longer an input to this screen.

**Not yet reachable, and why.** Promotional, trial and paid states exist in the resolver but cannot
be reached, because the entitlement projection that would prove them is **Foundation B** (Gate 1
packet §4.3 R11). Until B lands, a top-level Solo workspace resolves to `billing-unavailable ·
no_billing_account`. R13 binds: absence of a record is never inferred as a promotional grant.

| Capability | God | Agency | Enterprise | Solo Owner | Solo Admin / Member | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|---|
| Plan card | `plan-no-workspace` (act-as pointer, no seat) | `plan-unsupported` | `plan-unsupported` | `billing-unavailable · no_billing_account` today (mapped + projection ⇒ the paid/trial/promo states, Foundation B) | **`role-refusal`** — R22 makes VIEW a permission of its own, and the server publishes `can_view_billing` Owner-only in A. (**§13 correction:** this row first read "same state as the Owner — the plan is not a secret", which recorded a deviation from R22 that no owner ruling supports.) | `plan-subaccount` ("not because there is no plan") | `plan-no-workspace` | route not reachable |
| Manage billing (portal entry) | `portal-not-applicable` | `portal-not-applicable` | `portal-not-applicable` | `portal-unavailable` today (flag off AND no mapping); `portal-entry` only when `mapped` | `role-refusal` | `portal-not-applicable` | `portal-not-applicable` | — |
| Billing contacts and notices | refusal state with its reason | `billing_not_applicable` | `billing_not_applicable` | ✓ designate / revoke, and the list | the refusal is rendered as a refusal, never as "there are none" | `billing_not_applicable` | `billing_workspace_owner_only` | — |
| Candidate list (`get_solo_team_workspace`) | not read | not read | not read | read ONLY when `can_manage_billing` | **not read** (§9 least privilege) | not read | not read | — |
| Usage & limits | shown (`UNAVAILABLE`) | shown | shown | shown | shown | shown | shown | — |
| Client-billing pointer | shown | shown | shown | shown | shown | shown | shown | — |

**How each row above is evidenced, so a reader can tell proof from inference (§13).** The Solo Owner
and Solo Admin/Member columns are **rendered** (`scripts/live-drive/settings-billing-drive.mjs`,
116/116 across 4 viewports × 2 palettes + the failed-read and read-only worlds). Every scope column —
God, Agency, Enterprise, Sub-account — is **proven at the resolver** by the scope enumeration in
`src/solo/billing-contract.test.ts`, not rendered. The God row's `plan-no-workspace` additionally
**infers** that `billing_active_tenant_id()` returns null for an act-as pointer with no seat; that is
Foundation A's proven behaviour, not something this slice re-tested. **Authenticated runtime on the
deployed surface: OWED** — the harness transport is a stub (§32.c). **Also owed: a Gate-1 pass on the
billing-contacts card**, which the approved Gate-1 prototype does not cover (§00).

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

## Setup legal sender identity — draft placement (2026-09-01)

The editable surface added by this draft is Solo Setup only. It resolves the active tenant on the
server, synchronizes owner-confirmed legal sender facts into that tenant's canonical legal profile,
and exposes only masked registration-number state on reload. This does **not** make the form reachable
from Agency, sub-account, Enterprise, pure-client, or platform-operator surfaces. Those tiers may
later consume or administer the same canonical record only through a separately approved flow.
The platform operator's master-account Primary Customer Profile is distinct from every tenant's subaccount Secondary Customer Profile.
