# The canonical Solo parity matrix

**Wave 0 baseline of the Canonical Solo Parity Program. Owner-assigned 2026-09-02.**
Grounded on `main` @ `8eda0e8d`. Every row was read from code on `main` — never from a tenant, a
URL, a preview fixture, a legacy account, a branch, or a screenshot.

**The program objective this serves:** every current and future Solo account receives the same
canonical Solo product template. This file is the inventory that makes that measurable. It is not a
backlog and it is not a design document — Claude Design owns everything about how these surfaces
look (§00).

## Status vocabulary

| Mark | Meaning |
|---|---|
| **CANONICAL** | Verified on `main` as one shared implementation, no tenant-identity branch |
| **AUTH-CMP** | Needs authenticated comparison across two real Solo tenants before it can be called canonical |
| **UI-REPAIR** | Needs a shared Solo UI/shell repair — this program owns it |
| **DOMAIN** | Backend / domain-owned — route to that owner, never absorb into a shell PR |
| **SPINE** | Rail / Spine / Mind / Chat-owned — route to that owner |
| **UNAVAIL** | Intentionally unavailable and truthfully labelled — correct as it stands |
| **PARKED** | Real finding, durable issue owed, not this wave |

Three vocabularies for surface truth exist in the repo and none reconciles to the others — the card
schema's five labels (`docs/doctrine/surface-cards/README.md:53`), the code's four
(`src/solo/settings-contract.ts:1`, which cannot express `NOT CONNECTED`), and the tier-matrix
ledger's `wired`/`partly wired`/`structure-only` (`docs/doctrine/tier-matrix.md:400-412`). This
matrix uses its own program vocabulary above and maps to them rather than adding a fourth claim to
the pile.

---

## 0. The finding that governs the whole program

**Three of seven Solo tenants do not receive the canonical Solo shell at all.**

`src/pages/Admin.tsx:373-393` mounts the canonical Solo shell only when
`soloShellEnabled && tierKey === "solo" && soloStandalone`. `soloShellEnabled` is
`activeTenant?.features?.solo_shell_enabled === true` (`src/hooks/useTenantContext.tsx:512`) — a
per-tenant flag on the tenant row.

Measured on production 2026-09-02 (counts only, no account named, §63):

| `features.solo_shell_enabled` | Top-level Solo tenants |
|---|---|
| `true` | **4** |
| unset (`null`) | **3** |

A tenant without the flag never reaches `/solo/{account}/…`; it renders the legacy `/admin` shell.
So **every parity repair this program ships reaches 4 of 7 Solo accounts** until that is resolved.

This is not a shell fork and not a §9 defect — it is config-as-data doing exactly what it was built
to do (`Admin.tsx:354-356` documents it as a deliberate Super-Admin-set rollout flag). But it is the
gap between "the canonical template is correct" and "every Solo account receives it", which is the
sentence this program exists to make true. **It needs an owner decision, not a repair:** finish the
rollout, or state that those three are deliberately held back.

Status: **PARKED — owner decision required.** Recorded as the first entry in §9.

---

## 1. Shared Solo shell — the spine

