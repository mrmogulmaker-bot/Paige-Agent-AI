# Tier-Matrix Compliance Checklist Template

> **Status and authority.** The fixed six-row tier-matrix template the compliance/standards
> officer (§5) fills for every change under the §51 tier-parity railing. `CLAUDE.md` §9, §37,
> §32, §50/§51 remain canonical. Copy this file into the PR/handoff and fill it — a blank row
> or a `fails` row **BLOCKS ship**. This is a gate, not a note.

## §51 — the six components (header checklist)

The tier-parity railing is not one checkbox; it is six components that must **all** be present
for the change under review. Confirm each before filling the six-row grid:

- [ ] **1. Tier-matrix reference.** The change cites [`tier-matrix.md`](./tier-matrix.md) and
  names which of the canonical six it affects. Cite: `______`
- [ ] **2. Per-tier producer inventory.** A filled [`producer-inventory-template.md`](./producer-inventory-template.md)
  with every producer's tier named (Section C tier-coverage assertion complete). Link: `______`
- [ ] **3. Per-tier smoke tests.** Each reachable tier's path is exercised — headless where
  drivable (§32 Node smoke on crash-prone logic; `BEGIN…ROLLBACK` on write paths), or the
  live/owed-check named honestly where auth-gated (§32 capability-conditional). Evidence: `______`
- [ ] **4. Per-tier compliance checklist.** This document, six rows filled below.
- [ ] **5. Per-tier post-deploy walk on a tier NOT built on.** After deploy, walk a tier the
  change was **not** developed against (the reference build is almost always Standalone Tenant
  — so walk Agency, Sub-account, Client, or Anonymous). This is the §32/§5 post-deploy scan,
  aimed at the tier most likely to have been assumed. Tier walked + result: `______`
- [ ] **6. Task-ledger tier-tag.** The task/ledger entry is tagged with the tier(s) touched so
  a future session sees the tier surface at a glance (§12/§24). Tag: `______`

**Cross-refs:** §9 (platform vs tenant seam) · §37 (producer inventory) · §32 (dual-layer +
post-deploy verification) · §200 (no hardcoded live ids — name archetypes) · §50/§51
(tier-parity railing).

## Change under review

- **Change / PR:** `______`
- **Reference tier it was built on:** `______` (usually Standalone Tenant — the default posture)
- **Surfaces/endpoints touched:** `______`

## The six-row grid (fixed rows — none may be deleted)

For each tier, answer **works / fails / N-A-and-why** for the change under review. Ground each
answer in the resolver from `tier-matrix.md` — not "should be fine." A **blank row blocks**; a
**`fails` row blocks**; an **`N-A` row blocks unless the "why" is stated and defensible**.

| # | Tier | Verdict | Grounding — the real resolution path + what you verified | Blocks? |
|---|---|---|---|---|
| 1 | **God / Super Admin** | ☐ works ☐ fails ☐ N-A | `is_platform_owner()`→`is_super_admin()` (`user_roles.role='super_admin'`); act-as via `current_user_tenant_id()` `is_platform_admin` guard. Verified: `______` | ☐ |
| 2 | **Agency** | ☐ works ☐ fails ☐ N-A | own book + children via `agency_can_manage_child` / `agency_team_role`; `agency_specialist` limited to `scoped_subaccounts`. Verified: `______` | ☐ |
| 3 | **Standalone Tenant** | ☐ works ☐ fails ☐ N-A | `current_user_tenant_id()` via active `tenant_members`; `parent_tenant_id IS NULL`. Verified: `______` | ☐ |
| 4 | **Sub-account** | ☐ works ☐ fails ☐ N-A | `parent_tenant_id IS NOT NULL`; own book, **isolated from parent aggregate** AND agency still reaches down (two-sided). Verified: `______` | ☐ |
| 5 | **Client** | ☐ works ☐ fails ☐ N-A | `get_paige_persona_context()` via `clients.linked_user_id`; **`current_user_tenant_id()` returns NULL here** — a client surface calling it mis-scopes. Verified: `______` | ☐ |
| 6 | **Anonymous** | ☐ works ☐ fails ☐ N-A | `auth.uid()` NULL → all resolvers NULL/false; only public policies/RPCs. Verified no tenant data leaks via any public path: `______` | ☐ |

### How to answer each verdict honestly (§13)
- **works** — you exercised (or traced against the real resolver body) that tier's path and it
  resolves to the right scope with the right access. Name what you ran.
- **fails** — the change breaks or mis-scopes this tier. **Blocks ship.** File the fix; do not
  mark N-A to dodge it.
- **N-A** — this tier genuinely cannot reach the surface (e.g. an operator-only fleet RPC is N-A
  for Client/Anonymous; a client-portal RPC is N-A for God-as-operator). The **why** must name
  the resolver/policy that closes it — "N-A because no policy exposes this to `anon` and the RPC
  requires `is_tenant_member`" is defensible; a bare "N-A" is not and blocks.

## Tier-specific traps the officer must actively check

- **Sub-account vs Standalone (rows 3/4).** They share `account_type='standalone'`; a change
  that "works for a tenant" was likely only tested on Tier 3. Explicitly confirm Tier 4's
  isolation-in and agency-reach-down (Section E of the producer inventory).
- **Client calling the wrong resolver (row 5).** If any touched client surface calls
  `current_user_tenant_id()` it will get NULL. Confirm client paths use
  `get_paige_persona_context()` / the `clients` join.
- **God act-as breadth (row 1).** The operator can set `active_tenant_id` to any tenant via the
  `is_platform_admin` guard — confirm the change doesn't accidentally widen or narrow that
  act-as path, and that §17 governance (audit, two-key, break-glass) still binds destructive ops.
- **Anonymous leak (row 6).** "Public" is where tenant data leaks easiest. Confirm every public
  policy/RPC the change touches returns only genuinely-public data.
- **#589 nondeterminism.** If the change relies on tenant resolution for a multi-membership user
  with no client row and no `active_tenant_id`, note that `get_paige_persona_context()` steps 3–4
  are unordered `LIMIT 1` — the resolved tenant is nondeterministic. Don't build on it silently.

## Ship gate

- [ ] All six header components (§51) present.
- [ ] All six grid rows filled — **no blanks**.
- [ ] **Zero `fails` rows** (each fail fixed and re-verified, or the change scoped down).
- [ ] Every `N-A` row carries a defensible, resolver-named "why."
- [ ] Post-deploy walk (component 5) run on a tier the change was **not** built on.
- [ ] Task ledger tier-tagged (component 6).

If any box is unchecked, the change does **not** ship. This mirrors §5 (compliance officer
reports, does not rubber-stamp) and §32 (verification is proven, not assumed).

## Canonical references
- `CLAUDE.md` §9 — platform vs tenant seam.
- `CLAUDE.md` §37 — producer inventory.
- `CLAUDE.md` §32 — dual-layer + post-deploy verification.
- `CLAUDE.md` §200 — no hardcoded live tenant/user ids (name archetypes).
- `CLAUDE.md` §50 / §51 — tier-parity railing.
- [`tier-matrix.md`](./tier-matrix.md) — the canonical six + live-grounded resolvers.
- [`producer-inventory-template.md`](./producer-inventory-template.md) — the §37 × tier grid.
