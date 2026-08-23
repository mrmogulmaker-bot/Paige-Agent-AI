# Operator console — the build plan

**Written 2026-08-23, after `PACK-FIRST` landed.** That doc changes the plan's shape, which is why
this replaces ad-hoc sequencing: the port half is no longer discovery work. Claude Design delivered
an implementation; porting it is transcription. Only the wiring is engineering.

**Jurisdiction (root `CLAUDE.md` §00):** CD decides the frontend. CC writes the port and owns the
backend. CC has zero design input. The one thing CC raises is a concrete incompatibility.

---

## 1. WHERE WE ARE — grounded, not remembered

**Shell: done.** Six slots in order · grid 216/1fr/spine · collapse implemented in CD's order
(spine→0 at ≤1200, rail 216→72 at ≤900, band 36→32 last, never gone) · spine gates on real content ·
depth spent on the named tokens · `--pg-*` 44/44 value-parity with the pack, CI-enforced · two faces
(Schibsted + JetBrains Mono), Bricolage and Inter gone · both dead destinations removed.

**33 addresses across 6 slots:**

| state | count | meaning |
|---|---|---|
| WIRED | 7 | bespoke component reading live Supabase |
| STRUCTURE-ONLY | 23 | CD's panel renders; every value is `—`/`null`/`[]` |
| ABSENCE | 3 | designed absence, deliberate |

**Two reference documents now exist, and they are what make this fast:**
- `docs/design-references/cd-packs/super-admin-shell-v3/PORT-SPEC-palette-and-six-surfaces.md` —
  99KB, line-cited transcription of the command palette (§1.1–1.9) and the six unported surfaces.
- `docs/architecture/operator-console-backend-inventory.md` — all 23 unwired views mapped to live
  schema, classified READY/PARTIAL/GAPPED, pre-grouped into slices A–K by shared data source.

---

## 2. THE TWO LANES, AND WHY THEY ARE NOW INDEPENDENT

The old sequencing coupled them: *figure out what a surface should be, then build it, then wire it.*
The first step is gone. The pack already says what every surface is.

| | PORT lane | WIRE lane |
|---|---|---|
| source | the pack + PORT-SPEC | the backend inventory |
| nature | **transcription** — copy markup, tokens, geometry, copy | **engineering** — RPCs, hooks, scope gates |
| decides | nothing (CD already did) | query shape, tier gate, hook grouping |
| parallelism | high — surfaces do not touch each other | medium — one hook serves several views |
| gate | PACK-FIRST four-way search before claiming anything missing | RPC-over-table; permission-test per tier |

**They run in parallel and meet per surface.** A surface's structure can be ported before its
backend exists (it renders honest absence), and a backend can be wired under structure that is
already correct. Nothing blocks on the other except at the join.

---

## 3. PORT LANE — sequence

Each item: read the PORT-SPEC section, copy the markup, consume the named tokens, render fixtures as
`—` or the designed absence. **No design decisions. No invention. Four-way search before any claim
of absence.**

| # | item | source | note |
|---|---|---|---|
| P1 | **Command bar + palette** | PORT-SPEC §1.1–1.9 | The 58px row is currently empty; CD ruled it lands or collapses. It lands. Resolve ⌘K ownership by mounting the ONE existing owner (`AgentPresenceContext`), never a rival (§18). |
| P2 | Marketplace submissions | §4.1–4.4 | Pairs with WIRE slice A — same surface, both lanes meet. |
| P3 | Calendar month + settings slide-over | §2.1–2.5 | Pairs with WIRE slice F. |
| P4 | Support inbox | §5 | Pairs with WIRE slice H. |
| P5 | Compose (outbound) | §6 | Pairs with H. |
| P6 | Integrations grid | §7 | Pairs with WIRE slice I. |
| P7 | Platform hours | §3 | **Check PACK SILENT list first** — first search returned zero hits; a four-way search is owed before this is called absent. |

**In flight:** CD findings 1/2/3/5 — the command row (P1), the two-right-columns fix, the empty
"Needs you today" card, and the two rail controls sharing a glyph.

---

## 4. WIRE LANE — sequence, by the inventory's own grouping

Slices are grouped so **one hook serves several views** (§18) rather than N forks.

| slice | hook | views | state |
|---|---|---|---|
| **A** | `useMarketplace` | 4 | **in flight** — one `marketplace_operator_catalog()` call returns 36 columns covering all four. Best ratio in the inventory, so it proves the pattern. |
| **B** | `usePlatformRevenue` | 3 | EXTENDS `useOperatorPlatformMetrics.ts` — never a second MRR computation (§18/§57). |
| **C** | `usePlatformOps` | 2 | shared approvals queue + audit feed. |
| **D** | `usePlatformSeats` | 2 | EXTENDS `useTeamPulse.ts`, which already calls `list_platform_staff()`. |
| **E** | `useProductAdoption` | 1 | smallest READY slice. |
| **F** | `useOperatorCalendar` | 1 | pairs with P3. |
| **G** | `useGrowthAssets` | 2 | |
| **H** | `usePlatformComms` | 2 | pairs with P4+P5. |
| **I** | `usePlatformConfig` | 2 | pairs with P6. |
| **J** | `usePlatformIntelligence` | 1 (half) | |
| **K** | `useCapabilities` | 1 | |

**Two rules bind every slice, both established rather than assumed:**

