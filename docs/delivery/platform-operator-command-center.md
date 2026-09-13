# Platform Operator Command Center — Phase 0 map and slice ledger

**Mandate:** owner build mandate (2026-09-12 session): Paige's internal operating headquarters
for running Paige as a platform — separate server-enforced authority plane, one Paige contract,
no parallel platforms, honest states only. Delivery sequence Phase 0 (this map) → Phase 1
(shell/guard) → Phase 2 (read-only health command center) → Phase 3 (tenant support triage) →
Phase 4 (governed controls) → Phase 5 (Paige as operator).

**Authority:** Gate A per the mandate — carry non-colliding work through implementation, review,
PR, merge, deployment, truthful closeout. Stop for: material authority expansion, real collision,
missing source-of-truth, destructive first action, platform-policy change.

---

## Where the Command Center lives (the Phase 0 finding that shapes everything)

The Platform Operator console **already exists** and is owner-locked to the Claude Design v3
pack (`src/operator/CLAUDE.md`, owner 2026-08-19/08-23: "the pack IS the design… PORT, not
design"). The mandate does not name a deviation from the pack, and THE LOCK requires an explicit
owner instruction naming the exact change — so the Command Center is built **on** the existing
`/operator` console, not beside it:

- **Entry/shell/navigation/guard (mandate Phase 1): SHIPPED.** `/operator/*` → `OperatorEntry`
  → one `RequireOperator` subtree guard → six-slot `OperatorShell` (IA frozen at six slots /
  32 views, `operatorIA.ts` mirrors the pack's `paige-ia.js`). The guard asks the server
  (`is_platform_admin` RPC, subject-keyed verdict cache, honest unverifiable state); RLS +
  §59-gated RPCs are the real boundary. Nothing in Phase 1 needs rebuilding; later slices
  verify denial/switching states rather than re-implement them.
- **The pack draws the health command center already:** Analytics slot → **"Platform health"**
  view (`paige-ia.js` L268–L294, charts L496–L508): a "Latest run" ledger (passed / failed /
  could-not-run, "Read from the sweep, not asserted"), a "Platform health" ledger (resolver
  integrity · RLS posture · migration drift · run history · alert firings) and four charts
  (sweep outcome · checks that could not run · LLM error rate · time to acknowledge).
  **This view is the mandate's Phase 2 home.** Its v3 structure is currently UNPORTED: the view
  renders `FleetTeamPulseSurface`, a RETIRED-pack port (`Super Admin Shell.dc.html` L6593) the
  v3 pack draws nowhere, mounted there as a stopgap (§58 handled below).
- **The older `docs/design-references/OPERATOR-COMMAND-CENTER-IA.md` spec targets the `/admin`
  tree whose console interface the six-slot shell replaced.** Its data seams
  (`operator_at_risk_tenants`, `operator_dashboard_metrics`) remain real substrate for later
  phases (tenant triage, fleet KPIs) but its surface plan is superseded by the pack.

## Reuse map (compose, never fork)

| Capability | Existing seam to extend |
|---|---|
| Systems sweep state | `useSystemsCheck("operator")` → `systems_check_snapshot` RPC (`paige_systems_check_run` + findings + `paige_systems_check_registry`) |
| Run history series | `paige_systems_check_run` (tenant-less rows, capped 100) via `useSystemsCheckHistory` pattern |
| Alert firings / acks | `paige_alert_firing` (`fired_at`, `acknowledged_at`, `delivery_status`), `useAlerting` counts |
| Trust/authority/proof | `get_platform_trust_compass()` (§68 attestation + safety-loop proof) via shared `PlatformTrustProvider` |
| Fleet/tenant aggregate | `useFleet` (fleet reads; revenue owner-gated) |
| Operator authority | `RequireOperator` guard + `is_platform_admin()`/`is_platform_operator()` RLS |
| Visual system | v3 pack tokens (`--pg-*`), `Ruling F` plate treatment, `OperatorShell` chrome, `@/components/ui` primitives where shared |

## Collision map (checked 2026-09-12)

Open PRs touching shared seams: #1173 (Layer C governed event→act engine — harness functions),
#1176 (Solo Calendar), #1148 (Solo Beta acquisition), #1081/#1078/#1076 (docs closeouts), #1046
(Secure Browser), #1044 (text-chat MVP). **None touch `src/operator/**` or the systems-check /
alerting read paths this slice composes.** Watch-items adopted per owner heads-up (calendar,
harness, orchestration, chat streams will land during this work): rebase before PR; Phase 4
controls MUST route through whatever Layer C engine has landed by then, never a private action
path; Phase 5 (Paige as operator) adopts the in-flight chat runtime.

## §58 record — displacing Team Pulse from `analytics/platform-health`

`FleetTeamPulseSurface` (roster via `list_platform_staff()` — real) is a retired-pack port the
v3 pack draws nowhere. Phase 2's first slice replaces its mount at `analytics/platform-health`
with the pack's own Platform health surface. The component stays on disk (like
`OperatorLegacyApp`, §30/§58 — preserved, unmounted), and `viewSources.ts`'s drop-nothing
`carries` ledger records that the team-pulse capability is owed to the v3 Settings → Team port
(Layer 6 wiring), which is where the pack places platform staff.

---

## AGENTS.md capability routing — the ten answers (pre-edit gate)

1. **Intended owner outcome** — the operator opens one view and reads, in under five seconds,
   the platform's real operating condition: latest sweep outcome, what could not run, alert
   firings and acknowledgement state, run history — each figure named with its source, each
   missing substrate shown as an honest absence, never a fixture.
2. **Domain owner** — Platform Operator console family (`operator.platform`); no other PR in
   flight touches it (collision map above).
3. **Harness dependency** — reads only existing Layer E substrates (sweep/jobs/alerts) through
   shipped read seams; Layer C (act engine) is NOT needed for this read-only slice and is not
   forked. Harness map Layers A–G cited; no new layer invented.
4. **Spine capability** — none read or registered by this slice (it renders operational
   evidence, not tenant capabilities). Honest `UNAVAILABLE` for Spine evidence on the operator
   lens is already the recorded state (`operator.platform` chain `safe_context: none, C4`).
5. **Provider / connection requirement** — none; no provider integration involved, Integration
   Registry not touched.
6. **Approval / budget / autonomy lane** — read-only surface; no `MUTATION_VERB`, no action, no
   approval gate consumed. Phase 4 will use the one-approval-gate + governed execution path.
7. **Durable job / event need** — none created; composes the existing sweep/jobs/alert
   substrates read-only.
8. **Readback / receipt / Rail** — no act, so no receipt owed by this slice; every figure
   carries its source and freshness on screen, which is the evidence contract for a read view.
9. **Visible surface + Binding Ledger** — `operator.platform` (currently `UNAVAILABLE`,
   parked "until the owner releases it"). The mandate IS that release; the ledger row is
   updated in this PR to PARTIAL with this view's proven state and named next slice.
10. **Authenticated proof required** — static + rendered evidence in-PR (content-asserting
    tests per the console's four shipped failure modes); **authenticated-runtime proof at the
    real operator route stays PROOF OWED** until driven by an operator session (no operator
    credentials in this environment; recorded honestly, never claimed).

---

## Slice ledger

| Slice | State | Content |
|---|---|---|
| 2026-09-12-A · Phase 2 first view | THIS PR | `PlatformHealthSurface` at `analytics/platform-health`: pack structure (Latest-run ledger · Platform-health ledger · four charts), real reads where substrates exist, honest absences where they do not (§13), §58 Team-Pulse displacement recorded |
| Phase 2 remainder | owed | deployment/release + migration proof state; provider/connection health (Integrations registry + systems-check provider rows); tenant lifecycle aggregate; incident/recovery state — each added only when its real source is named |
| Phase 3 | owed | reason-bound, receipted tenant support triage |
| Phase 4 | owed | governed operational controls via the one approval gate + Layer C as landed |
| Phase 5 | owed | Paige as the operator's evidence-based command interface |
