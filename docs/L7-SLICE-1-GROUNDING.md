# L7 Slice 1 — God-View Intelligence Dashboard: Phase-0 Grounding

**Owner:** Antonio Cook · **Prepared:** 2026-07-19 · **Status:** Phase 0 grounding — **NO L7 CODE** until
(a) L1.1 ships, (b) Cowork re-verifies the 6-check pass on live rows, (c) Antonio confirms L1.1 green
**and** confirms the routing home + design bar below. This doc is the only artifact of L7-S1 Phase 0.

All findings are `git grep`-verified with file:line.

## 1. Where does the God-view route live? → `/admin/platform/*` (already exists — extend it)

There is a real **God console** route family, not a gap:
- `src/pages/admin/PlatformOverview.tsx` — "Platform → Operator Overview (**God dashboard**)".
- `PlatformTenants.tsx` (Fleet), `PlatformTeam.tsx` (Team), `PlatformSends.tsx` (Sends & Tier).
- Nav registered in `src/components/admin/AdminLayout.tsx:178-224` — "The God console (platform staff)
  gets its own nav": `{ label: "Fleet", href: "/admin/platform/tenants" }`, `.../team`, `.../sends`,
  `.../sending`. God-mode nav is a distinct array (`AdminLayout.tsx:250` "Platform staff … run the God
  console — its own nav").

**Recommendation (confirm):** the new dashboard is **`/admin/platform/intelligence`**, a sibling page in
`src/pages/admin/` (e.g. `PlatformIntelligence.tsx`), added to the God-console nav array in
`AdminLayout.tsx` labeled **"Paige Intelligence"**. This is EXTEND, not a new grouping (§18).

## 2. God-role auth-check pattern → `useTenantContext().isPlatformOwner` + server RPC `is_platform_admin()`

- **Client gate:** `const { isPlatformOwner, isPlatformStaff } = useTenantContext();`
  (`AdminLayout.tsx:245`; also `WorkspaceSettingsPanel.tsx:51`, `TenantSwitcher.tsx:19`). The new page
  reuses this exact hook to gate render / redirect a non-operator.
- **Server gate (the real one):** PlatformOverview's data comes ONLY from RPCs "gated on
  `is_platform_admin()` server-side (a non-operator RPC call RAISES 42501)" (`PlatformOverview.tsx:1-11`);
  `TenantDetailSheet.tsx:5` — "RLS-gated to `is_platform_owner()`". **The new edge function
  `paige-intelligence-fleet-view` reuses this**: resolve the caller's role and reject non-operator with
  403 (the same `is_platform_admin()`/`is_platform_owner()` check the platform RPCs use). Client gating is
  UX; the edge-function role check is the security boundary.

## 3. Primitive-layer components → ALL present (no hand-rolling; §11 satisfied)

`src/components/ui/page/` (barrel `@/components/ui/page`) exports, confirmed present:
`PageShell.tsx` · `PageHeader.tsx` · `SectionCard.tsx` · `StatTile.tsx` (+ `StatRow`) · `DataTableShell.tsx`
(+ `type Column`) · `EmptyState.tsx` · `Toolbar.tsx` · `StatePill.tsx` · `GlyphPlate.tsx` · **`PresenceDot.tsx`**
(the pulsing dot for the §25 "Refreshing every 10s" indicator) · `table.tsx`. PlatformOverview already imports
`{ StatRow, StatTile, SectionCard, DataTableShell, EmptyState, type Column }` from `@/components/ui/page` —
same import the new page uses. **No primitive is missing.** The only net-new UI helper is a `useIntervalFetch`
hook (§ spec) — add it to the shared layer if broadly useful.

## 4. Layout reference at the §11 bar → `PlatformOverview.tsx` (it passes; use it verbatim as the bar)

`PlatformOverview.tsx` is the reference and clears the bar:
- **Polls already** (`refetchInterval` + `refetchOnWindowFocus`, doc'd at `:13`) — the auto-refresh pattern
  is established; Slice 1's 10s poll mirrors it (plus Page-Visibility pause).
- **Primitive-built**: StatRow of KPI tiles → SectionCard → DataTableShell → EmptyState.
- **Gold discipline doc'd** (`:15`): "the ONE gold act … is the per-row 'Reach out' — never a resting tile."
  Slice 1 likely has **no** gold act (read-only), so gold appears only on `StatePill state="on"/"active"`.
- **§13 defensive render** (`:19`): "a tile appears ONLY when its key is present … no fabricated numbers" —
  the exact honest-empty-state posture Slice 1 needs.

**Recommendation:** adopt PlatformOverview's structure as the Slice-1 layout skeleton (three SectionCards:
Cost Rollup, Trace Tail, Doctrine Violations), so the new page reads as one system with the God console.

## 5. `paige_audit_log` write pattern → mirror `auditRouter` (model-router.ts:562)

Every fleet query writes a God-access audit row. The canonical shape is `model-router.ts:562-577`
(`auditRouter`): `insert into paige_audit_log { tenant_id, actor_user_id, actor_role, action,
target_type, payload }`, wrapped in try/catch so a logging hiccup never fails the request (also used in
`paige-mcp`, `skill-forge`, `accept-invite`). **`paige-intelligence-fleet-view` writes one row per call:**
`action = 'god_view.fleet_query'`, `target_type = 'intelligence_fleet_view'`, `payload = { mode, filters }`,
`actor_user_id = <caller>`, `tenant_id = null` (fleet-wide, not tenant-scoped). This makes even Super-Admin
fleet access traceable — the tenant-trust guarantee (§9).

## Data source readiness (§31 real assets)

Slice 1 reads **`paige_llm_trace`** (L1, LIVE in prod as of 2026-07-19) for all three modes (trace_tail,
cost_rollup, doctrine_violations). **Honest gate (§13/§31):** the panels only show real data once **L1.1**
lands (text-path tracing) — until then `paige_llm_trace` only has `callModel`-path (image/3D/doc) rows, so
Cost Rollup / Trace Tail would look near-empty. This is exactly why the spec sequences L7-S1 code **after
L1.1 + Cowork re-verify**. The `doctrine_gate_hits` column exists but is `null` on current rows (no writer
populates it yet — logged as an L1 follow-up), so the Doctrine Violations panel will honestly show its
crafted empty state until a gate-hit writer lands (a later slice).

## Summary + open decisions for Antonio

| Question | Finding | Recommendation |
|---|---|---|
| Route home | `/admin/platform/*` God console exists | `/admin/platform/intelligence`, nav "Paige Intelligence" — **confirm** |
| God auth | `isPlatformOwner` + server `is_platform_admin()` (42501) | reuse both; edge fn is the boundary |
| Primitives | all present incl. `PresenceDot` | no hand-roll; add only `useIntervalFetch` |
| Layout bar | `PlatformOverview.tsx` passes §11 | use it as the skeleton — **confirm as the bar** |
| Audit log | `auditRouter` shape (model-router:562) | one `god_view.fleet_query` row per call |

**Two confirmations needed before Phase 1:** (1) route home `/admin/platform/intelligence` + nav label;
(2) `PlatformOverview.tsx` as the design-bar reference. Plus the standing sequencing gate: **L1.1 shipped +
Cowork re-verified + L1.1 confirmed green** before any L7-S1 code.

**STOP — awaiting Antonio's confirmation.**
