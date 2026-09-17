# #826 grounding — setup-gate ↔ canonical-shell redirect cycle (PR 1, parity train)

**Date:** 2026-09-13 · **Base:** `b18de819` (fresh main) · **Branch:** `solo-826-setup-gate-cycle`
**Flow-by-Flow:** the synced third-party skill is not present in this environment (verified in the
prior session; only `second-brain` + `paige-ui-design` ship repo-local). The doctrine-hierarchy
equivalent ran at authentication/routing-boundary depth: CLAUDE.md §00/§13/§18/§58/§59/§65, the
#826/#790/#811 issue texts, `workspaceEntry.ts` (the #811 architecture, read in full),
`RequireSetupComplete.tsx`, `SoloEntry.tsx`/`BusinessEntry.tsx`, `App.tsx` route tree,
`workspaceRootForTenant`, `save_solo_business_context` (migration 20261103000000), the
`/admin`-retirement test, and read-only production measurements.

## The defect, remapped on current main

#826 as filed described an **admin ↔ solo redirect loop**: the gate held tenants on
`/admin/marketplace`; Admin's Solo gate (canary on) redirected `/admin/*` to
`/solo/{n}/command-center`; `/solo/*` was also gate-wrapped → bounce back, forever.

**The world moved under the issue.** #995 retired `/admin` entirely (asserted by
`admin-route-retirement.test.ts`: no `/admin` route mounts, no executable `/admin` literals in the
entry flow). Post-retirement, EVERY standalone Solo tenant routes to `/solo/{n}/…` via the
tier-based `workspaceRootForTenant` (#811) — the `solo_shell_enabled` canary is derived in
`useTenantContext` but referenced by no production code (tests only). Both of the issue's gate
legs are gone. What remains is the same trap in its **dead-end hold** form:

1. `RequireSetupComplete` (App.tsx:296/299 wraps `/business/*` and `/solo/*`) redirects a
   playbook-less Solo/Sub-account tenant to `canonicalSetupPath` — the shell's OWN Setup
   (`/solo/{n}/settings/setup`, `/business/{n}/setup`). Both are real, rendering routes
   (verified: `settings/setup` is a valid solo subtab; `setup` is a valid AgencyApp branch for
   business mode). No router loop.
2. **But the gate can never open.** Its setup-complete signal is `features.playbook` (non-empty)
   or `features.playbook_config` present — and on current main NOTHING reachable writes either:
   - The only playbook-writing UI, `src/pages/admin/Marketplace.tsx` (→ `marketplace-install`),
     is **orphaned** — zero importers since `/admin` retired.
   - The in-shell Marketplace (`src/solo/marketplace.tsx`) is deliberately read-only
     ("not installed, activated, purchased, or executed from this page").
   - The in-shell Setup surfaces write business context (`save_solo_business_context`,
     `tenant_setup_*` tables) — no tenant-features marker, no playbook.
3. So a playbook-less tenant is held on Setup **permanently**: every other route bounces them
   back, and the surface they're held on cannot open the gate. The gate's own header still cites
   the removed auto-provisioner and the retired admin marketplace as its writers.

**Structural proof** (walked mechanically above): `/solo/42/command-center` → redirect →
`/solo/42/settings/setup` → renders → **DEAD-END** (no reachable writer for the open-signal).

**Production ground truth (read-only, 2026-09-13):** 10 standalone Solo tenants — 7 with a
playbook, **3 without**; 4 canary-on, **0 canary-on without playbook**; 0 sub-accounts without a
playbook. So the trap is latent in exactly the issue's sense (no canary∩playbook-less overlap
today) but **already live for any playbook-less standalone tenant**, because post-#995 routing
no longer consults the canary: those 3 tenants would be held on Setup on their next visit.
**#790 (enabling more shell tenants) widens the exposure to every eligible playbook-less tenant.**

## Ownership map (current main)

