# Calendar capability contract

**Owner-issued 2026-08-30.** A standing platform contract for the Calendar capability.
It is **not** permission to add Calendar actions, and it did not alter the scope of the
hotfix in flight when it was issued (PR #654, since merged as `c29fbd21` and verified
live). Where it names enforcement or outcome
contracts that do not exist yet, those are recorded here as **separately scoped
follow-ups** — never quietly folded into a hotfix.

Paige Agent AI only. No legacy tenant defaults, fixtures, assumptions or copy.

## The chain

Every Paige capability follows the same order:

> **Human → Read → Brain → Trust Compass → Write → Rail → Page**

For Calendar:

### Human
Owners and authorized teammates set availability, booking rules, notification policy,
escalation rules, and the level of autonomy Paige may use.

### Read
Paige may consume only tenant-safe, current booking, availability, calendar-configuration,
contact-reference and delivery-outcome evidence.

**Realtime channel health and stale state are evidence too — never silently treated as
LIVE.** A subscription that has stopped delivering is a fact about the data's freshness
and must reach the surface as one.

### Brain
Paige may derive conflict risk, capacity pressure, scheduling gaps, follow-up needs and
recommendations **only from proven Calendar records**. Never invent bookings, attendees,
delivery results, availability or conflict resolution.

### Trust Compass
Calendar authority must be **separate by capability**: view · prepare a scheduling
recommendation · propose a move · create · reschedule · cancel · configure reminders ·
write follow-up outcomes. A tenant can allow one without allowing the others.

**Current default-lane logic is not proof of a tenant/capability enforcement clamp.**

### Write
Any future Paige-initiated booking, reschedule, cancellation, reminder or client-record
update must be **server-authorized** for tenant / account / capability / source / scope;
must **revalidate conflicts and identity at execution**; and must be durable,
attributable, idempotent, recoverable, and **fail closed**.

### Rail
Record safe provenance, decision, authority, status, outcome and recovery references.
Do **not** place raw messages, provider payloads, secret references, hidden reasoning, or
unrestricted transcript/notes content into a general PAIGE/Brain context.

### Page
Calendar remains the **human-management surface under Clients**, where people can inspect,
decide, intervene and override within their authority.

## Boundaries

- Use the **existing** Rail and Action Bus foundations. Never a parallel Calendar autonomy,
  action, memory or PAIGE system.
- **One PAIGE workspace.** Never a second chat.
- Calendar may **read** named communications readiness or notification outcomes.
  **Settings → Connections still owns phone / A2P / provider setup.**

## Where the shipped Calendar stands against this contract

Recorded honestly, as of 2026-08-30. This is a status note, not a plan.

| Step | State |
|---|---|
| **Human** | Availability, booking rules and calendar configuration are tenant-authored today. Per-capability autonomy levels are **not** yet expressible — see FU-1. |
| **Read** | **Satisfied**, and hardened by #654 (`c29fbd21`, live). Channel health is tracked separately from read freshness, and a dead subscription surfaces as PARTIAL. A reconnect does not resolve to LIVE on its own: an outage gap is closed only by a read that was ISSUED under a live subscription while that same subscription is still live. So a failed catch-up, a hung one, and a read taken from the wrong side of the outage all leave the surface honestly stale. Retry rebuilds a dead subscription rather than re-reading into a dead end. |
| **Brain** | Calendar derives conflicts and freshness from proven records only. No Paige-side Calendar inference layer exists yet. |
| **Trust Compass** | **GAP.** No per-capability Calendar clamp exists — see FU-1. |
| **Write** | Calendar writes today are **human-initiated** through existing tenant-isolated RPCs. There is **no Paige-initiated Calendar write path**, so the server-authorization contract above is unexercised rather than satisfied — see FU-2. |
| **Rail** | **GAP.** No Calendar provenance/outcome rail contract exists — see FU-3. The reminder OUTCOME record is separately tracked as unreadable from any tenant surface (task #244). |
| **Page** | **Satisfied.** Calendar lives under Clients, is the human-management surface, and carries no second PAIGE workspace. |

## Separately scoped follow-ups

Recorded, not started. None of these are in-scope for a Calendar hotfix.

- **FU-1 — Per-capability Calendar authority clamp.** Trust Compass must express the eight
  Calendar capabilities independently and enforce them server-side. Default-lane logic is
  not that clamp. Depends on the §67/§68 autonomy architecture.
- **FU-2 — Server-authorized Paige Calendar write contract.** Tenant/account/capability/
  source/scope authorization, conflict-and-identity revalidation at execution, durable,
  attributable, idempotent, recoverable, fail-closed. Prerequisite for *any* Paige-initiated
  booking, reschedule, cancellation or reminder.
- **FU-3 — Calendar Rail provenance/outcome contract.** What Calendar records onto the
  existing Rail, and the explicit exclusion of raw messages, provider payloads, secret
  references, hidden reasoning and unrestricted transcript/notes content from general
  PAIGE/Brain context.

**Cross-references:** §7 (tenant-authored portal) · §9 (tenant isolation) · §10
(Paige-governable seams) · §13 (honest reporting) · §16 (autonomy lanes) · §18 (one home) ·
§67 (autonomy attaches to a process) · §68 (no authority is permanent) · task #244
(reminder outcome unreadable) · task #250 (Calendar ↔ Trust Compass contract, PR #646).
