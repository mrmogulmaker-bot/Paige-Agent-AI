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
| `connections/registration` | Carrier (10DLC) registration: **PAIGE drafts the regulatory copy**, **the reviewed copy is saved**, and **the business facts blocking the filing are editable here** — a second EDITOR of the one canonical record, not a second record. Setup still owns the full record and its own five-subtab surface | **partly wired** — `comms-a2p-draft` (a real model call) and `comms-a2p-submit` (save only) both run; **filing with a carrier does not exist** and the surface says so rather than reporting a submitted state it cannot produce. The business-record editor writes through `save_solo_business_context`, the same seam Setup uses, so the two surfaces cannot disagree (§57); it is Owner-only and mounts the canonical adapter only when opened. The four carrier-required representative identity columns are **derived** by `sync_a2p_representative_identity` (20261201000700) — before it, no writer populated them and brand filing could never start. The grading ladder stays in `communications`; this area holds the acts (§18) | N/A | N/A | ✓ | N/A | — |
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

### The Solo shell — Settings › Integrations › Automations, `/solo/{account}/settings/integrations/automations`

**A separate destination from Connections.** `SoloSettings` defines Connections and Integrations as
distinct surfaces (`settings.tsx:1454,1584`), and the Zapier view is a leaf of the Integrations
sub-tab (`settings-integrations.tsx:728-744`), reached at `/settings/integrations/automations`. The
retired standalone `/settings/automations` page redirects here rather than 404ing
(`SoloApp.tsx:177-184`), so an existing bookmark keeps working. Recording it under Connections would
name a route that does not exist.

Same Solo-shell reasoning as the Connections section above: sub-accounts reach their workspace
through `AgencyApp`, so the sub-account column reads N/A as a routing fact, not a tier exclusion.

Legend as above: **✓** live · **—** not built · **N/A** tier not opened yet.

| Segment | What it is | State | Operator | Agency | Solo | Sub-account | Client |
|---|---|---|---|---|---|---|---|
| `integrations/automations` (Zapier) | **Two independent connections behind one card**, on the accepted n8n tab pattern: an **API connection** (owner OAuth to Zapier's own API, read-only scopes) and **Paige tools (MCP)** (owner OAuth to Zapier's MCP server, per-tool approval, revocation, Zapier-scoped recent activity), plus a tenant-bound **Skool intake route** | **wired, and truthfully unavailable in part** — `tenant-zapier-api-connect` and `tenant-mcp-connect` both run; MCP tools are invisible to PAIGE until specifically approved, and an approval pins the tool's input schema **and** its authority (connected app, action type, effects), so a provider that moves a tool to a different account or turns a read into a send fails closed until re-approved. PAIGE drives it through the governed `zapier_list_actions` / `zapier_run_action` seam with Rail attribution; unknown effects fail closed as write authority. Intake resolves its tenant **only** from the route token, stores the payload encrypted and the token as a hash, and refuses a changed-payload key reuse. **The API tab renders `capability unavailable` on production** because `ZAPIER_API_CLIENT_ID`/`_SECRET` are not configured there — that is the honest state, not a failure. A live provider authorization and a real Skool payload proof are still owed (§32.c) | N/A | N/A | ✓ | N/A | — |

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

### Rail history, per tier — SHIPPED 2026-09-03 (Slice B, §66)

The owner-facing Rail feeds — "Across your clients — live" (`PaigeRailFeed`), the Solo Trust Compass
and Team activity panels (`useSoloActivityFeed`), and the client portal's "Your activity"
(`ClientActivityFeed`) — read the **deployed resolvers** rather than `paige_client_events` directly.
Frontend-only: no migration, no new grant, no policy change.