| Concern | Owner |
|---|---|
| Which tiers pick a business playbook (are gated) | `RequireSetupComplete` via `resolveTierKey` (§60 one home) |
| Where a gated tenant is sent | `canonicalSetupPath` (shell's own Setup per tier) |
| Which root a tier enters at | `workspaceRootForTenant` / `authorizedRootForTier` (#811, tier-based, canary-free) |
| Whether a caller's tier owns a shell route | `decideWorkspaceEntry` (SoloEntry/BusinessEntry) |
| Setup-completion truth | `features.playbook` / `playbook_config` — **writers: none reachable** |
| In-shell Setup persistence | `save_solo_business_context` (20261103000000) — writes `tenant_setup_*`, bumps revision, **writes no tenant feature** |
| #811 adjacency | Its `/admin`-door scoping (`Admin.entryGate.test.tsx`) is gone with the door; the chooser/exit-control population lives in `workspaceEntry.ts` — untouched by this PR |

## The correction (narrow)

**The setup-complete signal must recognize the canonical V3 setup journey's own completion** —
the same pattern the gate's header already documents for the retired marketplace path
("Completing X writes features.Y synchronously, so the gate opens the moment they choose"):

1. **Migration (`20270323000000`, renumbered off a second collision — main took 20270126):**
   an AFTER INSERT/UPDATE trigger on `tenant_setup_business_context_meta` (the row every
   successful setup save bumps, inside the save RPC's transaction) records
   `features.solo_setup_complete = true` on the tenant in the same commit. The save RPC itself
   is untouched; no schema change, no new surface, no provisioning change.
2. **Gate:** setup-complete = playbook markers OR `features.solo_setup_complete === true`.
   Destination logic, tier scoping, staff/agency no-ops, and fail-open loading posture are all
   untouched. Sub-account behavior is byte-identical (nothing writes the marker for them; the
   legacy playbook markers still govern them exactly as before).
3. **In-session open:** the business-context save path refreshes tenant context on success
   (the marketplace precedent, `void refreshTenant()`, applied to the surface that now owns
   completion) so the gate opens without a reload.

**What this deliberately does NOT do:** no legacy-admin fallback (the shell owns Setup — the
directive stands); no Setup redesign (the existing save now also records completion); no
provisioning rebuild; no second chooser; no tenant-name/account-number branches; no canary
change (the flag stays as-is, unused by this fix); no rollout.

## Regression/proof plan (failing-first)

A **journey suite** that walks the complete redirect cycle — the real guard order
(`RequireCompleteSignup → RequireSoloBetaEntitlement → RequireSetupComplete`) over the real
route decisions, not single-component snapshots:

1. **Failing on main:** eligible Solo + no playbook → held on `/solo/{n}/settings/setup`; then
   the canonical setup COMPLETES (the only completion the shell offers) → the gate must open →
   `command-center` renders. On main there is no writer for any open-signal, so the second half
   fails — the trap, reproduced.
2. Solo + playbook present → straight to the canonical destination (no gate interference).
3. No widening: staff / agency / anonymous no-op exactly as before; no `/admin` literal appears
   in the changed executable source (retirement contract preserved).
4. Sub-account: same destination, same signal semantics as main (marker never written for them).
5. Back/forward + repeated guard evaluation: while gated, repeated evaluation stays on Setup
   (no oscillation); after completion, returning to a formerly-gated route does not re-trap.
6. No tenant-specific exception: source-level assertion on the gate (no account-number/name
   literals); the signal is tenant-generic config-as-data.

Plus the full adjacent suites: `admin-route-retirement`, `workspaceEntry`, ChooseAccount,
SoloEntry/BusinessEntry, the setup contract family, and the auth gate tests.

## PROOF OWED

- The RPC marker write is proven by contract tests + CI's database replay; an authenticated
  live journey (a real playbook-less tenant completing Setup in the shell) is owed to a
  credentialed session — the same boundary as every prior routing PR.
