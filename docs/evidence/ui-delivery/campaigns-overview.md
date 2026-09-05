# UI delivery evidence — Campaigns › Overview (the Campaign Command Desk)

**Surface:** Solo · Campaigns · Overview (`ov` subtab; production home `src/solo/growth2.tsx` → `Overview()`).
**Change class:** redesign of a visible interface + a materially new flow.
**Stage:** **Flow Prototype — pending owner + Claude Design visual approval.** No production code changed.
**Prototype (the review surface):** `docs/prototypes/campaigns-overview.html` — one self-contained HTML file, throwaway, read-only, zero mutation, every write a deterministic local mock.
**Grounded at:** branch `claude/campaigns-overview-redesign-9h39s6`.

`FLOW_PROTOTYPE: REQUIRED` — users gain a new goal (author + coordinate a campaign brief), new steps (staged brief builder), new surfaces (growth-loop map, dossier drawer, launch-readiness fold-out). Owner approval is **owed before production implementation** (§69 Gate 1). Under the §4 pre-launch stance the production build then goes to `main`; this prototype is the visual-approval surface CD/owner review first.

---

## 1. The job, audience, action, visual direction

- **User's job:** a Solo operator opens Campaigns → Overview to see what growth initiatives exist or need to exist, understand each one's goal/offer/audience/phase/dependencies and its readiness across the campaign loop, and route into the source-owning subtab to do the work — **without Paige fabricating campaign state, metrics, attribution, activity, outcomes, or provider capabilities.**
- **Audience / tier:** universal Solo shell, tenant-specific data (§9). Not operator/God, not agency. Read-only members are handled (governed acts removed, not teased).
- **Primary action:** one gold act — **Create campaign brief**. Secondary actions (Ask Paige to plan, Campaign calendar, Refresh sources) stay quiet; the calendar is honestly disabled until a real scheduling source exists.
- **Visual direction (ported, not invented — §00):** the Solo Mineral/Obsidian token system verbatim from `src/solo/solo-tokens.css` (mirrored via `docs/prototypes/offer-catalog.html`); the six-view Campaigns IA + bottom-rail/control-chrome from the CD pack `campaigns-catalog-sales-spec.md`; the `LIVE/PARTIAL/PROPOSED/UNAVAILABLE` truth vocabulary from `growth2.tsx`. Gold is spent only on the act (`.btn-g` Create/Approve/Request-review), the active-tab underline, and the spinner.

## 2. Information architecture (task-mapped)

1. **Campaign Command header** — plain-English operating brief (what's moving / what's blocked / highest-value next move, derived from the whole workspace not the filtered subset), workspace-safe search + supported filters (phase, source-state), one gold act, quiet secondary actions, honest-disabled calendar. Compact (§11 — no hero on a working surface).
2. **Growth-loop command map** — the backbone: Offer → Audience → Content → Distribution → Conversations → Pipeline → Recorded outcome. Each segment shows its honest state + a source label + a route to the owning subtab + what's needed next. Focuses onto a single campaign when a row asks it to.
3. **Campaign portfolio** — rich expandable rows (not a card grid): name+objective, linked offer, audience, phase pill, channels, one next action, blocker, source. Expand → the launch-readiness fold-out. Click → the dossier drawer.
4. **Launch readiness** — 9 items, each sourced + routed, honest states. **No percentage, no score, no green-all.** "Unavailable / needs confirmation" where the platform can't know, with the reason.
5. **Work in motion + Paige coordination** — real, attributable work only; "Ask PAIGE about this campaign" opens the existing chat with context (no second chat system). Paige recommends/prepares/routes; a governed approval gates any send/spend/publish.
6. **Campaign brief builder** — a focused staged editable drawer (name+objective → offer → audience → outcome → channels → timing + optional owner budget-target → content needs → conversion+follow-up → success evidence), Save draft / Request review, with an honest save success/failure/retry lifecycle.
7. **First-run** — a guided sequence (identify what you sell → objective → audience → first distribution/content path → connect sources only when needed), each step routing to the owning surface. Not a dead empty panel.

**Ownership boundaries respected:** Catalog owns offers · Sales owns terms/payments · Pipeline owns deals · Social owns social/publishing · Performance owns verified reporting/attribution · Vibe Studio owns creation. Overview coordinates; it recreates none of them — every value routes to the surface that owns it.

## 3. The one truth that shapes every value (§13/§70)

`src/solo/useSoloCampaigns.ts:184-187` returns `campaigns: []` **always, by design** — there is no tenant-authorized campaign-state source. So a "campaign" here is an **owner-supplied brief**, never a fabricated running campaign. Loop stages draw on the real per-domain reads that DO exist (Pipeline deals, published Vibe artifacts, routed submissions, recorded payments, recorded social handles) or show an honest absence. **No fake counts, revenue, sales, pipeline movement, social performance, leads, conversion rates, launch dates, active status, ads, posts, publishing success, agent activity, or attribution appear.** The one scenario that shows representative running data (`active`) labels it `MOCK`.

## 4. State coverage (the flow-prototype matrix)