| Item | Where | Status | Note |
|---|---|---|---|
| One shell, one screen host | `src/solo/SoloApp.tsx:280` `<main data-solo-screen-host>` | **CANONICAL** | Exactly one; only `SoloApp` renders it |
| Shared chrome | `src/components/tenant-shell/TenantCommandCenterShell.tsx` | **CANONICAL** | |
| No tenant-identity fork in the two shell files | `SoloApp.tsx`, `TenantCommandCenterShell.tsx` | **CANONICAL** | Every `account_number` read is addressing or presentation; machine-guarded by `src/solo/soloShell.contract.test.tsx:51-73` |
| Foreign-account URL is corrected, not trusted | `SoloApp.tsx:165-172` | **CANONICAL** | Redirects to the caller's own account. One paint renders at the foreign URL first, but every screen reads `activeTenant`, never `urlAccount` |
| Nav registry selection | `src/components/tenant-shell/tenantShellRoutes.ts:203-214` | **UI-REPAIR** | Forks the nav registry and the Settings branch slug on a URL-path test (`root.startsWith("/solo/")`). Tier-shaped, not tenant-shaped — it cannot fork one Solo tenant against another — but it is outside the `soloShell.contract.test.tsx` guard, whose `SHELLS` list is only the two files above (`:34-37`) |
| Fixture identity in the canonical shell file | `SoloApp.tsx:36-37, 43-119` | **UI-REPAIR** | `Rail`, `TopBar`, `Stub`, `NAV`, `NAV2` are defined and never rendered. `TopBar` hardcodes a person's name and a company name. Dead, but it is fixture tenant identity living inside the file doctrine names as canonical, and the contract test looks for UUIDs and equality comparisons, not name literals |
| Scroll ownership | `solo-tokens.css:83`, `settings-scroll-owner.ts:23-28` | **CANONICAL** | One deliberate vertical owner per surface. `.tcs-main` carries `overflow-y:auto` but its parent is `height:100%`, so it has zero scroll extent — latent, never competing |
| `const full` | `SoloApp.tsx:250` | **UI-REPAIR** | Has **no runtime effect on overflow**. `.paige-solo main{overflow:hidden!important}` wins over the inline style on every route. Its three "scrollable" entries (`compass`, `clients`, `growth`) request `auto` and compute `hidden`. Doctrine already says the CSS is the enforcement (`solo-shell-contract.md:47-51`); the dead const contradicts it in the file a reader opens first |
| Unknown branch slug | `SoloApp.tsx:141` | **UI-REPAIR** | Falls back to `home` silently. No redirect, no 404, bogus slug stays in the URL. `/solo/*` is caught by `App.tsx:307`, so the global NotFound is unreachable |
| Unknown Settings destination | `SoloApp.tsx:254`, `settings.tsx:1463` | **UI-REPAIR** | Renders Setup at the bogus URL; contextual nav highlights nothing |
| Front door before mount | `src/solo/SoloEntry.tsx:26-56` | **CANONICAL** | Resolving → skeleton; signed out → `/auth?next=`; error → visible EmptyState with Retry. Never a blank |

### Account switching

| Item | Where | Status |
|---|---|---|
| Switch control | `MemberAccountSwitcher.tsx:34` | **CANONICAL** — hidden unless standalone with ≥2 memberships |
| Persist-before-commit | `useTenantContext.tsx:494-505` | **CANONICAL** — writes `profiles.active_tenant_id` first, commits client scope only after confirmation, so browser scope and `current_user_tenant_id()` cannot disagree |
| Stale-request protection | four independent layers | **CANONICAL** — hard document navigation (`MemberAccountSwitcher.tsx:50`); load/subject epochs (`useTenantContext.tsx:170-178`); per-hook request gate (`settings-contract.ts:127-140`, used by 8 hooks); render-time identity fence (`account-identity.ts:60-64`) |
| PAIGE scope cleared on switch | `SoloApp.tsx:237` + `paigeClientScope.ts:45-48` | **CANONICAL** — effect plus a read-time refusal, so the guard does not depend on winning a race |

---

## 2. The Solo branch tree — 10 branches, 45 sub-tabs

Test-asserted counts: `src/lib/routing/tierBranches.test.ts:200` (9 branches carry sub-tabs) and
`:215` (45 sub-tabs total). The file's own docblock says "13" branches and "47" sub-tabs
(`tierBranches.ts:104,107`) — **stale prose above a correct count**, the same defect the tier matrix
flags elsewhere.

**Only 6 of the 10 branches have a navigation entry.** `SOLO_SHELL_DESTINATIONS`
(`tenantShellRoutes.ts:148-167`) is Command Center · Clients · Campaigns · Marketplace · Analytics ·
Settings. `paige`, `trust-compass` and `automations` are folded in as *aliases of Command Center*
(`tenantShellRoutes.ts:49`); `calendar` is deliberately addressable without a nav home
(`tenantShellRoutes.ts:187`).

