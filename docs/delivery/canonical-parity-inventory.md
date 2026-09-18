# PAIGE Canonical Parity Inventory — PR 2 (read-only grounding)

**Date:** 2026-09-17 (corrected same day per coordinator reconciliation) · **Base:** `3da53ec8` (#1269 merged) · **Program:** Canonical Parity, PR 2 of the train
**Method:** Flow-by-Flow discipline applied at the authentication/routing-boundary depth. The synced third-party Flow-by-Flow skill is absent from this environment (established in prior PRs); the doctrine-hierarchy equivalent ran: every claim below was traced in code or queried read-only from production — none inferred from naming alone.

## 1. The resolution chain, as traced in current code

```
authenticated identity (supabase session)
→ resolveLandingRoute(userId)                          src/lib/auth/resolveLandingRoute.ts
   roles: super_admin|platform_admin → /choose-account (operator chooser)
   roles: admin|coach → resolveAgencyLanding() ?? /choose-account
   client link → /onboard|/app ;  owned tenant → workspaceRootForTenant()
→ account chooser /choose-account → workspaceRootForTenant(tenant)
→ tier resolution: resolveTierKey()                    src/lib/tier/tierFeatures.ts
   parent-first: parent_tenant_id ⇒ sub_account (regardless of account_type)
   account_type: agency ⇒ agency; enterprise ⇒ enterprise; sub_account ⇒ sub_account;
   standalone|null|unknown ⇒ solo (least-privileged fail-safe)
→ shell selection: decideWorkspaceEntry(root, tier)    src/lib/auth/workspaceEntry.ts
   ROUTE_TIERS: /solo ⇐ solo · /business ⇐ sub_account · /agency ⇐ agency|enterprise
   wrong tier → own authorized root or the chooser (fail-closed, never a convenience fallback)
→ route roots mounted in App.tsx:
   /solo/*  → RequireCompleteSignup → RequireSoloBetaEntitlement → RequireSetupComplete → SoloEntry → SoloApp
   /business/* → RequireCompleteSignup → RequireSetupComplete → BusinessEntry → AgencyApp(sub-account mode)
   /agency/* → AgencyEntry (bare ⇒ legacy AgencyLayout; numeric ⇒ AgencyApp)
   /operator/* → OperatorEntry (login leg outside RequireOperator)
→ setup gate: RequireSetupComplete (#1269: playbook | playbook_config | solo_setup_complete)
→ capability state: useTierFeatures() over the tier matrix (src/lib/tier/tierFeatures.ts)
```

## 2. The structural account-type taxonomy (code + production)

The DB CHECK constraint (`tenants_account_type_chk`) admits exactly four `account_type` values: `standalone`, `agency`, `enterprise`, `sub_account`; the column default is `standalone`. `resolveTierKey` maps them to five runtime tiers (the fifth, `god`, is role-based staff with no tenant). Production (read-only, 2026-09-17): **16 tenants — 10 standalone (unparented), 2 agency (unparented), 4 sub_account (all parented)**; zero `enterprise` rows; zero null `account_type`; zero missing `account_number`.

Structural categories found: **Solo/standalone** (10), **Agency** (2), **child/sub-account** (4), **Platform Operator** (role-based control plane, no tenant rows — `super_admin`/`platform_admin` via `/operator` + the chooser), **Enterprise** (structurally admitted by the constraint and ROUTE_TIERS but ZERO rows on production — the taxonomy keeps it; the data does not exercise it). No invalid/unclassified state found.

## 3. The canonical parity matrix

Machine-readable artifact: `docs/delivery/canonical-parity-matrix.json` — **de-identified**: rows keyed by local aliases (T01…T16) valid only inside the artifact; no uuids, account numbers, names, emails, or slugs, and no reversible mapping in the repo. The summary block is DERIVED from the rows and CI validates the arithmetic. Per-account verdicts across the 16:

| Category | rows | of which canceled (N/A) | Expected canonical shell | Resolved today | Enterable verdict |
|---|---|---|---|---|---|
| Solo (shell flag on) | 4 | 0 | `/solo/{n}` SoloApp | `/solo/{n}` | **CANONICAL ×4** |
| Solo (shell flag off/unset) | 6 | 1 | `/solo/{n}` SoloApp | `/solo/{n}` SoloApp — **flag not consulted** | **CANONICAL ×5; NOT APPLICABLE ×1** (canceled) |
| Agency (flag on) | 2 | 0 | `/agency/{n}` AgencyApp | numeric leg gated on `agency_shell_enabled` = true | **CANONICAL ×2** |
| Sub-account | 4 | 2 | `/business/{n}` AgencyApp(sub mode) | `/business/{n}` | **CANONICAL ×2; NOT APPLICABLE ×2** (canceled) |
| Operator | — | — | `/operator` console | role-gated | **NOT APPLICABLE** (role-based, no tenant rows to compare) |
| Enterprise | 0 | — | — | — | **NOT APPLICABLE** (zero rows) |

Row arithmetic: 4+5+2+2 = **13 enterable CANONICAL**; 1+2 = **3 canceled NOT APPLICABLE**; 13+3 = **16 rows** — matching the CI-enforced matrix summary.

**Counts, derived from the matrix rows (CI-enforced): 16 rows, all structurally valid; 13 CANONICAL (enterable parity); 3 NOT APPLICABLE (canceled — status-deny-listed, no enterable experience to compare); 0 CONFIGURATION DRIFT; 0 PROVISIONING DRIFT; 0 LEGACY ROUTING DEBT; 0 INVALID STRUCTURAL STATE.** Two nuances recorded as drift-debt rather than live divergence: (a) the 5 enterable flag-off Solo accounts are canonical only *by accident of the flag being dead* (the 6th is canceled — NOT APPLICABLE) — the flag values themselves are stale configuration (cleanup debt, not experience divergence); (b) `solo_setup_complete` reads false on every row because the #1269 trigger ships with this train — the gate opens today via the legacy playbook markers for the 9 setup-complete accounts; the 3 playbook-less accounts (2 trial + 1 test fixture) will set the marker on their first save.

## 4. Answers to the ten mandated questions

**Q1 — Does `solo_shell_enabled` still control any production path on current main?** **No.** `useTenantContext` still derives `soloShellEnabled` (features → boolean), but a consumer sweep finds ZERO production consumers outside the producer — only test fixtures and one stale comment (`WorkspaceExitControl.tsx:35`). Post-#995 (the `/admin` retirement), every standalone Solo tenant routes to `/solo/{n}` through the tier-based `workspaceRootForTenant`/`decideWorkspaceEntry`, which never read the flag.

**Q2 — If yes, where?** Not applicable for solo. The AGENCY twin is live: `resolveLandingRoute.ts:98` (`ctx.agency_shell_enabled !== true → bare /agency` legacy board) and — per its own docblock — the retired `/admin` Gate A's shape, now carried only in the landing resolver. That is the one remaining canary-gated production decision.

**Q3 — Is it dead configuration debt?** `solo_shell_enabled`: **yes — dead configuration debt** (4 tenants carry `true`, 6 carry nothing; the value changes nothing). Cleanup for Cursor: remove the derivation + the 4 stale feature values + the stale comment. `agency_shell_enabled`: **live** for the agency numeric-shell decision — NOT debt yet; it is the temporary rollout control the owner architecture ruling explicitly permits, and both agency tenants already carry `true`, so removing it is a small, safe future step once the owner rules the legacy board retired.

**Q4 — What determines a Solo account gets the canonical shell?** Structural typing alone: `resolveTierKey` (no parent + `standalone`/default) → tier `solo` → `ROUTE_TIERS.solo` authorizes `/solo` → `workspaceRootForTenant` emits `/solo/{n}/command-center` (with `workspaceRootForTenant`'s literal `account_type === 'standalone'` safety pin). No flag, no identity, no date.

**Q5 — Agency shell ownership?** Two legs in `AgencyEntry`: bare `/agency` → legacy `AgencyLayout`; numeric `/agency/{n}` → `AgencyApp`. Login-side, `resolveLandingRoute` emits the numeric URL only when `agency_switch_context()` reports `is_agency_manager` AND `agency_shell_enabled = true` AND a rail-visible membership (RLS-provable). `ROUTE_TIERS.agency = [agency, enterprise]`.

**Q6 — Platform Operator entry?** `/operator/*` → `OperatorEntry` (login leg outside the guard) → `RequireOperator` (`is_platform_admin()` — `super_admin` OR `platform_admin`). Landing: both roles are forced to `/choose-account` — never auto-entered. Agency-team invitees without `tenant_members` land on bare `/agency` (legacy board) — a recorded, deliberate §58 exception (the numeric shell cannot resolve their identity), bounded cleanup debt for Cursor.

**Q7 — Today's provisioning path for a new standalone Solo tenant?** Two paths: (a) **public signup** → `tenant-signup` (pre-confirmed user) → the onboarding flow calls the `provision_tenant` RPC (`standalone`, trial, slug, brand; auto account-number via `trg_assign_tenant_account_number`; `ensure_tenant_features_row` trigger creates the features row; entitlements + email identity + default calendar via triggers); (b) **paid Solo Beta** → checkout → `solo-beta-stripe-webhook` → `solo_beta_fulfill_checkout` (atomic: tenants INSERT with `account_type='standalone'` CHECK, `features.solo_beta_offer_code` marker, billing account, subscription). Operator path: `operator_provision_tenant` (the ProvisionTenantDialog seam) → same RPC family.

**Q8 — Does provisioning guarantee the canonical baseline automatically?** **Yes for shell routing** (nothing to guarantee: routing is structural — a new standalone tenant lands in `/solo/{n}` by typing, no flag needed). **No explicit baseline artifact exists**: `provision_tenant` writes NO features (no `solo_shell_enabled` — correctly, since it's dead; no playbook — deliberately, the #826 gate holds them on Setup until they choose). The canonical-baseline "guarantee" is currently emergent from the routing refactor, not asserted by provisioning.

**Q9 — Existing same-type accounts requiring manual repair today?** **None for shell parity** (13/13 enterable rows canonical; the 3 canceled rows are NOT APPLICABLE, not divergent). The 6 stale `solo_shell_enabled` values are cosmetic debt. The one real repair-shaped item: the 3 playbook-less Solo tenants are gated on Setup and will complete via the #1269 marker — no manual action needed.

**Q10 — The exact PR 3 delta:** (1) make the canonical baseline EXPLICIT at provision time — a provisioning assertion/trigger that a new `standalone` tenant is structurally routable to `/solo/{n}` (account_number assigned, features row exists, tier resolvable) — turning the emergent guarantee into a contract; (2) retire the dead `solo_shell_enabled` derivation + stale values (or fold into Cursor's cleanup if the owner prefers); (3) decide the `agency_shell_enabled` end-state (flip default-on + retire the legacy-board gate, or keep as the named temporary control); (4) backfill is NOT needed — no account requires repair.

## 5. Legacy / drift signals (recorded for Cursor; NOT fixed here)

| # | Signal | Location | Class |
|---|---|---|---|
| D1 | `soloShellEnabled` derivation with zero consumers | `useTenantContext.tsx:512,528` + 4 prod feature values | dead config debt |
| D2 | Stale comment referencing the flag | `WorkspaceExitControl.tsx:35` | doc debt |
| D3 | Agency numeric-shell canary (live temporary control) | `resolveLandingRoute.ts:98`, `agency_switch_context()` | permitted rollout control; retire after owner ruling |
| D4 | Legacy `AgencyLayout` board coexists with `AgencyApp` | `src/agency/` dual-leg entry | §58 deliberate; final retirement = last migration step |
| D5 | Agency rail-only members land on the legacy board | `resolveLandingRoute` invitee branch | bounded exception, tracked |
| D6 | Duplicated social stacks (SocialCommand dead vs SocialStudio live) | `src/solo/social-command*` vs `social-studio*` | capability duplication debt (Cursor) |
| D7 | Three Vibe Studio lineages (solo canonical, agency fixture, admin legacy-operator) | `src/solo/vibe.tsx`, `src/agency/vibe.tsx`, `src/pages/admin/VibeStudio*` | classified in the Vibe workstream; retained per §58 |
| D8 | Orphaned admin Marketplace page (playbook installer with no route) | `src/pages/admin/Marketplace.tsx` | dead code since /admin retirement (Cursor) |

**Sweep results (negative evidence):** zero account-number literals in active branches; zero tenant-name/slug identity branches (the two `.slug ===` hits are route-slug comparisons, not identity); zero creation-date-driven behavior in routing/product code; zero V1/V2/V3-style permanent version gates in active logic; no customer-specific branches found.

## 6. Collision check (active PRs)

Open PRs touching the seams: #1268 (mcp_gateway migration — no seam overlap; owns 20270323). No open PR touches tenant context, tier resolution, shell routing, setup gates, provisioning, feature flags, account switching, operator, or agency routing. The uncommitted Platform Operator command-center work in the local tree (foreign workstream) does NOT overlap this PR's files. No dependencies to document beyond #1268's migration-version neighbor (this PR adds no migration).

## 7. PROOF OWED

- Authenticated per-account render proof (signing in as each tenant type and confirming the resolved shell) — no credentialed browser session in this environment; the matrix's resolved-shell column is derived from the traced code paths + the structural flags, labeled PROOF OWED at the authenticated-runtime level.
- The `solo_setup_complete` marker's first organic set (ships with #1269's merged trigger; zero rows carry it yet — expected).
