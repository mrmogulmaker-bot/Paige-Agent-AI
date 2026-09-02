# Solo Platform Taxonomy and UI Flow Standard

**Owner-directed canonical standard — 2026-09-02.** This is the repository-native map for every
current and future Solo surface. It controls how a Solo department, subtab, route, flow, and PAIGE
connection are classified before design or implementation. It does not claim that a named
capability is live. Current facts below are grounded at `origin/main`
`76bb3bbca74ff4214feba28995d5cd0b9196fb6b` (PR #728); authenticated production behavior was not
re-tested in this docs-only pass and is `UNVERIFIED` unless a cited authority says otherwise.

## 1. Canonical Solo baseline: one product, one shell

There is **one shared Solo shell/template**. Tenant facts, records, permissions, entitlements,
connections, availability, and business configuration may vary. The shell, route taxonomy, page
host, navigation, responsive contract, base surfaces, and single PAIGE workspace may not fork by
account. A blank, disconnected, unauthorized, or partially configured tenant gets the same honest
surface with a truthful state; it does not get a different Solo product.

Classify every proposed change before editing:

| Class | What belongs here | What does not |
|---|---|---|
| **Shared Solo shell** | Route registry, global destinations, one screen host, shell geometry, navigation, single PAIGE workspace, responsive/scroll policy | Account-specific business rules or domain mutations |
| **Tenant context** | Server-resolved active tenant, role/permission, entitlements, connected providers, tenant facts and records | A forked route tree, alternate shell, client-selected tenant authority |
| **Domain behavior** | The owning page's reads, forms, edits, creates, authorization, domain outcomes and recovery states | Chat core, Mind core, Rail core, Trust policy or a private approval gate |
| **Shared Spine primitive** | Stable registry schema, safe evidence resolver, action-risk/confirmation policy, shared outcome/Rail contract | Feature-specific business logic or raw provider data |

The shell authority is [`docs/doctrine/solo-shell-contract.md`](../doctrine/solo-shell-contract.md).
This standard does not restate its routing, CSS-clip, scroll-owner, PAIGE-open, or four-viewport
rules. It assigns the human jobs and domain flows that live inside that shell.

## 2. Operating taxonomy mapped to the actual Solo product

The operating taxonomy groups human work; it does **not** rename or manufacture routes. When a job
crosses two departments, each domain keeps its own truth and the flow links between them.

| Operating group | Human work | Current Solo homes |
|---|---|---|
| **Business foundation** | Establish the business, people and permissions; connect providers; configure integrations; understand billing and security/data boundaries | **Settings** → Setup, Team, Connections, Integrations, Billing, Security & data. Notifications and Vault remain Settings surfaces with their own maturity. |
| **Client operating work** | Know and serve people; retain relationship notes/doc references; handle conversations; coordinate assignments and calendar work; expose a client Portal where supported | **Clients** → People, Conversations, Calendar, Portal. Notes remain purpose-limited client-record data; assignments remain within an owning workflow until a real shared contract exists. No parallel generic “Notes,” “Docs,” or “Assignments” department is implied. |
| **Revenue and delivery** | Define offers, manage configurable deal flow, preserve sales/routing truth, and connect work to client outcomes | **Campaigns** → Overview, Catalog, Sales, Pipeline, Social, Performance. The six-tab boundary is locked and remains exact. Pipeline is configurable domain behavior, not a global sales taxonomy. Revenue, ROI, routing, activation, and client outcome claims require proven sources. |
| **Growth and communications** | Present offers, coordinate campaigns/social/performance, communicate, and schedule only through proven provider contracts | Campaigns → Catalog, Social, Performance; Clients → Conversations and Calendar; Settings → Connections. Messaging/calendar capability is never inferred from a rendered control or configured-looking record. |
| **Intelligence and governance** | Ask PAIGE, understand known facts, inspect system readiness, apply risk/confirmation, and see attributable outcomes | The single **PAIGE workspace** → Chat, Knowledge, Helpers, Capabilities; Command Center → Systems Check, Mind; Trust Compass; Analytics. **Rail** and action-risk/confirmation are shared Spine infrastructure, not extra Solo destinations. |
| **Capability ecosystem** | Discover and understand available or installed extensions without unsupported commerce or entitlement claims | **Marketplace** → Today, Browse, Installed, Updates. Marketplace stays first-class in the Solo shell; it is not silently folded into Integrations. |

### Locked Campaign boundary

Campaigns remains exactly **Overview, Catalog, Sales, Pipeline, Social, Performance**. This standard
groups those tabs for operating clarity; it does not replace them with another sales taxonomy,
move Pipeline into Clients, infer revenue/ROI, or authorize routing or activation.

## 3. Required surface card

Every department and subtab must have a current surface card before design or implementation. A
section in this document may serve as the card; a specialized domain document may extend it by
linking back here. Never copy a canonical provider, permission, approval, or Spine contract into the
card—link its owner.

Each card must state all of the following:

1. **Human job** — the outcome the owner is trying to reach, including first use and return use.
2. **Owning domain/data** — the source of truth and the server authority that may read/write it.
3. **Solo-shell location** — destination, subtab, nested mode, and supported entry/return paths.
4. **Input/edit/create flows** — the actual human actions, saves, refusals, retries, abandonment and
   account-switch behavior; “none proven” is valid.
5. **Evidence** — safe facts and provenance the domain can publish; never raw sensitive payloads.
6. **What PAIGE may know** — only evidence registered and resolved within active authority.
7. **What PAIGE may propose/do** — proposal and mutation are separate; unavailable actions stay
   unavailable.
8. **Approval boundary** — risk classification and the one canonical Chat confirmation gate for
   governed action; the domain does not build another gate.
9. **Rail effect** — the safe attributable outcome, or `UNAVAILABLE`; an event name is not proof of
   persistence.
10. **Truth and browser proof** — `LIVE`, `PARTIAL`, or `UNAVAILABLE`, plus explicit `UNVERIFIED`
    where authenticated behavior has not been driven. `NOT CONNECTED` is an account state under an
    unavailable capability, not a fourth implementation maturity.
11. **Dependencies/collisions** — shared files, providers, migrations, other owners, active work,
    and the precise boundary that prevents parallel ownership.

Truth labels apply to each capability leg, not decoratively to a whole page. `LIVE` requires a real
contract and relevant proof. `PARTIAL` names which legs exist and which do not. `UNAVAILABLE` means
the human or PAIGE cannot perform the claimed job. Static fixtures, structural tests, migrations,
rendered cards, and “configured” URLs are not authenticated-account capability proof.

## 4. Current canonical surface cards

These cards establish ownership and known maturity. They are not a substitute for a fresh collision
check or exact-head verification when a surface is changed.

### 4.1 Command Center — Systems Check and Mind

**Human job and location.** Command Center is the operating overview. Its two canonical subtabs are
**Systems Check** (inspect what was checked, passed, failed, or could not run) and **Mind** (inspect
the governed knowledge/memory experience). Both are form-fitting Solo surfaces.

**Owner/data and flows.** Systems Check owns its persisted tenant-safe findings and retry/recovery
behavior where a runnable contract exists; it may never infer health from a skipped or unreadable
check. Mind owns its visible recall/knowledge/skill/identity/judgment projections, not the source
records of every contributing domain. Current Mind areas are mixed: Recall `PARTIAL`, Knowledge
source `LIVE`, Skills `UNAVAILABLE`, Identity `PROPOSED`/therefore `UNAVAILABLE`, Judgment
`PARTIAL`; the overall experience is `PARTIAL`.

**PAIGE, approval and Rail.** PAIGE may summarize registered safe findings/evidence within current
authority. “Open PAIGE” without attached registered context starts no work and proves no context.
Systems Check or Mind may propose a next step; any governed mutation routes through the shared
action-risk policy and Chat gate. Rail receives only safe attributable outcomes when registered;
otherwise that leg is `UNAVAILABLE`.

**Proof/dependencies.** Preserve `pass`, `fail`, and `could_not_run`/unassessed as distinct states.
Authenticated current-account, retry, account-switch, PAIGE-open and Rail behavior are
`UNVERIFIED` in this pass. Collisions: Command Center host, Mind resolver, Systems Check core,
PAIGE workspace and Spine registry.

### 4.2 The one PAIGE workspace — Chat, Knowledge, Helpers, Capabilities

**Human job and location.** PAIGE is the one shell workspace, never a second per-page chat. Its
canonical views are **Chat**, **Knowledge**, **Helpers**, and **Capabilities**.

| View | Human flow and domain truth | PAIGE/action/Rail maturity |
|---|---|---|
| **Chat** | Ask, clarify, review evidence, receive a proposal, confirm when required, see success/refusal/recovery. Chat owns final binding and user-visible confirmation—not domain data. | Registry/approval foundations are `PARTIAL`; each tool remains separately truth-labeled. Chat invokes only registered scoped contracts and records only safe attributable outcomes. |
| **Knowledge** | Inspect tenant-scoped knowledge available to PAIGE and understand provenance/absence. | Read is data-dependent; no source record becomes safe merely because this view exists. Mutation is `UNAVAILABLE` unless separately registered and proven. |
| **Helpers** | Understand available specialist/helper support. | Current active dataset is `PARTIAL`/often absent. A label or fixture is not an active helper. |
| **Capabilities** | Understand what PAIGE can read or do, current availability, and governed posture. | Data-dependent and `PARTIAL`. It must not promise a provider action, autonomy, or approval path the runtime cannot perform. |

**Approval/dependencies/proof.** The only approval authority is
[`docs/doctrine/one-approval-gate.md`](../doctrine/one-approval-gate.md). The shared registry and
resolver are specified by [`paige-spine-integration-standard.md`](paige-spine-integration-standard.md).
Authentication, permission, confirmation, abandonment, retry, account-switch and outcome proof are
required per tool; they are not inherited from Chat rendering. This docs pass did not re-drive them.

### 4.3 Trust Compass, action-risk/confirmation, and Rail

**Human job and location.** Trust Compass is the visible governance experience. Action-risk and
confirmation are shared server/Chat governance seams. Rail is safe durable history/outcome
infrastructure. Only Compass is a peer Solo destination; action-risk and Rail do not get invented as
new department pages.

**Truth.** The server action-risk classification plus the one Chat confirmation gate is the current
authority. A Compass dial, label, lane, migration, or stored preference does not itself grant
permission. The Solo Compass experience remains non-authoritative; authenticated production
persistence and enforcement were not proven here. Treat Compass enforcement as `UNAVAILABLE` and
the broader experience as `PARTIAL`. Rail is `PARTIAL` platform-wide and capability-specific.

**Flows and boundaries.** A human may inspect governance posture and confirm/refuse a presented
action in Chat. The domain re-resolves actor, tenant and permission; Chat proves the confirmation;
the executor performs the action; Rail records the safe attributable result if registered. No
surface may equate request, proposal, confirmation, provider acceptance and completed outcome.
Collisions: shared action-risk, approval, registry, executor, Compass policy and Rail ownership.

### 4.4 Clients — People, Conversations, Calendar, Portal

**Human job and location.** Clients owns relationship operating work through exactly **People,
Conversations, Calendar, Portal**. Pipeline belongs to Campaigns. “Delivery” is not a current visible
Clients tab.

| Subtab | Owner/data and human flow | PAIGE, action, Rail and truth |
|---|---|---|
| **People** | Client/contact records: find, inspect, create/edit where the tenant-safe upsert contract and permission allow; refuse/retry without cross-tenant leakage. Relationship notes remain purpose-limited fields on the record. | PAIGE may use registered safe contact facts and propose changes; create/edit requires the domain authorization and canonical gate. Overall `PARTIAL`; authenticated create/edit/permission/account-switch proof must be supplied by the changing slice. |
| **Conversations** | Canonical tenant inbox: inspect threads/messages and send only when sender, consent, permission and provider readiness are proven. | PAIGE may summarize authorized safe message evidence and draft; send is a separate governed provider action. `PARTIAL`; unsupported channels and absent provider contracts are `UNAVAILABLE`. |
| **Calendar** | Coordinate appointments, availability and tasks from the Clients-owned calendar workflow; current calendar modes are Month, Week and Agenda. Routed destinations also cover Tasks, Booking pages, Availability and Connections, with Settings → Connections owning provider configuration. | Reads/writes are capability-specific and `PARTIAL`. A rendered event, drag affordance or route is not a saved mutation. Proposals may be made from safe evidence; create/move/send requires a proven calendar contract and canonical approval treatment. |
| **Portal** | Understand and operate the client-facing workspace where the canonical thread/record contracts support it. | `PARTIAL`; canonical thread convergence and full mutation coverage remain incomplete. Never infer client visibility from tenant visibility. |

**Notes/docs/assignments.** A note or document reference stays with the client/domain record and its
audience contract. Raw notes, files, messages, transcripts or recordings do not automatically enter
Mind, Chat or Rail. Assignments stay with their owning workflow until a shared assignment contract
is proven. “Unified activity” is `UNAVAILABLE`; do not fabricate an activity feed from unrelated
timestamps.

**Proof/dependencies.** Prove empty/first client, populated client, create/edit/save, permission
refusal, retry, abandonment, account switch, client switch, PAIGE closed/open and unaffected sibling
tabs. Collisions: shared Clients workspace, People owner, Conversations provider/readiness owner,
Calendar/Settings return path, Portal/client visibility and Spine bindings.

### 4.5 Campaigns — the locked six tabs

**Owner/data.** Campaigns owns offer/campaign/sales/pipeline/social/performance domain records and
actions. It does not acquire authority over client records, billing truth, provider credentials,
Chat core or Analytics provenance merely because it references them.

| Subtab | Human job and input/edit/create flow | Evidence, PAIGE/action/Rail, current truth |
|---|---|---|
| **Overview** | Orient to proven campaign work and next steps; no invented summary metrics. | `UNAVAILABLE` where no canonical aggregate exists. PAIGE can use only registered underlying evidence. |
| **Catalog** | Inspect and manage offers/catalog entries only through a proven tenant contract. | Surface `PARTIAL`; create/edit and downstream activation are separate. No fabricated price, entitlement or availability. |
| **Sales** | Understand proven sales/routing state without imposing a global sales model. | `UNAVAILABLE`/proposed unless the exact tenant contract proves otherwise. No inferred conversion or revenue. |
| **Pipeline** | Configure and operate tenant deal stages and deal state without duplicate identity or silent routing. | Overall implementation is mixed `PARTIAL`. Registry capability `pipeline.deal_stage_evidence` is `PARTIAL`; mutation remains separately governed/unproven. No auto-activation. |
| **Social** | Inspect or prepare social work only when channel/provider contracts exist. | `UNAVAILABLE` absent provider proof; a drafted post is not published. |
| **Performance** | Inspect source/date-range/provenance-backed outcomes. | `UNAVAILABLE`/proposed until measurements are proven. Never infer ROI, attribution or recommendations. |

**Approval/Rail/proof.** PAIGE may explain safe registered evidence and propose a domain action. Any
create/edit/archive/route/publish action needs domain authorization, risk classification, the
canonical gate where required, idempotency and an attributable outcome. Prove the exact six-tab
form-fit at all required viewports, empty/populated/configurable Pipeline, create/edit/refuse/retry,
account switch, PAIGE open/closed and a known-good sibling surface. Collisions: Campaign host,
Pipeline identity/registry, Clients records, Analytics provenance and provider owners.

### 4.6 Analytics — Brief, Sales funnel, Revenue & profit, Retention, Acquisition, Decisions

**Human job and owner/data.** Analytics explains proven performance by source, provenance and date
range. It owns analytical projections, not the source domain's records and not unsupported advice.

| Subtab | Required truth | Current maturity |
|---|---|---|
| **Brief** | A sourced, dated summary with explicit unavailable legs. | `UNAVAILABLE` unless the account's evidence bundle proves a partial brief. |
| **Sales funnel** | Stage definitions, source and time range; no inferred funnel. | Baseline `UNAVAILABLE`; may be `PARTIAL` only from proven tenant evidence. |
| **Revenue & profit** | Real money sources and definitions; comped or estimated values never become revenue/profit. | `UNAVAILABLE`. |
| **Retention** | Cohort/customer definition, source and range. | `UNAVAILABLE`. |
| **Acquisition** | Connected source, attribution model and date range. | Capability `UNAVAILABLE`; UI may report account state `NOT CONNECTED`. |
| **Decisions** | Evidence-backed recommendation with assumptions and no fabricated benchmark. | `UNAVAILABLE`. |

PAIGE may explain authorized analytical evidence and its limits. An analytical recommendation is not
permission to mutate Campaigns, Clients, billing or providers. Rail records a later governed action's
outcome, not an invented analytics event. Prove unavailable/error/partial states, provenance/date
range, account switch and PAIGE use with real authenticated evidence before any `LIVE` claim.

### 4.7 Marketplace — Today, Browse, Installed, Updates

**Human job and owner/data.** Marketplace is the first-class capability ecosystem: understand what is
available, what this tenant has, and what changed. It is not a generic catalogue of invented prices,
ratings, publishers, entitlements or actions.

| Subtab | Flow and truth |
|---|---|
| **Today** | Curated tenant-safe orientation only from proven records; otherwise `UNAVAILABLE`. |
| **Browse** | Tenant catalogue rows are `PARTIAL`; unsupported metadata stays absent. |
| **Installed** | Installed count/state is `PARTIAL` and must be server-scoped to the active tenant. |
| **Updates** | `UNAVAILABLE` until a real update source/lifecycle exists. |

Marketplace mutations are `UNAVAILABLE` unless a separately authorized entitlement/install contract
is proven. PAIGE may explain safe catalogue/installed evidence; she may not install, buy, rate or
grant entitlement from a listing. Rail effects and authenticated mutation proof are therefore
`UNAVAILABLE`. Collisions: Marketplace RPCs, entitlements, billing, Integrations and Spine registry.

### 4.8 Settings — foundation and configuration

**Human job and owner/data.** Settings owns tenant business configuration and provider readiness,
not the downstream domain work that consumes it. Its canonical subtabs and current declared truth
come from `src/solo/settings-contract.ts`.

| Subtab | Human flow and domain boundary | PAIGE/action/Rail, current truth |
|---|---|---|
| **Setup** | Confirm and edit owner/business truth through the Setup-owned contract. | `LIVE` surface; each field/save still requires authenticated proof. PAIGE may use confirmed safe facts, never invent missing ones. |
| **Team** | Inspect roster, work details and enforced roles; invite/edit only through Team authority. | `PARTIAL`. Job description is not permission. Invite/role change is governed action; authenticated send and account-switch proof remain capability-specific. |
| **Connections** | Understand and manage communications/calendar readiness without exposing secrets. | `PARTIAL`; nested map below. Provider configuration is not successful send/sync. |
| **Integrations** | Discover external tools and manage only supported safe handoffs. | `PARTIAL`; nested Integrations and Automations views below. |
| **Notifications** | Understand customer/delivery preferences only where a unified contract exists. | `PARTIAL`; delivery-failure preferences are `UNAVAILABLE`. No fake toggles. |
| **Security & data** | Inspect supported security/data controls and boundaries. | `PARTIAL`; do not infer export/delete/compliance capability from policy copy. |
| **Vault** | Future secret/credential experience without exposing or accepting unsupported secrets. | `UNAVAILABLE` (source label `PROPOSED`). |
| **Billing** | Inspect proven subscription state. | `PARTIAL`; invoices/payment method and complete usage/limits are `UNAVAILABLE`. |

#### Connections nested surfaces

| Segment | Human job and ownership | Truth/action boundary |
|---|---|---|
| **Communications** | See whether email/SMS/voice identity and send prerequisites are ready from canonical safe resolvers. | `PARTIAL`; readiness does not prove send. Secrets/provider internals never render or enter PAIGE context. |
| **Calendars** | Configure calendar connections/routing/notification rules; Clients → Calendar owns the operating calendar. | `PARTIAL`; connected-looking is not sync/read/write proof. |
| **Registration** | Prepare/review/save business texting registration. | Preparation may be available; carrier filing is `UNAVAILABLE`. Saving must never say filed. |
| **Health** | Secondary projection of the same canonical readiness record. | `PARTIAL`; never a competing resolver or inferred health. |
| **Available** | Browse provider possibilities and honest availability. | Mixed `PARTIAL`/`UNAVAILABLE`; catalogue presence grants no contract. |

#### Integrations nested surfaces

| View | Human job and ownership | Truth/action boundary |
|---|---|---|
| **Integrations** | Browse supported provider/tool bridges and open their bounded configuration panels. | `PARTIAL`; each provider has independent account/permission/read/write proof. |
| **Automations** | Inspect/configure automation capability through the Settings → Integrations owner. Legacy `/automations` is not a second visible department. | `PARTIAL`; a connection, template or rendered run is not autonomous execution. Governed execution uses shared risk/approval and safe outcomes. |

Connections and Integrations are the two authorized visible-scroll Settings surfaces; other Settings
destinations remain form-fitting unless the owner approves a change. Prove first use, populated,
read/write permission, OAuth return, cancel/abandon, retry, provider refusal, account switch,
secret non-disclosure, PAIGE closed/open and correct return paths.

## 5. Build method and ownership handoff

1. **Map the full owner flow first.** Establish entry, first/empty state, central action, success,
   refusal, error/retry, abandonment, account/client switch, PAIGE open/closed, exit/return and sibling
   regression before isolated visual polish. A locally beautiful card inside a broken flow fails.
2. **The domain owns UI, data and actions.** It publishes only safe evidence and outcomes to the
   Spine. The Spine never becomes a shadow domain store.
3. **Chat completes final binding.** A domain registers a stable evidence/action/outcome contract;
   the designated Chat owner completes the bounded tool/adapter, confirmation behavior and final
   user-visible flow. Domains do not hardwire Chat, Mind, Trust, Rail or Systems Check.
4. **Classify the change.** Name shared shell, tenant context, domain behavior and shared Spine
   primitive impacts separately. Name the file/contract owner and collision before editing.
5. **Use self-service registration for stable contracts.** A normal entry in the canonical Spine
   registry needs no Spine Change Request. Raise an **SCR only for a genuinely new shared primitive**:
   registry schema, resolver semantics, safe-field/lifecycle rule, approval authority, Chat adapter
   contract, executor or Rail projection meaning.
6. **Preserve gates and truth.** Design/intended-function approval precedes implementation. Normal
   implementation, tests, review, preview and repair may then complete without routine pauses. Exact
   final go-live approval is still required before ready-for-review/merge/deploy. No docs, UI, fixture
   or migration converts `UNVERIFIED` into proof.

## 6. Required preflight and enforcement

Every repo-native agent/workflow instruction for Solo design or implementation must include this
exact line:

> Read docs/brain/README.md, the Solo Platform Taxonomy, the PAIGE Spine Standard, and the relevant surface card before design or implementation.

“Solo Platform Taxonomy” means this file. “PAIGE Spine Standard” means
[`docs/brain/paige-spine-integration-standard.md`](paige-spine-integration-standard.md). “Relevant
surface card” means §4 here plus any linked domain authority. This preflight is additive to the
master-reference, tier-matrix, Flow-by-Flow, collision, proof, review and go-live gates.

The exact line is enforced in `CLAUDE.md` §69 and `.claude/skills/second-brain/SKILL.md`. A separate
proposed Paige-repository-only amendment for an installed/global Flow-by-Flow skill is an owner-review
artifact outside the repository; it is not installed or treated as current global law.

## 7. Canonical authorities—link, do not duplicate

- Solo shell/routes/layout/scroll/viewport proof:
  [`docs/doctrine/solo-shell-contract.md`](../doctrine/solo-shell-contract.md)
- Spine registry, evidence, actions, outcomes and SCR boundary:
  [`docs/brain/paige-spine-integration-standard.md`](paige-spine-integration-standard.md)
- Approval proof and one confirmation channel:
  [`docs/doctrine/one-approval-gate.md`](../doctrine/one-approval-gate.md)
- Pipeline identity and governed archive boundary:
  [`docs/brain/pipeline-identity-contract.md`](pipeline-identity-contract.md)
- Connections/Rail communications contract:
  [`docs/doctrine/connections-rail-contract.md`](../doctrine/connections-rail-contract.md)
- Tier availability:
  [`docs/doctrine/tier-matrix.md`](../doctrine/tier-matrix.md)

When these authorities disagree with a rendered surface, current source and authenticated evidence
win; reconcile the stale document in the same change. Never resolve disagreement by duplicating a
new rule in another file.