| Branch | Sub-tabs | Nav item? | Status | Basis |
|---|---|---|---|---|
| **Command Center** `home` | systems-check, mind | yes | **CANONICAL** | Real reads (`systems_check_snapshot`, `practice_dashboard_metrics`, `paige_approval_queue_v`, `tenant_knowledge_docs`); loading/error/empty/retry all present. Healthiest department |
| **Paige** `paige` | chat, knowledge, helpers, capabilities | alias only | **SPINE** | Workspace renders; capability truth is Spine/Rail-owned |
| **Trust Compass** `compass` | none | alias only | **UI-REPAIR + SPINE** | Activity feed and both modals read real tables (`paige_client_events`, `paige_actions`). But every department number, the confidence sparkline, "last actions", "+14%" and the autonomy dial are module-level fixtures with no server seam (`compass.tsx:7-23,322,344-345,424,441`), and the primary modal buttons only close the modal (`:296,314`) |
| **Automations** `auto` | library, runs, build | alias only | **PARKED** | `screens.auto` is literally `null` (`SoloApp.tsx:253`); `/solo/{n}/automations` redirects to Settings › Integrations › Automations on a prefix-only match, so all three sub-tab segments are discarded. Zero doc coverage anywhere |
| **Clients** `clients` | people, conversations, calendar, portal, pipeline*, delivery* | yes | mixed — see §3 | *`pipeline` and `delivery` are `hidden:true` but still resolve |
| **Calendar** `cal` | week, agenda, tasks, booking-pages, availability, connections | no (by design) | **UI-REPAIR** | The branch redirects out of itself to Clients › Calendar (`TenantCanonicalCalendarWorkspace.tsx:62-67`) and then **drops the resolved tab** (`:85-92`). Six declared sub-tabs, none reachable as declared |
| **Campaigns** `growth` | overview, catalog, sales, pipeline, social, performance | yes | mixed — see §3 | Six-tab structure is **LOCKED** and correct; order asserted at `growth2.render.test.tsx:431` |
| **Analytics** `analytics` | brief, money, profitability, retention, market-watch, decisions | yes | mixed — see §3 | |
| **Marketplace** `market` | today, browse, installed, updates | yes | mixed — see §3 | |
| **Settings** `settings` | 8 destinations | yes | see §4 | |

---

## 3. Departments — per sub-tab

| Surface | Real tenant read? | Status | Basis |
|---|---|---|---|
| Clients › People | `clients` table | **CANONICAL** | loading/error+retry/search-empty present |
| Clients › Conversations | delegated to canonical inbox | **AUTH-CMP** | Lazy-loaded owner not traced; no error/retry at this layer |
| Clients › Calendar | `list_team_bookings`, `admin_set_booking_status`, `create_internal_booking` | **CANONICAL** | Full state set incl. stale banner |
| Clients › Portal | `usePortalConfig` | **UI-REPAIR** | Six "capability" cards are static strings (`:756-763`); config itself is a real read |
| Clients › Pipeline* | none | **UNAVAIL** | Compatibility landing — "Pipeline moved" + navigate. Correct |
| **Clients › Delivery\*** | **none — fabricated** | **UI-REPAIR (highest severity)** | `conversations.tsx:37-42` hardcodes invented client names, progress percentages, due dates and owner names, and `:181` renders an invented PAIGE narrative naming a person and a cause as fact. `hidden:true`, but the URL resolves and renders. **This is the only Solo surface that presents false tenant data as fact** |
| Campaigns › Overview | **none** | **UI-REPAIR** | `useSoloCampaigns.ts:181` hard-assigns `campaigns = []`. Overview is the department's *default* sub-tab, so the landing view is permanently the unavailable branch, with a state filter built from an always-empty array |
| Campaigns › Catalog | `growth_pages/_funnels/_forms/_form_submissions` | **CANONICAL** | |
| Campaigns › Sales | `growth_form_submissions` | **CANONICAL** | |
| Campaigns › Pipeline | `get_pipeline_workspace`, `configure_tenant_pipeline` | **CANONICAL** | Most complete surface in the tier: idempotency key, `expectedVersion`, typed error mapping, read-only denial banner |
| Campaigns › Social | none | **UNAVAIL** | Fixed UNAVAILABLE panel, honestly labelled |
| Campaigns › Performance | `data.artifacts.length` only | **UNAVAIL** | Three of four cards are literal strings |
| Analytics › Sales funnel (`money`) | `issue_analytics_evidence_bundle` | **CANONICAL** | The only live lens; response shape-validated |
| Analytics › brief · profitability · retention · market-watch · decisions | **none** | **UNAVAIL** | Five static "Not proved" frames. Honestly labelled, but they are declared destinations that can never change state |
| Marketplace › Today · Browse · Installed | `marketplace_catalog_for_tenant` | **CANONICAL** | |
| Marketplace › Updates | none | **UNAVAIL** | Hard-coded UNAVAILABLE EmptyState |
| Marketplace entitlement actions | — | **DOMAIN** | Absent by design with an honest floor (`marketplace.tsx:79`) |

