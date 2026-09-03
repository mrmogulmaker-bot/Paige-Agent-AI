# Paige Agent AI — Master Project Reference

**The single source of truth. Read this first, every session, every day.** Cowork · Claude Code · Codex — all three agents open this doc before responding to anything substantive. It reflects the reality of the codebase (§13 honesty), not memory.

**Locked:** 2026-08-09 by Antonio Cook + Cowork · **Owner:** Antonio · **Living:** update on every merge · **Cross-refs:** every deeper doc is in Section 9.

> **Note on identifiers (§11/§34):** operator-infrastructure account SIDs (Twilio Org/Account/subaccount SIDs, etc.) are **redacted** from this in-repo doc — GitHub secret-scanning blocks them and doctrine keeps them out of artifacts. The literal values live in the owner's Twilio console + the owner handoff, never in the repository.

---

## 0. How to use this doc (the daily protocol)

### Session-start ritual (Cowork / CC / Codex — every session)

Before responding to ANY substantive request:
1. **Read Section 4** — What's SHIPPED. Never claim something isn't built without checking this first.
2. **Read Section 5** — Current focus + gaps. This is what the platform genuinely needs next.
3. **Read Section 7** — Sequential roadmap. Know what's queued so proposals fit the plan.
4. **Read Section 10** — §13 corrections log. Cowork/CC/Codex have made memory mistakes; the corrections here prevent repeats.

If the request touches a specific slice, load the canonical deep doc for it from Section 9.

### Session-end ritual (any agent that ships work)

1. **Update Section 4 checkboxes** — a capability just became SHIPPED
2. **Update Section 5 status** — a gap closed, or a new one surfaced
3. **Log §13 corrections in Section 10** if the work revealed the codebase disagreed with what someone claimed
4. **Cross-post to the brain** (`docs/brain/` once PR #410 merges)
5. **Commit** with message: `docs(master): update after <PR#/slice>`

### Cowork paste-to-CC/Codex standard

Every paste Cowork produces for CC or Codex includes the line:
> Reference `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` Sections 4 + 5 before starting; update Section 4 on merge; log any §13 corrections in Section 10.

---

## 1. Vision & MVP Definition

### What Paige is

Paige is the **AI COO** for a client-based service business — coaches, consultants, agencies, thought leaders, advisors. Not a chatbot. Not a CRM. An intelligent, tenant-authored, two-way client portal (§7) that orchestrates a team of specialist sub-agents (§8, §14) across a 10-department operating model (§16), and stays Paige-governable end-to-end so an operator or a tenant can drive it by voice or chat (§10, §20).

**Two audiences, one brain (§7 + §8):**
- **For the operator/tenant:** pipeline, follow-ups, retainers, content, campaigns, at-risk triage, daily brief
- **For each client:** hyper-personalized portal, onboarding, expert probing, answers, nurture

**The moat is intuitiveness (§36):** every capability enters through a path a non-technical owner can discover in <5 minutes. If the user has to learn how to prompt, we've regressed the category.

### What MVP means

Per `docs/doctrine/canonical-build-order.md` (owner-locked 2026-08-08):

**MVP = Wave 4 ("MVP integration hub").** Wave 4 combines:
- The 4 Owner Trilogy platform pillars (Section 2)
- The 5 Cowork-locked product specs (Section 2)
- BRD-promoted MVP items: L8 Memory Fabric (was W5) · Interactive Analytics UI (was S2) · Playwright web-browsing (was W7) · Promotional account type (NEW) · Paige chat compaction + persistent history + persistent tasking (BRD §174-176)

**GA target:** ~Month 16 per `docs/strategy/monetization-rollout-2026-07-21.md` (Phase 2 of the 5-phase rollout: Closed Beta → Public Beta → GA → Scale → Category Leadership).

**"Launch-ready" gates:**
- Track S security cluster complete (per `docs/paige-master-implementation-order.md`)
- Wave 8 = BETA LAUNCH prep (#135 Codex sweep · #74 logo scrub · #194+#195 Stripe wire-up · #129 tenant lifecycle wind-down)
- Wave 9 = SOC 2 (post-BETA)

---

## 2. Owner Trilogy — the load-bearing pillar structure

Two pillar systems working together — the platform-side differentiators + the customer-portal ownership matrix.

### Platform-side (4 pillars, owner-locked 2026-08-04)

Canonical strategy doc: **`docs/strategy/owner-trilogy-2026-07-26.md`** (715 lines, revised 2026-08-04).

**§13 correction:** the name says "Trilogy" but the current owner-locked spine has FOUR pillars, not three. Do not shorten to three from memory.

| # | Pillar | What it does | Status | Backing research |
|---|---|---|---|---|
| 1 | **Systems Check** | Automated audit of tenant's operating stack (30-check catalog) | Task #80 · spec pending | `docs/strategy/systems-check-and-analytics-landscape-2026-07-26.md` |
| 2 | **Business Vault** (L1 → L2/L3/L4 partner stack) | Compliance obligations tracker with legal/tax/HR partner network | Task #81 (L1 first) · spec pending | `docs/strategy/business-vault-partner-landscape-2026-07-26.md` |
| 3 | **Twin Capabilities** | Direction A: browser-agent · Direction B: team-member twin · Direction C: business twin | Direction A in Wave 4 | `docs/strategy/twin-capabilities-landscape-2026-07-26.md` |
| 4 | **Owner Analytics + Competitive Intelligence (Newswire)** | Live comp analysis + competitive intelligence feed | Tasks #203 (Live Comp) + #100 (Newswire) + #97 (Integrity substrate) | `docs/strategy/systems-check-and-analytics-landscape-2026-07-26.md` |

**Audit-trail** (sometimes mentioned): maps to **§39 Integrity Governance**, a doctrine section (drafted in `docs/doctrine/claude-md-amendment-draft-2026-07-28.md`), NOT a fifth pillar.

### Customer Portal-side (7 pillars × 5 stakeholders, LOCKED SPEC 2026-08-08)

Canonical: **`docs/product/customer-portal-owner-trilogy-taxonomy-matrix.md`**.

**7 pillars:**
1. **Journey & Progress** — where the client is in the tenant's program
2. **Communications** — messages between client and tenant, Paige-mediated
3. **Documents & Deliverables** — signed agreements, session recaps, coach-produced work
4. **Payments & Billing** — **§38 CRITICAL:** tenant BYO-processor; Paige is never merchant of record for tenant→client transactions
5. **Sessions & Calendar** — booked sessions, kickoffs, reminders, reschedules
6. **Profile & Consent** — client's own PII, communication preferences, data-sharing consents
7. **Support & Help** — how the client reaches the tenant, Paige, or platform support

**5 stakeholders × rights matrix:** Client · Tenant/Coach · Sub-account · Agency · God/Super Admin, with **OWN · CONFIG · WRITE · READ · —** per pillar cell. See the LOCKED SPEC for the full matrix.

---

## 3. Supporting doctrine (§ index)

### Live in `CLAUDE.md` (root — loaded every session)

§§1-48, §50, §57-§59 currently active. Load-bearing for daily work: §1 crew · §2 audience (coaching/consulting/agency, no finance defaults) · §3 voice · §4 shipping · §5 compliance officer · §7 intelligent portal · §8 Paige's team · §9 tenant/operator seam · §10 Paige-governable · §11 world-class floor · §13 honest engineering · §14 Paige's own team · §16 10-department model · §17 $1B growth map · §18 no fragmentation · §22 studio cinematic bar · §25 taste · §27 facelift · §30 diagnose-then-strip · §32 dual-leg verification · §32.a persisted-apply · §32.b RLS SET ROLE · §32.c live-drive · §34 own the moat · §35 OS north star · §36 intuitiveness moat · §37 producer inventory (8 caller classes) · §38 money boundary · §39 peer-gate · §44 ASK don't assume · §46 Cowork rhythm · §47 MCP migrations commit-same-beat · §48 rate-limit scope discipline · §50 trademark hygiene · §57 Super Admin = source of truth (owner-locked 2026-08-11) · §58 anti-regression (owner-locked 2026-08-11) · §59 SECURITY DEFINER caller-scope-in-body (owner-locked 2026-08-11) · §60 same-tier feature parity + one-helper tier-lock (owner-MANDATORY 2026-08-11) · §61 Standing Tier Distribution Default (owner-ruled 2026-08-11, PROPOSED — God YES · Solo YES · Sub-account YES · Agency RESELL-via-Marketplace · Enterprise YES+RESELL; deviations need an owner ruling + code comment; stop asking per-feature) · §62 Two-tier skills sourcing (owner-ruled 2026-08-11, PROPOSED — platform baseline skills pulled from OSS repos + distilled mechanic-descriptive IP-clean per §14, `scoping='platform'`; tenant-loadable skills tenant-authored `scoping='tenant'`, a follow-up wave).

### Proposed in `docs/doctrine/claude-md-amendment-draft-2026-07-28.md` (owner sign-off pending, Task #93)

§§40 Revenue-Stage Awareness · §41 Entity-Type Awareness · §42 Paige C-Suite · §43 Surface-is-a-Tool · §45 Sellability · §49 Unified Comms.

### Security cluster (`docs/security/DOCTRINE_*.md`)

§190/191/192 Phase B Codification (encryption) · §194 Credit Monitoring NEVER Repair · §197 Billing Layer Taxonomy L1-L4 · §198 Legacy Deprecation Protocol + Addendum · §200 Platform Independence from Reference Tenant · §201 Public Language Discipline · §202 Multi-Entity Contact Model · §203 Product Lane Separation Runtime · §205 Metering Safety Net · §208 Shape Delta Discipline · §210 L2/L3 Scope Boundaries · §211/§212 Enforcement · §213 Migration Shape Discipline · §213.c retro.

### GOAT Anchor Registry (intellectual DNA — investor-facing + crew reference)

**§14 (this doc) + `docs/brain/goat-anchor-registry.md`** — WHOSE proven framework anchors WHICH domain of
Paige's professional intelligence (v1, 13 anchors). Doc-side branded names = FINE (bibliography); code-side
(`methodology_anchor`, prompts, seeds, hardwired replies) = mechanic-descriptive ONLY (owner-locked 2026-08-11).
**§15 (this doc) + `docs/brain/paige-skills-inventory.md`** — what Paige DOES (12 categories, ~100 skills, v1);
the S2 seeding target list. Complements §14 (executes vs reasons-from). Same IP-clean code rule.

### Paige-strategic doctrine (`docs/doctrine/paige-*.md`)

`100M-org-blueprint.md` (§16 canonical) · `1B-growth-map.md` (§17 canonical) · `paige-os-architecture.md` (§35 derived) · `money-spine-architecture.md` (§38 derived) · `paige-c-suite-roster.md` (proposed §42) · `paige-corporate-structure-2026-08-01.md` (Wyoming LLC → Delaware C-Corp + QSBS + Core Connect holdco + TX domicile) · `paige-memory-fabric-l8-2026-07-28.md` (L8 owner-flagged, promoted into MVP) · `paige-unified-comms-substrate-2026-07-29.md` (§49) · `paige-voice-layer-2026-07-28.md` · `paige-chat-universal-control-surface-2026-07-28.md` · `paige-practice-blueprints-2026-07-29.md` (deferred past W4 per owner ruling 2026-08-08) · `tenant-lifecycle-winddown-2026-07-28.md` (Task #129) · `paige-n8n-orchestrator-brain-doctrine.md` (Task #118 template library).

---

## 4. What's SHIPPED (stop asking about these)

### The Canonical Solo Parity Program — Wave 0 baseline (2026-09-02)

**Status: standing program. Wave 0 RELEASED** — merged to `main` as `a289d0bc` (PR #783); **Wave 1
in flight: Settings → Team.** The objective is that every current and future Solo
account receives the same canonical Solo product template as `main`. Wave 0 shipped the baseline and
**no product change**. The inventory lives in `docs/doctrine/canonical-solo-parity-matrix.md` — every
Solo route, branch, sub-tab, Settings destination and PAIGE entry point, each marked canonical /
needs-authenticated-comparison / needs-UI-repair / backend-owned / Spine-owned /
intentionally-unavailable / parked.

**Canonical Solo shell policy — OWNER-RULED 2026-09-02.** Every **eligible standalone** Solo tenant
must receive the canonical Solo shell and product template represented by `main`;
`solo_shell_enabled` is the intended canonical end state. No tenant-brand, account-number, URL,
fixture or special-customer shell fork is permitted, and no exceptions are to be invented — an
exclusion is legitimate only from real platform eligibility, never customer preference. The ruling
does **not** authorize a bulk production flag mutation inside a parity baseline or a Settings
repair; enablement is routed to the controlled Solo Shell Rollout Audit
([#790](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/790)), which carries its own
exact-head Gate 2 and separate production-data authority.

**The load-bearing answer this file must now give.** Asked *"does every Solo account get the same
product?"*, the answer today is **not yet, and not because of a shell fork**. `src/pages/Admin.tsx:373-393`
mounts the canonical Solo shell only when that tenant's own `features.solo_shell_enabled` is `true`
(`src/hooks/useTenantContext.tsx:512`). Measured on production 2026-09-02: **4 of 7 top-level Solo
tenants carry the flag; 3 do not** and render the legacy `/admin` shell. Every parity repair reaches
4 of 7 Solo accounts until the owner rules on finishing the rollout. This is config-as-data behaving
as designed, not a defect — but it is the gap between "the template is correct" and "every account
receives it".

**Verified structure (read from code, test-asserted where noted).** 10 Solo branches and 45 sub-tabs
(`tierBranches.test.ts:200,215` — the file's own docblock saying 13/47 is stale). Only **6 branches
have a navigation entry**; `paige`, `trust-compass` and `automations` are aliases of Command Center
and `calendar` is addressable with no nav home by design. 8 Settings destinations, each carrying a
truth label in code (`src/solo/settings-contract.ts:95-102`). Production now has 13 tenants — 2
agency, 7 top-level Solo, 4 sub-account.

**Known and parked, not silently absorbed:** Clients › Delivery renders fabricated client records and
an invented PAIGE narrative ([#779](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/779) —
the only Solo surface presenting false tenant data as fact); Trust Compass headline numbers and its
autonomy dial are fixtures and its primary buttons only close the modal
([#780](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/780)); `paige:open` prompts are
authored by four call sites and read by none
([#781](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/781)); Solo documentation parity —
1 of 14 surface cards exist and the tier-matrix Solo ledger covers 1 of ~18 surfaces
([#782](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/782)).

**`UNVERIFIED` — authenticated comparison across two real Solo tenants.** The blocker is already on
record: `docs/brain/lessons-learned.md:1233` (2026-09-01) establishes that production *is* reachable
and that what fails is the browser's CONNECT tunnel, alongside unset
`LIVE_DRIVE_EMAIL`/`LIVE_DRIVE_PASSWORD`. Re-measured independently this session with the same
result. What this program adds: seven real Solo tenants exist, so the two-tenant comparison is
blocked on capability and credentials, **not** on tenant availability.


### Solo Settings → Setup — the visible-scroll policy (LIVE on production; merged 2026-09-02)

**Status: MERGED to `main` and deployed.** Gate 1 approved 2026-09-02; Gate 2 approved on exact
head `77d94c66`; merged as `1d189155` (PR #751). Recorded here per §0 because it changes an
owner-facing Solo capability **and the official Settings UI policy**, which is answered from this
file. **The authenticated owner browser proof below is still `UNVERIFIED` — shipping did not
satisfy it.**

**The owner-facing change.** Solo Settings → Setup now draws a visible, draggable main-content
scrollbar. Before this, it rendered 3,973–4,174px of business brief into a 702–934px host at every
supported Solo viewport — **78–82% below the fold on arrival with no scrollbar in either lane** — so
an owner could reasonably believe the first section was the whole page. It was the only one of the
eight Settings destinations that overflowed its host. Nothing about the business brief, its
information architecture, its fields, permissions or provider connections changed.

**The policy, as ruled (2026-09-02).** A Settings surface may use a clearly visible, accessible
main-content scrollbar when real configuration content materially exceeds the available viewport.

| Surface | Policy |
|---|---|
| **Settings → Setup** | **Visible scrollbar — newly authorized** |
| Settings → Connections (incl. Calendars), Settings → Integrations | Visible scrollbar — already authorized |
| Short Settings destinations that genuinely fit (Team, Notifications, Security & data, Vault, Billing) | Form-fitting |
| Command Center, Clients, Campaigns, Analytics | Form-fitting, design-locked — a separate owner ruling is required to change any of them |
| Marketplace | May use a visible main-region scrollbar when its content requires it. **Out of scope of this change; its code was not touched** |

**This is not a global scrolling rule for the platform.** The exception stays enumerated.

**Where the policy lives.** `SETTINGS_VISIBLE_SCROLL_DESTINATIONS` and
`settingsDestinationShowsScrollbar()` in
`src/components/tenant-shell/settings-scroll-contract.ts` — one value, read by both `SoloSettings`
and `settings-scroll-drive.mjs`, with a test asserting the two agree. It **fails closed**: an
unrecognised destination stays form-fitting. Adding a destination to it is a product decision
requiring an owner ruling, not a repair.

**Why the defect survived every guard.** The policy used to be
`const visibleScroll = tab === "connections" || tab === "integrations"`, and the only test of it
asserted that exact source line. Setup resolved `overflow-y: auto` from the same shared exception and
simply never received the class that *draws* the bar — so it could scroll and could not show that it
scrolled, and nothing failed. **No CSS changed in the repair**: the visible-scrollbar rules already
existed and were already correct.

**Canonical across all Solo tenants.** One shared shell, one shared policy value, no tenant, account
number, URL or fixture branch anywhere in the change. Verified structurally identical across two
synthetic Solo tenant contexts.

**A harness defect this exposed, and repaired.** The Settings drive had iterated `light` and `dark`
for weeks while rendering one palette both times: the harness used `forcedTheme`, which leaves
next-themes' `resolvedTheme` alone, and the shell stamps its own `data-pg` from `resolvedTheme`. So
**every "both themes" claim from that harness was one palette measured twice.** Repaired, and the
drive now scores the rendered token per environment instead of trusting the loop. Geometry is
theme-independent, so prior geometry results stand; prior colour claims from that harness do not.

**Evidence.** Rendered structural at 1536×770, 1366×768, 1024×768 and 900×1000 in both palettes:
Setup passes the full visible-scroll battery — bar visible with a stable gutter, wheel, End, PageDown,
Space and scrollbar drag all reach the last control, travel reaches the end, focus reaches the
spatially deepest control with a visible ring, keyboard visits every control, focus exits both
directions, one scroll owner, no horizontal overflow. Locked surfaces stay `overflow-y: hidden`.

**`UNVERIFIED`, and not claimed: authenticated owner browser proof.** No leg has been driven signed
in on the live platform. A reproduced-shell drive with a synthetic transport is structural evidence,
never authenticated proof — and the merge did not change that. **This is the one thing still owed on
this change**: sign in as a Solo owner → Settings → Setup → confirm a scrollbar is visible on arrival
at a laptop height → drag it to the bottom → confirm *How Paige uses it* is reachable → Tab from the
top and confirm focus stays on screen to the last control → open and fold PAIGE and confirm position
and keyboard path survive → repeat on a second Solo tenant.

Records: `docs/brain/decision-log.md` (2026-09-02) · `docs/doctrine/surface-cards/setup.md` (the
department card, carried by PR #731) · `docs/brain/solo-settings-scroll-and-release-playbook.md`
(the Settings-scoped playbook — update owed, see that PR).

### PAIGE Mind — a recorded Pipeline outcome, read and cited (LIVE on production, capability `PARTIAL`) — 2026-09-02

**Evidence, on current `main`.** Merged in **PR #747** as `dcddf6761e84cc298588b6fbe1c39c61a5ec5fc8`,
after owner Gate 2 at exact head `b43b15395ca300b8d2746ee36ac70828f6fd82da`. Vercel production
deployment `dpl_AypwRwqAWfAEyB74tbNT7XcLy8nq` is `READY` at that commit; `deploy-edge-functions` and
`deploy-migrations` both succeeded and moved `edge-live` and `db-live` to it, with zero drift on
either. Applied on prod ref `xygzykjyynhzqytbqnzu` (§32.a, queried rather than assumed):
`supabase_migrations.schema_migrations` carries `20261041000000`, the re-created projection exists,
and it emits `client_id` from the visibility-filtered clients join rather than from the deal row.
All five post-merge workflow runs on that commit are green.

**Owner job.** Ask PAIGE what a client's recorded Pipeline stage outcomes actually prove, and get an
answer that names its source rather than inferring past it.

**Human surface.** Solo Growth → Pipeline (`/solo/{account}/growth`) → a deal card → **Open PAIGE for
this client**, which scopes the Solo PAIGE fold to that deal's client. Scope is UI context only: the
server re-resolves tenant by `current_user_tenant_id()` and re-authorizes the client before any read,
and the scope clears on a client or account switch.

> **THE ENTRY PATH WAS BROKEN AND IS NOW REPAIRED IN CODE — issue #765, PR #773 (`f7fe9718`).**
> Found post-merge on `dcddf6761e`: setting a client scope reset history hydration, which
> auto-resumed the newest saved thread, which released the focus just set. The scope was dropped
> before the person could type, so the binding never received a `clientId` on any account holding a
> saved conversation — i.e. every real account. It failed closed: no evidence reached PAIGE, nothing
> leaked, no client's transcript reached another. **Repaired 2026-09-02** in the shared Chat
> component, so both client-focusing surfaces are covered, together with three connected defects the
> same auto-resume caused: a refusal explanation destroyed, a saved conversation opening the wrong
> thread, and a stale cross-account focus. Every guard is mutation-proven.
>
> **The repair does NOT lift this capability to `LIVE`.** It is code-proven only. An authenticated
> owner drive on two Solo tenants and rendered PAIGE drawer proof are both still `UNVERIFIED` and
> owed — and that drive is the check that would have caught #765 in the first place. Until it runs,
> the rows below are proven by contract tests and grants, not by a person completing the flow.
> Separately parked and untouched: #766 (keyboard-focus trap), #769–#772.

**PAIGE capability, stated exactly.** She can read safe, tenant-scoped and client-scoped recorded
Pipeline outcome evidence through the merged safe lens `public.get_pipeline_spine_evidence`, state
what it proves, cite the opaque `rail:<uuid>` record reference, mark a stale record as old rather
than current, and say plainly when nothing is recorded — an empty read is never reported as proof
that no activity occurred. **She cannot move, create, archive, delete, route or approve a Pipeline
deal through this capability.** No Pipeline Chat write tool and no approval path exists here:
`classification: read`, `riskPolicyKey: read_only`, `approvalAuthority: none`.

**The citation is the one identifier permitted to cross** (owner-approved Spine Change Request,
2026-09-02). It names a record, not a person or a deal, and is asserted to appear only inside the
citation. Title, summary, payload, stage name, deal id, contact/client/user/tenant ids, provider
bodies, secrets and reasoning traces all stay forbidden.

**Truth label: `PARTIAL`, not `LIVE`, and neither this release nor the #765 repair lifts it.** Still
owed and still `UNVERIFIED`: an authenticated owner drive on two Solo tenants, rendered proof at
1536×770, 1366×768, 1024×768 and 900×1000, and `supabase test db` with a full-history replay. **The
owed authenticated drive is exactly what would have caught #765** — every layer below the entry path
was proven, and the one thing not driven is the one thing that failed (§70: a wired code path is not
a usable capability). That lesson stands after the repair, because the repair is also code-proven
only. Detail:
`docs/delivery/paige-spine-mind-handoff.md`; per-tier rows: `docs/doctrine/tier-matrix.md` (§66
ledger). Parked, not started: issues #748, #749, #750, #766, #769, #770, #771, #772. (#765 is REPAIRED — PR #773, `f7fe9718`.)

**Next required lane, not started:** the Pipeline Chat Write Bridge (§5) needs its own Gate 1.

### Solo Team — PAIGE can act on the team (LIVE on production, capability `PARTIAL`) — 2026-09-02

**Evidence, on current `main`.** Merged in **PR #728** (`76bb3bbca`, *PAIGE Spine foundation registry
and safe Pipeline evidence*), not through #675. Applied on prod ref `xygzykjyynhzqytbqnzu`:
`supabase_migrations.schema_migrations` carries `20261039000000` and `20261040000000`, and
`list_tool_autonomy()` returns all five `team_*` rows under the `Team` category. Documentation record:
**PR #675** (`05735f26b`) and **PR #730** (`ed22066e7`, which reconciled this file to the live
capability) — both documentation only, shipping no code.

**Owner job.** Manage the people in a workspace: team members, invitations, work details, roles and
access.

**Human surface.** Solo Settings → Team (`/solo/{account}/settings/team`, `SoloTeamWorkspace`).

**PAIGE capability.** She may propose and execute the governed Team actions **only through the
canonical approval route**. She reads a server-resolved, active-tenant roster block; she may lift a
`member_user_id` or `invitation_id` out of it, never a name she resolved herself. Every act runs
through the same seam the Team screen uses — the two RPCs under the caller's own JWT, the three
invitation acts through the `solo-team-invitations` edge function — so the database's in-body
authority checks apply to a sentence exactly as to a form. A tenant-agreement precondition refuses
when the seam's workspace is not the one the conversation is about.

| Tool | Risk | Approval |
|---|---|---|
| `team_invite_member` | `high` | the real owner approval card |
| `team_invite_resend` | `high` | the real owner approval card |
| `team_invite_revoke` | `high` | the real owner approval card |
| `team_set_permission` | `high` | the real owner approval card |
| `member_grant_role` | `high` | the real owner approval card |
| `member_revoke_role` | `high` | the real owner approval card |
| `team_set_work_profile` | `ordinary` | normal compact confirmation |

`high` means the gate accepts only a fingerprint of the exact rendered card, carried in the request
**body** — a channel the model cannot write. The model asserting consent is refused.
**`team_set_work_profile` is `ordinary` and is NEVER a permission change**: the RPC writes a job
title and responsibilities and cannot reach `permission`. Any copy implying otherwise is false.

**Truth label: `PARTIAL`, not `LIVE`** — see `docs/doctrine/surface-cards/team.md`.

**The live limitation.** **Owner-visible workspace-level outcome history is still missing.** A Team
action emits no Rail event: `emitRailForTool` returns early on `if (!contactId) return`, because the
Rail is per-client and a Team action has no contact. That early return is correct — emitting one
anyway would invent a client involvement. An attribution row IS written to `paige_audit_log`,
tenant-stamped and complete, but **no Solo surface reads `paige_audit_log`**. So a permission change
PAIGE makes on a team does not appear in that team's own activity feed.

**Owed, and not claimed:** authenticated owner browser proof of the Team flow **remains owed**. No
leg of it has been driven on the live authenticated platform, and the capability is already serving
production.

**Unstarted:** the workspace-level outcome projection — safe actor, action, target member or
invitation, approval binding, result, owner-visible evidence — is an **unstarted Spine Change
Request** in its own coordinated workstream. Owner ruling 2026-09-02: a Team event is not a client
event, and no client Rail event may carry a null `contact_id`.

**Separate and still active:** **PR #728's post-merge P1/P2 hotfix is a live workstream, and nothing
in this documentation repairs it or makes it irrelevant.** Two of its P1s land on surfaces named
above — `useRailEvents` can merge the previous scope's events into the feed after a tenant or contact
switch, and `useSoloPendingActions` keeps the previous tenant's pending actions on the Trust Compass.
The other two P1s are in `paige-apply-extraction`; the P2 is a failed Skip leaving a proposal
unretryable.



### PAIGE Spine — tool migration state (planning record, 2026-09-02; NO capability changed)

**Measured on `origin/main` `e3592089` by running the repository's own guards, not from memory.**

| Measure | Value | Guard |
|---|---|---|
| Inline legacy Chat tools | **105** | `npm run lint:chat-tool-registry` |
| Registered Spine capabilities | **1** | `scripts/ci/paige-spine-registry-lint.mjs` |
| Classified actions | **62** — 32 `ordinary` · 28 `high` · 2 `owner_only` · 5 exempt · 0 unclassified writes | `npm run lint:action-risk` |

**The Spine is PARTIAL and no department-wide connectivity is implied.** The one registered
capability is `pipeline.deal_stage_evidence` — a read, `chatBinding: PARTIAL`, and **`mindBinding:
PARTIAL` since #747 merged (`dcddf676`, 2026-09-02)**, mapped to **no** Chat tool. The guards were
re-run on the merged head: 105 · 1 · 62, all unchanged. PAIGE reaches every department today through the 105
hand-wired tools, not through the Spine.

**Two of the 62 classified actions are not Chat tools at all** — `marketplace_install` and
`marketplace_uninstall`, already on record above as containment tombstones. The migration map
re-derived this independently and confirms it; it is not a new find. The real install path is the
`marketplace-install` edge function, which the Chat gate never sees (#740).

**Leg 7 — *owner can see the truthful result* — is closed for 100% of PAIGE's writes.** Of the 60
classified actions that are Chat tools, **13** emit a per-client Rail event whose production read is
denied (#746), and **47** emit only a `paige_audit_log` row, which has no Solo reader. This is why
no mutating capability can be labelled `LIVE` today, regardless of how well it is built.

**Migration is phased and governed.** The plan is
`docs/architecture/paige-spine-tool-migration-map.md` — every one of the 105 tools carries exactly
one disposition (**13 Migrate · 79 Spine Change Request · 3 Keep unavailable · 10 Retire**), nine
sequenced waves, a CI-ratchet proposal, and the ten-condition `LIVE` standard. Wave issues:
[#756](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/756) (foundation) ·
[#757](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/757) ·
[#755](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/755) ·
[#758](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/758) ·
[#759](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/759) ·
[#760](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/760) ·
[#761](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/761) ·
[#762](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/762) ·
[#763](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/763).

**No legacy tool is considered live through this plan.** The map is a planning record. It migrated
nothing, enabled nothing, and promoted no label. Three Spine Change Requests it identifies — a
workspace-level outcome projection, non-client subject types, and a record/list evidence shape —
are **unrequested and unstarted**, and every wave after the foundation depends on at least one.

### Paige's tool confirmation is bound to SERVER-HELD state (2026-09-01, `20261021000000`)

`confirm:true` on a mutating tool is no longer decided by the model's own output. The autonomy gate
in `paige-ai-chat` mints a `paige_tool_confirmations` row on every `needs_confirm`, and a later
`confirm:true` executes ONLY by atomically consuming a row for that tool, requester and tenant that
is unspent, unsuperseded, unexpired, and **created before the current turn began**. Minting
supersedes any earlier open proposal for the same tool, so one approval buys exactly one execution.

For a list of high-consequence tools (`TOOL_IDENTITY_FIELDS`) the row also pins an identity. Some
of those values ARE shown to the operator (the phone number, the role, a workflow or page id);
others — `user_id`, `contact_id`, `number_id` — are **not**, and the pin there buys less than it
looks like: a mismatch re-renders the *same* sentence, so a second yes executes on the new subject.
It closes an accidental swap; it does not let the operator tell two subjects apart. Naming the
subject in the summary is filed separately.

It deliberately does **not** pin whole arguments: history carries only `{role, content}`, so the
model re-authors its arguments from prose on the confirming turn, and hashing a `document_generate`
payload made the flow unapprovable.

**Any user turn satisfies the gate — including "no, don't."** This proves a turn intervened, never
that the operator agreed.

**Both versions before this one were BLOCKED by the §39 peer-gate**, the first for that
whole-argument hash, the second for a supersede that keyed on the tool alone while the claim keyed
on tool+identity — which livelocked any *batch* ("delete these two contacts") in exactly the same
silent way. Neither was reachable by the SQL proof or the unit tests as they stood.

**What this closed.** The gate previously tested `gateArgs.confirm`, which is
`JSON.parse(tc.function.arguments)` — the model's own output. A model emitting `confirm:true` on
its first call executed immediately; and because the tool loop dedupes rounds on the exact argument
string, it could even propose and self-approve **inside a single HTTP turn** with no operator
message in between. `MUTATING_TOOLS` carried **52 entries** when this was written, two of which (`marketplace_install`,
`marketplace_uninstall`) are containment tombstones with no tool definition and no dispatch branch
and can never reach it. **Re-measured 2026-09-02 on `e3592089`: 62** (`npm run lint:action-risk`) — the
set is `mutatingTools()`, i.e. every entry in the risk policy, and Solo Team, Comms and Pipeline have
added to it since. The two tombstones are unchanged and are still the only two with no tool definition. The rest include `member_grant_role`,
`n8n_delete_workflow`, `zapier_run_action` and `comms_buy_number`.

**What it does NOT claim (§13).** It proves the server proposed first, that a turn intervened, that
what runs is what was proposed, and that an approval is spent once. It does **not** prove the human
said *yes*. Binding to an authenticated approval click needs per-surface UI work — only
`PaigeAIChat` renders `PaigeConfirmCard`, and `useSoloChat` drops the confirm frame — and is
tracked separately. `auto` is unchanged and still carries no confirmation, by design (§67).

**§18:** generalizes `pipeline_archive_confirmations` (#709), which already did this for one tool.
Not a rival seam. **Proof:** 11/11 behavioural assertions against prod inside `BEGIN … ROLLBACK`
via the committed `scripts/tool-confirmation-sql-proof.sql`, plus 46 unit tests including explicit
livelock regressions. Inside a studio thread `STUDIO_AUTO_TOOLS` still flips five build tools to
`auto`, so the binding does not reach those there.

**MERGE CORRECTION, 2026-09-02 (§13).** The binding above shipped, and the branch below
replaces the RUNTIME half of it: `paige-ai-chat` now gates on `paige_pending_confirmations`,
which proves everything the row above proves and additionally executes the STORED arguments
and requires the operator's Approve click — the two things #711 recorded as NOT proven. The
`paige_tool_confirmations` table and `_shared/toolConfirmation.ts` remain in place but are no
longer on the execution path. See `docs/brain/decision-log.md`, 2026-09-02.

### PAIGE Chat — the governed working interface (2026-08-31; **MERGED and LIVE via PR #728 `76bb3bbca`**, 2026-09-02)

**Status CORRECTED 2026-09-02 — the original text is preserved below it, not deleted (§58).**
~~*On a branch, verified, awaiting Gate 2. Nothing below is live on production yet.*~~ **This work is
MERGED and LIVE on production.** It reached `main` through **PR #728** (`76bb3bbca`), not through
#675; #675 was rebuilt on `main` and merged as documentation only (`05735f26b`). Verified rather than
inferred: `main` carries every migration named below and its `paige-ai-chat` handler is a superset of
the branch's. Recorded here per §0 so the next session does not re-diagnose any of it.

Six vertical slices, each independently reviewed by an adversarial agent, repaired, and re-verified.

| Slice | What changed | Where |
|---|---|---|
| S1 | Every provider call files its `paige_llm_trace` row under the tenant whose evidence it carries. Eight of nine call sites passed no trace context and wrote untenanted platform rows — the ones carrying the MOST evidence. | `paige-ai-chat`, `_shared/claude.ts` seam |
| S2 | A focused-CLIENT switch now ends the conversation the way an account switch does (one composite scope epoch). The isolation fence stopped being opt-in — the one surface that focuses clients did not set the flag. `paige_chat_turn_append` gained a tenant predicate. A refused client focus is released, and the refusal survives the reset it causes. | `PaigeAIChat.tsx`, `PaigeWorkspace.tsx`, migration `20261018000000` |
| S3 | **A credit report dropped into chat no longer writes eight tables unasked.** It produces a proposal a person reviews field by field; approval carries KEYS, never values, and the server writes from its own stored extraction. Prohibited sensitive categories excluded; uncertainty omitted rather than defaulted. | `paige-ai-chat`, new `_shared/credit-extraction-payload.ts`, new `paige-apply-extraction`, migration `20261019000000` |
| S4 | An approval is BOUND to the call it approved, not to a boolean. `update_client_data` and `delegate_to_subagent` entered the gate. The autonomy catalogue now covers every gated tool (was 23 of 46). **The Trust Compass now actually clamps** what Paige may do unattended. **The binding MECHANISM changed twice after this — read R1 and R2 below before trusting any description of it.** | `paige-ai-chat`, migrations `20261020000000`, `20261039000000` (renumbered from `20261021000000` on the 2026-09-02 merge — that version was already taken on prod by main's tool-confirmation binding) |
| R1 | S4's mechanism (the surface echoes a fingerprint back) made every gated tool **un-executable on five of the six chat surfaces**, because only `PaigeAIChat` sends the echo — and the client-portal seat lost `update_client_data`, its only write. The proposed call is now persisted and approval carries a TOKEN; the STORED arguments execute, so the model never restates the call and a document-sized argument cannot livelock. | `paige-ai-chat`, migration `20261023000000` |
| R2 | **R1 opened a self-approval hole and this closes it — see §10.** The nonce (a token cannot be redeemed by the turn that minted it) held, but was not enough: the token is a fingerprint of the ACTION, so any LATER request that re-proposed the same call got it back and spent it — including one whose human message was "cancel that". **The token is removed.** Approval is a rendered card (unforgeable — a model cannot write a request body) or `confirm: true` (the model's word); both redeem the STORED call. Declining now CANCELS the proposal. | `paige-ai-chat`, migration `20261026000000`, `PaigeConfirmCard.tsx` |
| R3 | **The risk split became a policy.** `_shared/action-risk.ts` classifies all 51 mutations once — 28 `ordinary` (either channel), 21 `high` (rendered card only; the model's word is refused), 2 `owner_only` (not a chat action at any approval strength). `MUTATING_TOOLS` is that policy's key set, so there is no second list to drift out of step. An unclassified write refuses at dispatch AND fails CI (`lint:action-risk`). **Owner ruling 2026-09-01 absorbed:** Paige may never grant or raise her own autonomy through Chat, so `automation_set_grant`/`automation_set_state` refuse down every channel including a clicked card. | new `_shared/action-risk.ts`, `paige-ai-chat`, new `scripts/ci/action-risk-lint.mjs` |
| A | §67 **the process record**: `paige_automations` + `paige_automation_acts` + a trigger catalogue. A grant is fingerprinted over the act chain, so changing the chain drops an `auto` grant back to `confirm` — the human approved a specific sequence. | migration `20261022000000` |
| B | §67 **the resolver**: `resolve_automation_autonomy` = `min(grant, most restrictive act floor, Trust Compass ceiling)`, returning `capped_by` (which bound is holding it) and `dark` (why it could never fire) as separate answers. | migration `20261024000000` |
| C | §67 **the chat seam**: five tools. A tenant describes repeatable work and Paige builds it — born `confirm` + `draft`, explicitly, whatever the request said. **She can build a process; she can never arm one.** Two of the five (`automation_set_grant`, `automation_set_state`) became `owner_only` under R3 and now refuse in chat outright — so **`paige_automations.granted_lane` and `.state` are currently settable by nothing**, the Settings control being owed to CD (§00). Automations were already inert (no trigger emits), so nothing regressed. | `paige-ai-chat`, migration `20261025000000` |
| C1 | **Every write Paige performs now says what changed, for whom, on whose authority, and whether it worked.** Ten of forty-nine mutations reached the per-client rail and three wrote a bespoke `audit_logs` row; everything else — publishes, documents, provider calls, role grants, deals, plans — left no trace, and the rail's `ref_id` was hardcoded null so even a mirrored event could not name the record it changed. One seam at the point every executed tool passes through, into `paige_audit_log` (which already carries `tenant_id`). The rail's membership is derived from the same target map, which added `update_client_data` — the most-used per-client write, and the client seat's only one. **A `client` seat could not record its own action at all** (the insert policy required `is_staff`), and a tenant-level admin could read every UNTENANTED audit row; both closed. | `paige-ai-chat`, migration `20261027000000` |
| M1 | **Paige opens knowing what she is carrying.** A transcript is what was SAID, not what is OWED, and it does not survive a new thread, a compaction, or a person returning a week later. Everything needed already existed in four places and nothing read them together. `paige_operating_memory()` composes open commitments (`plan_items`), live processes (`paige_automations`), work in flight including anything stopped at an approval (`paige_actions`), and what she last did with its real outcome (`paige_audit_log`) — **nothing is stored, so no copy can go stale.** SECURITY INVOKER so RLS stays the boundary; **no tenant parameter at all** — scope is `auth.uid()` + `current_user_tenant_id()`. A failed read renders NOTHING rather than implying nothing is outstanding. | migration `20261028000000`, `paige-ai-chat`, `_shared/client-context.ts` |
| M2a | **Three semantic reads had been raising on every call, and nobody could see it.** `match_paige_memory` (semantic client memory), `match_rag_documents` (document retrieval) and `match_prompt_memory` (the §26 prompt-forge loop) pin `search_path = public` — correct DEFINER practice — but the `vector` type and all sixteen of its operators live in `extensions`, so `<=>` could not resolve and each raised **42883** before returning a row. Driven on prod as a fully authorised caller, so it was never about permissions. **`match_rag_documents` was broken twice**: past the operator error it hit `42P01` from `array_agg(r.id)` over a subquery aliased `d` — one stray token in 3,033 characters, unreachable until now. Every call site degrades to an empty result, which is why "no matches" and "cannot execute" were indistinguishable for months. `lint:vector-path` now fails any similarity function that cannot resolve its own operator. | migration `20261029000000`, new `scripts/ci/vector-search-path-lint.mjs` |
| M2b | **`client_memory` had no tenant isolation at all** — no tenant column, no restrictive policy, and its widest policy keyed on `has_role(auth.uid(),'admin')`, which is tenant-agnostic (§59). Driven: tenant A's admin read **2 of tenant B's** client memories. Zero rows today, and chat writes into it every turn, so it fills the moment the product is used. Closed by DERIVING the tenant (`client_id → clients.tenant_id`, and for owner rows the subject's `tenant_members`) in a RESTRICTIVE policy — **no producer changes**, which matters because the §37 inventory is 9 edge functions, 6 frontend surfaces and MCP tools, several belonging to surfaces this project does not own. Also: `user_preference` is written at two sites and was rejected by the CHECK (23514, driven) — every preference Paige ever detected was thrown away. | migration `20261030000000` |
| D1 | **Paige files a note to the right client, on confirmation.** `crm_add_note` writes `client_notes` — the panel a team actually reads, keyed on the contact record — through the CALLER's client so RLS applies. The routing decision is a model's, so the destination is resolved against the caller's tenant before anything is written, and the insert policy now requires it too (a note could previously be filed onto ANOTHER tenant's client while stamping your own — driven, and not a read leak, which is why it would never have been noticed). Visibility is stated rather than offered: `client_notes` has no client-facing read policy at all, so staff-only is a fact, and the card says so. Lands on the client's rail and in the write trail. **The DOCUMENT half is NOT built and is blocked, not deferred:** `public.documents` has no `tenant_id` and owner-only policies, so a document filed to a client would be invisible to the team that filed it — a contract gap on a table this project does not own. | migrations `20261031000000`, `20261032000000` |
| S5 | The automatic URL fetch is tier-gated — a portal client pasting a link no longer causes server-side egress. (The raw provider-payload spread was already closed on `main` by the MCP registry work; nothing rebuilt.) | `paige-ai-chat` |
| S6 | Removed four claims with no capability behind them: three dead composer shortcuts, an unbound ⌘K, a panel saying voice input was off while the mic worked, and a session-summary hook that had been sending `Bearer undefined` since it was written. | `PaigeAIChat.tsx`, `TenantCommandCenterShell.tsx`, `SoloPaigeWorkspace.tsx`, `usePaigeMemory.ts` |

**§13 — WHAT IS NOT DONE, so nobody reads the above as more than it is.**
- **No authenticated live drive.** This session has no browser capability; every §70.1 gate item that
  requires a person completing the flow on the real platform is **owed to a capable session** (§32.c).
- **Migrations are rollback-proven, not persisted.** Each was driven on production Postgres inside
  `BEGIN..ROLLBACK` with negative controls. The §32.a persisted-apply confirmation is owed AFTER a
  merge the owner authorizes.
- **`runGeneralDocumentExtraction` is still undefined** — called, never defined, one of the 14
  baseline `deno check` errors. Non-credit documents therefore still produce no proposal.
- **`paige-mcp` does not consult `resolve_tool_autonomy`** — a second, still-ungoverned write path.
  Pre-existing, NOT introduced by this branch. It is scope-enforced (`workflows.run` etc.), not
  lane-enforced. Deliberately not fixed here: MCP callers have no confirm affordance, so gating it
  would make every MCP write un-executable — the exact failure R1 exists to undo.
- **Approval on five of the six chat surfaces is still MODEL-ASSERTED.** A new request proves a
  person sent another message, not that the message was a yes. Only a surface that renders the
  summary and echoes back its fingerprint proves a human approved THAT call, and one surface does
  (`PaigeAIChat`). Building the card on the other five is interface work owed to CD (§00).
- **Triggers do not EMIT yet** (slice D of the autonomy architecture). Four trigger rows are seeded —
  only the ones verified against production — not the eighty the design pack declares, because
  `is_live` is the field a builder trusts to decide what it may offer a tenant.
- **Design items are owed to CD**, listed in `docs/delivery/PAIGE-CHAT-DELIVERY-MAP.md` §4b.

**Live platform finding, surfaced by the S4 proof and worth an operator's attention on its own:**
`operator_rls_coverage` is **FAILING** on production, which is already capping the platform's trust
ceiling from 3 to 2 via the §68 decay law.

**Full map:** `docs/delivery/PAIGE-CHAT-DELIVERY-MAP.md` (estate grounding, ordered slices, collision
ownership, what is owed to CD).

### §65 operator route tree — AUTHORED from the Super Admin design pack (2026-08-18, PR #541)

- ✅ **`OPERATOR_BRANCHES` is authored** (`src/lib/routing/tierBranches.ts`) — **13 branches / 5 settings
  groups / 78 addressable tabs**, GENERATED by executing Claude Design's own `paige-routes.js` rather than
  transcribed. Replaces the §11e placeholder that said "authored when the pack lands."
- ✅ **Shape:** operator paths carry **no account segment** (`TierTree.accountSegment=false`, §65 matrix row
  1), and **settings has a third level** (`/operator/settings/team/roles`) via an optional `SubTab.subtabs`
  used ONLY by the operator settings branch. Five invariant tests guard the addressing contract.
- ✅ **The Settings back-menu is specified:** Setup · Integrations · **Platform Team (Seats · Roles)** ·
  Platform Vault · Governance — this is the roles/permissions home the owner asked for, now addressable.
- ❗ **§13 correction:** an earlier claim that `/operator` was a login-vs-console *collision* was WRONG —
  the pack has **zero** routes at bare `/operator` (verified by executing its registry). It is a prefix; the
  login keeps the root as an index leg.

### §65 R4 slice 1b — the operator console is MOUNTED (2026-08-18, PR #543)

- ✅ **All 78 addresses are live and navigable** at `/operator/{branch}/{subtab}` (and
  `/operator/settings/{group}/{tab}`), resolved from `OPERATOR_BRANCHES`. This closes the "authored ≠
  mounted" gap the 1a entry above recorded. Three new files: `src/operator/OperatorEntry.tsx` (3-leg
  dispatcher — index + login + guarded console, peer to `AgencyEntry`/`BusinessEntry`),
  `RequireOperator.tsx` (**ONE** guard above all 78 routes, not 78 copies), `OperatorApp.tsx` (the
  URL-driven left-rail shell). `App.tsx`'s `/operator` exact route became a `/operator/*` splat.
- ✅ **The guard reuses what already resolves** — `isPlatformStaff || isPlatformOwner` from
  `useTenantContext`; the staff flag is populated from `is_platform_admin()`, semantically identical to
  §53's `is_platform_operator()`. No new RPC, no second async hop, no fork of `AgencyLayout`'s waterfall
  (§18). `loading` is gated FIRST and unconditionally — the "Restricted area" latch bug already shipped
  once on `/admin/platform/*`, and at a subtree root its blast radius is all 78 routes at once.
- ✅ **§53 gating is on the ROUTE, not only the nav.** `revenue` + `comms` are owner-only (their shipped
  twins `MoneySpineAdmin` / `PlatformFleetCommunications` are both `<PlatformOwnerOnly>`) — a hidden tab
  whose route stays open is not a gate. **7 MIXED branches** (fleet · paige · growth · analytics ·
  provisioning · marketplace · settings/governance) carry owner-only tabs INSIDE an operator-level
  section; those inner gates land WITH their surfaces rather than being guessed against a placeholder.
- ✅ **NEW shared token `--rail` / `--rail-foreground`** (`index.css` + `tailwind.config.ts`). The rail is
  `--primary` in light, but on dark `--primary` lifts to a vivid 56%-L indigo — a violet slab where the
  design wants a quiet panel. Own token pair per theme; the dark value is lifted **well clear** of
  `--background` (~1.45:1 as a large adjacent surface + an explicit `--border-strong` edge) because the
  source design's own rail is the same colour as its dark page and **vanishes** — a real source defect we
  do not reproduce (§29 perceptibility). §11 "add it to the layer," never an inline hex.
- ✅ **Accessibility was AUTHORED, not ported.** The pack's entire chrome is `div + onClick` — zero
  `button`, zero link, zero `role`, zero `aria-current`, zero focus-visible. Shipped as real `<Link>`s
  with `aria-current`, real `<button>`s with `aria-expanded`/`aria-label`, and indigo focus rings
  throughout. Two source AA failures fixed rather than copied (rail eyebrows 4.11:1 · route path 2.84:1).
- ✅ **OWNER RULING 2026-08-18 — CLAUDE DESIGN IS THE SOURCE OF TRUTH.** *"If Claude Design made it,
  that's how it's supposed to be moving forward. Whatever we had before CD is no longer valid. None of
  it!"* An earlier pass on this slice substituted our pre-CD conventions for three of CD's calls and
  flagged them OWNER-OWED; the ruling **reverses all three** and they shipped in the same PR:
  CD's **gold** is back on the active sub-tab underline and the settings-active rail rows (CD's own two
  treatments, which the earlier pass had unified on white), and **CD's warm palette** replaces our cool
  indigo. Delivered as a **scoped `.operator-console` token block** in `index.css` — the pattern
  `.studio-surface` already establishes — so CD's design lands exactly where CD designed it and **no
  other surface, including owner-approved §28-frozen ones, is repainted as a side effect.** Zero hex at
  any call site; the CD-vs-platform decision is made in exactly ONE place (the `operator-console` class).
  **Verified in the BUILT bundle, not asserted:** `--background` → `rgb(252,250,248)` vs CD's `#FBF9F7`,
  `--rail` → `rgb(25,18,48)` vs `#191231`, `--cd-gold` → `rgb(200,158,45)` vs `#C8A02E` — within 1–2 per
  channel (HSL rounding, not a choice).
- ❗ **TWO CD values not copied verbatim — recorded, not quietly changed (§13/§29).** CD's rail eyebrow
  measures **4.11:1** and CD's dark block paints the page the SAME colour as the rail so the rail
  **vanishes**. Those read as artifacts of the pack rather than design intent (the §29 "shipped, correct,
  invisible" class); each keeps CD's hue and moves only far enough to be seen. CD's gold underline
  measures **2.35:1** — raised once, ruled on, ships as designed.
- ✅ **OWNER RULING 2026-08-18 — "I only want the backend to now connect to our new front end."** This
  re-points the remaining console slices: they wire REAL backends **into** these CD surfaces, rather than
  porting CD's look onto the old `/admin/platform/*` screens. `/admin/platform/*` stays redirect-alive
  (§58) but is no longer the build target.
- ❗ **§13 — mounted ≠ built.** The 78 surfaces are NOT implemented. Each renders an honest placeholder
  saying so and naming the live console; **nothing fabricates data** — a placeholder never poses as an
  empty dashboard reading "you have no tenants."
- ❗ **§58 — ADDITIVE, nothing retired.** The design is a LEFT-RAIL shell; the live God console
  (`AdminLayout`) is a TOP-BAR shell. `AdminLayout` is **untouched** and `/admin/platform/*` remains the
  operator's working surface while `/operator/*` fills in per-surface. Standing checklist item answered
  explicitly: **no previously-shipped, owner-approved capability is removed, hidden, or gated off.**
- ❗ **SEQUENCING RED-LINE (held).** `OperatorLogin`'s `GOD_CONSOLE` and `resolveLandingRoute`'s operator
  branch **still point at `/admin/platform`**. Flipping them before the console is verified would 404
  both doors — the #538 lockout class. Order is **mount → verify → flip**; the flip is its own slice.
- ✅ **Open-redirect-safe deep links.** `RequireOperator` sends a signed-out operator to the door carrying
  `?next=`; `OperatorLogin` honours it via new `src/lib/auth/operatorTarget.ts` — same-origin, inside
  `/operator/`, never protocol-relative, never backslash-smuggled, never the door itself. 8 unit tests,
  mostly proving what it REFUSES. The `GOD_CONSOLE` default is unchanged.
- **Gates:** tsc 0 · **325/325** tests (14 new: 6 routing, 8 redirect-allowlist) · `lint:views` +
  `lint:definer-fns` + `lint:tier-features` clean · eslint 0 · `vite build` ✓.
- ✅ **§39 PEER-GATE ran and returned ITERATE — every finding reproduced before fixing.** Two HIGH, both
  real: **(H1) an open redirect inside the origin.** The `?next=` allowlist tested
  `/^\/operator\/[^/\\]/`, which only inspects the character AFTER `/operator/` — and `.` passes. So
  `/operator/../../book/evil-slug` was accepted and react-router **normalizes** it to `/book/evil-slug`:
  a freshly-authenticated operator landed on a tenant-authored page, on the real domain, the instant
  after typing their password. Fixed by decomposing into segments and rejecting `.` / `..` / empty; 6
  regression tests, all for what it must REFUSE. **(H2) the `?next=` round-trip was broken for the very
  tier the guard admits.** `RequireOperator` admits `is_platform_admin()` (platform_admin OR super_admin)
  but the door gated honoring `next` on `is_platform_owner()` (**super_admin only**, deliberately
  frozen) — so a platform_admin bounced off a bookmark, signed in, had `next` silently discarded, and
  fell through `resolveLandingRoute` (which has **no** platform_admin branch) to a tenant surface. The
  door now uses the guard's predicate; **this also closes the door half of the long-standing #192.**
  Three MEDIUM also fixed: **12 of the 78 leaves had no link anywhere** (nothing rendered the settings
  GROUPS while a code comment asserted the back-menu existed — CD's back-menu is now actually built);
  `/operator//fleet` rendered **blank** (a doubled slash still matches the outer splat so App's NotFound
  never fires — catch-all added); and the anti-loop check was case-sensitive while react-router is not.
  Plus three cheap LOWs: the redirect-target invariant is now locked by tests, `/operator` was added to
  `CLIENT_FORBIDDEN_PREFIXES` (a §37 producer-inventory drift), and an unknown sub-tab now redirects to
  the canonical address instead of rendering a surface its own URL contradicts.
- ✅ **§32.c PARTIAL DRIVE RAN — 10/10, real Chromium, real bundle.** §32.c's deferral is keyed to
  LACKING browser capability, and this session had one (pre-provisioned Chromium + the repo's
  Playwright), so the unauthenticated half was DRIVEN rather than deferred. New reusable script
  `scripts/live-drive/operator-console-drive.mjs` (reuses the §18 helper's Chromium resolution)
  serves the real `dist/` build and asserts, in a browser: bare `/operator` renders the login door
  (**not blank** — the failure that would have shipped undetected, since nothing links to it) ·
  `/operator/login` renders · signed-out `/operator/fleet` settles at
  `/operator/login?next=%2Foperator%2Ffleet` · the 3-level `/operator/settings/team/roles` likewise ·
  **no redirect loop** (3 mainframe navigations in 8s, settled) · `--rail` computes to
  `rgb(21, 12, 49)` rather than transparent. **Zero page crashes.** Notably the guard decided
  correctly even with Supabase unreachable — it does not hang on `loading`. **Four further
  assertions measure the CD palette in BOTH themes** (added after the CD ruling, because the
  `.dark .operator-console` block had shipped unverified — the §29 "correct in source, possibly
  shadowed at runtime" class): the light↔dark flip is **21.6:1** on the console ground
  (`rgb(252,250,248)` ↔ `rgb(12,7,18)`, so §23's "genuinely light / genuinely dark" is measured,
  not assumed) · the `.dark` override provably REACHES the palette (a shadowed block would leave
  `dark.rail === light.rail`) · rail ink clears AA on the rail in both (**11.31:1** light,
  **9.52:1** dark) · the rail reads as a distinct PANEL (**17.23:1** light, **1.46:1** dark —
  modest by nature on a ~5%L ground and leaning on the `--border-strong` edge, but well above
  CD's own ~1.0 where rail and page are identical and the rail disappears; the threshold catches
  a regression back toward that, it does not claim the dark rail is dramatic). **Recorded, NOT
  asserted:** CD's gold measures **2.41:1** on the light ground (11.27:1 dark) — under the 3:1
  non-text bar, and owner-ruled to ship as designed, so the script prints it as a NOTE rather
  than failing the build over a decision already made.
- ❗ **§32.c AUTHENTICATED HALF STILL OWED** (needs operator credentials, which this session has none
  of; the Vercel preview is behind an SSO wall): the rail RENDER itself, the 78 placeholders behind
  the guard, and the §25 taste pass. **No claim is made that the rail renders** — only that the
  door, the guard, the addressing, and the palette (both themes) resolve for real. **Measuring a
  token is not the same as seeing a layout**, and that distinction is the whole point of what is
  still owed.


### §65 R4 slice 1c — the operator console RENDERS ITS SURFACES (2026-08-18, PRs #544, #545)

- ✅ **Every one of the 78 tabs now renders a Claude Design surface**, through ONE dispatch
  (`OperatorSurface` in `OperatorApp.tsx`) — bespoke surfaces first, then the generic panel, then the
  honest stand-in. Adding a surface is a line there, never a second switch (§18).
  - **Bespoke:** `FleetConsole` (#544) · `TrustCompass` (`trust-compass/autonomy`) ·
    `KnowledgeSurface` (`paige/knowledge`) · `WorkspaceSurface` (`paige/chat`).
  - **Generic:** `OperatorPanel` + `panelSpecs` — CD builds the majority of the console from ONE panel
    driven by per-tab copy. A test asserts the registry covers `OPERATOR_BRANCHES` **exactly** (0
    missing / 0 orphaned), so a branch added later fails in CI rather than showing a blank frame.
- ✅ **The landing flip is DONE** (#544): `OperatorLogin`'s `GOD_CONSOLE` and `resolveLandingRoute`'s
  operator branch both resolve to `/operator/fleet/tenants`. (Supersedes the "still `/admin/platform`"
  line in Section 5 — corrected below.)
- ✅ **The sign-in bounce is FIXED** (#545). Root cause was NOT routing: `RequireOperator` trusted
  `useTenantContext`, which re-resolves on `SIGNED_IN` through a background load that never re-raises
  `loading` — so `{loading:false, isPlatformStaff:false}` latched from a signed-OUT page load read as a
  real denial and bounced the operator to `/admin` on every login. The guard now asks
  `is_platform_admin()` itself: context flags can only ALLOW, only the server can DENY, and silence
  never infers denial. **A second, real defect in that fix was caught by CI's tsc ratchet** —
  `supabase.rpc()` RESOLVES with `{data, error}` rather than rejecting, so the `.catch()` was dead code
  and a server-side error would have arrived as `data: null` → an unintended DENY. The error field is
  now checked explicitly. (§39 layering, working exactly as written: the peer-gate is one layer, CI is
  another, neither waives the other.)
- ✅ **Fleet reports the REAL fleet** (#545, §57). Owner-stated rule (2026-08-18): *"the real customers
  are our currently registered tenants, encapsulated inside of the shells that they belong to — the
  agency accounts with all of their sub-accounts, and the solo accounts."* So the test is **BELONGING,
  not naming**: anything inside a customer shell is a tenant of the Super Admin and stays counted,
  whatever it is called. "TENANTS on the platform" was counting three rows that belong to no shell at all
  — the platform default-set fixture, the operator workspace, and a preview agency of ours. Migration
  `20260818210000` moves those three to `revenue_class='internal_test'` — the axis that already exists
  for exactly this — guarded so a row an operator has since classified deliberately is untouched. **Every
  sub-account of the customer agency is left counted, without exception**, including the two whose names
  begin "[TEST]": they live inside the shell, so whether they are worth keeping is the owner's call on a
  console that SHOWS them, not a call a migration makes by reading their names (§13). Result: the agency
  + its 6 sub-accounts + the 2 solo shells = 9 tenants, and nothing else. The console hides internal rows from the count
  and KPIs behind a **"Show internal (n)"** chip, so no shipped row is silently removed (§58). Rows are
  ordered by **topology**: each top-level tenant, then its own sub-accounts beneath it with a hairline
  elbow (§51). The "Agencies" filter now tests `account_type IN (agency, enterprise)` instead of matching
  the substring "agency" in the plan NAME — a plan name is a label, the tier is a column.
- ❗ **§13 — what these surfaces do NOT claim.** Trust Compass derives a department's lane from the lanes
  its own action kinds actually run under (`paige_action_kinds.default_autonomy_lane`, platform rows
  only), shows the TIGHTEST lane where they disagree, and is read-only (no `onCommit`) and says so — a
  dial can only understate autonomy, never overstate a gate that is not there. Knowledge reads the
  `knowledge_base` categories that actually hold rows (that table carries no `tenant_id` at all, which is
  why it is the right corpus for a platform surface, §9); the neural field is NOT ported and the panel
  says so rather than looping a decorative animation that would read as live retrieval traffic. Workspace
  ships with an EMPTY thread and a disabled composer that states why — CD's pack contains a fully-written
  conversation (a morning brief, named departments with millisecond timings, "41 chats · 4 projects") and
  porting any of it as a literal would put words in Paige's mouth on the one surface whose job is
  reporting what she actually did.
- ✅ **§39 peer-gate ran on the real pushed diff and earned its keep** — an independent adversarial read
  that verified its claims by EXECUTING postgrest-js (network error, 401 and 404 all resolve with
  `data: null`; none reject). Six defects, all fixed in-PR:
  - **The guard, three more false-deny paths.** A verdict issued under the PREVIOUS user's token could
    land after the current user's and admit the wrong person (postgrest-js has its own `Retry-After`
    path, so an in-flight check can outlive its session) → every read now carries a generation. Stale
    context flags could hold the previous operator's `true` indefinitely after a failed background
    revalidation and outrank a real server DENY → the server now wins. And `setVerdict(null)` fired on
    EVERY auth event, so an hourly token refresh dropped all 78 routes to a skeleton, unmounting children
    and destroying in-page state → a refresh on the same user is now a no-op.
  - **The fix's own failure mode.** Staying undecided forever on an error turned a mis-deny into a
    PERMANENT skeleton with no retry and no message — §32's "silently blank", indistinguishable from a
    crash. Now: two retries with backoff, then an explicit "couldn't verify your access" with a retry.
  - **The owner-only gate — the bounce class, one layer up.** `RequireOperator` admits on its single RPC,
    which reliably beats `useTenantContext`'s five-query load, so `isPlatformOwner` was still a NOT-YET
    when `OperatorApp` read it as a NO. An owner signing in with `?next=/operator/revenue/plans` was
    redirected to Fleet — and because that redirect is `replace`, the deep link was DESTROYED, not
    delayed. Both the redirect and the rail now wait for a real answer.
  - **Three honesty defects.** The chat header appended "· every tenant, every seam" to any scope, so a
    scoped `platform_admin` — redirected out of the owner-only sections entirely — was told they had
    every seam. Knowledge counted documents by scanning rows, which PostgREST caps: a capped scan
    under-reports SILENTLY, printing a confident platform figure while the corpus holds more (counts are
    now exact + server-side, and the per-domain note is gone rather than invented, because describing
    what a domain holds needs the very scan the cap makes unreliable). And every analytics tab laid its
    single block into a two-column grid, leaving a half-width card beside an empty column.
  - **Verified clean by the same read:** the compass non-null assertion (provably guarded by its own
    filter), the tightest/mixed lane reduction (order-independent; lane `0` is never tested for
    truthiness), `ago()`'s NaN and future-date paths, hooks order, §9 scope on all three reads
    (`knowledge_base` has no `tenant_id`; `paige_action_kinds` is additionally pinned to platform rows so
    an act-as'ing operator cannot pull a tenant's overrides into the platform compass), §58 (nothing
    removed), §50 (no hits), and all 78 specs rendering.
  - **§39 honesty:** this is one LAYER. CI's tsc ratchet caught the `.catch()` defect the peer-gate
    independently confirmed — neither waives the other, exactly as §39 states.
- ❗ **§32.c AUTHENTICATED DRIVE STILL OWED.** No operator credentials in these sessions and Chromium
  cannot reach prod from the CI sandbox. The bounce fix in particular is exactly the class only a real
  login proves. **No claim is made that any of this renders for a signed-in operator** — the claim is
  that it typechecks, unit-tests, builds, and is reasoned from the real records.


### §65 R4 Stage 2 — the Fleet Console sub-tabs, wired to real reads (2026-08-19/20)

Owner-corrected order: **Systems Check ✓ → Tenants → History → Alert rules → Team Pulse.** Stage 1
made all 78 tabs *render CD's structure*; Stage 2 replaces the placeholder values inside that
structure with real, tenant-scoped reads, one sub-tab at a time.

**Sub-tab 1 — Systems Check (PR #554, merged 2026-08-19).** The operator half of Pillar 1 given its
own console surface: the pack-faithful tab above the fold, a category drill-in drawer carrying
per-check evidence, "Run full sweep" across both the operator and fleet halves, skips reported as
their own axis rather than folded into pass (§13), and the result fed into Paige's own briefing via
`owner-context.ts` (§52). The god-locked `get_systems_check_status` MCP tool ships with it.
**§32.a proven on prod; §32.c live-drive CONFIRMED by the owner** — "All is well!" across all four
checks, with screenshots. This entry closes a §0 gap: the PR merged without its Section 4 line.

**Sub-tab 2 — Tenants (PR #555).** The orbital field **rebuilt in React Three Fiber**, plus the
directory, the attention cards and Paige's read.

- **The renderer changed on an explicit owner ruling; CD's feel did not.** Claude Design ships this
  field as `fleet-field.js`, a `<fleet-field>` custom element hand-projecting a fibonacci shell onto
  a **2D canvas**. With that implementation on the table and named, the owner ruled it be rebuilt on
  R3F following the landing page's proven `PaigeScene` — which is exactly the explicit,
  names-the-thing instruction `src/operator/CLAUDE.md` requires before deviating from the pack. CD's
  drift constants, drag sensitivities, tilt clamp, tier mapping and ringed-node rule are preserved
  verbatim, and the ruling is recorded in both file headers so a later session does not "restore
  fidelity" by reverting.
- **Three real defects fixed:** the 2D field could resolve to zero height in a short column and
  simply never appear; CD sizes nodes in absolute pixels unrelated to the card, so enlarging the card
  never enlarged the node; and a WebGL throw rendered `null` with no signal at all (§32 — the
  boundary now logs loudly AND shows a visible message).
- **The pack's own duplication resolved (§18).** CD paints Tenants twice — `isFleetConsole` (L348)
  and `P.console` (L6658) are both truthy for `tab==="console"` because the panel guard at L6544 does
  not exclude it. One surface ships, with `isFleetConsole`'s geometry and `P.console`'s better-written
  strings harvested into it.
- **Two improvements PROPOSED and flagged, not slipped in**, per the owner's amendment that "the
  source of truth is reaching the best that we can": placement seeds from a hash of `tenant_id`
  rather than the array index (CD's index seeding reshuffles the whole field on every filter
  keystroke), and shell distance encodes magnitude so weight reads as gravity.
- **§13:** "Needs you today" reads real operator findings through the same `systems_check_snapshot`
  RPC the rail badge already uses, and each card's prose is Paige's OWN stored `paige_interpretation`.
  "Her read" is **templated over real values, not LLM-composed** — there is no operator-scope
  narrative endpoint on the platform (all 248 edge functions enumerated; `owner-context.ts` is a
  prompt composer consumed inside `paige-ai-chat`'s streaming path, not a callable), so the CTA hands
  the question to Paige in the chat where she lives (§20/§21). MRR and PROVISIONING render `—`.
- **§39 peer gate: THREE independent reads across two rounds.** Round 1, on the build: two
  readers, both **BLOCK**, 29 findings. The one that mattered most:
  R3F attaches its DOM listeners to the **canvas**, a descendant of the drag wrapper, so
  `setPointerCapture` there retargeted every event for that pointer and R3F's `onClick` never fired —
  clicking a tenant node did nothing at all. Also caught: sRGB values handed to three.js as float
  arrays route through the LINEAR working space, so Paige Gold `#EDB94A` painted as `#F7DD93` (the
  smoke test now proves this in both directions); the rail computed its list over filtered rows while
  its counts came from the whole fleet; **§63** — real production tenant UUIDs, one of them the
  owner's own account, sat in the smoke fixture; and **§58** — the prior rail's at-risk-tenant doors
  would have been deleted silently, so the card now carries both feeds.
- **§66:** the surface ledger in `docs/doctrine/tier-matrix.md` was updated in the same commits, and
  four of its rows were **narrowed** after the peer gate caught them claiming more than the code does
  — a ledger row that overstates is worse than a missing one, because the next session reads it as
  verified fact.
- **Round 2 ran on the FIXES, and returned ITERATE — two blocking findings, both introduced by the
  author while closing round 1.** Recorded in full because a SHIPPED log that lists only what round 1
  caught would repeat, one paragraph later, the exact overstatement the row above was narrowed for.
  (a) The "fit the field to the smaller dimension" change was a **provable no-op**: R3F derives
  `viewport.width` as `height x (size.width/size.height)`, so `width/size.width` and
  `height/size.height` are identically equal — the `Math.min` over them could never carry aspect, and
  the measured delta across five canvas shapes was ~1e-19. Worse than the no-op, its comment claimed
  to have fixed clipping that could not occur that way, while the clipping that DOES occur (vertical,
  on a short field column, because the scale was a constant that ignored the box) went untouched and
  documented as solved. The fit now derives from the world EXTENTS, and the smoke asserts every node
  lands inside the frame across six canvas shapes — portrait, landscape, square and 4:1 both ways —
  so the claim is backed by an executable check rather than a comment. (b) The rail's `subCount`
  counted tenants that HAVE sub-accounts while its label reads "n sub-accounts beneath them", so one
  agency with six children rendered "1 sub-accounts beneath them." directly beneath a header KPI
  reading "6 sub-accounts beneath" — two numbers, one wording, one screen, no filter applied. It sums
  the children now. Also from that read: the all-clear sentence asserted "every tenant has at least
  one client" when `health()` grades a client-less tenant `warn` and therefore excludes it from the
  very filter the sentence was derived from; the drag listeners were attached by a passive effect, so
  a `pointerup` delivered before React flushed would have stranded the field mid-drag permanently;
  and the constant-drift guard added in round 1 both failed OPEN on a comment quoting an old value
  AND never ran, because `npm run test` is vitest and ignores a bare `.mjs` — it is a CI step now.
- **The layering is the lesson, not the count.** Round 1's readers were confident and thorough and
  still left work for round 2; round 2 found defects that CI, the tests, the smoke and the author's
  own review had all passed. §39 says the peer gate is one layer and none of them is sufficient
  alone — this slice is the worked example.
- ❗ **§32.c live-drive OWED.** Nothing here has been rendered. A green build and a headless smoke
  prove the maths does not throw and the colours do not mangle; neither says what appears on screen —
  which is the exact failure mode this rebuild exists to fix.

**Deliberately NOT folded in:** Paige at the orbit core (`paige-bot.glb`). A 6.5MB asset on the
`useGLTF` path is one of the three operations that has thrown at load in this codebase before, so it
gets its own slice with its own smoke test rather than a quiet addition (§32).


### Roles & permissions — R1 call-site inventory + R2a platform-seam fix (2026-08-18)

- ✅ **R1 — every role call site classified** (`docs/audits/R1-role-call-site-inventory.md`).
  Deterministic SQL over prod bucketed **all 186 RLS policies** (operator-intent 3 · tenant-filtered 3
  · **no-tenant-predicate 82** · **OR-composition 98**) and **all 118 role-referencing functions**
  (operator-intent 10 · **no-tenant-scope 31** · mixed 69 · other 8). Totals reconcile exactly.
  **117 of 118 functions are `SECURITY DEFINER`** — RLS bypassed, so the in-body check is the only
  guard (§59). **No behaviour change in R1 itself.**
- ✅ **The amplifier, measured:** `map_tenant_role_to_app_role()` maps tenant `owner` AND `admin` →
  global `admin`, and the ENABLED trigger `trg_sync_tenant_member_to_user_roles` writes it into the
  tenant-less `user_roles`. **9 `admin` holders across 10 of 13 tenants vs 1 `super_admin`** — so
  "global admin" is approximately "every tenant owner." Read every `has_role(uid,'admin')` guard
  that way.
- ✅ **R2a — `paige_workflow_registry` platform seam closed** (migration
  `20260919000000_workflow_registry_platform_seam.sql`). All 23 rows are `tenant_id IS NULL`, so
  `has_role('admin') AND (tenant_id IS NULL OR tenant_id = current_user_tenant_id())` collapsed to
  `has_role('admin')` on a PERMISSIVE **cmd=ALL** policy — any tenant owner could rewrite
  `requires_approval` / `direct_function_name`. Platform rows now require `is_platform_operator()`;
  tenant-owned rows keep tenant-admin access (§58: the access reduction is explicit, and the `admin`
  role stays meaningful). `platform_set_workflow_webhook_url` + `admin_get_workflow_webhook_url` →
  operator-gated, `anon`/`PUBLIC` EXECUTE revoked. **§37: both functions had ZERO producers.**
- ✅ **A broken function removed:** `admin_get_workflow_webhook_url(uuid)` selected a column
  `n8n_webhook_url` that does not exist (table has `n8n_webhook_url_ct`) — threw `42703` on every
  call, zero callers. Found *by the §32.a rollback proof refusing to recreate it*, and dropped.


**§13 discipline:** every ✅ here has file/migration/PR evidence in the audit at `outputs/systems-inventory-2026-08-09` (Cowork's inventory work of 2026-08-09). If you're about to say "we don't have X," check this section first. **CC's code check is authoritative** — if your grep disagrees with this section, log a §13 correction in Section 10 and update Section 4 in the same PR.

### Cowork research discipline (owner-locked 2026-08-09, HARD RULE — mechanical, not aspirational)

**Cowork's sandbox is a mount of the owner's local filesystem — often on a stale branch behind main.** Every claim Cowork makes about a file, table, function, or component MUST be grounded in a GitHub API result against `ref: main` (or a named branch), NOT in a sandbox grep. Historical §13 misses (`_shared/tts-router.ts`, `paige_owner_memory`, `ContactCommsPanel.tsx` path, `ClientsConversations.tsx` line count, `Admin.tsx:322` mount claim) all traced to sandbox grep on stale branches — every one was CC-caught when they ran the same check against fresh-cloned main.

**The mechanical rule (Cowork binds to this — CC and Codex apply the same principle to their own environments):**

- **Reads:** Cowork uses `mcp__github__search_code` + `mcp__github__get_file_contents` with `ref: "main"` (or a named branch). NEVER sandbox `Grep`/`Glob`/`Read` for asserting platform code state.
- **Writes:** Cowork uses `mcp__github__push_files` or `create_or_update_file` to push directly to GitHub — BUT the current MCP token is read-only (verified 2026-08-09 with a `create_or_update_file` returning `403 Resource not accessible by integration`). Cowork writes therefore MUST hand off to CC or Codex, who have real write access. Cowork producing a paste with the exact content + target file + insertion point is the correct handoff pattern.
- **Sandbox tools (`Read`/`Grep`/`Glob`/`Write`/`Edit`):** reserved for the outputs folder (Cowork's paste files for the owner). NEVER for asserting platform code state.
- **Every claim cites its source:** file path + branch/ref + line number (or migration version + PR #). Format examples: `docs/foo.md@main:L42` or `migration 20260810120000 (PR #406)` or `src/pages/foo.tsx@main SHA:abc123`. Missing citation = missing claim; retract or add the citation before shipping.
- **When CC's code check contradicts Cowork:** CC wins automatically. No arguing "but my grep said." Log the §13 correction in Section 10 with the CC-verified reality, mark Cowork's original claim as REVERSED.

**Why this exists (this doc's own §13 misses #8, #10, #11, #12):** Cowork keeps drifting to sandbox tools because they're faster (no API roundtrip, no rate limits). But when the sandbox is on a stale branch, "faster" produces WRONG answers that Cowork writes into this master doc as ground truth. Fresh-clone CC catches every miss. The fix is not aspiration — it's mechanical tool discipline codified here so every session sees it and Cowork cannot drift without producing a visible citation failure the owner can call out.

**Owner self-check (how to catch a Cowork drift instantly):** if Cowork asserts a file path, table name, or line number without a `ref: main` citation next to it, that's the failure signal. Ask "what SHA?" — if Cowork can't answer with a real commit hash, the claim is provisional and CC's next code check is authoritative.

### Communications — SHIPPED (CC-verified on main, 2026-08-09)

The rich two-way client inbox is fully shipped and mounted (this REPLACES an earlier Cowork entry with wrong paths — see §13 corrections #10/#11):
- **Rich inbox UI:** `src/pages/admin/ClientsConversations.tsx` — a full **1,927-line** three-column Conversations surface (the UI in the owner's screenshot), mounted at `/admin/clients-hub/conversations` via **`Admin.tsx:396-398`** (`<Route path="conversations">` → `ConversationsTabsLayout` → `ClientsConversations`). **No routing gap, no placeholder.**
- **Conversation components:** live under **`src/pages/admin/conversations/`** (`ComposeThreadDialog`, `ConversationsSubPages`, `ConversationsSettings`, `inbox-shared.ts`) — NOT `src/components/admin/contacts/`. `ContactCommsPanel.tsx` does not exist.
- **Notification-log surface (separate):** `src/pages/admin/CommunicationsAdmin.tsx` (272 lines) reads `communication_log`/`communication_preferences` — a DIFFERENT surface from the inbox; do not conflate.
- **Backend:** `public.messages` (jsonb substrate) + `public.threads` (aggregate) + `send-message` edge fn; `usePaigeThreads.ts` hook.
- **Operator (God) SMS:** `paige-operator-sms-send` edge fn (from PR #408) — see the Fleet Comms 500 gap in Section 5.
- Doctrine: §7 intelligent portal · §36 draft-first/one-click · §49 unified inline-single-conversation.
- **A2P registration — PREPARED is shipped; SUBMITTED is not (PR #665, 2026-08-30).** Preparing a
  carrier registration now DURABLY SAVES: `comms-a2p-draft` previously did two reads and no write, so
  the prepared draft died with the HTTP response. It persists through
  `tenant_a2p_registration_save_draft` (migration `20261004010000`) into the existing
  `tenant_a2p_registrations`. **Corrected 2026-08-30 (PR #672):** the first version of this
  entry read "no new table, column, or parallel store". That was true of #665 and is no
  longer true — #672 adds three nullable columns (`optin_message`, `optout_message`,
  `help_message`) because the draft generates seven reviewed fields and only four had a
  home, so three carrier-facing compliance replies were silently dropped. The save seam is
  now the 8-argument `tenant_a2p_registration_save_draft`; the 5-argument signature is
  DROPPED so no caller can reach the version that loses them. Absent preserves a field,
  an EMPTY STRING clears it — an owner must be able to delete a wrong STOP or HELP reply. `campaign_description` is the ONE exception and PRESERVES on empty; the flat rule was stated without it, which is exactly the sentence a later session would answer “how does the merge work?” from. **Carrier submission does not
  exist:** `comms-a2p-submit` performs no provider call and returns an explicit *prepared, not
  submitted* refusal, and no shipped path sets `submitted_at`. Do not read a `pending` row as a
  filing. Preparing requires `tenant_legal_profile.legal_business_name`, which **0 of 13 production
  tenants** currently have, so refusal is the first-use path for every tenant today.

- **The business phone line — SHIPPED and Paige-callable (PRs #692, #695, #699; live 2026-09-01).**
  A Solo tenant can search available numbers (area code, region, city, starts-with, toll-free),
  buy one into their **own** Twilio subaccount, name it, clear the name, and choose **which number
  the business calls and texts from** — the last of those being a control that did not previously
  exist anywhere. Seams: `comms-search-numbers` / `comms-purchase-number` (edge) and
  `tenant_phone_number_rename` / `tenant_phone_number_set_primary` (RPC, SECURITY DEFINER,
  caller scope re-enforced in-body per §59). Surface: Settings → Connections → Communications.
  - **Paige can drive the PHONE half.** Eight `comms_*` tools in `paige-ai-chat` cover the safe
    connection summary, listing, search, buy, rename, set-primary, registration status and
    registration draft. Four mutate and carry catalogue rows under a new **`Comms`** category, so
    each defaults to `confirm` and the operator can switch it off: `comms_buy_number`,
    `comms_set_primary_number`, `comms_name_number`, `comms_draft_registration`.
  - **What Paige CANNOT drive, stated so "Paige-callable comms" is not read as the whole surface:**
    the custom sending domains and the Google sending account. Both are operable by a person on
    that surface and neither has a Paige tool. That half is click-only.
  - **Money safety.** `comms_buy_number` requires the quoted `monthly_cents`, the confirmation
    sentence names the dollar figure, and `comms-purchase-number` re-checks it against
    `platform_number_pricing` **before** buying — refusing on mismatch (`price_changed`) or when it
    cannot be verified (`price_unverifiable`). Unverifiable is a refusal: absence of a price is not
    permission to spend. A malformed quote is refused **ahead of the autonomy gate**, so `auto`
    cannot route around it. Every exit that follows a real charge — there are **four** — writes an
    `audit_logs` row (`comms:number_purchased`), the charged-but-unrecorded ones carrying
    `recorded_on_tenant: false`.
  - **HONEST LIMITS.** Filing with a carrier still does not exist (see the A2P entry above).
    Releasing a number is deliberately not built — `status='released'` has no writer, and setting it
    without the provider call would mark a number released while the provider kept billing. The
    Trust Compass ceiling clamps these tools at RENDER only; `resolve_tool_autonomy`, which the
    runtime consults, does not read the compass, so the per-tool floor is the enforcement today.
    An operator acting as a tenant cannot reach the two new RPCs through Paige (the executor passes
    `_id` alone) — a refusal, not a leak.

### Agent Presence primitive family — SHIPPED (CC-verified on main SHA `580b13f4`, byte sizes byte-matched 2026-08-09)

The ⌘K launcher + right-side Paige presence rail chrome is a reusable primitive family, live on the Fleet Console (owner screenshot 2026-08-09). This entry closes a Cowork completeness gap — the Agent UI Placement spec defined this surface but Section 4 hadn't marked it shipped. (Verified by CC against `origin/main`: all 7 files exist and every byte size matches; folded as its own docs PR since the miss #21 PR (#417) had already merged.)

- **Primitive family** — `src/components/ui/paige/` (CC `git cat-file -s` sizes):
  - `AgentPresence.tsx` (3,631 B) — the presence primitive
  - `AgentPresenceContext.tsx` (7,715 B) — React context; resolves persona by `account_type` (super_admin → Paige Operator · agency → Paige Agency · tenant → Paige)
  - `AgentRail.tsx` (12,530 B) — the right-side presence rail (persona pill + empty state "Your Paige team is on call" + account-type-aware description + "Ask from anywhere ⌘K" trigger)
  - `CommandLauncher.tsx` (5,612 B) — the ⌘K modal (persona-aware placeholder)
  - `persona.ts` (3,535 B) — persona resolution logic
  - `index.ts` (1,630 B) — barrel export
  - `AgentPresence.test.tsx` (10,522 B) — test coverage
- **Doctrine hooks:** §7 intelligent portal · §14 Paige-runs-a-team ("your Paige team is on call") · §20 dispatch-in-chat (⌘K opens a Paige chat surface anywhere) · §36 intuitiveness moat (5-minute discoverability via ⌘K) · §11 primitive-layer discipline · §9 tenant/operator seam (persona swaps clean per `account_type`).
- **Intelligence layer NOT live (§13 baked into the copy):** the placeholder literally reads *"{persona}'s live conversation connects here soon — your message isn't sent yet."* The chrome is shipped; the send/receive/reasoning wiring is Wave 4 MVP-hub work — the correct shipped-chrome / not-yet-intelligence pattern (§32).
- **Spec:** `docs/product/agent-ui-placement-spec.md` (§5a persona surface + ⌘K launcher + right-rail placement).
- **Evidence:** owner screenshot 2026-08-09 of `paigeagent.ai/admin/platform/tenants` (rail + ⌘K modal); CC file/size verification against `origin/main`.

### Third-party integrations WIRED + CONFIGURED

- ✅ **Twilio — ISV/reseller architecture LIVE at Twilio's side; number search and purchase SHIPPED (2026-09-01).**
  - **Organization:** Paige Agent AI LLC (⚠ vendor/Twilio Org name — pending rename to Paige Agent AI Inc. per 2026-08-11 C-Corp conversion, owner-owed vendor update) · Org SID `<redacted — owner's Twilio console>` · verified domain paigeagent.ai · 1 managed user (Antonio Cook, info@paigeagent.ai) · 1 billing group
  - **Corporate identity (D7, SHIPPED 2026-08-11):** the legal entity is **Paige Agent AI Inc.** — a **standalone Delaware C-Corp** (direct conversion from Paige Agent AI LLC, Option A per owner ruling). No holdco, no parent. Present-tense entity name swept platform-wide (`_shared/platform-identity.ts` `legal_entity_name`, Terms/Privacy/Footer/Pricing public pages → "Paige Agent AI Inc.", Delaware corporation). Stale CoreConnect-subsidiary language + the Portfolio-mode-as-corporate-structure C-suite doctrine **DELETED** from `paige-c-suite-roster.md` (now two-scope: tenant + operator); `PORTFOLIO_SCOPE_BRIEFING.md` marked SUPERSEDED. New living doctrine: `docs/doctrine/paige-corporate-structure.md` (PROPOSED). "Portfolio" is now ONLY a future marketplace feature (task #129). **Owner-owed (task #128):** vendor renames (Twilio/Stripe/DocuSign/WHOIS) + binding-legal-doc migration + banking + the Aedis Brands LLC / Givalli Heritage Holdings Inc. brand-license decision (public Footer — preserved + flagged, not part of the CoreConnect ruling).
  - **Master account:** `<redacted — owner's Twilio console>` (owned by Antonio Cook, created 04/21/2026, Active)
  - **Subaccounts (5 active, provisioned manually via Twilio console, naming convention `Paige – <Tenant Name>`; SIDs in owner's console):**
    - Paige – Antonio Daniel LLC
    - Paige – Claude Studio Dev ⚠ tenant being deleted in #29 — subaccount will orphan at Twilio (owner cleanup at Twilio console)
    - Paige – First Sterling Capital
    - Paige – Mogul Maker Academy
    - Paige – Project Mogul Enterprise Inc
  - **Envs currently in code (NAMES only):** `TWILIO_ACCOUNT_SID` · `TWILIO_AUTH_TOKEN` · `TWILIO_PHONE_NUMBER` · `TWILIO_FROM` — MASTER account creds.
  - **Purchase capability EXISTS** — that's how subaccounts have numbers assigned today.
  - **Number search + purchase SHIPPED (PRs #692/#695/#699, live 2026-09-01).** This line previously
    read *"Only remaining gap: phone-number SEARCH tools inside the Communications console"* and was
    left standing when the capability shipped, so this document asserted both states at once — the
    exact contradiction a source of truth exists to prevent. Corrected here rather than deleted, so
    the drift is visible (§13).
    **What a shipped caller can actually search on today:** area code · region (state) · city
    (locality) · a DIGIT prefix (`starts_with`, converted to a Twilio `Contains` pattern with the
    area code folded in) · toll-free vs local. Results carry the live retail price from
    `platform_number_pricing`.
    **What the EDGE FUNCTION accepts but no shipped caller sends** — same status, so listed the same
    way: letter-based **vanity** matching (`starts_with` is stripped to digits, and neither the
    Connections UI nor `comms_search_numbers` exposes a raw `contains`) and **`sms_enabled`**
    capability filtering (headless-only; `NumbersTab.tsx` says so in a comment, `useSoloNumbers`
    does not send it, and the tool schema has no such property). An earlier draft of this bullet
    listed SMS filtering as shipped while calling vanity unreachable, on identical evidence — the
    test for "shipped" is whether a product caller can reach it, applied to every filter or to none.
    **Premium / registry search** is not built at all. Task #27's remaining scope is vanity and
    premium/registry; exposing `sms_enabled` through a caller is a separate, smaller question.
- ✅ **Stripe** — live-mode webhook + checkout + Marketplace + Connect wiring started. Functions: `stripe-webhook`, `create-checkout`, `create-trial-checkout`, `customer-portal`, `check-subscription`, `marketplace-checkout-session`, `tenant-checkout-session`, `tenant-stripe-connect`. B-iv storefront webhook merged (PR `9f9b6cf7`). B-ii-a marketplace paid install merged (PR `c95a7e16`). Data: `platform_subscriptions` table.
- ✅ **ElevenLabs** — TTS + ConvAI. **Voice = Ivanna.** ConvAI agent `agent_1601k7zn6bs7e72bt6485bp99v4a`, model `eleven_turbo_v2_5`. Code in BOTH `_shared/tts-router.ts` (in-app chat voice path — per CC code check) AND `_shared/elevenlabs.ts` (ElevenLabs client). See Section 10 for the precise voice-env attribution (`ELEVENLABS_VOICE_ID` drives Studio VO, not the in-app chat voice).
- ✅ **Supabase** — Postgres + RLS + edge functions + auth. Prod ref `xygzykjyynhzqytbqnzu`. 231+ edge functions. 688+ migrations. RLS helpers: `is_platform_owner()` (operator scope), `current_user_tenant_id()` (tenant scope).
- ✅ **Vercel** — deploy target. `vercel.json` at repo root.
- ✅ **LLM providers via `_shared/model-router.ts`** — text tier: Anthropic + Featherless. Capability tier: OpenAI + Gemini + Groq + Ideogram + Replicate + Meshy + ElevenLabs.
- ✅ **Voyage embeddings** — `_shared/voyage.ts`. Model `voyage-3` @ 1024 dims.
- ✅ **Meta** (FB + IG), **Google** (Calendar OAuth + Drive), **Zoom**, **QuickBooks**, **Plaid** (+ Paige-Plaid variants), **DocuSign**, **Cal.com**, **Resend**, **iSoftpull · SmartCredit · Nav · Apollo · Firecrawl · PostHog · Sentry · Zapier MCP · n8n · Telegram · VAPID web push · Browserbase · D&B · LexisNexis · OpenCorporates · FRED · TransUnion Business**
- ❌ **HubSpot · Vapi · Microsoft/Outlook OAuth** — NOT wired

### Platform capabilities SHIPPED

- ✅ **Slice 1c IA restructure — COMPLETE (2026-07-25)**, 8-item nav shipped.
- ✅ **8-item top nav:** Paige · Command Center · Marketplace · Clients · Team · Growth · Analytics · Setup
- ✅ **Marketplace** (Slice 1c-xii, task #440). PR #213.
- ✅ **Analytics primitive** (Slice 1c-x). Migration `20260722203249_analytics_rpc_operator_gate_1c_x_0.sql`. PR #202.
- ✅ **Signup completion gate** — migrations `20260714013653` + `20260714015706`.
- ✅ **Action bus** (§8) — `20260711024632_action_bus.sql` + drainer on */2 cron.
- ✅ **§16 10-department org model** — `paige_departments` via `20260713120000_org_blueprint_departments.sql`.
- ✅ **§34-L1 metering — Paige's spend is now BILLABLE usage, not just observable** (MET1, branch `codex/paige-knowledge-active-tenant-isolation-v2`, **NOT MERGED — draft PR, Gate 2 not requested**). `meter_llm_usage(p_limit)` drains `paige_llm_trace` into `platform_usage_events` as `llm_tokens` rows (service-role only, idempotent via a partial unique index on `metadata->>'trace_id'`). **The state it corrects, measured on prod 2026-09-01:** 663 traces, 15,578,931 tokens spent on tenants' behalf, and **zero LLM usage records had ever been written** — the cost half of §67 autonomy, unmetered. **The finding underneath it:** 197 of 228 meterable traces (86%, and 99.3% of tokens) carried NO cost, because the direct `_shared/claude.ts` path traced usage and never priced it while `model-router` did; the platform's `$1.38` estimate covered 0.7% of its tokens. Fixed at the writer (`_shared/token-pricing.ts`, the one home — `claude.ts` cannot import the router without a cycle, which is why THREE copies of the price table had accumulated), and priced per MODEL for anthropic so haiku is no longer valued at ~3× list. Historical rows are NOT back-priced (§13 — that would be invention); they meter tokens and carry an explicit null cost. **Recording usage is not charging for it:** no price book, no invoice, no `reconciled_invoice_id`, and no consumer surface yet. Evidence: `scripts/sql/meter-llm-usage-proof.sql` 12/12 on prod with two controls, mutation-tested; `test:token-pricing` 20/20 + `test:trace-wiring` 12/12, both in CI, 14 mutations all caught. **§32.a persisted-apply and §32.c live drive both OWED.**
- ✅ **§34 Intelligence spine** (partial): `paige_prompt_template` · `paige_prompt_memory` · `paige_llm_trace` · `paige_eval` · `paige_subagents_talent` · `paige_action_bus_drainer` · `paige_action_worker_cron` · `studio_visual_critique_log`. Prompt-forge at `_shared/prompt-forge.ts`; visual-critique gate at `_shared/visual-critique-gate.ts`.
- ✅ **`paige_owner_memory` table** — migration `20260810120000`, shipped in PR #406. L6/L8 memory table, distinct from `paige_prompt_memory`.
- ✅ **Voice = Ivanna** (ConvAI agent live post 2026-08-08 hotfix; in-app chat voice via `_shared/tts-router.ts` `DEFAULT_TTS_VOICE`)
- ✅ **§60 structural tier-lock** (#122 + #125, 2026-08-11) — `src/lib/tier/tierFeatures.ts` is the ONE HOME for tier→feature mapping (`hasFeature`/`useTierFeatures`), guarded by CI `lint:tier-features`. Owner-locked: **`customer_portal_invite` = Solo + Sub-account only** (server-enforced in `create_tenant_invite_token`, migration `20260823000000`); **Growth + Vibe Studio = Solo/Sub/Enterprise/God, NOT Agency** (route-gated via `RequireFeature`). Tier baselines in `docs/doctrine/tier-matrix.md`.
- ✅ **Money Spine Lane B-ii-a + B-iv** merged.
- ✅ **§27 facelift sweep** (PR `a2df4436`)
- ✅ **§37 amendment** (PR #232)
- ✅ **§38 money boundary doctrine** (PR #230)
- ✅ **Chat compaction substrate** (BRD §174-176) — in `paige-ai-chat/index.ts`.

### Merged 2026-08-09 (this batch)

- ✅ **#412 — Tenant revenue classification + $0-ARR honesty** (PR #412, merged 2026-08-09). `tenant_revenue_classification` (paid/promotional/internal_test, operator-only) + topology corrections + hard-delete-cascade of 2 retired tenants (Paige Operations + Claude Studio Dev) + Platform Defaults relocation + Part-5 tenant-switcher nesting + `operator_dashboard_metrics` reconciliation to real revenue + `paige-mcp` revenue-class splits. **§32.a persisted-apply GREEN on prod** — `schema_migrations` advanced, 11→9 tenants, 4 PME sub-accounts, 0 paid-class → Fleet Console reconciled to the honest **$0 ARR**.
- ✅ **#413 — Master project reference + §0 session-start rule** (PR #413, merged 2026-08-09). THIS doc, established as the single source of truth; `CLAUDE.md §0` (read the master doc at session start / major builds / "do we have X?" checks).
- ✅ **#410 — Second Brain** (`docs/brain/`, PR #410, merged 2026-08-09) + §BRAIN discipline (proposed). README index + `config-registry.md` + `decision-log.md` + `lessons-learned.md` + `glossary.md` + `codebase-map.md` — a verified, read-before-work knowledge base so sessions stop re-diagnosing documented systems.

### Merged 2026-08-10 (this batch)

- ✅ **#31 — Revenue Integrity Chain** (PR #415, merged 2026-08-09/10) + CSV always-export polish (PR #421). Fail-closed `enforce_revenue_integrity_chain` trigger + `operator_revenue_integrity_audit()` RPC + Fleet Console audit UI. **§32.a persisted-apply + live-prod block-test GREEN** — Wave 8 revenue launch-gate cleared. Current prod: promotional 8 / internal_test 1 / **paid 0** ($0 ARR, honest).
- ✅ **§52 — Paige operator runtime-context substrate (Phase 1, Super-Admin)** (PR #424, merged 2026-08-10). Fix for the 2026-08-09 §36 catastrophic miss (Super-Admin Paige asked the founder who he was). Migration `20260816120000` (relax `paige_owner_memory.tenant_id`→NULLABLE for the tenant-less God account + `is_platform_owner()` own_* policy branches + 7 PII-free operator seed rows) · `_shared/owner-context.ts` composer (service-role read by verified user_id, real platform-state queries with honest fallbacks, compiled doctrine/master constants, by-name greeting from runtime auth metadata not the repo) · `paige-ai-chat/index.ts` injection at `aiMessages[2]`, dual-gated on tenant-less persona AND `is_platform_operator()`. **§32.a persisted-apply GREEN on prod.** `CLAUDE.md §52`. **OWED: owner §32.c live-drive** (`/admin/playbook` → Paige greets by name, never asks identity). Phase 2 (agency/tenant/sub/client personas + cross-persona identity link) = separate slice.
- ✅ **§53 — operator role tiers + grant lockdown** (PR #424, merged 2026-08-10). Migration `20260816130000`: `is_platform_operator()` = super_admin OR platform_admin (NEW; `is_platform_owner()` FROZEN super_admin-only) + structural `user_roles` `trg_enforce_protected_role_grant` trigger locking super_admin/platform_admin grants to an existing super_admin or a trusted service context. **Closed a real §9 escalation** (`grant_tenant_member_role` let a tenant admin mint `platform_admin`). §32.b proven; §32.a GREEN on prod. `CLAUDE.md §53`. Fast-follows: #89 `/admin/team` tier-leak, #90 taxonomy-doc, deferred anon/authenticated DML REVOKE.
- ✅ **Systems Check MVP — Layer 1** (Owner Trilogy Pillar 1, task #80, PR #423, merged 2026-08-10). Migration `20260816000000`: 4 tables (`paige_systems_check_registry`/`_run`/`_finding`/`_baseline`, all FORCE RLS) + the 10 MVP-locked checks seeded (owner rulings: #3 capture-only, #4 external-detect-only, #10 Stripe-native read). **§32.b + §51 proven; §32.a GREEN on prod** (4 tables + 10-check seed persisted). Runner edge fns + orchestrator + surface = later layers.
- ✅ **Systems Check MVP — Layer 2 (the Runner)** (Owner Trilogy Pillar 1, task #80, PR #427, merged 2026-08-10). Runner core `_shared/systems-check-runner.ts` + 10 runner modules + 3 flavor edge fns (`systems-check-run-{onboarding,scheduled,change}`) + migration `20260816140000` (§38 processor-agnostic capture cols `tenants.payment_processor_declared`/`payment_methods_declared`; registry #10 flipped off the Stripe-native read; `systems.remediate` action-kind) + `20260816150000` (daily scheduled cron). **§32.a GREEN on prod** (both migrations persisted). **§32.c CONFIRMED headless-drive 2026-08-10** — Mogul Maker Academy (`d8a0a880…`) scan via the scheduled fn's internal single-tenant path (same core/runners/writes/filing): run row `check_count=10`, **1 pass / 5 fail / 1 skip / 3 error**, a `systems.remediate` action filed for every fail at `autonomy_lane='confirm'` routed to the owning §16 dept (finance/sales/marketing/tech), payment remediation copy §38-clean. **Two fast-follows the drive surfaced (§13):** (a) PR #429 — `service_role` had no grant on the 4 `paige_systems_check_*` tables + `tenant_workflows`/`tenant_mcp_connections`/`tenant_email_identities` (runtime `permission denied` the §32.b rollback proofs couldn't catch — they run as owner, not service_role; grants applied + proven, migration `20260816160000`); (b) task #95 — 3 runner column-name bugs (`tenant_email_identities.id`, `tenants.website` don't exist) still `error` fail-loud, runner-code fix pending. Runner is **fail-loud + honest** (real error class recorded, never a fabricated pass). Surface (L3) + operator-scope catalog = task #93.
- ✅ **Systems Check MVP — Layer 3 (tile + Command Center + Wave-S3 operator catalog)** (Owner Trilogy Pillar 1, task #93, PR #430, merged 2026-08-10). **Pillar #1 now fully live — schema + runner + surface, tenant AND operator.** Adds a "Command Center" tab to the Super Admin nav (`GOD_HUBS`/`GOD_STAFF_HUBS`, §35 universal-surface gap closed) pointing at the EXISTING `/admin` operator index — **§18: extends `OperatorCommandCenter`, does NOT fork a `PlatformCommandCenter`** (the operator CC already existed with a reserved findings slot). Shared `SystemsCheckTile` (`src/components/systems-check/`, composes the `ui/page` kit) dropped into BOTH the operator CC (`scope='operator'`) and the tenant CC/`PracticeOverview` (`scope='tenant'`) via the one `useSystemsCheck` seam; §36 one finding at a time, draft-first, gold only on Approve; §13 honesty (error≠skip, passes counted vs assessable, operator "Mark resolved"). Migration `20260816170000`: `registry.scope` col (default 'tenant'; core filters `.eq("scope",scope)` so tenant/operator catalogs never mix); `run`/`finding.tenant_id` NULLABLE for operator rows; RLS ADDS a `(tenant_id IS NULL AND is_platform_operator())` branch (§53, does not widen frozen `is_platform_owner()`); 10 Wave-S3 operator checks (8 edge-drivable + 2 honestly DEFERRED git-tag drift — an edge fn can't read git); 2 operator SECURITY DEFINER RPCs (`operator_db_health_snapshot`, `operator_rls_coverage_audit`, gated `is_platform_operator() OR service_role`, RAISE 42501). Operator flavor edge fn + hourly cron (`20260816180000`). **§32.a GREEN on prod** (both migrations, scope col, 10 operator rows, 2 RPCs persisted); **§32.b GREEN** (BEGIN..ROLLBACK — tenant sub-account sees 0 operator findings, denied null-tenant write, denied operator RPC). Tenant path byte-identical (§37). **§32.c live-drive owed** (owner drives the Command Center tab).
- ✅ **Systems Check tier-availability fix** (task #99, branch `claude/systems-check-tier-availability`, 2026-08-10). Owner reported the tenant Systems Check missing on fresh sub-accounts. Root cause (§30): the `SystemsCheckTile scope='tenant'` was gated inside the non-empty branch of `PracticeOverview.tsx`'s `{emptyBook ? … : …}`, so any 0-client tenant (solo OR sub-account) saw only the "blank canvas" and never the check. Fix hoists the tile ABOVE the empty/non-empty split (solo + all sub-accounts) AND adds it to `AgencyBoard` (`/agency`, agency's own-business check). Now uniform across **God (`OperatorCommandCenter`) · Agency (`AgencyBoard`) · Standalone/solo + Sub-account (`PracticeOverview`)** — the owner's "repeatable throughout the entire process." Crew: engineer + §39 adversarial (SHIP) + §5 compliance (ITERATE→AgencyBoard gap closed). ESLint 0 / tsc 18-18. Spun off new doctrine **§56** (pre-build tier-matrix gate). **§32.c live-drive owed** (owner confirms the tile on a fresh sub-account + `/agency`).
- 🟡 **Fleet Comms — shared shell + phone-in-thread WIRING shipped; parity NOT yet complete (real data population = Slice 4, task #97/#15)** (PRs #419 Slice 1 atoms · #428 Slice 2 tenant convergence · #431 Slice 3 operator shell + phone bundle, all merged 2026-08-10). SHIPPED: the tenant Client Hub inbox and the operator Fleet Communications inbox render through ONE shared three-column shell (`src/pages/admin/conversations/shell/*`) via a scope-adapter (§18) — the operator surface UI is no longer a bare 2-column surface; phone-in-thread (task #84) human-answered click-to-call + inbound routing + inline `CallBubble` on BOTH scopes (§49, ConvAI AI-answered deferred). **§32.a/b GREEN** (comms-parity + call-schema migrations `20260816190000`/`191000` persisted). **NOT DONE (§13, owner live-drove Super Admin 2026-08-10 → confirmed EMPTY):** the actual product capability — Super Admin auto-populated with REAL contacts + conversations synced from completed tenant onboardings, inline call records, immediate operator-side email/SMS against real data — is GAPPED. That is **Fleet Comms Slice 4 (task #97 / doc #15)**, sequenced BEHIND #9 (People/Pipeline foundation). **Do NOT re-mark "parity complete" here until Slice 4 ships.** §32.c live-drive still owed.
- ✅ **#10 Slice A — Paige chat document types (offer letter + sales offer)** (PR #435, merged 2026-08-10). Extends the existing `document_generate` chat tool (`paige-ai-chat`) — NO new Documents tab/surface (§18/§21): adds `offer_letter` + `sales_offer` to the `doc_type` enum + executor coercion + `StudioDocType` union, and widens `PLACEHOLDER_RE` (ROLE|SALARY|CANDIDATE|COMPENSATION|EQUITY|BENEFITS|POSITION|MANAGER|PROSPECT|EXPIR) so §15 placeholder-guard catches the new kinds. §2-clean (no finance defaults). **Edge deploy GREEN** (`deploy-edge-functions` success on the merge commit). **§32.c owed:** owner asks Paige in chat to draft an offer letter → confirms a real doc lands (no `[PLACEHOLDER]`). D3–D6 (presentations, agreement-edit, §38-gated payment links, preview card) remain sliced follow-ups.
- ✅ **HOTFIX A — callModel open-tier Claude rescue (§34 no-single-provider)** (PR #436, merged 2026-08-10). `_shared/model-router.ts`: the `callModel` route-table `open-flexible`/`open-fast` cells now DEGRADE to the Claude frontier cell on a genuine provider error (assign-not-throw, so the rescue still flows through the §3 voice + §2 finance gates), trace the original featherless error + `fallback_from`, and rethrow the ORIGINAL error only if the rescue itself fails. Closes the "88% open-tier error" P0 (open-flexible had NO fallback and threw). **Edge deploy GREEN** on the merge commit. Complementary to #438 (config side).
- ✅ **HOTFIX B — explicit service-role-only RLS for 2 no-policy tables** (PR #437, merged 2026-08-10, task #102). Migration `20260817000000`: RESTRICTIVE deny-all `service_role_only_deny_jwt` on `booking_notifications_sent` (send-dedup ledger) + `user_presence` (presence telemetry) — both already service-role-only (RLS-on + no-policy already denied JWT); the explicit RESTRICTIVE deny makes it auditable for the operator RLS-coverage check and can NEVER open access (§9/§51-safe; service_role + SECURITY DEFINER RPCs bypass, so edge fns/presence RPCs byte-unaffected, §37). **§32.a PERSISTED-APPLY PROVEN on prod** — `schema_migrations` advanced to `20260817000000` AND both policies confirmed live (`RESTRICTIVE`, roles `{anon,authenticated}`, `USING false`/`WITH CHECK false`).
- ✅ **#19/#103 — Featherless §34 cheap-tier economics restored (config close-loop)** (PR #438, merged 2026-08-10). Owner-side: Antonio subscribed Featherless **"Feather Per-Request" DEVELOPER** ($50/mo credit, per-request billing, NO model-size cap). Code: `_shared/model-router.ts` open-flexible default **8B → `meta-llama/Llama-3.3-70B-Instruct`** (owner's ranked #1; already allow-listed + already used for `internal_first_draft`; the plan lifts the prior 15B cap; stronger JSON/instruction-following lowers the malformed-output rate that triggers the pricier Claude rescue) + primary env override `FEATHERLESS_DEFAULT_MODEL` (§10 config-as-data; back-compat alias `FEATHERLESS_CHEAP_MODEL`) + stale plan-gate comment corrected. **§30 diagnosis (§13):** the 50 failing `text:open-flexible` traces showed `model=null` — a **trace fidelity artifact** of `emit(...,null,"error")`, NOT a null-slug bug; root cause was pre-plan reachability. §1/§34 crew SHIP no-blockers; §32.b env-precedence resolver + regression-lint GREEN; **edge deploy GREEN** on the merge commit. **§32.c owed:** owner drives a fresh operator Systems Check scan → `operator_llm_failover` returns to `pass` (closes both #438 and HOTFIX A/#436).
- ✅ **Twilio operator comms LIVE (2026-08-10, owner + Cowork live-drive).** Voice both directions live via TwiML App "Paige Operator Voice" (SID `AP54b3f1710789063da21e6454d803f45b`) → `voice-twiml` edge fn; `+14702003444` voice config repointed off the Twilio demo greeting. Two operator secrets set in Supabase Edge Function Secrets: `TWILIO_OPERATOR_TWIML_APP_SID` + `TWILIO_OPERATOR_CALLER_ID` (= `+14702003444`). SMS: Messaging Service "Low Volume Mixed A2P Messaging Service" (SID `MG3852795c9666bd857449d4bbb838e3c2` = `TWILIO_OPERATOR_MESSAGING_SERVICE_SID`) inbound wired to `paige-operator-sms-inbound` (`verify_jwt=false`, confirmed ACTIVE); the dead number-level webhook config was blanked; SMS goes live the moment A2P registration approves (~2 days, pending). (§34: recorded here are secret NAMES + the public phone/SID identifiers the owner published in this handoff — no auth tokens or API secrets.)
- ✅ **Fast-follows landed 2026-08-10** (post-Pillar-1): **#95** — Systems Check L2 runner phantom-column fixes (`comms_configured`/`company_info_populated`/`website_connected` now read `tenant_email_identities.tenant_id` + `brand.website`/`brand.business_phone`, §32.b-proven); **#89** — `/admin/team` operator-roster leak closed (`useTeamRoster` scopes an operator-unscoped admin-list-users response down to the active tenant's members).

### Merged 2026-08-11 (this batch) — §9 anon/cross-tenant-reach class closed at BOTH Postgres object types

- ✅ **#55 — Command Center cross-tenant approvals leak** (PR #446, merged 2026-08-11). The first case of the class: `paige_approval_queue_v` had drifted to `security_invoker=off`, so a tenant's Command Center approvals view bypassed RLS and could surface another tenant's rows. Fixed the view; §10 correction #1 reverses Cowork's original "permissive-OR bypass" root-cause naming — the real cause was the `security_invoker=off` VIEW drift.
- ✅ **#116 — 11-view platform-wide `security_invoker` cross-tenant leak + CI drift guard** (PR #447, merged 2026-08-11). Generalized #55: audited every VIEW and closed 11 platform-wide `security_invoker=off` cross-tenant leaks (anon/cross-tenant reachable — the higher-blast-radius class, PII/FICO-reachable). Added the `lint:views` CI drift guard so a view can never silently re-drift off `security_invoker`. Companion to #117 (below) — same underlying mechanism, VIEW object type.
- ✅ **#117 (PR #448) — SECURITY DEFINER function §9 audit** (merged 2026-08-11). Closed **20 confirmed cross-tenant leaks** across authenticated `SECURITY DEFINER` functions — the global-role-bypass + param-IDOR reader patterns, plus **1 HIGH auth bypass** in `delete_credit_report_upload` (it role-checked a caller-SUPPLIED `_calling_user_id` param instead of `auth.uid()`). 2 migrations (`20260821000000` read-hardening, `20260821010000` writer-hardening) + `scripts/ci/definer-fn-lint.mjs` (`lint:definer-fns`) anti-recurrence guard, sibling of `lint:views`. **§32.a/b + §37 producer inventory + §39 peer-gate SHIP.** Companion to #116 (the VIEW class) — same owner-scoped-execution-bypasses-RLS mechanism, different object type. **Honest severity (§13):** #117's 20 leaks are authenticated-only (lower blast radius than #116's anon-reachable PII/FICO), 1 HIGH. **§32.c owed to owner.** New doctrine section drafted (SECURITY DEFINER functions enforce caller scope in-body — PROPOSED in `CLAUDE.md`, companion to #116's view rule). Full anon/cross-tenant-reach class now closed at BOTH object types AND the CI-guard layer (`lint:views` + `lint:definer-fns`).
- ✅ **Doctrine ratification (PR #450, merged 2026-08-11)** — §57 (Super Admin = source of truth) · §58 (Anti-regression) · §59 (SECURITY DEFINER caller-scope-in-body) flipped PROPOSED → **OWNER-LOCKED 2026-08-11**. §58's §39-verifier checklist item ("did this PR silently remove a shipped capability?") is now binding on every PR.
- ✅ **D10 — tier-taxonomy audit + "Portfolio" removal** (PR #451, merged 2026-08-11). Owner live-drive found the Agency `/agency` dashboard rendering a "Portfolio · Your book ranked by traction" section — "Portfolio" is reserved for **Enterprise** tier only (§57) and duplicated "Your sub-accounts" on the same page (§18). Fix: deleted the standalone Portfolio `SectionCard` and **folded all 7 of its capabilities** (health filter chips, health meter, ranking, MRR/Health/Clients columns, Open action) **into the "Your sub-accounts" roster** — §58 nothing lost; metrics overlay the roster by `tenant_id`, absent → "—" not 0 (§13). New shared **`src/lib/agency/tierLabels.ts` `getTierBookNoun()`** helper enforces §57 top-down (Solo/sub_account→"People", agency→"Sub-accounts", enterprise→"Portfolio" RESERVED, operator→"Fleet"); the merged heading + revenue tile derive from it. Codex review caught 2 real correctness fixes (book-noun from agency context when scoped into a child; `portfolioLoading` in the table loading state) — both applied pre-merge. Locked tier taxonomy: **People / Sub-accounts / Portfolio / Fleet.** §30 scout + §39/§5 SHIP + §25 design critic SHIP. **§32.c live-drive owed to owner.** Fast-follows (task #119): uncapped metric overlay for >20-child agencies (`agency_portfolio_metrics` caps at 20 — pre-existing), and `getTierBookNoun` adoption on the aligned Fleet/People sites.
- ✅ **#121 — same-tier feature parity: §16 department block** (PR #453, merged 2026-08-11). Owner live-drive: MMA renders the §16 "What your Paige team is doing" 10-department block on Command Center; sibling PME sub-accounts do not. **§30 audit DISPROVED the stale-classification hypothesis (§13/§30):** the block is NOT gated by tenant_id/`account_type`/`features`/historical tier — all four PME tenants are confirmed `sub_account`. The real discriminator is `emptyBook` (book data-state): the block was nested *inside* the non-empty branch of `PracticeOverview.tsx`'s empty-state conditional, so MMA (2 clients) rendered it while 0-client siblings got the blank-canvas EmptyState. Same class as task #99 (Systems Check tile). **Fix:** hoisted `PaigeDepartmentStatus` *above* the `emptyBook` split (mirroring `SystemsCheckTile`) → renders on every same-tier tenant regardless of book state. The platform-wide sweep found **ZERO** other feature-gate leaks; Marketplace/playbook/`finance_in_scope` are legitimate per-tenant opt-in (§2), not leaks. §32.c live-drive owed. (Owner then ruled the `getTierFeatureSet()` structural-enforcement helper MANDATORY — its own PR; see §10 #7.)
- ✅ **#122 — Systems Check load perf** (PR #454, merged 2026-08-11). §30: NOT a DB problem (slowest query 0.24ms, tables fully indexed) — latency was 2-3 serialized PostgREST round-trips per tile mount re-paid on every navigation (`staleTime:0`). Fix: new **`systems_check_snapshot(p_scope)` SECURITY DEFINER RPC** (migration `20260822000000`) collapses the round-trips into one; §59-clean (tenant from `current_user_tenant_id()` in-body, operator gated on `is_platform_operator()`, invalid scope raises, authenticated-only); `useSystemsCheck.ts` calls it + adds `staleTime:60_000`. NO index changes, NO check-run semantics change. §32.a parse-proof + §32.b row-match (MMA 10=10, no fan-out) + §39 peer-gate SHIP. §32.c live-drive owed.
- ✅ **Skills Wave S1 FOUNDATION** (PR #466, merged 2026-08-11) — the provable slices of S1, split from the deferred interpreter per CC's §5 call. **S1a schema:** `ALTER paige_skills` ADD `methodology_anchor` (GOAT anchor, §35), `tier_availability` jsonb (§61 default doc), `scoping` text CHECK('platform','tenant'), `autonomy_lane` text CHECK('auto','confirm','off') — the switch(slug) runner does NOT read these yet, so §58 byte-identical is protected by construction. 4 shipped skills backfilled (anchor per skill, scoping=platform, autonomy_lane per risk: read_only→auto, draft/send→confirm; tier_availability=§61 default). §32.a rollback-proven (cols=4·anchors=4·scoping=4·lane_auto=2·lane_confirm=2·tier_resell=4); §32.a persisted-apply via deploy-migrations. **Fork-1 finding (§10):** `autonomy_lane` is NOT a shared pg enum — it's duplicated text+CHECK on the action-bus spine; S1a copies the pattern (no type to reuse). **§60/§61 self-use Feature:** added `skills` to tierFeatures.ts SOLO/SUB/GOD sets (enterprise via Solo-union), NOT agency — the §61 self-use gate; agency's "resell" is a Marketplace concept, not a Set bit (Fork-3 ruling). Test locks the cell (19/19). **S1c docs:** `docs/doctrine/skills-vocabulary.md` (the 4 "skill" concepts: paige_skills recipe / marketplace add-on / paige_subagents specialist / methodology anchor) + inline disambiguation comments at skill-runner/skill-forge/subagent-forge/marketplace-skills.ts + brain README line. **DEFERRED to a fresh session (turnkey plan in `scratchpad/skills-wave-s1-substrate.md` + task #126):** S1b steps-interpreter (owner ruled FULL interpreter — the highest-§58-risk slice, needs a live-function byte-identical proof, held per §5 rather than rushed at a saturated session-end) + S1d format-picker. Ordering ruling owed at next S1 open: interpreter-first (owner-owed §32.c proof) vs Paige self-verify browser-agent first (automates the proof).
- ✅ **Skills Wave S1b INTERPRETER + S1d format-picker** (PR #467, 2026-08-11) — **INFRASTRUCTURE for the S2 GOAT professional-skills content wave, NOT "the intelligence" itself** (owner clarification, §10 2026-08-11): the interpreter is the plumbing that lets N professional skills scale WITHOUT N bespoke handlers; the intelligence comes from the S2 GOAT-anchored content seed that follows. `paige_skills` recipes now RUN generically, not just the 4 bespoke slugs. **`_shared/skill-interpreter-core.ts`** (pure, vitest-tested — 21 tests) + **`_shared/skill-interpreter.ts`** (Deno orchestrator) wired into `skill-runner`'s dispatch as an ADDITIVE default-case path. Reads the skill ROW → forges the generative core through the EXISTING `forge()` seam (§26 — methodology_anchor leads, cheesy-tells/brand bind, `is_platform_default` from `scoping`), applies the §16 autonomy clamp (`auto`→execute / `confirm`→files a `paige_pending_approvals` draft / `off`→brief) **with a structural RISK FLOOR** (external_send/mutating can NEVER auto-execute), the §60/§61 tier belt (`tier_availability`; `resell`=marketplace-only, denied self-run), and §9/§59 server-resolved tenant (contact wins, mismatch rejected as IDOR). **§16 GUARANTEE:** the interpreter has NO external-send call site — a send only ever happens later from the approved-send seam. **§58 by construction:** the 4 shipped slugs stay byte-identical on their bespoke handlers (interpreter only runs non-bespoke slugs; `force_interpreter` is diff-tooling only, NOT in the `paige-mcp` schema). **S1d format-picker:** a document skill asks Word/Google Doc/PDF/Markdown before generating (`needs_input`). **§58 automation:** `scripts/skills-s58-harness.mjs` + `tests/fixtures/skills-s58-baseline/` capture baselines (`--capture`) + prove bespoke-vs-interpreter parity (`--diff`). Verified headless (CC lacks the paige-mcp connection): tsc 0 · vitest 241/241 · lint:tier-features clean · §16 no-send + §9 tenant-scope structurally confirmed. **§32.c live-drive (fire a forged skill via `run_skill`) + Slice 1/3 MCP baseline+diff = owed to Cowork** (the capable MCP session). **Design-review crew (§1) caught 5 MUST-FIX pre-merge** (see §10). **Follow-up:** approve→execute consumer (an approved skill_draft has no wired executor yet — the draft IS the deliverable for MVP); regenerate `src/integrations/supabase/types.ts` (stale, missing S1a cols — non-blocking, Deno/any runner).
- ✅ **Gap 3 (Tashia live-drive) — approval-Send "no email on file" + headless-approval guard** (PR #464 frontend + PR #465 backend, merged 2026-08-11). Owner live-drive: Send on a queued approval linked to a contact WITH a valid email rendered "Contact has no email on file". §30: `ApprovalDetail.sendDraft` read ONLY `contact?.email`, populated only when `approval.contact_id` is non-null — an approval filed UNLINKED (contact_id NULL, the downstream effect of the #462 contact-search false-miss) always tripped the guard. **#464:** `sendDraft` now mirrors the backend `execute-approval` resolution (snapshot `draft_content.to` → live contact → re-resolve `clients.email` by id), passes `contact_id ?? null` (send-message pins a null-contact send to the caller's tenant, §9). **#465 fast-follow (owner "make sure it never happens again"):** live-prod audit found 4 approvals, 2 orphans, BOTH with no `contact_id` AND no `draft_content.to` AND no recoverable recipient signal → **0 backfillable** (§13, no guessing); the deliverable is the guard — migration `20260825000000` adds a `NOT VALID` CHECK (`category NOT IN ('email','sms') OR contact_id IS NOT NULL OR draft_content->>'to' IS NOT NULL`) grandfathering the 2 legacy rows + enforcing on all new send approvals, plus an app-level clean-error guard in `paige-ai-chat` (no raw constraint error). §32.a rollback-proven (headless blocked · recipient'd allowed · workflow untouched · legacy grandfathered); §37: paige-ai-chat email/sms sends guarded, paige-mcp workflow_run approvals unaffected (category NULL). §32.a persisted-apply via deploy-migrations. §32.c live-drive owed.
- ✅ **#127 — Paige contact-lookup false-negative + lookup-honesty** (PR #462, merged 2026-08-11). Owner live-drive: Paige told the operator "no contact named Tashia Anderson on file" when the contact existed. **§30 diagnosis found TWO independent defects wearing one face (§13):** (1) the CRM search matched the WHOLE query phrase against EACH single column (`or(first_name.ilike.%Tashia Anderson%, …)`), so a real row with `first_name="Tashia"` + `last_name="Anderson"` (SEPARATE columns) matched 0 rows — every multi-word/full-name lookup false-missed; (2) an UNRELATED nested tool (content-draft/generate-image) 500'd and its error was narrated as if the *lookup* failed — the owner conflated the two symptoms. **Fix (§18 one home):** new `supabase/functions/_shared/contact-search.ts` tokenizes the query — each token ORs across `[first_name,last_name,email,entity_name,phone]`, tokens AND-combine via chained PostgREST `.or()` (`and(or(tok0…),or(tok1…))`); single-token queries are byte-identical to the old one-group behavior (no regression). Wired into all 3 lookup tools: `paige-ai-chat crm_search_contacts` (all-mode), `paige-mcp search_contacts` (all-mode), `paige-mcp search_clients_fuzzy` (any-mode + `city`, preserves the isGod §9 scope branch). Plus a **LOOKUP HONESTY** prompt block: found / found-nothing / could-not-check are three distinct outcomes, NEVER collapsed into "no record." CI regression guard `src/__tests__/contact-search.test.ts` (11 tests, imports the pure helper). **§32.b PROVEN on prod** (old filter 0 hits, new all-mode 1 hit, any-mode 1 hit, single-token 1 hit for the real Tashia Anderson row). tsc 0 · vitest green. §32.c owner live-drive owed (Tashia resolves on MMA + other sub-accounts).

### Backend seams

- ✅ 231+ edge functions across auth/comms/paige-core/marketplace/growth/tenant-admin/integration/credit-funding/cron
- ✅ 688+ migrations
- ✅ 30 MCP tools (paige-mcp Phase 2)
- ✅ RLS enforced on 179+ migration files.

### Env vars / secrets (NAMES ONLY — values in Supabase secrets + Vercel)

Grouped:
- **Required (fail-closed):** `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `ANTHROPIC_API_KEY` · `VOYAGE_API_KEY`
- **Third-party** (Twilio · Stripe · ElevenLabs · OpenAI · Gemini · Groq · Featherless · Replicate · Ideogram · Meshy · Meta · Google · Zoom · QuickBooks · Plaid · DocuSign · Cal.com · Resend · PostHog · Sentry · Apollo · Firecrawl · FRED · D&B · Nav · LexisNexis · OpenCorporates · Array · TransUnion Business · SmartCredit · iSoftpull · Browserbase · Telegram · LangGraph · Lovable · Zapier · GitHub)
- **Paige-internal / MCP / bridge** (`PAIGE_MCP_PLATFORM_KEY` · `PAIGE_BRIDGE_API_KEY` · `PAIGE_OS_*`)
- **Studio / eval / feature-gates** (`STUDIO_VISUAL_CRITIQUE_ENABLED` · `STUDIO_CRITIQUE_COST_CAP_USD` · `STUDIO_CRITIQUE_MAX_ITERATIONS`)
- **Email identities + other** (`PLATFORM_DEFAULT_EMAIL_FROM` · `BILLING_EMAIL_FROM` · `CALENDAR_ENCRYPTION_KEY` · `SSN_ENCRYPTION_KEY` · `VAPID_*`)

### Key data model landmarks

- ✅ **`tenants`** — with `account_type` (topology: standalone/sub_account/agency/enterprise, §51-locked) · `status` (lifecycle enum) · `parent_tenant_id` · `features` (jsonb) · `brand` (jsonb) · `onboarding_state` (jsonb) · `stripe_customer_id` · `stripe_subscription_id`
- ✅ **`platform_subscriptions`** — tenant-scoped billing; test-seed caveat from migration `20260805202912`
- ✅ **`paige_action_kinds`** (§8 action bus)
- ✅ **`paige_llm_trace`** (L1)
- ✅ **`paige_owner_memory`** (L6/L8 memory — migration `20260810120000`, PR #406)
- ✅ **`paige_prompt_memory`** (§26 forge memory — migration `20260718205814`) — distinct from `paige_owner_memory`
- ✅ **`paige_departments`** (§16)
- ✅ **`paige_audit_log`** (§17)
- ✅ **`paige_subagents_talent`** (§14) + `paige_subagent_proposals` + `paige_subagent_invocations` + `paige_subagent_factory_quota`
- ✅ **`paige_prompt_template`** (§26)
- ✅ **`studio_visual_critique_log`** (§33)
- ✅ **`marketplace_installs`** (with payment_refs)
- ✅ **`tenant_workflows_registry`**, **`tenant_email_identity_registry`**, **`tenant_n8n_connections`**, **`tenant_service_agreement`**
- ✅ **`tenant_revenue_classification`** (operator-only revenue axis — #29, PR #412) — paid/promotional/internal_test, RLS `is_platform_owner()`-only + FORCE

---

## 5. Current focus + known gaps

### Billing Foundation C — the Solo Billing screen (PR #833, **RELEASED — merged `11997dac` 2026-09-03; no production write of any kind**)

**What it is.** Foundation A shipped three seams and no renderer; nothing in `src/` imported the two
hooks and no surface called `get_workspace_billing_authority()`. Foundation C mounts them at
`Solo Settings › Billing`.

**The correction.** The pre-C tab read `get_tenant_platform_subscription()`, joined it to the plan
CATALOGUE and rendered `Solo · Active · $149.00/month · Renews 5 Aug 2027` for every workspace.
Queried on prod 2026-09-03 (ref `xygzykjyynhzqytbqnzu`): all four live `platform_subscriptions` rows
carry a NULL `stripe_customer_id` **and** a NULL `stripe_subscription_id`; three are `test_seed:
true`, the fourth `revenue_class: promotional` / `provider_state: not_created`. **The catalogue is a
price list, not a charge, and a seeded period end is not a renewal.** The catalogue is no longer an
input to the screen, and a test walks every state reachable **without an entitlement projection**
(which is every state reachable today) and fails on any `$` in the output.

**The state machine** is `src/solo/billing-contract.ts`, over the Gate-1 approved vocabulary
(packet §9.1) with three additions and four disclosed deviations. Promotional / trial / paid need an
entitlement record that proves them; "Choose a plan" needs a successful read that returned
`source: none`; every unavailable carries one of five distinct causes. **The entitlement projection
is Foundation B** (packet §4.3 R11), so today every top-level Solo workspace resolves to
`billing-unavailable · no_billing_account` — never a promotional grant (R13).

**What an owner can now finish (§70.1):** designate the workspace's primary billing contact, add and
remove a billing delegate, reload and find it held. R27 is stated on the surface (a designation is
not ownership); so is the fact that no notice is sent, because no sender exists.

**Reviewed independently three times (§39/§5), and it mattered.** Eight findings, five of them
defects live on a pushed head: a failed roster read rendered as "this workspace has nobody
eligible"; a write outcome survived a workspace switch; an unrecognised mapping state fell
**through** the guards into "this workspace has a billing account" plus an enabled Manage-billing
button; the same mapping fix was left half-applied on the portal card's copy; and the shared harness
store had no migration. Two doctrine findings: the shipped **"Usage & limits"** card had been
deleted with no call-out (**§58 — restored**), and **R22 was half-held** — `can_view_billing` was
consumed nowhere, harmless then and a leak the moment Foundation B supplies a price, so the plan
card now refuses a non-viewing Solo member.

**Evidence:** 71 new tests; full suite 179 files / 2334 tests; `ci:tsc` ratchet unchanged at 13;
build green; **116/116 rendered checks** across 4 viewports × 2 palettes plus the failed-read and
read-only worlds. **Release status: `PARTIAL` / `Authenticated Runtime Proof Owed`.**

**OWED (post-release audit backlog, `docs/delivery/billing-foundation-c-design.md` §9):** the
authenticated owner drive on the deployed surface (§32.c); a **Gate-1 pass on the billing-contacts
card**, which the approved prototype does not cover (§00 — CC does not fill a gap in the pack); a
§57 divergence, since Settings › Connections still renders "Solo plan · LIVE" from the catalogue
join this slice disqualifies; the now-dead `useSoloComms().billing` fetch; `plan-beta` collapsed
into `plan-current`; and `past_due` having no approved wording.

**Untouched:** the portal flag (off), every Stripe object, `platform_subscriptions`, the catalogue,
Foundation B, and every shared module outside `src/solo/`.

**Boundary correction, owner 2026-09-03 (post-release).** The "What you charge your clients" pointer
card has **moved off Billing to Campaigns → Sales**. The owner's rule: *"Billing is for us, our
platform billing the tenant"* — client billing is the other direction of money and belongs on the
tenant's own commercial surface (§38 / §197 LAYER 2). *Invoices & payment method* was deliberately
**not** moved: those are the tenant's invoices FROM Paige, which is platform billing by that same
definition. Billing now renders four cards.

### PAIGE Mind — the integration matrix (Wave 0 grounding, 2026-09-03; documentation only, NOTHING shipped)

**What it settles.** `docs/architecture/paige-mind-integration-matrix.md` records, per Solo surface,
whether that surface can safely give PAIGE real tenant-scoped evidence — and what is in the way where
it cannot. Read-only architectural truth; it changes no runtime surface, shared module, Rail, Spine or
Mind implementation.

**The headline, and it is not encouraging.** **No surface has authenticated, tenant-safe Mind evidence
flowing today — including Pipeline.** The matrix carries two deliberately separate axes so that a
`PARTIAL` readiness label can never be mistaken for a working capability: one for what the contract
could carry, one for what a real owner can actually get, which is currently nothing anywhere.

**Why.** Verified on prod: `paige_client_events` grants `authenticated` and `anon` **nothing**, so the
Rail is readable only through a `SECURITY DEFINER` lens, and it holds **9 rows** platform-wide (live
count 2026-09-03T09:35Z). On top of that, four structural constraints — the Rail is per-client, the
resolver accepts only a client subject, the safe summary is a constant with enumerated facts, and
evidence loads only inside a client-scoped Chat turn — leave the registry at **exactly one capability**
and put most departments behind Change Requests that have not been raised.

**§13 — two tracker/record divergences this entry does NOT resolve, because only the owner can.**
(1) **#746 is CLOSED on GitHub** (2026-09-02T18:21:05Z, merged PRs #785 and #801), while §10 of this
document at the *"Owner-ruled priority order"* block states "**#746 is still OPEN**" pending
authenticated owner runtime proof. The functional position is agreed — a safe server resolver is
deployed and no owner-facing consumer uses it — only the issue state differs.
(2) The same ruling lists **item 5 as "Calendar as the next bounded read-only Spine capability"**, while
the Mind Wave 0 direction confirmed Calendar **BLOCKED** and prohibited Calendar work this wave.

**Recommended next Mind step is not a build:** the authenticated two-Solo-tenant drive of the one
capability that already exists. **Its prerequisite is not #746** — the lens is `SECURITY DEFINER` and
reads the Rail directly, so the browser grant never applied to it. The prerequisite is that a
`campaigns_pipeline` Rail row must exist at all: production holds **zero**, so the drive would today
prove only the empty-result path. If a build is wanted behind it, raise **SCR-2** (non-client subject
types) naming Analytics as its reference consumer — recording honestly that Analytics needs **SCR-3 as
well**, since its counts are unbounded and the contract admits only enumerated values. **Clients is
explicitly not recommended** despite being the only other client-subject surface: the owner's own UI
write emits no Rail event, so a capability built today would let PAIGE state a history that omits
everything the owner did by hand.

**Raised, not implemented, and routed away from Mind:** #786 and #787 (Rail producers) · #788
(Connections/security, tracked privately).

### Billing Foundation A — workspace billing identity + designated billing contacts (PR #816, **MERGED `f455d8a5` 2026-09-03 under owner Gate B; migration `20261045000000` APPLIED on prod, edge functions deployed**)

**Live state, verified on prod 2026-09-03 (not inferred from a green pipeline):** `20261045000000` is in
`supabase_migrations.schema_migrations`; the 3 tables, 12 functions, 6 policies and the guard triggers exist
when queried directly; `platform_billing_accounts`, `_contacts` and `_notification_log` each hold **0 rows**
(reconcile found 0 candidates, exactly as predicted — the 4 live `platform_subscriptions` rows carry NULL
customer ids); no proof fixture persisted. Edge: `platform-billing-portal` v2 ACTIVE, `customer-portal` v44,
`stripe-webhook` v50, all deployed by `deploy-edge-functions.yml` on the merge commit.
**`PLATFORM_BILLING_PORTAL_ENABLED` was NOT flipped** — the portal refuses every call `not_enabled`.
**Nothing is owner-visible: no screen mounts the hooks, and no surface calls the authority read** — that is
Foundation C, which is not built. **No email was sent; no sender exists.**

**What it is.** The first Platform Billing slice after the Gate 1 packet (#803): one server-authoritative
workspace→Stripe-customer mapping (`platform_billing_accounts`), the strict money-path resolver
`billing_active_tenant_id()`, the one authority read `get_workspace_billing_authority()` (Owner-only
`can_manage_billing` / `can_view_billing`; `billing_account_state` absent / ambiguous / mapped /
not_applicable; `billing_contact_state`; `paid_activation_ready`), the reconcile seam, a default-off hosted
portal function, the legacy `customer-portal` refusal for platform customers, mapping upserts at both
webhook write sites — **plus the owner's 2026-09-02 billing-notification ruling designed in:**
`platform_billing_contacts` (**primary billing contact** = a verified, current, active workspace Owner;
**billing delegate** = a verified, current, active Admin chosen by an Owner — functional designations
that never create, change, transfer, imply or record legal ownership, equity, corporate/trust or
co-owner status (owner correction R27, 2026-09-02); Owner-only designate/revoke RPCs, audited), `platform_billing_paid_activation_ready(tenant)` for the later
activation release (**no caller yet: today's `platform-subscription-checkout` still activates a paid plan without
a designated primary billing contact — wiring the gate is the activation release's scope**), and the
`platform_billing_notification_log` ledger with the explicit event catalogue.
**Delivery is NOT wired; no email is sent by anything in this slice.**

**Evidence classes (kept separate).** Automated: vitest 1913/1913 (25 new), Deno 31/31. Static: tsc ratchet
13/13, eslint, `lint:definer-fns`, `lint:views`, `lint:managed-schema`, `lint:tier-features`, migration lint
(1 answered warning), `deno lint`; `deno check` only via CI's Deno ratchet (local esm.sh 404). Runtime,
rollback-proven on prod on the final migration text: 64/64 properties (C1–C2, P3–P64) + 5/5 mutants caught,
nothing persisted (re-probed). Independent review of the head: two FIX-THEN-SHIP reports, all findings integrated.
**No email was sent; no sender exists.** **UNVERIFIED:** authenticated owner drive of the deployed portal
(flag stays off); local `deno check` on supabase-js-importing functions (esm.sh 404 through the proxy).

**What Gate B for this slice asks for, and nothing more:** merge + migration apply + edge deploy with
`PLATFORM_BILLING_PORTAL_ENABLED` unset. No Stripe object, no price, no charge, no entitlement record, no
recipient email. Prod backfill inserts **zero** rows (0 reconcile candidates; the 4 `platform_subscriptions`
rows carry NULL customer ids). Next: Foundation B (webhook classification + subscription truth, A3/A4),
Foundation C (truthful Solo Billing screen; mounts both hooks), then the Promotional Beta Access rollout
packet with its own Gate B. Design: `docs/delivery/billing-foundation-a-design.md` (v3.1). Spine reads a safe
subset only: `docs/handoff/platform-billing-spine-source-contract.md` (PROPOSED/UNMERGED; refreshed on merge).
### PAIGE Mind — first Pipeline evidence slice (SUPERSEDED 2026-09-02 — merged, deployed and applied; see §4)

> **Corrected in place, not deleted (§58).** This entry was written while the work was an
> unmerged branch. It merged as PR #747 (`dcddf6761e`), production-deployed, and migration
> `20261041000000` is persisted on prod. The live record is §4 → *PAIGE Mind — a recorded
> Pipeline outcome, read and cited*. What remains genuinely unverified is listed there and
> corrected in the final bullet below.

- **Mind binding moves `UNAVAILABLE` → `PARTIAL`** for `pipeline.deal_stage_evidence`. PAIGE can state what a
  recorded Pipeline stage outcome proves for the active tenant and a selected client, cite its safe reference,
  and say plainly when she does not know. Read-only throughout.
- `_shared/paige-spine/mindEvidence.ts` is the Pipeline domain's Mind projection — citation, freshness word,
  read-only boundary — over the merged safe adapter `public.get_pipeline_spine_evidence`. It is deliberately NOT
  a platform-wide Mind primitive; generalising it needs its own Spine Change Request. `chatEvidence.ts` renders
  that projection, so Chat and Mind cannot describe one record differently. `paige-ai-chat/index.ts` was NOT edited.
- **Owner-approved Spine Change Request (2026-09-02):** the opaque `rail:<uuid>` reference may cross into model
  context as the citation. It is the one identifier permitted to, it names a record rather than a person or a
  deal, and it is asserted to appear only inside the citation. Title, summary, payload, stage name, deal id,
  contact/client/user/tenant ids, provider bodies, secrets and reasoning traces all stay forbidden.
- **Two reachability findings, both from current main:** `paige:open` had three dispatchers and NO listener, so
  every "Ask PAIGE" on Pipeline dispatched into nothing; and a Pipeline deal carried `clientName` but no
  identifier, so a deal card had no client scope to hand over. Migration `20261041000000` adds `client_id` to the
  innermost deal projection, read off the already-filtered clients join so it is null exactly where the name is.
- **Pipeline mutation through the Spine stays `UNAVAILABLE`.** No Chat tool, no approval channel, no write path;
  approval authority remains `none`.
- Truth status: 1859/1859 vitest, tsc ratchet unchanged at 13, production build green, 11 CI guards green, and a
  local-Postgres runtime proof that is **mutation-tested** (flipping the identifier's source makes it fail with a
  named LEAK). **UNVERIFIED, and still owed:** authenticated runtime, rendered proof, Supabase pgTAP/full-history
  replay. **CORRECTED 2026-09-02:** the migration **is** applied to prod — the §32.a persisted-apply confirmation
  was taken after merge and is recorded in §4. Detail: `docs/delivery/paige-spine-mind-handoff.md`.

### NEXT REQUIRED LANE — Pipeline Chat Write Bridge (owner direction 2026-09-02; NOT STARTED, NOT IN THE MIND BRANCH)

PAIGE Chat is intended to become Pipeline **write-capable**. The read-only Mind evidence slice above is the first
foundation, not the endpoint. The initial write slice focuses on real deal work: create or link a deal to an
existing client, update permitted deal details, and move a deal through existing tenant-owned stages. Every write
must use the canonical Chat risk/approval gate (`_shared/action-risk.ts` + the confirmation gate — never a second
channel, `docs/doctrine/one-approval-gate.md`), server-resolved tenant and client scope, idempotency, a durable
outcome, an owner-visible result, failure/retry handling, and no cross-tenant leakage.

**It requires its own Gate 1, its own collision check, and a coordinated Chat-owner workstream, after the active
PR #729 hotfix is clear.** It was deliberately NOT implemented in the Mind branch, and that branch must not be
expanded into it.


### PLATFORM-LEVEL — PAIGE Spine / Rail current state + the owner's priority order (2026-09-02)

Full record: **`docs/brain/paige-spine-and-rail-state.md`**. Recorded here because these are
platform-wide facts, not one department's, and because two of them are routinely misread.

**The Spine is `PARTIAL`. One registered capability, 105 inline Chat tools.** Measured by the repo's
own guards on 2026-09-02: `paige-spine-registry-lint` → `PASS (1 capability)`;
`chat-tool-registry-lint` → `105 tool(s) inline`. That one capability is
`pipeline.deal_stage_evidence` — read-only, `chatBinding: PARTIAL`, `mindBinding: PARTIAL`
(raised from `UNAVAILABLE` by PR #747, merged 2026-09-02; still `PARTIAL`, not `LIVE`).
**Do not read the Spine's existence as departments being connected to PAIGE.** They are not; she
reaches them through the 105 hand-wired tools. Team and Setup each record the same of themselves in
their surface cards.

**Owner-visible Solo Rail activity is `UNAVAILABLE`.** Status, verbatim:
*production Rail history cannot be read, and the current owner-facing consumer treatment is not
reliable enough to distinguish denied history from empty history.* **Not healthy, not empty, not
honest, not repaired, not production-executable.** `paige_client_events` has **no SELECT grant for
`authenticated`** on production (revoked by `20260712200000`, never re-granted; read-only catalog
query 2026-09-02), so the read fails before RLS. Per issue **#746** — re-verified here — the two
shipped Context Rail consumers (`PaigeRailFeed.tsx:108`, `ClientActivityFeed.tsx:144`) destructure
only `{ events, connected }`, and `historyError`/`historyLoaded` have no reader in `src/`, so **a
refused read renders as "nothing yet"** and an operator can be told PAIGE has done nothing. (The Solo
Trust Compass consumer, `compass.tsx:377`, does distinguish — which is why the platform statement is
*not reliable enough* rather than *never*.) **Leg 7 of the build path — *owner can see the result* —
is therefore broken for every department that emits to the Rail**, and `paige_audit_log` has no Solo
reader either.

**A safe server-side Rail reader is now SHIPPED and deployed — and the verdict above still stands
(2026-09-02).** `public.get_solo_rail_activity(p_limit integer)` is live on production
(`20261042000000`, then the #794 remediation `20261043000000`; both confirmed in
`schema_migrations`). It is `SECURITY DEFINER`, takes **no tenant parameter**, returns 11 reviewed
display fields, and **raises `42501 RAIL_FORBIDDEN` rather than returning an empty timeline** on
refusal — so a denied caller can no longer be mistaken for an idle workspace. The projection omits
`payload`, `tenant_id`, `contact_id`, `actor_user_id`, `ref_table` and `ref_id`; it **does** return
the event row's own `id`, so the accurate claim is that it exposes **no tenant, client, actor or
source-record identifier and no producer payload** — not that it carries no identifier at all. It deliberately does **not** re-grant browser SELECT on
`paige_client_events`: that revoke is what keeps the same-shaped flaw in the `pce_staff_read` policy
unreachable, so the fix for a Rail screen is never a table grant.

**Every Rail READER is now authority-correct and refuses explicitly (verified on the deployed bodies,
2026-09-03).** Two migrations landed after the paragraph above was written and are recorded here
because they were not — see the §13 note that follows:

| Migration | PR | What it changed |
|---|---|---|
| `20261044000000` | #813 (closes #804) | `get_client_rail` reads the caller's role from an active `tenant_members` row **of the same workspace the rows come from**, so a staff role earned in another tenant no longer satisfies it; adds the minimal `get_client_rail_for_chat` projection |
| `20261049000000` | #834 | `get_platform_rail` raises `42501 RAIL_FORBIDDEN` instead of `RETURN;`, so a denied platform caller is no longer indistinguishable from an empty platform |

Both confirmed present in `schema_migrations` on prod. The resulting state: **no Rail reader carries
the tenant-agnostic `has_any_role()`, and no Rail reader answers a denial with an empty set.** The
Rail **writer** `record_rail_event` still gates on `has_any_role()` — tracked as **#824**, parked; it
is an integrity/attribution exposure inside a single workspace, not a disclosure or cross-tenant one,
and its escalation population measures zero.

**§13 — this entry is a late correction, and the lateness is the point.** §0 and §66 require the
master record to move in the SAME PR as the ship. Neither #813 nor #834 did that, so between
2026-09-02 and 2026-09-03 this file described a Rail reader surface two migrations behind production
while reading as current. Recorded rather than quietly backfilled, because a record that silently
catches up teaches nothing about why it fell behind.

**Still NOT repaired by any of the above, and the reason the verdict at the top of this section
stands: no OWNER-FACING consumer calls any of these resolvers.** `useRailEvents.ts` and
`useSoloActivityFeed.ts` still read `paige_client_events` directly, and the browser still holds no
SELECT on it, so the owner-visible history surfaces are exactly as broken as before.

**Be precise about "nothing uses it", because that is not true of the whole Rail.** `get_client_rail_for_chat`
**does** have a live production consumer: the PAIGE Chat edge function calls it at
`supabase/functions/paige-ai-chat/index.ts:4662` (hydration) and `:8384` (tool dispatch), wired by
#813. So the accurate split is: the **Chat** consumer was repointed onto a safe resolver and works;
the **owner-facing history** consumers were not, and are Slice B — blocked on the #776/#729 ownership
seam. `get_solo_rail_activity` and `get_platform_rail` are the two resolvers with genuinely zero
callers today.

**Why `UNAVAILABLE` is still the correct status.** No owner-facing consumer calls the resolver yet —
`useRailEvents.ts` and `useSoloActivityFeed.ts` still read the denied table directly, re-measured on
production after both migrations. The remaining *misreporting* is narrower than the read failure: the
two `useRailEvents` consumers collapse a refusal into an empty feed, while `compass.tsx:377` and
`team.tsx:235` both render an explicit `role="alert"` failure. **All four are denied; only two of them
lie about it.** Failure *visibility* and *manual recovery* are separate questions: `team.tsx` offers a
*Try again* control in every layout, `compass.tsx` only above 1020px — `solo-tokens.css:173` hides its
retry-bearing branch below that and the foldout replacement (`compass.tsx:440`) has none. **Automatic
recovery is present regardless:** `useSoloActivityFeed.ts:193–198` re-reads every 15s while visible and
on window focus, so the missing piece is the *visible manual control*, not recovery. Tracked as a Slice B
scope item on #746, not as a second misreporting surface. The two Analytics readers of the same denied
table (`useClientEngagement.ts:48`, `CohortRetentionTable.tsx:74`) discard the error entirely and render
it as "Insufficient data" — a separate slice, tracked as **#802**. The gap changed shape rather than closing: **before, no safe path
existed; now a safe path exists and nothing uses it.** Issue **#746 stays open**, and closing it also
requires authenticated owner runtime proof, not a deployed function. Full record, including the #794
cross-workspace defect this foundation shipped with and the three lessons from it:
`docs/brain/paige-spine-and-rail-state.md`.

**Pipeline governance — three findings, follow-up work and NOT capability:** the Spine's Pipeline
evidence is a **silent subset** (`deal_move_stage` and `pipeline_attach` move deals with no Rail
event, so PAIGE cannot see her own move); `deal_move_stage` never consults `move_policy`; and
`pipeline_move_approvals` is **write-only** — nothing anywhere sets `approved|rejected|cancelled`, so
a held request is unresolvable and permanently blocks archiving its stage or pipeline.

**Owner-ruled priority order (2026-09-02).** Later items do not start ahead of earlier ones:

1. **PR #729** — the cross-account Rail/Compass hotfix on #728. **BLOCKED from Gate 2 by issue #746.**
2. **Rail recovery + owner-visible outcome reading — issue #746 (RELEASE-BLOCKING).** This is the required *separate* Rail Recovery prerequisite for #729's first owner flow to become production-executable; it is **not** assigned to #729. PR #644 may hold the right direction but is **NOT authorized as a release path**: it must be freshly grounded on current `main`, checked against the canonical Spine contract, reviewed for internal-identifier exposure, and proven mergeable first — and #746 notes its resolver returns no `title`/`summary`, which the rail renders, so it is not a drop-in.
3. **Pipeline governance repair — issue #755 — a parked prerequisite before any Pipeline Chat write bridge.**
4. **Stale doctrine correction** (done for the Trust Compass claims; see §10).
5. **Calendar as the next bounded read-only Spine capability.**

> **CORRECTED 2026-09-02 — items 1 and 2 have moved; the ruling above is kept as written.** The Rail
> recovery path in item 2 was taken by **PR #785** (`20261042000000`) and its **#794 remediation, PR
> #795** (`20261043000000`), both merged and deployed — **not** by #644, which remains open and
> unauthorized on the same terms stated above. **#746 is still OPEN**: the merged work is the safe
> server resolver only, and no owner-facing consumer has been moved onto it, so item 1 (**#729**)
> remains blocked — its repair reads the direct table, which is still refused by design. What changed
> is that the unblock is now a consumer change rather than a missing capability. Closing #746 also
> requires authenticated owner runtime proof. Order 3–5 is unaffected.

**Not authorized by this record:** no Calendar evidence, Pipeline mutation, provider work, or other
implementation begins from it.

### Platform Billing — Gate 1 packet delivered and APPROVED 2026-09-02 (Phase 1, read-only; NOTHING BUILT)

- **Boundary (owner-ruled 2026-09-02):** Platform Billing = what the Solo WORKSPACE pays PAIGE (base subscription · included allowances · verified usage/telephony charges only if later approved · paid Marketplace add-ons · invoices, payment methods, status, account credits, entitlement), home Settings → Billing plus operator configuration; the billing account belongs to the workspace, never a staff member. Client Billing = what a Solo charges its own customers (invoices, quotes, payments, balances; Offer Catalog as source; tenant's own processor, §38), home Sales — **never modelled, migrated, or implied inside Settings → Billing.**
- **Delivered (docs only, zero code, zero migrations, zero Stripe objects):** `docs/delivery/platform-billing-gate1-packet.md` (with a §2.7 per-tier availability table, §51/§56) · `docs/doctrine/surface-cards/billing.md` (truth label `PARTIAL`) · `docs/prototypes/platform-billing-gate1.html` (34 states, throwaway) · `docs/handoff/platform-billing-marketplace-addon-handoff.md`.
- **What exists today (verified on `main` `1fb7928`):** Settings → Billing reads plan/status/price/renewal via `get_tenant_platform_subscription()`; Invoices & payment method and Usage & limits are honest `UNAVAILABLE` cards; no action exists on the surface. Plans: `solo` $149/mo, `agency` $397/mo, `enterprise` custom (migration-seeded; monthly Stripe Price only). Sole writer of `platform_subscriptions` is the Stripe webhook. `platform_invoices` has no writer. Metering: `llm_tokens` + `tts_char` in `platform_usage_events`; no allowance/threshold model; no tenant-facing usage read. Marketplace: one-time paid checkout exists; recurring add-ons do not; Solo entitlement actions deliberately `UNAVAILABLE`. Operator Revenue surfaces are spec shells with null figures. **0 paying tenants.**
- **Beta direction ($149 reference → $74.50 beta, defined included allowance, no automatic overage until real usage/cost evidence) is modelled as a PROTOTYPE STATE only.** The eight decisions D1–D8 are ruled or deferred per packet §4.2 (D3, D5–D8 ruled; D1, D2, D4 deferred to the Beta activation packet). As originally put — D1 eligibility · D2 start/end/grandfather · D3 separate Stripe Price vs promotion vs other · D4 after-beta state · D5 exact allowance (units must be a measured meter — tokens today) · D6 warnings/limits · D7 usable/limited/paused after exhaustion · D8 overage automatic/opt-in/unavailable (recommended: unavailable during beta). None invented.
- **Audit findings, all OPEN (packet §3):** A1 HIGH email-keyed `customer-portal`/`check-subscription` (person, not workspace; no admin gate) · A2 HIGH `install_marketplace_item` ungated on `price_cents` (handed to Marketplace owner) · A3 MEDIUM invoice/refund webhook arms not discriminated on `platform_plan_slug` (§197 cross-layer into `tier_state`) · A4 MEDIUM sub-account "no subscription" misreport · A5 LOW/corrected — the `credit_pulls_per_month` seed is already stripped on `main` by `20260726140000`; prod rows UNVERIFIED (an earlier draft mis-reported it as open, caught by the compliance pass) · A6 `platform_invoices` unwritten · A7 no annual Price · A8 telephony `charge_wired:false` (honest).
- **Proposed sequence:** 1 Billing Foundation → 2 Beta Base Plan + truthful screen → 3 Included-usage visibility (no automatic overage) → 4 Marketplace paid add-ons → 5 additional meters one at a time under the eight-field meter contract. Enforcement of any limit lives at the action-bus clamp (§67/§68), via a Spine Change Request, never in the Billing screen.
- **Evidence:** static/code for every audit row; prototype state coverage driven headless by the committed `docs/prototypes/platform-billing-gate1.drive.mjs` (34/34 states, structural-harness class, transcript in the packet §11); authenticated runtime NOT driven; UNVERIFIED — prod meter drain (#737), live `stripe_price_id` resolution, which Stripe account the platform rail uses in prod.
- **GATE 1 APPROVED 2026-09-02 (rulings R1–R17 in packet §4.2–§4.4).** Owner-only billing acts (R2); Stripe-hosted portal (R3); Solo is the canonical billing experience, Operator screens control-plane only (R9); three beta offers — $74.50 paid beta plan (provider release later), 30-day $0 trial, Operator-granted promotional access — behind ONE entitlement projection with a documented precedence rule (R10/R11); **all currently eligible top-level workspaces go onto Promotional Beta Access via explicit records in a dedicated, reversible, separately Gate-B'd rollout after Foundation C — never as a fallback, never counted as revenue (R12–R15)**; paid-subscriber release discipline (R16). Twelve required Solo states (packet §9.1). **Sequence:** #803 docs merge → Foundation A → B → C → promotional rollout packet → its Gate B → trial / paid-beta provider releases. Platform Billing is a standing workstream; every slice carries an exact-head independent review and its own Gate B. **Nothing is merged, deployed, migrated, granted, or created in Stripe by this entry.**

### Multi-membership login account picker (Gate 1 approved 2026-09-01; local branch, NOT LIVE)

- Google OAuth remains the identity authority. On an explicit login Google is asked to show its own identity chooser; after identity is established, Paige offers the workspace chooser only when that authenticated user has more than one active `tenant_members` row.
- The chooser displays only the caller's RLS-filtered tenant records intersected with their own active membership rows. It never treats an account number, URL, email text or client-supplied tenant id as authorization. Platform operators, client/invite continuations and single-membership users retain their existing direct routing.
- Choosing a workspace persists `profiles.active_tenant_id` through the existing guarded `switchTenant` seam before the browser scope changes. A failed write leaves the current workspace unchanged. The Solo header exposes the same independent-membership switcher; the existing server-gated agency parent/sub-account switcher remains separate and unchanged.
- Truth status: 7 focused policy/OAuth/render tests pass, the TypeScript ratchet adds no errors, focused lint is green and the production build succeeds. Live authenticated Google return, both-account selection, retry, session expiry, account-switch persistence and preview runtime remain UNVERIFIED. Do not merge or deploy without the separate final go-live approval.
### Solo Settings → Team management — ~~local branch, NOT LIVE~~ **SUPERSEDED 2026-09-02: LIVE, capability `PARTIAL`**

> **This entry is kept for its dated detail and is no longer the status.** The work shipped via PR
> #728 (`76bb3bbca`) and is live on production. See §4 → *Solo Team — PAIGE can act on the team* for
> the current record, and `docs/doctrine/surface-cards/team.md` for the department card. Two bullets
> below are now FALSE and are marked where they appear.

- The sparse Team destination is replaced by a roster-first workspace with server-side search/filter, 25-person pages and an explicit Load more path. Settings remains the one vertical scroll owner; the people list never creates a nested scrollbar.
- Enforced tenant permissions remain Owner, Admin, Member, plus truthful read-only presentation of existing specialized permissions. Editable job title and responsibilities describe work only and never participate in authorization.
- Team invitations have review-before-send, pending/resend/revoke/accepted/expired states, email-bound single-use acceptance, and service-role-only token handling. Permission changes have their own owner confirmation.
- ~~Paige chat receives a server-resolved, active-tenant confirmed roster block for the authenticated speaker. Tenant-authored titles/responsibilities are explicitly untrusted reference data; the block cannot send invitations or mutate access and routes confirmation back to Settings → Team.~~ **FALSE as of 2026-09-02.** The roster block and the untrusted-reference-data property still hold, but PAIGE **can** now send invitations and change access — through the canonical approval route, each `high` act behind the real owner approval card. See §4.
- Truth status, CORRECTED 2026-09-02: the structural-harness and static results below still stand, and **migration persistence is now CONFIRMED on prod** (`20261039000000`, `20261040000000` in `schema_migrations`; five `team_*` rows returned by `list_tool_autonomy()`). ~~*Do not merge or deploy without the separate final go-live approval.*~~ — it merged via #728. **Still UNVERIFIED:** authenticated save/reload, real invitation delivery, permission refusal/retry, account-switch and preview runtime. No leg has been driven on the live authenticated platform. ~~25/25 structural-harness checks~~ remain as recorded: 25/25 at 1536×770, 1366×768, 1024×768 and 900×1000; focused tests, type ratchet, security linters and production build green.

### Solo Campaigns -> Pipeline board (Gate 1 approved 2026-08-31; draft PR, NOT LIVE)

- **Canonical Solo ownership contract (owner-locked 2026-09-01).** There is exactly one Solo shell
  for every current and future Solo tenant. `src/solo/SoloEntry.tsx` dispatches the authenticated
  Solo route, `src/solo/SoloApp.tsx` composes the domain surfaces, and
  `src/components/tenant-shell/TenantCommandCenterShell.tsx` owns the shared rail, header, page host,
  responsive behavior and one PAIGE workspace. Tenant identity, data, roles, permissions,
  entitlements and capability truth come only from server-resolved tenant context and domain
  contracts. An account number, account name, fixture, demo state or URL value may address a route;
  it must never select a different Solo shell, layout, navigation system, responsive behavior, page
  host or PAIGE workspace. A Solo UI change must prove the affected context and a different known-good
  Solo context at 1536x770, 1366x768, 1024x768 and 900x1000 with PAIGE closed and open. Settings,
  Connections and Integrations may own visible scrolling; Command Center, Clients, Campaigns and
  Analytics remain form-fitting unless the owner explicitly changes that contract.
- Gate 1 locks the board-first Pipeline interaction inside the existing six-tab Campaigns shell. The only post-approval prototype refinement is the smaller page-title word "Pipeline"; lane, card, detail, and supporting-control geometry remain frozen.
- The draft adds multiple tenant-owned pipelines, blank-first creation with only owner-authored custom stages, tenant-owned stage name/description/order/archive/restore controls, contextual deal detail, focused-stage compact behavior, subordinate routing/repair evidence, stable short references and one-level tenant-owned folders with a virtual Unfiled view. No preset pipeline or stage taxonomy is supplied. Campaign linkage is optional; it is not the only reason to create a pipeline.
- The durable contract is tenant-scoped and callable. Read-only members can inspect but not mutate. Occupied stages fail closed on archive. No revenue, ROI, payment, client-health, or unsupported portal facts are inferred.
- Truth status: local contract/render tests, production build and the draft checks are green on the recorded exact head. The deterministic browser proof covers both example Solo contexts at the four locked viewports with PAIGE closed/open; it is local rendered evidence, not authenticated tenant proof. Migration persistence, authenticated save/reload, permission, retry, abandonment, account-switch and production runtime remain UNVERIFIED. Do not merge or deploy without the separate exact-head Gate 2 request.

### Solo Clients → Conversations — implementation awaiting exact-head release verification (2026-08-28)

The owner-approved Solo redesign is intentionally confined to the existing workspace directly below
`People · Conversations · Calendar · Portal`. It adds no route-local Clients hero, title banner, or
parallel inbox. The Conversations-owned implementation provides a unified queue/thread workspace,
a permanently mounted sibling client-context pane, canonical People/Portal/Campaigns/Connections
links, human/PAIGE-draft/governed handling truth, permission-bound composer tools, channel readiness,
account-epoch clearing, pane-owned scrolling, and constrained-center form-fit. Provider connection
does not prove identity, send permission, A2P, inbound, webhook, mailbox, or operational readiness.
Video and Apple Messages for Business remain unavailable unless separately proven. Ordinary consumer
iMessage is never claimed. No backend, provider, schema, auth, or business-data mutation is in scope.

### GAP — Paige does not know her OWN design (task #219, owner-raised 2026-08-23)

**Owner:** *"Paige should be aware of her own design."* · *"I just want to make sure that we, as a
collective group, and then eventually Paige gets a lot smarter."*

**Verified state, not assumed.** Paige can be steered AWAY from bad design
(`_shared/cheesy-tells.ts`, the runtime mirror of `docs/design-references/CHEESY-TELLS.md`,
substituted into every generation prompt) and can brief a design agent
(`_shared/design-agent-prompt.ts`). She has **no runtime knowledge of her own system** — asked why
gold is only on the act, or what the operator shell's geometry is, she answers from a model's general
sense of nice UI. She guesses, confidently.

**The source of truth now exists:** `docs/brain/design-system.md` (2026-08-23) — palette and the two
separately-authored themes, gold-only-on-the-act, type ladder, layered depth, motion reserved for real
activity, layout discipline, taste bar, and an index of every authoritative source. The runtime module
mirrors THIS, exactly as `cheesy-tells.ts` mirrors its `.md`.

**Tier ruling — OWNER-RULED 2026-08-23** ("Yes I agree with CD call on that"). Proposed by Claude
Design, ruled by the owner the same day. Build against this. It needs no new mechanism:

> Design rationale is platform internals. An **operator IS the platform**, so they get the full
> corpus — why champagne inverts between themes, why gold is spent only on the act, why depth comes
> from layered elevation. A **tenant is not the platform**, so the same question is answered about
> **their** system: Settings → Platform already carries "Brand — mark, wordmark, palette, resolved
> recursively" per tenant, inherited by sub-accounts. A client asking "why is this gold?" gets a real
> answer about their own brand set resolved through their inheritance chain — not our internals in a
> friendly voice. **Same function, two corpora, clamped by the grant she already has.**

It fits the existing capability model rather than inventing a tier concept — the corpus selection is
the grant she already holds, doing what it does everywhere else. The risk it closes: never ship one
design block to every persona.

**Sequenced AFTER the Super Admin v3 install rounds (#216)**, per the same owner message: *"keep
finishing building out the design that Claude Design has us doing."* Queued deliberately, not dropped.
Check **#159** (Paige self-knowledge — models, capabilities, cost, from live truth, tier-scoped) before
building: same shape, same tier discipline, probably the same slice — do not create a second home for
self-knowledge (§18).


### Super Admin console import — open slices after #543 (2026-08-18)

- ✅ **DONE (#543) — the console is mounted** behind ONE guard at an `/operator/*` dispatcher, peer to
  `AgencyEntry`/`BusinessEntry`. See Section 4 "§65 R4 slice 1b". All 78 addresses navigable; every
  surface an honest placeholder.
- ✅ **DONE (#544) — the landing targets are FLIPPED.** `OperatorLogin`'s `GOD_CONSOLE` and
  `resolveLandingRoute`'s operator branch both resolve to `/operator/fleet/tenants`. The sequencing
  red-line was honoured in substance: the flip shipped alongside the first REAL surface, not against an
  empty console, so neither door lands on a 404 (the #538 lockout class). §13 correction: an earlier
  revision of this line read "both still `/admin/platform`" — that is now stale.
- ✅ **DONE (#545) — the sign-in bounce.** See Section 4 "§65 R4 slice 1c". It was a stale-context read
  in `RequireOperator`, not a routing target.
- ❌ **The 7 MIXED inner tier gates** (fleet · paige · growth · analytics · provisioning · marketplace ·
  settings/governance) — owner-only tabs inside operator-level sections. Land WITH their surfaces.
- ❌ **§32.c authenticated drive** — STILL THE LOAD-BEARING GAP, and now covers more: the
  unauthenticated half is proven (10/10, see Section 4, including the CD palette in both themes), but the
  rail RENDER, the 78 rendered surfaces, the Fleet topology/internal-chip behaviour, and above all the
  SIGN-IN BOUNCE FIX (#545) all need a session with operator credentials. Re-run
  `scripts/live-drive/operator-console-drive.mjs` plus an authed walk + §25 taste pass.
- ❌ **15 bespoke CD surfaces still fall back to the generic panel** (task #195): `isMkStore` ·
  `isMkReview` · `isCalMonth` · `isIntGrid` · `isCompose` · `isSupThread` · `isWeekGrid` ·
  `isBufferDiagram` · `isPipeHead` · `isSocialGrid` · `isSocialQueue` · `isPipeBoard` · `isStageBoard` ·
  `isArea` · `isBench` — plus the `platform-brain.js` neural field (`KnowledgeSurface` exposes
  `fieldSlot` as its mount point). Honest, but not the design.
- ❌ **Real backends behind the surfaces** (task #193): the Compass lane WRITE path, the Workspace send
  seam + chat history, and per-panel reads. Every panel body currently states it is not connected.
- ⚠ **Optional owner cleanup (task #196), NOT a blocker:** four of the agency's sub-accounts look like
  leftovers — two named "[TEST] …" and two with no `comp_reason` ("Sample Account LTD", "Unknown Name-
  1"). All four are COUNTED and VISIBLE by design (they are inside the customer shell). If the owner wants
  any of them gone, that is a data decision made on the console, not a filter guessed at in code.
- ❌ **28 design tabs are genuinely net-new** (no shipped equivalent): fleet history/alert-rules/team-pulse/
  prospects · paige sandbox/research/memory · trust-compass escalations/dependencies · marketplace build/
  publishers · automations build · 6 analytics lenses · support escalations/response-policy · comms
  templates · provisioning history · settings operator/brand-kit/capabilities/vault/act-as-history.
- ❌ **~20 shipped operator surfaces have NO design home** — sending identities, the platform invite minter,
  the entire affiliate program, error tracking, usage analytics, network-KB insights + doc-promotion queue,
  admin notifications, data-source registry, data maintenance, the Vibe Studio session shell, and the **#31
  revenue-integrity audit** (the §57 source-of-truth enforcement surface). **`/admin/platform/*` therefore
  gets REDIRECTED, never retired** (§58).
- ❌ **#192 — latent §53:** both operator doors gate on `super_admin` only, so a `platform_admin` falls
  through `resolveLandingRoute` to `/pricing`. Latent only because prod has 0 platform_admin holders.
- ⚠ **Migration-map caveat (§13):** the 50-of-78 mapping was derived from the pack's `label`+`intent`
  strings, NOT from the 8,288-line shell. A REUSE verdict means "the slot is filled by a real surface", not
  "no build work needed" — read the shell section for a tab before finalising its verdict.


### Roles remediation — open slices after R1/R2a (2026-08-18)

- ❌ **R2b — wrapper-closure sweep (do this before trusting any count).** The R1 corpus keys on the
  literal tokens `has_role|has_any_role|user_roles`. Policies/functions that gate via `is_admin()`,
  `is_staff()`, `studio_role_ok()` or `check_feature_access()` reach `user_roles` one level down and
  **never enter the corpus** — so the true call-site count is **higher than 186 + 118**.
- ❌ **R3a — `match_paige_memory` structural auth bypass (LATENT, no role required).** Passing
  `_target_client_id := auth.uid()` makes the guard's AND-chain false so the RAISE never fires, while
  the data predicate keys on the attacker-supplied `_target_user_id`; `authenticated`-reachable and
  `SECURITY DEFINER`. **Not exposed today — both target tables have 0 rows** — but it arms itself on
  the memory fabric's first write. Deferred deliberately: a correct fix must also scope the data
  predicate's `client_id` branch, and it has a live caller (`paige-ai-chat`) whose two legitimate
  paths must survive.
- ❌ **R3b — remaining c1 (26 of 31 DEFINER functions) and the c2 review queue (98 policies).**
  Subagent-audited as candidates; **not** independently confirmed object-by-object.
- ❌ **R4/R5 — backfill + dual-read, then the `user_roles` Class-A-only CHECK.** Do not skip to R5.
- ❌ **Net-new roles capability (owner-ruled 2026-08-18, NOT started):** custom-roles table, a
  `title` field distinct from role, and the sales catalog (Sales Lead · Closer · Appointment Setter ·
  SDR · Sales Ops). Verified absent on prod: no custom-roles/permissions table exists, `tenant_members`
  has **no `title` column**, and `app_role` carries **none** of those sales values (only `sales_rep`).
  UI deferred to the Super Admin Settings pack (owner's Option C).


### Paige self-verify BROWSER — Task #126 Slice 2 SHIPPED + §32.c GREEN (2026-08-12)

- ✅ **`services/paige-browser` Fly service (`paige-browser`) — LIVE.** A self-hosted warm-browser Playwright service (cloned from the `paige-visual-renderer` recipe, §18) that drives a URL headless and returns an HONEST structured observation `{ok, final_url, http_status, title, text_excerpt, screenshot_b64, …}`. SSRF-guarded (DNS-resolving fail-closed + `page.route` interceptor), shared-secret gated, DB-free. **Evidence:** healthz 200 at `https://paige-browser.fly.dev`; the Playwright pin fix rebuild was a REAL rebuild (image 649 MB → 817 MB, new Fly deployment id), not a cached re-push.
- ✅ **`verify_deployed_surface` skill — LIVE + §32.c GREEN.** The first self-verify skill: Paige drives a DEPLOYED public Paige surface through the Slice-1b interpreter→browser dispatch seam and REASONS an honest Fork-8 verdict on what actually rendered (§13 — never a hoped-for render). **§32.c PROVEN:** the owner drove `https://paigeagent.ai` through the skill and it returned **real live content** — hero, security copy, CTAs. This ends the "owner-owed live-walk" pattern the whole wave existed to kill — Paige can now self-verify her own deployed surfaces. **§32.c INTEGRITY REAFFIRMED (2026-08-12):** the *pricing* Paige first returned was stale; a full Branch-A/B diagnostic + independent §39 peer-gate proved this a **live-site content defect, NOT a live-drive integrity defect** (`paige-browser` genuinely drives real live prod — see §10). The tool's first live use CAUGHT a real stale-content leak, which the owner-ruled fix below then killed at the root.
- ✅ **Skeleton de-duplicated (§18, owner-ruled 2026-08-12).** `index.html`'s static no-JS/SEO skeleton (inside `<div id="root">`) previously duplicated the React landing (hero, features, **pricing**, security). Duplication is the drift class — a prior pricing PR updated the React tiers and left the skeleton stale, so a headless reader/crawler saw retired pricing. Now the skeleton carries ONLY stable SEO copy that does not change with product decisions (hero H1 + one value-prop paragraph + one CTA); ALL product-decision content (pricing, features, security specifics) lives in React ALONE.
- ✅ **`verify_deployed_surface` selector tightened to post-hydration content (Slice 2 primitive fix).** The skill waited on `h1` — which the static skeleton also has — so a headless read could resolve against the pre-render skeleton. It now waits on `[data-app-ready]`, a marker element rendered by the React root (`src/main.tsx`) that exists ONLY post-mount, so the self-verify resolves against the HYDRATED app and skeleton false-positives are structurally impossible. (Follow-up migration `20260913120000` UPDATEs the live skill row; the already-applied seed is not edited in place.)
- ✅ **Skeleton parity guard live in CI (`lint:skeleton`, §18/§24/§64).** An extensible any-duplicated-content guard: a whitelist manifest of what `index.html`'s `#root` may carry (declared SEO strings) + banned drift-prone tokens; CI fails if any undeclared/product content appears inside `#root`. Catches ANY future duplication class (pricing, features, testimonials), not just the one found. Sibling of `lint:views`/`lint:definer-fns`/`lint:tier-features`.
- **Substrate that made it work (all SHIPPED this wave):** Slice 1a host (PR #486) · Slice 1b interpreter tool-dispatch seam through the §16 clamp (PR #488) · browser-wave activation (PR #490) · Slice 2 skill seed (PR #491) · operator-workspace tenant + `actorTenantId` operator-user fallback (PR #492, the §32.c tenant-resolution fix) · Playwright EXACT-pin `1.62.1` = base image across both Fly services + root (PRs #494 + the 1.56.1→1.62.1 reconciliation, §32.c finding #2) · index.html skeleton de-dup + post-hydration `[data-app-ready]` selector + `lint:skeleton` guard (PR #496, §32.c stale-pricing finding). **Slice 3 (public-web browsing) is GREENLIT — scoping-first (4 owner decisions pending), real new risk classes (SSRF/injection/leakage/cost/cross-tenant).**
- ✅ **Fly-services auto-deploy CI — `deploy-fly-services.yml` (§64 cloud-first, §24 pattern).** The two self-hosted Fly services (`paige-browser` + `paige-visual-renderer`) now deploy on merge to `main` via GitHub Actions (path-scoped, per-service detection matrix — a change to one never redeploys the other; loud fail-fast if `FLY_API_TOKEN` is unset), mirroring `deploy-edge-functions.yml`. Ends the manual `flyctl deploy` laptop dependency (the anchoring §64 case). **Owner prerequisite (one-time):** `flyctl auth token` → add repo secret `FLY_API_TOKEN`. **PROVEN LIVE (2026-08-13):** `FLY_API_TOKEN` set; `workflow_dispatch` (service selector, PR #500 fixed a `flyctl deploy` positional-dir+`--config` path-doubling bug) deployed `paige-browser` → image `deployment-01KZWJF30AQRPJNJX136XVH32A` v5, healthz 200. Ships with new doctrine **§64 (cloud-first, laptop-independent by default)** in CLAUDE.md. **§32.a evidence captured; the manual `flyctl deploy` dependency is dead.**

### Task #126 Slice 3a — public-web browsing SSRF-hardened primitive SHIPPED + §32.c LIVE-DRIVE GREEN (2026-08-13)

- ✅ **`paige-browser` SSRF-hardened + Phase-1 denylist + wildcard flag + `paige_browser_usage` audit rail — LIVE (PRs #499 merged, deployed 2026-08-13; D1=(c) wildcard+denylist owner-ruled 2026-08-12).** The browser primitive now serves **arbitrary public URLs** via a new `POST /browse-public-url` (distinct from `/self-verify`, §18) behind the full guard. The SSRF guard was **extracted to a shared `ssrf-guard.mjs`** (§18 one home; the smoke tests the REAL code, §32) and hardened: granular reason codes, reserved/broadcast/multicast ranges, the 6to4/NAT64/hex-IPv4-mapped embedded-v4 tunnels (the base guard already covered private/loopback/metadata/IPv6-ULA/`::ffff:`/scheme — a §10-logged correction to the "localhost-only" premise). Two-layer content denylist: Cloudflare-for-Families container resolver (`0.0.0.0` sinkhole → guard denies) + a baked StevenBlack/hosts snapshot. **`paige_browser_usage`** is an append-only audit rail — enforced at the **grant level** (not a trigger — the §39 peer-gate caught that a hard immutability trigger would fire on FK CASCADE and make a browsed tenant un-offboardable, §38; fixed to REVOKE UPDATE/DELETE which cascades bypass), RLS tenant-scoped + `is_platform_operator` (§9/§53). §32.b persisted-apply confirmed (migration `20260913140000` live: cols=12, 2 policies, 0 triggers).
- ✅ **§39 LIVE peer-gate GREEN (2026-08-13, owner-driven from Fly, CC ran the deny-matrix from sandbox against the DEPLOYED host).** All 7 tests passed with exact reason codes: `169.254.169.254` → `ssrf:link-local:metadata` **BLOCKED on BOTH `/self-verify` AND the live `/browse-public-url`** (the cloud-metadata credential-leak gate — THE test); `10.0.0.1` → `ssrf:private-ipv4`; `127.0.0.1` → `ssrf:loopback`; `file://` → denied; `https://example.com` → **real content returned** (the §58 positive control proving the Cloudflare-Families container DNS did NOT break resolution); `/browse-public-url example.com` → structured extraction (title/h1/body/links). **Wildcard flag `PAIGE_BROWSER_WILDCARD_ENABLED=true` flipped by owner + validated by the green gate.** Headless pre-proof: 60 SSRF-guard cases (exact reason codes) + §32.b rollback proof.
- **§13 honest notes:** (1) full DNS-rebinding closure is tracked #138 (mid-redirect to a literal internal host IS caught); (2) the StevenBlack denylist is a build-time snapshot — scheduled weekly refresh is task #151. **Next: Slice 3b** (the `browse_public_url` skill that wires Paige's interpreter to `/browse-public-url` + writes the tenant-scoped `paige_browser_usage` row) and **3c** (per-tenant rate limits) are now UNBLOCKED.

### Task #126 Slice 3b — `browse_public_url` skill (public-web research capability) SHIPPED — merged #502, §32.a persisted-apply CONFIRMED (2026-08-16)

- ✅ **The `browse_public_url` platform-baseline skill turns the Slice-3a `/browse-public-url` endpoint into a real Paige capability + FIRST writer of the `paige_browser_usage` audit rail.** A tenant points Paige at a public URL (runtime `inputs.url`, §18 url-from-input — NO static step url); the skill-interpreter routes a `tool:"browser"` step with **`mode:"public"`** to the new public-web browse seam (distinct from `/self-verify`, §18), extracts the structured research shape (title/meta/h1/body≤500KB/links), and forge-summarizes only what actually loaded (§13). Seed migration `20260914000000` — category `operations_process`, `read_only`+`auto` (so the §16 clamp FIRES the browse), `scoping='platform'`, tier §61 default (god yes · solo yes · sub yes · agency resell · enterprise yes+resell).
- ✅ **The audit/metered row is written by the CALLER (skill-interpreter via service_role), NOT the DB-free Fly host (§9/§34).** On every call — allowed OR blocked — exactly ONE `paige_browser_usage` row is written with `tenant_id` = the server-resolved `ctx.tenantId` (EXPLICIT, never body-trusted, §9/§51) and `created_by` = `invoker_user_id`; `blocked_reason`/`http_status`/`content_bytes`/`response_time_ms`/`url_resolved` mapped from the host's structured body. An audit-write miss is logged loud + proceeds (never fabricated, never silently blocks the observation, §13/§32). Host seam `browsePublicViaHost`: **30s hard AbortController timeout + single retry on 5xx/throw** (D4), honest `{ok:false,error}` on double-failure, `{needs_config:true}` when the env is unset.
- ✅ **`verify_deployed_surface` (Slice 2) byte-unchanged (§58):** `pickBrowserStep` now EXCLUDES `mode:"public"` steps so the self-verify path is untouched; `browse_public_url` is the first (and only) `mode:"public"` skill. **Trust Compass:** additive `paige_action_kinds` row `tech.browse_public` → Technology/Automation dept, `auto` lane (`20260914010000`, ON CONFLICT DO NOTHING, not on the execution path — §16 org-model surfacing only).
- ✅ **Producer (§18/§37):** the ONE audited producer is the existing generic `run_skill` (paige-mcp → skill-runner → interpreter), which already forwards the server-resolved tenant + `invoker_user_id` — so `browse_public_url` is reachable + audits correctly the moment it seeds, with **zero per-surface code**. **Forking a direct `/browse-public-url` call into any surface (paige-ai-chat/subagent-market-research/content-drafter) is PROHIBITED** — it would bypass the `paige_browser_usage` audit write (§9) and fork the host seam (§18). Exposing skills in the primary `paige-ai-chat` inline tool loop is a broader capability (lights up ALL seeded skills, not just browse) deliberately DEFERRED to its own slice with its own §32 verification — same reachability posture as every other seeded skill today (all reachable via `run_skill`, none yet in the main chat tool loop).
- **Verification:** 35 unit tests GREEN (pure core: `pickPublicBrowseStep`/`isHttpUrl`/`foldPublicBrowse` + the §58 `mode:"public"` exclusion); tsc 0; `lint:views`/`lint:definer-fns`/`lint:tier-features` all clean. **§32.a rollback proofs GREEN on prod** (rolled back): skill `SLICE3B_PROOF new=1 cat=operations_process browser=t mode=t lane=auto risk=read_only scope=platform nourl=t fin=0 jarg=0`; Trust Compass `dept=technology_automation lane=auto requires_approval=f`; **§32.b audit-write shape** `inserted_id_ok=t rows=2` (both allowed + blocked row shapes). **§39 peer-gate = SHIP** (independent adversarial read of the real diff — no BLOCKER, no HIGH): §9 tenant-write clean (server-resolved `tenant_id` after the `!tenantId` guard), audit columns exact, §58 confirmed (zero existing `mode:"public"` seeds), retry/timeout correct, migrations pass every CHECK. **Two peer-gate findings fixed in the same PR:** M1 (MEDIUM audit fidelity) — a host transport failure (timeout/5xx/nav-failed) now records a `host:*` sentinel in `blocked_reason` instead of `null` (which the rail reads as "allowed"), so the §17 meter + safety surface count it as a failed attempt; L1 (LOW) — a transient `429` busy is now retried like a 5xx. **§32.a persisted-apply CONFIRMED on prod (2026-08-16, post-merge #502):** `schema_migrations` advanced to include `20260914000000` + `20260914010000`; `browse_public_url` skill row live (`operations_process/read_only/auto/platform`); `tech.browse_public` action_kind live (`technology_automation/auto`); **`deploy-edge-functions.yml` @ merge commit `74d601c2` = completed success** (the public-browse interpreter + `browsePublicViaHost` host code is live). **Still OWED: §32.c live-drive** (`run_skill browse_public_url` from a real tenant → confirm the `paige_browser_usage` row) — needs a paige-mcp/browser-capable session (Cowork/owner); this headless CC session has no paige-mcp connection (honest §13/§32.c).

### Route + URL Taxonomy (§65) — foundation authored, migration NOT yet code (2026-08-17)

- 📋 **`docs/doctrine/route-and-url-taxonomy.md` is the source-of-truth for TARGET routing** — the LOCKED
  6-row matrix (Operator `/operator` · Agency `/agency/{account}` · Enterprise `/enterprise/{account}` ·
  Solo `/solo/{account}` · Sub-account `/business/{account}` · Client `/portal/:tenantSlug`) + the staged
  redirect-safe migration plan. **HONEST state (§13):** this is a DOCS foundation, NOT shipped code — the
  live routes are STILL the current `/admin`-overloaded topology (see `docs/brain/codebase-map.md`). The
  code-rename slices are owner-review-gated (owner reviews the taxonomy + migration order first). Until
  they ship, do NOT assume any target route exists.

### Recently SHIPPED (2026-08-09)

- ✅ **PR #412 — Tenant revenue classification + ARR reconciliation** (task #29) — MERGED. Topology fix + hard-delete-cascade of Paige Operations + Claude Studio Dev + Platform Defaults relocation + Part-5 dropdown + reconciliation + MCP splits. §39 peer-gate 4 findings all resolved. **§32.a persisted-apply PROVEN on prod** (all 4 migrations in `schema_migrations`; 2 retired tenants deleted → 11→9 tenants; 4 PME sub-accounts; 0 paid-class → Fleet Console reconciled to $0).
- ✅ **PR #413 — Master project reference + CLAUDE.md §0** — MERGED (this doc + the session-start rule + Cowork research discipline + verified Comms facts).
- ✅ **PR #410 — Second Brain** (task #26) — MERGED. `docs/brain/` is now live; §BRAIN reloads every session. (Owed follow-up: the §BRAIN.3 "Tenant Classification" config-registry section.)

### In-flight

- 🔥 **PR #415 — Revenue integrity chain** (task #31, Wave 8 launch gate). Fail-closed trigger (`enforce_revenue_integrity_chain`) + operator audit RPC (`operator_revenue_integrity_audit`) + Fleet Console audit UI. §30-diagnosed (handoff schema wrong on every gate → real tables), §37 producer inventory clean, §39 peer-gate + §5 compliance BOTH passed (2 §39 defects + 1 §5 blocker fixed), §32.b proven against the verbatim file. **Draft PR, owner §32.c-gated.** See Section 10.
- 🔥 **Second Brain now LIVE on main** (`docs/brain/`, PR #410 merged 2026-08-09). §BRAIN.1/.2/.3 discipline binds: read `docs/brain/README.md` at session start; answer "do we have X?" from the brain; update the relevant brain file in the same commit as a change.
- 🔥 **Wave 2.5 tail** per canonical-build-order.
- 🔥 **Task #31 — investor-grade revenue integrity chain** (the write-side of #412's read-side; three-gate signup enforcement + audit-trail export). Queued; fires with a §1 crew on owner go.

*(PR #412 revenue classification + $0-ARR and PR #413 master doc + §0 both merged 2026-08-09 — moved to Section 4 SHIPPED.)*

### MVP-blocking gaps (all-open)

- ❌ **Fleet Comms operator SMS `paige-operator-sms-send` returns 500 (CC-root-caused 2026-08-09, fix specified, awaiting owner go).** Owner's §32.c live-drive send to a test recipient failed "Edge Function returned a non-2xx status code." CC diagnosis by elimination + code trace: it's HTTP **500 = `authz_check_failed`** (`index.ts:45`) — `caller.rpc("is_platform_owner")` errored. NOT needs_config (returns 200; **MG SID IS set — owner does not need to re-paste**), NOT the upsert (verified OK via rolled-back service-role txn), NOT a Twilio rejection (`twilioRequest` never throws → returns 200 'failed'). Leading cause: `is_platform_owner`/`is_super_admin` each have TWO overloads (`()` + `(_user_id uuid)`), and a PostgREST `.rpc()` against overloaded functions hits **PGRST203** — the #408 fn is the first DIRECT rpc caller (others use it inside RLS/definer). Fix (2 parts): (1) call the owner-check overload-safely + log `ownerErr.message`; (2) add an outer try/catch returning a structured 500 (§32 loud-failure). Same class as §51 #130.
- ⚠️ **Twilio phone-number search — SHIPPED 2026-09-01; only VANITY and PREMIUM/REGISTRY search remain (Task #27).** This row read *"❌ … the ONE narrow remaining Twilio piece"* after search had already shipped, so Sections 4 and 5 asserted opposite states. Search by area code, region, city, digit prefix and toll-free is live in Connections → Communications, as is purchase. Missing: letter-based **vanity** matching and **premium/registry** search. `sms_enabled` sits in the same edge-only category as vanity — the function accepts it, no product caller sends it. Task #27 is rescoped to vanity + premium/registry.
- ❌ **A2P 10DLC carrier submit** — UI exists, backend stubbed; no `messaging_service_sid` table.
- ❌ **SMS-in-signup** — phone capture not in signup migrations (task #23).
- ❌ **`delete_tenant` RPC + MCP tool** — task #30 scope (§10 Paige-callable).
- ❌ **Stripe Connect direct-charge posture verify + BYO tenant processor lane** — Money Spine B-Connect deferred but needed for full §38 posture.
- ✅ **`signup_intake` table EXISTS** (was a false gap — CC live-prod check, task #31 §30 diagnose; §10 correction reverses Cowork miss #3). Per-user pre-provisioning intake (`user_id, account_type, agreement_slug, agreement_version, terms_accepted_at, plan_slug, billing_period, consumed_at`); tenant-level agreement acceptance lands in `legal_acceptances` + `profiles.terms_accepted_at` via `provision_tenant`. Not a gap.

### Reclassified post-MVP → MVP-BLOCKING (owner ruling 2026-08-10)

Five items the owner moved from post-MVP into MVP scope:

- ❌ **#43 — Agency/Enterprise language split.** Per-tier surface labels: Solo/Sub = "People" · Agency = (label TBD) · Enterprise = "Portfolio" · Super Admin = "Fleet". (Companion to #51/#52 below.)
- ❌ **#44 — Super Admin calendar.** REUSE the solo/sub calendar per §18 (one home), extended to operator scope (§35 dogfooding) — do not fork a second calendar surface.
- ❌ **#45 — Paige suggestive personality upgrade.** Extends Sonnet-tier reasoning (§36 intuitiveness moat).
- ❌ **#46 — GitHub-repo skill ingestion connector.** Folded into #35 Standard-Practice Skill Library (Wave 4, L8-adjacent).
- ❌ **#51 — Fleet surface renaming.** Super Admin "Fleet" as a first-class label (Solo/Sub keep "People", Enterprise "Portfolio"). Sibling of #43.

### Owner tasks filed 2026-08-10/11 (external tracker #47–#61)

Recorded here for durability; §30 verdicts noted where CC's diagnostic already resolved the premise.

- ✅/§30 **#47 — Client detail reachability (D4).** ALREADY-CLOSED by #444 (route + `ContactDetail` + nav wired). Not a gap; verify only.
- ❌ **#48 — Send flow channel picker + auto-recipient + threading (D5).**
- ❌ **#49 — Comms threading: sent messages land in the client's Conversations (D5).** §30 fix target: `send-sms`/`send-transactional-email` key on `user_id`, not `contact_id` — that's why sent msgs don't thread into the contact's conversation.
- ❌ **#50 — Format picker (Word / GDoc / PDF / Markdown); PDF must NOT be the default for editable deliverables (D5).**
- ❌ **#52 — Contact management platform-wide consistency** (People / Fleet / Portfolio uniformity across tiers).
- ✅/§30 **#53 — Paige `contact_lookup`/`pipeline_lookup` default TENANT scope.** ALREADY tenant-scoped (`actorTenantId` in `paige-mcp`). Not a gap; verify only.
- ✅/§30 **#54 — Pipeline tab scope-mine.** ALREADY-CLOSED (KPI + board share `filteredDeals`). Not a gap; verify only.
- ❌ **#56 — Conversations default → three-column ready shell (D9).** §30: `FirstRunOnboarding` swaps the whole frame; fix lives in `ConversationsThreeColumnShell`.
- ❌ **#58 — Cross-surface parity audit** (enforces §57 — walk each tenant-facing figure back to its God-level source).
- ❌ **#59 — Fleet Console Attention Queue stale MRR** (`$397` + `$149`) despite 0 paying tenants — needs a `test_seed` filter + `revenue_class='paid'` gate. Ships WITH #31 (revenue integrity chain). (§57 anchor case a.)
- ❌ **#60 — Antonio Daniel LLC misclassified `SUB_ACCOUNT`** in the attention queue — tier reclassification audit (§51/§57 anchor case b).
- ❌ **#61 — Super Admin Analytics gap** (empty vs. a sub-account's live Analytics) — §35 violation; at-least-parity required before shipping more sub-account analytics (§57 anchor case c).

### Post-MVP CX workstream

Per `docs/strategy/client-experience-workstream-2026-07-21.md` — CX-1 (polish, ships anytime) → CX-2 (composable) → CX-3 (client-facing Paige) → CX-4 (transformation primitive) → CX-5 (Marketplace client blocks + Money Spine Lane B-vi).

### Critical DOC gaps (files referenced but ABSENT from `docs/`)

- ✅/⚠ **BRD (Business Requirements Document)** — a BRD-MVP scope doc **DOES now exist** at `docs/product/BRD-MVP-2026-08-08.md` (97 KB, LOCKED 2026-08-08, first-class cited in §9 — doc-alignment Task #32). The earlier "NOT present, largest doc gap" claim is stale — the MVP-scope BRD is present. ⚠ **Open question (owner):** confirm whether this BRD-MVP is the same artifact as the "full BRD" some docs cite as PR #394, or a distinct MVP-scoped subset. Until confirmed, treat `BRD-MVP-2026-08-08.md` as the canonical requirements source of truth.
- ⚠ **System Architecture doc** — same PR #394 reference; NOT present.
- ⚠ **`docs/assessments/PLATFORM_ASSESSMENT_2026-07-13.md`** — cited as ~85% valid; NOT present.

---

## 6. Task ledger (high-signal current)

| # | Task | Status | Blocked by |
|---|---|---|---|
| #21 | Signup pricing/plan selection on marketing page | pending | — |
| #22 | Super Admin Communications (S3 seam) | ✅ merged as PR #408; awaits owner secret paste + live-drive | #29 |
| #23 | Signup flow SMS integration | pending | #22 live-drive + phone capture |
| #24 | Voice fix end-to-end | ✅ closed (Ivanna live) | — |
| #25 | paige_conversations unsafe RLS | pending | — |
| #26 | Second Brain (PR #410) | ✅ MERGED (brain live) | — |
| #27 | Twilio number search — VANITY (letter) + premium/registry only; base search + purchase SHIPPED 2026-09-01 | pending (rescoped) | — |
| #28 | Tenant-as-operator-client auto-provision + consent capture | pending | #29 |
| #29 | Promotional-account classification + ARR reconciliation (PR #412) | ✅ MERGED (§32.a-proven) | — |
| #30 | Super Admin full CRUD on tenants + §10 seams | pending | #29 |
| #14 | Paige Voice AI on Twilio ConversationRelay — Client Experience team answers via Paige's model router (§17); §34-compliant (Twilio = telecom pipes ONLY; NEVER Twilio Conversation Intelligence / Virtual Agents / AI Assistants) | queued | Wave 4 |
| #10 | Paige document-creation expansion — offer letters, sales offers, presentations, markdown, in-chat payment links, agreement customization | queued | Wave 4 |
| #11 | Paige chat thinking-process indicators | queued | — |
| #12 | Paige chat conversation-compacting UX (mirror Claude Code's "Compacting…" pattern) | queued | — |
| #9 | Super Admin business-operator surfaces (People/CRM, Pipeline, Deals, Growth per §35 — Paige Agent AI runs its OWN sales through the platform) | queued | Wave 4 |
| #7 | Systems Check comms depth extension — SPF/DKIM/DMARC per sending domain, Postmaster reputation, inbox placement | queued | Pillar 1 (L1-L3 shipped) |
| #5 | Owner Trilogy Customer Portal Taxonomy — Platform Team vs Tenant Team distinction row (companion to the taxonomy-matrix doc edit) | queued | — |
| CX-1 | Client Portal config polish | pending | — |
| CX-2 | Composable portal architecture | pending | CX-1 |
| CX-3 | Client-facing Paige persona | pending | CX-2 |
| CX-4 | Transformation primitive | pending | CX-3 |
| CX-5 | Marketplace client-side blocks | pending | CX-4 + Money Spine B-vi |

---

## 7. Sequential roadmap (current state → MVP live)

Per `docs/doctrine/canonical-build-order.md` (LIVING, updated 2026-08-08):

- **Wave 1** ✅ COMPLETE
- **Wave 2** ✅ COMPLETE (except #247 tail)
- **Wave 2.5** 🔥 FIRING — Playwright dev-dep, live-drive backfills, per-sub-account curation, §3.b doctrine paste, #247
- **Wave 4 = MVP HUB** 🎯 NEXT — 4 Owner Trilogy pillars + 5 Cowork-locked product specs + BRD-promoted items (L8 Memory Fabric, Interactive Analytics UI, Playwright web-browsing, Promo Account Type, Chat compaction/history/tasking)
- **Wave 3** ⏸️ DEFERRED past W6 (Practice Blueprints)
- **Wave 5** 📋 RESERVED
- **Wave 6-7** 📋 QUEUED
- **Wave 8 = BETA LAUNCH prep** — #135 Codex sweep · #74 logo scrub · #194+#195 Stripe wire-up · #129 tenant lifecycle wind-down
- **Wave 9 = SOC 2** (post-BETA)

### Immediate 72-hour queue

1. **#412 merge** (owner §32.c live-drive)
2. **#410 merge** (owner §BRAIN approval)
3. **Task #22 live-drive** (operator SMS with Twilio secret paste)
4. **#411 confirm-merged** (Wave 4a analytics primitive)
5. **Wave 4 kickoff** — MVP hub. Owner rules which pillar/BRD-item fires first.

### Money Spine sequence (per §38 amendment)

B-i ✅ → B-iv ✅ (posture verify pending) → B-ii (in flight) → B-Platform → B-Meter → B-v → B-iii → B-vi. **B-Connect deferred.**

---

## 8. Daily reference protocol (Cowork + CC + Codex)

### Session start (every session, all three agents)

1. Read this doc — Sections 0, 4, 5, 7
2. Read `CLAUDE.md` (root)
3. Read `docs/brain/README.md` once PR #410 merges
4. If task-specific: load the canonical deep doc from Section 9

### During work

- Before ANY claim about the codebase (what exists, what's wired, what's shipped): grep first, check Section 4 second, memory NEVER
- Before ANY paste that references a table/function/file: verify it exists
- **A finding discovered outside the current assignment's scope becomes a GitHub issue immediately, and is not started.** GitHub Issues are the authoritative individual work records; the PAIGE Attention Register is the one owner-facing view over them. This doc holds material platform truth — its legacy in-file ledger (Section 6) is not extended, and a new finding goes to Issues, never here. The standard — the five records, the register's nine fields and six views, the live lists that already exist, and the honest record that the register's board does not exist yet — is `docs/doctrine/paige-attention-register.md`.
- **CC's code check is authoritative** — Cowork's sandbox agents can miss recently-shipped migrations or files; when CC disagrees with Section 4 or Section 10, CC's finding wins

### Session end (any agent that shipped work)

1. Update Section 4 checkboxes
2. Update Section 5 status
3. Log §13 corrections in Section 10 if surfaced
4. Cross-post to brain (once #410 merges)
5. Commit: `docs(master): update after <PR#/slice>`

---

## 9. Canonical deep docs (by topic)

### Product specs (LOCKED 2026-08-08 — `docs/product/`)

- BRD-MVP — `BRD-MVP-2026-08-08.md` (Business Requirements Doc — scope + requirements source of truth; peer to the Canonical System Architecture)
- Owner Trilogy Customer Portal Taxonomy Matrix — `customer-portal-owner-trilogy-taxonomy-matrix.md`
- Agent UI Placement — `agent-ui-placement-spec.md`
- Promotional Account Type — `promo-account-type-spec.md`
- Interactive Analytics UI — `interactive-analytics-ui-spec.md`
- Multi-Channel Comms & Deliverable Workflow — `paige-multichannel-comms-and-deliverable-workflow-spec.md`

### Strategy (`docs/strategy/`)

- Owner Trilogy — `owner-trilogy-2026-07-26.md` (canonical, revised 2026-08-04)
- Business Vault landscape — `business-vault-partner-landscape-2026-07-26.md`
- Twin Capabilities landscape — `twin-capabilities-landscape-2026-07-26.md`
- Systems Check + Analytics landscape — `systems-check-and-analytics-landscape-2026-07-26.md`
- Client Experience workstream — `client-experience-workstream-2026-07-21.md`
- Monetization rollout — `monetization-rollout-2026-07-21.md`
- CPaaS ISV provider comparison — `cpaas-isv-provider-comparison-2026-07-26.md`
- Agency surface competitive research — `agency-surface-competitive-research-2026-07-25.md`

### Doctrine (`docs/doctrine/`)

- Canonical build order — `canonical-build-order.md` (LIVING roadmap)
- Tier matrix — `tier-matrix.md` (§51 — the canonical six-tier matrix every tier/producer check refers to)
- $100M Org Blueprint — `100M-org-blueprint.md` (§16)
- $1B Growth Map — `1B-growth-map.md` (§17)
- OS Architecture — `paige-os-architecture.md` (§35)
- Money Spine Architecture — `money-spine-architecture.md` (§38)
- Paige C-Suite roster — `paige-c-suite-roster.md` (proposed §42)
- Corporate Structure — `paige-corporate-structure-2026-08-01.md`
- Memory Fabric L8 — `paige-memory-fabric-l8-2026-07-28.md`
- Unified Comms Substrate — `paige-unified-comms-substrate-2026-07-29.md` (§49)
- Voice Layer — `paige-voice-layer-2026-07-28.md`
- Chat Universal Control Surface — `paige-chat-universal-control-surface-2026-07-28.md`
- Practice Blueprints — `paige-practice-blueprints-2026-07-29.md`
- n8n Orchestrator Brain — `paige-n8n-orchestrator-brain-doctrine.md`
- Tenant Lifecycle Winddown — `tenant-lifecycle-winddown-2026-07-28.md`
- CLAUDE.md Amendment Draft — `claude-md-amendment-draft-2026-07-28.md` (§§40-45, §49 pending)

### Security cluster (`docs/security/`)

DOCTRINE_190/191/192, 194, 197, 198 + Addendum, 200, 201, 202, 203, 205, 208, 210, 213 + `AUDIT_213c_RETRO_2026_07_03.md`, `MIGRATION_B_SHAPE_PROPOSAL_PATH_B_FINAL.md`, `OPERATOR-ACCESS-MODEL.md`, `PLATFORM_SEPARATION_AUDIT_2026-07-02.md`, `SECURITY_DEFINER_CATALOG.md`.

### Architecture (`docs/architecture/`)

- Ecosystem Data Ownership Map — `ECOSYSTEM_DATA_OWNERSHIP_MAP.md`
- Ecosystem Full-Stack Boundaries — `ECOSYSTEM_FULL_STACK_BOUNDARIES.md`
- Marketplace Data Model — `MARKETPLACE-DATA-MODEL.md`
- Sprint C1 Tenant Readiness — `SPRINT_C1_TENANT_READINESS.md`
- Platform-Operator-Tenant model — `platform-operator-tenant-200.md` (§200 platform-independence)
- Canonical System Architecture — `CANONICAL-SYSTEM-ARCHITECTURE-2026-08-08.md`

### Design references (`docs/design-references/`)

- Cheesy-tells catalog — `CHEESY-TELLS.md` (§25 — the enumerated anti-pattern list every design pass runs against)
- Design-critic brief — `DESIGN-CRITIC-PROMPT.md` (§25 — the design critic's role + SHIP/ITERATE/BLOCK output shape)

### Audits + assessments

- `docs/assessments/CONSOLIDATED_PLATFORM_AUDIT.md` (living rollup)
- `docs/audits/platform-ia-slice-1c-handoff.md` (REVISED FINAL — Slice 1c complete)
- `docs/audits/money-spine-lane-b-i-discovery-2026-07-25.md`
- `docs/audits/b-iv-38-connect-posture-2026-07-26.md`
- `docs/audits/people-model-strategy-2026-07-21.md`
- `docs/audits/phase2b-privileged-function-audit-2026-07-25.md`
- `docs/audits/phase2d-undeployed-function-disposition-2026-07-25.md`
- `docs/audits/2026-08-09-tenant-classification-audit.md` (#29 — $0-ARR reality + reconciliation + §39 peer-gate)

### Grounding + inventory reports

- `docs/PAIGE-INTELLIGENCE-GROUNDING-REPORT.md`
- `docs/PAIGE-CALLABLE-SEAMS.md`
- `docs/PAIGE-CREATIVE-MEMORY.md`
- `docs/PLATFORM-FUNCTION-INVENTORY-2026-07-19.md`
- `docs/L4-REASONING-GROUNDING.md`
- `docs/L7-SLICE-1-GROUNDING.md`
- `docs/RESEARCH-VERIFIER-FDIC-NCUA-GROUNDING.md`

### Session outputs (persistent)

- `docs/OPS.md`
- `docs/DONE.md`

### Superseded (do not use as source-of-truth)

- `docs/assessments/IA-SLICE-1C-BLUEPRINT.md` → superseded by `docs/audits/platform-ia-slice-1c-handoff.md`
- `docs/roadmap/build-order-2026-08-04.md` → superseded by `docs/doctrine/canonical-build-order.md`
- `docs/paige-master-implementation-order.md` → historical reference only
- `docs/paige-roadmap-action-bus.md` → historical brief
- `docs/PAIGE-STUDIO-PAUSE-STATE-2026-07-19.md` → pause snapshot
- `docs/VIBE-STUDIO-HANDOFF-2026-07-14.md` → old handoff

---

## 10. §13 corrections log

 - **2026-09-03 — I swept for the instance that had just bitten me, not for the class I had just
   learned, and reported it as a sweep.** Commit `eb0dbd83` on #792 was titled *"swept R2 and R3 for
   R1's and R4's blind spot — a NEGATIVE result, asserted"*. The measurement was real and the result
   still holds: neither rule reads a destructurable expression. But **destructuring was the INSTANCE**;
   the class is *a target the guard cannot read*, and I had already named that class with an explicit
   `UNREADABLE_METHOD` sentinel in the sibling MCP guard **one PR earlier**. Independent review found
   the class alive in both rules the sweep had covered: R2 read a dynamic `import(p)` as "not the
   superseded gate", so the #711 bare-boolean gate could have been adopted dynamically with CI green;
   R4 read `client[m]` as "not a data method", so the shared seam could have made its own atomic claim
   undetected. **A sweep is only a sweep if it names the property being swept for.** Mine named a
   syntax. Both now fail closed, with the specifier resolved through the same file first so that
   failing closed costs nothing on the four real dynamic imports in the scan roots.

 - **2026-09-02 — a tier gate I shipped as the headline fix did not fix the reported flow, and I said
   so before Gate B rather than after.** The Solo account-context repair (#811) originally led with
   *"`/business/*` had no tier gate; adding one closes the defect."* The first clause is true and the
   hole was real. The second is false: in the reported flow the parked context **is** a sub-account,
   so `/admin` Gate B resolves `tierKey === "sub_account"` and the new gate **allows** it. The gate
   only ever catches a Solo-tier caller at a `/business` URL — a state nothing in the app routes to.
   What actually fixes the flow is the entry rule: a fresh sign-in already asked which workspace
   (`Auth.tsx` + `shouldOfferAccountPicker`), while a RESTORED session came through `/admin` and
   silently resumed whichever context `active_tenant_id` was parked on; `/admin` now runs the same
   shipped predicate. **The failure mode worth naming is not the wrong gate — it is that a plausible
   mechanism was written up as a proven one.** The claim would have survived review: it type-checked,
   it tested green, its own tests passed, and it described a genuine defect. It only fell over when the
   chain was walked end to end from the door the owner actually came through. §70 restated: reading
   that the code is wired is not evidence the person can finish, and a fix for *a* defect is not a fix
   for *the* defect.
 - **2026-09-02 — a scoped test run is not a test run.** The same PR gated `/agency/*` as well, and
   that gate destroyed agency act-as: during a sub-account drill-down `activeTenant` becomes the
   CHILD while authority comes from the PARENT, so a parent-first tier read ejected operators out of
   the `/agency/{parent}/sub/{child}/…` path built to serve them. Two PRE-EXISTING integration tests
   modelled exactly that flow and would have caught it locally — but the local run was scoped to
   `src/solo` and `src/lib/auth`, so CI found it instead. Reverted byte-identical; the hole it was
   reaching for is filed (#814) rather than closed by a guess about a tier outside the brief. The
   habit this replaces: running the tests near the code you touched, when the regression is by
   definition somewhere you were not looking.
 - **2026-09-02 — the §39 peer-gate returned BLOCK on a change whose own suite was green, and was
   right four more times.** Beyond the CI regression it found: a null `activeTenant` on a settled
   context being classified as tier `solo` (a null is "we do not know yet", never a tier — and
   `switchTenant` produces exactly that window, so the guard would have ejected an owner mid-switch);
   `/solo/*` carrying the exact mirror of the hole `/business/*` was being fixed for; a docblock
   claiming the exit control closed the "parked with no way back" half while it is not mounted in the
   shell that strands people; and that control counting a different population than the chooser it
   navigates to, so the button could be a silent round trip. It also caught that the new
   `shouldOfferWorkspaceExit` was a byte-for-byte duplicate of the shipped `shouldOfferAccountPicker`
   (§18). **None of these were reachable from the author's own assertions, which is the entire point
   of the gate** — and the docblock finding is the third time on record that prose in this repository
   asserted a protection the code did not implement.
- **2026-09-01 — multi-tenant email identity and workspace identity were previously collapsed into one redirect.** A Google identity can hold several independent Paige memberships, while the agency parent/sub-account switcher governs a different relationship. The approved correction keeps those authority domains distinct: Google selects the person, Paige intersects that person's active membership rows with RLS-visible tenants, and the existing guarded active-tenant write commits the chosen workspace. This is a Gate 1 implementation record only; live authenticated proof and Gate 2 remain outstanding.

- **2026-09-01 — the Pipeline draft entry still claimed optional starter creation after the owner
  removed every preset pipeline and preset stage.** The implemented creation path is blank-first and
  sends only stages the owner explicitly authors; PAIGE may propose a custom pipeline through the
  governed contract, but no generic sales taxonomy is supplied. Section 5 now states that exact
  contract and also records the canonical one-shell rule for all Solo tenants so an account where a
  defect was observed can never become a separate shell implementation.
- **2026-09-01 — I closed a gate by handing the key to the model. Two reviews, two holes, and the
  second one was mine (branch `codex/paige-knowledge-active-tenant-isolation-v2`, PR #675, NOT
  MERGED).** Recorded in full because the shape of the mistake matters more than the fix.

  **The property that was protecting every write was STRUCTURAL.** The confirm gate's re-entry test
  read `approvedConfirmations`, which arrives only in the validated REQUEST BODY — and a model
  cannot write a request body. Self-approval was impossible by construction, not by instruction.

  **Repair 1 (`20261023000000`) traded that away without noticing.** The echo mechanism it replaced
  was genuinely broken — only one of six chat surfaces sends the echo, so every confirm-gated tool
  had become permanently un-executable on the other five, and the client-portal seat had lost
  `update_client_data`, its only write. The fix returned a `confirm_token` so approval could be
  expressed anywhere. But it returned it **in the tool result**, and the agentic loop feeds tool
  results straight back into the model's own context and issues another round. The model could
  replay its own token and execute — one round after proposing, with no operator — across all 48
  gated tools, including role grants, a permanent workflow delete, and `automation_set_grant`, the
  one tool §67 says Paige must never be able to use on herself. The card the person eventually saw
  was an Approve button for something that had already run.

  **Every test I had written kept passing**, because each supplied the token the way a SURFACE
  would and none ever asked whether the MODEL could supply it. That is the transferable lesson: I
  tested the mechanism I had built rather than the adversary it exists to stop. An independent
  adversarial review driving the real handler found it; no static reading would have.

  **Repair 2 (`20261026000000`) restored a structural floor — and was still not enough.** A proposal
  records the request that minted it; the claim excludes it. That much held: a model cannot start an
  HTTP request, so same-turn self-approval became impossible again. A third review then broke it a
  different way and I reproduced it before acting. **The token is the fingerprint of the ACTION, not
  a secret.** Any LATER request that re-proposed the same call was handed it straight back — and a
  request is just the next message, whatever that message says. Driven, a turn whose human text was
  *"No. Do not do that. Cancel it."* executed the stored write and raised an autonomy grant from
  `confirm` to `auto`. The nonce was never the flaw; **re-issuing the key on demand was.**

  **Repair 3 removes the token rather than patching it, and turns the risk split into a policy.**
  Approval now arrives down two channels the code names and treats differently: a rendered card
  (its fingerprint travels in the request body, which a model cannot write) and `confirm: true` (the
  model's own word). `supabase/functions/_shared/action-risk.ts` decides which channel each action
  needs, from the action alone — 28 `ordinary`, 21 `high` (card only), 2 `owner_only`. `MUTATING_TOOLS`
  is that policy's key set, so the two lists that must agree became one. An unclassified write is
  refused at dispatch and fails CI. Declining a proposal now CANCELS it, instead of leaving it live
  for its full window while the refusal existed only as prose the model had to keep honouring.

  **What repair 3 still does NOT prove, stated because an ambiguous sentence here is how the first
  hole got written:** for an ORDINARY action on a card-less surface, the yes is still model-asserted
  prose. That is the trust level those surfaces have always had, now with the arguments pinned
  server-side, a single-use claim, scope re-checked at redemption, and a decline that actually kills
  the proposal. It is not a proof that a human agreed, and it is not claimed as one — which is
  exactly why nothing irreversible, permission-changing, outward-facing or money-spending is
  reachable that way any more. Building the card on the other five surfaces is the real close-out;
  it is interface work owed to CD (§00).

  **Three transferable rules, each paid for:**
  1. **When a fix removes a structural impossibility and replaces it with an instruction, that is
     the regression** — even when the thing it fixes is real. "Do NOT retry" in a tool result is
     not a gate.
  2. **A test that supplies a credential the way the honest caller would cannot tell you whether a
     dishonest caller could supply it too.** Adversary-shaped fixtures, not just happy-path ones.
  3. **A hole closed twice is a hole whose SHAPE you have not understood yet.** Repair 2 fixed the
     instance the reviewer showed me — same-turn replay — and I treated the class as closed. The
     class was "the model can obtain a redeemable key", and the second review found the other way to
     obtain it in an afternoon. When a fix is scoped to the exact reproduction you were handed, ask
     what the reproduction was an INSTANCE of before calling it done.
  4. **The live catalogue is the source of truth about the live database, not the migration
     history.** Extending the audit trail, I read the migrations, found a tenant-agnostic
     `has_any_role(...)` on SELECT, recognised the §59 trap and wrote a migration justified by
     "any tenant admin can read every tenant's audit rows". Querying production first showed that
     is FALSE — a RESTRICTIVE `tenant_isolation` policy exists on that table that NO migration in
     this repository creates, and being restrictive it ANDs tenant scope onto every read. The real
     defects were different and smaller. A grep of `supabase/migrations/` is not a description of
     prod; the near-miss was shipping a security fix for a vulnerability that did not exist while
     the two that did went unnamed.
  5. **There are TWO system-prompt paths, and the one that matters is the default.** The first
     wiring of the operating memory reached only `FUNDING_SKILL_PROMPT` — the opt-in funding
     skill — while every tenant that has NOT opted in receives `buildNeutralCorePrompt`. So the
     memory landed for the vertical and not for the platform default: §2's exact failure shape,
     and invisible to any check that happened to drive a funding tenant. Both paths are now
     driven by separate checks. When adding anything to the prompt, ask which of the two you
     wired, then wire the other.
  6. **A retrieval that degrades to an empty result can be DEAD for months and look healthy.**
     Three vector searches raised on every call; every caller caught the error and returned `[]`,
     which is the right shape for a retrieval that must never break a conversation and is exactly
     what hid it. "Nothing matched" and "this cannot execute" are the same observation from
     outside. Anything that fails soft needs a check that distinguishes the two — the delivery map
     had INFERRED one of these was broken and inferred the wrong cause; driving it found the real
     one, and two more beside it.
  7. **A test fixture can lie in the direction that makes you feel safe.** The harness's
     service-role `clients` double answered for ANY id and ignored an `eq("tenant_id", …)` filter
     entirely — so every service-role tenant check appeared to pass whether the handler scoped or
     not. A check written against it went green while the handler had genuinely filed a note onto
     another tenant's client. Fixtures that emulate authorization must be at least as strict as
     the thing they emulate, or they grade themselves.
  8. **Mutation-test the fix, not only the feature.** Roughly 40 mutations were driven across this
     branch and they found FOUR vacuous tests — checks passing while reading an empty object, or
     because deleting the code under test made it throw instead of misbehave. Two of those were in
     the very tests written to prove this repair.

- **2026-09-01 — this document asserted that number search was shipped AND that it was the only
  remaining Twilio gap, in three places at once (PR #703 follow-up).** Recording a new capability
  in Section 4 without sweeping for the claims it contradicts produced exactly the failure a single
  source of truth exists to prevent: Section 4 (the Twilio integration header and its "Only
  remaining gap" bullet), Section 5 (the ❌ gap row) and Section 6 (task ledger #27) all still said
  search did not exist, beside a new entry saying it did. Anyone following the mandated daily
  protocol would have got two mutually exclusive answers depending on where they looked.
  **Corrected to what is actually true, rather than to "the gap is closed":** search by area code,
  region, city, digit prefix and toll-free is live, and purchase with it; letter-based **vanity**
  matching is NOT (`starts_with` is stripped to digits, and neither the UI nor
  `comms_search_numbers` exposes a raw Twilio `contains`, so no shipped caller can reach it), nor is
  **premium/registry** search. Task #27 rescoped to those two. Replacing an over-claim with the
  opposite over-claim would have been the same defect wearing different clothes.
  **On the sweep that missed it.** The PR adding the Section 4 entry reported "Section 5 checked for
  a now-stale comms gap: none present". The check ran; it searched `phone number` while the document
  says `phone-number`. One hyphen, and a verification statement that was true of what it searched
  and false of what it claimed. The dated 2026-08-09 entry recording the original narrow-gap
  rescope is deliberately left standing — it was accurate then, and this entry supersedes it rather
  than rewriting the audit trail.
  **The general lesson: an entry that adds a capability is not finished until the claims it
  falsifies are found, and a grep is only as good as its spelling — vary the separator, or the
  absence you prove is the absence of your own pattern.**

- **2026-09-01 — the outbound caller ID was decided by row order, and five defects got past a
  green gate (PRs #695, #699).** `tenant_phone_numbers.is_primary` chooses which number a
  workspace's calls and texts come FROM — `voice-twiml` and `send-message` both order by it — and
  **nothing in the repository had ever written it.** The only `SET is_primary = true` anywhere was
  on `public.businesses`, a different table. Measured on production before the fix: **2 active
  numbers, 0 primaries, 1 workspace** — so that business's outbound calls resolved to whichever row
  Postgres returned and could differ between two calls with no data change. Closed: 0 → 1 primary,
  1 → 0 ambiguous workspaces.
  **The lessons are about the PROOFS, not the code.**
  - **A predicate proof is not a write proof.** The review of #695 tightened the backfill's guard
    and demonstrated it by running the SELECT — with the guard it picks 1 row, without it 0 — and
    never ran the UPDATE. The UPDATE was the half that could fail: `uq_tenant_phone_numbers_primary`
    is `UNIQUE (tenant_id) WHERE is_primary` with no status predicate, so in exactly the state the
    new guard was written for, it aborts `23505`. Fixed in `20261020000000` by making the state
    unreachable (a BEFORE trigger clears the flag when a number leaves `active`) rather than adding
    a third guard.
  - **A schema is not a guard.** `comms_buy_number` marked `monthly_cents` required; tool calling is
    non-strict, so a model could omit it, the executor passed `undefined`, and the seam read that as
    the legacy UI path and bought the number with no price checked or shown. At `auto` there is no
    confirmation at all. The fallback copy — *"an amount Paige could not quote"* — was a graceful
    degrade written where a refusal belonged.
  - **A stable code, not prose.** `number_bought_but_record_failed: <db message>` was compared with
    `===` against the bare token, so on the one path where money had already left, the flag stopping
    Paige offering a replacement purchase was never set. The comment above it said "Carried
    DELIBERATELY", which is what made it look verified.
  - **Count the exits, then count them again.** The purchase audit helper's comment said three
    money-spent exits, already corrected once from one. There are four.
  - **A perturbation that changes nothing proves nothing, and looks exactly like a passing test.**
    Two attempts to break the new assertions came back green and were briefly read as weak
    assertions; both perturbations had simply not applied. Redone with byte offsets printed.
  Guarded by `scripts/comms-purchase-safety-smoke.mjs`, which drives the REAL handler and is wired
  unconditionally into CI — and was confirmed to have actually executed on the runner, since a step
  whose script path did not match would be silently green.

- **2026-09-01 — the tool catalogue is a VALUES list, so the LAST migration decides what the
  operator can switch off (PR #695).** `list_tool_autonomy` re-declares its whole catalogue on every
  touch. A branch whose catalogue migration sorted BEFORE two that landed on main while it was open
  would have installed four governed `Comms` rows and had main's later migrations drop them again —
  leaving a **paid action governed-but-invisible**, with `lint:tool-catalogue` green throughout,
  because the lint reads the last declaration and would have found them absent there. Caught only
  because `capabilities.v3.test.tsx` conflicted and, resolved on arithmetic, then failed. Rebuilt at
  a timestamp that sorts last. **When a migration REPLACES rather than adds, its position is part of
  its correctness.**

- **2026-09-01 — this document went unupdated across four merged PRs (#692, #693, #695, #699).**
  §0 binds the master reference to the SAME PR as the ship. Those four updated
  `docs/doctrine/tier-matrix.md` (§66) instead and treated it as sufficient. §0 and §66 bind
  DIFFERENT documents, and this is the one that answers *"do we already have this?"* — so the entire
  Solo comms capability was absent from it while being live in production. Recorded here rather than
  quietly backfilled, because the failure mode is the doc silently lagging reality.
- **2026-08-30 — the honesty of a compliance surface rested on nobody exercising a policy
  (PR #672, owner-approved).** `tenant_a2p_registrations`' RLS UPDATE and INSERT policies are
  row-scoped with **no column restriction**, so a tenant admin could set `submitted_at` and a
  brand SID straight through PostgREST and make the surface render *"Submitted for review —
  you'll be notified the moment it's approved"* for a registration nothing was ever sent for.
  An earlier commit of mine called `submitted_at` "the discriminator only a real submission
  path may set"; that was true of every shipped code path and **not enforced by the database**.
  `20261004030000` closes it: a SECURITY INVOKER trigger fails closed for every direct caller
  on the eight submission-owned columns, INSERT as well as UPDATE. **The general lesson: "no
  shipped path does this" is a statement about today's code, not a property of the system —
  if a claim about what cannot happen is load-bearing for honesty, enforce it where the data
  lives.**
  **And a partial enforcement invites the same mistake one column over.** `030000` protected
  the eight submission columns and left the seven DRAFT columns unconditionally editable by a
  direct caller — saying so in its own header — so an approved, carrier-linked registration's
  `sample_messages` could still be rewritten while the tab said its copy was locked.
  `20261004040000` freezes those seven once `a2p_registration_is_immutable(old)`. A review
  then executed a rewrite of `id` and `created_at` on a frozen row and it SUCCEEDED, orphaning
  the `paige_audit_log.target_id` link; `20261004050000` freezes those at all stages. **Count
  the columns the guarantee claims to cover, then count the ones the guard names. Twice here
  the difference was where the hole was.**
  **A third time, in the reason given for the last omission.** `050000` left `tenant_id` out
  because the update policy's `WITH CHECK` "already refuses a NULL or foreign value" — true of a
  tenant admin, false of a platform operator, because that policy reads
  `is_platform_owner() OR (tenant_id = … AND …)`, which is true for an operator whatever the
  column holds, so the tenant_id test can never refuse their write. That is the disjunction's
  truth value, not a claim about an evaluation order PostgreSQL does not guarantee. A review
  measured an operator both NULLing and reassigning a carrier-approved registration, which moves
  a live `messaging_service_sid` onto another business with no audit row — carrying the same
  qualification the tier matrix and the capability map carry: the reassign lands only on a tenant
  that holds no registration of its own, because onto an occupied one the unique constraint
  refuses the write first. That is why the proof pins the refusal HINT rather than the refusal
  alone; "refused" by itself would pass with the guard deleted. `20261004060000` closes it.
  **A delegation is a claim about the thing you delegated to — check that thing, do not restate
  what you assume it does.**

- **2026-08-30 — a durable write turned a dormant lie into the default (PR #665).** `A2PTab`'s
  banner and status pills keyed on *"a row exists with no carrier SID"* and rendered **"Submitted for
  review — you'll be notified the moment it's approved."** That was survivable only while nothing
  wrote the row. The same PR made the draft save durable, writing exactly that shape
  (`status='pending'`, no SIDs), so the false claim went from unreachable to the **normal result of
  clicking "Draft with Paige"** — on a compliance surface, over a registration nobody had filed, with
  no mechanism that could ever notify anyone. Corrected to key on `submitted_at`, which no shipped
  path sets. **The general lesson: making a backend honest is incomplete until whatever RENDERS it is
  re-checked against the new reality.** A copy string that was true under the old behaviour is not
  automatically true under the new one.

- **2026-08-30 — a migration version collision would have skipped a migration on prod, silently
  (PR #665).** #666 landed `20261004000000_analytics_evidence_bundle.sql`, sharing a version prefix
  with #665's migration — the only duplicate across 836 files. `supabase_migrations.schema_migrations`
  is keyed on the VERSION, and `db push` applies only versions it lacks, so the second migration would
  never have run on production while CI, the `db-live` tag and every badge stayed green — and the edge
  functions, which do deploy, would have called a function that was never created. The clean replay
  cannot catch this: it iterates FILES and dedupes only the recorded row, so both run locally.
  **Check the migration version namespace on every re-ground**; renamed to `20261004010000`.

- **2026-08-30 — "all assertions passed" said nothing about the fix it was written for (PR #665).**
  Three separate times a green proof measured something other than what it named: negative cases
  passed an empty sample array so validation refused them before the guard under test ran; the
  anonymous-caller case ran as `anon`, which holds no EXECUTE grant, so the grant refused it and the
  in-body check was never reached (§59 inverted); and reverting the entire owner-locked D2 concurrency
  mechanism left every assertion green. Also: a structural pin on function TEXT was defeated by a
  rewrite that kept the matched literal and added a redirect one line later, scoring 13/13 while
  running a full cross-tenant IDOR. **Boundaries are measured, never described** — every trace a
  foreign caller could leave, plus the RETURN VALUE, since a read-only escape writes nothing.

- **2026-08-28 — a Clients subtab must not grow a second Clients header.** Solo Conversations owns
  only the canvas below the shared `People · Conversations · Calendar · Portal` strip. A route-local
  “Your client book,” “Client conversations,” status banner, or decorative hero duplicates the shell,
  consumes the form-fit budget, and violates the owner-approved hierarchy. Regression coverage now
  forbids those labels in the Solo Conversations mount and scopes ancestor-chrome suppression to the
  Conversations descendant only; People-owned wrapper files remain untouched.

- **2026-08-18 — "latent structural weakness rather than a confirmed live leak" was too optimistic.**
  `docs/doctrine/role-taxonomy-and-matrix.md` §4 hedged that most reads also filter by tenant via RLS,
  so the mis-scoped global grants were a latent weakness. **R1 found a LIVE platform-seam escalation**
  (`paige_workflow_registry`: 23 platform rows, PERMISSIVE `cmd=ALL`, guard collapsing to a global
  `admin` held by ~every tenant owner). The taxonomy doc's caveat that this "is not proven safe
  either — that is exactly what the audit must establish per call site" was the operative half; the
  reassuring half was wrong. Corrected by R1 + fixed by R2a in the same PR.


Things Cowork/CC/Codex have claimed that the codebase disagrees with. **Never remove entries** — mark as reversed/resolved but keep the record. **CC's code check is authoritative.**

- **2026-08-17 · Route + URL Taxonomy authored (§65, docs-only) + `/admin` 4-way-overload correction + §-numbering decision.** The owner ruled the Route + URL Taxonomy (2026-08-17): `/admin` was the login target for FOUR account types at once (Solo + Sub-account + Agency + God), which is why the agency owner kept "landing on the same page" — a **naming-debt** defect (one internal route overloaded across four user mental models), NOT an auth bug. Authored `docs/doctrine/route-and-url-taxonomy.md` (the §18 one home) with the LOCKED 6-row matrix (Operator `/operator` · Agency `/agency/{account}` · Enterprise `/enterprise/{account}` · Solo `/solo/{account}` · Sub-account `/business/{account}` · Client `/portal/:tenantSlug`), per-account unique numeric URL (net-new `account_number`, address-NOT-grant), shared-shell design (solo+business one shell; agency+enterprise one shell + Enterprise customizations, §60), producer blast-radius, and the staged redirect-safe migration order (R0 substrate → R1 Operator → R2 Agency+Enterprise[folds the `agency_login_default='last_account'` workaround revert] → R3 Solo+Business → R4 retire redirects). **TWO RULINGS LOCKED (owner, 2026-08-17):** (1) **`account_number` = offset/scrambled** — a random unused 7-digit number (reveals no tenant count or signup order in URLs), NOT raw sequential; permanent per account for life (survives tier promotion, vanity edits, redirects). (2) **Act-as URLs are actor-namespaced** — `/operator/act-as/{n}/{branch}` and `/agency/{n}/sub/{subN}/{branch}` encode the ACTOR, so §51 impersonation audit + Paige's §32.c self-awareness read straight off the URL. Both firm; do not re-open unless a §32.c live-drive surfaces something the design doesn't survive. **R0-substrate BUILT** (CI-deploys on merge; §32.b persisted-apply confirm owed): `src/lib/routing/tierBranches.ts` (config-as-data route-tree registry) + migration `20260916000000` (`account_number` column + generator + assign-on-insert trigger + 13-tenant backfill; §32.a proof green + rolled back). **URL-segment refinement (owner, same day):** born NUMERIC at creation (`account_number`, permanent — don't assume the owner's name spelling/branding at signup), then a **self-serve vanity-URL editor** inside the account lets them switch the segment to their name/company; the resolver accepts either, with uniqueness + reserved-word denylist + old→new 301 grace (§58) + the number always still resolving; §10-callable so Paige can rename it too. Tracked as its own implementation slice. **UNIFORM-BACKFILL ruling (owner, same day):** treat EVERY existing account as brand-new — the R0 backfill assigns a fresh `account_number` to every account on the platform by the same rule a new signup uses, with ZERO grandfathering of any current slug / vanity URL (owner: *"I don't care who has a current vanity URL… treat every single account as if they are a brand new account."*); anyone wanting a vanity sets one via the editor after the numbering is live. Removes all "grandfather existing slugs" complexity from the migration. **§-numbering DECISION:** the CLAUDE.md naming-consistency anchor took **§65** (next free anchor; §66 free, §67 reserved for Paige self-knowledge / task #159) — PROPOSED wording, owner ratifies exact text in a later pass (same pattern as §57–§64). **SCOPE (owner-ruled):** this is a **docs-only** PR — taxonomy + matrix + migration order ONLY, **ZERO code renames**; the owner reviews the taxonomy + migration order BEFORE any code-rename slice fires (§58 old routes stay redirect-alive through the whole migration). Anchoring naming-debt cases logged in `docs/brain/lessons-learned.md` §15: (a) Solo vs `account_type='standalone'`, (b) "PME Enterprise"-in-name vs `account_type='agency'` (owner: "PME is NOT an Enterprise account 😂"), (c) `/admin` overload. Cross-refs §36/§51/§56/§60/§61/§9/§58/§18.
- **2026-08-16 · Solo shell activation red-lines FIXED (merged #505) + §57 runtime toggle + FIRST canary activated.** The faithful-port shell (#503) carried three doctrine red-lines that blocked activation; owner ruled "CC fixes it all now." Fixed + merged (PR #505): **§63** — all owner-real-account fixtures anonymized to a fictional identity (Antonio Cook→Jordan Avery; Project Mogul Enterprise/Mogul Maker Academy→Meridian Advisory; setup entities→Meridian Advisory LLC/Meridian Coaching/Meridian Holdings LLC; "Provided by Project Mogul Enterprise"→"Provided by Northwind Partners"; vendor→Northwind Partners); re-grep = zero. **§2** — marketplace hero is now coaching-generic; funding survives ONLY as one opt-in Playbook card (`state:'get'`), never a default; re-grep = zero finance-default copy. **§57** — the `Admin.tsx` mount was converted from the build-time `VITE_SOLO_SHELL_ENABLED` env flag (tier-wide, un-canary-able, un-flippable) to a **runtime per-tenant flag `tenants.features.solo_shell_enabled`** read via `useTenantContext` from the ACTIVE tenant's own features only (§51/§9-safe); strict `tierKey==='solo' && soloStandalone` gate preserved (Super-Admin/God keeps its own SEPARATE design — owner-ruled 2026-08-16 — and can never render this shell; an operator has `activeTenantId===null` ⇒ flag false). Also: button-in-button nesting fixed + ⌘K wired to a real keydown handler. Verified: §39 adversarial diff read + §32.c headless render drive of the anonymized `<SoloApp/>` (14/14 surfaces, 0 pageErrors; home/marketplace/setup visually confirmed). **CANARY (owner order: empty → `mogul-credit-company` → `first-sterling-capital` LAST):** `paige-operator-workspace` (d1f0a7e2, empty, §63-sanctioned) ACTIVATED via DB flag 2026-08-16. **The two REAL tenants are HELD (§58/§13):** the shell is still FIXTURE-ONLY (zero supabase/tenant-data reads in `src/solo`), so activating a real account replaces its owner's real dashboard with the fictional Jordan-Avery/Meridian mockup — a §58 capability-hiding regression that requires explicit owner acknowledgment before flipping `mogul-credit-company`/`first-sterling-capital`. Data-wiring the shell to real tenant data is the tracked next phase. **§32.c HONEST caveat:** the authenticated PRODUCTION render was NOT driven headless (SSO/auth limit) — proven by the fixture drive + DB-flag verification; the live authenticated look is owed to an owner live-drive or a Cowork/Chrome drive.
- **2026-08-16 · Solo shell faithful port BUILT (merged #503) + §51 tier-design CORRECTION.** The Claude Design "Solo workspace" pack was faithfully ported into `src/solo/**` (13 fixture-data screens incl. Calendar+webinars) and mounted as a flag-gated (`VITE_SOLO_SHELL_ENABLED`, default OFF) `Admin.tsx` takeover for STRICT solo-standalone tenants only. **CORRECTION (owner-ruled 2026-08-15):** the earlier Cowork reading that *"sub-accounts inherit the Solo shell verbatim per §60"* is **REVERSED**. Claude Design leads the UI for **every tier independently** — Solo is Solo, sub-account/Agency/God each get their OWN design pack (owner-gated, handed over separately). §60 same-tier parity now governs **feature availability** (what capabilities exist), NOT **visual/interaction design** (which derives per-tier from Claude Design's canonical mockup per tier). The Solo mount therefore gates on `tierKey==='solo' && soloStandalone` and can NEVER render for sub-account/Agency/Enterprise/God. **HONEST state (§13):** BUILT + merged + flag OFF = live-capable but NOT activated — prod render is byte-unchanged (§58, lazy code-split); the shell shows fixture data (real data wiring is a later phase) and activation + the §32.c live-drive of the auth-gated shell are **owner-gated** (canary: empty tenants → `mogul-credit-company` → `first-sterling-capital` LAST, it has real data). §63 faithful-port lint exemptions scoped to `src/solo/**` only.
- **2026-08-15 · Task #126 Slice 3b BUILT — `browse_public_url` skill + interpreter public-browse dispatch + tenant-scoped `paige_browser_usage` write; TWO §13 corrections + one §18 producer-scope decision.** The 3b build wired the Slice-3a `/browse-public-url` endpoint into a real Paige skill (own PR). Corrections logged per §0/§13:
  - **CORRECTION 1 (the build brief's `category: research` is INVALID).** The Slice 3b brief specified `category: research` for the skill. That value does **NOT** exist in the 12-value canonical `paige_skills` category enum (locked by `paige_skills_category_canonical_chk`, migration `20260830000000`): vision_strategy · client_delivery · sales_growth · marketing_content · documents · analytics_interpretation · team_management · financial_ops · compliance_legal · operations_process · agent_orchestration · superpowers. Seeding `research` would throw the CHECK at apply time. Reading a public page is an operations/quality mechanic → **`operations_process`** is the correct best fit (same bin as `verify_deployed_surface`). The §32.a proof re-confirmed the row inserts cleanly under `operations_process`.
  - **CORRECTION 2 (§18 producer scope — the brief's per-surface producer list resolves to ONE audited home, not three forks).** The brief listed `paige-ai-chat` + `subagent-market-research` + `paige-mcp` as producer surfaces to wire. The §18/§30 diagnostic found the ONE audited producer already exists: `run_skill` (paige-mcp → skill-runner → interpreter) is generic and already forwards the server-resolved tenant + `invoker_user_id`, so `browse_public_url` is reachable + writes its `paige_browser_usage` row the moment it seeds, with **zero per-surface code**. Forking a direct `/browse-public-url` call into paige-ai-chat or a subagent would **bypass the audit write (§9) and fork the host seam (§18)** — a regression, not a deliverable. So the producer wiring is the generic path (done); exposing skills in the primary `paige-ai-chat` inline tool loop is a broader capability (all seeded skills, not just browse) DEFERRED to its own slice + §32 pass. `subagent-content-drafter` remains owner-ruling (deferred). §37-honest: `pickBrowserStep` now excludes `mode:"public"`, which no existing seeded skill uses → `verify_deployed_surface` byte-unchanged (§58).
  - **Verification GREEN:** 35 unit tests, tsc 0, `lint:{views,definer-fns,tier-features}` clean; §32.a rollback proofs on prod (skill + Trust Compass row + audit-write shape, all rolled back); §39 peer-gate ran on the real diff. §32.a persisted-apply + §32.c live-drive OWED post-merge (no Deno to type-check edge files here — #142; no browser to drive — §32.c capability-conditional).
- **2026-08-12 · Task #126 Slice 3a BUILT — SSRF-hardened primitive + Phase-1 denylist + wildcard flag (OFF) + `paige_browser_usage` rail; TWO §13 corrections to the build paste.** The 3a build shipped the D1=(c) safety net (own PR, code-only + one migration). Along the way it corrected TWO inaccuracies in the Cowork build paste — logged here per §0/§13:
  - **CORRECTION 1 (guard was NOT "localhost-only").** The paste's premise — *"Slice 1's guard only blocks localhost… extend to block private ranges / 169.254 / IPv6 / mapped"* — was **wrong**. CC's read of `services/paige-browser/server.js` (the §30 diagnostic) proved the base guard **already** blocked all private IPv4 (10/172.16/192.168), loopback (127/::1), link-local + **cloud-metadata `169.254.169.254`**, IPv6 ULA/link-local (fc00::/7, fe80::/10), the `::ffff:` dotted IPv4-mapped form, and enforced an http(s)-only scheme allowlist, PLUS a per-request `page.route` interceptor + a post-redirect `final_url` re-check. So 3a is an **extension** (§18/§30), NOT the from-scratch SSRF build the paste implied. What 3a genuinely ADDED: granular **reason codes** (`ssrf:link-local:metadata` etc. for the audit rail), the missing **reserved/broadcast/multicast** ranges (0/8, 224/4, 240/4, 192.0.0.0/24, TEST-NETs, 198.18/15), the **6to4 / NAT64 / hex-IPv4-mapped** embedded-v4 tunnels, and the two-layer content denylist + wildcard flag. The numeric-encoding bypass class (decimal/hex/octal/short-form) was **already closed** by WHATWG `new URL()` normalization — verified, not re-coded (locked by `smoke-ssrf.mjs`). The guard was extracted to a shared `ssrf-guard.mjs` (§18 one home; the smoke tests the REAL code, §32) — the consolidation seam for #138 (the guard is still duplicated in `visual-renderer`).
  - **CORRECTION 2 (the Fly host does NOT write the audit row — the caller does).** The paste's D4 said *"paige-browser writes via service role."* That **contradicts** the host's deliberate, owner-signed-off **DB-free** architecture (`server.js` lines 16-19: the host holds NO Supabase creds; the ledger write + tenant-scope resolution live in the CALLING edge function). Reversing it would be a real §9 regression — an SSRF/RCE on the browser host would then reach a service-role DB key. So 3a keeps the host DB-free: it returns a structured `blocked_reason` + timing, and the **`paige_browser_usage` table + RLS ship now** (the operator audit rail, per the brief) while the **row-WRITE is wired in the Slice 3b caller** where `tenant_id` is resolved from the verified JWT (§9/§53). Consequence (§37-honest): in 3a the table has **zero writers yet** and the `/browse-public-url` endpoint has **zero producers** until 3b's skill lands — both are correct-by-design, not a gap.
  - **Denylist strategy (owner-ruled 2026-08-12), two-layer defense-in-depth:** **Layer 1** = Cloudflare for Families (`1.1.1.3`/`1.0.0.3`) set as the container resolver via a Dockerfile entrypoint — a category-blocked domain resolves to `0.0.0.0`, which the guard's `0.0.0.0/8` rule already denies (reason `denylist:cloudflare-families`); **Layer 2** = a StevenBlack/hosts snapshot baked into the image (`fakenews-gambling-porn`), parsed into a Set, parent-domain matched (reason `denylist:stevenblack`). Neither is hand-rolled (§14). **HONEST caveat (§13):** Layer-1's live efficacy depends on Fly honoring the resolv.conf rewrite — the §39 **live** peer-gate (a Families-blocked domain against the DEPLOYED host) is the gate that confirms it; if it fails, the fast-follow is a Node Families resolver. Layer-2 + the private-IP guard are code-reliable regardless. **Roadmap forward:** Phase 2 = per-tenant declared denylist (NextDNS-style) = Slice 3e (deferred); Phase 3 = enterprise-tier = a later unnamed slice.
  - **Wildcard stays OFF (§32.c):** `PAIGE_BROWSER_WILDCARD_ENABLED` defaults false; `/browse-public-url` refuses any non-`paigeagent.ai` URL with 403 `capability_disabled` until an owner flips it AFTER the live peer-gate returns SHIP. `/self-verify` (Slice 2) is byte-unchanged (§58). Headless proofs GREEN: 60 SSRF-guard cases (exact reason codes, incl. numeric-encoding + userinfo normalization + denylist fixture) + the §32.b migration proof. OWED to the §39 LIVE peer-gate: the real deployed-host proofs (metadata IP denied, redirect-to-private, Families sinkhole, positive control) — not claimed headless.
  - **§39 peer-gate ran ITERATE (independent adversarial read of the real diff) — 3 findings, ALL fixed before merge:** (i) **HIGH** — the append-only *immutability trigger* would also fire on FK **CASCADE** actions, making a browsed tenant un-offboardable + an authoring user un-deletable (§38/GDPR). Fixed: dropped the trigger; append-only is now enforced at the **grant level** (REVOKE UPDATE/DELETE from every role — cascades are system-privileged and bypass grants), matching the `paige_llm_trace` precedent. Re-proven (§32.b): `triggers=0·grants=[authenticated:SELECT, service_role:INSERT+SELECT]·service_role INSERT ok·service_role DELETE blocked·rolled back clean`. (ii) **LOW-MED** — the wildcard flag gated only the INITIAL host, so a `*.paigeagent.ai` open-redirect could run the wildcard capability while OFF. Fixed: `browsePublic` now re-asserts `WILDCARD_ENABLED || isSelfTarget(finalHost)` on the post-redirect host, not just the SSRF/denylist guard. (iii) **MED §13** — comments/README claimed the denylist is "refreshed weekly by CI," but that workflow doesn't exist yet. Fixed: copy corrected to "build-time snapshot, refreshed on image rebuild"; the scheduled weekly refresh is filed as task #151. Confirmed clean by the peer-gate: SSRF guard (no reachable-internal bypass across the full matrix), `/self-verify` §58, migration RLS §9/§53, §2/§3/§50 copy.
- **2026-08-12 · Task #126 Slice 3 SCOPE RATIFIED (owner ruling) — public-web browsing, D1 = wildcard+denylist (owner OVERRODE the "never (c)" recommendation).** Slice 3 extends the paige-browser primitive from the fixed `paigeagent.ai` self-verify to **arbitrary public URLs** (research on a tenant's behalf, verify tenant-owned surfaces). It introduces **real new risk classes** the earlier "same pipe, wider allowlist, no new risk ground" framing UNDERSTATED — SSRF, URL injection, content leakage, cost blowout, cross-tenant surface. Owner's ratified scope:
  - **D1 = (c) WILDCARD + DENYLIST — owner-ruled OVERRIDE of the Cowork recommendation (which was D1=(a) platform-only / "never (c)").** Owner's rationale: *research-assistant capability requires open-web access; an allowlist would bottleneck the product before value shows.* **Mitigations owner attached (all binding):** (1) Slice 3a full SSRF hardening ships as a **HARD PREREQUISITE**; (2) the wildcard capability stays **feature-flagged OFF until the 3a §39 peer-gate returns SHIP**; (3) the denylist is **sourced from a maintained third-party categorization service** (Cloudflare for Families `1.1.1.3`, OpenDNS FamilyShield, NextDNS, or a maintained public blocklist like StevenBlack/hosts) — **NOT hand-rolled** (the point: someone whose full-time job is maintaining it keeps it current).
  - **D2 = RATIFIED** — a NEW `browse_public_url` skill (one URL in, read-only structured content out); leaves `verify_deployed_surface` untouched (§58).
  - **D3 = RATIFIED** — structured JSON default; optional `include_screenshot` flag **reuses the already-deployed `visual-renderer` service** (§18 one home, cheaper than adding screenshot code to paige-browser).
  - **D4 = RATIFIED + TIGHTENED** (because D1=(c) removes the natural allowlist ceiling) — per-tenant rate limit (**conservative, ~60 calls/hr default**), 30s hard per-request timeout, `paige_browser_usage` log up front (§17 Engine-2 metered rail). Reason: open web means a "check my top 100 competitors" prompt could burn a thousand Fly minutes fast.
  - **Sub-slicing RATIFIED:** **3a** (SSRF-hardened primitive — migration-free, code-only; the wildcard flag is OFF at merge) → **3b** (denylist + `browse_public_url` skill) → **3c** (cost/concurrency ceiling); **3d** (per-tenant allowlist authoring, i.e. the original D1(b)) **DEFERRED**.
  - **3a peer-gate = LIVE PROOF, not unit tests (§32.c):** `169.254.169.254` (cloud-metadata — the credential-leak gate; a *silently-succeeding* fetch is a FAIL), `10.x`, `127.0.0.1`, `file://`, and a **hostile-DNS-resolves-to-private-IP-mid-redirect** must ALL return **DENIED** against the ACTUAL deployed paige-browser, not a mock. Resolve-to-IP FIRST, re-check on every redirect. (DNS-rebinding hardening is also tracked as #138 across BOTH browser services.)
  - **§13 honest note for the builder:** the existing paige-browser SSRF guard is already non-trivial (private IPv4 + link-local/metadata + CGNAT + IPv6 ULA/link-local + scheme allowlist + a `page.route` per-request re-check + post-redirect `final_url` re-check) — 3a EXTENDS/HARDENS it (adds the third-party denylist, the feature flag, and closes any remaining gaps incl. DNS-rebind), it does NOT rebuild from zero (§18/§30). Cross-refs: §9, §13, §17, §18, §32.c, §34 L1 (log every browse), §37, §39, §58, §64.
- **2026-08-12 · Task #126 stale-pricing = BRANCH A (live-site defect), §32.c integrity REAFFIRMED + a §39 miss owned → killed the §18 duplication at the root.** The owner caught that `verify_deployed_surface` returned STALE pricing ($27/$67/$297 "Founding Beta") on `https://paigeagent.ai` — the one thing wrong; hero/security/CTAs current. A full Branch-A vs Branch-B diagnostic + an INDEPENDENT §39 peer-gate (a second agent that re-derived from scratch + ran its own live fetch) confirmed **BRANCH A: a live-site content defect, NOT a live-drive integrity defect.** Proof: `paige-browser` has ONE content source — `page.goto(url)` (no mock/fixture/cache/URL-rewrite; the Fly image copies only `package.json`+`server.js`); the stale figures existed **nowhere** in the repo or the deployed React bundle (which carried current `$149/$397`) — ONLY in the live-served `index.html` static skeleton inside `#root`, which a `networkidle` headless read resolves against BEFORE React (createRoot) clears `#root`. The decisive tell eliminating Branch B: `paige-browser` could only have obtained `$27/$297` by *actually fetching live prod*. **§32.c GREEN HOLDS — the tool's first live use CAUGHT a real defect; Slice 3 was never compromised.** **The real §39 miss belongs to PR #280** (it changed pricing in `src/components/landing/PricingSection.tsx` but left the DUPLICATE `index.html` skeleton stale — a §18 two-homes drift no peer-gate caught until the owner did). **Owner ruling (2026-08-12): KILL the duplication, don't sync-and-guard.** Fix (this PR): (i) **de-duplicated** the skeleton — it now carries only stable SEO copy (hero H1 + value-prop + CTA), all product content in React alone; (ii) **tightened the Slice 2 selector** — `verify_deployed_surface` now waits on `[data-app-ready]` (a React-only post-hydration marker), never `h1` (which the skeleton also had), so a skeleton false-positive is structurally impossible — this is the deeper **verdict-strength lesson**: the earlier "GREEN" could reflect skeleton content because the wait predicate was too permissive; (iii) added `lint:skeleton` CI guard (any-duplicated-content whitelist, §24) so the leak class cannot recur. Verified: build green, guard passes clean + fails on injected drift (red-then-green), marker present in `main.tsx` and absent from `index.html`, migration JSON valid.
- **2026-08-12 · Task #126 Slice 2 reached §32.c GREEN — the Playwright caret-drift bug + three §13 corrections.** After the operator-tenant fix (below) landed, Cowork's live-drives still infra-blocked; the honest verdicts named a Playwright/Docker version mismatch, and the owner then drove `https://paigeagent.ai` through `verify_deployed_surface` end-to-end and got **real live content** (full hero, pricing table, security copy, CTAs) — **§32.c GREEN, no further post-deploy scan owed.** Three §13 corrections logged: **(a) OVER-CLAIM (Cowork):** an earlier "redeployed cleanly" was asserted on a `/healthz` 200 alone — which proves the *service* is up, NOT which Playwright version the *container* actually runs. The real defect (npm 1.62 vs image 1.48) only surfaced on the live browser launch. Lesson: healthz-200 ≠ correct-container-version (the container twin of §32's "compiled ≠ ran"). **(b) ROOT CAUSE:** both browser services pinned `"playwright": "^1.48.0"` (a CARET), so the Fly build resolved npm to the latest 1.x (~1.62) while the Docker base stayed `v1.48.0-jammy`; Playwright 1.55+ launches Chromium via a `chromium-headless-shell` binary the 1.48 image does not ship → launch failed on three live-drives. Fix: EXACT-pin the npm package = base image, in lockstep, so a caret/Dependabot bump of one side can never re-open the gap. **(c) SELF-CORRECTION (CC, this session):** PR #494 (my earlier merge) pinned `1.56.1` — reasoned as the repo-canonical version — but Cowork had already deployed + the owner PROVED `1.62.1` working LIVE, so the repo (`1.56.1`) briefly diverged from proven prod (`1.62.1`). Corrected here: the repo is aligned **UP** to the proven-live `1.62.1` across ALL THREE pins (root live-drive devDep + both Fly services + both `v1.62.1-jammy` base images) — §18 one-canonical-version preserved (the root has no committed lockfile and CI uses `npm install`, so the root bump is `npm install`-safe). The repo now matches what is deployed and proven. **Slice 3 (public-web browsing) is GREENLIT** — same pipe, wider allowlist, no new risk ground. (NOTE: the `docs/doctrine/paige-c-suite-roster.md` "both added" merge conflict the handoff flagged is COWORK-environment-local — `main` is clean, no conflict markers here — so nothing in the canonical repo needs resolving; flagged to the owner separately, untouched per §28.)

- **2026-08-12 · Task #126 Slice 2 §32 CONFIRMED + §32.c live-drive exposed a platform-scope tenant-resolution gap → operator-workspace hotfix (PR #492).** FIRST, resolving the entry below: **Slice 2's §32 persisted-apply is CONFIRMED on prod** — `schema_migrations` advanced to `20260912000000`, the `verify_deployed_surface` row is live with the correct gating fields (`auto`+`read_only`, browser step → `https://paigeagent.ai`), and `git diff db-live..HEAD` is empty (zero drift). Then Cowork fired the §32.c FIRST FULL-LOOP live-drive (`run_skill verify_deployed_surface`) — Paige returned an HONEST `cancelled` / `tenant_unresolved` (textbook §13 honest-degrade, not a fabricated verdict), which SURFACED a real gap before Slice 3 could multiply it. **§30 scout diagnosis (two compounding defects; the interpreter/`run_skill`/§200-resolver chain was otherwise correctly built):** (1) `admin_app_settings.platform_operator_tenant_id` pointed at a **§200 PHANTOM** tenant (`94af805c…`, no such row) — the resolver correctly failed closed to null; (2) `paige-mcp actorTenantId()` only fell back to `platformOperatorTenantId()` on the platform-KEY branch, so the sole operator (`admin@paigeagent.ai`, a tenant-less super_admin USER — `active_tenant_id` null, 0 memberships) resolved null → `tenant_unresolved`. **Fix (owner-ruled 2026-08-12: create a dedicated operator workspace) — migration `20260913000000`:** a coaching-generic, top-level **standalone** `Paige Operator Workspace` tenant with `features.system_workspace=true` (the established §57 system-tenant marker — excludes it from the managed-email connector + onboarding systems-check, and from fleet/revenue aggregates that honor the flag), re-pointing the setting at it (config-as-data; `DO UPDATE` required to replace the existing phantom row); plus `actorTenantId()` now falls back to the SAME resolver for a platform-**owner** USER with no tenant (§18 one home — non-owner tenant-less users still resolve null, byte-identical). **§1 crew: build + adversarial §39 peer-gate (SHIP — full 56-site `actorTenantId()` consumer inventory: NO cross-tenant leak, the only cross-tenant paths gate on `actorIsPlatformOwner()` not `actorTenantId()`, and the workspace is fresh/empty/childless) + compliance (SHIP — §2/§9/§51/§57/§200 clean).** **§32.a rollback proof RAN GREEN against prod** (`OPTENANT_PROOF exists=1 std=1 parent_null=1 sysws=1 setting_ok=1 → ROLLBACK_PROOF_OK`, all provisioning triggers fired without throwing, nothing persisted). **§32 post-merge persisted-apply CONFIRMED on prod (2026-08-12, PR #492 merged as `0b8bd563`):** `schema_migrations` at `20260913000000` (latest — zero drift, `git diff db-live..origin/main` empty), the operator workspace tenant is LIVE (`standalone`, `features.system_workspace=true`), `platform_operator_tenant_id` re-pointed to it (`d1f0a7e2…`, phantom gone), and BOTH pipelines green — deploy-migrations + deploy-edge-functions (the latter redeployed `paige-mcp` with the `actorTenantId` fallback, so Half A is live too). **STILL OWED:** Cowork RE-FIRES `run_skill verify_deployed_surface` → expects a real Fork-8 verdict on paigeagent.ai (the first true end-to-end proof of the whole browser wave). Follow-ups filed: the pre-existing L1549 `.eq("slug","mma")` fallback for non-owner tenant-less users (§63/§200 latent, task #147), and setting `owner_user_id` on the workspace for full operator dogfooding (#148). **Slice 3 stays BLOCKED until Cowork's re-drive returns a real verdict.**

- **2026-08-12 · Doctrine amendment PROPOSED (§63) — owner's real business accounts off-limits as agent example/default/suggestion targets; audit found ZERO example-misuse to scrub.** Owner ruled (2026-08-12) that Cowork + CC must NEVER use the owner's REAL production accounts — Project Mogul (agency), Mogul Maker Academy / MMA (sub-account), Antonio Daniel LLC (sub-account) — as an example tenant, default, suggestion, fork option, or negative-comparison target. Filed as **CLAUDE.md §63 PROPOSED** (extends §9/§57; go-forward CHOOSING rule, not a purge — legitimate historical audit/logic/portfolio refs are NEVER removed, §58). When an example/target tenant is needed, use the designated **Paige Operator Workspace** (§200 `platform_operator_tenant_id`), a fresh `test-tenant-*` row, or a placeholder. **A surgical repo-wide audit (docs + code comments + fixtures) found ZERO example-misuse to scrub** — every existing real-account reference is legitimate (real §13 corrections/decision-log/audit entries, real master-tenant gate LOGIC + migration names + data-fix migrations, real portfolio/architecture documentation, or meta-prohibition surfaces like the platform-independence sweep regex that must NAME the marks to enforce the ban). Two shipped-UI-copy hits (`BusinessCreditAdmin.tsx:49` "monitored MMA contacts", `ClientJourney.tsx` legal-posture copy) flagged as a SEPARATE §200 platform-independence concern (real account name in shipped copy — NOT example-tenant misuse), tracked as a follow-up, not scrubbed here (may be legitimate white-label copy). §-number is provisional (owner picks the final number, same PROPOSED pattern as §57–§62).

- **2026-08-12 · Task #126 Slice 2 — the FIRST self-verify skill seeded (`verify_deployed_surface`).** With the browser wave live (host + secrets + skill-runner redeployed), Slice 2 seeds a `paige_skills` row (migration `20260912000000`) that drives a DEPLOYED public Paige surface and reports the render HONESTLY — the §32.c owner-owed-walk killer, now a real capability. **The row IS the design (§18 — no interpreter/forge fork):** `category=operations_process`, `scoping=platform` (§61 default — god/solo/sub yes, agency resell, enterprise yes+resell; the #135/#481 fix runs it for tenants), `allowed_tools=['browser','anthropic']`, **`autonomy_lane=auto` + `risk_level=read_only`** (REQUIRED so the §16 gate lets the read-only browse actually FIRE), one `browser` step (fixed public url `https://paigeagent.ai`, `waitForSelector:"h1"` so SPA hydration doesn't cause a false FAILED, read-only asserts only), and a `reason_verdict` step. **Fork-8 reasoning in the row's description+anchor:** Paige COMPARES what she saw vs a correct render, names discrepancies, reports an honest loaded-correctly-vs-specific-problem verdict — never a render she didn't observe (§13). **§1 crew (build + adversarial/§51-tier verifier + compliance) — BOTH SHIP.** Applied 3 peer-gate fixes: added `waitForSelector` (false-FAILED guard), reworded §11/§36 dev-jargon ("app shell"/"render"/"response status") to plain coach language, and **RAN the §32.a proof myself against prod** (the migration had only promised it — §13). **§32.a GREEN (ran, rolled back, persisted_rows=0):** `new=1 cat_ok=1 browser_ok=1 lane_ok=1 risk_ok=1 scope_ok=1 wait_ok=1 steponly_ok=1 fin=0 jarg=0`. **OWED:** §32 post-merge persisted-apply (schema_migrations advances via deploy-migrations.yml) + the §32.c FIRST FULL-LOOP live drive (Cowork paige-mcp `run_skill verify_deployed_surface` → the browser actually navigates paigeagent.ai and returns an honest verdict). Follow-up (out of scope): url-from-input so the skill can target a tenant's own surface (a run parameter, not the fixed step url); authed surfaces are Slice 4.

- **2026-08-12 · Task #126 browser wave ACTIVATED end-to-end — Fly host live + secrets bound both sides.** Owner completed activation: `paige-browser` deployed to Fly (iad, 2 machines, `/healthz`=ok at `https://paige-browser.fly.dev`); `PAIGE_BROWSER_SHARED_SECRET` set on the Fly app; `PAIGE_BROWSER_URL` (=`https://paige-browser.fly.dev`) and `PAIGE_BROWSER_SECRET` (matches the Fly shared secret) set as Supabase edge secrets. (Owner destroyed a wrong auto-generated `paige-agent-ai` Fly app + closed PR #489 before the correct deploy.) **This PR redeploys `skill-runner`** (a real activation comment on `browseViaHost` triggers `deploy-edge-functions.yml`) so it reads the new edge secrets — the `browse` seam transitions `needs_config` → **live calling the Fly host** on the next self-verify skill run. **Slice 2 (#143) is UNBLOCKED** — seed the first self-verify skill (`autonomy_lane:"auto"`+`risk_level:"read_only"` so the read-only browse fires; §16 gate) + the Fork-8 reasoning prompt (Paige judges what she saw vs intent, not literal echo). **§32.c FIRST FULL-LOOP:** Cowork fires paige-mcp `run_skill` the moment Slice 2 lands — drives the self-verify skill end-to-end, confirms the browser actually navigates, reports the live-drive result to the owner (ends the owner-owed-walk pattern this whole wave exists to kill).

- **2026-08-12 · Task #126 Slice 1b SHIPPED — the interpreter's FIRST real tool-dispatch seam (browser).** The skill interpreter had ZERO tool-dispatch (`allowed_tools` was declarative-only, never executed — per §30 scout). Slice 1b (owner Fork 3) wires a `browser` dispatch that calls the Slice-1a `services/paige-browser` Fly host through the §16 clamp. **§18 clean:** injected a `deps.browse` seam into `InterpretDeps` MIRRORING `deps.forge` — the interpreter CORE stays pure + unit-testable; the actual outbound `fetch` lives in the HOST (`skill-runner` `browseViaHost` → `POST {PAIGE_BROWSER_URL}/self-verify`, `X-Browser-Secret:{PAIGE_BROWSER_SECRET}`, env NAMES only §34, honest `needs_config` when unset §13). **The dispatch block** (skill-interpreter.ts, between context-gather and `buildForgeIntent`): detects a `browser` step, **GATES on `allowed_tools.includes("browser")` — allowed_tools is now EXECUTED for the first time** (the owner's "reads allowed_tools for real"), consults the **§16 risk floor BEFORE navigating** (read_only+auto executes; `mutating`/`external_send` can NEVER run a browse under auto — forced approval via `resolveExecutionMode`, reused not forked), writes the `browser_use_sessions` ledger (`invoker_kind:"skill"`, insert `running`→update `succeeded`/`failed`, §9 scope via `related_contact_id` — there is NO `tenant_id` column), and folds the HONEST observation into `contextText` for the forge (never fabricated; honest `needs_config`/failed paths return before forge). **§32 PROVEN TO RUN (real, verified by CC):** a Deno smoke drives the ACTUAL `interpretSkill` (mock browse+forge, chainable mock admin) — 18/18 assertions incl. (a) browse called with the step url, (b) observation folded into the forge intent, (c) ledger insert+update with `invoker_kind:"skill"`, (d) `needs_config`→honest degrade before forge, (e) write-class risk gated (no browse, no ledger row, run lands approval); vitest 7/7 on the pure decision helpers. `deno check` on the 3 edited edge files = 6 errors IDENTICAL to pre-edit baseline (all upstream `model-router`/`prompt-forge`/`skill-runner:315`) → **ZERO new type errors**. **§1 crew: build + adversarial §39 verifier (SHIP, tier/§16/§9/§37 all hold) + compliance (SHIP).** Applied 2 non-blocking peer-gate fixes (screenshot b64 stored ONCE not twice; precise `invoker_kind` comment) + gitignored the `deno.lock` deno-check artifact. **SCOPE: the SEAM ONLY** — NO production self-verify skill seeded (that is Slice 2 — which must seed `autonomy_lane:"auto"`+`risk_level:"read_only"` so the read-only browse actually fires), NO write-class browser steps (paige-browser rejects them), NO deploy. **§32.c live end-to-end drive against a DEPLOYED paige-browser (PAIGE_BROWSER_URL/_SECRET set) OWED to the next capable session** — this headless session proved the seam vs a mock of the exact contract, not the live Fly service. §50 clean (0 hits, 5 files).

- **2026-08-12 · HOTFIX (beta-blocker) — Paige business-profile setup wired end-to-end, ALL tiers.** Owner live-drive (Antonio Daniel LLC sub-account): Paige DEFLECTED "set up my business profile" ("that's on you to set up") — §36/§7/§15 violation. **§30 scout root cause:** a TOOL-SURFACE GAP — the canonical write seam `update_tenant_branding` exists in `paige-mcp` (server-scoped, all-tiers) but `paige-ai-chat` has its OWN inline toolDefs and never calls paige-mcp, so no company/brand write tool was on the surface where the tenant talks to Paige; she honestly declined per the "no tool → say I can't" rule (`:3530`). NOT a scope bug (§588 already fixed), NOT a tier-feature gate, NOT an autonomy clamp. **FIX:** added inline `update_business_profile` to paige-ai-chat (§18 chat-surface TWIN of `update_tenant_branding` — SAME home: `tenants.name` + `tenants.brand` jsonb shallow-merged, no new table, no paige-mcp call-out), accepting company-detail keys (website/address/phone/legal_entity_name + existing brand keys); MUTATING_TOOLS confirm-gate (§16); admin/coach-gated; **tenant server-resolved from `personaCtx.tenant_id`, NEVER a tool arg (§9/§51 — sub-account writes ITS OWN tenant, God tenant-less degrades honestly)**; extended `_shared/brand-tokens.ts` + `buildBrandSection` to READ the new keys so the write→read loop closes (§13, not write-only); new BUSINESS PROFILE prompt block makes Paige DRIVE setup draft-first, never punt (§36/§7/§15). **§1 crew: build + adversarial/§51-tier verifier (tier matrix clean, no IDOR) + compliance (SHIP — real capability, not prompt-only).** §39 peer-gate CAUGHT a real bug the build missed: the audit insert used non-existent columns (`resource_type/resource_id/metadata`) — FIXED to the real schema (`entity/entity_id/data`) with a non-swallowed error log. **That peer-gate also surfaced a PRE-EXISTING latent bug** (crm_pipeline_change + crm_assign_coach audit inserts have the same wrong columns, silently failing) → scoped out to task #141. §2/§3/§11/§50 clean. **§32 TYPE-VERIFIED (real, not assumed):** installed Deno 2.1.4 in-session and ran `deno check` on all 3 edited files — the two `_shared` files are CLEAN (0 errors); `paige-ai-chat/index.ts` reports 14 errors that are BYTE-IDENTICAL in count to pristine `origin/main` (the pre-existing `logAnalyticsEvent`/SupabaseClient generic-mismatch baseline) → **my edits introduced ZERO new type errors.** IMPORTANT §13 correction to the CI picture: **`ci.yml`'s `verify` job does NOT type-check Deno edge functions** (`ci:tsc`/`build`/`test` are frontend-only; changed-file gates match `^src/**` only) — so a green `verify` would NOT have covered these edits; the in-session `deno check` is the real gate here, not CI. **§32.c runtime drive still OWED to Cowork's paige-mcp** (headless session can't drive the authed chat): drive "set up my business profile" per tier, confirm intake+write, no deflection. NON-blocker on this PR: the Supabase Preview `relation "profiles" already exists` failure is the pre-existing #275 migration-replay conflict (this PR adds NO migration).
- **2026-08-12 · Task #126 Slice 1a SHIPPED — `services/paige-browser` self-verify browser Fly service (PR #486).** New self-hosted, warm-browser Playwright service (`services/paige-browser/`) — the "eyes" Paige uses to self-verify her OWN deployed platform surfaces (the §32.c owner-owed live-walk killer). Cloned from the proven `services/visual-renderer` recipe. `POST /self-verify {url,…}` drives a URL headless → HONEST structured observation `{ ok, final_url, http_status, title, text_excerpt, screenshot_b64, steps, duration_ms }` (never a 5xx on nav/timeout/block; failure returns `ok:false` + visible-fallback screenshot + loud log). SSRF guard reused VERBATIM from visual-renderer (Fork 7, owner-signed-off): DNS-resolving fail-closed `hostIsPrivate` + `page.route("**/*")` on nav AND sub-resource + `final_url` re-checked public after redirects. Shared-secret timing-safe gate; unset secret fails closed (500). **DB-FREE by construction (§9/§34)** — no Supabase creds, no rows; ledger + tenant-scope live in the Slice 1b caller. Read-only steps only (`assertSelector`/`assertText`/`readText`); any click/submit/type/download REJECTED with an honest error (gated behind the §16 clamp later). Concurrency soft cap + nav/hard-cap/step timeouts (Fork 5 v1). §18: NEW home, distinct from visual-renderer (stateless screenshot) AND browser-use (Browserbase stub); SAME pinned playwright version (no third install). **§32 PROVEN TO RUN** — `smoke.mjs` green against real Chromium (exit 0; honest present→ok:true / missing→ok:false, no throw). §1 crew (build + adversarial verifier + compliance officer) — BOTH reviews SHIP, 0 blockers; applied 2 peer-gate hardening fixes (context null-guard vs setup-failure leak; bounded per-step/`evaluate` timeouts). **KNOWN ACCEPTED RESIDUAL (§13, task #138):** SSRF DNS-rebinding TOCTOU inherited verbatim from visual-renderer — NOT weakened here; to be hardened ONCE across BOTH browser services (never silent). **DORMANT until deployed to Fly + `PAIGE_BROWSER_SHARED_SECRET` set** — no live-app behavior change on merge. Scope: self-verify only, NO tenant auth (Slice 4), NO interpreter dispatch (Slice 1b — NEXT). §50 trademark-clean (0 hits). **CodeQL caught 4 high alerts the crew's verifier missed (a different tool — §39 layers, none alone sufficient):** 3× "externally-controlled format string" (user `url` in a `console.error` format-string position + 2nd arg) — FIXED (static literal format string, `url` as trailing arg); 1× `js/missing-rate-limiting` on `/self-verify` — added a REAL hand-rolled fixed-window per-IP limiter, but CodeQL's query only recognizes NAMED middleware (express-rate-limit) so alert #73 persists as a recognition-limitation (substance addressed; non-blocking — `mergeable_state=unstable`, only `verify` is required). Accepted residual folded to task #138 (adopt express-rate-limit across BOTH browser services, or dismiss with justification — owner-visible §14 dep decision).
- **2026-08-12 · Task #126 kickoff rulings — 8 forks resolved per CC recommendations.** Stack self-hosted Playwright on Fly (Browserbase stub stays honest fallback per §34); new `paige-browser` service cloned from visual-renderer recipe, NOT folded in (§18 one-home); interpreter reads `allowed_tools` for real, browser tool routes through `resolveExecutionMode` §16 clamp (read-nav auto, click/submit/download forced approval); **stepwise auth** (scoped test-tenant creds env-only for Slices 1–3, Vault-encrypted tenant credentials in Slice 4 — SSN-class encryption, approval-gated per action); Slice 1 self-verify targets Paige's OWN deployed platform surfaces first (the §32.c owner-owed-walk killer); server-resolved tenant scope + visual-renderer's DNS-resolving SSRF interceptor (owner explicit sign-off — the pattern that addresses the Antonio Daniel LLC seam concern, non-negotiable); honest `{ok,…}` reporting end-to-end PLUS Paige REASONS about what she saw (compare/contrast/weigh against context, not literal-eyes reporting). **Pricing/credit/billing model DEFERRED to a dedicated strategic session** — this wave uses only a v1 soft cap (N browses/tenant/day). Slice order: 1a paige-browser Fly service (host+SSRF+shared-secret+healthz, self-verify only) → 1b interpreter browser dispatch seam → 2 self-verify skill(s) → 3 public-web browsing → 4 tenant-authenticated browsing (Vault creds). Each slice: own PR, own §1 crew, §32.a proofs, §10 log on merge, §4 ship-on-verified.
- **2026-08-12 · Task #126 (Paige web-browser install) — §30 SUBSTRATE SCOUT findings, filed BEFORE architecture (hard §30 gate):** A read-only Explore scout swept 7 questions across the repo. **Headline: a browser home ALREADY EXISTS; the real decision is extend/activate-vs-rebuild, NOT build-from-scratch.** Three distinct browser seams, all Playwright+Chromium (never Puppeteer/browserless): **(A) `services/visual-renderer/`** — the §33 Fly service that launches a REAL warm headless Chromium (`server.js:81-90`, base image `mcr.microsoft.com/playwright:v1.48.0-jammy`), but shaped as a STATELESS screenshotter (`/render`, `/render-html`), shared-secret gated, with the repo's STRONGEST SSRF guard (DNS-resolving `page.route` interceptor, fail-closed `hostIsPrivate`). Production-wired but **dormant** — gated off by absence of `VISUAL_RENDERER_URL`/`_SECRET` (no `_ENABLED` flag); its own header says do NOT fork it into a stateful agent. **(B) `scripts/live-drive/live-drive.mjs`** — the §32 helper that ACTUALLY drives an authed page headless (launch→navigate→form-login→steps/asserts→screenshot→honest `{ok}`); ships reusable primitives already solved: `resolvePlaywright`, `resolveExecutablePath` (scans `/opt/pw-browsers`), `buildLaunchOptions` (wires `HTTPS_PROXY`→`proxy` only when set), `defaultFormLogin`, `scrubSensitiveInputs`/`redactSecrets`. **Dev/CI-only, not deployed** — and honest caveat: prod `paigeagent.ai` was NOT reachable headless from the CI sandbox even via proxy. **(C) `supabase/functions/browser-use/index.ts`** — a Browserbase agent **WIRED but INERT** (returns `unavailable` until `BROWSERBASE_API_KEY`+`BROWSERBASE_PROJECT_ID` set); even when configured it only opens a Browserbase session + logs a replay URL — its own comment (`:58-60`) states *"Real Playwright control would happen here… Edge functions can't import Playwright."* Backed by an EXISTING **`browser_use_sessions`** ledger table (`goal/start_url/steps/result/screenshots[]/status/cost_cents/duration_ms/invoker_kind`, RLS: admins/owner all, coaches own-clients). **Web-fetch layer (COMPLEMENTARY, not subsumed):** `paige-deep-research` (bounded PLAN→SEARCH→READ→GAP-CHECK cited engine, anti-fabrication gate) consumes `paige-web-search` (Firecrawl) + `fetch-url-content` (SSRF-guarded raw fetch, NOT a browser); a duplicate `web-search` (admin-gated Firecrawl) also exists (Tavily deprecated §88). A browser ADDS what these can't: JS-rendered pages, click/submit/download, and **authenticated** surfaces. **Two critical GAPS a plan must not miss: (1) the skill interpreter has ZERO tool-dispatch** — `CONTEXT_TOOLS = {context,rag,client_memory}` + `pdf_render` are the only recognized tools; `allowed_tools` (incl. `firecrawl`/`browser`/`scrape` seeded on many S2 skills) is **declarative-only, never executed** — a browser tool needs a brand-new dispatch seam wired THROUGH the §16 clamp (`resolveExecutionMode`'s risk floor forces `approval` for `mutating`/`external_send`). **(2) No live browser runs ANYWHERE today** — visual-renderer dormant, `browser-use` a Browserbase stub, CI can't reach prod headless. Everything is scaffolding. **§9:** auth is Supabase JWT throughout; tenant scope is server-resolved (`assertTenantScope` throws §9 without `tenantId`); a browser drive must carry server-resolved tenant scope + a scoped **test-tenant** credential (live-drive README already mandates this, never owner PII). **§18 version debt:** `playwright` pinned TWICE already (root devDep `1.56.1` vs Fly service `1.48.0`) — a third install must pick ONE home. **Master §4 consistency (NOT a §13 correction):** §4 already lists **Browserbase + Firecrawl** as integrations (lines 200/270) — `browser-use` existing is consistent; the only nuance to record is that it is wired-but-inert and edge-Playwright-blocked. Full scout output archived in-session (agent a8112a5e02ea6dc9b). **NEXT: 8 architecture forks surfaced to owner for ruling (below in chat) — NO build until owner rules (kickoff hard rule).**
- **2026-08-12 · S2 wave COMPLETE — Cat 12 Superpowers seeded (12/12); the file-artifact-PRODUCTION lane, §18-audited vs Cat 2 + Studio:** **Cat 12 Superpowers (5 skills, this PR — DRAFT, owner §18 review)** seeded into `paige_skills` (`format_document_deliverable`, `build_slide_deck_deliverable`, `produce_data_workbook`, `produce_one_page_pdf_asset`, `assemble_pdf_packet`) — all 5 draft+confirm (deliverable producers). §32.a rollback-proof GREEN on prod (`new=5 bad_ip=0 finance=0 jargon=0 ro_auto=0 draft_confirm=5 external=0 platform=5 cat_sp=5 toolbad=0`). **Owner-ruled 2026-08-12: "seed thin wrappers."** **WHAT THESE ARE:** tenant-facing recipes that take ALREADY-APPROVED content and produce a polished, downloadable FILE deliverable (formatted document, slide deck, data workbook, one-page leave-behind, combined packet). **§18 — the whole difficulty, crew-audited (verdict SHIP, 0 dropped):** these are FILE PRODUCTION, distinct from BOTH neighbors — vs **Cat 2 (Documents)** which AUTHORS the copy/text (Cat 12 only imposes structure + renders a file, never writes the words); vs the **Vibe Studio** which builds WEB/interactive/image assets (Cat 12 produces a STATIC downloadable file, never a page/funnel/form/image). Each skill states its Cat 2 AND Studio boundary in-copy. **The 2 tightest §18 boundaries flagged for owner review:** `format_document_deliverable` and `build_slide_deck_deliverable` (closest to Cat 2's content lane — kept as file-formatters, not authors). **§13 HONESTY (the key gate):** the interpreter renders PDF via `pdf_render` and otherwise forges FORMATTED CONTENT — it cannot guarantee an editable binary (.docx/.pptx/.xlsx), so every skill renders a PDF directly where it can and otherwise hands over the formatted content, NEVER claiming a finished binary it can't produce (the crew rewrote 2 earlier over-claims). **§16:** all 5 draft+confirm, none sends. **§2/§11 clean** (finance=0, jargon=0). **WAVE COMPLETE: Cat 1–12 all seeded (12/12).** Every seeded skill is RUNNABLE (the #135/#481 interpreter fix). This Cat 12 PR is a DRAFT pending owner §18 review (the superpowers set is the §18-questionable one); on its merge Task #126 (Paige web-browser install) unblocks (capture-only per #124).
- **2026-08-12 · S2 wave — Cat 11 Agent Orchestration seeded (11/12); §11 backend-jargon scrub caught in the integrator pass:** **Cat 11 Agent Orchestration (8 skills, this PR)** seeded into `paige_skills` (`route_task_to_department`, `assemble_agent_team`, `delegate_and_collect`, `design_agent_workflow`, `propose_new_specialist`, `skill_recipe_draft`, `orchestration_run_review`, `agent_capability_review`) — 3 read_only+auto REVIEWS + 5 draft+confirm DRAFTERS. §32.a rollback-proof GREEN on prod (`new=8 bad_ip=0 finance=0 jargon=0 ro_auto=3 draft_confirm=5 external=0 platform=8 cat_ao=8 toolbad=0`). **WHAT THESE ARE (§8/§14/§16/§20):** the tenant-facing recipes for how Paige runs HER OWN team of specialist sub-agents — each WRAPS an existing orchestration capability (routing/delegation/creation/run-records), never re-implements one, and orchestration stays a CHAT act (§20), never a new surface. **§16 STRUCTURAL FLOOR held:** NONE dispatch a team, create a specialist, create a skill, or send — every capability/creation act is draft+confirm; the 3 reads persist nothing (no client_memory/pdf_render) and carry the honest 'not available' fallback. **§14 propose-gate:** `propose_new_specialist` + `skill_recipe_draft` DRAFT a proposal only (the learn-and-grow path) — ship no code, auto-create nothing. **§13:** `orchestration_run_review` reports only what agents ACTUALLY did. **§11 INTEGRATOR CATCH (added a `jargon` gate to the proof):** my crew brief told the distillers to "name the wrapped seam in the description" — which leaked raw backend identifiers (`paige_skill_runs`/`paige_audit_log`/`paige_subagents`/`paige_skills`/`paige-orchestrator`/`delegate_to_subagent`/`subagent-forge`/`skill-forge`) into TENANT-VISIBLE copy, an amateur tell (§11). The integrator SCRUBBED every backend name from name/description/methodology_anchor/steps into plain language, added a hard §11 assertion (Python) + a SQL `v_jargon=0` proof gate, and kept the seam→skill mapping ONLY in the migration header comment (not tenant-visible). Lesson: a distillation brief that says "name the seam" must scope it to the CODE comment, never the row. **§18 (crew-confirmed):** `design_agent_workflow` (Paige's OWN agents' choreography) ≠ Cat 10 `workflow_design_draft` (a HUMAN business process) — distinct actor; `agent_capability_review` (surveys Paige's own fabric) ≠ Cat 10 `automation_opportunity_scan` (the tenant's own operations) — distinct subject. **Wave progress: Cat 1–11 seeded (11/12)**; only Cat 12 (Superpowers) remains — OWNER RULING OWED (seed thin wrappers around the existing skill-forge/superpowers surface vs skip). Task #126 (browser) stays hard-gated until all 12 seed. NB: Cat 10 (#482) is verified-green + §32.a-proven; its merge (and Cat 11's) is a §48 rate-limit handoff — Cat 10 (`20260907000000`) must merge/apply BEFORE Cat 11 (`20260908000000`) per migration ordering, and Cat 11 needs a §10 rebase (keep both entries) once Cat 10 merges first.
- **2026-08-12 · S2 wave — Cat 10 Operations & Process seeded (10/12):** **Cat 10 Operations & Process (9 skills, this PR)** seeded into `paige_skills` (`project_plan_draft`, `weekly_priorities_plan`, `workflow_design_draft`, `operational_checklist_draft`, `task_prioritization_review`, `process_bottleneck_review`, `capacity_review`, `automation_opportunity_scan`, `project_status_review`) — 5 read_only+auto REVIEWS + 4 draft+confirm DRAFTERS. §32.a rollback-proof GREEN on prod (`new=9 bad_ip=0 finance=0 ro_auto=5 draft_confirm=4 external=0 platform=9 cat_op=9 toolbad=0`). Clean distillation — §2 finance scan 0 hits with NO scrub needed (unlike Cat 8/9's disclaimer-token traps). **§13 honesty (crew verdict FIX_NEEDED, 2 fixes applied in place):** `project_plan_draft`'s render step said "approved-pending plan" on a confirm-lane skill (nothing is approved yet) → reworded "drafted plan (pending approval)"; `automation_opportunity_scan` was the only read skill missing the explicit "not available" phrasing → added (no behavior change). **§18 wrap-don't-duplicate (the ops PLANNING/ANALYSIS/COORDINATION angle):** `workflow_design_draft`=operational FLOW LOGIC (trigger→steps→handoffs→owner) distinct from Cat 2 `draft_sop_process_doc` (SOP prose); `operational_checklist_draft`=INTERNAL recurring-ops run distinct from Cat 2 `draft_checklist_worksheet` (client-facing, §9 audience seam); `automation_opportunity_scan`=tenant's OWN manual processes, NOT Paige's sub-agent fabric (Cat 11); `project_status_review`=INTERNAL initiatives distinct from Cat 3 `milestone_tracking` (per-client journey) + Cat 4 `pipeline_review` (sales); `capacity_review`=internal ops workload, never the sales pipeline. **Wave progress: Cat 1–10 seeded (10/12)**; Cat 11 (Agent Orchestration — wraps skill-forge/skill-runner/orchestrator seams), Cat 12 (Superpowers — owner ruling owed: seed wrappers vs skip) remain. Task #126 (browser) stays hard-gated until all 12 seed.
- **2026-08-12 · §13 CORRECTION (§39 Codex peer-gate) — the seeded skills did NOT actually RUN until the #135 interpreter fix; Cat 1–9 "seeded" ≠ "runnable":** the S2 §32.a proofs proved each skill ROW inserts, but structurally could NOT reach runtime — and a Codex §39 peer-gate on #479 (Cat 9) caught, confirmed against real code, that **every seeded skill (Cat 1–9, `scoping='platform'`) FAILED at runtime for real tenant callers.** Root cause: `skill-interpreter.ts` mapped `scoping='platform'` → `is_platform_default=true`; `model-router-gates.assertTenantScope` THROWS §9 unless platform-default content is driven by an OPERATOR role (`operator`/`god`/`super_admin`), but `skill-runner` passes `actorRole` `'admin'`/`invoker_kind` and `paige-mcp` passes `'mcp'` — none operator — so `forge` threw and `interpretSkill` returned `status:'failed'`. **Fix (PR #481, sha 5af96a67, merged):** interpreter passes `is_platform_default:false` — `scoping` is REGISTRY PROVENANCE (who authored the row), NOT the nature of the generation; a tenant running a platform-authored skill produces TENANT content (finance is a per-tenant opt-in §2, voice is tenant-authored §7 — the platform-default finance/voice gates rightly don't apply; the seeded definition's §2-cleanliness is proven once at seed time). Plus `paige-mcp` `run_skill` now forwards a server-resolved tenant (`actorTenantId()`) for no-contact business-wide skills (Cat 9/10). §32 proof `scripts/skills-interpreter-provenance-smoke.mjs` 16/16 (drives the REAL `interpretSkill`); independent §39 adversarial verify = SHIP. This corrects the earlier "Cat N seeded" entries: they were CORRECT that the rows persist, but the skills only became RUNNABLE once #481 deployed (edge-functions CI, skill-interpreter shared → skill-runner+paige-mcp redeploy). **Lesson (§32/§39):** a row-insert rollback proof is NOT a runtime proof — the §39 peer-gate is what caught the class the §32.a proof couldn't. Follow-ups: skill-runner JWT tenant resolution for the SkillsHub UI path; wire the smoke into CI; P2 doc-render + P2 region/business_type context (Codex).
- **2026-08-12 · S2 wave — Cat 9 Compliance & Legal seeded; the NOT-LEGAL-ADVICE guard is the category gate:** **Cat 9 Compliance & Legal (9 skills, this PR)** seeded into `paige_skills` (`privacy_policy_draft`, `terms_of_service_draft`, `refund_policy_draft`, `consent_disclosure_draft`, `compliance_requirement_scan`, `contract_review_checklist`, `data_handling_summary_draft`, `disclaimer_draft`, `recordkeeping_policy_draft`) — 1 read_only+auto, 8 draft+confirm. §32.a rollback-proof GREEN on prod (`new=9 bad_ip=0 finance=0 ro_auto=1 draft_confirm=8 external=0 platform=9 cat_cl=9 toolbad=0`). **The KEY gate (mirroring Cat 7's HR not-advice pattern):** EVERY skill carries an explicit in-copy NOT-LEGAL-ADVICE disclaimer — in both the description AND a step — that the output is a generic starting template / general information, NOT legal/tax/regulatory advice, to be reviewed by a qualified attorney for the tenant's jurisdiction; `compliance_requirement_scan` (the one read) carries the heaviest guard and NEVER asserts the tenant is or is not compliant (crew `advice_disclaimer_ok=true`). **The §2 gate again caught the disclaimer-token trap (verdict FIX_NEEDED):** the verifier caught 2 banned-token hits hiding inside a disclaimer/guard (`refund_policy_draft`'s anchor said "financing"; `compliance_requirement_scan`'s guard named a "regulated-lending vertical") and rephrased them positively; the shipped set is §2-clean (SQL finance scan = 0). §18: these are business-wide GOVERNANCE artifacts distinct from Cat 2 `draft_engagement_contract` (the client contract itself) and `draft_sop_process_doc` (operational SOP), and Cat 7 HR docs; `contract_review_checklist` is a PRE-SIGNING review checklist (what to look for), not the contract; `privacy_policy_draft` (external published) vs `data_handling_summary_draft` (internal overview) differ by audience. **Wave progress: Cat 1–9 seeded (9/12)** — NB Cat 8 (Financial Ops, #478) is verified-green + §32.a-proven (`new=10 finance=0 cat_fo=10`) but its merge is a §48 handoff to the owner (GitHub API rate-limited mid-session); its own §10 entry rides #478. Cat 10 (Operations/Process), Cat 11 (Agent Orchestration — wraps skill-forge/skill-runner/orchestrator seams), Cat 12 (Superpowers — owner ruling owed) remain. Task #126 (browser) stays hard-gated until all 12 seed.
- **2026-08-12 · S2 wave — Cat 8 Financial Ops seeded; §2 verifier CAUGHT the disclaimer-token trap:** **Cat 8 Financial Ops (10 skills, this PR)** seeded into `paige_skills` (`invoice_draft`, `payment_link_generate`, `overdue_invoice_followup`, `accounts_receivable_review`, `expense_summary`, `profitability_review`, `budget_plan_draft`, `payment_plan_draft`, `financial_summary_draft`, `subscription_billing_setup_draft`) — 3 read_only+auto, 7 draft+confirm. §32.a rollback-proof GREEN on prod (`new=10 bad_ip=0 finance=0 ro_auto=3 draft_confirm=7 external=0 platform=10 cat_fo=10 toolbad=0`). **§38 MONEY BOUNDARY** is the sharpest gate here: every money skill (invoice/payment-link/payment-plan/recurring-billing) is FACILITATOR-only on the tenant's OWN connected processor (direct-charge) — Paige never merchant of record, never holds/routes funds; each drafts + names the tenant's own downstream seam (`generate-invoice` / processor / `compose-email`) that executes after human approval. **The §2 gate caught a subtle trap (verdict FIX_NEEDED):** the distillers wrote finance disclaimers that themselves contained the banned tokens ("never as *financing*/*loan*/*credit*") — the adversarial verifier CAUGHT + SCRUBBED all 6 hits and reframed positively ("described strictly as a payment plan"); the shipped set is §2-clean (SQL finance scan = 0). Correctly retained §38 boundary word "funds" (≠ §2 banned "funding"). §18 held: `profitability_review`/`financial_summary_draft`/`budget_plan_draft`/`subscription_billing_setup_draft`/`expense_summary`/`overdue_invoice_followup`/`accounts_receivable_review` each carry an explicit distinction from the adjacent Cat 6 (analytics reads/QBR)/Cat 4 (forecast)/Cat 3 (progress)/Cat 2 (contract) skill. `payment_link_generate` = the `payment_links` carryover from narrowed Task #100 (one home). `invoice_draft` wraps the existing `generate-invoice` seam. **Wave progress: Cat 1–8 seeded (8/12)**; Cat 9 (Compliance/Legal), Cat 10 (Operations/Process), Cat 11 (Agent Orchestration — wraps skill-forge/skill-runner/orchestrator seams), Cat 12 (Superpowers — owner ruling owed: seed wrappers vs skip) remain. Task #126 (browser) stays hard-gated until all 12 seed.
- **2026-08-12 · S2 wave — Cat 5 + Cat 6 + Cat 7 seeded (autonomous cadence, owner overnight directive):** Skills Wave S2 continues — **Cat 5 Marketing & Content (10 skills, PR #475 merged)**, **Cat 6 Analytics Interpretation (9 skills, PR #476 merged)**, and **Cat 7 Team Management (11 skills, this PR)** seeded into `paige_skills`, each §32.a rollback-proven on prod, IP-clean (§14/§62 mechanic-descriptive), §61-tier-default, `scoping='platform'`, category-CHECK-clean (§15 canonical values). §18 wrap-don't-duplicate held throughout: Cat 5 (`landing_page_copy`=copy-only, Studio owns page build; `email_sequence_design`=marketing arc distinct from Cat 4 `followup_sequence`/Cat 2 `draft_followup_email`; "performance report" excluded → Cat 6); Cat 6 (`revenue_trend_read`=historical read distinct from Cat 4 `revenue_forecast`; pipeline stale-deal → Cat 4 `pipeline_review`, per-client journey → Cat 3 `milestone_tracking`); Cat 7 (NO 1:1-agenda skill — `new_hire_onboarding_sequence` references Cat 2 `draft_meeting_agenda`; NO sub-account-team-building — that's provisioning; `new_hire_onboarding_sequence`/`employee_offboarding_sequence` explicitly EMPLOYEE-scoped, distinct from Cat 3 `client_onboarding_sequence`/`engagement_wrapup_sequence`). **§13 honesty gates enforced by the §1 crew:** Cat 6's verifier CAUGHT + FIXED an overclaim (`ad_spend_efficiency` implied computing ROAS/CPL from raw events → tightened to read the exposed metric layer + honest "not available" fallback); Cat 7's three employment-decision skills (`performance_review_template`, `compensation_benchmark`, `difficult_conversation_script`) each carry an explicit "NOT legal/HR/tax advice — review with a qualified advisor" disclaimer (crew `advice_disclaimer_ok=true`). All three passed §2 finance-clean scans (0 hits). Wave progress: **Cat 1–7 seeded (7/12)**; Cat 8 (Financial Ops — remember payment_links carry-over from #100, §2 finance-clean still applies to platform defaults), Cat 9 (Compliance/Legal), Cat 10 (Operations/Process), Cat 11 (Agent Orchestration — mostly wraps skill-forge/skill-runner/orchestrator seams), Cat 12 (Superpowers — owner ruling owed: seed wrappers vs skip) remain. Task #126 (browser) stays hard-gated until all 12 seed.
- **2026-08-12 · S2 wave — Cat 3 + Cat 4 seeded; Cowork role realigned; overnight autonomous cadence (owner rulings 2026-08-11):** Skills Wave S2 progress — **Cat 3 Client Delivery (6 skills, PR #473 merged + persisted)** and **Cat 4 Sales & Growth (9 skills, this PR)** seeded into `paige_skills`, both §32.a-proven and IP-clean (§14), §61-tier-default, `scoping='platform'`, wrapping existing seams not duplicating (§18: Cat 3 wraps send-portal-invite/send-welcome-email/systems-check-run-onboarding + references Cat 2 draft_offboarding_document/draft_testimonial_interview_outline; Cat 4 wraps apollo-search-people/generate-outreach-draft/crm_search_contacts/compose-email + excludes proposal-drafting as Cat 2 draft_client_proposal). Cat 4 passed an explicit **§2 finance-clean scan (0 credit/funding/lender hits)** — the critical gate for a Sales category shipped to every tenant. **Two owner rulings on how the wave runs:** (1) **Cowork role realigned** — CC owns the S2 wave END-TO-END (post intended list → fire crew immediately → §18/§37/§58 discipline → CI + merge + §32.a persisted-apply); the formal pre-crew Cowork sync-check is RETIRED (CC self-applies it). Cowork stays in for paige-mcp `run_skill`/`marketplace_browse` verification, §48 merge handoffs when rate-limited, owner-facing translation, doctrine ratification. (2) **Overnight autonomous cadence** — CC continues Cat 4→Cat 12 at its own cadence, self-merging on green when the rate-limit permits; owner handles §48 merge handoffs when a rate-limit blocks a verified-green PR. `prove` restore-viability advisory failure confirmed NON-required (#473 merged with prove=failure + verify=success) — a `prove` non-zero exit is a non-blocker, same class as Supabase Preview #275 + github-advanced-security Copilot-403. Task #126 (browser) stays hard-gated until all 12 categories seed.
- **2026-08-12 · Housekeeping — Task #100 narrowed/subsumed (§18) + §15 canonical category taxonomy LOCKED at DB level (owner ruling 2026-08-11):** two owner rulings. **(1) Task #100 (D1–D6 document-creation expansion) narrowed per §18** — Cat 2 (Documents) IS the D1–D6 doc capability (one home): offer letters→`draft_offer_letter`, sales offers→`draft_sales_letter`, agreements→`draft_engagement_contract`, presentations→`draft_stakeholder_update_deck`. #100's "chat integration" is already built (S1b interpreter routing); "payment links" reassigned to Cat 8 (Financial Ops) when it seeds. #100 closed-as-subsumed except the payment-links carry-over. **(2) §15 canonical 12-value category taxonomy locked at the DB layer** — migration `20260830000000` adds CHECK `paige_skills_category_canonical_chk` (category NULL or ∈ the 12 §15 values) so seeding/forging can't drift to ad-hoc values; the 3 mis-labeled pre-S2 skills recategorized (`verify_business_sos` verification→**compliance_legal**, `research_to_concept_brief` research→**vision_strategy**, `build_game_plan` strategy→**client_delivery**; `draft_and_email_document` already `documents`). **§37 PRODUCER INVENTORY caught a real blocker before ship:** `skill-forge` was the SOLE non-canonical producer (`category: draft.category ?? "general"` — LLM free-text) — a bare CHECK would have rejected every forge (the "half-hardened is worse" failure §37 exists to prevent). Fixed in the SAME PR: `canonicalCategory()` clamp + the LLM prompt constrained to the 12. No src/UI producer, no other edge fn. §32.a PROVEN on prod (BEGIN…ROLLBACK: `constraint_exists=1 recat_ok=3 total_bad=0 bad_value_rejected=true`). Side benefit: the S2 dashboard reads `category` deterministically instead of a slug heuristic. Persisted-apply via deploy-migrations pipeline (§47).
- **2026-08-12 · §15 Paige Skills Inventory v1 FILED (paste-through unblock):** the §15 content — blocked for several handoffs because Cowork's session `scratchpad/` isn't shared with CC's container — was delivered by the owner **via chat** and filed verbatim to master **§15** + **`docs/brain/paige-skills-inventory.md`** (cross-linked from the brain README), with the §3 index updated. 12 categories, ~100 skills, owner-approved as launch pad; complements §14 (what Paige DOES vs whose thinking anchors her). Sequencing gate reaffirmed: ALL 12 categories seeded before Task #126 (browser). Owner ruled **proceed after §15 files** → CC begins **Category 1 (Vision & Strategy)** seeding next (OSS-source + distill IP-clean + seed; lineage in commit body). **Delivery-channel lesson (§13/§46):** a Cowork `scratchpad/` file is NOT reachable from CC — cross-agent content must be committed to the repo or pasted in chat; paste-through was the working fix.
- **2026-08-12 · S2 sourcing MAP delivered + reachability CONFIRMED (owner addendum):** the owner delivered the concrete OSS source map for S2 seeding — master aggregators (`anthropics/skills`, `VoltAgent/awesome-agent-skills` [1000+], `GetBindu/awesome-claude-code-and-skills`, `abubakarsiddik31/claude-skills-collection`, `ComposioHQ/awesome-claude-skills`) + category-specific repos (Sales: `TheCraigHewitt/sales-skills`, `louisblythe/Sales-Skills`, `gtmagents/gtm-agents`, `ericosiu/ai-marketing-skills`, `filip-michalsky/SalesGPT`; Orchestration: `am-will/swarms`, `bobmatnyc/claude-mpm`, `dsifry/metaswarm`, `stellarlinkco/myclaude`, `Yeachan-Heo/oh-my-claudecode`) + Anthropic plugin skills (`marketing/sales/human-resources/finance/legal/operations/product-management/design/data/customer-support/small-business/brand-voice/productivity/engineering:*` → §15 categories 2–10). **§13 reachability CONFIRMED from CC:** all tested OSS repos are git-reachable through the agent proxy, AND `/mnt/skills` IS the Anthropic skills content locally — so the sourcing channel is fully open. **Sourcing lineage rule (per §14):** each seeded `paige_skills` row records its source-repo lineage in the MIGRATION COMMIT BODY only, never in the row (mechanic-only in code). **STILL-OPEN FORK (§44):** the §15 Paige Skills Inventory (the authoritative per-category skill LIST) has still not reached CC — so S2 seeding awaits either (a) §15 delivered as the target list, or (b) an explicit owner OK to derive the per-category list from the now-reachable sources and reconcile with §15 later. Sources ready; only the target list / go-ahead is pending.
- **2026-08-11 · S2 wave SOURCING ruling + §62 Two-tier skills sourcing doctrine (owner):** the ~100 S2 skills are NOT written from scratch — they are pulled from three source channels and distilled IP-clean: **(1) Anthropic Skills registry** (public OSS SKILL.md repos), **(2) owner's locally-installed Claude skills** (readable on disk), **(3) platform marketplace data** (paige-mcp `marketplace_browse`, fired from Cowork for funding-coaching). Each source skill is distilled to its MECHANIC (what it does / how it structures the work) and rewritten as a `paige_skills` row that is mechanic-descriptive per §14 — no source-repo/person/branded name in the row (attribution stays in the migration commit comment). **§62 (PROPOSED, CLAUDE.md + §3 index):** two first-class skill sources — **platform baseline** (OSS-distilled, `scoping='platform'`, every tenant per §61) and **tenant-loadable** (tenant-authored GitHub-repo skills, `scoping='tenant'`, a follow-up wave); both use the same schema + S1b interpreter + §16 clamp + §61 tiers. **§13 CAPABILITY CHECK (CC actually tried the paths):** the skill sources ARE readable from CC's container — `/mnt/skills/public` + `/mnt/skills/examples` (Anthropic public/example skills), `/root/.claude/skills/synced/` (**40 owner-curated skills**), and unzipped OSS repos (`superpowers-main`, `taste-skill-main`, `skills-main`). **§30 honest note:** the readable OSS skills are heavily design/dev/document (docx/pptx/xlsx/pdf/canvas-design/brand-guidelines/animate/taste/mcp-builder) — they map STRONGLY to §15 category 12 (Superpowers) + partially Documents/Marketing; the 9 service-business-ops categories (Vision/Sales/Client-Delivery/Analytics/Team/Financial/Compliance/Operations/Agent-Orchestration) are sourced from the §14 GOAT mechanics + §15 definitions distilled, not a direct OSS SKILL.md. **BLOCKER (§13):** the §15 Paige Skills Inventory content (the 12-category target list, `scratchpad/skills-inventory-v1.md` in Cowork's session) is NOT reachable from CC's container (Cowork scratchpad isn't shared with CC's clone; not in repo/git) — owner/Cowork owes it via repo-commit or chat paste before §15 files and S2 seeding starts. §62 doctrine + §3 index + this log filed now on `claude/registry-filing-v1`; §15 table + amendment add to the same branch when content lands.
- **2026-08-11 · GOAT Anchor Registry filed + IP-clean code rule LOCKED (owner ruling):** the intellectual DNA of Paige's professional intelligence is documented in TWO durable places — master **§14** (investor-facing IP disclosure) + **`docs/brain/goat-anchor-registry.md`** (second-brain crew reference), cross-linked from the brain README. v1 = 13 anchors (Hormozi/offers · Brunson/funnels · Priestley/positioning · Martell/time-leverage · Sanchez/SMB-acq · Vaynerchuk/content · Bartlett/media · Cardone/sales · Patel/SEO · Robbins/peak-performance · Shands/podcasting · **Cook** (owner) + Dolce/funding). **The IP-clean code rule (LOCKED):** business-strategy MECHANICS are not copyrightable and are fair to use; a PERSON'S NAME and their BRANDED FRAMEWORK TITLE are IP. So — **doc-side (master §14 + brain) = branded names + attribution = FINE** (bibliography-style); **code-side (`paige_skills.methodology_anchor`, system prompts, defaults, seeded skill copy, Paige's hardwired replies) = mechanic-descriptive ONLY, never a name or branded title.** Paige's conversational chat MAY cite/homage at taste-level (never scripted default); owner (Antonio Cook) is name-referenceable on funding surfaces (owns the platform + IP). **Retroactive audit (own PR, migration 20260827000000):** the #466 backfill had seeded 3 of the 4 shipped anchors in "Person — Branded Framework" form (GROW/Whitmore, Cialdini/Influence, Minto/Pyramid Principle); rewritten mechanic-descriptive (the 4th, verify_business_sos = "KYB standard — Secretary-of-State…", was already clean). §32.a rollback-proven on prod (bad=0; 3 rewrites mechanic-descriptive; verify_business_sos unchanged); §37 headless smoke confirms the new anchors still flow coherently through `buildForgeIntent`. **S2 seeding rule:** every new `paige_skills` anchor uses the mechanic-descriptive format; the GOAT registry is the crew's source of truth for WHERE the DNA came from so the mechanic wording stays faithful — but the name never enters the row.
- **2026-08-11 · STRATEGIC CLARIFICATION — what "skills" actually means (owner, folds S1 into the intelligence roadmap):** the owner corrected a misconception: the 4 `paige_skills` rows shipped today are **internal execution atoms** (callable actions Paige delegates to), NOT the strategic "skills library" that makes Paige intelligent. *"The skills are for Paige Agent AI in the chat… all of the high-level professionals we're marketing this close to — their high-level skills need to be the bottom floor of what she's capable of doing: thinking, rendering, producing, drafting, forming, contracting, and everything more than that."* The REAL "skills" = **GOAT-anchored high-level professional capabilities** (Hormozi-level offer thinking, Brunson-level funnels, Priestley-level positioning, funding coaching with the owner as primary anchor, etc.) — the bottom floor of Paige's intelligence. **Owner's roadmap layering through MVP intelligence:** (1) **GOAT-anchored professional-skills library** = the wave that actually makes her intelligent; (2) **web-browser install** (Task #126, Wave 4 Twin Dir A) — Paige navigates/probes/teaches herself using the professional skills as instinct; (3) **memory layering** — cross-chat semantic recall so it compounds. **Reframes S1's role:** S1 foundation (#466) = correct plumbing (unchanged); **S1b interpreter (PR #467) = INFRASTRUCTURE for the GOAT library to SCALE** — without it, N professional skills need N bespoke handlers; it is NOT itself "the intelligence"; **S2 = the GOAT-anchored professional-skills content seed** = the wave that makes her intelligent, sequenced right after S1b lands; web-browser (#126) sequences AFTER the library seeds (so browsing is driven by professional instinct); memory layering AFTER browser. **Capability note (§13):** Cowork verified the `paige-mcp` connection is LIVE on the Cowork side (`list_skills`/`run_skill`/`delegate_to_subagent`/etc. all responsive) — so the §58 baseline captures (Slice 1), the bespoke-vs-interpreter diff (Slice 3), and the §32.c live-drive are fired FROM COWORK; CC's headless container genuinely lacks the paige-mcp plumbing (session-plumbing, not a code issue) and ships the interpreter code + harness turnkey. Reshape confirmed, both sides.
- **2026-08-11 · Skills S1b interpreter design-review crew caught 5 MUST-FIX bugs pre-merge (§1/§39):** the mandatory Workflow crew (adversarial + compliance + architect) adversarially reviewed the interpreter design against the real schema BEFORE the build was called done, and caught five real defects the headless build would otherwise have shipped: **(1)** the approval INSERT used `type:'skill_draft'`, which violates the `paige_pending_approvals` type CHECK (`cs_draft|campaign_send|tier_change|qc_finding|milestone|other|workflow_run`) → every confirm-lane run would throw; fixed to `'other'`. **(2)** it passed `risk_level: skill.risk_level` (read_only|draft|mutating|external_send), which violates `paige_pending_approvals_risk_chk` (low|medium|high|blocker|null) — a disjoint vocabulary → always-broken; added `mapApprovalRisk()`. **(3)** the §16 clamp keyed ONLY on `autonomy_lane`, so a future skill with risk=external_send/mutating mis-laned to `auto` would resolve to `execute` (skipping human review); added a STRUCTURAL risk floor (high-risk never auto-executes regardless of lane). **(4)** `tierAllowsSkill` treated `'resell'` as allowed, letting an agency SELF-RUN a resell-only skill (§61 violation); fixed to allow only `yes`/`yes+resell`. **(5)** tenant resolution was `body.tenant_id ?? contact.tenant_id` (body-trusted-first, a §9/§59 IDOR — a stranger tenant could forge under a victim's templates/brand); fixed to prefer the server-derived contact tenant and reject a mismatch. Also folded: `is_platform_default` from `scoping` (engages the §2 finance guard), honest run-status mapping (denied/needs_config → `cancelled`, needs_input → `awaiting_confirm`, so success_count isn't inflated), and keeping `force_interpreter` out of the MCP schema. This is exactly the §1/§39 failure mode the crew exists to prevent — a green headless build that was subtly broken against real constraints.
- **2026-08-11 · Skills Wave S1 §30 substrate read corrected THREE brief premises (§13/§30):** the mandated pre-build substrate read (`scratchpad/skills-wave-s1-substrate.md`) found the S1 brief's premises were wrong and reshaped the plan. **(1) `autonomy_lane` is NOT a shared Postgres enum** — the action-bus spine (mig 20260711140000) enforces `('auto','confirm','off')` via duplicated `text+CHECK` on two columns; there is NO `CREATE TYPE` to reuse, so S1a copies the pattern (a third text+CHECK). "Reuse the enum" was impossible. **(2) `paige_skills.steps`/`allowed_tools` are PURELY DESCRIPTIVE** — the runner ignores them and dispatches via a hardcoded `switch(slug)` with 4 bespoke handlers, so "generalize the switch to read steps" is NOT a refactor but a NEW steps-interpreter, putting §58 byte-identical at real risk (owner ruled: build the full interpreter anyway; CC deferred it to a fresh session per §5 rather than rush the engine at a saturated session-end). **(3) the §61 three-state ruling does NOT fit the binary `Set<Feature>`** — "agency=resell" can't be a set-membership bit; owner ruled `skills`=self-use Feature (god/solo/sub/enterprise) + resell=Marketplace concept. All three logged so the next S1 session doesn't re-derive them.
- **2026-08-11 · §61 Standing Tier Distribution Default — owner-ruled, STOP asking per-feature (Cowork miss #12):** the owner ruled the S1 skills-tier question AND issued a standing meta-directive — *"This is yet another time that you guys have asked me… where things should be placed when we should actually already have this understanding for the entire platform… lock this in as a complete doctrine, in our brain and the master project."* Every new `getTierFeatureSet()` feature now follows a DEFAULT (don't re-ask the owner): **Super Admin (God) = YES** (everything, §57/§35) · **Solo = YES** · **Sub-account = YES** · **Agency = RESELL** (does NOT use the feature at its operator surface — resells to sub-accounts via Marketplace) · **Enterprise = YES + RESELL** (hybrid, Solo ∪ Agency). Deviations require an explicit owner ruling + a code comment in the feature's declaration; when a feature matches the default, ship it noting "§61 default: no exception." Preserved exceptions: `customer_portal_invite` (Solo+Sub+Enterprise), `growth`/`studio` (Solo+Sub+God, Agency excluded). Authoritative home `docs/doctrine/tier-matrix.md` §61; CLAUDE.md §61 (PROPOSED, §-number provisional pending Cowork ratification, per §57–§60). Brain decision-log + README + lessons-learned updated (§BRAIN.3). **Two S1 rulings baked in:** (a) `skills` follows the §61 default (God/Solo/Sub = YES, Agency = RESELL, Enterprise = YES+RESELL); (b) vocab = **MEDIUM** (owner-ruled, NOT the earlier "full rename") — a living `docs/doctrine/skills-vocabulary.md` glossary + inline comments disambiguating the 4 concepts, **NO** renames of shipped `paige_skills` tables or UI surfaces (§58 risk, no user value). Docs-only doctrine PR (#463); the S1 build + 3 Tashia-live-drive gap fixes follow as separate PRs.
- **2026-08-11 · Cowork miss #12 (log):** Cowork asked CC to ask the owner which tiers get the §60 `skills` feature-key when the answer was implicit in a standing owner-pattern stated multiple times across sessions (God has everything · Solo + Sub-account default · Agency resells · Enterprise hybrid). Owner correction verbatim: *"This is yet another time that you guys have asked me something around the idea of where things should be placed when we should actually already have this understanding for the entire platform."* **Lesson:** recurring owner rulings across sessions ARE doctrine even before formal capture — Cowork's job is to codify the pattern on the SECOND occurrence, not the fifth. §61 Standing Tier Distribution Default drafted PROPOSED to close this loop permanently. Same class as Cowork miss #11 (ruling-conversion discipline). Filed as a §BRAIN.3 standing-pattern-codification lesson.
- **2026-08-11 · Owner-premise correction — "contact-lookup 500" was TWO defects, not one (§30/§13, #127):** the owner live-drive reported Paige returning "no contact named Tashia Anderson on file" AND a "non-2xx" error, framed as one contact-lookup failure. **CC §30 diagnosis DISPROVED the single-cause premise:** (a) the false-negative was a **search tokenization bug** — the CRM filter matched the whole phrase `"Tashia Anderson"` against each single column, so a real row with first_name/last_name in SEPARATE columns matched 0 rows (never a 500 on the lookup itself); (b) the "non-2xx" came from an **unrelated nested tool** (content-draft/generate-image), NOT contact-lookup. Two symptoms, two causes, conflated because Paige narrated both as "no record." Fixed in PR #462: tokenized search (`_shared/contact-search.ts`, §18 one home, wired into all 3 lookup tools) + a LOOKUP HONESTY prompt rule (found / found-nothing / could-not-check never collapse). **New standing lesson filed** to `docs/brain/lessons-learned.md` §0c: *a tool error is NOT proof the record is absent* — an empty query means "matched nothing," an errored tool means "couldn't check," neither means "does not exist." §32.b proven on prod; §32.c owner live-drive owed.
- **2026-08-11 · Cowork miss #11:** Owner ruled D7 clearly (Option A direct C-Corp conversion, no holdco, Paige Agent AI Inc. standalone). CC's §37 producer inventory correctly surfaced adjacent stale doctrine (Portfolio-mode C-suite architecture + CoreConnect/Disputera refs). Instead of converting the existing ruling into complete execution guidance, Cowork re-presented it to the owner as "Reading 1 vs Reading 2" options. Owner correction verbatim: *"There's no need to keep going back and forth with me on what the structure is now… Don't go back and forth with me on anything related to anything else. We need to delete it and update it. That's it."* **Lesson:** when the owner has ruled, Cowork's job is to convert the ruling into COMPLETE execution guidance covering the full scope §37 surfaces — NOT to re-open the ruling as options. Stale doctrine that contradicts an owner ruling is dead by implication; §28 protects CURRENT approved designs, not superseded ones. Portfolio-as-corporate-structure is dead; Portfolio-as-marketplace-feature is a distinct future scope (task #129).
- **2026-08-11 · Doctrine correction — corporate structure (D7, owner-FINAL: DELETE):** `docs/doctrine/paige-c-suite-roster.md` (authored 2026-07-27) recorded the company (then Paige Agent AI **LLC**) as a **wholly-owned subsidiary of CoreConnect Technologies, Inc.** (a Wyoming holdco) and built a THREE-scope C-suite (tenant · operator · **portfolio/parent-entity**) on that premise. **Owner ruled 2026-08-11: that structure is DEAD — Paige Agent AI Inc. is a STANDALONE Delaware C-Corp (direct conversion from the LLC, Option A), no holdco, no parent.** Owner FINAL ruling (amending an earlier CC "flag-for-review" hedge): **DELETE the stale doctrine, don't preserve it** — *"There's no need to keep going back and forth… delete it and update it."* Executed: the holdco/subsidiary block + the entire "Portfolio / parent-entity" C-suite scope are **DELETED**; the C-suite is now **TWO scopes (tenant + operator)**. §28 protects CURRENT approved designs, NOT superseded doctrine. New living doctrine authored: `docs/doctrine/paige-corporate-structure.md`. **"Portfolio" is retired as a corporate-structure term** — going forward it means ONE thing: a future *marketplace feature* (task #129). **A SEPARATE, larger structure surfaced during the sweep (§13 flag):** `docs/portfolio/PORTFOLIO_SCOPE_BRIEFING.md` + the public Footer document a **Givalli Heritage Holdings Inc. parent / Aedis Brands LLC IP-licensing / 9-subsidiary** structure (bigger than CoreConnect). The briefing is marked **SUPERSEDED** for Paige; the Footer's Aedis/Givalli brand-license line was PRESERVED (a standalone C-Corp *can* license IP) and **flagged for owner** (task #128) — not part of the CoreConnect ruling, owner confirms whether it survives.
- **2026-08-11 · Cowork miss #10 (re-anchor, D7):** the skills-wave paste framed D7 as a straight "LLC → Inc." find-replace on owner shorthand. CC's §30 caught two problems before executing: (a) Cowork cited a doctrine doc (`paige-corporate-structure-2026-08-01.md`) that **did not exist**; (b) the live doctrine (`paige-c-suite-roster.md:82-88`) carried a **contradictory holdco/subsidiary structure**. Owner ruling: **Option A · direct C-Corp conversion** (no holdco, standalone Paige Agent AI Inc.). **Lesson (both CC + Cowork):** never cite a doctrine doc without verifying it exists (§BRAIN.2); a bare "rename X→Y" over a legal-entity identity is never a blind find-replace — it splits into present-tense identity (swept), vendor-account records (annotated pending-rename, §13 — the Twilio Org is *still literally named LLC* until the owner renames it), immutable applied legal-template migrations (flagged owner-owed, never edited), and dated historical docs (kept as honest history).
- **2026-08-11 · §60 Enterprise HYBRID baseline SHIPPED — closes flag 1 from PR #458 (Skills Wave Slice 0):** owner ruled (mid-handoff 2026-08-11) that **Enterprise is the ONE HYBRID tier** — it inherits BOTH the Solo/Sub-account "doing" surface (CRM + creation + `customer_portal_invite`) AND the Agency "managing" surface (`subaccount_management`). `ENTERPRISE_FEATURES` is now `new Set([...SOLO_FEATURES, ...AGENCY_FEATURES, ...CREATION_SURFACES])` — net change vs prior baseline: **enterprise GAINS `customer_portal_invite`** (it previously had creation but not portal-invite — the exact internal inconsistency flag 1 named: creation-capable yet unable to invite the clients those campaigns are for). **Both layers moved in ONE PR (§37 no split-brain):** the UI helper (`tierFeatures.ts`) AND the server RPC — new migration `20260824000000` narrows `create_tenant_invite_token`'s consumer guard from `IN ('agency','enterprise')` → `= 'agency'` (byte-faithful superset of `20260823000000`; #227 subaccount_owner + FIX-1 owner-role gates preserved verbatim). **§32.a PROVEN on prod** (BEGIN…ROLLBACK as super_admin, temp tenants: `enterprise_consumer=SUCCESS`, `solo_consumer=SUCCESS`, `agency_consumer=BLOCKED(42501)`, `agency_team=SUCCESS`). **§37/§57:** all 5 consumer-invite minters route through `hasTierFeature('customer_portal_invite')` (no hardcode; `lint:tier-features` clean 896 files) → UI auto-updates for enterprise, server allows it, no producer breaks (loosening cannot 4xx a prior-passing caller). **§58:** no tier loses anything — only enterprise gains. §39 peer-gate (headless self-administered, stated per §13): no blocking findings. tsc 0 · vitest 18/18 · lint:tier-features clean. A pure AGENCY is still blocked on both layers (the §60 lock holds for agency). **Flag 2 (`god` tierKey collapses super_admin+platform_admin) remains open** — deferred (YAGNI until a super_admin-only *client* feature exists; server already enforces the real §53 boundary).
- **2026-08-11 · §60 tier-lock SERVER ENFORCEMENT + Growth/Studio tier move SHIPPED (task #125):** completes the §60 lock end-to-end. (1) **Server half of the `customer_portal_invite` lock** — new migration `20260823000000` adds an `account_type` guard to `create_tenant_invite_token`: a `_kind='consumer'` mint for an agency/enterprise TARGET tenant now RAISEs 42501, for ALL callers (incl. platform owner). Faithful superset of the live #227 F.1 body (byte-diff = exactly the 11-line guard; auth gate / subaccount_owner / owner-role / contact checks all preserved; grants untouched). **§32.a PROVEN on prod** (BEGIN…ROLLBACK as super_admin: consumer+agency BLOCKED, consumer+sub ALLOWED, team+agency ALLOWED). (2) **`growth` + new `studio` feature** = solo/sub/enterprise/god — NOT agency (owner ruling: an agency manages sub-accounts, not its own campaign/creative book); god GAINS them (§35 dogfooding). Enterprise kept growth (no regression) + gained studio as an explicit superset. (3) **`RequireFeature` route gate** (§18 one home, mirrors `FundingRoute`) on `/admin/campaigns` + `/admin/studio` — the lock is REAL, not nav-only (§13); guards on `loading` to avoid a fail-open flash. §1 crew: build + §39 peer-gate (SHIP, migration byte-faithful) + §5 compliance (SHIP after docs reconcile + loading-guard). tsc 0 · lint:tier-features clean (895 files) · vitest 18/18. **Two owner-flags for #124:** Enterprise gets creation but NOT `customer_portal_invite` (inconsistent — recommend giving it) **[UPDATE 2026-08-11: flag 1 CLOSED — owner ruled Enterprise HYBRID; enterprise now gets `customer_portal_invite` on BOTH layers, migration `20260824000000`. See the Enterprise-HYBRID entry above.]**; the `god` tierKey collapses super_admin + platform_admin (fine for dogfooding, blocks a future super_admin-only god feature) **[flag 2 still open]**. Owner §32.c owed (agency can't reach Studio/portal-invite; god/solo/sub can).
- **2026-08-11 · §13 correction #8 (hypothetical-Enterprise deferral REVERSED by owner):** during #122 CC/Cowork framed the server-side consumer-invite gate as blocking on an Enterprise ruling — to avoid "breaking a legitimate agency-with-direct-clients or Enterprise-with-custom-permissions." **Owner correction: there are ZERO Enterprise customers yet (pre-MVP), so there was zero real risk to protect against** — the deferral was rooted in a customer scenario that doesn't exist. Server gate shipped now (#125). **Standing rule (both CC + Cowork):** before invoking "customer risk" to defer a change, VERIFY the customer class exists in current state (query the `tenants` table / master §4 SHIPPED / brain) — hypothetical-customer risk is not real risk when the class has zero members. Real classes today: Solo + Sub-account + Agency + Super-Admin operator. Enterprise = 0. (Filed to `docs/brain/lessons-learned.md` as a standing bar.)
- **2026-08-11 · getTierFeatureSet structural tier-lock SHIPPED + §60 doctrine (task #122, owner-MANDATORY):** the §60 ONE HOME for tier→feature mapping is live — `src/lib/tier/tierFeatures.ts` (`TIER_FEATURE_BASELINE` + `resolveTierKey`/`getTierFeatureSet`/`hasFeature`) + `useTierFeatures()` hook + `lint:tier-features` CI guard (sibling of `lint:views`/`lint:definer-fns`) + a matrix unit test. Owner-locked baseline: **`customer_portal_invite` = Solo + Sub-account ONLY** (Agency + Super Admin excluded). The §1 review crew on the real diff caught what the build missed: **§39 BLOCKER — a 5th ungated consumer-portal minter** (`WorkspaceSettingsPanel`, on the UNIVERSAL Setup surface) — now gated, so all 5 minters honor the lock; plus §25/§5 UI-consistency fixes (blank-Select reset, dead Resend button) and §18 refactors (shared `canOwnSubaccounts()`). **§13 HONESTY:** the lock is enforced at the **UI/build-time** layer (helper + lint across all 5 minters); the server RPC `create_tenant_invite_token` does NOT yet tier-gate `_kind='consumer'` (NOT a §9 IDOR — an agency mints only under its own tenant_id) — the server-side gate is a tracked follow-up tied to the open owner-decision on Agency's client book. **[UPDATE #125, 2026-08-11: that follow-up is CLOSED — the server gate landed in migration `20260823000000`, §32.a-proven; `customer_portal_invite` is now server-enforced, no longer UI-only. See the #125 entry above.]** Verified: tsc 0 · lint:tier-features clean · vitest 16/16. §60 doctrine added to `CLAUDE.md` (PROPOSED).
- **2026-08-11 · §13 correction #7 (deferral REVERSED by owner):** after CC's #121 §30 audit found ZERO current tier feature-gate leaks, Cowork/CC recommended DEFERRING the `getTierFeatureSet()` helper on §18 grounds ("scaffolding a solution to a non-existent problem"). **Owner explicitly overruled: build the helper as MANDATORY structural enforcement** — precisely because features/skills/designs drift silently and get mis-quoted at every level, and text-only doctrine relies on memory. The absence of leaks TODAY isn't the point; the point is structurally locking tier-baseline so future features CAN'T drift. Reversed by the helper PR (task #122). **Lesson:** "no bug to encode" is NOT sufficient to defer a structural anti-recurrence primitive when the owner has repeatedly named the drift class as friction; an owner ruling re-stated across sessions is the signal to STRUCTURALLY LOCK it, not to await the next specific violation.
- **2026-08-11 · MMA sub-account slug mismatch fixed (owner live-drive, §30/§32.a data-fix, task #123):** the owner's Agency-dashboard live-drive caught the sub-account **Mogul Maker Academy** (`d8a0a880`) rendering at `/mr-mogul-maker-academy`. §30 DISPROVED the handoff's "one free-slug rename" premise: the target `mogul-maker-academy` was already held by the **PARENT agency** "Project Mogul Enterprise Inc" (`29a7c77f`) under the UNIQUE `tenants_slug_key` — the two slugs were mismatched, a residue of the Academy→Agency tier reversal (#55) where the slug never followed the rename (the tenant that BECAME the parent agency kept the academy slug; the real academy sub-account got a dedup-prefixed `mr-`). The parent agency's own slug was therefore also wrong (an agency named "Project Mogul Enterprise Inc" resolving at `/mogul-maker-academy`). Owner ruled **Full swap**: parent → `project-mogul-enterprise`, child → `mogul-maker-academy` (one transaction, parent freed first to satisfy the UNIQUE constraint). **§32.a proven on prod:** rollback-proof GREEN → committed → post-apply query confirms both rows + **0 `mr-` prefixes remaining + 0 duplicate slugs** platform-wide; §51 invariant intact (child stays `sub_account`, parent stays top-level `agency`). **§37:** slug is a live public-route key (`/store/:slug`, growth page/funnel renderers, `peek_tenant_portal_brand`) — parent's 1 + child's 4 growth pages change public URL prefix (pre-launch, no known external traffic); **NO live code/DB object keys on either slug string** (the historical `mogul-maker-academy` migration refs are immutable already-applied one-time DML, not live objects). Data-only fix via MCP (no migration file — hardcoded tenant IDs, per the apply-migration guidance). Owner §32.c live-drive owed (Agency dashboard shows `/mogul-maker-academy`). **Root-cause note (not fixed platform-wide per owner directive):** the `mr-` prefix likely traces to slug generation seeding from the owner handle (`mrmogulmaker`) during dedup; §39 confirmed **no other tenant** carries an `mr-` prefix, so no broader slug-generation sweep was opened.
- **2026-08-11 · #121 MMA §16-block "stale classification" hypothesis DISPROVED (§30/§13):** the handoff hypothesized MMA rendered the §16 department block (while sibling PME sub-accounts did not) because of stale historical Solo classification / a hardcoded tenant gate. CC's §30 audit disproved it: all four PME tenants are confirmed `sub_account`; the block is NOT keyed on tenant_id/`account_type`/`features`/tier at all. The real discriminator was `emptyBook` (book data-state) — the block was nested inside the non-empty branch of `PracticeOverview.tsx`'s empty-state conditional, so MMA (2 clients) showed it and 0-client siblings got the blank-canvas EmptyState. Fixed by hoisting the block above the split (PR #453), same class as task #99's Systems Check tile. The platform-wide sweep found ZERO other feature-gate leaks. (The owner subsequently ruled the `getTierFeatureSet()` structural-enforcement helper MANDATORY regardless — see correction #7, filed with the helper PR.)
- **2026-08-11 · Owner-locked doctrine ratification: §57 · §58 · §59.** §57 (Super Admin = source of truth) · §58 (Anti-regression rule) · §59 (SECURITY DEFINER caller-scope-in-body). All three drafted PROPOSED overnight in the #449 close-out; ratified explicitly by the owner the morning of 2026-08-11. **Binding on every future PR.** §58 adds a standing §39-verifier checklist item — *"Did this PR silently remove any previously-shipped capability?"* — starting immediately on the next PR. §59's enforcement (`lint:definer-fns` CI guard + `pg_proc` drift advisor) is already live from #117 (PR #448).
- **2026-08-11 · #117 SECURITY DEFINER function class (companion to #116):** #116 (PR #447) closed the VIEW anon-reach class (`security_invoker=off` view drift); **#117 (PR #448) closed the FUNCTION anon-reach class (SECURITY DEFINER owner-bypass).** Same underlying mechanism (owner-scoped execution bypassing RLS), different Postgres object types. The full anon/cross-tenant-reach class is now closed at BOTH object types AND the CI-guard layer (`lint:views` + `lint:definer-fns`). **Honest severity (§13):** #117's 20 leaks are authenticated-only (lower blast radius than #116's anon-reachable PII/FICO); 1 HIGH (the `delete_credit_report_upload` auth bypass — role-checked a caller-supplied identity param instead of `auth.uid()`).
- **2026-08-11 · Cowork #55 root-cause naming WRONG (CC-corrected via #116):** Cowork originally named the Command Center approvals leak a "permissive-OR bypass." **Real cause = `security_invoker=off` VIEW drift on `paige_approval_queue_v`** (the view ran as owner and bypassed RLS). Corrected/fixed in #116 (PR #447, the 11-view sweep) — do not cite the "permissive-OR" framing.
- **2026-08-11 · Cowork out-of-band commit during #55 §32.a validation (§13 honesty flag):** during the #55 §32.a validation Cowork committed instead of rolling back a validation change. Idempotent, no harm done — flagged here per §13 for the record.
- **2026-08-11 · Cowork Task #22 Twilio framing WRONG:** Cowork framed task #22 as "owner needs to paste the Twilio SID." **Setup is DONE** (secrets set, operator comms live per Section 4); the real blocker is **A2P carrier approval** (owner resubmitted, awaiting carrier). #22 is correctly stated as "awaiting A2P carrier approval," NOT "owner needs to paste SID."
- **2026-08-11 · Cowork memory-drift class (standing correction):** Cowork asked the owner about already-handled items (the Twilio setup being the anchor case — asking for a paste that was already done). **Standing correction:** read the queue + prior rulings (and the brain, §BRAIN.2) BEFORE asking the owner — do not re-surface settled/handled items as open questions.
- **2026-08-11 · Cowork "brain doesn't exist on main" WRONG (stale-checkout class):** Cowork claimed `docs/brain/` doesn't exist on main. **Reality:** it is partially live via #443/#445 (at minimum `decision-log.md`). Cowork was reading a stale checkout. Same class as misses #10/#11 — bind to `ref: main` (Section 4 discipline block).
- **2026-08-11 · #444 hotfix-bundle premise corrections (§30, CC-caught pre-code, tasks #40/#41/#42/PR #444):** three §32.b bugs from the owner's MMA live-drive; §30 corrected all three handoff-stated causes. (D1) "Preview unavailable" was NOT a `meta`-vs-`body` reader mismatch — `loadDocument` already reads `body`; the real cause was the streamed `paige_artifact` frame omitting `tenant_id`, so the card read under the VIEWER's active tenant, not the doc's owning (managed sub-account) tenant. (D2) People-tab KPI-2/list-0 was NOT a SQL over-filter — it's the client-side "My Queue" view (`scopeMine`) hiding contacts assigned to another user while the KPI counted the full array. (D3) the fresh sub-account's empty Systems Check was NOT a standalone-vs-subaccount trigger divergence — NO creation path fired an onboarding scan on ANY tier (the `systems-check-run-onboarding` runner was orphaned; every prior run is daily-cron), and the fix required a migration (the handoff assumed none). Also: the handoff named `tenant-signup` as the standalone provisioning home, but that edge fn only mints the auth user — real tenant creation is `provision_tenant`/`provision_tenant_as`, covered by an AFTER INSERT trigger. All §32.a-proven on prod (`20260818000000` persisted; helper + trigger live; `create_subaccount` enqueue present).
- **2026-08-10 · #109 Lovable/Gemini chat-premise correction (§30, CC-caught pre-code, task #109/PR #442):** the #109 handoff premise was that the Paige chat runs on the **Lovable AI gateway** serving `google/gemini-2.5-*`, and the deliverable was to "swap it to direct Gemini." **CC's §30 diagnosis (proven with live `paige_llm_trace`) reversed this: the chat is ALREADY direct-Anthropic AND has no Gemini or Lovable in the runtime.** `_shared/claude.ts` `gatewayCompat` is a direct-Anthropic shim (`ANTHROPIC_URL`, `callClaude` / `streamAnthropicAsOpenAI`) — it IGNORES the `Bearer ${lovableApiKey}` header, and the `"google/gemini-2.5-flash"/"-pro"` strings are **legacy labels** `tierForLegacyModel` maps to Claude tiers (flash→haiku/classification, pro→sonnet/reasoning). Prod trace: `claude-haiku-4-5` + `claude-sonnet-5` + `featherless`, zero lovable/gemini. So "is the chat on Lovable/Gemini?" = **NO, it's Anthropic** — do not re-diagnose. What #442 actually shipped: the **#34 approval-loop fix** (a `substantiveTurn` heuristic routes approval/creation turns to the reasoning=Sonnet tier so `document_generate` fires instead of looping) + the **safe Lovable purge** (deleted the one live `api.lovable.app` caller `parse-business-credit-report` + 16 vestigial dead-code refs). The **live Lovable email trinity** (`auth-email-hook`+`process-email-queue`+`handle-email-suppression`, `@lovable.dev` HMAC+delivery SDKs) could NOT be atomically removed — it's launch-critical (silently 401s signup if ripped out) — and is sequenced as **task #112** (owner secrets + §32 live-email verify).
- **2026-08-10 · Systems Check availability-by-accident (owner-reported, CC-fixed, task #99) + new §56 doctrine:** the owner reported the tenant Systems Check was missing on several **sub-accounts** while showing on Mogul Maker Academy, and hypothesized a tier-misclassification ("thinking it's a solo account"). CC's §30 diagnostic found the real cause was NOT tier classification: the `<SystemsCheckTile scope="tenant" />` was gated INSIDE the non-empty branch of `PracticeOverview.tsx`'s `{emptyBook ? … : …}` conditional (`emptyBook` = 0 clients + 0 attention + 0 approvals), so every freshly-provisioned tenant — solo OR sub-account — rendered only the "blank canvas" empty state and never saw the check; Academy has clients (`emptyBook=false`) so it showed. Routing is tier-uniform (all tenant-selected staff → `PracticeOverview`, Admin.tsx:892), so the fix is availability, not routing. **Fix (PR pending, branch `claude/systems-check-tier-availability`):** render the tenant tile ABOVE the empty/non-empty split on `PracticeOverview` (covers solo + all sub-accounts, empty book or not) AND add it to `AgencyBoard` (`/agency`, the agency owner's DEFAULT landing — its own-business check, scoped to the agency's own tenant), matching the operator tile already on `OperatorCommandCenter`. Systems Check is now uniform across **God · Agency · Standalone/solo · Sub-account** — the owner's "repeatable throughout the entire process." Crew: design-engineer + §39 adversarial (SHIP) + §5 compliance (ITERATE→the AgencyBoard gap, now closed). **New doctrine `CLAUDE.md §56`** (lands §51's forward-referenced "platform impact assessment"): before ANY build, check `docs/doctrine/tier-matrix.md` to name which account type(s) the feature is for AND decide per-tier whether it belongs — a capability meant for "every tier" must render regardless of empty-book/branch/route accident. Propagated to §56, `tier-matrix.md`, this log, and `docs/brain/` in the same PR.
- **2026-08-09 · Cowork miss #1 (REVERSED by CC's code check):** originally claimed `_shared/tts-router.ts` does NOT exist. **Reality:** file DOES exist (in-app chat voice path, 14,557 bytes, verified this session). BOTH `_shared/tts-router.ts` AND `_shared/elevenlabs.ts` exist. This correction was itself wrong — do not cite. **Lesson:** when sandbox agent grep disagrees with CC's code check, CC wins.
- **2026-08-09 · CC voice-env precision (§13, added by CC same commit):** the in-app CHAT voice is `DEFAULT_TTS_VOICE = { provider:"elevenlabs", id:"0S5oIfi8zOZixuSj8K6n" }` (Ivanna) hardcoded in `_shared/tts-router.ts` — it does NOT read `ELEVENLABS_VOICE_ID`. The `ELEVENLABS_VOICE_ID` env drives the SEPARATE **Studio-VO** lane (`_shared/elevenlabs.ts`, Rachel fallback when unset), and the ConvAI **phone** agent is a third independent system. Do not attribute the in-app Ivanna voice to `ELEVENLABS_VOICE_ID`. Full detail in the `CLAUDE.md` "Voice Configuration" section.
- **2026-08-09 · Cowork miss #2 (REVISED with owner-supplied visual proof):** originally claimed `tenant_twilio_subaccounts` table + `provision-tenant-twilio` edge function exist. Half-reality: code artifacts genuinely don't exist in the repo (grep-verified), BUT the Twilio ISV/reseller architecture IS FULLY LIVE at Twilio's side — Organization, master account, 5 active subaccounts (SIDs in owner's console). Purchase capability EXISTS. **Only narrow gap:** phone-number SEARCH tools in Communications. Task #27 rescoped.
- **2026-08-09 · Cowork miss #2.b (owner-flagged in-flight):** first revision over-scoped to include "purchase flow" as gapped. Wrong — purchase exists. Corrected to search-tools-only.
- **2026-08-09 · Cowork miss #3:** claimed `signup_intake` table exists. Reality: does NOT exist. Signup gate is `signup_completion_gate` + `profiles.terms_accepted_at`.
- **2026-08-09 · Cowork miss #4 (REVERSED by CC's code check):** originally claimed `paige_owner_memory` table does NOT exist. **Reality:** table DOES exist — migration `20260810120000`, shipped in PR #406 (grep-verified this session). Distinct from `paige_prompt_memory`. This correction was itself wrong — do not cite. Section 5 gap on this table removed.
- **2026-08-09 · Cowork miss #5:** talked about Owner Trilogy as "3 pillars" or listed 6 pillars. Reality: owner-locked FOUR pillars per 2026-08-04 revision. Corrected in Section 2.
- **2026-08-09 · Cowork miss #6:** treated Slice 1c IA restructure as in-flight. Reality: COMPLETE (2026-07-25). Corrected in Section 4.
- **2026-08-09 · Owner-directive gap:** BRD absent from `docs/`. Owner action needed.
- **2026-08-09 · Owner-directive gap:** System Architecture doc absent. Owner action needed.
- **2026-08-09 · Cowork miss #7:** initial Glob searches for `customer-portal-owner-trilogy-taxonomy-matrix.md` returned no results due to misconfigured patterns. Reality: file exists. Lesson: verify Glob patterns hit the intended path before claiming absence.
- **2026-08-09 · Cowork miss #8 (fabricated-progress class):** implied master doc was committed to GitHub when it was only written to Cowork's sandbox working tree. Never pushed. §13 violation on precision — writing-to-tree ≠ committed ≠ pushed. CC caught it by running the commands and getting "pathspec did not match." Lesson: never assert "committed to GitHub" without a real commit SHA on the remote. (This doc's own commit — by CC on branch `docs/master-project-reference-2026-08-09` — is the real push that resolves it.)
- **2026-08-09 · Cowork miss #10 (stale-branch grep class, CC-caught):** Cowork's sandbox on branch `chore/doctrine-preservation-2026-08-01` (behind main) claimed `src/components/admin/contacts/ContactCommsPanel.tsx` exists at that path. CC's fresh-clone check on main: file does NOT exist at that path — real conversation components live under `src/pages/admin/conversations/`. Cowork's Grep hit was a stale-branch artifact. Root cause: sandbox drift. **Fix:** Section 4 "Cowork research discipline" rule now binds — API-only reads with `ref: main`.
- **2026-08-09 · Cowork miss #11 (stale-branch grep class, CC-caught):** Cowork's sandbox claimed `src/pages/admin/ClientsConversations.tsx` is a 20-line placeholder and `Admin.tsx:322` mounts it as a route. CC's fresh-clone check on main: `ClientsConversations.tsx` is a full 1,927-line component (the rich three-column Conversations UI from the owner's screenshot), and it's mounted at `Admin.tsx:396-398`, not `:322-323`. Cowork also conflated `CommunicationsAdmin.tsx` (notification-log surface) with `ClientsConversations.tsx` (rich inbox) — different surfaces. Same root cause as #10 — Cowork reading a stale-branch snapshot. **Fix:** same as #10 — Section 4 discipline block. Also flags that Cowork's earlier "route mount is a placeholder" and "routing gap" notes in the Communications entry were WRONG — the real Communications architecture is fully shipped per CC's verified check; the Communications SHIPPED entry in Section 4 is the CC-verified rewrite.
- **2026-08-09 · Cowork miss #12 (fabricated-progress class, second occurrence):** Cowork attempted to push the Cowork research discipline codification directly to the master doc via `create_or_update_file` — GitHub API returned `403 Resource not accessible by integration`. Cowork's MCP token is READ-only, not write. Same pattern as miss #8 (implying commit before push). **Reality:** the codification text sat in Cowork's sandbox until CC folded it into a real commit (this one). **Lesson (now folded into Section 4 discipline block):** Cowork writes go through paste-to-CC/Codex, never direct API push. Cowork's own "I pushed it" claims are provisional until CC-verified.
- **2026-08-09 · Cowork miss #3 (REVERSED by CC's live-prod check, task #31 §30 diagnose):** miss #3 above claimed `signup_intake` table does NOT exist. **Reality:** `signup_intake` DOES exist on prod (CC queried it directly — columns `user_id, account_type, agreement_slug, agreement_version, terms_accepted_at, plan_slug, billing_period, consumed_at, …`). It is the pre-provisioning per-user signup intake (no `tenant_id`); the tenant-level agreement acceptance lands in `legal_acceptances` (+ `profiles.terms_accepted_at`) via `provision_tenant`. Miss #3 was itself wrong — do not cite. CC's code check is authoritative.
- **2026-08-09 · Task #31 §30 diagnose — handoff schema corrections (CC live-prod check, PR #415, owner §32.c-gated):** the revenue-integrity handoff assumed a schema that prod disagrees with on EVERY gate. Corrected + bound to the real tables in migration `20260815120000`: (a) the paid discriminator is `tenant_revenue_classification.revenue_class` (a dedicated operator-only table, #29), NOT a `tenants.revenue_class` column (which doesn't exist and would break §51); (b) GATE 1 agreement = `legal_acceptances` filtered to the tier SUBSCRIBER slugs `saas-standalone`/`saas-agency`/`saas-enterprise` — NOT `signed_agreements` (no such table) and NOT `paige_signed_agreements` (that's CLIENT-scoped, tenant↔client, §38 tenant-side), and NOT any ambient privacy/terms/esign acceptance (§39 caught the slug-agnostic no-op); (c) GATE 2 payment = `platform_subscriptions` `status='active'` + non-null `stripe_subscription_id` — NOT a `stripe_payments` table (none) and NOT Stripe status `'succeeded'` (that's a PaymentIntent status; a subscription is `active`/`past_due`/`canceled`/…); (d) enforcement is a CONSTRAINT TRIGGER, NOT the handoff's `CHECK (… EXISTS(…))` — Postgres CHECK constraints cannot contain subqueries (invalid SQL); (e) GATE 3 atomicity ALREADY holds — `provision_tenant` is one `SECURITY DEFINER` function. Verified: `promotional 8 / internal_test 1 / paid 0`; the 3 live `active` platform_subscriptions are all comped (NULL `stripe_subscription_id`), which is why `status` alone can't be the gate.
- **2026-08-09 · Task #31 §5/§32 self-catch (CC honest log):** CC's own first `BEGIN..ROLLBACK` proof went GREEN while the ACTUAL migration did NOT apply — the proof tested a re-typed trigger body, not the file. The §5 compliance officer, running the real file in an ephemeral PG, caught a malformed `RAISE` (one `%`/`%%` placeholder vs three args → "too many parameters specified for RAISE") that aborts the whole migration on CREATE and would brick provisioning on first fire. **Lesson (§32/§13):** a `BEGIN..ROLLBACK` proof must exercise the REAL committed SQL, byte-for-byte, not a paraphrase — a green proof of a paraphrase is a false green. Fixed + re-proven against the verbatim file (COMPILE PASS + reject/accept/edit paths).
- **2026-08-09 · Cowork miss #21 (trademark-exposure class, owner-caught):** the internal codename "Jarvis Initiative" (and its "JARVIS" analog references — Marvel/Disney's distinctive Iron-Man AI character) had leaked past the internal-only boundary the strategy doc itself set. GitHub `search_code` against `main` confirmed ZERO code hits (rule held on the code side) but **14 hits across 4 doc files** — `docs/product/BRD-MVP-2026-08-08.md` (8), `docs/product/agent-ui-placement-spec.md` (2), `docs/product/interactive-analytics-ui-spec.md` (2), `docs/strategy/owner-trilogy-2026-07-26.md` (2 + the analog mapping table). Repo is public. (Cowork's original count was "8 hits"; CC's fresh-clone grep found 14 — logged as the real number, §13.) **Fix:** all 14 references purged in one docs-only PR (#417) — reframed to "Systems Check MVP" / "the operator-AI-COO archetype", and the Iron-Man analog mapping table deleted outright. **Prevent-recurrence:** new **§50 Trademark hygiene** doctrine added to `CLAUDE.md` — a mechanical case-insensitive grep on every §5/§39 pass. Owner-caught this class of leak; doctrine now catches it going forward. **§32.b grep proof (honest, meta-exempt):** post-purge, `git grep -ri "jarvis" -- 'docs/**' 'CLAUDE.md' 'src/**' 'supabase/**'` returns **live-use hits: 0 · code hits: 0 (src/**, supabase/** clean) · meta-exempt hits: 2** — this very corrections-log entry (a §13 audit trail MUST name what it reversed) and the `CLAUDE.md` §50 prohibition list (a doctrine list MUST name the marks it prohibits, exactly like §25 CHEESY-TELLS names the tells). Both are self-referential purge/prohibition surfaces, not product-name association — an IP bot finding *"we prohibit JARVIS"* / *"we purged Jarvis Initiative on this date"* is the OPPOSITE of the exposure. §50 carves out these two surfaces explicitly so future §5/§39 grep passes `grep -v` them instead of false-positiving.
- **2026-08-09 · §36 CATASTROPHIC MISS (owner-caught live; the anchoring case for §52) — now FIXED:** on Antonio's live Super-Admin Paige chat (`/admin/playbook`), Paige asked the FOUNDER *what his role was*, asked him for the platform's North Star / BRD / System Architecture (all shipped, owner-locked material), and claimed *"no memory persistence layer wired into this session"* — factually wrong (`paige_owner_memory` ships in migration `20260810120000` / PR #406; the runtime just never read it). For an AI COO that is a category-defining §36 failure. **Root cause (§30 diagnosis):** the chat system prompt is assembled inline in `paige-ai-chat/index.ts` with NO owner-identity/platform-context read; the Super-Admin surface (`PaigePlatformDesk.tsx`) even self-documented the gap ("no dedicated platform persona yet … owed server-side follow-up"). Two further §30 catches the handoff's Layer-1 assumptions missed: (a) `paige_owner_memory` is a memory-ROW table (`memory_type`+`content`), not a YAML blob; (b) the God account (`admin@paigeagent.ai`, `ba352c23`) is TENANT-LESS (`active_tenant_id` NULL, no membership) → the own-read RLS could never match → read via service-role + a migration relaxing `tenant_id NOT NULL`. **Fix:** §52 runtime context-loading substrate (PR #424, §32.a GREEN on prod) — Paige now opens every operator session already briefed (identity from `paige_owner_memory`, live platform state, compiled doctrine/master excerpts, by-name greeting from runtime auth metadata not the repo). **§13 honesty correction baked into the fix:** an edge function CANNOT read the repo (`CLAUDE.md`/master doc) at runtime, so "read from repo at compose time" was a lie — the doctrine index + master excerpt ship as COMPILED CONSTANTS versioned with the code. New `CLAUDE.md §52` makes any operator surface that asks the operator to establish who he is a §52/§36 violation. **OWED:** the owner's §32.c live-drive is the blocking proof (Paige greets Antonio by name, never asks identity). **✅ §32.c CONFIRMED live (2026-08-10):** Antonio's `/admin/playbook` session — Paige replies by name; a follow-up (PR #426) made the OPENING bubble lead with his name too. Both merged + live.
- **2026-08-09 · Cowork miss #28 (§38 doctrine drift, owner-caught pre-build):** the original Systems Check paste **and** the CC Systems Check L2 Runner paste both recommended a **"Stripe-native read"** for check #10 (payment methods) and a Stripe-specific check for #9 (payment processors). Owner correctly flagged this **violates §38** (tenant-BYO-processor; Paige is never merchant of record for tenant→client, and never assumes WHICH tool a tenant uses for anything Paige doesn't own). **Corrected PRE-BUILD:** both checks are **processor-agnostic capture-first** — the tenant declares which processor (`tenants.payment_processor_declared`: stripe/paypal/square/bank_merchant/quickbooks_payments/manual/not_yet) and which methods (`tenants.payment_methods_declared[]`); the runner reads the declared field, never a processor API. Per-processor deep-verify (a connected Stripe account's live methods, a PayPal API, etc.) lives as a **post-MVP Playbook slice** (§35 Marketplace Check Spec DSL). The correction landed in the L2 Runner PR: the migration also flips the L1 seed row #10 off `stripe_payment_methods_read`/`external_vendor` onto `payment_methods_declared`/`native_seam`, and rewrites the #9/#10 remediation copy to processor-agnostic language (the drafted fix was still saying "Stripe" — §39 F1). **Prevent-recurrence:** a new **§38 bullet** in `CLAUDE.md` makes processor/vendor-agnostic the rule for **every** tenant-side check/surface (not just the money leg): assumption-baking is a §38 violation regardless of build-cost, checked by the §5 compliance officer in both the read path and the drafted-remediation copy.
- **2026-08-10 · Twilio One Console layout flip (ops learning):** the old `console.twilio.com/us1/develop/...` deep-links now 404 in the new `1console.twilio.com` UI. Fastest path: the top-right **search bar** → type the resource name (TwiML, Messaging Services, Phone Numbers) → jump. The "All Products" catalog view is marketing/discovery, NOT operational config.
- **2026-08-10 · Messaging Service "Defer to sender's webhook" is a footgun (ops learning, root cause of the earlier operator-SMS-inbound-points-at-voice-twiml bug):** if the number's own webhook is misconfigured (or points at the wrong handler, e.g. `voice-twiml`), the Messaging Service silently falls through and inbound breaks in production unseen. **Best practice:** set the SERVICE to "Send a webhook" with the correct URL, and BLANK the number-level webhook (the service always wins).
- **2026-08-10 · `verify_jwt` is verifiable headless via `list_edge_functions` MCP (ops learning):** grep the fn by slug (output is large). Cheap ground-truth check before pointing Twilio at a fn: `verify_jwt=false` → Twilio can hit it with just its `X-Twilio-Signature`; `verify_jwt=true` → Twilio requests 401. `paige-operator-sms-inbound` confirmed `verify_jwt=false` + ACTIVE before wiring.
- **2026-08-10 · Operator-scope handler naming pattern (§9/§12 convention):** `paige-operator-<action>` (`paige-operator-sms-inbound`, `paige-operator-sms-send`) + "Paige Operator <Product>" in the Twilio console. Extend this pattern for future operator-scope handlers (RCS, WhatsApp, Voice AI) — keeps the §9 operator/tenant seam obvious.
- **2026-08-10 · Overclaimed "Fleet Comms parity done" on #431 merge (§13, owner-caught live):** the last Twilio handoff + prior Section 4 update marked Fleet Comms parity COMPLETE. PREMATURE. #431 shipped the operator-side rich three-column SHELL + phone-in-thread WIRING, but the actual product capability — Super Admin auto-populated with real contacts + conversations synced from completed tenant onboardings, inline call records, immediate operator-side email/SMS against real data — is NOT there. Antonio live-drove Super Admin and confirmed the EMPTY state. **Correction:** Section 4 entry rewritten from "✅ COMPLETE" to "🟡 shell+wiring shipped, parity NOT complete"; real completion filed as **Fleet Comms Slice 4 (task #97 / doc #15)**, sequenced behind #9 (depends on the People/Pipeline foundation). Do not re-mark parity closed until Slice 4 actually ships. Lesson: a shipped SHELL/wiring is not shipped CAPABILITY — verify the real end-to-end product behavior (§32.c) before writing "complete" in SHIPPED.
- **2026-08-10 · Featherless "model=null" was a TRACE artifact, not a config-unset bug (§30 diagnose, task #19/#103; owner-side plan closed):** the LLM-failover handoff hypothesized the cheap tier passes `model=null` (config unset OR a non-existent slug). **CC live-prod check disagrees:** `paige_llm_trace` last 48h = 50 featherless rows, ALL `status=error`, ALL `job_kind=text:open-flexible`, error `"Featherless call failed or returned no choice"`, last at 09:00 UTC (BEFORE the plan activated). The `model=null` in the trace is a **fidelity artifact** of `emit(provider, null, "error")` logging the null response object — NOT the slug actually sent. Both router seams already pass a **valid, allow-listed** slug and are already env-overridable; there was **no null-slug code bug**. Real root cause = pre-plan reachability (free tier couldn't serve the model). **Owner-side closed:** Antonio subscribed Featherless **"Feather Per-Request" DEVELOPER** ($50/mo credit, per-request billing, NO model-size cap) on 2026-08-10 — §34 cheap-tier economics restored. **Code close-loop (PR #438, MERGED 2026-08-10):** `_shared/model-router.ts` — open-flexible default upgraded 8B→`meta-llama/Llama-3.3-70B-Instruct` (owner's ranked #1, already allow-listed + already used for `internal_first_draft`), env name `FEATHERLESS_DEFAULT_MODEL` added as the §10 primary override (back-compat alias `FEATHERLESS_CHEAP_MODEL`), stale "15B cap on Basic / flat-rate by size tier" comment corrected to the per-request DEVELOPER reality; `config-registry.md` updated (§BRAIN.3). Complementary to **HOTFIX A / PR #436** (the callModel→Claude rescue for this exact path lives there, NOT in this PR — both need to be live for the full §34 no-single-provider guarantee). §32.b headless-proven (env-precedence resolver + regression-lint GREEN); **reachability of the 70B on the paid plan is NOT verifiable headless (no key value, no operator JWT, no browser) → OWED to owner §32.c live-drive** (fresh operator Systems Check scan → `operator_llm_failover` returns to `pass`). **Post-merge §32 GREEN:** `deploy-edge-functions` CI succeeded on the #438 merge commit (`830842b1`) — the router change is live on prod. Section 4 SHIPPED entry added on merge (per the Fleet-Comms lesson — no "shipped" before the merge).

---

## 11. What to do when THIS doc is wrong

File a §13 correction in Section 10 with:
- Date (`YYYY-MM-DD`)
- Who found it (Cowork / CC / Codex / Antonio)
- What was claimed (in this doc or a past paste)
- What the codebase actually shows (with file path or migration version cited)
- Fix status (documented / code fix filed / owner action needed)

**Never remove — mark reversed/superseded and add the new entry.** The corrections log IS the durability primitive. **CC's code check is authoritative** — when Cowork's sandbox agent disagrees with CC's live-code finding, CC wins and the correction gets logged here.

---

## 12. Cross-agent handoff standard

Every Cowork paste to CC or Codex includes:

> **Reference this doc first:** `docs/PAIGE-MASTER-PROJECT-REFERENCE.md`. Read Sections 4 (SHIPPED) + 5 (Current focus + gaps) before starting. Update Section 4 checkboxes on merge. Log any §13 corrections in Section 10.

CC and Codex confirm read at start of every session.

---

## 14. GOAT Anchor Registry — the intellectual DNA of Paige's professional intelligence

> Paige Agent AI's professional intelligence is designed as an "AI-COO" for client-based service
> businesses (coaches, consultants, agencies, thought leaders, advisors). To reach expert-level
> capability from day one, Paige's methodology draws from the proven frameworks of the
> highest-recognized thinkers in each professional domain relevant to service-business operations.
> This registry documents WHOSE thinking anchors WHICH domain of Paige's expertise. It is an internal
> reference for our teams AND a factual disclosure of the intellectual DNA behind Paige for investor /
> acquirer review.
>
> **IP posture:** business frameworks and methodologies are not copyrightable — the mechanics of a
> proven system (e.g., "increase perceived value by improving outcome-to-effort ratio") are ideas, not
> intellectual property. Paige uses the MECHANICS. The person's name and any branded framework title
> (e.g., "The Value Equation," "The Value Ladder," etc.) is intellectual property and NEVER appears in
> Paige's shipped code, system prompts, default replies, or seeded skill content. This registry is
> bibliography-style attribution for internal reference and investor disclosure only.

**The code rule (owner-locked 2026-08-11):** doc-side (this §14 + `docs/brain/goat-anchor-registry.md`) =
branded names + attribution → FINE (bibliography). Code-side (`paige_skills.methodology_anchor`, system
prompts, defaults, seeded skill copy, Paige's hardwired replies) = mechanic-descriptive ONLY, never a name
or branded title. Paige's conversational chat = occasional taste-level homage OK, never scripted. Owner
(Antonio Cook) name-referenceable on funding surfaces (owns platform + IP).

| Domain | Anchor | Branded framework (attribution — reference only) | Mechanic-descriptive equivalent (what goes into code) | Source |
|---|---|---|---|---|
| Offers / business modeling | Alex Hormozi | $100M Offers — Value Equation, Grand Slam Offer | Value-scaling offer construction: raise dream outcome + likelihood; cut delay + effort. Bundled premium-priced offer with guarantees + urgency | thepowermoves.com/100-million-offers-summary-review |
| Funnels / DR marketing | Russell Brunson | Value Ladder, DotCom Secrets, Secret Formula | Ascending customer-value journey: low-ticket entry → tiered premium offers. Dream-client → where-to-find → bait → result | dansilvestre.com/summaries/dotcom-secrets-summary |
| Personal brand / positioning | Daniel Priestley | Key Person of Influence — 5P Framework | Authority-building sequence: pitch, publish, product, profile, partnership. Micro-niche authority focus | danielpriestley.com/key-person-of-influence-book |
| Coaching-biz scaling / time leverage | Dan Martell | Buy Back Your Time — Buyback Principle, Buyback Loop, DRIP Matrix | Delegation-first time-recovery system for founders: hire to buy back time, not to grow | buybackyourtime.com |
| SMB acquisition / holdco investing | Codie Sanchez | Main Street Millionaire, Contrarian Thinking | Cash-flowing established SMB acquisition thesis — buy boring recurring-cash-flow businesses | codiesanchez.com/msm |
| Content / social attention | Gary Vaynerchuk | Jab, Jab, Jab, Right Hook | High-value-content rhythm with periodic call-to-action; native-platform-context content | amazon.com/Jab-Right-Hook-Story-Social/dp/006227306X |
| Media thinking / long-form personal brand | Steven Bartlett | Diary of a CEO — 33 Laws, Happy Sexy Millionaire | Long-form conversational authority-building with fulfillment-first frame | amazon.com/Diary-CEO-Laws-Business-Life/dp/0593715837 |
| Sales / closing | Grant Cardone | 10X Rule, Closer's Survival Guide | High-frequency, high-urgency sales activity model; closing as a learnable craft with scripted patterns | grantcardone.com/the-10x-rule-a-sales-game-changer |
| SEO / content marketing | Neil Patel | Ubersuggest methodology | Long-form topic-cluster content + backlink acquisition; comprehensive keyword coverage | neilpatel.com/blog |
| Personal development / peak performance | Tony Robbins | 6 Human Needs, RPM (Rapid Planning Method) | 6-core-human-needs motivation model (certainty, variety, significance, connection, growth, contribution) + result-purpose-action planning | tony-robbins-europe.com/posts/tony-robbins-methods |
| Podcasting (launch / grow / monetize) | David Shands | My 7 Figure Podcast, Podcast Summit, Social Proof | Podcast launch-grow-monetize + community-through-show; sponsorship, product placement, entrepreneur audience-building | my7figurepodcast.com |
| Funding coaching (primary) | **Antonio Cook** (owner) | Owner-authored methodology | Owner-authored — name-referenceable on funding surfaces (owns platform + IP). Methodology to be captured from owner's materials. | Owner-authored |
| Funding coaching (co-anchor) | Herman Dolce, Jr. ("Haitian CEO") | Business Funding Blueprint, Bella Sloan Enterprises method | Credit-repair → business-credit → capital-acquisition funding path. Systematic funding-readiness progression | haitian-ceo.com |

**Amendments log.** This registry is v1. Additions/corrections logged as ruled. **Open amendment queue**
(candidate domains without anchors): copywriting, email marketing, YouTube growth, high-ticket sales / phone
closing, agency ops, e-commerce, course creation, membership / recurring revenue, negotiation, public
speaking, book writing / thought leadership, team building, mindset / grit. Owner rules per-domain when
adding anchors. **Durable twin:** `docs/brain/goat-anchor-registry.md` (identical content, second-brain layer).

---

## 15. Paige Skills Inventory — what Paige DOES at professional level

The Paige Skills Inventory documents what Paige DOES at professional level — the atomic capabilities that
make her the AI-COO for client-based service businesses (coaches, consultants, agencies, thought leaders,
advisors). It complements the GOAT Anchor Registry (§14 — whose thinking anchors her methodology). **This is
what she executes; that is what she reasons from.** Investor-facing IP disclosure alongside the GOAT registry;
both together document the intelligence layer as an acquirable, defensible asset.

**IP posture (unchanged from §14):** skill mechanics live in `paige_skills` rows as mechanic-descriptive text
(no branded framework names, no anchor person names hardwired). Attribution lives in the GOAT registry only.
Paige's conversational chat may pay occasional taste-level homage; hardwired defaults never.

**Seeding strategy (per §62):** platform baseline skills for each category are pulled from OSS skill repos
(Anthropic Skills registry + community aggregators + owner-curated local skills) and distilled
mechanic-descriptive per §14. Tenants additionally load their own GitHub-repo skills (tenant-loadable-skills
surface, a follow-up wave). Sourcing lineage recorded in migration commit bodies only, never in a row.

**Sequencing gate (owner ruling, 2026-08-11):** ALL 12 categories must be seeded before Task #126 (Paige
web-browser install) begins — the professional-skills library is the operating instinct that drives Paige's
browsing intelligence; the library comes first, the browser comes after.

**The 12 categories (~100 skills):** (1) **Vision & Strategy** — vision interpret/create, roadmap + daily-action
translation, where-you-are diagnostic, gap analysis, scaling roadmap, quarterly OKR planning, risk id. (2)
**Client Delivery** — onboarding, kickoff agenda, per-client milestone tracking, deliverable drafting,
check-in cadence, wrap-up/graduation, reactivation. (3) **Sales & Growth** — lead triage, outreach drafting,
follow-up sequences, pipeline mgmt, forecast, competitive intel, discovery prep/summary, proposal drafting,
objection-handling library. (4) **Marketing & Content** — content strategy, brand-voice enforcement, blog/
social(per-platform)/newsletter/ad/landing-page drafting, campaign planning, email-sequence design, SEO audit,
performance report. (5) **Document Creation** (Studio §19) — offer letter, proposal, contract (basic),
welcome/follow-up email, meeting recap/agenda, one-pager, case study, ebook/guide, checklist, sales letter,
SOP, onboarding/offboarding packet, invoice/SOW, dunning notice, testimonial outline, board deck, landing
page, funnel steps — each offers Word/GDoc/PDF/Markdown (S1d shipped). (6) **Analytics Interpretation** —
revenue/pipeline/engagement reads, funnel diagnosis, cohort analysis, churn detection, ad-spend efficiency,
client-health, weekly-review/QBR/quarterly synthesis. (7) **Team Management & Building** — JD drafting,
interview design + questions, role/org mapping, hiring pipeline, onboarding sequence, review templates, 1:1
agenda, comp benchmarking, PIP script, offboarding, sub-account team building. (8) **Financial Ops** (not
accounting advice) — invoice gen+send, dunning, cash-flow snapshot, reconciliation prep, month-end close,
price analysis, tax-prep organizer. (9) **Compliance & Legal** (basic — escalate for real) — contract review,
NDA triage, policy lookup, risk assessment, escalation routing. (10) **Operations & Process** — SOP/runbook
drafting, process optimization, change request, status report, vendor review, capacity planning. (11)
**Agent Orchestration** (§14/§16 — Paige's meta-skill) — roster knowledge, delegation, composition, agent
forging, agent-learning loop (§34 L6), cross-department action-bus routing (§16), knowing when NOT to
delegate. (12) **Superpowers** (imported from the Claude Skills ecosystem) — docx/pptx/xlsx/pdf, canvas-design,
brand-guidelines/brandkit, algorithmic-art, imagegen, high-end-visual-design/apple-design, theme-factory,
web-artifacts-builder, image-to-code, mcp-builder, skill-creator, morning, schedule, learn, doc-coauthoring,
memory-management, task-management.

**S2 seeding order (owner may reorder):** Vision → Documents → Client Delivery → Sales → Marketing → Analytics
→ Team → Financial → Compliance → Operations → Agent Orchestration → Superpowers. One PR per category
(OSS-source → distill IP-clean → seed; lineage in commit body). **Durable twin:** `docs/brain/paige-skills-inventory.md`.

---

**End of master reference. This doc supersedes memory. Update it, don't outgrow it.**

### Tenant account redesign prototype (2026-08-21)

- ✅ A front-end-only, representative-data tenant experience prototype is available at `/tenant-redesign`. It demonstrates the six-destination IA (Home, Clients, Work, Studio, Insights, Settings), persistent PAIGE command spine, contextual artifact/CRM workspace, five connected design flows, concurrent work, voice state, and inline Trust Compass approval.
- ✅ The implementation contract is `docs/handoff/tenant-account-redesign.md`; it contains the audit, alternatives, selected Command Spine direction, screen/component inventories, tokens, responsive/motion/state specifications, old→new navigation map, interaction contracts, agent/artifact/trust rules, exact system copy, mock/functional boundary, accessibility requirements, and exportable assets.
- ❗ This is not a backend-connected tenant surface and is not evidence of live records, integrations, agent runs, approvals, sends, or deliveries. Its state is local and representative. Existing `/business/*`, `/solo/*`, and `/agency/*` routing is unchanged.

### Tenant redesign visual elevation (2026-08-21)

- ✅ `/tenant-redesign` retains the approved six-destination IA, Command Spine, contextual Workspace, five flows, shared conversation, agent orchestration, structured CRM, Trust Compass, responsive intent, and representative-only boundary while adding the authored PAIGE material, typography, intelligence-state, geometric agent, Sovereign authority, and Workspace materialization systems.
- ✅ PR #560 findings are resolved: the prototype route is excluded from the global `FloatingChatbot`, and all destination transitions close Workspace/navigation and dismiss PAIGE on mobile without changing the approved product model.
- ❗ The route remains a front-end design prototype. Voice, orchestration, persistence, approvals, delivery, integrations, CRM mutations, and all shown business activity remain mocked; no production backend capability is claimed.

### Tenant redesign laptop-fit + spatial interaction (2026-08-21)

- ✅ `/tenant-redesign` now fits a `100dvh` application shell with independent region scrolling, height-aware laptop density, folded/expanded/wide/focus PAIGE modes, docked/folded/floating/focus Workspace modes, and activity/trust/transcript/command slide-outs.
- ✅ Representative interactions preserve the current flow, draft, Workspace object/mode, active work, and business context within the session. Floating work is viewport-constrained and has keyboard movement/size alternatives; mobile destination transitions retain the PR #560 fix.
- ❗ This remains a front-end design prototype. Spatial UI state is functional; voice, orchestration, persistence, approval memory, delivery, CRM mutation, and integrations remain mocked.

### Repository-grounded account + PAIGE symbol prototype refinement (2026-08-21)

- ✅ The `/tenant-redesign` state lab now demonstrates the existing Solo, sub-account, agency parent/entered sub-account, Super Admin/God, and client placement taxonomy without inventing a hierarchy. Business scope and CRM client context are separate; business changes clear prior tenant conversation/Workspace/agent/memory/Trust/draft state.
- ✅ Shared `PaigeSymbol` adds typed Command, Sovereign, and provisional Artifact territories while preserving `PaigeMark` compatibility. The prototype demonstrates semantic state, dark/light, spectral/monochrome, and favicon forms; production call sites are classified in the existing handoff for incremental migration.
- ❗ Account and symbol states remain representative. No React state or symbol authorizes cross-account access. Production requires `user_roles` / `tenant_members` / `agency_team_members` separation, server membership, RLS, real/effective actor logging, operator act-as, two-key break-glass, and append-only audit.

### Tenant capability recovery architecture (2026-08-21)

- ✅ The tenant redesign now maps real repository capabilities into the approved six-destination shell through destination-specific secondary navigation, a first-class Pipeline composition, durable Work runs, the existing immersive Vibe Studio family, evidence-state Insights, and complete Settings groups.
- ✅ `docs/handoff/tenant-capability-recovery-matrix.md` is the checked-in evidence ledger; `docs/handoff/tenant-platform-route-map.md` is the integration route contract. Existing operational routes remain intact until component reuse, authorization, Trust behavior, redirects, and acceptance tests are verified.
- ✅ The generic `FloatingChatbot` is suppressed on `/admin` as well as the newer authenticated shells, preventing a redundant support-style launcher inside tenant operation.
- ❗ `/tenant-redesign` remains representative and front-end only. Its links expose current operational homes; it does not inherit their authorization or call their Supabase/Edge seams.

### Tenant/client data-honesty correction (2026-08-21)

- ✅ Unverified business and CRM names were removed from the public tenant redesign. The prototype now embeds no tenant list and no CRM rows; protected operational surfaces remain the only route to live records.
- ✅ The switcher contract is server-authorized: current tenant for solo/sub-account, authorized agency subset for agency users, audited registry/act-as for operators, and tenant-scoped `clients` only inside CRM context.
- ❗ Live production names were not asserted because this checkout has no authenticated GitHub remote or Supabase management/database session. An unavailable authority yields an empty state, never invented data.

### Tenant redesign requirement gap audit (2026-08-21)

- ✅ `docs/handoff/tenant-redesign-gap-audit.md` compares the full Capability Recovery handoff against actual code and classifies each requirement as delivered, partial, owed, or production-only.
- ✅ Floating-chat suppression is centralized and regression-tested across `/tenant-redesign`, `/admin`, `/agency`, `/business`, `/solo`, `/operator`, and `/app` roots and descendants.
- ❗ Honest completion state: Phase 1 substantially complete; Phase 2 partial; Phase 3 early; Phase 4 prototype-only; Phase 5 not started. Deep links and representative compositions are not connected component integration.

### Connected-surface navigation contract (2026-08-21)

- ✅ `/tenant-redesign` sub-views now select URL-addressable Canvas states inside the persistent six-destination/PAIGE shell; duplicate legacy bridge controls are removed.
- ✅ Exactly one shared, same-tab `Migration bridge / temporary` fallback is allowed per unmounted connected surface and is registered in the recovery matrix.
- ❗ Bridge-backed surfaces remain incomplete. A bridge disappears only when the named existing component is mounted without legacy chrome and passes its tier, Trust, deep-link, and acceptance tests.

### Vibe Studio production reconciliation (2026-08-21)

- ✅ Studio is classified as substantial live code plus connected substrate—not a concept and not a fully integrated lifecycle. The supplied audit reports 17 sessions, 4 versions, and zero Library/deliverable/critique rows.
- ✅ `docs/handoff/vibe-studio-integrity-audit.md`, `scripts/audit-studio-rls.sql`, and the matrix's 20-row Studio annex establish the integrity-first proof and implementation gates.
- ❗ The real Studio is not mounted in `/tenant-redesign`. Production reportedly contains widening permissive policy shapes not present in the repository's intended narrow session/version policy design; exact live policy proof and authenticated multi-user testing block broad mounting.

### Business Vault and Marketplace truth pass — 2026-08-21

The tenant redesign now separates Settings / Business Vault, Marketplace, and Installed Capabilities by lifecycle. Business Vault is a defined but mostly owed unified product over distributed sources; Marketplace has live catalog/install/economic substrate but incomplete verified lifecycle UX; Capabilities owns operation after installation. The checked-in audit and recovery-matrix annexes preserve supplied production evidence without embedding it as UI data. No secret table is treated as a tenant Vault, no Vault health score is fabricated, and `/tenant-redesign` remains front-end-only.

### Two-way portal and dual-theme pass — 2026-08-21

`/tenant-redesign` now supports remembered light and dark modes and includes Portal as an incomplete Clients sub-view. The portal is defined as the external half of the shared client relationship—not a parallel CRM, inbox, or operator chat. A checked-in audit and 26-row matrix annex preserve the supplied production evidence and block “complete” status on identity, canonical conversation, shared work, tenant/account isolation and authenticated acceptance proof.

The two-way portal design was subsequently deepened from a landing preview into coordinated staff/client surfaces: six client destinations, structured action cards, one PAIGE conversation state, explicit audiences, human handoff continuity, and a staff Portal view with privacy projections. No connectivity claim changed.

### Illuminated Precision hero pass — 2026-08-21

The tenant prototype now implements Signal Field, Living Lineage, Creation Chamber, and Execution Theater as interactive representative surfaces. Studio navigation is defensive against missing view lookups, laptop-height Home spacing is corrected, Data Health is an Insights observation surface, and the redundant desktop PAIGE header launcher is removed. Automated shell tests cover all six destinations, Studio rendering, and persistent theme switching. The browser screenshot/deployment limitation is recorded without fabricating evidence.

### Calendar, Conversations, and spatial workspace pass — 2026-08-22

The tenant prototype now exposes canonical Calendar and Conversations mounts alongside representative, data-honest instrument anatomy. Calendar is the single time/commitment home under Work; Conversations remains under Clients. The shell adds persisted expanded/compact/canvas navigation, PAIGE as an optional command drawer, and same-application detached workspace context synchronization without moving authorization into the browser.

### Solo Command Center Mind — owner-approved build in draft review (2026-08-28)

- **Status: DRAFT PR ONLY; not shipped, merged, or deployed.** Owner-approved prototype:
  `paige-command-center-mind-flow-prototype.html`, SHA-256
  `2CE38FC21DD1C6B6DD0C5816A63E2FA09F80245F09BB73F809DA52089F69`, 57,193 bytes.
- Solo Command Center's proposed customer-facing information architecture is exactly
  **Systems Check · Mind**. Systems Check remains first/default. Retired Solo Directory and History
  addresses resolve to canonical Mind; Agency, Sub-account, Enterprise, and operator owners remain
  unchanged.
- Mind is a read-only governed record index over existing tenant-scoped owners: indexed knowledge is
  LIVE; current pending decision references are LIVE SOURCE but non-actionable here; the latest Systems Check snapshot
  is PARTIAL history. Full historical series, resolved-decision history, helper provenance, and inferred
  semantic/causal relationships remain UNAVAILABLE.
- The interactive 3D topology is a PROPOSED presentation, not a new data owner. It is still by default.
  Direct mouse/keyboard manipulation is not business activity; finite motion may occur only after a
  genuinely newly observed grounded record. One existing PAIGE workspace remains the only workspace,
  and opening it does not attach, prefill, send, prepare, or start work.
- Tenant identity remains server-resolved. The Mind data child does not mount while `activeTenantId` is
  unresolved and remounts by tenant epoch so prior-account state and late responses cannot paint the
  next account.

### Solo Systems Check Operating Signal — owner-approved build in draft review (2026-08-29)

- **Status: DRAFT PR ONLY; not shipped, merged, deployed, or production-accepted.** The owner approved
  the Operating Signal prototype and authorized implementation through a green draft PR and preview;
  the separate final go-live gate remains required.
- The Solo Systems Check is a compact business-awareness surface over the existing tenant-scoped
  `systems_check_snapshot` rail. Persisted findings are grouped into confirmed, needs-attention, and
  unavailable reads; missing or partial evidence never becomes inferred health. Refresh motion is
  finite, interruptible, and labeled as a read with no manufactured per-category progress; reduced
  motion preserves the same text and state.
- Finding detail follows the grounded chain **signal → evidence/provenance → impact → recommended next
  step → owner decision → durable outcome**. Missing interpretation, decision, or resolution records
  are stated as missing. The one existing PAIGE workspace is the only executive-rundown/action seam;
  opening it does not attach context, prefill a message, send, prepare, or start work.
- **Explicitly deferred/unavailable in this slice:** emerging trend analysis, market/competitor pulse,
  capacity watchpoints, owner-configurable watchpoints, and any separate phone/A2P readiness logic.
  A future communications read may consume only the canonical server-resolved `can_send_sms` result
  when that narrow contract exists. Systems Check does not own Settings, Calendar, Conversations,
  Mind, the shared shell, provider configuration, or new backend logic.

### Setup-owned A2P legal identity — implementation draft (2026-09-01)

- **Status:** local implementation draft; Gate 2 pending. Not merged, deployed, provider-submitted,
  or production-accepted.
- **Human owner:** each tenant confirms legal identity in Setup. The full registration number is
  write-only and vaulted; only its last four digits return to the client.
- **Canonical data:** `tenant_legal_profile` supplies legal name, entity/formation details, public
  website, structured registered address, regions, registration identifier, and an active confirmed
  Team member as authorized representative. Messaging registration consumes this record.
- **Provider architecture:** platform operator Primary Customer Profile on the Twilio master account;
  each client uses a Secondary Customer Profile and downstream Brand/Campaign/Messaging Service in
  its own subaccount. Provider identifiers and submission state are server-owned.
- **PAIGE boundary:** may explain missing fields and propose non-sensitive facts for confirmation;
  cannot invent the tax number, choose the representative, submit, purchase, or imply approval.

- **2026-09-02 — three doctrine files said the Trust Compass migration was not on production. It is.**
  `docs/doctrine/autonomy-architecture.md`, `docs/doctrine/one-approval-gate.md` and
  `docs/brain/glossary.md` each stated that `20261039000000` was *"not applied to production yet"* /
  *"neither it nor the resolver exists on prod today."* A read-only catalog query on ref
  `xygzykjyynhzqytbqnzu` (2026-09-02) returns `trust_effective_rung()` and
  `resolve_tool_autonomy(uuid,text)` as **existing**, with `20261039000000` and `20261040000000` in
  `schema_migrations` (910 applied = 910 repo `.sql` files, zero drift). All three corrected in place
  per §58 — struck, not deleted.
  **Why it mattered beyond bookkeeping:** `one-approval-gate.md` instructed builders *"Do not write,
  or build against, a claim that the Compass evaluates the action contract until it is persisted and
  enforced server-side."* That instruction rested on a false premise, so a slice obeying it would have
  under-built against a clamp that is in fact deployed.
  **The correction is deliberately narrow, and the caution survives in a truer form.** What was proven
  is **existence** (catalog class). **Runtime enforcement was NOT tested and remains `UNVERIFIED`** —
  and `20261019001000:41-48` separately states the compass clamps *at render only*, since
  `resolve_tool_autonomy` reads `tenant_tool_autonomy` and never reads the compass. Reconciling that
  with §4's record of `operator_rls_coverage` FAILING and already capping the ceiling 3→2 is open work
  owned by whoever holds autonomy. No approval-authority claim changed: it remains the server
  action-risk policy plus the confirmation gate.

- **2026-09-02 — "the Spine exists" was being read as "the departments are connected." They are not.**
  One registered capability (`pipeline.deal_stage_evidence`, read-only, Chat `PARTIAL`, Mind
  `UNAVAILABLE`) against **105** inline Chat tools, both measured by the repo's own guards. Recorded in
  §5 and in full in `docs/brain/paige-spine-and-rail-state.md` so no future session infers platform-wide
  Spine connectivity from the foundation's presence.

- **2026-09-02 — an absent Solo activity feed was available to be misread as an idle workspace**, and
  **my first record of it overstated how safely it fails.** `authenticated` holds no SELECT grant on
  `paige_client_events` in production, so the read fails before RLS — that part stands. But the first
  version said the hook "honestly renders an error rather than an empty feed" and called it "a dead
  capability, not a lying one." ~~*That framing.*~~ **CORRECTED (§58):** it generalised from one
  hook's internal branch to the platform's behaviour without checking any consumer. Issue **#746**
  established, and this session re-verified, that the two shipped Context Rail consumers read only
  `{ events, connected }` and that `historyError`/`historyLoaded` have no reader in `src/` — so a
  refused read renders as "nothing yet". The Solo Trust Compass consumer *does* distinguish, which is
  why the truthful status is **not reliable enough**, not *never*. Status of record: *production Rail
  history cannot be read, and the current owner-facing consumer treatment is not reliable enough to
  distinguish denied history from empty history.* **The lesson is the one this log exists for: a hook
  returning an error is not a person seeing one, and only the consumer settles that.**

### Solo Settings → Setup durable persistence repair — release candidate (2026-09-02)

The existing six-section Setup design is preserved. The repaired shared Solo flow now has a real
tenant-scoped edit/save/readback contract, honest validation, pending, failure/retry, conflict,
cancel, stale-response, account-switch, and read-only states, plus field provenance and global
legal-entity support. Business ownership records never change Team membership or workspace
authority. Owner versus Admin permission is server-enforced. Full registration identifiers are
Vault-only and masked on read; legal ownership, percentages, exact addresses, private contacts,
and representative IDs are excluded from PAIGE and Rail by default. The unsafe legacy whole-brief
PAIGE persona projection is removed pending a separately approved safe Spine contract. The exact
migration and checked-in real-role rollback proof passed against production schema. Truth remains
`PARTIAL` until exact-head deployment and authenticated Owner save, reload, reopen, and account
switch proof. Internal `paige_audit_log` attribution is not Rail.
