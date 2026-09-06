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

---

## Production implementation (approved 2026-09-05) — release candidate, pending merge approval

The owner approved the Command Desk direction; the production build shipped on this branch. The prototype (`docs/prototypes/campaigns-overview.html`) is retained as the frozen design-of-record (§28).

**What was built**
- **Backend foundation** — `supabase/migrations/20261225000000_solo_campaign_briefs_foundation.sql`: the `campaign_briefs` table (owner-authored fields, lifecycle enum, reserved `mission_id`, `version`; two tenant-validated links `offer_id`→`tenant_products`, `pipeline_id`→`pipelines`), the idempotency ledger, a version-bump trigger, tenant-scoped RLS (read-only; writes revoked from `authenticated`), and two SECURITY-DEFINER RPCs `get_campaign_briefs` + `configure_campaign_brief` modeled verbatim on the pipeline governed seam (tenant re-resolved from auth — arg never widens, §9/§59; writes gated on `is_tenant_admin`/owner, §53; optimistic concurrency; idempotent; audited).
- **Client** — `src/solo/useSoloCampaignBriefs.ts` (own tenant-scoped read/write hook; keeps the four-reads contract on `useSoloCampaigns` intact; every RPC error token mapped to a sentence), `src/solo/campaign-desk.tsx` (the desk), `src/solo/growth2.tsx` `Overview` → thin wrapper mounting the desk, keyed by tenant so a workspace switch clears its state; `onRoute` coordinates into the owning subtabs. `src/solo/solo-campaigns.css` desk styles on the real tokens; gold spent only on the act (desk-scoped).

**Evidence — separated by class**
- **Automated / runtime SQL proof (§32/§39):** a throwaway-Postgres RLS/RPC security proof (`scratchpad/pgproof/`, the pre-merge manual proof pattern) — **18/18 assertions PASS, RC 0**: §9 tenant isolation (read + write + cross-tenant offer/pipeline link rejection), §53 role gate, §59 arg-doesn't-widen, name-required, version conflict, version bump, idempotent replay + same-key/different-body conflict, owner-set lifecycle transition + transition→archived rejection, archive removes-from-active + archived_count++, RLS-scoped SELECT (tenant B sees 0 of tenant A), direct INSERT blocked for `authenticated`.
- **Automated tests:** `src/solo/campaign-briefs.contract.test.tsx` (10) — backend security contract (tenant guard, role gate, concurrency/idempotency, link tenant-validation, RLS + governed-write discipline, reserved Mission link) + client contract (RPC-only reads/writes, full error-token parity, no fabricated metric). All **1633 `src/solo` tests pass**; `growth2.render.test.tsx` + `sales-ops.contract.test.tsx` updated to stub the new briefs read.
- **Static:** `tsc` clean on the new files (13 repo-wide errors are all pre-existing, unrelated files); `vite build` green (6353 modules); lints green — `lint:migration-versions`, `lint:definer-fns`, `lint:write-targets`, `lint:governed-execution`, `lint:managed-schema`, `lint:tier-features`, `lint:pg-tokens` (design tokens), `lint:skeleton`, `.github/scripts/lint_migrations.py` (0 warnings), `eslint` clean.
- **Rendered / behavioral:** the approved prototype's frames stand as the visual reference; production render parity relies on the same tokens/classes.
- **Authenticated production runtime: `Proof Owed`.** This session is headless with no browser/auth tool and prod is not reachable — the authenticated live Solo drive (create/edit/save-fail/retry/archive a brief; workspace switch; drawer Escape/focus; four Solo viewports × PAIGE closed/open; Mineral + Obsidian) is **owed after deploy** to a capable session or the owner (§32.c/§28-capability-conditional). The migration's **persisted-apply proof** is owed to CI on merge (§32.a: `deploy-migrations.yml` → `schema_migrations` advances + objects exist).

**Tier (§56/§60/§61):** rides under the existing `growth` feature gate (Solo + Sub-account + Enterprise + God; Agency excluded) — no new capability bit (confirmed against `src/lib/tier/tierFeatures.ts`). Governed acts gated on `canManage` (tenant-admin/owner), enforced independently by the RPC.

**Truthfulness:** no fabricated counts/revenue/reach/attribution/ad-spend/audience-size/active-status/completion. The only surfaced number is a linked pipeline's real deal count (server-resolved). Budget target disclaimed as not spend. Distribution/Conversations/Recorded-outcome are UNAVAILABLE with reasons. Overview coordinates; recreates no sibling subtab; six-tab IA unchanged.

