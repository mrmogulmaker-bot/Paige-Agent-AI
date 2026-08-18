# Role Taxonomy & Matrix

**Owner-directed 2026-08-18:** *"We should make sure all of the roles are tenant scoped before we
move on. Everything about our platform needs a Taxonomy and Matrix. Some form of organization so we
can recall it whenever we need to."*

This is the **one home** (§18) for *who holds what authority, in which store, at which scope, and
who may grant it*. It is the role twin of `tier-matrix.md` (which answers *which account types
exist*) and `route-and-url-taxonomy.md` (which answers *which URL belongs to whom*). Cross-reference
those; do not duplicate them here.

Every number in §4 and §5 is a real query result against prod (`xygzykjyynhzqytbqnzu`) on
2026-08-18, not an estimate (§13).

---

## 1. The three role stores

The platform has **three** places a role can live. Two are correctly scoped. One is not.

| Store | Scope key | Grants authority over | Scoped? |
|---|---|---|---|
| `user_roles` | `user_id`, `role` — **NO tenant column** | Everything, everywhere | ❌ **GLOBAL** |
| `tenant_members` | `tenant_id`, `user_id`, `role`, `status`, `is_owner` | One tenant | ✅ tenant |
| `agency_team_members` | `agency_tenant_id`, `user_id`, `agency_role`, `status`, `scoped_subaccounts` | One agency (+ optional sub-account subset) | ✅ agency |

**The defect is structural, not accidental:** `user_roles` has no `tenant_id`, so *any* role stored
there is platform-wide by construction. `has_role(uid,'admin')` cannot mean "admin **of tenant X**"
— it can only mean "admin **somewhere**". This is the §59 *global-role trap*.

---

## 2. The taxonomy — every `app_role` value, classified

`app_role` has 15 values. They fall into three classes, and the class determines the correct store.

### Class A — PLATFORM-GLOBAL (correctly in `user_roles`)
Operator tiers. Global is the *intent*: they act across all tenants (§53).

| Role | Meaning | Correct store |
|---|---|---|
| `super_admin` | God tier. Grants any role. Bootstrap-only, invite-only via an existing super_admin. | `user_roles` ✅ |
| `platform_admin` | Delegated operator. Fleet/support/provisioning. Cannot grant super_admin, cannot pass `is_platform_owner()`. | `user_roles` ✅ |

### Class B — TENANT-SCOPED (currently mis-stored in `user_roles`)
These describe a person's authority **inside one business**. Global storage is a category error:
being "a coach" is meaningless without answering *whose coach*.

| Role | Meaning | Correct store |
|---|---|---|
| `admin` | Runs a tenant's workspace | `tenant_members.role` |
| `coach` | Serves that tenant's clients | `tenant_members.role` |
| `client` | An end customer **of** a tenant | `tenant_members` / `clients` linkage |
| `sales_rep` | Sells for a tenant | `tenant_members.role` |
| `cs_rep` | Support for a tenant | `tenant_members.role` |
| `finance` | Books for a tenant | `tenant_members.role` |
| `viewer` | Read-only within a tenant | `tenant_members.role` |
| `moderator` | Moderates within a tenant | `tenant_members.role` |
| `affiliate` | Refers into a tenant | tenant-scoped affiliate table |
| `broker` / `broker_team_member` | Broker vertical | tenant-scoped |
| `developer` | Build access to a tenant | `tenant_members.role` |

### Class C — BASELINE
| Role | Meaning | Note |
|---|---|---|
| `user` | Authenticated, no authority | Carries no grant; safe anywhere. Candidate for retirement. |

### Agency rail — a separate, already-correct axis
`agency_team_members.agency_role` is **not** an `app_role`. It is agency-scoped by construction and
is already right. Live values: `agency_owner`, `agency_admin`.

---

## 3. The matrix — scope × authority × grant path

