# Connections, the Rail, PAIGE and the Brain — the standing integration contract

> **OWNER-STATED 2026-08-30**, during the #640 Connections/A2P work, and extended the same day
> with the platform pipeline taxonomy (§0a) and the independent voice capabilities (§0b).
> Binding as integration discipline on every surface that touches provider setup, readiness or
> communications outcomes. This doc is the §18 one home for the contract. It does **not** authorise
> a platform-wide rebuild of the Rail, the Trust Compass or the Action Bus, and it does **not**
> authorise live voice or any provider action — a taxonomy describes the shape an authorization must
> take; it is not the authorization.

Paige Agent AI is building toward full governed autonomy across the Solo account. Everything
below exists so that ambition is served by the foundation that already ships, rather than by a
second one grown quietly beside it.

## 0. The rule that governs all four layers

**Use the existing Paige foundation.** Do not build a parallel rail, action queue, autonomy
store, memory store, provider adapter, or PAIGE workspace. If a shared contract you need does
not exist, record it as a scoped follow-up (§7 below) — never stand up a private copy and never
implement a fake one.

## 0a. The pipeline every Paige capability follows

> **OWNER-STATED 2026-08-30.** A governing platform taxonomy. It grants nothing: naming a stage
> does not create the authorization that stage requires.

```
Human → Read → Brain → Trust Compass → Write → Rail → Page
```

| Stage | What it is | What it must never become |
|---|---|---|
| **Human** | The owner and team set goals, policies, approvals and exceptions, and retain ultimate accountability. | A rubber stamp inferred from silence. Accountability does not transfer by Paige being confident. |
| **Read** | Paige receives only tenant-safe, proven, scoped evidence. | A raw provider feed, or a read that resolves its tenant from anything a caller supplied. |
| **Brain** | Paige derives understanding, summaries, plans and recommendations **only from proven records**. | A place where an inference becomes a record. What the Brain concludes is a conclusion, not evidence. |
| **Trust Compass** | Determines, **per tenant and per capability**, whether Paige may observe, prepare, request confirmation, or act. **It must be server-enforced before autonomous action is claimed.** | A label on a surface. A compass that is not enforced server-side authorizes nothing, however it renders. |
| **Write** | Every action is tenant/account/capability/source/scope authorized, durable, attributable, idempotent, recoverable, and fail-closed. | A direct provider call from a UI handler, or a retry that duplicates an external effect. |
| **Rail** | Durable safe evidence, provenance, authority, decisions, outcomes, and recovery history. | A message log. See §2 for the never-list and §2a for where the shipped rail does not yet hold it. |
| **Page** | The human-management surface where people understand, govern, and intervene. | The only place a capability can be driven from (§10), or a surface that shows a state no record proves. |

**Reading comes before action, at every stage.** A capability that cannot yet be read safely is not a
capability that may be acted on quickly.

## 0b. Voice and Connections capabilities are INDEPENDENT Trust Compass grants

These are six separate capabilities. A tenant may allow one without allowing any other, and the
grant for one is never evidence of the grant for another:

1. **answer inbound calls**
2. **make outbound calls**
3. **handle sales qualification or booking**
4. **record / transcribe calls**
5. **write outcomes into client, lead, calendar, or follow-up records**
6. **escalate to a human**

So Paige may answer inbound calls but not place outbound sales calls; may prepare a call plan but
require approval to place it; may handle a booking but never record it. Any implementation that
collapses these into one "voice" switch is wrong by construction, because it makes a tenant grant
recording in order to answer a phone.

**Recording and transcription are their own capability for a reason.** They create durable content
about a third party who did not grant anything to Paige. Enabling them is never a side effect of
enabling calls.

**What is NOT authorized by this taxonomy.** Paige may eventually read safe communications readiness
and outcome references, explain gaps, and prepare governed next steps. She may **not** silently call
providers, buy or assign numbers, submit A2P, record or transcribe calls, send messages, alter
billing, or make any external change **until each capability has its own proven server authorization
and Trust Compass enforcement**. This taxonomy does not add live voice or any provider action; it
describes the shape each must take when it is separately authorized.

## 1. Page — Settings → Connections

The **human-management surface**. One owner of provider setup and readiness: business phone,
A2P/texting registration, sending identities and domains, and communications delivery evidence.

