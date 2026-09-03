# PAIGE Mind — the integration matrix

**Read this before proposing, sequencing, or building any Mind capability.** It answers one
question per Solo surface: *can this surface safely give PAIGE real, tenant-scoped, source-backed
evidence — and if not, what exactly is in the way?*

Grounded 2026-09-03 against `origin/main` `03d771f9fe010fd94abf6dbdc05d14fa9b41c7c4`.

## What this is, and what it is not

It **is** a state map and a planning ground: read-only architectural truth, produced from primary
sources. It changes no runtime surface, no shared module, no Rail, no Spine, and no Mind
implementation.

It is **not** a backlog. Durable work lives as GitHub issues (§ *Parked findings* below); the PAIGE
Attention Register is the owner-facing view over them and is `UNAVAILABLE` until its board exists
(`../doctrine/paige-attention-register.md` §7). Do not grow a competing list here.

It is **not** authorization. A row reading "eligible" is an observation about the contract, never
permission to build. Implementation is assigned by the owner.

## How to read this — the two axes, and why they are separate

The single most common way a document like this misleads is by letting a maturity label imply a
working capability. So every surface carries **two independent answers**, and the second one is the
one that matters operationally:

| Axis | Question | Values |
|---|---|---|
| **A — Mind readiness** | Could this surface carry evidence under the contract as shipped? | `LIVE` · `PARTIAL` · `BLOCKED` · `UNAVAILABLE` · `UNVERIFIED` |
| **B — Runtime evidence today** | Does authenticated, tenant-safe Mind evidence actually flow for a real owner right now? | `YES` / `NO` |

**Axis B is `NO` for every surface in this document, including Pipeline.** There is no exception
and no partial credit. A `PARTIAL` on axis A means *the projection is implemented and covered by
tests* — it does **not** mean a person gets an answer. Anyone reading a `PARTIAL` as "working" is
reading it wrong, and this paragraph exists so that misreading cannot be honest.

`LIVE` is reserved for authenticated proof on the real platform. **Nothing in this matrix is `LIVE`.**

## The platform-wide dependency that gates everything

Two facts, both verified on production this pass, bound every row below:

1. **The Rail cannot be read.** `public.paige_client_events` grants `authenticated` and `anon`
   nothing at all — its ACL is `{postgres=arwdDxtm/postgres}`, and `has_table_privilege` returns
   false for both roles. A table grant is checked before RLS, so the row policies never run. Every
   Mind read must therefore go through a `SECURITY DEFINER` lens **by construction**. This is
   issue **#746**, release-blocking, owned by the Rail workstream.
2. **The Rail is nearly empty.** It holds **7 rows** across the entire platform.

Together these say something the per-surface rows cannot: *broad Mind intelligence is not one lens
away.* Even where a surface is structurally eligible, there is almost nothing recorded to read and
no owner-visible way to read it. **This is a dependency, not a Mind work item — Mind does not repair
the Rail.**

## The four structural constraints

These are properties of the shipped code, verified at source. They decide eligibility before any
design question is reached.

- **C1 — the Rail is per-client, at three layers.** `paige_client_events.contact_id` is
  `NOT NULL REFERENCES clients(id)`; `record_rail_event` raises `contact not in tenant`; the Chat
  emitter returns early `if (!contactId)`. **A workspace-level outcome has nowhere to land.**
- **C2 — the resolver accepts one subject type.** `_shared/paige-spine/resolveEvidence.ts:40`
  rejects anything where `input.subject_type !== "client"`.
- **C3 — evidence loads only inside a client-scoped Chat turn.** `paige-ai-chat/index.ts` guards
  the load with `if (scopedClientId)`, so there is no Spine evidence in a general business question.
- **C4 — the safe summary is a constant.** The adapter returns a fixed sentence plus enumerated
  scalars against a declared allowlist. **A department whose value lives in free text, or in an
  unbounded number, cannot express it under this contract.**