1. **RPC over table read, wherever an RPC exists.** `is_platform_admin()` resolves
   `platform_admin OR super_admin`, so RPCs serve both tiers — but **52 of 59 operator tables gate
   on `is_platform_owner()` (super_admin only)**. A table read returns zero rows for a
   `platform_admin` and is indistinguishable from "no data". The surface would assert an emptiness
   it never verified.
2. **Honest absence over a fabricated zero.** A field the source does not carry renders `—`, never
   `0`. No invented name, figure or date (§13).

**Owed before the tier reach is trusted:** the inventory's policy conclusions are read from
`pg_policies` and were **never permission-tested as either tier**. That test is a prerequisite, not
a nicety — it decides RPC-vs-table per hook.

---

## 5. NEW BACKEND — the work that is not wiring

| item | what it needs |
|---|---|
| `operator_integration_inventory()` | union over 8 scattered connection tables — the one view that clearly demands a new RPC |
| `operator_nrr_history()` · `operator_cohort_retention()` · `operator_mfa_enabled()` | new RPCs |
| p95 aggregate | on the existing intelligence RPC |
| policies on 6 net-new tables | each carries §59: the body gates, the grant is never the guard, no `anon` |
| **attribution** | **TYPED COLUMNS, not a jsonb blob.** `utm_campaign` exists only on `analytics_events` and `referral_clicks`; no order/invoice/subscription carries a campaign, and `analytics_events` has no `tenant_id` so the click side is not tenant-resolvable. 2 migrations + 3 edge-function writes. |

**DEFERRED — ingestion targets, not chart features.** Paige can only reason over what is in her
knowledge base, so the data must land in OUR tables: ad spend (MER/CAC/LTV:CAC/channels), uptime and
incidents, email opens and acknowledgements. **Build the ingest first; the panel is the last step.**
Delivery health ships now.

**UNCHANGED, not deferred:** `settings/vault` needs its own substrate — `business_vendors` is the
funding vertical's credit tracker sharing only a name, and wiring it is a §2 violation that renders
plausibly while being wrong. `platform_support` does not exist in the `app_role` enum.

---

## 6. OWED FROM CD — tracked so it does not get invented

- Absence copy for the three deferred panels — what is missing, why, where it comes from.
- Absence copy for the "Needs you today" block, if `absence-copy.md` does not already carry it.
- A sign-out glyph, IF a four-way search confirms the pack does not draw one.
- Light-theme depth: `--pg-canvas` #fbf9f5 and `--pg-surface` #f5f2ec differ by 6 units, so the plate
  leans on `--pg-rim`, whose light top highlight is white .9 on near-white paper. **CC cannot fix
  this without changing token values, which are pinned to the pack at 44/44 and CI-enforced** — so
  strengthening light depth means the PACK's light values change. CD's call; parity will enforce it.

---

## 7. PER-SLICE CADENCE — the same every time

1. **PACK-FIRST** — open the pack for this exact surface; four-way search before claiming anything.
2. **Port** structure verbatim · **wire** values to a real read or honest absence.
3. **Gates:** `ci:tsc` (ratchet) · eslint · build · `lint:pg-tokens` · `lint:alias-ratchet` ·
   `lint:views` · `lint:definer-fns` · `lint:tier-features` · `harness:selftest` ·
   `selftest-reject` · `vitest run src/operator`.
4. **Render** — `frames.mjs`, geometry measured into the label, never captioned.
5. **Frames to CD — STANDING, every slice, not on request.** Evidence handed over, no reading
   attached (§00): address, theme, width, measured geometry, faces that actually loaded.

   **Why this is standing rather than on-demand.** Two defects have now shipped that passed
   every gate in the repo and needed an eye:

   | | what was wrong | what was right |
   |---|---|---|
   | the port | correct token NAMES over OUR values | every name |
   | the spend | correct token VALUES in the WRONG roles | every value |

   Both are allocation failures, not content failures. tsc, eslint, the token-parity guard and
   the render harness all pass on either one — parity checks that the values MATCH the pack, and
   cannot check that a value is used where the pack uses it. A screenshot caught both.

   So frames are not something CD asks for when suspicious; they are how a slice reports. A slice
   without frames is not finished.
6. **Commit + push.** §66: the tier matrix updates in the same commit when tier visibility changes.

**§32.c stays owed throughout:** the harness renders locally against mocked auth. That is geometry,
not the deployed console. A live drive of the deployed surface is owed to a session that can reach
it.

---

## 8. WHY THIS IS FASTER NOW

Three things that were costing whole rounds are gone:

- **The pack is findable and named.** It was in an ephemeral scratchpad; `design-system-port.md` —
  the ladder, the faces, the Command Mark — was one container recycle from being lost. Committed.
- **The doctrine points at the right pack.** `src/operator/CLAUDE.md` named the SUPERSEDED
  8,300-line pack as "the pack" and never mentioned v3, so every session and every dispatched agent
  built toward a design already replaced.
- **PACK-FIRST stops the escalation loop.** The palette was about to be scoped as a design blocker
  while the pack carried 115 `summon` references. A capability drawn in the pack is never a
  blocker — it is a port that has not happened yet.

**The bar for "done":** every one of the 33 addresses either renders real data or renders the
absence CD designed, with the source named. Nothing renders a figure it cannot derive.
