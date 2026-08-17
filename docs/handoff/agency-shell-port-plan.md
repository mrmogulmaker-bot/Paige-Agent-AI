I have the precedent nailed down. Here is the plan.

---

# FAITHFUL-PORT IMPLEMENTATION PLAN — Agency + Sub-account Shell (`src/agency/*`)

**Precedent locked:** commit `2506608d` → `src/solo/*` (36 files, `// @ts-nocheck`, `.paige-solo` scoped tokens in `solo-tokens.css`, DCLogic→React, window-globals→imports, lazy-loaded + flag-gated early-return in `src/pages/Admin.tsx` keyed on `soloShellEnabled && tierKey === "solo" && soloStandalone`). This Agency pack mirrors that pattern exactly. **This design is owner-locked (§28): the port reproduces the `.dc.html` layout, interaction, and pop-out behavior faithfully — it does not "improve," re-align, restyle, or fold anything into a later refactor. Every drift temptation is flagged and forbidden below.**

The Agency Shell is authored as ONE giant `DCLogic` component (944 KB `Agency Shell.dc.html`) that renders **both** the agency-parent view and the sub-account view off a single `acting`/`isSub` state field, plus two imported presentational primitives (`Setup Card.dc.html`, `Team Block.dc.html`) and one decorative canvas element (`paige-brain.js`). We do NOT collapse that one-component authorship into the Solo pack's one-file-per-screen split blindly — but we DO break it into screen modules for maintainability the same way Solo did, keeping `isSub` as the single mode switch (see §2).

---

## 1. PROPOSED FILE STRUCTURE — `src/agency/*` (mirrors `src/solo/*`)

Root + shared + one module per top-nav surface. Naming mirrors Solo where a surface is shared-in-concept, but keeps the Agency vocabulary the design actually uses.

```
src/agency/
  AgencyApp.tsx            # root shell: Rail + TopBar + acting-banner + account switcher + view switch (mirror SoloApp.tsx)
  _shared.tsx              # ALL shared primitives: Ic, Logo, Avatar, Wrap, PageHead, SubTabs,
                           #   SlideOut, Foldout, PeekCard, ExpandBtn, Collapse, Meter, Modal, Popover, ScopeSeg
                           #   + ported helpers AV() (WCAG avatar contrast), FLEX map, CAP_LABEL
  agency-tokens.css        # .paige-agency scoped token layer (dark-first → genuine light+dark, §11/§23)
  SetupCard.tsx            # ported Setup Card.dc.html — 5 layout modes (fields/checks/list/person/tree)
  TeamBlock.tsx            # ported Team Block.dc.html — 11 block types (stats/rows/table/profiles/roledef/invites/capacity/feed/read/note/bars)
  PaigeBrain.tsx           # ported paige-brain.js canvas orb → useReducedMotion-guarded React canvas (ref-mounted)

  # ---- top-nav surfaces (MAIN group) ----
  CommandCenter.tsx        # Command Center + Systems Check + (agency-only) Team Pulse + Prospect Pipeline tabs
  paige.tsx                # Paige: Chat · Knowledge · Sub-Agents · Actions · Skills · Paige Team
  compass.tsx              # Trust Compass (agency dept knobs + sub observe-only + propose flow)
  automations.tsx          # Automations · Runs · Build
  clients.tsx              # Clients (fleet): Sub-accounts · Pipelines · Conversations console
  calendar.tsx             # Calendar: Schedule · Booking links · Availability · Requests · Settings
  support.tsx              # Client Support (tickets + drawer + Paige read)   ← NOTE: filename collision risk, see flag
  growth.tsx               # Growth: Overview · Brand Kit · Social · Pages · Funnels · Forms · Builders (→ Vibe Studio)
  analytics.tsx            # Analytics: Brief · Money · Profitability · Retention · Decisions · Market watch
  billing.tsx              # Billing (agency: Sub-account billing/Revenue/Your plan; sub: Invoices/Your plan)

  # ---- top-nav surfaces (PLATFORM group) ----
  marketplace.tsx          # Marketplace (reseller App Store: Discover/Curated/Publish + adoption matrix)
  vault.tsx                # Business Vault (obligations/renewals/vendors + cross-book)
  integrations.tsx         # Integrations (agency + per-sub tool handoffs)
  team.tsx                 # Team: Roster · Directory · Roles & invites · Workload · Performance · Activity
  setup.tsx                # Setup: Business · Presence · Owner · Contacts · People · Banking · Comms & data
  vibe.tsx                 # Vibe Studio full-screen composer (opened from Growth → Builders)

  # ---- fixtures + data adapters (mirror src/solo/data/) ----
  fixtures.ts              # ALL design fixtures as typed consts: SUBS, OWNERS, AGENCY, *_KPI_DATA,
                           #   TICKETS, TEAM*, CLUSTERS/FINDINGS, AUTOMATIONS, BILL_*, BV_*, THREADS,
                           #   DEALS/BOARD, DEPARTMENTS, TIER_META, CONV_*, PROPOSALS/SENT/AUDIT, BRAND_TOKENS
                           #   + the 17 honesty flags (pipesFlag, convosFlag, caFlag, csFlag, gFlag, tcFlag, …)
  data/
    useAgencyRoster.ts     # real: sub-account roster under parent_tenant_id (§51-safe)
    useAgencyMetrics.ts    # real-where-available: per-sub KPI rollups
    useAgencyBilling.ts    # real: platform sub (L1) + tenant service billing (L2)
    useAgencyPeople.ts     # real: team_members / roles / seats
    useAgencyContacts.ts   # real: contacts (agency + acting-sub scope)
```