**Mislabelled or dead controls found (all UI-REPAIR):** Campaigns "New deal" opens *pipeline*
creation, not a deal (`growth2.tsx:240`); ClientsHub's "Conversations" tab uses key `'convo'` where
the registry says `'conversations'`, so the click is a silent no-op (`conversations.tsx:213` vs
`tierBranches.ts:156`); Trust Compass "Approve & send", "Decide and log", "Hand back with guidance"
and "Full history" only close the modal or do nothing (`compass.tsx:296,314,342`); the Trust Compass
"Live · she is working now" pill is unconditional and not derived from `liveState` (`:406`).

---

## 4. Settings — 8 destinations

Code carries a truth label per destination (`src/solo/settings-contract.ts:95-102`), locked by
`settings-contract.test.ts:12-20` and rendered to the owner as a badge at `settings.tsx:1596`.

| Destination | Code label | Real write? | Status | Basis |
|---|---|---|---|---|
| **Setup** | `LIVE` | `save_solo_setup_identity` | **CANONICAL** + label question | Full editable brief; visible-scroll repair shipped 2026-09-02. Two open points: "Edit brief" is `disabled` with no denial copy (`settings-setup.tsx:231`) while a message exists but is unreachable (`useSoloSetupBrief.ts:130`); and the doctrine defining `LIVE` (`surface-cards/README.md:58-67`) says a workspace-level surface **cannot** reach `LIVE` without a Rail change |
| **Team** | `PARTIAL` | 4 writes incl. edge fn | **CANONICAL** — label understated | Roster, pagination, member editor, invite wizard, permission-specific denial, and honest "row created but email did not send" reporting. Nothing read caps it below its label |
| **Connections** | `PARTIAL` | many | **CANONICAL** + one gap | Largest surface. The Registration segment silently drops the readiness failure notice — on a failed read `status` is `null` and the line just vanishes with no error and no retry (`settings.tsx:1439` vs the notice at `:583`) → **UI-REPAIR** |
| **Integrations** | `PARTIAL` | n8n + MCP + automation rules | **CANONICAL** — label honest | Two real connectors, six honest refusals. One dead control: "Set up your pipeline" is a `span` styled as an action with no href, no onClick and no reason (`settings-automations.tsx:157`) → **UI-REPAIR** |
| **Notifications** | `PARTIAL` | **none** | **UI-REPAIR** | Two static prose cards. No hook, no query, no control, and therefore none of loading/empty/error/retry/denial/save/cancel. `PARTIAL` claims partial function; the code has none |
| **Security & data** | `PARTIAL` | **none** | **UI-REPAIR** | Three static prose cards, zero reads — while asserting "Authentication and workspace access remain protected by existing account security controls", a positive claim about the account made from no read at all |
| **Vault** | `PROPOSED` | none | **UNAVAIL** | Honest. Copy explicitly disclaims upload and memory |
| **Billing** | `PARTIAL` | read-only | **CANONICAL** on capability | One correctness bug: `useSoloComms.ts:333` deliberately skips the plan read for sub-accounts and sets `isSubAccount`, but `BillingView` never reads it (`settings.tsx:1459`), so the surface reports "No current Solo subscription record was returned" — stating the account has no plan when the read was intentionally skipped → **UI-REPAIR** |

**Scroll policy — verified matching.** `SETTINGS_VISIBLE_SCROLL_DESTINATIONS` = `{setup,
connections, integrations}` (`settings-scroll-contract.ts:68-72`) matches the doctrine table and the
Master Project record. One precision point worth recording: `settings.tsx:1519` applies
`…-scrollbar-hidden` to **all eight**, so the other five are *scrollable with a hidden scrollbar*,
not clipped. Doctrine calls them "form-fitting — they genuinely fit their host", which is a claim
about content height, not computed overflow. If any of the five ever exceeds its host it will scroll
with no visible affordance — the exact Setup defect, waiting. Related: `holdsSettingsScrollFocus`
matches on the `-shown` class (`settings-scroll-contract.ts:35-37`), so on those five the shell pulls
focus back to the PAIGE command field and End/PageDown would not reach the host.

---

## 5. PAIGE entry points

