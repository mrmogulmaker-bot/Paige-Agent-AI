# Connections, the Rail, PAIGE and the Brain — the standing integration contract

> **OWNER-STATED 2026-08-30**, during the #640 Connections/A2P work. Binding as integration
> discipline on every surface that touches provider setup, readiness or communications
> outcomes. This doc is the §18 one home for the contract; it does **not** authorise a
> platform-wide rebuild of the Rail, the Trust Compass or the Action Bus.

Paige Agent AI is building toward full governed autonomy across the Solo account. Everything
below exists so that ambition is served by the foundation that already ships, rather than by a
second one grown quietly beside it.

## 0. The rule that governs all four layers

**Use the existing Paige foundation.** Do not build a parallel rail, action queue, autonomy
store, memory store, provider adapter, or PAIGE workspace. If a shared contract you need does
not exist, record it as a scoped follow-up (§7 below) — never stand up a private copy and never
implement a fake one.

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
messages, prompts, credentials, Twilio or other provider payloads, secret references, hidden
reasoning, or full configuration data.

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

Until C-4 lands, Connections copy must not promise that Paige can act on readiness, because she
cannot yet see it.

---

**Cross-references:** §7 (Paige is the intelligent portal) · §9 (tenant isolation) · §10
(callable seam) · §13 (honest reporting — a promise the product cannot keep is a fabricated
status) · §18 (one home) · §38 (money boundary — Connections discloses a billing prerequisite,
it does not own billing) · §65 (Integrations is its own top-level item) · §67/§68 (autonomy is
granted to a process, and decays) · `docs/brain/paige-brain-wiring-standard.md` (the two brains).