### §39 peer-gate — independent adversarial read of the real diff → ITERATE, all findings resolved

An independent adversarial verifier read the actual pushed diff (not the build report) and returned **ITERATE** with 1 BLOCKER, 5 MAJOR, 4 MINOR. Every one is now fixed on this branch; the backend was re-proven and the frontend re-tested.

- **BLOCKER 1 — drawers inert on open.** The desk renders inside `.campaigns-scroll`, which `useDrawerA11y` marks `inert`; a drawer rendered inline inerted *itself* the instant it opened (non-interactive). **Fix:** both drawers now `createPortal` to the `.solo-campaigns` element — a sibling of the inerted scroll region (never inerted) and still inside `.paige-solo`, so the design tokens and light/dark theme resolve. Mirrors the pre-existing `DetailDrawer` placement.
- **MAJOR 2 — save error swallowed + futile retry.** The builder hardcoded "Couldn't save" and offered a Retry that re-sent a frozen `expectedVersion` on a version conflict. **Fix:** the real server sentence (`res.message`) is surfaced; a stale (version-conflict) refusal closes and reloads current data (blind retry would just fail again); any other failure keeps a *valid* Retry that reuses the same idempotency key.
- **MAJOR 3 — false "sent for review".** The builder claimed "sent for review" unconditionally even when the review transition failed. **Fix:** the review result is honored — success says sent; failure says "Saved as a draft — but it could not be sent for review" with the real reason.
- **MAJOR 4 — fabricated workspace loop state.** `workspaceLoop` hardcoded `offer:"partial"`/`audience:"partial"` with no backing read. **Fix:** the Offer stage is derived from a REAL tenant-scoped Catalog read (`useCatalogOffers` — "partial" only when offers exist, "blocked" on read failure, else "setup"); Audience has no segment source wired, so it is honestly "setup" at workspace scope (§13).
- **MAJOR 5 — paste-a-UUID offer link.** The offer link was a free-text UUID box. **Fix:** a real Catalog picker (search + paging + select over `useCatalogOffers`, with `referenceIds` keeping the linked offer resolvable); the server still tenant-validates the id.
- **MAJOR 6 — dead idempotency ledger / double-create.** A fresh `crypto.randomUUID()` per call made the `(tenant_id, idempotency_key)` ledger unable to dedupe, so a double-click could double-create. **Fix:** the hook accepts a caller-supplied key (random fallback); the builder mints ONE key per submit and reuses it on Retry, plus a synchronous `submitting` latch blocks a second in-flight submit.
- **MINOR 7 — partial update wiped fields (backend).** `update_brief` overwrote every column, so a partial Paige command could null omitted fields. **Fix:** key-presence MERGE (`case when _command ? 'jsonKey' then … else <current> end`) — an absent key keeps the current value (§10/§37).
- **MINOR 8 — phantom "building" status.** The command line counted a non-existent `building` lifecycle. **Fix:** removed; the "moving" tally is real lifecycles only.
- **MINOR 9 — dishonest create version (backend).** Create returned a `version` that assumed a follow-up write. **Fix:** create is a single insert generating its own id + short_ref; it returns the row's real `version` 1.
- **MINOR 10 — dead prop.** Unused `onOpenStudio` removed from the desk.

### §39 re-review round 2 — 7 fixes confirmed; one real §70 first-use blocker found and fixed

A fresh independent adversarial read of the fixed diff **confirmed all seven fixes genuinely resolved with no new defect introduced** (it re-ran the contract test 15/15 and falsified each claim against the real code). It surfaced one real **MAJOR §70 first-use blocker** that the fixes did not cover: from the empty state, the `FirstRun` branch rendered neither `deskRef` nor the drawer portals, so a brand-new tenant clicking **"Create campaign brief"** got nothing — the primary first-use action was inert. Fixed by hoisting the drawer fragment + `deskRef` above the empty-state branch so the builder opens from FirstRun too. **This is now proven, not asserted:** a new render test (`growth2.render.test.tsx`) mounts the desk with 0 briefs through the real `.solo-campaigns` shell, clicks the empty-state CTA, and asserts the builder dialog actually opens with a reachable name field. Also folded the two minor notes: the empty-name guard now shows an inline field error (the earlier `setSaveErr` was dead because the echo only renders on `save==="error"`), and the workspace Offer-signal Catalog read is bounded to `pageSize:1` (existence only, never the whole catalog).

