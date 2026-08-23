# Super Admin Design v3 — install plan

**Status.** Drafted 2026-08-23 by a seven-agent planning crew (six survey lanes + a §39
adversarial peer-gate) against the committed pack and the live repo. **Nothing here is built
until the owner rules on §2 below.**

**Owner rulings this plan is built on** (2026-08-22/23, verbatim):
1. Does v3 supersede the earlier CD packs? — *"Yes"*
2. Scope — *"We are not there yet. This is strictly just the Super Admin workspace"*
3. Strip vs evolve — *"Yes what is there is what this is based on now. But You will need a
   planning team to make the relevant updates. If it's easier or smarter to just strip then
   let's do it. This new design UI will be our main surface moving forward."*
4. *"once we install this, this will be the absolute source of truth for how we build out
   every single platform part from this point on."*

---

## 1. The finding that reframes everything: there are TWO live operator consoles

The crew was briefed that `src/operator/**` is the shipped operator console. That was my
error, and the peer-gate caught it. The truth is worse and more useful:

| | `/operator` | `/admin` (godMode) |
|---|---|---|
| Shell | `OperatorApp.tsx`, 17 branches / 78 sub-tabs | `AdminLayout.tsx` `GOD_HUBS`, 8 hubs |
| Index | `FleetConsole` | `OperatorCommandCenter.tsx` (718 lines, live `operator_*` RPC polling) |
| Who lands here | a returning **`super_admin`** — `resolveLandingRoute.ts:207-209` | a **newly-invited operator or staff** — `JoinPlatform.tsx:23` `GOD_CONSOLE = "/admin/platform/tenants"` |
| §53 owner/staff split | none | real — `GOD_STAFF_HUBS` + `OperatorTabs.tsx` `canSee` + `PlatformOwnerOnly` |
| Data | 6 files read real Supabase; the rest are placeholders | live throughout |

**They have already diverged on `main`, and act-as makes it one-way.**
`FleetConsole.tsx:135` does `window.location.assign("/admin")` — a deliberate hard navigate —
so entering a tenant from `/operator` throws you into the *other* console, and
`grep 'switchTenant|exitScope|Exit'` across `src/operator/` returns only the four enter-path
lines. There is no exit control in `/operator` at all. The pack's persistent "Acting as" scope
band — which stage2 §6 calls shell-wide and always-present — **can never render** on that path.

`OperatorEntry.tsx:26` claims nothing links to `/operator`. That comment is now stale:
`resolveLandingRoute.ts:208` and `operatorTarget.ts:23` both point there. The peer-gate's
headline ("every lane surveyed the wrong console") therefore overstates — the owner's own door
*is* `/operator`. The accurate statement is that **two real operator consoles exist, different
people land on different ones, and the seam between them leaks.**

So the v3 install is not "reskin `/operator`." It is **"collapse two consoles into one, and
make that one v3"** (§18 — one home per capability). That is Slice 0, and it must land first.

## 2. Owner rulings needed before any code

