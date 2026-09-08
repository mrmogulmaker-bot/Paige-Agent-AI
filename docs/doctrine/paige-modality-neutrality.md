# Paige modality neutrality — one workspace and one governed execution path

**Status: OWNER-LOCKED PLATFORM RULE (2026-09-06).** This is an architecture and acceptance
contract. It does not claim that Live Conversation, phone/SIP, Secure Browser, or every card type is
currently `LIVE`. Each capability keeps its existing `LIVE`, `PARTIAL`, `UNAVAILABLE`,
`UNVERIFIED`, or `PROOF OWED` state.

Paige is modality-neutral. Text chat, Live Conversation, future phone/SIP, Secure Browser
interactions, contextual handoffs, and platform cards are interfaces to the **one tenant-aware
Paige workspace** and the **one PAIGE Spine**. A modality may change how intent is received or a
truthful result is presented; it may not create another brain, a direct mutation path, a duplicate
authority system, an ungoverned memory store, or a modality-specific shortcut.

## The required path for every Paige capability

1. Receive the person's text, voice, or UI intent.
2. Server-resolve the actor, tenant, workspace, page or object context, and role. Client-supplied
   tenant, role, authority, or record snapshots are assertions to reject, never facts to trust.
3. Use the shared PAIGE Spine registry and the existing authority/governance decision.
4. Call the canonical governed tool or RPC only when it is currently available and authorized.
5. Re-read or otherwise verify the canonical persisted outcome.
6. Create the detailed action receipt and matching Rail evidence.
7. Present the truthful result through the active modality: chat message, live transcript,
   conversation card, browser companion card, or platform card.
8. Make only approved, source-backed, owner-confirmed material eligible for Brain, Mind, or Memory.
   Raw chat text, raw voice audio, and raw transcripts are never automatic durable facts.

The active door is provenance, not permission. A request that arrives by voice, browser companion,
phone, or a card receives the same decision as the equivalent chat request. Ordinary conversational
choices may be selected through speech or UI when policy permits. Money movement, authority change,
external-impact action, and every other consequential act retain the existing standing-authority or
confirmation floor, canonical readback, detailed receipt, and Rail evidence. A casual spoken
"yes" is not approval proof and never bypasses the one approval gate.

## Live Conversation and card requirements

- A tenant-safe live transcript or session record may be retained only under explicit consent and
  retention rules. Raw audio and transcripts do not become Memory, Mind, or Brain facts by default.
- Live Conversation cards are presentation objects for the same canonical records and governed
  actions used by chat. They do not own records, actions, authority, or receipts.
- Paige may speak and display focused questions, choices, plans, evidence, pipeline or deal records,
  governed actions, verified results, and recaps in real time. One primary active card is preferred;
  prior cards belong in transcript/history only when the canonical conversation record warrants it.
- A card may select an ordinary conversational option. A consequential card must expose its proposed
  action, scope, authority state, required review or confirmation, verified outcome, and truthful
  failure/retry state through the existing governance contract.
- Workspace switching, session end, denial, retry, revocation, and expiry clear or fail closed with
  the same scope-epoch and authority behavior as text chat.

## Paige voice profile

Voice identity is server-resolved configuration, not UI or provider branding. New sessions resolve
one approved active Paige profile (for example `paige_default_voice`) to an exact provider voice
reference, effective revision, optional speech policy, and audit receipt. The browser receives only
the Paige-facing profile name/revision and an opaque short-lived transport grant; provider names,
voice references, credentials, and configuration never enter customer UI or client prompts.

An authorized platform operator can repoint the profile after server-side provider availability and
authorization validation, without a code deployment. The change applies to the next new session.
An active session keeps the immutable profile revision it started with. A display name is never
identity. A missing, deleted, unauthorized, or unavailable provider reference fails closed unless a
separately approved fallback profile also passes current validation. Every speech policy declares
whether Paige's server-side profile tuning or provider-dashboard tuning is authoritative. Customer
requests never carry voice tuning and can never override either source.

## Acceptance criteria for every future Paige surface

A new modality or Paige surface fails acceptance if any answer below is no:

- Does it reuse the one tenant-aware Paige workspace and canonical conversation/thread identity?
- Does the server re-resolve actor, tenant, workspace, role, and object context for the request?
- Does it use the shared Spine capability identity, action-risk classification, authority decision,
  one approval gate, and canonical tool/RPC?
- Can it prove the persisted outcome before success, then create the detailed receipt and Rail
  evidence through the owning contracts?
- Does it present the same honest capability state as chat, without upgrading `UNAVAILABLE`,
  `PARTIAL`, `UNVERIFIED`, or `PROOF OWED`?
- Does it keep raw text, audio, and transcript material out of durable Brain/Mind/Memory eligibility
  until the existing source, confirmation, retention, and governance rules are satisfied?
- Do workspace switch, revoke, disconnect, retry, and session end fail closed without carrying stale
  context, cards, audio, or authority into the next scope?
- Does every new voice session bind an approved server-side Paige voice-profile revision without
  exposing provider identity or credentials, while existing sessions retain their original binding?
- Does a deleted or unauthorized provider voice fail closed or use only a separately approved fallback?

## Cross-references

`governed-execution-seam.md` (door-blind authority decision) · `one-approval-gate.md` (approval
proof) · `surface-context-handoff-contract.md` (safe server-resolved context) ·
`../brain/paige-brain-wiring-standard.md` (capability acceptance checklist) ·
`../brain/paige-memory-contract.md` (durable knowledge eligibility) ·
`../architecture/paige-spine-foundation.md` (canonical Spine) · §9/§13/§18/§37/§59/§67/§68/§70.