- Connections is the single owner of provider setup and readiness.
- **Conversations** consumes only the named canonical readiness result. It does not reproduce
  setup logic, and it does not re-derive readiness from raw provider state.
- **Calendar** may read notification configuration. It does not own Communications.
- **Billing** remains its own Settings area. Connections may disclose a phone-related billing
  prerequisite; it must not present itself as owning billing.
- **Integrations** is a separate top-level Settings item, not a tab inside Connections.

## 2. Rail — durable, tenant-scoped, presentation-safe

The Rail carries **evidence, provenance, decisions and outcomes**. Not payloads.

**Safe, rail-worthy Connections events:**

- readiness changed
- a required prerequisite is missing
- a business phone was selected or assigned — *once proven*
- A2P state advanced, failed, or requires information
- consent or delivery reporting became unavailable, or recovered
- an authorized action completed, failed, or needs recovery

**Never on the Rail, and never into PAIGE or Brain context:** raw phone content, customer
messages, prompts, credentials, Twilio or other provider payloads, secret references, **recordings,
transcripts,** hidden reasoning, or full configuration data.

### 2a. Where the shipped rail does NOT hold this rule today (verified 2026-08-30)

Stating the rule without stating its current compliance would make this document assert something
untrue about the platform. A read of every writer of `public.paige_client_events` — the one rail,
written only through `record_rail_event` — found **four places where raw message text lands in
`p_summary`**, which is persisted and broadcast on `rail:tenant:` to every subscribed staff browser:

| Writer | What lands in `summary` |
|---|---|
| `handle-inbound-sms` | the inbound SMS body, truncated to 137 chars |
| `send-message` | the outbound message body / email subject, truncated |
| `paige-ai-chat` | the client's chat turn — the model's own prompt input |
| `customer_respond_to_action` (migration) | the client's free-text reply, **untruncated** |

**All four are pre-existing on `main`. None is introduced by the Connections work, and none is
changed by it** — changing a shipped emitter's content is its own change, with its own §37 consumer
inventory, not something to slip into a docs commit.

Two things that were *suspected* and are **not** true, recorded so nobody re-derives them:

- **Recordings and transcripts do not reach the rail.** `twilio-status-callback` is not a rail
  writer at all. `recording_url` and `transcript` are written to dedicated columns on
  `public.messages` / `public.operator_messages` — the conversation store, a different table with
  different RLS, no realtime broadcast and no audience model. The rule governs the rail; that
  destination is outside it. (Both are `null` in practice today: recording is not enabled on the
  dial.) The never-list above still names them, because the rail is where they must never go.
- **No credential, secret, provider payload, or model reasoning reaches the rail.** The one
  credential-adjacent value is an OAuth **public client id** as provenance.

**The "never into PAIGE or Brain context" half IS currently held.** Both model-hydration paths
project only `event_kind`, `title` and `occurred_at` — never `summary`, never `payload`. So the
raw text is visible to staff and persisted; it does not reach the model.

`paige_llm_trace` is the store that deliberately holds prompts and outputs (scrubbed, capped,
documented as possibly-PII / never-secret). It is not a rail and must not be conflated with one.

## 3. PAIGE — the one governed interface

PAIGE reads **safe, server-resolved references** and prepares or carries out **permitted**
actions. One workspace; no second PAIGE surface for communications.

She may read tenant-safe readiness and outcome references and explain the next safe step.

Any **write** goes through the existing Action Bus / server-authorized path, and is:

| Requirement | Meaning |
|---|---|
| tenant checked | the acting tenant is resolved server-side, never from a request body |
| account checked | the account within that tenant is authorized for this act |
| capability checked | the capability is granted, not merely present in code |
| source checked | the caller is a permitted origin for this act |
| scope checked | the act cannot reach outside the resolved tenant |
| durable | the decision and its outcome survive the request |
| attributable | who or what caused it is recorded |
| idempotent | a retry does not duplicate the effect |
| recoverable | a failure leaves a state someone can act on |
| fail closed | absence of proof refuses; it never proceeds |

## 4. Brain — derived, never raw

The Brain derives recall and recommendations **only from proven, scoped records**. It is not a
raw provider-data store and not a prompt store. A fact reaches the Brain because it was proven
and recorded, not because a provider returned it.

## 5. What is NOT authorized today