| # | Question | Recommendation |
|---|---|---|
| **R1** | **Which console survives?** v3 replaces both, `/operator` is the home, `/admin` godMode retires to tenant-mode-only. Or the inverse. | **v3 at `/operator`.** `/admin` keeps its tenant/agency job. Every operator door (`resolveLandingRoute`, `operatorTarget`, `JoinPlatform`) points at one place, and act-as gains a real exit instead of a hard navigate. |
| **R2** | **§60/§61 collision.** v3 gives the operator Relationships › People, Pipeline and Conversations. `tierFeatures.ts:236-247` **explicitly excludes** those from `GOD_FEATURES`: *"God is the platform operator, not a tenant with a client book."* | **Add operator-scoped Features** (`operator_relationships`, `operator_pipeline`, `operator_conversations`) rather than granting the tenant bits. The doctrine is right — this is a prospect/partner/reseller book, not a client book — and reusing the tenant flags would silently widen every tier check that reads them. |
| **R3** | **19 shipped sub-tabs have no home in the new IA** (§58). Full list in §4. The two that hurt: **Platform Support** (3 tabs, no replacement surface anywhere in the pack) and **Provisioning** (2 tabs). | Ship v3 with those slots **retained as-is outside the six**, or rule them dropped explicitly. They must not vanish silently — and today they would: `OperatorApp.tsx:358` redirects an unknown section to Fleet with no notice, so a dropped URL lands somewhere plausible rather than 404ing. That is worse than a 404 for catching a regression. |
| **R4** | **Trust Compass scale.** v3 is a **five-level ceiling** over three-mode grants. The platform ships a **three-value enum** (`auto`/`confirm`/`off`), and `autonomy_lanes`/`capability_lanes` exist nowhere in `supabase/`. `tenant_tool_autonomy.tenant_id` is `NOT NULL`, so a platform-scope grant row is structurally impossible today. | Build the five-level ceiling as **real substrate** (task #165), not a client-side display. Until it exists, render the dial read-only with the honest reason. A dial that appears to clamp and does not is the §13 failure the pack itself warns about. |
| **R5** | **Webfonts.** The shell loads Schibsted Grotesk, JetBrains Mono, Newsreader (Google) and **Gambetta (Fontshare)**. stage2 §2's claim of "system-safe stacks only, nothing waits on a webfont" is false for the shipped shell. | Self-host all four. A second font CDN is a new third-party dependency on the operator's critical path, and Fontshare is not in any CSP we maintain. |
| **R6** | ~~**The SSN/EIN already in git history.**~~ **RESOLVED 2026-08-23 — no ruling needed.** PR #568 was **squash**-merged, so `main` carries one commit whose content is already scrubbed. Verified: walking every commit that touches `paige-ia.js` on `origin/main` finds the original value in none of them. The unscrubbed blob survives only at `refs/pull/568/head` on GitHub, which a default `git clone` does not fetch. | **No surgery.** My earlier statement that the originals "remain in history and in every clone" was true of the branch and is **not** true of `main` — the squash removed the exposure as a side effect. Nothing further is owed unless you want the PR ref itself scrubbed, which would mean deleting the PR. |

## 3. What v3 actually is: a structural replacement, verified by geometry

Not a judgement — a measurement. The shipped console is a **two-column** grid
(`grid-cols-[64px_1fr]` / `[232px_1fr]`, `OperatorApp.tsx:397-398`): rail + content, header and
sub-tab strip stacked inside, Paige as an overlay. v3 is a **three-column** grid
(`.dc.html:9439`) — rail | canvas | always-docked PAIGE spine — sitting **under a full-width
scope band** (`.dc.html:73`), with the canvas itself a two-row grid (58px command bar +
workspace, `:9710`) that grows a fourth column when a summon opens in split mode.

Patching the current shell into that shape means adding a persistent right column, a full-width
band above everything, a command-bar row, and a four-mode summon layer. That is not a skin, and
layering it is precisely the §30 tell.

Decisively: **the entire generic-panel vocabulary the current console is built on is gone.**
`isPanel`, `pnEyebrow`, `pnBlocks`, `isRows`, `isFeed`, `isCards`, `isTable`, `isRank`, `isHeat`,
`isDonut`, `isStacked`, `isGauge`, `isEscList`, `isDepList`, `isScGrid`, `isRunLine`,
`isSteppers`, `isOverrides`, `isProvLanes` — **zero matches** in the v3 shell. v3 has one thin
5-column ledger row (`:9353`) plus **41 bespoke per-surface `*Vals()` builders** (`:4107→9331`).

So `OperatorPanel.tsx` (1,837 lines) and the five spec registries feeding it (3,915 lines) are
ports of a block vocabulary that no longer exists.

**The §30 verdict: strip, don't layer.** Concretely — delete ~6,956 lines of old-IA scaffolding,
keep ~3,477 (all of `data/**`, the guards, the R3F orbit, three real Fleet surfaces, the two
Paige chat seams), rewrite ~9,400 against v3.

Blast radius is contained outbound (zero `from "@/operator` hits elsewhere in `src`) but **not
inbound**: `src/operator/**` imports 18 external modules, and `SystemsCheckTile` +
`useSystemsCheck` are **shared** with `AgencyBoard`, `OperatorCommandCenter` and
`PracticeOverview`. Those are not ours to rewrite.

## 4. Where every current sub-tab goes

Full 78-row mapping lives in the crew record; the shape of it:

- **MOVED 1:1** — `fleet/systems-check` → Fleet › Systems check (also the login landing surface,
  stage2 §6c) · `fleet/tenants` → Fleet › Directory · `fleet/history` → Fleet › History ·
  `settings/integrations/*` → Settings › Integrations · `settings/vault/*` → Settings › Vault ·
  `settings/team/*` → Settings › Team.
- **FOLDED, some loss** — `settings` loses its **entire third URL level** (18 leaves → 10 flat
  views) · `analytics` 10 sub-tabs → 5 lenses · `revenue` (4) → Analytics + Settings › Platform.
- **STOPS BEING A PLACE** — `paige` (11 tabs) becomes shell chrome + Settings › Mind ·
  `trust-compass` (3) becomes a spine-header dial + the `trust` summon · `automations` (3) →
  Settings › Automations ("a behaviour, not a place").
- **§58 EVENTS — 19 sub-tabs with no home**, verified by grep against `paige-ia.js`:
  `paige/playbooks` (0 hits for "playbook") · `paige/research` · `paige/documents` ·
  `trust-compass/escalations` (1 hit, a role permission) · `trust-compass/dependencies` (0 hits) ·
  `marketplace/build` · `growth/*` (7) · `support/*` (3) · `provisioning/*` (2).

**One §58 correction the peer-gate caught:** the compliance lane's headline hit — Fleet › Team
Pulse — is a **false positive**. It searched for the label, not the capability. Settings › Team is
its home, and the pack grounds it in the same RPC: `paige-ia.js:316` reads
`{ label: 'Seats', value: '6', note: 'list_platform_staff()' }` — the literal call `useTeamPulse.ts`
makes — and `:319` carries `Utilisation —` with "No activity substrate exists", reproducing the
shipped hook's own honest refusal.

**One rationale correction:** `marketplace/build` is not blocked on Stripe Connect. Seven
first-party authoring RPCs ship and are applied on prod (`marketplace_upsert_item`,
`_publish_version`, `_set_current_version`, `_deprecate_version`, `_set_item_status`,
`_set_featured`, `_set_default_for_new_tenants`). Connect blocks **payout**, not authoring.
Authoring is the half that works, and Build is its only UI — dropping it drops a working
capability.

## 5. Substrate: the pack under-states what we have four times, over-states once

| Pack says | Reality |
|---|---|
| Marketplace — *Representative* | **Richest operator seam in the codebase**: 6 tables, an operator-gated catalog RPC with per-item revenue rollups, 7 write RPCs, a shipped paid-install money leg |
| Alert delivery — *"no substrate, every firing sits at pending"* | **Three slices stale.** A3 shipped (`alerting-deliver` + cron every 5 min), A4 and A5a after it |
| Conversations — designed from `src/agency/conversations.tsx` | That file is `@ts-nocheck` fixture-driven. The **real** operator store `operator_conversations`/`operator_messages` + call schema + two live SMS edge functions went uncredited |
| Fleet MRR — *"Money Spine deferred"* | Conflates an absent substrate with a zero answer. L1 ships in full; `operator_dashboard_metrics()` returns honesty-corrected MRR/ARR/dunning/ARPA. **The answer is $0 because there are 0 paying tenants** |
| Governance › Audit log — *"immutable · Live"* | `paige_audit_log` is append-only **by GRANT only** — no constraint, no trigger. Worse, its read policy uses the tenant-agnostic global `admin` app_role, so **every tenant admin can read the entire operator audit trail**, while a §53 `platform_admin` cannot read it at all |

That last row is a **live §9/§53 defect**, not a design gap — filed separately. Note the fix is
larger than it looks: `paige_audit_log` has **no `tenant_id` column** (DDL at
`20260628013834:155-164`), so it cannot simply be tenant-scoped.

The crew also confirmed the `list_tool_autonomy` defect I verified against prod earlier — and
found it is **five** tools, not four: `n8n_run_workflow` came from `20260711250000` and the pack
missed it. Task #217 updated.

## 6. Defects in the pack itself (fix during port, not owner calls)

- **`P.ALERT_RULES` is defined twice** with incompatible shapes (`paige-ia.js:1152` 7 rows,
  `:1975` 12 rows). The second silently clobbers the first.
- **`alertVals` is defined twice** in the shell (`:6182`, `:7306`) returning different bags. The
  second wins, so an entire Settings › Alerts sub-surface — the rule builder — is unreachable.
- **Every JS reduced-motion guard in the shell is dead.** `state.reduce` is read nine times and
  **set zero times**; `grep -n "reduce:"` returns nothing. Everything evaluates `undefined` →
  falsy → animates. Must be wired to `useReducedMotion` on port (§11/§22).
- **The pack breaks its own rule 6** at the most important lookup: rule 6 says guard every
  catalogue read, and `renderVals` does guard the summon (`:9334`) and the ledger (`:9391-9393`)
  — but **not** `IA.DEST[s.dest]` (`:9338-9341`). Latent in the pack, because `s.dest` only
  changes via a rail click. **Reachable by typing `/operator/bogus`** once it is URL-routed.
- **The Mind has no light mode.** Rule 10 claims the five region hues have authored light values;
  `P.LOBES` does carry them, but the renderer hardcodes `const light = false;`
  (`mind-brain.js:384`). And its conduction is **ambient by default** — `_frame` self-fires on a
  weighted distribution every few frames with no external cause — which directly contradicts rule
  8 ("nothing pulses that is not really running"). A port with no backend would animate over
  nothing.
- **§9 in the detach transport.** `window.__paigeSid = ... || q.get('sid') || Math.random()...`
  (`:3881`): URL-supplied, unvalidated, non-CSPRNG, and broadcast in cleartext in every
  `BroadcastChannel('paige-session')` message. The filter runs on the **receiver**, so it gates
  merging — not eavesdropping, and not `scope` injection.

## 7. Two things I can decide without you, and did

- **`--pg-*` is scoped to the operator shell, not made a global layer.** The repo already solved
  this exact problem for this exact surface: `src/index.css:141-192` defines `.operator-console`
  with a header comment ruling that extending CD's warm neutrals platform-wide is "a separate,
  much larger change and its own owner call." v3 supersedes that block; it does not become global.
- **The Command Mark's §28 concern is a false premise, so #213 is unblocked.** The brand doc says
  swapping `PaigeSymbol territory="command"` would change the mark on the frozen landing page.
  Traced it: `PaigeSymbol` is imported by exactly three files, **all under `src/prototype/`**. The
  landing page renders `PaigeMark`, a different component. The swap cannot touch it.

## 8. The slices

Each is one PR, verified per §32, peer-gated per §39, with the tier matrix updated in the same
commit per §66.

| Slice | What | Depends on |
|---|---|---|
| **0** | **Resolve the two-console split.** One operator door; act-as gains a real exit instead of `window.location.assign("/admin")`; the four hardcoded landing constants (`resolveLandingRoute:208`, `operatorTarget:23`, `JoinPlatform:23`, and `operatorTarget.test.ts:17`'s assertion) reconciled. **No v3 work starts until this lands.** | R1 |
| **1** | **Shell geometry.** Three-column grid + full-width scope band + command-bar row, on scoped `--pg-*` tokens, self-hosted fonts, `useReducedMotion` wired, `IA.DEST` lookup guarded, an unknown section 404s instead of silently redirecting. Old spec registries deleted (§30 strip). | 0, R5 |
| **2** | **Fleet** (3 views) — the one slot that is genuinely LIVE end to end today. Systems check · Directory (keeping the R3F orbit) · History. Proves the shell against real data. | 1 |
| **3** | **Settings** (10 views) — the largest slot, and where the §53 owner/staff split from `/admin` must be re-established rather than lost. | 1, R2 |
| **4** | **Analytics** (5 lenses) — charts, with the pack's "a chart with no substrate draws no line" rule preserved as a hard requirement, not a nicety. | 1 |
| **5** | **Marketplace** (4 views) — richer substrate than the pack knew; Build survives. | 1 |
| **6** | **Relationships** (4 views) — needs the new operator-scoped Features and is the biggest net-new backend. | 1, R2 |
| **7** | **Campaigns** (4 views) | 1 |
| **8** | **Capabilities + Trust Compass** — the ten verbs, the ⌘K palette, the ceiling as real substrate. | 3, R4, #165 |
| **9** | **The Mind** — light mode authored, conduction driven by real events or honestly at rest. Converges with #163 Brain-Live rather than forking a second brain. | 3 |
| **10** | **Detach / multi-window** — only after the transport's session token is server-issued. | 1, #215 |

Sequencing rationale: Slice 2 first among the surfaces because Fleet is the only slot with full
live substrate, so it proves the new shell against real data before we commit nine more surfaces
to it. Slices 4–7 are independent of each other and can run in any order or in parallel.

## 9. Honest limits

- **No screenshot was taken.** This session has no browser and the operator console is auth-gated,
  so every finding here is code-level (§25 fallback, §32.c). A live drive is owed.
- The crew's six survey lanes were briefed on the wrong premise (that `src/operator` is the only
  console). The peer-gate caught it, and §1 above is the corrected picture — but the per-lane
  detail beneath it is still scoped to `src/operator`, so the `/admin` godMode side needs its own
  pass before Slice 0 is written.
- Line counts in §3 are the crew's, spot-checked but not independently recounted.
- The peer-gate is one layer, not proof (§39). It disconfirmed four lane findings; it will have
  its own misses.