**The registry holds exactly one capability** — `PAIGE_SPINE_CAPABILITIES = [PIPELINE_DEAL_STAGE_EVIDENCE]`
(`registry.ts:4`), declared `classification: "read"`, `riskPolicyKey: "read_only"`,
`approvalAuthority: "none"`, `chatBinding: "PARTIAL"`, `mindBinding: "PARTIAL"`, `maturity: "PARTIAL"`.
Every other surface below needs a **new registry capability** at minimum.

Three Change Requests are named but **not raised and not approved**, using the shorthand established
by `paige-spine-tool-migration-map.md:141-160`: **SCR-1** workspace-level outcome projection ·
**SCR-2** non-client subject types · **SCR-3** record/list evidence shape.

## The matrix

Each surface carries: owner flow · source of truth · safe evidence today · scope · safe facts ·
forbidden fields · Rail dependency · Spine dependency · Chat relationship · axis A · axis B ·
evidence class · collision/owner · recommended next slice.

---

### Pipeline — deal-stage outcome  ·  A: `PARTIAL`  ·  B: **NO**

- **Owner flow.** Ask PAIGE what a client's recorded stage outcomes prove, and get an answer that
  names its source rather than inferring past it.
- **Source of truth.** `public.get_pipeline_spine_evidence(text,integer)` over Rail rows written by
  `configure_tenant_pipeline` on a deal move.
- **Safe evidence today.** **Yes — the only one.** SECURITY DEFINER, pinned `search_path`, requires
  `auth.uid()`, server-resolved tenant, staff-role gate, subject addressed by the public-safe
  `clients.account_number`, fixed 19-column contract.
- **Scope.** Client subject. C1–C4 all satisfied.
- **Safe facts.** `change_type = "stage_changed"` · `outcome = "succeeded"` · `actor ∈ {person, paige}`
  · occurrence time · freshness (`available` / `stale`) · a constant summary · the opaque `rail:` citation.
- **Forbidden.** Deal id, pipeline/stage ids, contact/client/user/tenant ids, deal title, stage
  labels, activity summaries, task titles, client name, provider bodies.