**Sizing note:** the `.dc.html` root is one component; several Solo surfaces were split across multiple files (`calendar*.tsx` ×7, `analytics*.tsx` ×2). Do the same where a single Agency surface exceeds ~30 KB ported (Clients/Conversations console and Calendar are the likely split candidates — `clients.tsx` may become `clients.tsx` + `conversations.tsx` + `pipelines.tsx`). Right-size during the port; do not pre-fragment.

**Flag — filename collision:** the design's shared runtime file is literally named `support.js`, and there is a `Client Support` surface. Name the surface module `support.tsx` (Client Support) and DO NOT port `support.js` at all (it is the dead DC runtime — §4/Runtime reader). No file named `support.js` enters `src/agency/`.

---

## 2. TIER-MOUNT PLAN (§51/§56) — ONE shell, mode-switched, TWO tier gates

### 2a. One shell serves both tiers (confirmed by the design)
The Agency Shell is authored as a single component whose entire mode is derived from `const isSub = !!acting` (script L3235). The agency-parent operator and the sub-account view are the SAME shell. Therefore: **one `AgencyApp.tsx`, mounted for both tiers, with `isSub` as the internal switch** — NOT two separate mounts. This is faithful to the design and avoids a §18 fork.

Two distinct runtime entry modes into `AgencyApp`:
- **Agency operator (parent tenant):** shell boots at `acting === null` (agency view). The account switcher, "Act as" drill-in from a Clients card, and the acting banner are all LIVE — the operator can enter/exit any sub-account.
- **Sub-account tenant (child, logging into their own workspace):** shell boots **permanently in the `isSub` branch, pinned to their own tenant** — NO account switcher, NO acting banner, NO "return to agency view", NO cross-book surfaces. A real sub-account never sees the parent aggregate (§9/§51 leak = the #86 bug class).

Encode this as an `AgencyApp` prop, e.g. `mode: "agency" | "subaccount"`, set by the mount gate. In `"subaccount"` mode the switcher/banner/return controls are hard-disabled and `acting` is locked to the tenant's own record.

### 2b. The exact mount gate in `src/pages/Admin.tsx`
Mirror the Solo early-return (Admin.tsx L344–376), placed **immediately after** the Solo gate and **before** the godMode / tenant `AdminLayout` branch. Reuse the existing `useTierFeatures()` resolver, which already returns the §51-safe `tierKey` (`"agency" | "enterprise" | "sub_account" | "solo" | "god"`) via `resolveTierKey` — the parent-first invariant (a parented tenant is NEVER a manager tier) is ALREADY baked into that resolver (`tierFeatures.ts` L110–111; `tierFeatures.test.ts` L48–57). Do not re-derive it.

```
// Gate A — AGENCY operator (parent tenant): parent_tenant_id IS NULL, account_type IN ('agency','enterprise')
if (agencyShellEnabled && (tierKey === "agency" || tierKey === "enterprise")) {
   return <Suspense …><AgencyApp mode="agency" /></Suspense>;
}
// Gate B — SUB-ACCOUNT tenant (child): non-null parent_tenant_id, non-manager account_type
if (agencyShellEnabled && tierKey === "sub_account") {
   return <Suspense …><AgencyApp mode="subaccount" /></Suspense>;
}
```

- **Flag:** add a runtime per-tenant flag `agencyShellEnabled` alongside `soloShellEnabled` (same shape: `features.agency_shell_enabled`, Super-Admin-set, §57 source-of-truth / §10 config-as-data, §51-safe no cross-tenant read). Ships **OFF** (Slice 1). §58 byte-unchanged when unset.
- **Lazy chunk:** `const AgencyApp = lazy(() => import("@/agency/AgencyApp"));` — the ~900 KB of ported chunks NEVER enter the shared Admin bundle unless a flagged agency/sub tenant mounts it (§58 precedent, Admin.tsx L81–84).
- **Error boundary:** wrap in the same boundary the Solo branch uses (§32) — an `AgencyApp` render throw degrades, never white-screens `/admin`.
- **Enterprise:** resolves to `tierKey === "enterprise"`, mounts via Gate A as an agency operator (Enterprise = hybrid superset of Agency, owner 2026-08-11). Confirmed against `tierFeatures.test.ts` L132–135.

### 2c. ABSOLUTE INVARIANT (§51) — a sub-account is NEVER an agency
- Gate B keys on `tierKey === "sub_account"` ONLY, which `resolveTierKey` produces for any parented non-manager tenant (including the legacy `account_type='standalone'`-with-parent case, and the mistyped-child Antonio-Daniel-LLC case → both resolve to `sub_account`, never a manager tier). This is the structural §51 lock at the mount layer — **do NOT add an inline `account_type === 'agency'` check in Admin.tsx** (that would re-introduce the exact bug the resolver fixed).
- **FORBIDDEN drift:** a sub-account tenant must never reach Gate A, never see the switcher, never load a cross-book surface. The `mode="subaccount"` pin is the enforcement; the compliance officer verifies (§51 component #4) that in `subaccount` mode there is zero code path to `acting = <another sub>` or to the parent aggregate.

### 2d. Owner-tenant reality check (§63)
The design fixtures name 12 illustrative sub-accounts ("Ridgeline", "Bellweather", …). These are decorative seed. **Do NOT wire the shell's example/default targets to Project Mogul / MMA / Antonio Daniel LLC** (§63) — when a real example tenant is needed use a fresh test tenant or the Paige Operator Workspace pointer.

---

## 3. POP-OUT / SLIDE-OUT INVENTORY (owner's #1 concern) — EVERY ONE SURVIVES THE PORT

**Where they actually live:** NOT in `support.js`/`paige-brain.js` (dead runtime + decorative orb) and NOT defined inside `Setup Card`/`Team Block` (those only emit the trigger buttons that fire callback props `openExpand`/`openEdit`/`openAll`/`askFn`). The pop-out CHROME is authored inside **`Agency Shell.dc.html`** as `<sc-if>`-gated, `setState`-driven blocks. The Agency reader found **74 unique overlay flags**. They map onto the four Solo shared primitives already in `_shared.tsx` (`SlideOut`, `Foldout`, `PeekCard`, plus a `Modal`/`Popover` to add). Every one below is a required deliverable — none may be dropped, merged, or "simplified" (§28/§58).

### Overlay archetypes → primitives (port to these, faithfully)
| Design archetype | Solo primitive to reuse | Behaviors to ADD in React (runtime provides none) |
|---|---|---|
| Center modal (backdrop + card) | `Modal` (add to `_shared.tsx`) | portal, focus-trap, Esc/scrim dismiss, `prefers-reduced-motion` |
| Right slide-out rail ("Her read →") | `SlideOut` | same + slide transition motion-safe |
| Detail drawer (row → drawer) | `SlideOut`/`Foldout` | same |
| Foldout (expand tile) | `Foldout` | reduced-motion |
| Dropdown popover (pickers) | `Popover` (add) | outside-click + Esc close (Solo TopBar precedent) |

### Global / chrome
- **Account switcher** popover (`switcherOpen` / `toggleSwitcher`): Agency view · All sub-accounts (12) · RECENT ×5 · + Add a sub-account
- **Account/profile menu** (`accountOpen`): identity, seat, plan, SESSION (device/2FA/sign-out others), prefs, theme toggle
- **Provisioning wizard** (`provisionOpen`, `provStep` 1→2→3): Step1 form → Step2 live scan feed → Step3 welcome → `enterNew`
- **Ask Paige** launcher (`askOpen`, seeded `askSeed`, scoped `askScope`)
- **Help** (`helpOpen` → `sendHelp` → `helpSent`)

### Command Center
- All drafts queue (`draftsAllOpen`) · Needs-attention modal (`attnOpen`) · Audit foldout + peek (`auditOpen`/`auditPopOpen`) · Top-deal modal w/ paging (`dealOpen`/`dealIdx`) · Stalled/read side panels (`panelOpen`) · Full pipeline kanban (`kanbanOpen`)

### Paige
- Chat history (`histOpen`) · Chat rail (`showChatRail`) · Knowledge rail (`showKnowRail`, hosts PaigeBrain orb)

### Clients / Conversations console (richest cluster)
- Pipeline sub picker (`pipePickOpen`) · Conversation-settings drawer w/ DEFAULT/POLICY/BEHAVIOR kinds (`csDrawerOpen`/`csRow`) · **"Who sends this?" modal** (`actAsOpen`: Route-to-owner-for-approval vs Act-as-&-send-now — "no third option") · Expand thread (`expandOpen`) · New conversation (`newConvoOpen`) · Channel picker (`channelPickOpen`) · Call/video overlay (`callOpen`, `callTools`/`videoTools`) · Dial keypad (`padOpen`) · Batch approve (`batchTitle`) · Conversation full-report 4-step (`caReportOpen`)

### Trust Compass
- Sub-account picker (`subPickOpen`) · Confirm move-to-AUTO modal (`confirmOpen`) · Propose-to-owner modal (`proposeOpen`) · Audit (shared)

### Analytics
- Fold detail foldout (`anPopOpen`/`anPop`) · Sub picker (`anPickOpen`) · Needs-attention (shared) · Ask Paige (shared)

### Marketplace
- Item detail (`mkDetailOpen`: Install-for-agency / Propose-to-sub / Curate-for-book) · "Her read" rail (`mkRailOpen`) · Reseller picker (`mkShowPicker`) · Adoption matrix / Publish listing (inline)

### Business Vault
- Obligation detail (`bvDetailOpen`) · Vendor detail (`bvVendorOpen`) · Add obligation (`bvAddOpen`) · Vendor outreach draft (`bvOutreachOpen`) · Full list (`bvListOpen`) · "Her read" rail (`bvRailOpen`)

### Automations
- Automation detail (`auDetailOpen`) · Run trace detail (`auRunOpen`) · Build draft (`auDraftOpen`) · "Her read" rail (`auRailOpen`) · Sub picker (`auShowPicker`)

### Calendar
- New calendar/booking-link (`calNewOpen`) · Booking-link detail (`calLinkOpen`) · Full list (`calListOpen`) · Day rail (`calRailOpen`) · Sub picker (`calShowPicker`)

### Billing
- "Her read" rail (`blRailOpen`)

### Team
- Full-block modal (`tmListOpen` via TeamBlock `openAll`) · "Her read" rail (`tmRailOpen`) · Scope picker (`tmShowPicker`)

### Setup
- Card peek (`suPopOpen`/`suCard`, via SetupCard `openExpand`) · Edit drawer (`suEditOpen`/`suEdit`, via SetupCard `openEdit`, Add/Edit modes, sealed/readonly/color/file/select field kinds)

### Growth
- **Vibe Studio full-screen** (`studioOpen`, ESC-to-close, `studioActing` when acting-as) · Sub picker (`gPickOpen`)

**FORBIDDEN drift on pop-outs:** every listed overlay is a discrete, named deliverable. Do not consolidate two overlays into one "generic modal" that loses a distinct layout, do not drop the peek/foldout variants, do not skip the "no third option" framing on the Act-as modal. The SetupCard/TeamBlock CTAs that render but are un-wired in-file (invite / add-member / new-role / edit-role) get their pop-out chrome wired **from the parent surface** during that surface's slice — they are triggers whose targets live in `Agency Shell`, so port the trigger AND its target overlay together.

---

## 4. DATA-WIRING SEAMS (§9/§13) — real backend vs honest Preview

**The entire design is fixtures** — 17 explicit honesty flags + 37 inline "stand-in / not built yet" strings, zero fetch/RPC in the source. Faithful port = ship the fixtures verbatim (in `fixtures.ts`) with the honesty flags rendered as-authored, THEN wire real seams surface-by-surface behind the design-agnostic adapter pattern (`src/agency/data/use*.ts`, mirroring `src/solo/data/useSolo*.ts`). A hook returns real data where a confirmed backend exists, else returns the fixture unchanged and keeps the "Preview — not wired" banner honest (§13). **Never present a fixture number as live; never fabricate a metric (§13/§32).**

### Wire-able NOW (real backend exists — §51-safe reads)
| Surface | Seam | Hook |
|---|---|---|
| **Clients — Sub-account roster/grid** | tenants under `parent_tenant_id` (§51 roster) | `useAgencyRoster` |
| **Billing (agency)** | platform subscription L1 + tenant service billing L2 (§17/§38 split; display-only, no §38 money-move) | `useAgencyBilling` |
| **Team — Roster/Directory/Roles/Seats** | team_members / roles / seats | `useAgencyPeople` |
| **Setup — Contacts/People** | contacts + members (agency + acting-sub scope) | `useAgencyContacts` / `useAgencyPeople` |
| **Command Center — Waiting-on-you** | reuse `usePendingApprovals` (Solo already imports it) | existing hook |
| **Trust Compass — tiers** | maps to real `autonomy_lane` enum + `paige_action_kinds` / 10-dept model (§16) — read-only wire feasible | `useAgencyMetrics` (partial) |
| **Per-sub metrics (partial)** | per-tenant KPI rollups where a query exists; else Preview | `useAgencyMetrics` |

### Honest PREVIEW (no confirmed backend — keep the flag, DO NOT fake)
Verbatim gap map from the design's own flags — these ship as Preview until a follow-up slice wires them:
- `pipesFlag` — cross-book pipeline query (stage counts/values/stalls) — none
- `convosFlag` — cross-book threads, send-from-identity routing, per-sub draft voice — none
- `caFlag` — cross-book conversation metrics + per-draft approval/auto-send outcome recording — none
- `csFlag` — Defaults vs Policies structural distinction + send-time enforcement — none
- `gFlag` — cross-book growth query + Studio context handoff — none
- `tcFlag` — per-dept autonomy tiers persistence + cross-tenant sub settings read + proposal flow — none (Compass is display until wired)
- `mkBanner`/`calBanner`/`blBanner`/`bvBanner`/`auBanner`/`agentsFlag`/`actsFlag`/`chatFlag`/`teamFlag`/`pipeFlag`/`fleetPointer` — layout-only, no substrate
- Marketplace reseller markup math, §38 direct-charge/merchant-of-record posture — NOT modeled here (billing display-only); do not imply money movement.

**§9/§51 wiring rule for every hook:** agency mode reads the parent's own book + its sub-accounts; sub-account mode reads ONLY its own tenant (no parent aggregate). Every adapter throws-on-missing-tenantId and never accepts a client-supplied tenant that overrides the resolved scope (#588 class). The §37 producer inventory + §51 per-tier smoke test run on each hook before its slice merges.

---

## 5. SLICE SEQUENCE (ordered, right-sized — mirrors the Solo slice cadence)

**Slice 0 — Runtime severance + primitives skeleton (foundation).**
Stand up `agency-tokens.css` (`.paige-agency` scope, dark-first tokens → genuine light+dark per §11/§23), `_shared.tsx` (port `Ic/Logo/Avatar/Wrap/PageHead/SubTabs/SlideOut/Foldout/PeekCard/ExpandBtn/Collapse/Meter` from Solo + add `Modal`/`Popover`/`ScopeSeg` + `AV()`/`FLEX`/`CAP_LABEL` helpers), and `fixtures.ts` (all consts + 17 honesty flags). Convert DCLogic→React, `{{}}`/`<sc-if>`/`<sc-for>`→JSX, window-globals→imports. **NO unpkg/Babel/`new Function` in the bundle (CSP/§34).** `// @ts-nocheck` on every ported file. Nothing mounted yet.

**Slice 1 — Faithful port, flag-gated OFF.**
Port `SetupCard.tsx`, `TeamBlock.tsx`, `PaigeBrain.tsx`, `AgencyApp.tsx` (Rail + TopBar + acting-banner + switcher + view switch), and all screen modules. Wire EVERY pop-out from §3 (portal/focus-trap/Esc/reduced-motion added). All data from `fixtures.ts`. Add `agencyShellEnabled` flag + BOTH mount gates in `Admin.tsx` (§2b), shipped **OFF**. §58 byte-unchanged when unset. **This is the owner-locked design landing intact — no drift, pop-outs all present.** Verify: typecheck/build green + headless smoke that `AgencyApp` renders in both `mode="agency"` and `mode="subaccount"` without throwing (§32).

**Slice 2 — Tier-mount ON + per-tier verification (§51).**
Flip `agency_shell_enabled` for a test agency + a test sub-account (§63: NOT MMA/Project Mogul). Run the §51 six-component railing: name the tier for each mount, smoke-test Gate A (agency/enterprise) and Gate B (sub_account), confirm sub-account mode has NO switcher/banner/parent-aggregate path (the §51 invariant), confirm Enterprise mounts as agency superset. Post-deploy walk on the tier NOT built on (§51 #5 — usually the sub-account).

**Slice 3 — Match-accounts (parity + source-of-truth).**
Reconcile shell labels/badges/plan lines against the God-level record (§57) — no phantom MRR, correct topology. Confirm the acting-banner brand cascade and `workspaceLabel` ("AGENCY WORKSPACE" vs "SUB-ACCOUNT") derive from real classification, not a fixture.

**Slice 4 — Data audit + wire the real seams (§4, one surface per sub-slice).**
Build `data/use*.ts` adapters, wiring the "wire-able NOW" surfaces first (roster → billing → people → contacts → approvals → compass-read → partial metrics). Each sub-slice: §37 producer inventory + §51 per-tier smoke + §9 tenant-scope proof + §39 peer-gate on the real diff. Preview surfaces keep their honesty flag until their backend lands (tracked as follow-ups, never silently faked §13).

Every slice runs the mandatory crew (§1/§5/§11/§25): design engineer + adversarial verifier + compliance officer + design critic. Slices 0–1 are design-heavy (faithful-port fidelity is the bar); Slices 2–4 are correctness/tier-heavy.

---

## 6. OPEN QUESTIONS FOR THE OWNER (genuine blockers only)

1. **Sub-account tenant login — same shell, or does a sub-account own tenant only ever see the Solo shell?** The design authors ONE shell for both, with the sub-account view as the `isSub`/`mode="subaccount"` branch. Confirm a **real sub-account tenant logging into their own workspace** mounts THIS Agency shell (Gate B) rather than the already-shipped `src/solo/*` shell. The tier resolver gives `sub_account` its own key, so both are technically possible — this is a product decision, and it changes whether Gate B exists at all.

2. **`agencyShellEnabled` rollout scope.** Same per-tenant Super-Admin flag pattern as `soloShellEnabled` (ships OFF, flipped per tenant)? Confirm; that is the §58-safe default I've planned.

3. **Enterprise tier chrome.** Enterprise resolves to `tierKey === "enterprise"` and mounts via Gate A as an agency operator. Does Enterprise get any per-tenant customization on top of the agency shell in THIS port (§60 Enterprise-only customization), or is that a later slice? I've planned it as "mounts identical to agency now; customization deferred."

4. **Preview surfaces — ship visible or hide behind the flag?** The design deliberately shows Preview surfaces WITH honest "not wired yet" banners (17 flags). Confirm the owner wants those Preview surfaces **visible with the honesty banner** (faithful to the design, §13) rather than hidden until wired. Faithful-port default = show them.

All four are product/scope decisions, not build ambiguities — the port pattern itself is fully determined by the Solo precedent.