| State | Covered | Note |
|---|---|---|
| Empty · first run | ✅ | Guided sequence, not a dead panel |
| One planned campaign | ✅ | Desk useful with one initiative |
| Multiple campaigns | ✅ | Default working desk |
| Partial readiness | ✅ | Row fold-out: some ready, some unavailable, all sourced |
| Blocked | ✅ | Row + command line + focused loop map |
| Approval required | ✅ | Governed action awaiting owner; Paige never sends unattended |
| Active (labeled) | ✅ | Only place with running data, `MOCK`-chipped |
| Loading | ✅ | Skeleton, no jump into content |
| Source failure | ✅ | "records were not changed" + failed loop segment + retry |
| Disconnected provider | ✅ | Distribution/Conversations UNAVAILABLE, route to Social |
| Stale evidence | ✅ | "needs confirmation · last checked", never silently current |
| Save success/failure/retry | ✅ | Honest lifecycle; error keeps the drawer, "Nothing was changed" |
| Drawer close/cancel/Escape | ✅ | X, scrim, Escape; Tab trap; focus restore to trigger |
| Workspace switch | ✅ | Clears filters/drawer/pending edits/prior data; no cross-workspace inference |
| Mineral + Obsidian | ✅ | Two distinct premium themes (not an inverted palette) |
| Solo viewports | ✅ | 1536×770, 1366×768, 1024×768, 900×1000; PAIGE closed/docked/expanded |
| Read-only member | ✅ | Governed acts removed, not disabled-and-teasing |
| Reduced motion | ✅ | Per-primitive; harness toggle + `prefers-reduced-motion` |

## 5. Evidence — separated by class (§13/§32)

- **Rendered (behavioral simulation, headless Chromium `/opt/pw-browsers/chromium`, DPR 1):** reproducible via the committed drive script `docs/prototypes/campaigns-overview.drive.mjs`. Run `node docs/prototypes/campaigns-overview.drive.mjs` for the assertions (green, below); run `SHOOT=1 node docs/prototypes/campaigns-overview.drive.mjs` to regenerate the 45-frame set (every state × both themes at 1366×768, the four Solo widths at Mineral, PAIGE docked + expanded, interaction traces) into `docs/evidence/ui-delivery/campaigns-overview/`. The 8.4 MB PNG set was rendered + reviewed this session but is **not committed** — the repo keeps the reproducible script, matching the house prototype pattern (`platform-billing-gate1.drive.mjs`).
- **Behavioral (asserted green by the committed drive):** all 32 state renders non-blank; `drawerClosedByEscape = true`; `focusOnOpen = dw-x`; save `showsError = true` then `recovered = true` on retry; `errorCount = 0` `pageerror`/JS-console errors across all 16 scenarios × 2 themes; `ok: true`, exit 0. Adversarial verifier independently traced all 16 scenarios: none crash, blank, or trap the user.
- **Static:** §2/§50/§63/§3 doctrine greps = 0 hits (see review below). Gold budget audited: gold only on `.btn-g` act + active-tab underline + spinner + one OWNER-provenance chip + control-hover (pack spec).
- **`UNVERIFIED`:** (a) **native/authenticated production runtime** — this is a prototype; behavior is simulated, not proven against the live Solo shell. (b) **Fonts** — Geist/Geist Mono are network-blocked in the CI sandbox, so the screenshots fall back to system-ui; they load correctly in a real browser and in the published Artifact (fonts.googleapis.com is CSP-allowed). (c) **Real per-tenant reads** — the prototype mocks the data contract; the production build wires each stage to its real read or honest absence.

## 6. §00 frame evidence (measurements only, no reading)

- Address: `docs/prototypes/campaigns-overview.html` · themes: Mineral (`.paige-solo`) / Obsidian (`.paige-solo[data-theme="dark"]`) · widths measured: 1536/1366/1024/900.
- Faces loaded in the harness render: system-ui fallback (Geist blocked in sandbox — noted). In a real browser: Geist / Geist Mono.
- Truth chips present and rendering: LIVE / PARTIAL / PROPOSED / UNAVAILABLE (+ prototype-only OWNER / MOCK).
- Rail 216px (72px compact ≤1024/900); PAIGE column docked `clamp(360,34%,440)` / expanded `clamp(440,52%,620)` / overlay path below 1080 (documented, per `TenantCommandCenterShell.tsx:481`).

## 7. Crew & review (§1/§5/§39) — throwaway prototype, right-sized

- **Integrator:** this session (ported pack + owner IA).
- **Research scout:** extracted the verbatim Mineral/Obsidian token palette + shell frame (confirmed my token block matches `solo-tokens.css` exactly).
- **Adversarial verifier:** ITERATE → 2 MAJOR + several MINOR, **all fixed** (unlabeled fabricated counts de-quantified; `_forceSaveFail` save-leak reset; dead Source-state filter wired; focus-into-drawer recovery; command-line from full workspace; blocked-brief selection; provider-off banner; input escaping; phase/state fallbacks).
- **Truth & compliance officer:** verdict **honest, on-scope, doctrine-clean — no blockers, cleared for visual approval**; 5 MINOR precision nits **all fixed** (payments bound 200→50 to match `useSoloSalesOps.ts:227` `.limit(50)`; four gold-line borders → semantic warn/bad; mock owner renamed off the real owner's first name; last `esc()`; dead count object removed).
- Assurance note: the compliance pass is an independent agent; the drive/greps are self-run — **self-reviewed where a second live agent was rate-limited, re-run and completed.**

## 8. The approval question (for owner + Claude Design)

**Open `docs/prototypes/campaigns-overview.html` (or the published Artifact). Use the left State list + the Theme / Viewport / PAIGE / Workspace controls to traverse every state.** Then decide:
- Is the **Campaign Command Desk** direction right — the compact command header, the growth-loop map as the backbone, expandable portfolio rows + dossier drawer, the launch-readiness fold-out, and the staged brief builder?
- Are **Mineral and Obsidian** the two premium experiences you want?
- Any changes to hierarchy, copy, density, motion, or the loop treatment before it becomes production?

On approval, the throwaway prototype is deleted/absorbed and the production build wires `src/solo/growth2.tsx` → `Overview()` to the real reads + honest absences, coordinating shared Campaigns routing with the Catalog/Sales/Pipeline/Social/Performance owners.