**Re-proof after the fixes.** The throwaway-Postgres RLS/RPC security proof now runs **20/20 assertions PASS, RC 0** — the original 18 plus **9b** (create returns real version 1) and **9c** (partial update preserves omitted fields / key-presence merge). `src/solo/campaign-briefs.contract.test.tsx` grew to **15** with a §39 regression-lock block (portal + stable-idempotency-key + real-offer-picker + honest-workspace-loop + honest-review-report). Full re-run: **`tsc` 0 errors, `vite build` green, all 1639 `src/solo` tests pass** (incl. the new first-use render proof), all CI-run lints green (the single `lint:gold` hit is a pre-existing `BusinessCreditDashboard.tsx:271`, not in this diff and not a CI gate).

---

## Machine-readable evidence record (the `ui-delivery-evidence` gate)

<!-- Parsed by scripts/ci/ui-delivery-evidence.mjs — one `KEY: value` per line at column 0. Honest by construction: what is proven here vs. owed to a browser-capable session (§32.c) is stated per row. -->

```
UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow read this session (SKILL.md + orchestration/delivery references); pre-edit frame produced — mode New Feature, depth Deep, actor-goal flow "a Solo owner authors and coordinates a campaign brief and routes into the owning subtab". Backend seams mapped (owner briefs vs. the source reads that exist vs. honest absences); recorded in PR #970.
PAIGE_UI_DESIGN: PASS: Read .agents/skills/paige-ui-design/SKILL.md + PACK-FIRST this session before implementation. The owner-approved Flow Prototype (docs/prototypes/campaigns-overview.html) is the frozen design-of-record (§28); the production desk ports it faithfully — Mineral/Obsidian tokens verbatim from src/solo/solo-tokens.css, nothing invented or critiqued (§00).
MATERIAL_FLOW_CHANGE: YES: users gain a new goal — author + coordinate a campaign brief — with new steps (a staged brief builder), new surfaces (growth-loop map, dossier drawer, launch-readiness fold-out), and a new first-use guided empty state.
FLOW_PROTOTYPE: PASS: docs/prototypes/campaigns-overview.html — a committed, owner-approved throwaway prototype (both themes, all states, reproducible via docs/prototypes/campaigns-overview.drive.mjs). Owner approved the direction 2026-09-05 before production implementation (§69 Gate 1).
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Audience is the Solo business owner. Purpose: see what growth initiatives exist or need to exist and their readiness across the campaign loop, without fabricated campaign state. Primary action: one gold act — Create campaign brief.
VISUAL_DIRECTION: PASS: The Solo shell's own token system (src/solo/solo-tokens.css), Obsidian + Mineral, ported from the approved prototype. Desk styles are scoped in src/solo/solo-campaigns.css on the real tokens; gold spent only on the act (.desk .btn-g / .dw .btn-g), never a resting border; focus rings are var(--violet). Zero hardcoded hex.
AUTOMATED_EVIDENCE: PASS: npx vitest run src/solo = 98 files / 1639 passed (incl. the first-use render proof in growth2.render.test.tsx and campaign-briefs.contract.test.tsx = 15); npx tsc --noEmit = 0 errors; npm run build green; the throwaway-Postgres RLS/RPC security proof = 20/20 assertions PASS (RC 0).
STATIC_EVIDENCE: PASS: CI lints green on the diff — migration-version-collision, definer-fns, write-targets, governed-execution, managed-schema, tier-features, pg-tokens, skeleton, views, .github/scripts/lint_migrations.py, plus the mcp-governed-door/action-risk lints main merged in. Section 2/50/63 greps clean. The backend security + client contract is source-locked in campaign-briefs.contract.test.tsx.
RENDERED_EVIDENCE: PASS: The approved prototype (the frozen design-of-record) was rendered headless to 45 frames, both themes over the Solo viewport matrix with PAIGE docked/expanded, reproducible via the committed drive script docs/prototypes/campaigns-overview.drive.mjs. The production desk ports the same tokens/classes; its DOM and the first-use open path are proven by the jsdom render suite. Committed production PIXELS are owed to a browser session (see UNVERIFIED, §32.c).
BEHAVIORAL_EVIDENCE: PASS: The jsdom render suite (growth2.render.test.tsx) drives the flow — first-use "Create campaign brief" from the empty state actually opens the builder with a reachable name field; the desk's error/unavailable/loading identities; tab order and Escape. This is a harness drive against in-memory doubles (§32/§70.1), not authenticated runtime; the authenticated drive is owed (see UNVERIFIED).
AUTHENTICATED_RUNTIME: UNVERIFIED: This headless session holds no production credentials and no browser path to the authenticated live Solo shell (live prod unreachable from the sandbox). The authenticated live drive of the deployed Solo Campaigns Overview — first-use create, edit/save-fail/retry/archive, workspace switch, drawer Escape/focus, the four Solo viewports with PAIGE closed/open, Mineral + Obsidian — is owed to a browser-capable session or the owner (§32.c).
KEYBOARD_FOCUS: PASS: Both desk drawers use useDrawerA11y — first focusable focused on open, a Tab focus-trap in both directions, Escape closes, and focus restored to the trigger on close. Drawers are role="dialog" aria-modal with an aria-labelledby title; they portal to .solo-campaigns so the background inert never traps the drawer itself.
ZOOM_REFLOW: UNVERIFIED: The browser 400% / 320px-CSS-px floor pass was not run in this headless session. What IS designed: the desk uses container-query responsive collapse (@container desk (max-width:1000px) into a single column) rather than fixed widths; the 320px-floor zoom behavior is owed to a browser-capable session (§32.c).
REDUCED_MOTION: PASS: solo-campaigns.css carries a @media (prefers-reduced-motion: reduce) block neutralizing the desk drawer/scrim/toast animations and the loop-node hover, plus a @media (forced-colors: active) block giving the surfaces a CanvasText border. Verified via the CSS rule; a live OS-preference toggle was not exercised.
STATE_COVERAGE: PASS: resolving, loading (skeleton), unavailable, error (retry), first-use (guided, not a dead panel), populated, filtered-empty, the brief builder flow (open/type/save-draft/save-failure/stale-conflict/retry/request-review), read-only member (governed acts removed), source failure, disconnected provider (UNAVAILABLE), and workspace switch (state cleared) — covered by the render suite and the state matrix in Section 4 above; the prototype covered the full set including stale evidence.
TRUTHFUL_STATE_LABELS: PASS: LIVE / PARTIAL / PROPOSED / UNAVAILABLE truth vocabulary from growth2.tsx; the only surfaced number is a linked pipeline's server-resolved deal count (contract-asserted, never invented). No count/revenue/reach/attribution/ad-spend/audience-size/active-status/completion is fabricated; budget target is disclaimed as not spend; Distribution/Conversations/Recorded-outcome are UNAVAILABLE with reasons.
SOLO_UI: YES: Solo Campaigns Overview (src/solo/campaign-desk.tsx), mounted by src/solo/growth2.tsx GrowthHub — the canonical Solo Campaigns Overview surface.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: the production desk was not rendered at this viewport in this headless session. The jsdom render suite proves the DOM/flow and the desk uses container-query collapse; the per-viewport authenticated drive is owed to a browser-capable session (§32.c). The approved prototype was rendered across the Solo matrix (reproducible drive script).
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: the real Solo shell with the live docked PAIGE panel (its stacking, scroll owner, and clipping at the reduced content column) was not driven; owed to a browser-capable session (§32.c).
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: production desk not rendered at this viewport here; DOM/flow proven by the jsdom suite, responsive collapse via @container; authenticated per-viewport drive owed (§32.c).
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: the live docked-PAIGE shell at this width was not driven; owed to a browser-capable session (§32.c).
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: production desk not rendered at this viewport here; DOM/flow proven by the jsdom suite; authenticated per-viewport drive owed (§32.c).
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: the live docked-PAIGE shell at this width was not driven; owed to a browser-capable session (§32.c).
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: production desk not rendered at this viewport here; DOM/flow proven by the jsdom suite; authenticated per-viewport drive owed (§32.c).
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: the live docked-PAIGE shell at this narrowest width was not driven; owed to a browser-capable session (§32.c).
UNVERIFIED: (1) AUTHENTICATED_RUNTIME on the deployed Solo surface with the real PAIGE panel and a real tenant — no prod credentials or authed browser in this headless session (live prod unreachable); owed to a browser-capable session or the owner per §32.c, and also why all eight SOLO_* rows are UNVERIFIED rather than PASS (the harness proves the DOM/flow, not the authenticated shell's real scroll owner, stacking, or clipping). (2) Committed production PIXELS of the desk — the approved prototype is rendered + reproducible, but the production desk's frames were not captured in this headless session. (3) A dedicated browser 400% / 320px-floor zoom pass — the desk uses container-query collapse but the WCAG floor was not exercised. (4) A live OS reduced-motion toggle — the per-effect fallback is present and CSS-verified but not exercised against a real preference. (5) The migration's persisted-apply proof on prod — owed to CI on merge (§32.a: schema_migrations advances + objects exist).
```