| Role | Store | Scope | Who may grant | Gate helper |
|---|---|---|---|---|
| `super_admin` | `user_roles` | Platform | **Only** an existing super_admin (DB trigger enforced, §53) | `is_super_admin()` / `is_platform_owner()` |
| `platform_admin` | `user_roles` | Platform | **Only** a super_admin (same trigger) | `is_platform_admin()` / `is_platform_operator()` |
| `agency_owner` | `agency_team_members` | One agency | Agency owner / super_admin | `agency_current_id()` + `agency_team_role()` |
| `agency_admin` | `agency_team_members` | One agency | Agency owner | same |
| `owner` | `tenant_members` | One tenant | Tenant owner / provisioning | `is_tenant_member()` + role check |
| `admin`, `coach`, `sales_rep`, … | `tenant_members` **(target state)** | One tenant | Tenant admin/owner | tenant-scoped check |

**Hard rule (§59):** cross-tenant authority is `is_platform_owner()` / `is_platform_operator()` —
**never** a tenant-level `app_role`. A function branching on `has_role(uid,'admin')` to permit a
cross-tenant action is a §9 leak, because that `admin` is global.

---

## 4. Current live state (prod, 2026-08-18)

Grants in `user_roles`:

| Role | Holders | Class | Verdict |
|---|---|---|---|
| `admin` | 9 | B | ❌ mis-scoped |
| `coach` | 3 | B | ❌ mis-scoped |
| `client` | 2 | B | ❌ mis-scoped |
| `user` | 2 | C | ⚠ baseline, harmless |
| `sales_rep` | 1 | B | ❌ mis-scoped |
| `super_admin` | 1 | A | ✅ correct |
| `platform_admin` | 0 | A | ✅ correct |
| all others | 0 | — | — |

**15 tenant-level grants sit in a global table.** Mitigating fact: most reads *also* filter by
tenant via RLS (`current_user_tenant_id()`), so this is a latent structural weakness rather than a
confirmed live leak. It is not proven safe either — that is exactly what §5's audit must establish
per call site.

---

## 5. Blast radius (why this is not a one-shot change)

Live prod objects referencing `has_role` / `has_any_role` / `user_roles`:

| Surface | Count |
|---|---|
| RLS policies | **186** |
| …across tables | **91** |
| Database functions | **118** |
| Migrations referencing | 244 |
| Edge functions | 68 |
| Frontend files | 33 |

This is the platform's authorization backbone. A wrong move in one direction locks every user out;
in the other it opens cross-tenant reads. **Therefore: no big-bang migration.**

---

## 6. Migration plan — safe slices

Each slice is its own PR with a §37 producer inventory, §32 proof, and §39 peer-gate.

- **R0 — This document.** Taxonomy + matrix + audit. No code. *(you are here)*
- **R1 — Classify every call site.** Mechanically label all 186 policies + 118 functions as:
  (a) legitimately platform-global → migrate to `is_platform_operator()`;
  (b) already tenant-filtered → cosmetic;
  (c) **genuinely relying on a global tenant-role** → the real defects.
  Output: a checked-in inventory. Still no behaviour change.
- **R2 — Fix class (a).** Swap operator-intent checks to the operator helpers. Low risk, well-understood.
- **R3 — Fix class (c) defects**, highest-severity first, one family per PR.
- **R4 — Backfill + dual-read.** Ensure every Class-B grant exists in `tenant_members`; make helpers
  read tenant-scoped first, global second. Reversible.
- **R5 — Cut over and constrain.** Once no reader depends on global Class-B roles, add a DB CHECK so
  `user_roles` accepts **only** Class-A roles. Structural, not conventional (the §51/§53 pattern).

**Do not skip to R5.** The constraint is the *end* of the migration, not the start.

---

## 7. The standing rule

> A role in `user_roles` is a claim about the **platform**. A role in `tenant_members` is a claim
> about **one business**. Only Class-A operator tiers belong in the former.

**The test, every time:** *"Does this role mean something without naming a tenant?"* If it does not,
it is tenant-scoped and must not be authorised from `user_roles`.

**Cross-references:** §9 (tenant isolation) · §51 (tier matrix — the account-type twin) · §53
(operator tiers, grant lockdown) · §59 (SECURITY DEFINER caller scope; the global-role trap) · §37
(producer inventory) · `tier-matrix.md` · `route-and-url-taxonomy.md`