- **Rail dependency.** Emits on a deal move only. **No other pipeline act emits anything** — create,
  archive, reorder and folder operations write nothing an owner can see. PAIGE's own Chat tool
  `deal_move_stage` also emits nothing, so *she cannot see her own move in her own evidence* (#755).
- **Spine dependency.** None for the read. Any Pipeline **write** joining the Spine is blocked on
  #755 first.
- **Chat relationship.** Read-only; no Chat tool, no approval path. The Mind block states the
  read-only boundary explicitly.
- **Axis B — why `NO`.** The authenticated two-Solo-tenant drive has never been run, and #746 means
  the underlying Rail row cannot be read in production anyway. The entry path was additionally broken
  until #765 (PR #773) and that repair is code-proven only.
- **Evidence class.** Production catalog + automated tests + a mutation-tested local-Postgres proof.
  **No authenticated runtime. No rendered proof.**
- **Collision.** #755 (governance, hard block on writes) · #746 · PR #729 · PR #776 · PR #706.
- **Next slice.** **Not more building.** The authenticated drive that would move it off `PARTIAL`,
  which is itself gated on #746. Do not widen `factValues` or add a second Pipeline capability
  before that drive exists — that widens an unproven contract.

---

### Clients  ·  A: `PARTIAL`  ·  B: **NO**

- **Owner flow.** Keep the book of people: add a contact, edit details, see history, decide portal access.
- **Source of truth.** A direct PostgREST `clients` read for the list; `upsert_contact` for writes.
  A client-scoped lens exists — `get_client_rail(uuid,integer,text)` — but it returns raw `title`,
  `summary`, `payload`, `ref_id`, `actor_user_id`.
- **Safe evidence today.** **No.** The list read is a raw table read, which does not qualify; the one
  lens that is correctly caller-scoped is **not Mind-safe** because it returns free text and internal ids.
- **Scope.** **Client subject — the only other surface where C2 is satisfiable today.**
  `clients.account_number` is unique per tenant, trigger-allocated, and already the Spine's addressing scheme.
- **Safe facts (enumerated only).** `lifecycle_stage` · `status` · `do_not_contact` ·
  `paige_shared_context_consent` · `portal_linked` (boolean projection of a link, never the id) ·
  `has_owner` · coarse freshness from `last_contacted_at` / `updated_at`.
- **Forbidden.** Every internal id; first/last name, entity name, email, phone, title, website,
  address fields, source, tags, primary offer, **`current_notes`**; note and communication bodies;
  Rail `title` / `summary` / `payload`.
- **Rail dependency — the decisive fact.** **The owner's own UI write emits no Rail event.**
  `upsert_contact` writes `audit_logs` only. The Chat path *does* emit (`crm_create_contact` /
  `crm_update_contact`). So evidence here today would reflect **PAIGE's edits and not the owner's** —
  a Mind capability built on it would describe a partial and misleading history.
- **Spine dependency.** A new registry capability. For an event-signal shape that is the only
  prerequisite. Any record/list read needs **SCR-3**.
- **Chat relationship.** 17 tools; reads plus `ordinary` and `high` writes.
- **Axis B — why `NO`.** No lens exists, and the outcome it would read is unreadable (#746) and
  incomplete (owner writes absent).
- **Evidence class.** Production catalog + source read. No authenticated runtime.
- **Collision.** Issue **#757** owns this domain and its own text says *"Do not start"* (blocked by
  #756/#746) · PR #591 edits the Chat handler · #779 · #772.
- **Next slice.** The narrowest contract-legal option is a single `clients.contact_changed` evidence
  capability over the **Chat-emitted subset only**, with a constant summary and enumerated facts. It
  is legal but **premature**: shipping it would let PAIGE state a history that silently excludes
  everything the owner did by hand. Not recommended until the producer gap and #746 are resolved.

---

### Calendar / Bookings  ·  A: `BLOCKED`  ·  B: **NO**

**Do not build a Calendar Mind lens, source projection, UI, or migration.** The groundwork is
genuinely promising and that is precisely why the blockers must be stated plainly rather than
worked around.

- **Owner flow.** Ask what a client's booking history shows.
- **Source of truth.** `internal_bookings` (tenant-owned, per-client FK, Rail-emitting via
  `trg_emit_booking_rail`). Two others are ineligible: `paige_bookings` has **no `tenant_id` column
  at all**, and the Cal.com proxy returns a raw provider body under a single global API key —
  provider payloads are forbidden to Mind outright.
- **Safe evidence today.** **No Calendar lens exists.** It would be net-new.
- **Scope.** **Client subject — satisfiable.** The emitter refuses contactless rows, so every booking
  Rail row is client-bearing by construction, even though `internal_bookings.contact_id` is nullable.
- **Safe facts (if it were ever built).** `booking_kind` (CHECK-constrained to four values) ·
  `change_type` from the three event kinds · `outcome` from cancellation state · occurrence · freshness.
- **Forbidden.** `start_at`, `status` and `booking_kind` as they sit in the Rail payload; attendee
  name/email; provider bodies; all internal ids.
- **Why BLOCKED — two independent, sufficient reasons.**
  1. **The Calendar capability contract records its own gap.** `../doctrine/calendar-capability-contract.md:78`
     states: *"**Rail | GAP.** No Calendar provenance/outcome rail contract exists — see FU-3."*
     FU-3 — what Calendar may record onto the Rail, and the explicit exclusion of raw messages,
     provider payloads, secret references, hidden reasoning and unrestricted notes from PAIGE
     context — is listed **recorded, not started**. That exclusion list is exactly what a Mind
     projection would have to be bounded by, and it does not exist.
  2. **A second Mind domain is a shared-primitive change.** `mindEvidence.ts:10-14` states the
     Pipeline projection is deliberately *not* a platform-wide primitive and that generalising its
     shape "changes Mind-wide retrieval semantics… that needs a Spine Change Request, not an import."
     The only approved SCR is the citation change; this is not it.
- **Compounding, either alone disqualifying.** Six open PRs own the Calendar and Rail-resolver seams
  (#673, #648, #646, #638, #644, #776), with **two deliberately unmerged competing Rail contracts**
  (#644 vs #776, parked as #777). And booking actor attribution is **not truthful**: the emitter
  hardcodes `p_actor_type => 'client'` while `internal_bookings` is written by five functions
  including PAIGE herself — so a projected `actor` fact would assert something the source disproves (**#786**).
- **Groundwork worth preserving.** The per-client Rail linkage, the enumerable fact vocabulary, and
  a real freshness clock are all sound. One asymmetry to carry forward: bookings are future-dated,
  so the Rail write time and the meeting time are different clocks and a staleness rule must say which.
- **Evidence class.** Production catalog + source read of migrations, emitter and contract.
- **Next slice.** None. Blocked contractually and jurisdictionally, not structurally.

---

### Command Center  ·  A: `BLOCKED`  ·  B: **NO**

- **Owner flow.** See what needs a decision, what the platform found wrong, and what PAIGE knows.
- **Source of truth.** `practice_dashboard_metrics` · `practice_attention_queue` ·
  `systems_check_snapshot` (three genuine caller-scoped DEFINER lenses) plus direct table reads for
  approvals, departments and knowledge.
- **Safe evidence today.** **Partly, and none of it Spine-shaped.** The three lenses are correctly
  scoped but two also return free text or internal ids; the rest are raw reads.
- **Scope.** Workspace. **C2 fails.**
- **Safe facts.** Counts and currency-in-cents (active clients, won value, at-risk, follow-ups due,
  check pass/fail counts). **All unbounded integers — C4 fails too**, since the contract admits only
  enumerated values.
- **Forbidden.** Finding interpretation text and evidence, check/run ids, tenant-authored stage
  labels, approval titles/summaries/draft bodies, knowledge titles.
- **Rail dependency.** None possible — workspace-level (C1).
- **Spine dependency.** **SCR-1 + SCR-2 + SCR-3.**
- **Note.** The existing "Mind" tab on this surface is a visualisation over three hooks. **It is not
  the PAIGE Mind contract** and should not be read as one.
- **Evidence class.** Production catalog + source read.
- **Collision.** PR #585 · PR #591 · #739 · open contract requests #647, #639.
- **Next slice.** None. The unblocked pre-work is answering **#647**, which is the Change Request
  this surface needs written.

---

### Campaigns → Pipeline configuration · Catalog  ·  A: `BLOCKED`  ·  B: **NO**

- **Owner flow.** Manage pipelines and stages; see what has actually been published.
- **Source of truth.** `get_pipeline_workspace` (caller-scoped DEFINER, but an **operational** read
  returning titles, labels, descriptions and ids — never a Mind source); three raw table reads for
  published artifacts; `get_pipeline_routing_evidence` (a correctly-guarded lens).
- **Safe evidence today.** No — for the catalogue itself.
- **Scope.** Workspace. **C2 fails.**
- **Safe facts.** Published counts; per-form `routing_state` (a closed set) and `routing_configured`.
  Capture counts are **bounded-window** and must never be projected as lifetime totals.
- **Forbidden.** Page/funnel/form ids, names and slugs; the public href (leaks the tenant slug);
  automation config; raw dispatch maps.
- **Rail dependency.** None; publishing writes only to `paige_audit_log`, which has **no Solo reader**.
- **Spine dependency.** SCR-1 + SCR-2; SCR-3 for anything list-shaped.
- **Evidence class.** Production catalog + source read. **Collision.** #760 · PR #312 · PR #706.
- **Next slice.** None. `get_pipeline_routing_evidence` is the correct *shape* of a workspace lens
  and is the reference to cite when SCR-2 is raised.

---

### Campaigns → Sales (form captures)  ·  A: `BLOCKED`  ·  B: **NO**

- **Owner flow.** Know which captures became a person or a deal.
- **Source of truth.** A direct `growth_form_submissions` read, bounded to a 200-row window.
- **Safe evidence today.** No — raw table read.
- **Scope.** The row carries a `contact_id`, so a client subject is reachable **in principle**;
  nothing in code resolves it to `account_number` today.
- **Safe facts.** `capture_routed` · `contact_reference_recorded` · `deal_reference_recorded` ·
  `processing_state` (closed set) · occurrence · freshness.
- **Forbidden.** All ids; `source` free text; the submission payload.
- **Rail dependency — a producer exists and is dead.** The `client_rail_event` automation target
  posts `surface: "form"`, which the production CHECK has **never** permitted. Confirmed on
  production: it has produced **zero** rows, ever (**#787**). So there is no outcome to project.
- **Spine dependency.** A new capability; no SCR strictly required if scoped to the routed subset —
  **but the producer must be repaired first.**
- **Evidence class.** Production catalog + production data + source read. **Collision.** #760.
- **Next slice.** None until #787 is decided by the Rail owner.

---

### Campaigns → Social · Performance  ·  A: `UNAVAILABLE`  ·  B: **NO**

- **Source of truth.** **None.** Social is a static component with no data prop. Performance is a
  coverage map, not a metrics surface; the only scalar it touches is a published-artifact count.
- **Safe facts.** **None.** Any statement would be inference, which the Mind contract forbids outright.
- **Intentionally unavailable — yes, and correctly.** Both surfaces exist partly to state what
  cannot be reported. Performance is the right model for how Mind should decline, and must not be
  given data to make it look otherwise.
- **Next slice.** None. Mind must be pointed away from these surfaces.

---

### Campaigns → Overview  ·  A: `UNAVAILABLE`  ·  B: **NO**

- **Source of truth.** None — `campaigns` is hardcoded empty, with a comment recording that the
  existing bridge is not tenant-authorized upstream so Solo deliberately does not call it.
- **Intentionally unavailable — yes.** That refusal is correct and **Mind inherits it**.
- **Next slice.** None; blocked on the absence of a tenant-authorized campaign source.

---

### Systems Check  ·  A: `BLOCKED`  ·  B: **NO**

- **Source of truth.** `systems_check_snapshot(p_scope)` — a genuine caller-scoped DEFINER lens:
  tenant derived in-body, operator scope gated, unknown scope raises.
- **Safe facts.** `check_count` · `pass_count` · `fail_count` · window timestamps.
- **Forbidden.** Finding text, check and run ids, registry internals, scan flavour, triggering actor.
- **Scope.** Workspace or platform — **never per-client. C2 fails.**
- **Intentionally unavailable — yes.** C1's per-client Rail and C2's client-only resolver are
  deliberate isolation boundaries, not oversights.
- **Next slice.** Not a Mind slice. Would require SCR-2 introducing a workspace subject type.

---

### Trust Compass inputs  ·  A: `BLOCKED`  ·  B: **NO**

- **Authority, restated so it is not eroded.** The **server action-risk policy plus the canonical
  approval gate** decide whether PAIGE may act. The Solo Compass dial is a **non-authoritative UI
  control that clamps at render only**. Mind may **consume** truthful availability and outcome
  signals; **Mind never changes the Compass's authority and never becomes a path toward raising it.**
- **Source of truth.** `get_platform_trust_compass()` for the platform ceiling (operator-gated,
  bounded scalars). The Solo dial is an in-memory client store with hardcoded literals.
- **Scope.** Platform. **C2 fails.**
- **Next slice.** None as Mind evidence. Any consumption of the availability signal is itself SCR-shaped.

---

### Connections  ·  A: `BLOCKED`  ·  B: **NO**

- **Owner flow.** Connect a personal calendar provider; configure tenant calendars and hosts.
- **Safe evidence today.** No — every read is a direct table read.
- **Scope.** Tenant for calendars, **per-user for providers**. Workspace-level; **C2 fails.**
- **Safe facts (hypothetically).** Calendar counts, `has_connected_provider`, host assignment
  present, and a send-capability state that **preserves `unknown` as distinct from `false`** — a
  distinction Mind must carry, never collapse.
- **Forbidden.** Every credential column; sync tokens; CalDAV URL and username; provider emails;
  booking page slug; availability JSON; brand JSON; all ids; raw provider and Postgres error strings.
- **Intentionally unavailable — yes, for provider state.** A connected provider is a fact about a
  *person*, not the workspace. **Mind must never assert a workspace-level "Google is connected."**
- **Per-client slice.** Booking outcomes are eligible in principle (see Calendar) — and Calendar is
  `BLOCKED`, so this is not an opening.
- **Note.** A credential-permission defect on this surface is tracked privately and is **not Mind
  work** (see *Parked findings*). Any future Connections projection must not assume the credential
  columns are protected.

---

### Integrations (n8n · MCP)  ·  A: `BLOCKED`  ·  B: **NO**

- **Safe evidence today.** Partially — both getters are DEFINER, `authenticated`-granted, bounded
  jsonb, over tables that grant clients nothing. **But they are status getters, not Mind projections**:
  they return free text and a **decrypted `base_url`**.
- **Scope.** Tenant. **C2 fails.**
- **Safe facts.** `configured` · `enabled` · `status` · `provider` · `transport` · `auth_kind` ·
  counts · last-probed timestamps. This domain has the most Mind-shaped fact vocabulary of any
  blocked surface.
- **Forbidden.** **The decrypted `base_url` above all** — a private endpoint URL. Also token
  last-4s, host fragments, error text, labels, approved capabilities, capability-pin digests, every
  ciphertext column.
- **Per-client slice.** Automation runs already write client-keyed Rail rows, so C1/C2 are satisfied
  in principle. **Two honest caveats:** the resolver would reject the rows unless a third actor type
  is declared, and the workflow *name* lives in the Rail title and may never cross — so the
  projection could prove *that an automation ran for this client*, never *which one*. Whether that is
  worth shipping is a product judgement, not an engineering one.
- **Next slice.** None for connection state; SCR-1 + SCR-2.

---

### Analytics  ·  A: `BLOCKED`  ·  B: **NO**  ·  *(the cheapest to unblock)*

- **Source of truth.** `issue_analytics_evidence_bundle` + `resolve_analytics_evidence_reference`.
- **Safe evidence today.** **Yes — and it is Mind-shaped in every respect except subject type.**
  SECURITY DEFINER, empty `search_path`, revoked from PUBLIC/anon/service_role, granted only to
  `authenticated`; binds **both** actor and account and refuses when the passed account epoch differs
  from the caller's active tenant; ships coverage, exclusions, freshness, a source-revision digest
  and an expiring reference.
- **Scope.** Tenant/account, epoch-bound. **C2 fails — and only C2.**
- **Safe facts.** `truth_state` · coverage state · candidate/contributing/excluded counts · range key
  · metric version · per-stage type and count · queried-at and source-updated-through.
- **Forbidden.** Pipeline and stage labels; metric label, definition and formula; caveats; exclusion
  reasons; the account epoch reference; the evidence and source-revision refs; the source table names.
- **Rail dependency.** None, and none possible: an aggregate is not an event about a client.
- **Spine dependency.** **SCR-2 alone would very nearly suffice** for the evidence half — the
  authorization, freshness, expiry and coverage semantics already exist. SCR-3 for the stage list.
  It does **not** need SCR-1, because Analytics records no outcome.
- **Next slice.** None until SCR-2. **Recommendation: name Analytics the reference consumer in the
  SCR-2 request itself** — it is the strongest existing proof that a non-client subject can be
  projected safely.

---

### Team  ·  A: `BLOCKED` (and shape-`UNAVAILABLE`)  ·  B: **NO**

- **Scope.** Tenant. **C2 fails — and C4 fails independently.** Team's product value is *who does
  what, described in the operator's own words*, which is free text the constant-summary contract
  cannot express at all. Even with SCR-1 and SCR-2, the substance would not survive.
- **Forbidden.** Member ids, emails, display names, job titles, responsibilities; invite ids and
  token material.
- **Rail dependency.** None; Team writes reach `paige_audit_log`, which has no Solo reader. A
  teammate is not a client, so C1 forbids a Rail row.
- **Open owner decision.** Whether member identity may ever cross into an evidence projection is
  unresolved. **Mind must not pre-empt it.**

---

### Settings  ·  A: `BLOCKED`  ·  B: **NO**

- **Scope.** Tenant. **C2 fails.**
- **Safe facts.** `comms_ready` and its component booleans; email status and kind as enums;
  `has_custom_domain`.
- **Forbidden.** Hostnames, sender and reply-to addresses, email domain, tenant slug and name,
  brand JSON, the encrypted automation webhook URL. Sender address and hostname are tenant-identifying.
- **Intentionally unavailable — yes, for autonomy.** Raising PAIGE's own authority is a non-Chat act.
  **Mind may describe the current posture but must never become a path toward changing it.**

---

### Marketplace  ·  A: `BLOCKED`  ·  B: **NO**  ·  *(the most blocked)*

- **Scope.** Tenant. **C2 fails.**
- **Safe facts.** `installed` (already conservatively derived) · install status · item type ·
  pricing model · `requires_embedding` · installed count · a safe state enum.
- **Forbidden.** Name, tagline, description, icon, category, price, slug, version. Critically, Mind
  must **not** assert publisher, release identity, approved scope, declared capabilities or
  prerequisites — the shipped client-side projection already marks all five `UNAVAILABLE`, proving
  the source does not carry them. Inferring any would be exactly the fabrication the contract forbids.
- **Spine dependency.** **SCR-1 + SCR-2 + SCR-3** — a catalogue is a list read, and the current
  contract cannot express a record, a list, a name, a count or any free text.

---

### PAIGE entry points  ·  reach: **2 of 4 mounts**

| Mount | Carries client scope? | Spine reachable (C3)? |
|---|---|---|
| `SoloPaigeWorkspace` | Yes | **Yes — the only Solo path that can** |
| `PaigeWorkspace` | Yes | Yes |
| `TenantCommandCenterShell` | No | No — scoped client is always null |
| `PaigePlatformDesk` | No, explicitly `clientId={null}` | No — the operator lens is tenant-less |

**Within Solo, Spine evidence can be triggered from exactly one control in the entire product** —
the "open PAIGE for this client" action on a Pipeline deal card. The scope is UI context only and
confers no authority: the server re-resolves tenant and re-authorizes the client independently.

`paige:open` has exactly one listener. Of its four dispatchers, one carries a `clientId`; the other
three carry only a prompt, and **no listener consumes a prompt** (**#771**).

---

## Summary

| Surface | A — readiness | B — runtime evidence today | Binding reason |
|---|---|---|---|
| Pipeline deal-stage | `PARTIAL` | **NO** | authenticated drive never run; Rail unreadable (#746) |
| Clients | `PARTIAL` | **NO** | no lens; owner's own writes emit nothing |
| Calendar / Bookings | `BLOCKED` | **NO** | FU-3 contract absent; needs SCR; six-PR collision; #786 |
| Command Center | `BLOCKED` | **NO** | C2 + C4; needs SCR-1/2/3 |
| Campaigns → config · Catalog | `BLOCKED` | **NO** | C2; needs SCR-1/2 |
| Campaigns → Sales | `BLOCKED` | **NO** | Rail producer dead (#787) |
| Campaigns → Overview · Social · Performance | `UNAVAILABLE` | **NO** | no source exists |
| Systems Check | `BLOCKED` | **NO** | C2 — workspace subject |
| Trust Compass inputs | `BLOCKED` | **NO** | C2 — platform subject |
| Connections | `BLOCKED` | **NO** | C2; provider state is a per-person fact |
| Integrations | `BLOCKED` | **NO** | C2; best fact vocabulary of the blocked set |
| Analytics | `BLOCKED` | **NO** | **C2 only** — adapter otherwise Mind-shaped |
| Team | `BLOCKED` + shape | **NO** | C2 **and** C4; open owner decision |
| Settings | `BLOCKED` | **NO** | C2; autonomy deliberately non-Chat |
| Marketplace | `BLOCKED` | **NO** | SCR-1 + SCR-2 + SCR-3 |

**What is genuinely available now: nothing that a person can use.** One capability is implemented
and unproven; everything else is blocked, sourceless, or waiting on a Change Request that has not
been raised.

## Parked findings and their owners

Mind raised these; **Mind implements none of them.**

| Issue | Finding | Owner |
|---|---|---|
| **#786** | Every booking Rail event is attributed to the client, including those PAIGE and the coach made | **Rail** |
| **#787** | The form-submission Rail automation has never written a row — it posts a surface the CHECK forbids | **Rail + Growth** |
| **#788** | A credential-access control issue — tracked privately, detail deliberately not public | **Connections / security** |
| #766 · #769 · #770 · #771 · #772 | Chat/entry-path follow-ups from the #765 repair | PAIGE Chat / Solo shell |
| #746 · #755 · #757 · #777 | Rail recovery · Pipeline governance · Clients domain · the two Rail contracts | Rail · Pipeline · Clients |

## Recommended next Mind slice

**None yet — and that is the finding, not an evasion.**

The smallest genuinely useful next step is **not a build**. It is the **authenticated two-Solo-tenant
drive of the one capability that already exists**, which would move `pipeline.deal_stage_evidence`
from `PARTIAL` toward `LIVE` and would be the first time any Mind claim rests on a person completing
the flow. That drive is gated on **#746**, because until the Rail can be read the outcome is invisible.

If the owner wants a *build* queued behind that: **raise SCR-2 (non-client subject types), naming
Analytics as its reference consumer.** Analytics fails exactly one constraint and already ships an
adapter with the authorization, freshness, expiry and coverage semantics a Mind lens needs. It is the
cheapest real widening of Mind's reach and the best-evidenced case for the Change Request.

**Clients is not recommended**, despite being the only other client-subject surface. Its blocker is
not the contract: the owner's own UI write emits no Rail event, so a capability built today would let
PAIGE state a history that silently omits everything the owner did by hand. That is worse than no
capability.

## Evidence classes, and what is owed

- **Production catalog / schema — performed this pass.** Rail table ACL and privilege checks, the
  surface CHECK definition, credential column and table ACLs, RLS status and policy predicates,
  registry and resolver source.
- **Production data — performed this pass.** Rail row counts; form-automation row counts.
- **Automated tests — exist and pass** for the Pipeline capability; not re-run for this document.
- **Rendered structural — none.** No browser in this environment.
- **Authenticated runtime — NONE, for any surface.** This is the single largest gap in the matrix
  and the reason axis B is uniformly `NO`.
- **UNVERIFIED.** Whether any Solo tier can complete a Mind flow end to end; the live behaviour of
  every blocked surface; and, for the private credential finding, whether a secret was ever stored
  historically — current absence is not historical absence.

## Grounding

Produced by a three-specialist read-only survey (Campaigns/Clients/Command Center · Calendar
readiness/Systems Check/Trust Compass · workspace-level surfaces and PAIGE entry points), integrated
by the Mind owner, with every load-bearing claim re-verified against primary sources before it was
written here. Nothing in this document was accepted on a reviewer's word alone.