**Read the previous row of this table first, because the delta is the point.** Before this ship,
`has_table_privilege('authenticated','public.paige_client_events','SELECT')` was — and still is —
`false` on production, so the tenant Rail history read was **refused for every tier**, and two of the
four surfaces rendered that refusal as *"nothing yet"*. The ✓ below is a capability that existed on
paper and reached nobody.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Reads own-workspace Rail history (`get_solo_rail_activity`) | ✓ (operator) | ✓ (owner/admin/coach of the active workspace) | ✓ (same) | ✓ (same) | ✓ (same — its OWN rail, never the parent's) | — | 403 |
| …**previously** reachable through the direct table read | — | — | — | — | — | — | 403 |
| Reads own-workspace Rail history via a role held in ANOTHER workspace | — | — | — | — | — | — | 403 |
| Reads a client's Rail (`get_client_rail`, client lens) | ✓ (operator) | staff of that contact's own tenant | same | same | same | own contact only | 403 |
| A refusal is reported as a refusal, never as an empty feed | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (as "could not be loaded", without naming how access is decided) | 403 |
| A previous workspace's activity can paint after a switch | — | — | — | — | — | — | 403 |

**The third row is the §59 correction, and it is the only access this ship REMOVES (§58).**
`pce_staff_read` combines a tenant-agnostic `has_any_role()` with `current_user_tenant_id()`, which
honours `active_tenant_id` for an active `tenant_members` row at **any** role. A plain member of
workspace B holding a global `coach`/`admin` role earned in workspace A could therefore have read
B's whole tenant Rail — had the table grant not already made the read moot. The resolver requires an
active `tenant_members` row **of the resolved workspace** at owner/admin/coach. The policy is
unchanged and still carries the trap; it is simply unreachable from these four consumers. Other
direct readers still go through it — the two Analytics surfaces, tracked as **#802**.

#### Agent attribution and workspace-level activity — SHIPS WITH PR #925 (§66)

**Read the marks before the rows. `◻` is not `✓`.**

`◻` means the READ supports it and **nothing writes it yet** — capacity, not behaviour. Every
tier below therefore sees *nothing* today, and will keep seeing nothing until a producer passes
an acting agent. Ticking `✓` here would claim a capability the PR body itself says nothing can
produce, which is the drift §66 exists to stop.

**Recorded as PENDING, not as shipped.** The migration applies to production through
`deploy-migrations.yml` on merge to `main`; until that runs and `db-live` moves, these rows describe
what the PR delivers, not what a tenant can do. The §32.a persisted-apply confirmation is owed after
merge. Ticking these early would be the same lie as a fabricated metric.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Rail history names the ACTING AGENT (`get_solo_rail_activity` gains a 12th column, `actor_agent`) | ◻ (operator) | ◻ | ◻ | ◻ | ◻ (its OWN rail) | — | 403 |
| …but only where the agent has a tenant-safe name (`paige_subagents.rail_display_name`) | ◻ | ◻ | ◻ | ◻ | ◻ | — | 403 |
| Sees the name of an agent belonging to ANOTHER workspace | — | — | — | — | — | — | 403 |
| Rail carries workspace-level work with no contact (`game_plan` · `system_check` · `agent_config` · `agent_run`) | ◻ (operator) | ◻ | ◻ | ◻ | ◻ (its OWN) | — | 403 |
| Writes a Rail event naming another workspace's agent | — | — | — | — | — | — | 403 |

**Row 2 is the §11 line, and it is deliberate.** `rail_display_name IS NULL` means an agent has no
name a business owner should read. Ten of the twenty-four enabled agents on production are our own
build-crew seats — `Review — Compliance Officer`, `Review — Doctrine Sentinel`. Their work is
recorded by slug for operator audit and shows a business owner nothing. The backfill is written as
an EXCLUSION, so a NEW platform agent defaults to not being named.

**Rows 3 and 5 need BOTH a write guard and a read guard, which is why they are two rows.**
`paige_subagents.slug` is globally unique and `tenant_id` is nullable, so a foreign key proves
existence and not tenancy. The writer refuses a foreign slug with the same error it gives an unknown
one, so the response cannot be used to enumerate another workspace's agents. The reader re-checks,
because `tenant_id` is updatable: a platform default later assigned to a tenant would retroactively
turn legally-written rows foreign, and no write-time check can reach back through history.

**One capability this ship RESTORES rather than adds (§58).** The `surface` CHECK on
`paige_client_events` never admitted `'form'`, but `growth-process-submission` has always passed it.
Every Rail write from the form pipeline has failed since that pipeline shipped. Solo and sub-account
tenants get form-submission events on their Rail for the first time — not a new capability, a
capability that was specified and never once worked.

**Sub-account row, stated explicitly because §51 exists for exactly this.** `get_solo_rail_activity`
takes **no tenant argument**; it resolves the workspace server-side. A sub-account therefore reads
ITS OWN Rail and can never receive the parent agency's aggregate, and there is no parameter through
which a caller could ask for one.

**Solo reachability, corrected 2026-09-03 (§66 — the row below is what SHIPPED, not what was planned).**
The `get_solo_rail_activity` row above says every tier may READ its own workspace rail. It did not
say which tiers had a SURFACE showing it, and those were different answers:

| Tenant-wide rail SURFACE | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| `PaigeRailFeed` ("Across your clients — live") | ✓ | ✓ | ✓ | **—** (shell never mounts it) | ✓ | — | 403 |
| Trust Compass "Working now" · Team → Activity | ✓ | — | — | ✓ | ✓ | — | 403 |
| **Solo Command Center → Systems Check → "Recent activity"** (new) | ✓ | — | — | **✓** | **✓** | — | 403 |

### Systems Check — the operating-readiness console (SHIPS WITH PR #928, §66)

The radial "evidence moving through the business" treatment is REASSIGNED to Trust Compass by owner
ruling; Systems Check becomes the five-part console. Same tiers, same reads, same RLS — this changes
what the surface SAYS, not who may see it.

| Systems Check console | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| The five-part console (attention · ready · nine areas · rail · who-does-what) | — | — | — | ✓ | ✓ | — | 403 |
| Business-area grouping instead of the raw `domain` enum | — | — | — | ✓ | ✓ | — | 403 |
| Plain check titles instead of the registry's `check_name` | — | — | — | ✓ | ✓ | — | 403 |
| Per-item next action into the owning surface | — | — | — | ✓ | ✓ | — | 403 |
| Approve / dismiss a held approval (unchanged seams) | — | — | — | ✓ | ✓ | — | 403 |
| Operator lens (`src/operator/surfaces/SystemsCheckSurface.tsx`) | ✓ | — | — | — | — | — | 403 |

**God is `—` on every console row deliberately.** `CommandHub` is the Solo shell; the operator reads
its own tenant-less lens through `useSystemsCheck("operator")`, which this slice does not touch.

**What did NOT ship here, stated so the ledger is not read as more than it is:** Refresh still
re-reads the last recorded run and says so — an on-demand re-check is NOT wired. `systems_check_snapshot`
is still latest-RUN only, so a Setup save still narrows the reading and remediation actions filed
against older runs remain unreachable on every tier. Only three of the eight status words
(`LIVE`, `NEEDS ATTENTION`, `UNAVAILABLE`) can be produced from the finding store; `PENDING PROVIDER`
and `PAUSED` require the provider result contract and are NOT rendered by this surface yet.

**Six of the nine areas are covered by a check; three are not** (Paige's team, the Mind, security).
Those three render "Not checked" with a reason rather than a status, on every tier that sees them.

`PaigeRailFeed` lives inside `PaigeWorkspace`, which `TenantCommandCenterShell` renders only when
the Solo workspace is absent — and the Solo shell always supplies it. So a Solo tenant had no
tenant-wide rail surface at all.

> **§13 CORRECTION, 2026-09-03, same day — the claim above is WRONG and is kept, marked, rather
> than rewritten (§58).** "A Solo tenant had no tenant-wide rail surface at all" is false, and it
> contradicts the table in this same edit. `TrustCompass` IS mounted on Solo (`SoloApp.tsx:253`)
> and its panel calls `useSoloActivityFeed` (`compass.tsx:469`); so does Team → Activity
> (`team.tsx:233`). Both read `get_solo_rail_activity`, which is the TENANT-WIDE reader. So Solo
> already had two tenant-wide rail surfaces before this slice.
>
> **What was actually true, stated precisely:** `PaigeRailFeed` — the specific strip Slice B
> repaired — is unreachable on Solo, and the Command Center, Solo's DEFAULT LANDING route, carried
> no Rail surface. The panel's real value is putting the rail on the surface a Solo owner lands on,
> not making a previously-invisible capability visible.
>
> Caught by an independent review on #877 (P2), after merge. The overstatement had been repeated
> into the master reference, this record, the tier matrix, the PR body, the commit message, and the
> report to the owner — one unchecked claim propagated to six places because it was written once and
> then copied rather than re-derived. Corrected in all of them.
 The new panel closes that on the Solo shell, which sub-accounts
also reach once `/business` mounts `SoloApp` (sequenced separately — until then a sub-account
reaches it through the shell it actually renders).

**`UNVERIFIED` — authenticated owner runtime proof.** Every row above is from the deployed function
bodies, the production grant catalog, and automated tests. No browser drove these surfaces as a
signed-in owner on any tier in this session; #746 stays open until that proof exists.

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

**§66 — `SHIPPED`. Corrected 2026-09-03 from the "NOT YET RELEASED" wording this row was first
written under, which promised it would be resolved rather than left ambiguous.** #815/#827 merged and
`deploy-migrations.yml` applied the migration on the push to `main`. Read back from production
2026-09-03: `supabase_migrations.schema_migrations` contains `20261047000000`, and
`to_regprocedure('public.solo_team_invite_authority(uuid,uuid)')` is non-null.

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

**§66 — `SHIPPED` (#856, merged `197a10e2`).** Corrected `20261107000000` (the headline ordering) is
now confirmed persisted on production, not just merged. The reason the correction was needed is
itself the lesson: #850 was marked ready for review and merged in the same beat, so the independent
review had no window to run before the merge — its five findings, three of them real defects in
shipped code, landed on an already-merged PR. §39 says a green CI never waives the peer-gate; this
waived it by sequencing. #856 was driven differently on purpose: CI confirmed green first, THEN
marked ready (not merged in the same beat), and the review was requested explicitly on the exact
head that merged (`4a381b6a`) — reviewed clean before the merge, catching one more real defect on
the way (the expiry-verb fix below shipped a mirror-image bug in its first attempt, caught by that
same review, fixed, and re-reviewed clean on the corrected head).

Read back from production 2026-09-03: `schema_migrations` contains `20261107000000`;
`get_solo_team_workspace`'s delivery LATERAL orders by
`public.email_delivery_rank(l.status) DESC, l.created_at DESC` (rank first) and the old
`created_at DESC` first-clause is gone; `handle-resend-webhook` redeployed ACTIVE at version 7
(up from the version 3 that shipped with #850). The corrections:

| Finding | What was wrong | Fixed by |
|---|---|---|
| `email.sent` insert | `idx_email_send_log_message_sent_unique` is UNIQUE on `message_id WHERE status='sent'`, and the sender already writes that row — so every inbound `email.sent` violated it, answered 500, and Resend would retry for ever. Triggered by the single act of subscribing to `email.*`. | webhook returns 200 `already recorded` on `23505` |
| origin lookup | supabase-js returns `{data:null,error}` rather than throwing; the error was discarded, so a transient failure answered 200 and the event was lost permanently | `error: originError` destructured, 500 before the absent-row branch |
| headline status | ordered `created_at DESC` first with rank a mere tiebreak, so a retried `delivered` arriving after `opened` walked the display backwards. `created_at` is OUR insert time, never the provider's event time. | `20261107000000` — rank first, `created_at` second |
| "Not sent yet" | a false claim about every invitation emailed before this feature existed, which has no log row because the old sender never wrote one — including the owner's own revoked one | "Delivery not recorded" |
| "expired" verb | keyed on `finished`, which is true for accepted and revoked rows that routinely still have a future expiry | keyed on the `expired` state |

**Owed:** authenticated runtime proof — unchanged by this correction. Authorized as immediate
post-release owner acceptance (2026-09-02) rather than a release blocker, and the surface stays
**Authenticated Runtime Proof Owed** until the owner confirms the live flow. The one thing that DID
change: the owner is now unblocked to register the Resend webhook and set `RESEND_WEBHOOK_SECRET` —
doing so against the pre-#856 code would have made every `email.sent` event fail permanently and
retry for ever (finding #1 above).

### Solo Team — an invitation says what happened to it, `/solo/{account}/settings/team`

**§66 — `SHIPPED`.** #850 merged as `f85115e9`. Corrected from the "NOT YET LIVE" wording this row
was first written under, on the evidence below rather than on the merge succeeding. Read back from
production 2026-09-03, with the grant checks carrying their own control so the measurement is known
to work:

- `supabase_migrations.schema_migrations` contains `20261105000000` — it landed as a BACKFILL, since
  #810 had already put `20261106000000` on prod while #850 was in flight. `supabase db push
  --include-all` applies a version numbered below ones already applied; this row is the proof it
  actually did, rather than being silently skipped.
- `archive_solo_team_invite(uuid,uuid,uuid)` and `email_delivery_rank(text)` both non-null.
- `tenant_invite_tokens.archived_at` exists; the `email_send_log` status CHECK now admits `clicked`.
- EXECUTE on the archive function: `anon` false, `authenticated` false, **and** the control —
  `get_solo_team_workspace` to `authenticated` — true, so the two refusals measure something.
- `handle-resend-webhook` deployed ACTIVE at version 3 (superseded by version 7 under #856, above).

**The report.** A revoked invitation stayed on the operator's list for ever with no action on it, and
no stage of any invitation could be answered — sent, delivered, opened, clicked were all unknown.

**What was actually wrong.** `send-portal-invite` returned `emailed: res.ok`, which is "the POST was
accepted", and never read the response body — so Resend's message id, the only handle by which a
later event could be matched, was discarded on every send. And a finished invitation had no exit:
`revoke` set the state and the row stayed, because there was no archive path and, deliberately, no
delete path.

**The repair.** The send is logged to `email_send_log` with the message id and `metadata.invite_id`.
A new `handle-resend-webhook` edge function verifies Svix signatures and **appends** one row per
delivery event, deriving `tenant_id` from our own originating row rather than the payload. The Team
screen renders the four-step trail and a status line, and a finished invitation can be archived into
a collapsed *Past invitations* drawer — never deleted, because a revoked invitation is evidence that
somebody's access was withdrawn, the same reason #799 removed the browser roles' `DELETE` on the
sibling membership table.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|
| See an invitation's delivery trail | — | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Archive a finished invitation | — | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Archive a still-live invitation | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| Archive an invitation on another workspace | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| Delete an invitation outright | — | — | — | — | — | — | — |

Distribution is unchanged from the Team seam rows above, so **§61 default: no exception** — this adds
reporting and a clearing action to an existing capability and grants nobody anything new. The God
`—` is the same honest resolver refusal, not a gate: `archive_solo_team_invite` reuses
`solo_team_invite_authority(_actor, _expected_tenant_id)`, which needs a membership row to prove. Anon
and `authenticated` cannot execute it at all — `REVOKE`d, service_role only.

**One shared table extended, owner-approved.** `email_send_log`'s status CHECK was read live and
widened additively from `pending, sent, suppressed, failed, bounced, complained, dlq` to also accept
`delivered, delivery_delayed, opened, clicked`. Every pre-existing status still inserts, and the
constraint still refuses an invented status — both asserted in `solo_team_invite_lifecycle.sql`
rather than inspected.

**Owed, and it is a genuine external dependency, not a deferral.** `send-portal-invite` attempts to
log every send — the webhook plays no part in that — so the trail is not gated on it the way this
paragraph first said. What IS gated: until the webhook endpoint is registered with Resend and
`RESEND_WEBHOOK_SECRET` is set, a new invitation's delivery never progresses past **"Sent"** (or
"Failed", for a send the provider or transport rejected), because nothing writes the
delivered/opened/clicked rows. **"Delivery not recorded"** — corrected from "Not sent yet" by #856
— is a *different* state: it means no send row exists at all. That is EXPECTED for every invitation
emailed before #850 shipped logging; it is also POSSIBLE, though rare, for one sent after, because
`logSend`'s own insert can itself fail (RLS, a constraint, a transient PostgREST error) — supabase-js
returns that as `{error}` rather than throwing. A second Codex pass on THIS correction, on the exact
head that fixed the first one, caught the overstatement: #857 also hardens `logSend` to log that
failure loudly (`console.error`) rather than swallow it, so the gap is now visible when it occurs,
never that it is closed. Both webhook actions are owner actions — one an external production
configuration change, one a credential. Until they are done the webhook refuses every event **by
design** (it fails closed rather than trusting an unsigned payload). Archive, revoke and resend do
not depend on it. The surface stays **Authenticated Runtime Proof Owed**.

**Owner-confirmed, 2026-09-03 — the SEND leg only, named precisely so it is not read as more.** The
owner sent a real Solo Team invitation and confirmed the recipient received it in her actual inbox.
This is genuine authenticated runtime proof of `create_solo_team_invite` → `send-portal-invite` →
Resend → a real mailbox — the leg #850 was built to fix (Resend's own `res.ok` used to be reported
as delivery). It does **not** confirm the parts it did not exercise: the recipient was already a
platform user, so the new-account accept-invite path (a stranger with only a token creating an
account) is still unexercised; and delivery TRACKING (Sent → Delivered/Opened/Clicked) still cannot
be observed by anyone, including the owner, until the webhook + `RESEND_WEBHOOK_SECRET` from the
paragraph above are configured — so this confirmation cannot and does not extend to that state
machine at all. The surface stays **Authenticated Runtime Proof Owed** for those two legs; only the
send leg moves to confirmed.

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

### Platform Billing — Foundation C, the Solo Billing screen (PR #833, merged `11997dac` 2026-09-03) — **RELEASED**

**§66.** Foundation A's seams had no renderer. Foundation C mounts them. The rows below record what
each tier SEES on `Solo Settings › Billing` **as deployed**. Released under the owner's MVP release
cadence (2026-09-03) with ordinary checks green: `verify` and `audit` success on the exact head,
Vercel deployed, Supabase Preview skipped because the slice carries **no migration**. Status is
**PARTIAL / Authenticated Runtime Proof Owed** — see the owed list below.

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
| Manage billing (portal entry) — card renamed **"Payment method"** (owner, 2026-09-03; it no longer claims invoices, which are the tenant's instrument toward their own customers) | `portal-not-applicable` | `portal-not-applicable` | `portal-not-applicable` | `portal-unavailable` today (flag off AND no mapping); `portal-entry` only when `mapped` | `role-refusal` | `portal-not-applicable` | `portal-not-applicable` | — |
| Billing contacts and notices | refusal state with its reason | `billing_not_applicable` | `billing_not_applicable` | ✓ designate / revoke, and the list | the refusal is rendered as a refusal, never as "there are none" | `billing_not_applicable` | `billing_workspace_owner_only` | — |
| Candidate list (`get_solo_team_workspace`) | not read | not read | not read | read ONLY when `can_manage_billing` | **not read** (§9 least privilege) | not read | not read | — |
| Usage & limits | shown (`UNAVAILABLE`) | shown | shown | shown | shown | shown | shown | — |
| ↳ **superseded** by the AI usage entry below (allowance slice) — the card now states a real total; §58: upgraded in place, never removed | | | | | | | | |
| Client-billing pointer | **moved to Campaigns › Sales** (owner, 2026-09-03) — Billing is one direction of money only | moved | moved | moved | moved | moved | moved | — |

### Platform Billing — AI usage allowance, slice 1+2 (PR #854, merged `03d85474` 2026-09-03) — **LIVE**

**§66 correction (2026-09-03, caught while writing the entry below):** this row said **NOT YET
MERGED** and named a branch rather than a commit — stale from before PR #854 merged. Corrected here
rather than left to mislead the next reader (§13); this is exactly the drift §66 exists to catch.
It supersedes the `Usage & limits` row in the Foundation C table above, which recorded that card as
`UNAVAILABLE` on every tier.

**What changed.** The plan source now carries an AI allowance beside seats/contacts/SMS
(`platform_subscription_plans.included_ai_tokens_month` + `.ai_credit_token_ratio` — solo 5,000,000
tokens @ 1,000/credit = 5,000 credits; agency 15,000,000 = 15,000 credits; enterprise NULL, a custom
quote), and `get_workspace_ai_usage()` reads the EXISTING `platform_usage_events` meter
(`event_type = 'llm_tokens'`). No second meter was built. `platform_metered_events` is untouched —
it is the LAYER 3 pass-through and a different concern.

**Visibility only (D6/D7/D8).** Nothing here throttles, degrades, charges, or predicts. Exhausting
the allowance changes nothing, and the card says so. Enforcement, if it ever exists, belongs at the
action-bus policy clamp (§67), never on a Billing screen.

**Promotional, and labelled as such.** Every current workspace is promotional during beta. The card
reads "Promotional AI usage tracking" and does not present the reading as a purchased entitlement.
The revenue class comes from its own explicit record; an unclassified workspace is NOT inferred to
be promotional (R13).

| Capability | God | Agency | Enterprise | Solo Owner | Solo Admin / Member | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|---|
| AI usage card | `usage-no-workspace` (act-as pointer, no seat) | `usage-tracked` against the agency allowance | `usage-no-allowance` (enterprise allowance is deliberately NULL — a custom quote, never a zero) | `usage-tracked`: included, used, remaining, in credits AND tokens, with the period and its source named | **`usage-owner-only`** — R22 makes VIEW its own permission; a NULL total, never a zero | `usage-not-applicable` — the roll-up decision is unmade, so nothing is claimed either way | `usage-no-workspace` | EXECUTE revoked from `anon` |
| Allowance on the plan | reads all plans | agency 15,000,000 @ 1,000 | NULL (custom quote) | solo 5,000,000 @ 1,000 | same plan, refused view | plan not read for a sub-account | — | — |
| Per-workspace AI **cost** | **not shown anywhere, on any tier** | — | — | — | — | — | — | — |

**Why cost is absent on every tier, deliberately.** `paige_llm_trace` carries an `est_usd_total` of
$4.88 across 697 calls, but **632 of those 697 (91%) carry no cost at all**. That figure is a floor
of unknown distance from the truth. Cost attribution is an internal operator-observability backlog
item; putting an incomplete number on a tenant's Billing screen would be the same class of error as
the $149 catalogue price this workstream already removed.

**Evidence.** Migration proven against production inside `BEGIN..ROLLBACK`
(`scripts/sql/ai-usage-allowance-proof.sql`, 26/26 properties, 0 failures, nothing persisted).
Presentation proven directly (`src/solo/ai-usage-contract.test.ts`). Solo Owner, Solo Admin/Member
and the failed-read world are **rendered** in the harness
(`scripts/live-drive/settings-billing-drive.mjs`). Agency, Enterprise, Sub-account, God and Anon are
proven at the **resolver and the database**, not rendered. **Authenticated runtime on the deployed
surface: OWED** (§32.c) — and the migration's persisted-apply confirmation is owed on merge (§32.a).

**How each row above is evidenced, so a reader can tell proof from inference (§13).** The Solo Owner
and Solo Admin/Member columns are **rendered** (`scripts/live-drive/settings-billing-drive.mjs`,
116/116 across 4 viewports × 2 palettes + the failed-read and read-only worlds). Every scope column —
God, Agency, Enterprise, Sub-account — is **proven at the resolver** by the scope enumeration in
`src/solo/billing-contract.test.ts`, not rendered. The God row's `plan-no-workspace` additionally
**infers** that `billing_active_tenant_id()` returns null for an act-as pointer with no seat; that is
Foundation A's proven behaviour, not something this slice re-tested. **Authenticated runtime on the
deployed surface: OWED** — the harness transport is a stub (§32.c). **Also owed: a Gate-1 pass on the
billing-contacts card**, which the approved Gate-1 prototype does not cover (§00).

### Campaigns → Catalog → Offers — WRITABLE, `/solo/{account}/growth/catalog` (Slice 2B)

**§66, and late — this is the debt from merging without it.** Slice 2B merged as `cd9d2e21` and
this row is a follow-up rather than the same commit, which is the rule broken to record it. Said
plainly because the alternative is a ledger that quietly disagrees with production. (It is also,
as of `09691d1a` below, no longer the freshest fact about this surface — the six-finding fix
landed same-day, this time in the same PR/commit as the row update.)

**What a person can now do.** From an empty catalog, "Add your first offer" opens a slide-over
editor; a name is the only requirement; any offer-definition field (summary, description, kind,
etc.) left blank is written as NULL — never an invented value — but the on-screen wording is
per-field, not a uniform mark: a blank kind reads "Kind not stated", a blank summary/description
reads "No description written yet.", and the drawer's own fields read "Not stated" / "Not recorded"
(Codex finding, PR #860, round 2 — the prior wording claimed every blank field renders as the same
em-dash). The price line's own wording is narrower still (round 3): `priceLine()` returns "No price
stated" when BOTH presentation and amount are blank, "Contact for pricing" / "No price shown" for
the `contact`/`none` presentations, and the em-dash (`—`) only in the remaining case — a
presentation was recorded (`fixed`/`from`) but no amount was — so the em-dash is not a general
"unrecorded price" mark, it is that one specific gap. The price is a different *object* again with
a different clearing rule: setting it blank does not null `unit_amount` (non-nullable) — it sets
the row `active = false` and leaves the old figures stored. That is NOT invisible in the UI the way
the wording above might suggest (round 3 finding): the offer detail drawer lists every recorded
plan, active or not, appending "(inactive)" to a deactivated one with its old amount still shown —
only the *lead*-price line on the row/card filters inactive rows out. An existing offer is edited
from the drawer its row already opens, and moves through draft / active / paused / archived from
the same place. Archive asks first. The editor carries NO status control: lifecycle sits beside the
offer, so nobody publishes something by accident while renaming it.

**CLOSED 2026-09-03 (migration `20261131000000`).** The RPC-open gap every non-Solo row below used
to describe is fixed: both functions now read the caller's own `tenants` row
(`account_type`/`parent_tenant_id`) and refuse with `'the offer catalog is available to Solo
workspaces only right now'` unless it is literally `account_type = 'standalone'` with no
`parent_tenant_id` — the same strict test `isSoloStandalone()` already applies client-side, run
server-side against the authenticated tenant, never a client-supplied claim. Owner ruling: this is
a refusal to grant Catalog write access **by accident** while no approved surface exists for other
tiers, not a judgment that they can never have it — a future Agency/Enterprise/sub-account Catalog
experience needs its own product decision. Proven 10/10 in a rolled-back production transaction
(real Agency, sub-account, and a temporarily-relabelled Enterprise tenant, each refused; the Solo
owner's create/status-change path, cross-tenant write, client-tenant-claim bypass, and unauthenticated/
no-membership paths all unchanged). `tenant-product-upsert` (the legacy `/admin/setup` Storefront
panel's write path) had the same missing check and was flagged here as a SEPARATE seam,
deliberately out of this hotfix's scope. **CLOSED 2026-09-03, same-day follow-up.** Producer
inventory (§37) re-grounded on fresh `main`: `StorefrontPanel.tsx` is the only real caller, mounted
only by `SetupGeneral.tsx` at `/admin/setup/general`, reached via `SetupTabsLayout`. Tracing
`Admin.tsx`'s three flag-gated shell-takeover redirects (Solo, Agency/Enterprise, sub-account — each
conditioned on `soloShellEnabled`/`agencyShellEnabled`) confirmed a legacy `AdminLayout`/`Routes`
fallback renders whenever a tenant's shell flag is off, regardless of tier, and that fallback's
`general` route is gated only by `RoleGate allow={["admin"]} allowPlatformStaff` — a ROLE check,
never an `account_type` check. Given the already-established fact that 3 of 7 Solo tenants on
production lack `solo_shell_enabled`, the identical flag-gating pattern on `agencyShellEnabled`
makes it reachable from Agency/sub-account/Enterprise tenants too whenever their own flag is off —
the exact same class of gap the RPC hotfix closed, on a different seam. Fixed by adding the
identical literal `account_type === "standalone" && parent_tenant_id === null` guard (mirroring
`isSoloStandalone()`) to `tenant-product-upsert/index.ts`, immediately after the membership/role
check and before any `tenant_products` read or write, refusing with `solo_workspaces_only`. No
migration involved — this is edge-function TypeScript, not SQL; ships via the standard
`deploy-edge-functions.yml` CI path on merge to `main` (§24), not a manual MCP deploy. Static guard
proven in `catalog-offers.contract.test.tsx` ("refuses a non-Solo tenant on the legacy
tenant-product-upsert writer too"): asserts the guard text, its position after the role check and
before the first `tenant_products` write, and the exact refusal error code. The §38
destination-charge mirroring in this same file (Stripe Product/Price created on the **platform**
account) was investigated only enough to classify it — it is the tracked, live §38 violation (#458,
see the Sales row below) — and was **not modified** by this fix, per explicit task-brief instruction
to route rather than silently fold a provider-charge change into a tier-authority repair.

**Persisted apply — CONFIRMED on production 2026-09-03**, from real queries after merge `2240d066`
(PR #871), never from the pipeline reporting success:

```sql
select version from supabase_migrations.schema_migrations where version = '20261131000000';
→ 20261131000000

select p.oid::regprocedure as signature,
  pg_get_functiondef(p.oid) like '%Solo workspaces only%' as has_solo_only_guard
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('save_solo_offer', 'set_solo_offer_status')
order by p.proname;
→ save_solo_offer(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,timestamp with time zone,uuid) | true
→ set_solo_offer_status(uuid,uuid,text,timestamp with time zone)                                                    | true
```

| Tier | Can write an offer | Why |
|---|---|---|
| Platform operator (God) | ✗ refused, always | Was "refused unless also a tenant member" — now refused unconditionally unless that membership is on a Solo tenant, because the new tier guard runs regardless of who the caller is. An operator with a real owner/admin row on an Agency/sub-account/Enterprise tenant is now refused where they previously were not. |
| Solo owner / admin | ✓ | `is_tenant_admin()` inside the function body (§59), now followed by the literal Solo-only check — unchanged for this tier since it already satisfies both. |
| Solo member | ✗ refused, and the acts are OMITTED not disabled | A disabled control says "later"; the truth is "not your role". Unchanged by this migration. |
| Sub-account owner / admin | ✗ refused (was UI: ✗ · RPC: ✓) | `workspaceEntry.ts` routes `sub_account` to `/business/*` → `AgencyApp mode="subaccount"` → its own `./growth`, never `CatalogOffers` — the UI gap already existed. The RPC gap is now closed: `parent_tenant_id IS NOT NULL` refuses every sub-account, including a legacy `account_type='standalone'` one, before any row is touched. |
| Agency (as a tenant) | ✗ refused (was UI: ✗ · RPC: ✓ — an exposed gap) | `tierFeatures.ts` already excluded `CREATION_SURFACES` from `AGENCY_FEATURES`, and `/agency/*` never mounted `CatalogOffers`. The RPC gap this row used to document — no `account_type` check — is closed by the same literal comparison. |
| Enterprise (as a tenant) | ✗ refused (was UI: ✗ · RPC: ✓) | Routes to `/agency/*` alongside Agency, same absence of `CatalogOffers`. `ENTERPRISE_FEATURES` carries the `growth` feature bit (deliberately creation-capable, unlike Agency) — that describes eligibility for the Studio/creation surfaces generally, not this specific editor, and the guard makes no exception for it: Enterprise is refused the same as Agency until a dedicated Enterprise Catalog experience exists. |
| Client / Anonymous | ✗ | `REVOKE ALL … FROM PUBLIC, anon`, verified live: `anon_can_execute: false`. Unchanged. |

**Superseded same day by #863.** `cd9d2e21`'s delayed Codex review (see lessons-learned) returned
six real findings against the merged head — four P1, including a draft saved to the wrong tenant on
a workspace switch and an edit silently rewriting the *database* price under a Stripe-backed offer
while checkout kept charging the old figure (a real §38 divergence). All six verified against the
code and fixed in `09691d1a` (PR #863, migration `20261111000000`), which re-declares both RPCs —
`save_solo_offer` gained a 15th argument, `_price_id uuid`, and the stale 14-arg signature was
dropped in the same migration. The table above (who can write) is unchanged by the fix; what changed
is what a legitimate write is now permitted to do to an existing price.

**What #863 added on top of the write itself.** Editing an offer now targets the exact plan shown
(`_price_id`, not an assumed `sort_order = 0`) and refuses in-place to touch a price that already
carries a `stripe_price_id` or belongs to a deposit/instalment plan — the person sees why as a
`price_note`, never a silent no-op. `set_solo_offer_status`'s publish gate for `_next = 'active'`
(skipped entirely when `price_presentation = 'contact'` — "price on application" activates with no
price at all, by design) has TWO branches, and only one is unreachable today. On a
storefront-enabled tenant (0 in production, unreachable today, fixed anyway per §31) it requires an
active price with a `stripe_price_id` — checkout-ready. On every OTHER tenant, which today means
every real tenant, it takes the `ELSIF` branch instead: any active `tenant_prices` row is enough,
Stripe-linked or not — so a name-only draft with no price and no `contact` presentation simply
cannot move to `active` (Codex finding, PR #860, round 5 — the prior wording described only the
storefront branch, which is the one nobody currently hits, and omitted the one every tenant hits
today). The draft-tenant bug was a frontend fix: the client now sends the tenant the form was
opened against, not whichever tenant is current when Save fires.

**Persisted apply — CONFIRMED on production 2026-09-03**, from real queries after `09691d1a`,
never from the pipeline reporting success:

```
select version from supabase_migrations.schema_migrations order by version desc limit 1;
→ 20261111000000

select p.oid::regprocedure, p.prosecdef, has_function_privilege('anon',...), has_function_privilege('authenticated',...)
→ save_solo_offer(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,timestamptz,uuid)
    security_definer: true   anon: false   authenticated: true
→ set_solo_offer_status(uuid,uuid,text,timestamptz)
    security_definer: true   anon: false   authenticated: true
```

Exactly one `save_solo_offer` row exists — the old 14-arg signature's own `DROP FUNCTION` (carried
in the same migration) is confirmed gone, not just superseded. The first check, run before
`deploy-migrations.yml` had finished, still showed `schema_migrations` capped at `20261110000000`
— recorded again here because the empty-then-populated gap is the same fact every time, not a fluke
worth forgetting.

**Truth label: `PARTIAL` / Authenticated Runtime Proof Owed.** The schema is live and the surface
is rendered-proven, but nobody has signed into a real tenant and created an offer. `tenant_products`
is still empty on production, so first-use is the state every tenant sees.

**Evidence (at `09691d1a`).** 2666 tests / 191 files. Rendered: **523/523** across both palettes and
all four Solo widths, zero orphan processes. Five new checkout-safety guards each proven RED against
their own defect before being trusted; both RPCs re-proven against production's real schema inside a
rolled-back transaction, zero persisted afterward, including a deliberate sub-test proving the new
15-arg signature inherits `PUBLIC` EXECUTE by default until the migration's own `REVOKE` runs.

**The contradiction this slice did NOT settle.** The Catalog pack
(`super-admin-shell-v3/campaigns-catalog-sales-spec.md`) says "The state is derived, never chosen…
Do not expose a status picker", deriving state from price plus the channels an offer sells on. 2A
shipped, and the owner ruled, a RECORDED status whose `paused` is explicitly the state no derivation
can infer. Both cannot hold. That pack is the Platform Operator shell, so 2B implements the shipped
Solo model; the ruling is owed when the two catalogs converge, and belongs to the owner and Claude
Design, not here.

**Owed.** Price editing beyond the single lead price — 2A renders plans, tiers and instalments;
2B authors only one (though #863 made editing that one plan safe against the storefront/deposit/
instalment cases above). `tenant-product-upsert` still needs a `status` allowlist, a `currency`
allowlist, and cross-field validation of `kind` against `billing_interval` — its Solo-only tier
guard is now closed (2026-09-03, see above); these three remain genuinely owed. Whether a platform
operator acting on a tenant's catalog *should* write without a membership row (i.e. whether
`is_tenant_admin` should carry an operator bypass here the way other admin-facing RPCs do) is a
product decision, not a bug this row fixes silently — flagged, not resolved, per the table above.
**The agency/sub-account/Enterprise RPC gap this section used to describe is CLOSED** (migration
`20261131000000`, owner-briefed hotfix, 2026-09-03) — see the table above. Note the resolution is
narrower than either option this row used to weigh: the guard refuses **every** non-Solo tenant
(Agency, sub-account, AND Enterprise) rather than picking one `account_type <> 'x'` exception list,
because the owner ruling was "Solo is the only account type allowed... right now," not a
per-tier carve-out — closing the earlier draft's Enterprise-inclusion mistake (Codex, PR #860,
round 4) by refusing everyone uniformly instead of trying to name every tier to exclude.

**§13 correction (2026-09-03) — the visual-pass deferral above is superseded.** The owner explicitly
overrode §00 for this surface only: *"Claude design is probably not going to be a good option for us,
so can you go back in and start handling the designs for yourself... you know this area better than
anyone at this point."* CC then designed and shipped the premium-workspace visual upgrade itself
(layered card surfaces, tinted state pills, restrained header/canvas washes, drawer polish, hover/
focus/motion states — Catalog-local CSS/TSX only, `src/solo/catalog-offers.css` +
`src/solo/catalog-offers.tsx`, zero shared-token/shared-component changes, all six locked Campaigns
tabs and PR #881's container-query nav fix untouched). No Claude Design step ran; this is CC-authored
design under a scoped, one-time owner authorization — not the standing §00 posture, which remains the
default everywhere else. Flow-prototype (the mandatory pre-implementation prototype) preceded the
port; a throwaway state-switcher HTML artifact was built and reviewed against every required state
before any production file was touched.

### Platform Billing — truthful account status, items 1–3 (PR #865, merged `5ae7a34a` 2026-09-03) — **LIVE**

**§32.a persisted-apply confirmation, checked after merge, not assumed:** `supabase_migrations.schema_migrations`
on prod (ref `xygzykjyynhzqytbqnzu`) carries all three versions (`20261109040000`, `20261111050000`,
`20261120000000`). The created objects were queried directly and exist: `get_workspace_billing_status()`
present in `pg_proc`, 7 `payment_method_*` columns on `platform_billing_accounts`,
`trg_platform_billing_one_primary` present in `pg_trigger`. Also confirmed against real data: Mogul
Maker Academy's tenant row shows **2 live primary billing contacts right now** — the exact state the
new Selection-needed banner exists to name — so this is not a hypothetical fixture case, it is the
real workspace this rebuild was built for.

**§13 correction (independent review, PR #865):** this row said Slice A was "on `main`". It is
not — `20261109040000` was never merged separately; it shipped as part of PR #865's own branch
history alongside Slices B and C. All three applied together on that PR's merge. Corrected here
rather than left to compound the exact gap the review caught (see the finding below).

**What changed.** `get_workspace_billing_status()` (Slice A `20261109040000`; Slice B
`20261111050000` and Slice C `20261120000000`, in #865) is the new source for the Solo "Plan &
usage" card, REPLACING the mapping-gated `resolveBillingPlanPresentation` path recorded in the
Foundation C table above — that resolver could never show a real access state because Foundation
B's entitlement projection did not exist. It now does: `access_state` is read from
`tenant_revenue_classification` / `platform_subscriptions`, INDEPENDENTLY of provider mapping
(`platform_billing_accounts`, read via the same `platform_billing_layer1_customer_ids()` ambiguity
helper `get_workspace_billing_authority()` already uses). Slice B corrected a real bug in Slice A's
own first version, which had read provider mapping from the wrong table
(`platform_subscriptions.stripe_customer_id`, never populated by the real checkout flow). Slice C
corrected a second real bug: every top-level tenant (parent_tenant_id IS NULL) was classified
`scope='top_level'`, including Agency/Enterprise — now excluded via the same `account_type`
discriminant `platform_billing_account_top_level_guard` already enforces.

| Capability | God | Agency | Enterprise | Solo Owner | Solo Admin / Member | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|---|
| Plan & usage card | `status-no-workspace` (act-as pointer, no seat) | `status-unsupported` (Slice C: excluded by `account_type`, never `top_level`) | `status-unsupported` (same) | real `access_state` — today `status-promotional`: `Billed by PAIGE Platform`, `$0 due today`, provider-account readiness shown SEPARATELY (`not_created` today) | `status-role-refusal` (R22 — `can_view`=false from the server) | `status-subaccount` ("not because there is no plan") | route not reachable | EXECUTE revoked |
| Billing contacts — Selection needed | n/a (no book) | n/a | n/a | banner renders when `primary_selection_needed=true` (MMA's real state: two live primaries from before Slice A's trigger existed) | read-only, banner still shown if present | n/a | — | — |
| Seats / contacts usage | — | — | — | shown from the same status read, real counts | refused with the rest of the card | — | — | — |
| SMS usage | — | — | — | **omitted** — no sent-SMS source exists (`sms_used` stays NULL by design, never a fabricated zero) | — | — | — | — |
| Paid marketplace add-ons | — | — | — | shown only when the real count is nonzero | — | — | — | — |

**Not in this PR (sequenced next, per the brief's own ordering):** item 4 (live payment-method
connection — collecting a card, creating the Stripe customer only on explicit owner click, writing
the new `platform_billing_accounts.payment_method_*` columns from `stripe-webhook` only) and item 5
(the Spine-safe billing summary wrapper).

**A deploy-blocking sequential-apply defect, caught by `database-contract` CI and independently by
an Agent-based adversarial review (Codex substitute), fixed before merge.** Slice B's
`CREATE OR REPLACE FUNCTION get_workspace_billing_status()` inserted 5 new columns into the MIDDLE
of Slice A's `RETURNS TABLE` list; Postgres refuses that shape of REPLACE (`42P13`). No standalone
`\i`-one-file rollback proof could catch it, because the function never pre-existed in that
isolated transaction. Fixed with `DROP FUNCTION IF EXISTS` before the REPLACE; regression property
C1 added, which creates Slice A's real shape first, then `\i`s the real Slice B file.

**Evidence.** Slice A: 29/29 production rollback proof. Slice B: 10/10 (added C1 above), including
a property (C5) that reproduces the exact old-table bug shape before asserting the fix. Slice C:
4/4, including Agency and Enterprise fixtures. Frontend: `src/solo/settings-billing.test.tsx` +
`src/solo/billing-contract.test.ts`, 93 tests across the touched files, 1143/1143 across
`src/solo/`. A real bug was caught by the new tests themselves before merge: the field-builder
helpers built `[string,string]` tuples against a `{label,value}` object return type — TypeScript
did not flag it, every field rendered as empty text, the new tests failed for the right reason, and
the fix is in this same PR. **Authenticated runtime on the deployed surface: OWED** (§32.c) — no
browser-driving tool in this session; owed to the next capable session, same as the AI-usage slice
above.

### Platform Billing — payment-method connect + Spine billing evidence, items 4–5 (PR #870, **MERGED `cdea70ae` 2026-09-03; migration persisted-apply confirmed on production**)

**2026-09-03 P0 correction — FAIL / repair in progress.** The authenticated owner attempt failed before hosted setup. `STRIPE_SECRET_KEY` is present; missing-secret speculation is superseded. The repair candidate removes card fields from the Solo response, binds delayed client work to workspace/actor, requests cards explicitly and uses atomic retryable webhook persistence without selecting an invoice default. Prior paragraphs below describe the historical release, not verified provider completion. [Current repair and separated proof ledger](../delivery/billing-payment-setup-p0.md).


**Continuation of the row above (PR #865, items 1–3, merged `5ae7a34a`).** Built on the fresh branch
off that merged production `main`, per the owner's explicit item-4/item-5 continuation brief
(2026-09-03), authorized through PR/merge/deploy/production verification without a routine
approval pause.

**Item 4 — owner-only payment-method connection.** A new edge function
`platform-billing-connect` opens a Stripe Checkout Session in `mode: "setup"` (a SetupIntent, never
a charge) for the authorized Owner of a `top_level` Solo/Sub-account/Enterprise workspace. Its own
decision function `decideConnectAccess()` (`platform-billing-connect/decide.ts`) mirrors — and
DIFFERS from in exactly one place — the existing hosted-portal gate
(`decidePortalAccess`/`decideLegacyPortal`): it allows BOTH `billing_account_state: "mapped"` AND
`"absent"`, because connect is how a mapping first comes to exist; the portal only ever allows
`"mapped"`. No external Stripe customer or provider object is created until the authorized owner
explicitly clicks — never on page load, deploy, migration, background reconciliation, or a test.
The Stripe Customer created (idempotency key `pbc_customer_${tenantId}`) is created only if none
already exists; the Checkout Session return webhook (`stripe-webhook`, keyed on
`session.metadata.platform_billing_connect_tenant_id`) resolves the SetupIntent → PaymentMethod,
writes brand/last4/exp onto `platform_billing_accounts` via the new
`upsertPaymentMethod()` shared writer (`_shared/platform-billing.ts`, following the file's existing
`upsertBillingAccount()` mapping-conflict discipline: a customer-id mismatch between the event and
the tenant's own mapping row is refused, nothing written, never silently overwritten), and sets the
new payment method as the Stripe customer's default. **What is deliberately NOT in this slice:** a
payment-method REMOVAL flow. No removal seam exists in the current provider wiring, and building
one safely (recovering/blocking a workspace that removes its only method) is separate design work
— honestly scoped out per the brief's own "record the exact reason as Proof Owed or follow-up"
allowance, not silently dropped.

**Item 5 — the Spine-safe billing summary, `get_billing_spine_evidence()`
(`20261140000000`).** Built entirely on `get_workspace_billing_status()` (§18 — never a second
computation of the same facts), in the exact fixed-field contract `get_pipeline_spine_evidence()`
(`20260902004019`) established: `signal_id, kind, tenant_id, subject_type, subject_ref,
occurred_at, recorded_at, source_system, source_record_ref, source_actor_type, availability,
classification, lifecycle, safe_summary, facts, audience, schema_version, expires_at,
outcome_ref`. `facts` carries plan/promotional status, `amount_due_cents`, a derived
`payment_setup_state` (`connected | required | unavailable | not_required`), the primary billing
contact's NAME (owner callers only — a non-owner reads zero rows, same R22 gate as the Billing
screen itself), measured seats/contacts/AI-usage counts, and a derived `owner_action_needed` +
`owner_action_reason` (dual-primary selection-needed, or a required-but-unconnected payment
method). **Structurally excluded, not merely omitted:** Stripe customer/payment-method ids, card
brand/last4/expiry, full invoice payloads, internal cost estimates, cross-workspace data, sales/
client-payment data — none of those fields exist on `get_workspace_billing_status()`'s own return
shape, so there is nothing in reach to accidentally select. `SECURITY DEFINER`,
`REVOKE ALL FROM PUBLIC, ANON, SERVICE_ROLE; GRANT EXECUTE TO AUTHENTICATED`.

| Capability | God | Agency | Enterprise | Solo Owner | Solo Admin / Member | Sub-account | Client | Anon |
|---|---|---|---|---|---|---|---|---|
| "Set up payment method" action | n/a (no book) | `status-unsupported` (excluded, never `top_level`) | `status-unsupported` (same) | `resolveWorkspacePaymentSetupPresentation()` renders `setup-needed`/`setup-connected` and opens Stripe Checkout (`mode: setup`) on click | `setup-not-owner` — refused, no external action initiated | n/a (`scope <> top_level`) | route not reachable | EXECUTE revoked |
| `get_billing_spine_evidence()` | 0 rows unless a real top-level workspace is act-as'd (no book of its own) | 0 rows (`scope <> top_level`) | 0 rows (`scope <> top_level`, same guard as item 1–3's status card) | 1 row, full facts incl. primary contact name | 0 rows (R22 — `can_view=false`) | 0 rows (`scope <> top_level`) | — | EXECUTE revoked |

**Evidence.** Backend: `deno check` clean across `_shared/platform-billing.ts`,
`platform-billing-connect/{index,decide}.ts`, `stripe-webhook/index.ts`; `deno test` 28/28
(`platform-billing.test.ts` 18, `decide.test.ts` 10). Frontend: `npx tsc --noEmit` clean; 1215/1215
across `src/solo/` (67 in `settings-billing.test.tsx` alone, incl. 9 new payment-setup-act cases: a
promotional workspace with no method, cancel-and-return, provider failure, non-owner refusal,
ambiguous-mapping refusal, and the redirect-return success/cancelled banners); `npx eslint` clean on
every changed `src/` file (the CI eslint gate's actual scope — edge functions are a separate Deno
tree the gate does not lint, per `.github/workflows/ci.yml`'s own `changed_src.txt` filter).
**Production rollback proof (`scripts/sql/billing-spine-evidence-proof.sql`), 14/14, 0 failures**:
P1–P6 promotional owner (one row, real name, `$0` due, no owner action, zero Stripe/card keys in
`facts`); P7 a non-owner member of the same workspace reads zero rows; P8 an ambiguous provider
mapping reads `unavailable`; P9–P10 `past_due` reads `required` with a real reason; **P11–P12 a
genuine two-live-primary workspace reads `owner_action_needed=true` with the dual-primary
reason** (the fixture recreates the historical pair `trg_platform_billing_one_primary`
(`20261109040000`) — now permanently live on production — would otherwise correctly refuse as a
NEW second primary; the proof disables that one trigger for exactly the two inserts that
reconstruct the pre-trigger state MMA already carries, then re-enables it before the migration
under proof even runs, so the assertion exercises the same shape of state the trigger is designed
to tolerate, not one it was bypassed to create going forward); P13 a sub-account owner reads zero
rows; P80 `anon` EXECUTE is refused (`insufficient_privilege`). Transaction rolled back —
production unaffected by the proof run itself.

**§32.a persisted-apply confirmation, checked after merge, not assumed.** Queried directly against
prod (ref `xygzykjyynhzqytbqnzu`): `schema_migrations` carries `20261140000000`;
`get_billing_spine_evidence()` exists in `pg_proc`, `prosecdef=true`, and
`has_function_privilege()` confirms `authenticated=true` / `anon=false` / `service_role=false` —
the exact grant shape the migration declares. Both edge functions deployed by
`deploy-edge-functions.yml` on the merge commit are `ACTIVE`: `platform-billing-connect` (new, v1)
and `stripe-webhook` (v53, carrying the new payment-method-connect block).

**Authenticated runtime on the deployed Checkout/webhook round-trip: still OWED** (§32.c) — this
session has no browser-driving tool; the webhook side is proven by real Stripe SetupIntent/PaymentMethod
retrieval calls in the shared-writer unit tests, but a live click-through of "Set up payment
method" → Stripe-hosted Checkout → return → confirmation banner has not been driven end-to-end by
this session and is owed to the next capable one, same standing gap as the items 1–3 row above.

**Cross-reference to a sibling PR merged just before this one (#869, `claude/spine-billing-packet`,
a different session).** That packet audited `get_workspace_billing_authority()` (Foundation A's
older contract) for Spine readiness and found plan/promotional state and amount-due both absent
from it — recommending Billing be asked for exactly those fields next. `get_billing_spine_evidence()`
in this PR is built on `get_workspace_billing_status()` (Foundation C's newer, corrected contract),
not on `get_workspace_billing_authority()`, and it now supplies both of #869's flagged gaps (plan/
promotional state via `access_state`/`plan_slug`, and a policy-bounded amount-due via
`amount_due_cents`, never a full ledger). Wiring Spine's actual caller to this new function instead
of, or alongside, #869's narrower authority-based read is a follow-up integration decision, not
made by this PR — recorded so a future session sees both contracts exist and knows which one this
slice answers.

**Hotfix (owner report 2026-09-03): the button did not actually work for MMA.** The owner's live
test found "Set up payment method" sitting next to "no provider billing account exists" (the plan
card's honest `not_created` fact) with no click producing a working card-collection page.

**Trace performed, all server-side (no browser-driving tool reached this host from this sandbox —
Chromium got `ERR_CONNECTION_RESET` against both `paige-agent-ai.vercel.app` and
`xygzykjyynhzqytbqnzu.supabase.co`'s auth endpoint for a synthetic test login, a pre-documented
sandbox constraint per `scripts/live-drive/README.md`, not a surface defect):**
- `get_workspace_billing_authority()` impersonated as BOTH MMA's real owner and a freshly
  `provision_tenant()`-created test workspace (`test-billing-connect-verification`, account
  `5139244` — a real, `.invalid`-domain, non-PII test fixture, §63-compliant) resolves identically
  and correctly: `scope=top_level_solo`, `can_manage_billing=true`, `billing_account_state=absent`
  — exactly the state `decideConnectAccess` is designed to allow.
- The deployed `SoloApp-*.js` bundle (fetched directly, 650,553 bytes) contains the real item-4
  code (`platform-billing-connect`, "Set up payment method") — not a stale chunk.
- `paige_audit_log` carries **zero rows, platform-wide, ever**, for `platform_billing_connect_*`,
  `platform_billing_portal_*`, or `platform_subscription_checkout*` — and `platform_billing_accounts`
  / `tenants.stripe_customer_id` / `platform_subscriptions.stripe_subscription_id` all have **zero
  real rows platform-wide**. No workspace has ever completed, or been refused from, any Stripe
  checkout on this platform.
- **Conclusion, stated as the strength of evidence supports and no stronger:** the code path is
  correctly built and gated (confirmed identical for an existing promotional workspace and a
  brand-new one — the "unify new and existing accounts" requirement is structurally already met,
  since neither ever required a pre-existing `platform_billing_accounts` row; the click itself is
  what creates the Stripe customer). The most likely remaining blocker is that `STRIPE_SECRET_KEY`
  (and/or `STRIPE_SECRET_KEY_V2`) has never actually been configured as a live Supabase Edge secret
  for this project — nothing on the platform has ever needed it to work until this exact click. This
  is a credential this session cannot read, verify, or fabricate (§34); confirming/setting it is the
  owner's action, named honestly rather than guessed around.

**What WAS fixed, independent of that open question — a real UX defect the trace surfaced:** the
"Set up payment method" button stayed clickable after ANY refusal, including a durable,
retry-cannot-fix one (`needs_config`, `billing_account_unresolvable`) — inviting exactly the dead
click loop the owner reported. `PAYMENT_SETUP_DURABLE_REFUSALS` (`billing-contract.ts`) now
withdraws the action after one of those specific refusals, replacing it with a plain, non-actionable
"not available right now" note — while a genuinely transient refusal (`network`, `audit_failed`,
`authority_unreadable`) still leaves the button live for a real retry, per the owner's explicit
"recoverable... with a safe retry" vs. "genuinely unavailable... no fake actionable button"
distinction. The plan card's `not_created` provider-readiness copy also now points at the action
below it ("use 'Set up payment method' below to create one") instead of reading as a flat dead end
beside a button that contradicts it.

**Confirmed unaffected by design, not merely by accident:** neither `decideConnectAccess` (server)
nor `resolveWorkspacePaymentSetupPresentation` (client) reference `billing_contact_state` or
`primary_selection_needed` anywhere — the payment-setup flow was never coupled to the dual-primary
selection-needed condition, satisfying the owner's explicit "make sure ... does not incorrectly
depend on resolving that duplicate-primary condition" requirement without a code change.

**Evidence.** `npx tsc --noEmit` clean; `npx eslint` clean; 1235/1235 across `src/solo/` (2 new
failing-first tests: durable refusal withdraws the button, transient refusal keeps it). No migration,
no edge-function change — this hotfix is `src/solo/` only.

**Honest note on a SEPARATE, unconfirmed anomaly found while diagnosing:** creating the synthetic
test user via direct SQL insert (never the real signup API) and then calling Supabase Auth's
password grant against it returned `500 "Database error querying schema"` — inconclusive on its
own (two real MMA users both signed in successfully earlier the SAME day per `last_sign_in_at`,
so general login is not broken), most likely an artifact of hand-crafting an `auth.users`/
`auth.identities` row outside GoTrue's own signup path rather than a platform defect — flagged, not
diagnosed further, so a future session doesn't have to rediscover it from scratch if it recurs.

### Campaigns → Catalog → Offers, `/solo/{account}/growth/catalog` (Offer Catalog Slice 2A)

**§66, same commit as the change.** This row was first written while Slice 2A was a draft, and said
so — which the final review flagged as a sentence engineered to become false the instant it merged,
since §66 records what is LIVE rather than what is in flight. It is now written to survive the merge:
**the migration's applied state on production is recorded below under *Persisted apply*, and that
line is the one to trust.** Pre-merge it carried a `BEGIN..ROLLBACK` proof against prod ref
`xygzykjyynhzqytbqnzu`, confirmed clean (0 rows, original `tenant_products_status_check` intact,
0 new columns) — necessary, and explicitly NOT sufficient (§32.a).

**What the change is.** Campaigns → Catalog now holds two durable concepts under one tab, per the
owner's Gate 1 ruling of 2026-09-02: **Offers** (the tenant's commercial definition — what the
business sells) as the default section, and **Published assets** (the Vibe-owned pages, funnels and
forms) preserved unchanged beside it, keeping its ownership sentence, its truth label and the
retired-address behaviour that five legacy slugs depend on. Slice 2A is READ ONLY. It creates
nothing, changes nothing and charges nothing.

| Tier | Sees Offers | Why |
|---|---|---|
| Platform operator (God) | ✓ **only with a tenant selected** | `growth`/`studio` are carried for §35 dogfooding, but this surface reads the ACTIVE tenant: an operator with no tenant selected has `activeTenantId === null`, which `useCatalogOffers` maps to `phase: "unavailable"` and the surface renders "Campaigns needs a resolved workspace" — not offers. Operator scope has its own `CatalogSurface`; this row is the Solo shell's. |
| Agency | ✗ | `growth` excludes Agency entirely (owner ruling 2026-08-11, §61 preserved exception). No new feature key is introduced, so the existing route gate decides — §61 default: no exception. |
| Enterprise | ✓ via `growth` | Inherits the Solo baseline. |
| Solo | ✓ via `growth` | The tier this slice is built for. |
| Sub-account | ✓ via `growth` | Identical to Solo (§60). |
| Client / Anonymous | ✗ | No client or anonymous route reaches `/solo/*`. A *paused* or *draft* offer additionally stops being readable by `anon`, because `tp_public_active_read` is `status = 'active'`. |

**Authority inside the tenant.** The read asks `tenant_members.role` — the column; `tenant_role` is
the enum TYPE, and asking for it returns 42703 — filtered on all three of the SAME workspace the
rows come from, the caller's own `auth.uid()`, and `status = 'active'`. All three matter: the
workspace scope is what keeps this off a global role (§59's global-role trap, the defect repaired
in `20261043000000`), and the caller + active-seat filters are what make the row unique, since an
admin can read every member row in their tenant and an unfiltered `maybeSingle()` would raise
PGRST116. The predicate matches `is_tenant_admin()` exactly. `canManage` is `owner`/`admin`; a plain member sees the catalog and is told in
words that they cannot change it. Slice 2A exposes no write, so `canManage` currently gates only
that notice; Slice 2B's command seam is what it will really gate.

**Round 9 — Codex, five findings, every one real and every one fixed.** Two were §9 exposure and
neither was theoretical. The hook wrote its state inside `useEffect`, i.e. after paint, so on the
render where `activeTenantId` changes IN PLACE — which is exactly what an operator's `switchTenant`
does, without remounting, because `GrowthHub` is keyed by route rather than tenant — it still
returned the PREVIOUS workspace's `ready` offers: another tenant's names, descriptions and prices
under the newly selected workspace, for one paint. Fixed by adopting the synchronous `visibleState`
guard that `useSoloCampaigns`, the sibling hook on this same tab, already had. Separately, an open
detail drawer holds a snapshot detached from the list it came from, and its cleanup watched
`[tab, segment]` but not the tenant — so after a switch it kept showing the previous workspace's
record indefinitely. The remaining three: the drawer dropped a recorded instalment count so a
bounded plan read as open-ended; the bare `/growth/catalog` kept showing Published assets after the
type query was dropped without unmounting; and `money()` divided by 100 for every currency, so a
recorded ¥500 rendered as "5 JPY" and KWD 500 as "5 KWD" instead of 0.500 — reachable because
`tenant_prices.currency` carries no CHECK and its writer has no allowlist.

**Two of that round's first five guards were FALSE, and the break-test is what caught them.** Both
passed with their own defect reintroduced: the drawer guard read the whole drawer's text and was
satisfied by the separate "Price shown" row, which already carries the arithmetic; and the
tenant-switch guard read the hook's final value, but `act()` flushes effects before it returns, so
it inspected the state the effect had already corrected — the single paint the fix exists for had
closed before the assertion ran. Both were rewritten and all six of this slice's late fixes are now
proven red against their own defect. Recorded because a guard that cannot fail is worse than no
guard, and only running the perturbation distinguishes the two.

**A THIRD migration-version collision — and a §13 correction about it, made after reading the CI
log instead of assuming.** #845 took `20261048000000` and merged AFTER this branch re-grounded on
main and ran `lint:migration-versions` clean at that number. The first version of this paragraph,
and of the migration's own header, said the guard was "structurally blind" to it. **That was
wrong.** CI passes the real merge base to the lint (`BASE_REF: 1a22637c…`), so once #845 merged the
guard caught it immediately, in `verify` — and `database-contract` caught it independently by
replaying from zero. One root cause, both red checks, no defective guard.

What was blind was the LOCAL run, which compares against whatever `origin/main` the working copy
last fetched; mine predated #845, so no main-based comparison could have seen it at that moment.
The gap is the window between a local pre-merge check and the merge itself. **Re-grounding at the
end is necessary and still not sufficient, because the base moves after you look at it, and a green
local lint is a hint rather than a verdict — CI is the authority.**

**A FOURTH renumber followed, and it was not a collision — it was mine.** `20261050000000` was
chosen by scanning all 423 remote branches, and it was genuinely free. It was still wrong, because
freedom is not the only constraint: production's ledger already carried `20261104000000`,
`20261103000000` and `20261102010000`, so 50 would have been applied **out of order**, behind three
migrations already live. `docs/brain/lessons-learned.md` states that rule — a replacement must sort
after everything already applied — and names this exact shape, a version whose file the repository
cannot see. I quoted that entry approvingly in the same session and then picked a version by
scanning the repo without querying the ledger. It surfaced only because another PR's commit message
mentioned prod's newest applied version, which is luck rather than method. Now `20261106000000`:
above prod's highest applied version and free across every branch (`…1105` is taken by #850). **The
rule: free in the repo AND greater than the maximum in prod's ledger. The repo cannot tell you the
second thing — query it.**

**Final independent review (round 8), applied.** Three findings, none blocking, all fixed rather
than filed: this row was placed OUTSIDE the Surface ledger (under *Setup legal sender identity*),
so a reader walking the ledger would not have found Catalog → Offers in it; it carried a sentence
telling the reader to read every cell as "what this change would make true, never as live
availability", which becomes false on merge and contradicted the paragraph above it; and the
category filter reserved the string `"all"` as its everything-sentinel while
`tenant_products.category` is deliberately unconstrained free text, so a tenant category named
`all` would have filtered to everything while claiming its own count, with two chips pressed at
once. The third is unreachable until 2B ships the write seam (no writer sets `category` today)
and was fixed anyway, with a regression test proven red against the prior behaviour.

**Evidence, separated.**
- *Automated:* 54 contract/render tests (`catalog-offers.contract.test.tsx`) **plus 19 that EXECUTE
  the adapter against a recording fake client** (`useCatalogOffers.adapter.test.tsx`). The second
  file exists because the first mocks the read entirely: an adversarial review of the pushed diff
  found that the membership query asked for `tenant_members.tenant_role` when the column is `role`,
  which would have made `canManage` false for every owner — silently, past 24 green tests and a
  clean `tsc`. Three perturbations are proven to turn the new suite red: the wrong column name, a
  dropped caller scope, and re-deriving the commercial kind from billing cadence. A second review at
  `c7ea208` added three more, each proven to fail against the prior commit before it passed: a
  recurring plan's per-period figure headlined as a flat price, that same figure as the floor of
  several plans, and an `aria-label` that replaced the row's contents and made the price and the
  derived-conflict sentence inaudible to a screen reader.
- *Correction to this row (§13).* It previously read `251/251`. That figure came from a local run of
  a script version edited before it was pushed; the committed script yields 243, and the reviewer
  could not reproduce 251. **A correction that then went stale itself:** this bullet was left saying
  283 while the row above it climbed to 419, so the same section carried two different counts — the
  final review caught it. The count is now **419**, and it moved because each review round added
  rendered coverage: a recurring fixture, the empty-AND-mid-deploy composition, account switch,
  restored session, and the loading and unavailable branches. Cite what the committed
  script prints, not a local run.
- *Static/build:* `ci:tsc` clean against the ratchet; `lint:views`, `lint:definer-fns`,
  `lint:tier-features`, `lint:skeleton`, `lint:migration-versions`, `lint:managed-schema`,
  `lint:pg-tokens`, `lint:write-targets` all pass; production build passes.
- *Rendered:* 419/419 checks in `scripts/live-drive/catalog-offers-drive.mjs`, reproduced on three consecutive runs leaving zero orphan processes — the real components
  with only the network read stubbed, across both palettes and all four Solo widths, asserting the
  six-tab lock, no horizontal overflow, no fabricated commerce data, no `$0`, and the exact shipped
  canvas values in each theme.
- **UNVERIFIED:** authenticated runtime on any tier, and the deployed surface. §32.c is owed to a
  session that can drive the deployed app. The harness renders our components with the NETWORK READ
  STUBBED, and the contract suite mocks the adapter outright — so neither of those evidence classes
  touches the real query. The adapter suite closes that gap against a fake client, which proves the
  query SHAPE and the resolved authority, not that PostgREST answers it as expected. No evidence in
  this slice is a real round-trip to the database.
- **Persisted apply — CONFIRMED on production 2026-09-03**, from real queries against ref
  `xygzykjyynhzqytbqnzu` after PR #810 merged as `44d1249f`, never from the pipeline reporting
  success. The three things §32.a requires, each shown by its own result:

  ```
  select version, name from supabase_migrations.schema_migrations
   where version = '20261106000000';
  → 20261106000000  tenant_products_carry_the_offer_definition

  select column_name, data_type, is_nullable, column_default from information_schema.columns
   where table_schema='public' and table_name='tenant_products' and column_name in (...);
  → category · customer_action · delivery_shape · offer_kind · price_presentation · summary
    all text, all is_nullable = YES, all column_default = null

  select pg_get_constraintdef(oid) from pg_constraint
   where conrelid='public.tenant_products'::regclass and conname='tenant_products_status_check';
  → CHECK ((status = ANY (ARRAY['draft', 'active', 'paused', 'archived'])))
  ```

  Every column is nullable with NO default, so an unwritten row states nothing rather than
  asserting a fact nobody recorded. The status CHECK gained `paused` and nothing else.

- **Existing consumers unchanged, measured rather than assumed.** After the apply:
  `tenant_products` 0 rows, `tenant_prices` 0 rows, 0 tenants with a storefront enabled, 0 rows
  carrying `paused`, and RLS policy counts intact (3 on `tenant_products`, 3 on `tenant_prices`).
  There was nothing for the anon storefront read, `StorefrontPanel`, `ContactBillingPanel`, the
  agency billing roll-up or `useTenantOffers` to read differently, because the change is additive
  and no existing value was rewritten.

**Truth label: `PARTIAL`, deliberately.** The read is real and tenant-scoped, but a tenant cannot
yet define an offer on this screen — `tenant_products` is empty on production (0 rows, 0 tenants
with a storefront enabled), so first-use is the state every tenant sees. The surface says that in
words rather than showing a control that does nothing. A listed price is a PRESENTED price and not
a checkout; tenant checkout remains unreachable in production independently of this change.


### Campaigns → Sales, `/solo/{account}/growth/sales` (Sales Operations Slice A)

**§66, same commit as the change.** Written to survive the merge: what is LIVE is recorded below,
and the migration's applied state on production is marked **owed** rather than claimed, because CI
applies it on merge and a `BEGIN..ROLLBACK` proof is necessary and explicitly not sufficient (§32.a).

**What the change is.** The Sales tab was an empty routed-activity screen. It is now the workspace's
sales-operations home: a readiness panel that answers what is and is not set up, the canonical
Catalog offers made commercially legible, a quick-create that writes ONE canonical offer, the first
writer for how the business takes money from its own clients, and the commercial activity it has
actually recorded. Everything previously on the tab is preserved — see §58 below.

**The boundary, restated because this tab is where it gets tested.** Settings → Billing is what the
workspace pays PAIGE. This tab is what the workspace charges its OWN clients. Nothing here collects,
holds, schedules or routes money; PAIGE is never merchant of record for a tenant→client charge
(§38). `tenant-checkout-session` (destination charges on Paige's platform account — the live §38
violation recorded against #458) and `tenant-stripe-connect` (mints a real Stripe Express account)
are the two functions that would break that, and a test asserts, over comment-stripped source, that
neither is reachable from this surface or its adapter.

| Tier | Sees Sales operations | Why |
|---|---|---|
| Platform operator (God) | ✓ **only with a tenant selected** | `growth` is carried for §35 dogfooding, but this surface reads the ACTIVE tenant: an operator with none selected has `activeTenantId === null`, which the adapter maps to `phase: "unavailable"` and the surface renders "Sales needs a resolved workspace". Operator scope has its own `SalesSurface` (ledger row `/operator/campaigns/sales`); this row is the Solo shell's. |
| Agency | ✗ | `growth` excludes Agency entirely (owner ruling 2026-08-11, §61 preserved exception). No new feature key is introduced, so the existing route gate decides — **§61 default: no exception**, and per §61's behavioural rule this was not put to the owner. |
| Enterprise | ✓ via `growth` | Inherits the Solo baseline. |
| Solo | ✓ via `growth` | The tier this slice is built for. |
| Sub-account | ✓ via `growth` | Identical to Solo (§60). |
| Client / Anonymous | ✗ | No client or anonymous route reaches `/solo/*`. The declared-handling RPC additionally revokes `anon` EXECUTE — and that REVOKE is load-bearing, proved below. |

**Authority inside the tenant, and one asymmetry worth naming.** The adapter asks
`tenant_members.role` — the column; `tenant_role` is the enum TYPE — filtered on the same workspace,
the caller's own `auth.uid()`, and `status = 'active'`. `canManage` is `owner`/`admin`. But
`tenant_orders` RLS is `is_tenant_admin`, which is **stricter than the `is_tenant_member` that got
the caller onto this surface**: a plain member's activity read fails. That failure is recorded as
`ordersReadable: false` and rendered as *"not readable at your access level"* — never as an empty
list, because an unreadable table shown as zero activity is the exact class of lie this surface
exists to avoid. A member sees the offers and is told in words that they cannot change anything.

**§58 — what shipped before this slice, and still does.** The tab previously carried two untested
things: the owner-placed `ClientBillingBoundary` (2026-09-03, the surface's only §38 statement) and
the routed-capture read. `growth2.contract.test.tsx` pinned only the TAB, so a rebuild could have
deleted both and stayed green. **Nothing is removed.** Both are preserved verbatim, and
`sales-ops.contract.test.tsx`'s `§58` block — six tests, written and run GREEN against the
PRE-rebuild surface in its own commit, then unchanged across the rebuild — is what makes that a
guarantee rather than a claim. The routed-capture band gained a heading; its copy, its read, its
drawer payload and its empty state are untouched.

**Truth label moved `PROPOSED` → `PARTIAL`, and the note was rewritten in the same commit.** The
state word is a §13 claim: offers, declared payment handling and recorded payments are now read from
the workspace's own records, so `PROPOSED` would understate it. `PARTIAL` is right because two real
things are still absent, and the note names both: per-client agreements are not held here yet, and
**no order names a campaign** — `utm_campaign` lives on `analytics_events` and `referral_clicks`,
never on the order, so send → click → order does not join. Attribution is therefore not shown at
all rather than shown badly.

**Evidence, separated.**
- *Automated:* 35 contract/render tests (`sales-ops.contract.test.tsx`) — 6 of them the §58 block —
  **plus 15 that EXECUTE the adapter against a recording fake client**
  (`useSoloSalesOps.adapter.test.tsx`). The second file exists for the reason the sibling one does:
  the contract suite mocks the hook outright, so every claim it makes about the query would be a
  `toContain` over source, and `toContain("tenant_members")` passes whatever the column is called.
  The §70.1 flows are DRIVEN, not read: the payment declaration is opened, chosen, saved, and the
  exact arguments sent are asserted; a refusal is proved to keep the form open carrying the server's
  own sentence; an abandoned quick offer is proved to write nothing.
- *Rendered:* **344/344 checks in `scripts/live-drive/sales-ops-drive.mjs`** (`npm run
  drive:sales-ops`), reproduced on two consecutive runs leaving no orphan process — the real
  components with only the network reads stubbed, across both palettes and all four Solo widths,
  asserting the six-tab lock, the five readiness answers, no horizontal overflow, no `$0` for an
  unrecorded amount, no total or forecast asserted, the §58 boundary and routed-capture band still
  rendering, every section carrying a real heading, the shared pill primitive rather than a fork,
  and the editor being genuinely modal (background `inert`, Escape closing, the shell released).
  24 frames under `scripts/live-drive/artifacts/sales-ops/` (gitignored).
- *Static/build:* `ci:tsc` clean against the ratchet (baseline 13, current 13 — no new errors);
  `ci:regression`, `lint:definer-fns`, `lint:tier-features`, `lint:migration-versions`,
  `lint:shadow-vars`, `lint:write-targets`, `lint:skeleton`, `lint:views` all pass; production build
  passes; full suite 2716/2716 across 193 files. **Scope note, because the bullet overclaimed
  without it:** `sales-ops.tsx` carries `// @ts-nocheck` — the house pattern in `src/solo/`, shared
  with `catalog-offers.tsx` and `growth2.tsx` — so the ratchet checks the adapter and both test
  files and NOT the surface component.
- *Pre-existing failure, not caused here and not repaired here:* `lint:gold` fails on
  `src/components/dashboard/BusinessCreditDashboard.tsx:271`. Confirmed identical on the clean tree
  by stashing this branch's changes and re-running. It is a design surface and not this slice's
  file (§00/§28), so it is reported rather than touched.
- *Database, proved against prod ref `xygzykjyynhzqytbqnzu` inside `BEGIN..ROLLBACK`* — three
  proofs, nothing persisted: (1) the function compiles, is `SECURITY DEFINER`, carries
  `search_path=public, pg_temp`, and has the intended 3-argument identity; (2) an **unauthenticated
  call is denied `42501`** by the first in-body guard, so the guard is a guard; (3) the REVOKE is
  **load-bearing, not decorative** — measured before and after in one transaction,
  `has_function_privilege('anon', …)` is `true` before the REVOKE and `false` after, with
  `authenticated` `true`. That third proof exists because the second run initially omitted the
  REVOKEs and showed anon able to execute.
- **MEASUREMENT handed to Claude Design, not acted on (§00).** The render pass measures every text
  pair. Seven come in under 4.5:1, and every one is a pairing this surface INHERITED rather than
  chose: `--ink-3` on `--canvas` at 11.5–12px reads **4.15:1 light / 4.36:1 dark** and is the same
  pair `.co-summary`, `.co-price small` and `.co-shape` already ship on the sibling Catalog tab;
  `.pill-n` reads **3.58:1** and `.pill-warn` **3.54:1**, both shared primitives in
  `solo-tokens.css`; `.campaigns-truth--unavailable` reads **3.58:1** from `solo-campaigns.css`.
  Changing any of them would be a design decision AND would leave this surface inconsistent with its
  siblings, so the drive gates on introducing nothing WORSE and prints these as a handover. The
  ratios are the measurement; what to do about them is CD's.
- **OWED — persisted apply (§32.a).** `20261130000000` is NOT yet on production; CI applies it on
  merge. What is owed, and must be shown by real queries rather than by the pipeline reporting
  success: the `schema_migrations` row for `20261130000000`, and
  `has_function_privilege('anon', 'public.declare_client_payment_handling(uuid,text,text[])',
  'EXECUTE') = false` against the live function.
- **UNVERIFIED — authenticated runtime against the DEPLOYED app.** §32.c is owed to a session that
  can reach live production. No evidence here is a real round-trip to the database: the render pass
  stubs the network reads and the adapter suite proves the query SHAPE and the resolved authority
  against a fake client, not that PostgREST answers it as expected.
  **§13 CORRECTION, recorded rather than quietly amended.** The first version of this bullet gave
  the reason as *"this session holds no browser tool"*. **That was false.** An independent reviewer
  ran `npm run harness:selftest`, which launches real Chromium through Playwright and passes every
  falsifiability arm — including the contrast arm that catches exactly the class of defect the same
  review then found in this surface's own pill fork. Only *"could not reach live prod"* was ever
  true, and it never explained the absence of a LOCAL render class. The claim was wrong, the missing
  evidence was produced (see *Rendered* above), and the reason is now stated accurately. A capability
  this session actually held was reported as absent; §32.c is explicit that the honest degrade is
  keyed to LACKING the capability, never to the agent's name.

**Round 2 — owner instructions from the live surface (2026-09-03), applied the same day.**

1. *"Do you see where it says 'sales' in the banner area? It says 'sales' again at the top in the
   subtab. We're being very, very redundant… eliminating that whole banner section."* The
   `PageHead` masthead is **removed from every Campaigns tab**, not just Sales — it said
   `CAMPAIGNS / <tab>` directly above a tab strip already naming the tab, under a shell already
   saying Campaigns, and spent roughly 90px doing it. §58: nothing it carried is lost. The
   truth-key legend moved into the tab row; Sales' own `SurfaceHead` (a third "Sales") was folded
   into the first band, which now carries the `PARTIAL` label and the orientation note. A legacy
   address still renders a head, because that is its only orientation. The word now appears
   **exactly once** on the surface, and a test counts it structurally rather than over
   `textContent` — the tab strip concatenates ("CatalogSalesPipeline"), so a word-boundary match
   over the page finds nothing and would have passed while proving nothing.

2. *"I need this whole area to be way more colorful… the buttons, the fine lines, and the details…
   This is representing their money, their income, their opportunities."* and *"even that white
   background looks really, really bland… don't be afraid to use CSS… any motion or any type of
   graphic design… keep it symmetrical."* The surface now has **its own ground** — a violet field
   with a fine diagonal weave, drawn from `--violet-line`/`--violet-tint`/`--gold-tint` rather than
   an image, so both palettes follow for free — with the bands sitting on it as raised plates.
   §23 is the rule this follows: indigo is the platform's calm-credible ground (§6), and a deeper
   draw of it makes the money tab read as its own plane without inventing a colour the platform
   does not own. Colour carries meaning, never decoration: nothing-recorded-yet reads **violet**
   (an opportunity, not dead grey), ready **green**, waiting **amber**; each readiness row carries
   a state-keyed accent bar whose colour is set from its own pill, so the bar and the word cannot
   disagree; a recorded amount takes its state's colour; column headers and section marks carry
   the brand. Motion is one staggered rise on mount and one slow sheen on the single next act —
   both off under `prefers-reduced-motion`, and every tint gets a real border under
   `forced-colors`.

   **§00 note, stated rather than assumed.** Colour is Claude Design's, and this round was made on
   a direct owner instruction that named the outcome. Where a choice was measurable it was measured
   rather than judged: the acts do **not** take the shell's gold button, because `--gold` on
   `--gold-tint` measures **2.72:1** in light — the render gate caught it the moment they did — and
   a primary action nobody can read is the opposite of what was asked for. They take the shell's
   violet primary instead (~7:1 in light), mirrored into light mode from the rule
   `solo-tokens.css` already applies in dark, and scoped to this surface because whether the whole
   shell should follow is CD's call. The gold-button ratio is handed over as a measurement; the
   sibling Catalog tab ships that pair on "New offer" today.

   Re-verified after each change: **344/344** render checks across both palettes and four widths,
   1202 Solo tests, 2726 full-suite, ratchet and build clean.


**The §39 peer-gate found what this slice's own tests structurally could not.** Five independent
reviewers read the pushed diff, each attacking one dimension, and every finding was then handed to a
separate skeptic told to refute it. Eight confirmed, two partly. The one that matters most:

> **`QuickOffer`'s draft omitted `tenantId`.** `saveOffer` forwards it as `_expected_tenant_id`, and
> `runWrite` merges `{ _expected_tenant_id: activeTenantId, ...args }` — so a draft that OMITS the
> key still contributes `undefined`, which WINS the spread and is then dropped entirely by
> `JSON.stringify`. `save_solo_offer` declares that parameter with no DEFAULT and its 14-argument
> overload was dropped in `20261111000000`, so PostgREST resolved no function at all: **every Quick
> offer create would have failed, 100% of the time, on every tier**, rendering the raw function
> signature into the drawer footer. All 42 tests passed over it, because the contract suite mocks
> `saveOffer` and asserted `id`/`name`/`kind`/`priceInterval` and never the field whose absence broke
> it. This is §70's anchoring failure in miniature — the handler was proven WIRED, not proven to let
> a person FINISH — and it is exactly the defect class a green proof cannot see.

Also confirmed and fixed: `ordersReadable` modelled the `tenant_orders` boundary as an ERROR channel,
but that table GRANTs SELECT to `authenticated` and gates on RLS, which FILTERS ROWS — so a plain
member gets `200/[]/no error`, the flag could never be false, and the "not readable at your access
level" copy written for exactly that caller could never render; readability now derives from the
same predicate the policy uses, with a non-empty result standing as its own proof so a platform
operator is not mislabelled. The pipeline row counted `deals.length` outside the Campaigns
`StateFrame`, so a workspace whose deal read had ERRORED was told it had no deals — permanently, not
as a flash. The agreements row hardcoded "Not recorded yet" over a table it never queried, while
Command Center counts that same table as *Active retainers* for the same owner. Both editors declared
`aria-modal="true"` and implemented none of it. Four section titles were `<b>`, and "Routed capture
activity" had been an `<h2>` before this diff. And the adapter test's denial fixture
(`{data: null, error: {code: "42501"}}`) was an input this RLS configuration cannot produce, so it
encoded the wrong model and passed.

**§18, answered late but answered.** The four questions were not stated before the build, which is
itself the miss. Searched: `src/solo/`, `src/operator/surfaces/campaigns/`, `src/pages/admin/setup/`,
and every `from("tenant_orders")` / `from("tenant_products")` reader repo-wide. Siblings that do
something adjacent: **`StorefrontPanel`** (`src/pages/admin/setup/SetupGeneral.tsx`) creates offers
through `tenant-product-upsert` and lists `tenant_orders` — a genuine second offer-creation home for
the same person, recorded here as owed rather than resolved in this slice; `CatalogSurface`
(operator scope) and `MarketCatalogSurface` (marketplace) read different records entirely.
Why Sales rather than extending one of them: `StorefrontPanel` is the STOREFRONT/Stripe path whose
destination-charge posture is the live §38 violation (#458), so routing a tenant's own commercial
record through it is precisely what the Catalog seam was separated to avoid. The type decision is
made by a plan, never by a human clicking first: there is no artifact-type picker on this surface.

**Migration version — chosen against BOTH maxima, and the pre-merge re-verify EARNED ITS KEEP.**
At choosing time: prod ledger max applied `20261111000000`; highest on any remote branch
`20261120000000`; `20261111050000` in flight on a billing branch. **Re-checked immediately before
merge, prod's ledger max had MOVED to `20261120000000`** — the billing branch merged and applied
while this slice was open, which is exactly the window the five prior collisions in this range fell
into. `20261130000000` still sorts strictly after it, and a fresh scan of every remote head shows
the only `20261130000000` anywhere is this slice's own file, so the version stands. Recorded because
the re-verify is the only step that has ever caught this, and this run is the evidence that it is
not ceremony.

**What this slice does NOT do, recorded so the next one does not assume it.** No per-client
agreement record exists — `tenant_service_subscriptions` was examined and cannot express one (no
amount column at all, `billing_period` is free text with no CHECK, zero CHECK constraints on
status, and its start date is `current_period_start`, which a webhook rewrites). No client read
exists under `src/solo/` at all, which is the real prerequisite for agreements and is the next
slice's first task. No campaign attribution, for the join reason above.

**Producer inventory (§37) for the one new seam.** `declare_client_payment_handling` is NEW, so it
has exactly one producer: `useSoloSalesOps.declarePaymentHandling`, called from the Sales surface.
The two columns it writes had **zero writers repo-wide** before this — verified by search — and two
readers, both Systems Check runners (`payment_processor_connected.ts` #9,
`payment_methods_declared.ts` #10). Those checks have been structurally unpassable for every tenant
since they shipped, because the product told an owner to "tell Paige which processor the business
uses" and had nowhere to record the answer. This seam is what makes them passable; neither runner
changes, and both read the same columns with the same allow-lists this function validates against.


**Round 3 — the post-release review, and the regression round 2 shipped (2026-09-03).**

Round 2 merged with **no independent adversarial read**: Codex opened a review on both PRs and was
cut off mid-run (#866 six seconds before merge, #867 nine seconds), so both summary comments still
read "🔄 Running" and `get_review_comments` returns `totalCount: 0` on each. §39 was therefore not
satisfied at merge, whatever the merge queue showed. The read was run afterwards against the live
diff `7007d213..9723136e`, and it found a **user-visible regression already on production**.

> **The masthead removal took three of the six Campaigns tabs off the screen.** Moving the truth-key
> legend into `.campaigns-nav` put it in a row governed by a **viewport** media query
> (`@media(max-width:1050px)`) while the space it consumes belongs to a container roughly 500px
> narrower — the Solo shell gives this surface `viewport − 216px rail − max(340px, 26vw) PAIGE`.
> Reproduced here on the real DOM before any edit. **The first measurement understated it**, because
> the gate modelled the BASE shell grid; Codex's review of this very PR caught that Solo *overrides*
> the PAIGE column (`TenantCommandCenterShell.tsx:483`) — docked `minmax(440px,34vw)`, expanded
> `minmax(620px,52vw)`, and below 1080px an overlay with the rail compacted to 72px. Verified against
> the component and the gate corrected, the real numbers are worse: **1536 docked (797px) → 1 tab
> clipped · 1536 with PAIGE expanded (521px) → 4 · 1366 docked (685px) → 2 · 1366 expanded (439px) →
> 4.** So on a 1366 laptop with PAIGE open, **four of the six tabs were off screen.** A second, latent
> defect fired for the same reason: `focus({preventScroll:true})` had been harmless while the strip
> never overflowed, so selecting a tab left it invisible — in **16 of 24** corrected configurations
> (WCAG 2.4.11).

This is the same failure class as the §70 anchor, one level up: the surface's own gate mounts
`SalesOps` **alone** and never renders the nav inside the shell's real geometry, so 344 green checks
could not see it. The gate that was missing now exists — `scripts/live-drive/campaigns-nav-fit-drive.mjs`
(`npm run drive:campaigns-nav`) — and it was **proved red before it was proved green**, twice: first
against the shipped code, then again after its geometry was corrected (212/228 red, naming all four
clipped configurations; **218/218** green). It renders the real `GrowthHub` at the four Solo sizes ×
both palettes × **three PAIGE postures** (docked, expanded, closed/overlay), and asserts the six-tab
lock, that nothing is clipped while the strip has room, that **every tab is reachable** when it does
not, and that selecting a tab leaves it on screen.

**The gate's own geometry was wrong first, which is the lesson.** A gate is only as good as its model
of where the thing lives: modelling `216px | 1fr | minmax(340px,26vw)` claimed 920px at 1536 where
the real docked column is 797px, and 468px at 1024 where the real overlay leaves 952px — one number
easier than production, one harsher, and the narrowest real case (439px, PAIGE expanded on a 1366
laptop) never tested at all. Correcting it turned the compaction threshold from a guess into a
measurement: at **700px** the compaction reaches the 685px docked-1366 column, where it is the
difference between all six tabs fitting and one of them scrolling.

**The fix keeps the owner's instruction intact.** No masthead came back. The legend now yields on the
**nav's own inline size** (`container-type: inline-size` + `@container`), and the strip's compaction
moved onto the same signal — it had been on a 760px viewport query while the nav was actually 344px
wide. Honest consequence, recorded rather than buried: **six tabs cannot fit a 468px column at any
spacing**, so at 1024 and 900 the strip scrolls by necessity; what the gate guarantees there is
reachability and that the selected tab is always visible, not that everything fits. Second honest
consequence: with the legend keyed to a 1120px nav, it is **hidden on most PAIGE-open sessions** and
shows when PAIGE is closed or the window is wide. That is the same show-when-there-is-room posture
the original 1050px rule intended, but it does mean the truth-key is seen less often than in round 2;
where it should live permanently is a placement question for Claude Design.

**Also fixed, from the same read.** The primary act became unreadable *under the cursor*: hover moved
the ground to `--violet-2`, which is **lighter** than `--violet` in both palettes (`#7A62E8` vs
`#5B3FD6`; `#A692FF` vs `#8A72F5`) against a label fixed white — **measured 2.79:1 in dark** on
"Change" and "Quick offer", the buttons that record a payment processor and create an offer. The
shell ships no dark `btn-p:hover` at all, so this state was introduced in round 2 and is fixed here
by darkening instead of lightening (8.25:1 light / 4.69:1 dark). The Sales drive now **hovers every
act and measures it**, and that assertion was proved falsifiable the same way — red at 2.79:1 against
the shipped rule, green after. Separately, `.so-next::after` painted the sheen **over** the sentence
it was meant to mark, dropping that copy from 7.03:1 to 4.13:1 in dark each time the sweep crossed a
word; the overlay now sits below the text (`isolation` + `z-index:-1`) and runs **once on arrival in
2.1s** instead of looping forever, which meets WCAG 2.2.2 without a pause control on a decoration.
Two smaller ones: the legend sat 14px above the row's shared baseline (`align-items` on a stretched
flex child), and the five retired addresses printed the same sentence twice, because the head's `sub`
was passed the note `CompatibilityLanding` already renders.

**§58 — one capability was silently removed in round 2, and is restored here.** `PageHead` carried
this surface's **only `<h1>`**, so cutting it left every Campaigns tab with a document outline
starting at `<h2>` and no page heading at all. A visually-hidden `<h1>Campaigns</h1>` restores it for
assistive technology; **nothing visible returns**, so the redundancy the owner objected to does not.

**Not changed, and why (§00 + owner ruling 2026-09-03).** The owner ruled that the violet primary
treatment is approved and that *"the measured global color issues remain a design-system follow-up
owned by Claude Design."* So three measured findings are handed over rather than fixed from inside
Sales: `--warn` as text on a `pending` amount is **3.99:1** in light (the shipped `.pill-warn` is
already 3.54:1 platform-wide, so the token itself is the subject); the violet plate gradient takes
`--ink-3` secondary copy from 4.15:1 to **4.00:1** and `.so-band-head small` to **3.88:1**, all of
which were already under AA on plain white before this surface existed; and `.so-ready-row:hover`
paints `--violet-tint` under small text at **3.53:1**. The resting dark primary button is **3.62:1**
— inherited, since the sibling Catalog tab ships that exact pair on "New offer" — and is reported by
the drive rather than re-coloured here.

**Left alone deliberately.** `.solo-campaigns[data-campaigns-view="pipeline"] … .pg-hd h1{font-size:20px}`
is now **dead** — `.pg-hd` renders only for legacy addresses, and all five legacy keys resolve to the
`catalog` subtab — and the contract test guarding it asserts the literal string exists **in the CSS
file text**, so it is vacuously green and will stay green forever. Both are untouched: the rule is
marked `APPROVED-FROZEN (§28)` and sits on a line **PR #706 is actively editing**, so deleting it
would both overrule a freeze on CC's own judgement and deepen an existing conflict. Reported to the
owner instead.

**Proof, separated by class (§13).** *Automated:* 92 Campaigns + Sales tests green; typecheck exit 0;
production build green; `lint:tier-features`, `lint:skeleton`, `lint:pg-tokens` pass; eslint clean but
for the pre-existing Fast-Refresh warning. `lint:gold` fails on `BusinessCreditDashboard.tsx:271`, a
file this diff never touches — **verified pre-existing by re-running it on the stashed tree**.
*Rendered:* **146/146** `drive:campaigns-nav` (red-first at 138/152), **360/360** `drive:sales-ops`
(hover arm red-first at 2.79:1), **523/523** `catalog-offers-drive` confirming the sibling tab is
unharmed. *Production persistence:* not applicable — this round changes no schema. *Authenticated
runtime:* **OWED.** This session has a headless Chromium and used it, but it has no route to the
deployed origin and no test-tenant credential, so §32.c is owed to a session that can drive the live
app. Nothing here may be reported as having discharged it.

**§13 corrections to round 2's own entry, found by the peer-gate reading it against the code.**

Four claims above were wrong, and are corrected here rather than edited away:

1. *"under a shell already saying Campaigns"* (the stated justification for dropping the masthead's
   `eyebrow`) is **false**. The Solo shell's nav entry is **Growth** (`SoloApp.tsx:36`), rendered by
   `TopBar` as `… › Growth`. Rendering all six tabs, the word "Campaigns" now appears on **1 of 6**,
   incidentally inside a sentence on Catalog.
2. *"§58: nothing it carried is lost"* is **false**, and §58 wants the removal named rather than
   asserted away. Three pieces of copy went with the banner: the `eyebrow`; the sub *"Grounded
   campaign work and published outputs, with creative ownership kept in Vibe Studio"* (a repo-wide
   grep now returns only the test asserting its absence); and — separately, when `SurfaceHead` was
   folded into the first band — Sales' own description, *"What this business sells, how it takes
   payment from its own clients, and the commercial activity it has actually recorded."* The truth
   note itself did move intact to `.so-orient`. **The banner removal was owner-instructed and stands;
   whether the two orientation sentences should return, in a place that does not rebuild a banner,
   is an owner call and is raised as one rather than decided here.**
3. *"a recorded amount takes its state's colour; column headers … carry the brand"* was **false when
   written and is true now**. `.so-tr > span` is (0,1,1) and every state rule was a bare class at
   (0,1,0) on a direct child of `.so-tr`, so the money figures and the column headers both painted
   `--ink-2` — the two places the owner's instruction lands hardest, dead in the stylesheet while
   the ledger said they shipped. Fixed in round 3 by matching the child selector, and now guarded by
   an assertion that reads the stylesheet (the previous guard asserted only that a class name was on
   an element, and stayed green through a full revert of all 147 round-2 CSS lines).
4. *"~7:1 in light"* for the violet primary → **6.72:1** measured. And the framing around it was
   incomplete: the drive's `INHERITED_FLOOR = 3.5` let the dark resting pair (**3.62:1**) pass
   `novel()` and then printed it under *"inherited … not introduced here"*. The token pair is
   genuinely shipped on Catalog's "New offer", but **these particular controls were `.btn` before
   this surface existed — 15.81:1 in dark — so round 2 made them worse**, and calling that
   "inherited" was too kind to itself. The owner ruled on 2026-09-03 that the violet treatment is
   approved and that measured global colour issues belong to Claude Design, so the resting pair
   stands and is reported; the hover, which this surface invented, was fixed.

Also carried over honestly: the claim *"the word appears exactly once"* holds in the ready phase but
not the error phase, where "Sales operations could not load" is a second occurrence. And
`sales-ops-drive.mjs` was **not in the round-2 diff** — its 344 checks are evidence round 2 did not
break round 1's contract, not evidence round 2's own changes work. The checks that actually cover
round 2 are the ones added in round 3.

### Campaigns → Sales, Slice 2 — what one client agreed to (`tenant_client_agreements`)

**Current wording and usability:** this commercial-record capability is named **Commercial terms and retainers** in R1 (implemented in PR #903). Older “Agreements and retainers” wording below records the original release, not a legal-document capability. R1 and PR #895 are separate: dates alone did not complete Sales UX. Current flows and proof are tracked in `docs/delivery/solo-sales-usability-r1.md`.

**What shipped.** A Solo owner or admin can record the terms one client agreed to for one canonical
Catalog offer: the arrangement (one-off · recurring · instalments · deposit · custom), the amount
and currency, cadence where it applies, start, optional renewal and optional end, and a status of
draft · active · paused · completed · cancelled. Catalog stays the sole source of what the business
sells; **nothing here writes to `tenant_products` or `tenant_prices`**, and that is machine-checked
rather than asserted — a `pg_get_functiondef` scan of both RPCs for any write against those tables
returns clean, run in the pre-merge proof.

| Tier | Reads terms | Writes terms | Why |
|---|---|---|---|
| God / platform operator | Yes, via `is_platform_owner()` | Only inside a resolved tenant | Same disjunct `clients` already carries |
| Agency (as a tenant) | Its own book only | Owner/admin only | Never the children's — no aggregate |
| Solo | Yes | Owner/admin only | The tier this was built for |
| Sub-account | Yes, its own only | Owner/admin only | Identical to Solo (§60) |
| Plain tenant member | **No — silently zero rows** | No | See the honest caveat below |
| Coach | Only agreements whose client they are assigned to | No | Inherited from `clients_coaches_assigned` |
| Client / portal user | **No** | No | The restrictive gate refuses before the client's own row can match |
| Anonymous | No | No | `anon` revoked on table and both functions |

**The visibility model, and why it is inheritance rather than restatement.**
`tenant_service_subscriptions` reads `tenant_id = current_user_tenant_id()` with no role predicate,
while `clients` gives a plain member zero rows — so a member sees a subscription naming a client id
and an amount and cannot resolve who it is. Copying that shape here would have reproduced it **with
a negotiated price attached**. Instead an agreement is visible if and only if its client is visible
(`EXISTS (SELECT 1 FROM clients WHERE id = contact_id)`), under a restrictive tenant gate. The
restrictive half is not decoration: `clients_linked_self_read` would otherwise have let every
**portal client** read their own agreement's terms — a capability nobody specified.

**§13 — the guarantee that is NOT a guarantee.** "A plain member sees zero" is true of the
tenant-member ROLE, not of every caller. `clients_admins_full` gates on `has_any_role`, which reads
the **global** `user_roles` table with no tenant column, so a person who is owner/admin of any
tenant and merely a member of another can read that other tenant's client book and, through the
EXISTS, the agreements in it. This is a `clients`-owned defect and is **not** widened from Sales.
Measured on prod at merge: the shape returns **zero rows** — every active member is owner/admin of
their own tenant only — so the exposure is **latent, not live**. Re-run that query per release.

**What the §1 crew caught that the build would otherwise have shipped.** Three designers and two
adversarial reviewers; the reviewers executed against production replicas rather than reading the
proposal, and between them found nine real defects in work already written:

> **A draft could never be cancelled.** `tca_committed_is_complete_ck` demanded a start date for any
> non-draft status, so abandoning a half-finished draft was refused — reproduced here before the fix
> (the UPDATE was rejected and the row stayed `draft`), and re-proved after it. Terminal states are
> now exempt, because cancelling *is* abandonment.
>
> **The catalog price snapshot was dead schema.** `catalogPriceId` was hardcoded `null` and the
> basis picker offered only negotiated/quote-pending, so six columns, an immutability trigger and a
> CHECK could never be reached — the owner's "explicitly labelled snapshot" had shipped as the
> override alone. Now wired end to end through a plan picker.
>
> **Four paths rendered raw Postgres constraint names to the tenant**, and the first was two clicks
> from the empty state: the term defaulted to `one_time` while the save gate ignored the term, so
> choosing "Not quoted yet" enabled a Save that could only ever fail with
> `violates check constraint "tca_price_basis_quote_ck"`. Every cross-field CHECK now has a sentence
> in front of it, and the gate knows which basis needs which term.
>
> **The FK proved a client EXISTS, never that it is YOURS.** A `service_role` writer — a future edge
> function, or Paige's own agent, which §10 requires the seam to allow — could have written
> `tenant_id = A` against a client of tenant B. Such a row is invisible to **every** caller including
> its own tenant's owner, while still occupying the live-agreement unique slot: silent dark data
> blocking a legitimate later agreement. `trg_agreement_tenant_links` now enforces it in the
> database, and the cross-tenant insert was **run and refused** in the pre-merge proof (0 dark rows).
>
> **The agreements read modelled authorization as an error channel** — the shipped `tenant_orders`
> lesson, committed one table over in a file whose own docstring names it. Proxying off
> `clientsReadable` looked right and fails for a **coach**, whose client read succeeds on assigned
> clients while the agreements read is row-filtered to the same subset: a coach in a workspace
> holding twelve would have been told "Nothing recorded yet." There is now a separate
> `agreementsReadable`, derived from this table's own policy shape, with a test for the coach case.
>
> Also fixed: a catalog-basis row became permanently uneditable once the offer's list price moved
> (the RPC re-read the live price while the snapshot stayed frozen and the CHECK demanded equality);
> `setAgreementStatus` sent the *current* tenant rather than the one the row was loaded against, so
> its refusal guard could never fire; terminal states could be reopened, rewriting what a client
> owed; and both trigger functions were `SECURITY DEFINER` with PostgreSQL's default
> `EXECUTE TO PUBLIC`.

**Deferred, and named rather than implied.** No deal or campaign link. The campaign side is not a
choice: `useSoloCampaigns.ts:181` hardcodes `campaigns = []` on every tier because the upstream
bridge is not tenant-authorized, so a campaign picker would be empty 100% of the time. The deal side
IS source-backed and is a real follow-up. Also deferred: `payment_schedule` and `title` exist as
columns and are not yet reachable from the editor.

**A naming collision, reported rather than resolved.** "Agreement" already means a SIGNED DOCUMENT
in seven places, including `clients.agreement_signed_at` on the very table this band reads and an
"Agreements" card on the same client's portal panel. The owner named the area "Agreements /
Retainers", so that is what it is called; the band's sub-line disambiguates in place ("signing and
documents stay with the client's own record") rather than renaming it. Whether to rename is CD's.

**Proof, separated by class (§13).** *Automated:* 109 tests (40 surface, 15 executed adapter, 54
sibling), typecheck exit 0, production build green, `lint:migration-versions`, `lint:definer-fns`,
`lint:tier-features`, `lint:skeleton`, `lint:write-targets` and gold-discipline all pass; eslint 0
errors. *Rendered:* **504/504** `drive:sales-ops` across four widths × both palettes, driving all
six terms states, and asserting that the catalog snapshot ($3,000 in the fixture) is never displayed
as what the client agreed ($2,500); **218/218** `drive:campaigns-nav`, all six tabs reachable.
*SQL executed:* the table, both triggers and both RPCs created and rolled back on prod; the
cancel-a-draft path reproduced broken and re-proved fixed; the cross-tenant insert refused.
*Production persistence:* **OWED until CI applies the migration** — the pre-merge proof is a
rollback, which proves the SQL runs and proves nothing about it being live (§32.a).
*Authenticated runtime:* **OWED.** No route to the deployed origin and no test-tenant credential
from this session.

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

## Business context readiness — the Spine contract behind Systems Check and PAIGE (released 2026-09-03)

Recorded here per §66 in the same change that shipped it. **LIVE on production** — PR #864, merge
`7ad98cff`, migration `20261112000000`, persisted-apply proven against a pre-merge baseline.

`public.get_business_context_readiness(uuid)` returns status + provenance (never a raw value) for
four Setup fields: `website`, `business_phone`, `industry`, `primary_business_email`. Always exactly
four rows, so "no signal" can never be confused with a read that failed quietly.

| Capability | God | Agency | Enterprise | Solo | Sub-account | Client | Anonymous |
|---|---|---|---|---|---|---|---|
| Read own workspace's business-context readiness | ✓ | ✓ | ✓ | ✓ | ✓ | 403 | 403 |
| Read own seat role + legal ownership (`team.authority`, #876) | ✓ | ✓ | ✓ | ✓ | ✓ | 403 | 403 |
| Connections reports business name/website/phone from Setup (#878, LIVE) | ✓ | ✓ | ✓ | ✓ | ✓ | 403 | 403 |
| Systems Check reports website / phone / industry from it | ✓ | ✓ | ✓ | ✓ | ✓ | 403 | 403 |
| PAIGE answers "what's configured right now" from it | ✓ | ✓ | ✓ | ✓ | ✓ | — | 403 |
| Name another workspace's tenant in the call | 403 | 403 | 403 | 403 | 403 | 403 | 403 |

**How each row is enforced, not asserted.** The tenant is always server-resolved from the caller's
own session (`current_user_tenant_id()`); a JWT caller's `_tenant_id` argument is ignored outright,
which is what makes the last row a flat 403 for every tier including God. The one caller permitted to
name a tenant is the service-role path (the Systems Check runners), honoured only because
`auth.uid()` is null there and the calling edge function already resolved that tenant from a verified
JWT.

**Client and Anonymous are refused by construction, not by omission.** `anon` holds no EXECUTE grant
at all (verified on prod). A workspace's own client IS an authenticated user of that same tenant, so
the in-body gate — `is_tenant_admin(v_tenant) or is_platform_owner()` — is what actually refuses
them; the capability declares `audience: owner_internal` and this is the predicate that keeps that
promise. A refusal returns four `unavailable` rows with reason `not permitted for this account`, so
the response shape holds and nothing leaks about whether any field is confirmed. PAIGE renders
**nothing** on a refusal rather than telling a client their coach's setup status is unreadable.

**Honest limit on the tier evidence.** The Client row is proven by the CI pgTAP file (18 assertions,
mutation-tested — reverting to a global role predicate turns 3 red), NOT on production: there are
currently zero active `tenant_members` whose role is not owner/admin, so no such caller exists on
prod to test with. It is a forward-looking guard for the first member or client ever added.

**Known visible change (§58).** Two tenants whose website/phone live only in the legacy
`tenants.brand` — never confirmed in Setup — now read `needs_confirmation`, flipping
`website_connected` and one `comms_configured` phone half from pass to fail. True under the
source-of-truth rule; surfaced for an owner decision rather than absorbed.

### Sales agreement schedule detail (2026-09-03, PR #895)

Solo Sales shows recorded start/renewal/end calendar dates without timezone day shifts. Recurring renewal absence is Not stated; non-recurring is Not applicable. The Slice 2 read/write authority matrix remains unchanged; no shared tier code, policy, writer or schema changes. See `docs/delivery/solo-sales-agreement-schedule.md`. Authenticated production and viewport proof owed.

### Solo Sales usability repair — Release 1 (2026-09-03)

**IMPLEMENTED IN PR #903; broader Sales UX remains PARTIAL.** PR #895 fixes date display only and does not close usability, actual editing, legal documents, signatures or payment collection. The current R1 changes make commercial-term editing reachable, repair drawer interaction/discard and workspace cleanup, provide canonical Catalog/Clients return paths, and replace the oversized client-billing banner with contextual payment-handling copy. The commercial-record surface is renamed **Commercial terms and retainers**; it generates, stores, sends and signs no legal document.

Solo owner/admin write authority is preserved. The source read/write matrix above is unchanged; there is no new Agency aggregation, sub-account capability, Operator/Admin behavior or permission grant. The owner cleared #706's historical collision after grounding main `12e495a`; Pipeline logic and the six-tab navigation are preserved. The narrow shared Clients return control renders only on the Solo Sales handoff.

See `docs/delivery/solo-sales-usability-r1.md` for flows and evidence: local eight-frame interaction verification passed; #903 merged at `c198d8ae` and its deployed revision was verified. Authenticated production persistence remains **Proof Owed**; the owner has confirmed several buttons work, not all flows. The existing Sales-to-Spine source contract remains restrictive and unchanged. Real document/signature capability is Release 2, requiring owner approval of its rendered full-flow prototype before implementation.

### Solo Sales workbench (2026-09-03)

Current implementation: commercial terms first, a five-row canonical offer finder with server name search/paging and exact selected-offer references, compact payment handling and expandable source-backed form/payment activity. Terms search/status filters explicitly cover the latest 200 loaded records; client identity remains the existing bounded directory, not all-history search. Catalog baseline prices, writes, six Campaigns tabs and Pipeline stay unchanged. No documents/signatures/payment collection added.

Owner superseded competing Sales PR #905; its separate Clients fix remains with that owner. R1 #903 is merged at `c198d8ae` and its production revision was verified; the older pending-release wording describes the pre-release ledger. Workbench release checks and exact deployment evidence: [Sales workbench](../delivery/solo-sales-workbench.md). Local Chromium covers all four widths/both themes and simulated 1/80/80000 offers; authenticated persistence and production large-catalog performance remain **Proof Owed**. Broader Sales remains **PARTIAL**.

### 2026-09-04 — Solo A2P preparation authority (candidate)

Solo owners/admins use the existing captured-tenant is_tenant_admin_as helper for preparation and save; the browser uses a current-workspace SELECT policy. Global staff compatibility is preserved. Workspace switches clear registration editing state and stale writes are rejected. This is not carrier registration or messaging readiness. Pending exact-head release and authenticated owner verification; see Master Project's Solo orchestration MVP entry.