| # | Entry | Where | Status |
|---|---|---|---|
| 1 | Command field ("Direct PAIGE") | `TenantCommandCenterShell.tsx:594` | **CANONICAL** |
| 2 | **⌘/Ctrl + `\`** | `:453-457` | **CANONICAL** |
| 3 | Escape to fold | `:446-451` | **CANONICAL** — guarded against open dialogs |
| 4 | Backdrop click | `:605` | **CANONICAL** |
| 5 | Maximize to full route | `:660-664` → `/solo/{n}/paige/{tab}` | **CANONICAL** |
| 6 | Detach to popup | `:665-673` | **CANONICAL** — degrades with an announcement if blocked |
| 7 | Direct URL `/solo/{n}/paige` | `SoloApp.tsx:141,273` | **CANONICAL** |
| 8 | Per-surface "Open PAIGE" props | 7 call sites | **CANONICAL** — direct function call |
| 9 | `paige:open` CustomEvent | `SoloApp.tsx:228-233` | **PARTIAL — UI-REPAIR** |
| 10 | Dead `TopBar` spark | `SoloApp.tsx:89` | **UNREACHABLE** — `TopBar` never rendered |

**No PAIGE nav item exists** — `paige` is an alias of Command Center. **⌘K does nothing in Solo**:
`AgentPresenceProvider launcherEnabled={false}` (`SoloApp.tsx:285`) gates the global binding
(`AgentPresenceContext.tsx:159-168`); the shell label correctly reads `⌘\`.

**`paige:open` carries a prompt that nothing reads.** Four call sites author a detailed prompt
(`growth2.tsx:144,184,235`; `FundingMatches.tsx:150`) and **no listener anywhere reads
`detail.prompt`**. The scope half does complete (`SoloPaigeWorkspace.tsx:281-282`). One dispatcher,
`FundingMatches.tsx:150`, sits at `/app/funding` outside `SoloApp` where no listener is mounted at
all — already tracked as issue #750. Mirror defect: `paige-open-chat` and `paige-factory-reset` have
listeners and **no dispatcher** anywhere in `src/`.

---

## 6. Documentation parity

| Item | Status |
|---|---|
| Surface cards | **1 of 14 exist** — only `team.md`. The README requires cards for 14 departments (`surface-cards/README.md:6-8`) |
| Cards required for non-surfaces | `documents` and `notes` are named as required but are not Solo routes — two of the 14 can never be written as specified |
| Real Solo surfaces the README never names | Command Center, Paige, Trust Compass, Automations, Calendar, Analytics, Marketplace, Notifications, Vault — no card is even owed for them |
| `setup.md` | Two `main` docs assert it exists (`paige-spine-and-rail-state.md:40-41`, `PAIGE-MASTER-PROJECT-REFERENCE.md:201,1044-1045`); it is only on branch `claude/solo-shell-recovery-handoff-94t269` (PR #731). A claim of *presence*, which is the inverse of the failure that README section was written to stop |
| Tier-matrix Surface ledger | **1 Solo row-group of ~18 Solo surfaces** — only Settings › Connections (`tier-matrix.md:919-1099`). 9 of 10 branches and 7 of 8 Settings destinations have no row, against §66's same-commit binding at `:329-331` |
| Stale ledger citations | `tier-matrix.md:925` cites `SoloApp.tsx:214` for the `SoloSettings` mount; it is `:253`. `tier-matrix.md:1081-1082` claims a drive mounts the "REAL merged `SoloApp`"; the drive's own header says "faithful **reproduction**" (`calendar-settings-usable-drive.mjs:39-41`) and the playbook already ruled it stale (`solo-settings-scroll-and-release-playbook.md:100-102`) — still uncorrected |
| `tierBranches.ts` docblock | Says 13 branches / 47 sub-tabs; tests assert 10 / 45 |

---

## 7. What evidence this program can actually produce

Measured this session, not assumed:

| Class | Available? | Detail |
|---|---|---|
| Automated tests | **YES** | Full suite runs |
| Static / build | **YES** | `ci:tsc` ratchet, build, lint all run |
| Rendered structural | **YES** | Local harness drives at 1536×770, 1366×768, 1024×768, 900×1000 in both genuinely rendered palettes; proven this session at 1536/1536 checks |
| Production (read) | **YES** | `app.paigeagent.ai` returns 200 to `curl`; shipped bundle inspectable |
| **Authenticated runtime** | **NO** | Chromium launches (141.0.7390.37) and production is reachable by `curl`, but Playwright navigation to `app.paigeagent.ai` fails through the agent proxy (`ws_closed_mid_exchange`), **and** `LIVE_DRIVE_EMAIL`/`LIVE_DRIVE_PASSWORD` are unset |

**This is confirmation of an existing lesson, not a new finding.**
`docs/brain/lessons-learned.md:1233` (2026-09-01) already establishes that *"prod is not reachable
headless" is the wrong reason — the browser tunnel is*, and names the same two blockers. Re-measured
independently here with the same result. What this program adds is the tenant half: seven real Solo
tenants exist, so the two-tenant comparison is blocked on **capability and credentials, not on tenant
availability**.

Every `AUTH-CMP` row in this matrix stays `UNVERIFIED` until a session has a scoped test-tenant
credential pair (never owner PII, §32/§63) and a working browser route to production.

---

## 8. The sequenced wave plan

One active wave at a time. Each finishes through review, verification, closeout and release before
the next begins.

**Wave 0 — baseline (this document).** Complete. #774 merged and verified; matrix published; no
product change.

**Wave 1 — Settings parity**, in the canonical order of `SOLO_SETTINGS_DESTINATIONS`:
1. **Setup** — verify record only (repair shipped). Open: the silently-disabled "Edit brief", and
   the `LIVE`-vs-doctrine label question.
2. **Team** — verify; consider whether `PARTIAL` understates it.
3. **Connections** — the Registration readiness-failure notice.
4. **Integrations** — the dead "Set up your pipeline" control.
5. **Notifications** — truth label vs a surface with no function.
6. **Security & data** — same, plus an unbacked security assertion.
7. **Vault** — verify `PROPOSED` is correct as it stands.
8. **Billing** — the sub-account empty state that misreports a skipped read.

**Wave 2 — shared shell and global navigation.** The nav registry fork outside the guard; the dead
`Rail`/`TopBar`/`Stub` fixture identity; the inert `const full`; unknown-slug and
unknown-destination fallthrough; the hidden-scrollbar exposure on the five form-fit destinations.

**Wave 3 — primary departments**, in the owner's order: Command Center → Clients → Campaigns
(six locked tabs) → Marketplace → Analytics. Highest-severity item in the whole tier sits here:
Clients › Delivery's fabricated records.

**Wave 4 — final canonical parity report.**

**Sequencing note.** Wave 1 is the assigned order and stands. But §0's flag finding and Clients ›
Delivery's fabricated data are both larger than anything in Wave 1, and neither is a Settings
concern. Both are recorded here and raised to the owner rather than silently resequenced.

---

## 9. Findings routed out of this program

Each needs a durable GitHub issue before the wave that would otherwise absorb it.

| # | Finding | Owner | Status |
|---|---|---|---|
| 1 | 3 of 7 Solo tenants lack `solo_shell_enabled` and never receive the canonical shell | **Owner decision** | Raised, §0 — no issue; it is a decision, not a repair |
| 2 | Clients › Delivery renders fabricated client records and an invented PAIGE narrative | Solo shell — this program, Wave 3 | [#779](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/779) |
| 3 | Trust Compass headline numbers, sparkline and autonomy dial are fixtures with no server seam; primary modal buttons only close | Spine / autonomy contract | [#780](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/780) |
| 4 | `paige:open` `detail.prompt` authored by 4 sites and read by none; `paige-open-chat` and `paige-factory-reset` have listeners and no dispatcher | Chat / Spine | [#781](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/781) — extends [#750](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/750) |
| 5 | Surface cards, tier-matrix Solo ledger, stale citations, and three unreconciled truth vocabularies | Documentation (+ PR #731 for `setup.md`) | [#782](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/782) |
| 6 | Automations: declared + tested branch, `null` screen, prefix-only redirect discards sub-tabs, zero doc coverage | Solo shell — this program, Wave 2 | Carried in §2; no separate issue — it is this program's own wave |
| 7 | Calendar: six declared sub-tabs, branch redirects out of itself and drops the resolved tab | Solo shell — this program, Wave 2/3 | Carried in §2; no separate issue — this program's own wave |

Existing open issues that remain untouched by this program:
[#738](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/738),
[#745](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/745),
[#750](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/750).

**The PAIGE Attention Register Project does not exist.** Two records state so explicitly
(`paige-spine-and-rail-state.md:182-183`, `paige-spine-tool-migration-map.md:353-354,736-737`), and
their established convention is to link issues from the durable record and note the Register
addition as pending. This file follows that convention rather than claiming an addition that cannot
be made.

---

## How this matrix stays true

Every wave updates its rows in the same PR that ships the repair (§66, §BRAIN.3), and the Master
Project File and Second Brain in the same commit or with a four-part collision-safe handoff. A row
records what is **live**, never what a commit intends.