**The Trust Compass is not yet a proven tenant-and-capability enforcement clamp.** Do not claim
it authorizes A2P, phone, billing, or provider actions. Until that clamp and the authorized
execution contracts exist:

> **Paige must not silently call Twilio, search for / purchase / assign a number, submit an A2P
> registration, alter credentials, activate billing, or send a message.**

Copy that tells a tenant Paige will do one of these things is a §13 violation regardless of how
helpful it sounds — the capability being real *somewhere* is not enough; it has to be reachable
and permitted from where the copy points.

## 6. Where the ceiling is stated to the tenant

A prepared A2P registration reads **"Prepared, not submitted."** A readiness step reports only
evidence the provider actually returned; it never infers deliverability, consent, or webhook
health from configuration. An absent fact says it is absent.

## 7. Missing shared contracts — scoped follow-ups, not fake implementations

These are named so nobody builds a private substitute for one. None is implemented in #640.

| # | Missing contract | What it would take | Why it is not #640 |
|---|---|---|---|
| C-1 | **Rail event kinds for Connections** — the six safe events in §2 have no registered kind on the existing rail | Register the kinds on the existing rail registry with tenant-scoped, payload-free shapes; emit from the server paths that already prove the fact | Adding kinds is a platform-wide rail change; #640 is one surface |
| C-2 | **Trust Compass tenant-and-capability clamp** — no proven enforcement clamp exists, so no autonomy grant can be honoured for provider actions | The clamp itself, plus the read that publishes `requested` / `effective` / `capped_by` together (§68) | Platform primitive; §67/§68 sequencing owns it |
| C-3 | **Authorized execution contracts for provider actions** — number search/purchase/assignment, A2P submission, billing activation have no server-authorized, idempotent, recoverable act definition | Action-Bus act definitions meeting every row of §3's table | Requires C-2 to be meaningful; also gated on explicit owner authorization per action |
| C-4 | **The safe PAIGE readiness-read seam** — Paige cannot today read the canonical readiness result | A tenant-safe, server-resolved read exposed to `paige-ai-chat` | Blocked behind in-flight PRs touching the same file; forcing a conflicting edit was explicitly refused |
| C-5 | **Rail summary hygiene** — four shipped emitters put raw message text in `summary` (§2a) | A decision on each: a non-content summary, an audience restriction, or an explicit documented exception. Each emitter needs its own §37 consumer inventory, since `summary` is rendered to clients and broadcast to staff | Pre-existing on `main` and outside the Connections diff. Changing a shipped emitter's content is a behaviour change, not a docs change |
| C-6 | **Per-capability Trust Compass enforcement for the six voice grants (§0b)** | Server-side enforcement keyed on tenant × capability, so answering a call cannot imply permission to record it | No clamp exists yet (C-2); until it does, none of the six may run autonomously |
| C-7 | **`paige_conversations` inbound rows carry no `tenant_id`** — `handle-inbound-sms` resolves the receiving tenant and does not put it on the row, and no trigger derives it (`set_contact_scoped_tenant()` is attached only to `paige_suppressions` and `paige_consent_events`). The coach SELECT policy admits `tenant_id IS NULL`, so those rows are readable by **every** tenant — the exact hazard `supabase/functions/CLAUDE.md` already names. A second, independent hole sits beside it: the "Admins manage all conversations" policy gates on `has_any_role(...,'admin')` with **no tenant clause at all** (the §59 global-role trap) | Stamp the resolved tenant on the insert, and give the admin policy a tenant clause. Both need a §37 consumer inventory — existing NULL-tenant rows are currently visible to readers that a backfill would cut off | Pre-existing on `main`, not introduced or touched by the Connections work. Changing what a shipped write persists, and narrowing a live RLS policy, are each their own change with their own producer/consumer walk |

Until C-4 lands, Connections copy must not promise that Paige can act on readiness, because she
cannot yet see it.

---

**Cross-references:** §7 (Paige is the intelligent portal) · §9 (tenant isolation) · §10
(callable seam) · §13 (honest reporting — a promise the product cannot keep is a fabricated
status) · §18 (one home) · §38 (money boundary — Connections discloses a billing prerequisite,
it does not own billing) · §65 (Integrations is its own top-level item) · §67/§68 (autonomy is
granted to a process, and decays) · `docs/brain/paige-brain-wiring-standard.md` (the two brains).
