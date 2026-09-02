# Roles & Permissions — domain brain

**Read this before touching any role check, RLS policy, or `SECURITY DEFINER` function.**
Authoritative design: `docs/doctrine/role-taxonomy-and-matrix.md`. Live audit:
`docs/audits/R1-role-call-site-inventory.md`. This file is the fast answer to
*"how do roles actually work here?"*

## The three stores (conflating them IS the §59 bug)

| Store | Scope key | Tenant-scoped? |
|---|---|---|
| `user_roles` | `user_id`, `role` — **no `tenant_id`** | ❌ **GLOBAL by construction** |
| `tenant_members` | `tenant_id`, `user_id`, `role`, `status`, `is_owner` | ✅ tenant |
| `agency_team_members` | `agency_tenant_id`, `user_id`, `agency_role`, `scoped_subaccounts` | ✅ agency |

`is_tenant_member()` reads **only** `tenant_members` (`status='active'`) — never the agency rail.

## The one fact that changes how you read every guard

`map_tenant_role_to_app_role()` maps tenant **`owner` → `admin`** and **`admin` → `admin`**, and
trigger **`trg_sync_tenant_member_to_user_roles`** (ENABLED on `tenant_members`) writes it into the
tenant-less `user_roles`.

**So `has_role(auth.uid(),'admin')` means "any tenant owner on the platform," not "a trusted
operator."** Measured 2026-08-18: 9 `admin` holders across 10 of 13 tenants; 1 `super_admin`.

## Which helper to reach for

- Cross-tenant / platform authority → `is_platform_operator()` (super_admin OR platform_admin).
- God-tier / integrity gates → `is_platform_owner()` — **frozen super_admin-only**, do not widen.
- Tenant-scoped authority → `tenant_id = current_user_tenant_id()` **AND** a role check.
- **Never** authorise a cross-tenant action on a tenant-level `app_role` (§53/§59 global-role trap).

## Live shape (prod, 2026-08-18)

- `app_role` has 15 values. Class A = `super_admin`, `platform_admin`. Class C = `user`. Everything
  else is Class B (tenant-level) and is currently mis-stored in the global table — 15 such grants.
- Role predicates appear in **186 RLS policies / 91 tables / 118 DB functions**; **117 of 118
  functions are `SECURITY DEFINER`** (RLS bypassed — the in-body check is the only guard).
- **The corpus undercounts.** Policies that call `is_admin()` / `is_staff()` / `studio_role_ok()` /
  `check_feature_access()` reach `user_roles` one level down and match none of the
  `has_role|has_any_role|user_roles` tokens. Closing that is R2b.

## Solo Team descriptive work data (2026-09-01 reconciliation)

- `tenant_members.job_title` and `tenant_members.responsibilities` are now on `main` through PR #697 (`3fd9944cd90e02794db21fa2ae6d32703fe89ea4`). They are descriptive tenant data only; `role` and `is_owner` remain the only enforced permission inputs.
- PR #702 (`81e350ca477b9334e62dc636c2a8b57f891917df`) added truthful stored-name/email fallback and work-detail editing. GitHub records show both PRs merged and successful Production deployment statuses; this reconciliation did **not** establish a fresh production row-level query. Authenticated save, invite, permission, account-switch, and email behavior remain **UNVERIFIED**.
- **PAIGE Team mutation policy (owner, 2026-09-02):** for MVP, every PAIGE-mediated Team write is
  `owner_only` with owner confirmation and no auto lane, including work-profile edits, invite/send/
  resend/revoke, role/permission grant/revoke/change and any access-affecting act. Catalogue rows and
  applied migrations prove presence/configuration, not the authenticated Chat → approval → executor
  → persisted outcome chain. Current #728 source classifications are not yet aligned; PAIGE Team
  mutation capability and owner-visible Team history remain unproven/unavailable. Human Team UI
  authority is separate and remains governed by its domain contract.

## Not yet built

- No custom-roles table, no permissions table (`user_roles` is the only role table).
- `app_role` has **no** `sales_lead` / `closer` / `appointment_setter` / `sdr` / `sales_ops`
  (only `sales_rep`). The owner-ruled sales catalog is entirely net-new.

## Migration state (6-slice plan, taxonomy doc §6)

R0 doc ✅ · **R1 inventory ✅** · R2a workflow-registry seam ✅ · R2b wrapper closure ⬜ ·
R3 c1/c2 defects ⬜ · R4 backfill + dual-read ⬜ · R5 Class-A-only CHECK ⬜.
**Do not skip to R5** — the constraint is the end of the migration, not the start.
