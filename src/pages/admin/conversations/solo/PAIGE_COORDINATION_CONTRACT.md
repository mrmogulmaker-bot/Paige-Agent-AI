# Solo Conversations PAIGE coordination contract

Approval source: owner-approved Antonio-centered Conversations prototype, SHA-256 `7C5D148CD74D5DEB8D0CF3308C1924F25EAA711C87F94383C51EFC58B87560F4`, plus the owner clarification recorded on 2026-08-28.

## Product invariant

Solo Conversations is the client-specific communication surface of Paige Agent AI. People owns the canonical tenant-scoped relationship identity. Conversations owns the canonical external channel/thread timeline. The primary PAIGE workspace is the account-wide coordinator. Focused PAIGE and specialist-agent work may coexist inside Conversations, but must not become an independent identity, inbox, or external transcript.

## Three-layer model

1. External client messages: canonical `threads` and `messages`; exact selected People record, channel identity, consent/DND/reachability, and provider readiness govern sending.
2. Internal PAIGE work: tenant-user discussion with PAIGE or a specialist about the selected client/thread. Internal discussion never masquerades as a client message and never auto-sends.
3. Governed outcomes: approved summaries, facts, decisions, drafts, commitments, and provenance. Durable outcomes are tenant- and client-scoped, purpose-bound, permission-aware, correctable, removable, auditable, and retention-aware. Raw notes, family details, documents, private reasoning, and full transcripts are not promoted automatically.

## Flow map

| Flow | Entry | Required context | Exit | Failure boundary |
|---|---|---|---|---|
| Human reply | Selected canonical thread | Tenant, People contact, thread, channel, recipient | Reviewed external send | Unmatched/duplicate identity, DND, missing readiness, or permission blocks send |
| PAIGE draft | Selected email thread and ready identity | Same canonical client/thread plus loaded thread context | Editable composer draft | Empty/missing recipient or unavailable draft service fails closed |
| Open primary PAIGE | Compact PAIGE coordination control | Active tenant | Existing PAIGE workspace opens | Client/thread continuity is not implied until a shared handoff contract exists |
| Specialist work | Internal PAIGE conversation | Tenant, client, thread, bounded work item, authority and end condition | Governed proposal or hand-back | PROPOSED; no live claim without orchestration evidence |
| Governed outcome | Approved internal result | Proven provenance, visibility, retention, correction and removal rules | Explicit Ask First action | PROPOSED; no silent durable-memory promotion |
| External action | Explicit draft/proposal | Exact recipient, channel, sender identity and approval | Canonical message/action status | Separate Ask First approval unless a proven automation contract authorizes it |

## Current truth matrix

| Capability | State | Evidence boundary |
|---|---|---|
| Primary PAIGE tenant context and workspace opening | LIVE | Existing tenant shell and `useAgentPresence().expandRail()` |
| Editable PAIGE email drafting | PARTIAL | Existing email composer sub-agent; channel-specific and never auto-sends |
| Selected client/thread continuity into primary PAIGE | PROPOSED | Primary PAIGE does not currently consume the Conversations selection contract |
| Embedded client-scoped PAIGE conversation | PROPOSED | No Conversations-owned internal chat persistence/runtime is proven |
| Named specialist delegation and hand-back | PROPOSED | Specialist visibility exists elsewhere; bounded orchestration is not proven here |
| Durable cross-surface memory/outcome synchronization | PROPOSED | Existing knowledge/approval data does not prove this scoped memory contract |
| Governed autonomous handling | PROPOSED | Visible mode fails closed; sending is disabled |
| External email and SMS send | PARTIAL | Existing send seams only when identity, recipient, permission, and readiness are proven |

## State and isolation rules

- Selection change atomically replaces client/thread working context.
- Account change immediately clears inbox, selected client/thread, composer, handling mode, attachments, and pending state; epoch checks reject late responses.
- A client-facing send always uses the selected canonical tenant-scoped People association. Duplicate, unmatched, or cross-account identity blocks sending.
- PAIGE drafts, routing, reminders, tasks, tags, campaigns, pipeline changes, Portal actions, and sends are separate Ask First proposals unless a specific authorized automation contract proves otherwise.
- Internal agent reasoning and indiscriminate chatter are never rendered as durable memory or an external message.

## Ownership boundary

This Conversations-local slice may display truth states and open the existing primary PAIGE workspace. Making client/thread continuity, specialist orchestration, or durable outcome synchronization LIVE requires a separately coordinated shared PAIGE contract. It must not be simulated in Conversations-local code or implemented by modifying People-owned wrapper files, tenant shell ownership, provider code, schema, authentication, or business data from this slice.
