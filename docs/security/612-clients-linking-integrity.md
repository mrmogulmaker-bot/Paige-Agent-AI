# #612 — clients-linking integrity (§9 HIGH, paired with #611)

**Status:** scoping / design (draft PR placeholder). Ships as the **next P0**, ahead of the P1c agency-widening wave (queue: #611 → #612 → P1c Slices 1+2).

## Why this exists

#611 tenant-scoped the `credit-report-uploads` admin storage policies so a reader must be
`is_platform_owner()` **or** a tenant-admin of the tenant that owns the client whose folder this is
(`folder[1] → clients.linked_user_id / clients.id → clients.tenant_id → is_tenant_admin`). That closes
the **direct, passive** cross-tenant read.

The #611 adversarial verifier caught the **paired hole** that keeps the bug *class* open: the storage
policy trusts the `clients` table as its tenant oracle, but `clients` is **admin-writable without tenant
or `linked_user_id` scoping**. So the oracle is forgeable.

### The forge chain (what #612 must close)

`clients` has five OR'd write policies (verified live, prod `xygzykjyynhzqytbqnzu`):

| policy | scope |
| --- | --- |
| `clients_admins_full` | `has_any_role(admin, super_admin)` — **UNSCOPED** (the hole) |
| `clients_coaches_assigned` | coach + assigned — scoped |
| `clients_cs_rep_assigned_full` | cs_rep + assigned — scoped |
| `clients_sales_rep_assigned_full` | sales_rep + assigned — scoped |
| `tenant_isolation` | `is_platform_owner() OR tenant_id IS NULL OR tenant_id = current_user_tenant_id() OR linked_user_id = auth.uid()` |

A global-admin who is also a tenant-admin of tenant A can `INSERT` a `clients` row
`{tenant_id = A, linked_user_id = <victim's auth uid>}` — permitted by `clients_admins_full` — after which
#611's storage `EXISTS` matches (`is_tenant_admin(A)=true AND folder = victim uid ∈ (linked_user_id)`) and
the victim's cross-tenant credit report is readable again. Live: 8 users hold global `admin`, 7 of them are
also tenant owner/admin — i.e. the forge is available to exactly the population #611 targets.

**Key subtlety:** merely tenant-scoping `clients_admins_full` to `tenant_id = current_user_tenant_id()`
does **NOT** close it — the attacker sets the row's `tenant_id` to *their own* tenant A; the forge lives in
the attacker-controlled **`linked_user_id`**, not in `tenant_id`. The real close is **linking integrity**:
`linked_user_id` must only ever be set to a user who genuinely linked to that tenant.

## Design direction (to be finalized by the crew)

1. **`linked_user_id` is set only by the invite-accept path.** `accept_tenant_invite` (SECURITY DEFINER)
   is the sole legitimate writer that links a real auth user to a `clients` row. No browser write policy
   (admin/coach/cs_rep/sales_rep) may set `linked_user_id` to an arbitrary user.
2. **Harden `clients_admins_full`** (and audit the coach/cs_rep/sales_rep ALL policies) with a `WITH CHECK`
   that forbids setting `linked_user_id` to a foreign user — likely: admin/staff inserts require
   `linked_user_id IS NULL` (unlinked contact record); linking happens only on accept. Also tenant-scope the
   admin write (`tenant_id = current_user_tenant_id()` for non-super) as defense-in-depth and to match
   §385/§398/§481 posture — but linking integrity is the load-bearing part.
3. **Do not trust an admin-writable column as a cross-tenant authorization oracle** anywhere else — sweep
   for other policies that key authZ on `clients.linked_user_id` / `clients.tenant_id`.

## Mandatory pre-merge (per doctrine)

- **§37 producer inventory** of every `clients` write that sets `linked_user_id` via a **browser JWT**
  (vs service-role, which bypasses RLS) across the eight caller classes — confirm no legitimate onboarding /
  CRM add / import flow sets `linked_user_id` directly and would break under the `WITH CHECK`.
- **§32 dual-leg proof** — pre-merge `BEGIN..ROLLBACK` (assert the forge is denied: an admin cannot INSERT a
  `clients` row with a foreign `linked_user_id`; legitimate unlinked-contact create + invite-accept linking
  still succeed) + post-merge persisted-apply confirmation on prod.
- **§51 tier matrix** across God / Agency / Standalone / Sub-account / Client / Anonymous.
- Own crew (implementer + adversarial §9 verifier + compliance officer), same discipline as #611.

## Current live exposure (honest, for temporal-window judgment)

`credit-report-uploads` bucket: **0 objects.** `clients`: **3 rows, all `linked_user_id = NULL`.** The window
between #611 (merged) and #612 (this) carries near-zero practical exposure; the forge additionally requires an
attacker-side, **audit-logged** INSERT.
