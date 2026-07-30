# §49 — The Unified Comms Substrate

**Owner-locked 2026-07-29.** One contact. One thread. Every channel feeds it. Duplicates
are prevented by **architecture**, not by discipline. This binds all current and future
communications work on the platform.

---

## The rule

A person a tenant talks to is **one contact record**, and every conversation with that
person is **one thread** that every channel — voice, email, SMS, WhatsApp, DMs — writes
into. There is exactly one substrate:

- **one `contacts`/`clients` row per (tenant, person)** — deduped by phone (E.164) and by
  lowercased email, enforced by unique indexes, applied identically to *every* creation
  path (CRM import, manual add, voice auto-create, email inbound, SMS inbound);
- **one `messages` substrate** — every channel event (including a placed/received **call**)
  is a `messages` row with a `channel_type`, in the contact's thread. No per-channel side
  tables, no separate "calls" table, no per-Client-Portal comms silo;
- **one conversation per (tenant, contact)** for active threads — adding someone already in
  a thread routes to the existing thread, never mints a second.

If a tenant reaches a person through *any* surface, that touch appears on the person's
record. If it doesn't, the substrate is broken.

## Why "prevented by architecture"

Dedup and thread-routing are **server-side rules shared across all creation paths** — not a
check each caller remembers to run. A UNIQUE index on `(tenant_id, phone_e164)` /
`(tenant_id, email_lowercased)` and an atomic *create-and-attach* RPC make a duplicate
contact impossible to create, from the New-Conversation modal or a CSV import or an inbound
webhook alike. The dedup lives at the seam, so every producer inherits it for free (§37).

## The §18-gate fifth question

§18 already asks "does this already exist somewhere else?" and "did I make the human
pre-classify their request?" §49 adds a fifth question to that mandatory gate, for **any**
build touching Contacts / Conversations / Dialer / Composer:

> **"Does this create any duplicate contact / conversation / message? And does it wire the
> comm event into the ONE unified substrate?"**

If either answer is off — a new contact could be silently created, or a channel event
lands somewhere other than the one thread — **refactor before shipping.**

Every future comms slice answers all four:
1. Does this feed the ONE substrate?
2. Does it use the shared primitives (the contact-resolution RPC · the `messages` table ·
   the dictation hook · the draft-with-Paige seam)?
3. Does it dedup — could this ever silently create a duplicate?
4. Would a tenant call / email / message via THIS surface and *not* see it on the contact
   record?

## The 6-slice package (owner tracker #165–#171)

Sequenced into three waves:

- **Wave A — quick wins (fire immediately, parallelizable):**
  - **#166** TTS default voice → `nova` (the warm, on-brand Paige voice). Tiny hotfix.
  - **#170** Rip the broken ElevenLabs Convai stub; ship a shared Deepgram **`useDictation`**
    hook (one hook, two consumers: Paige-Chat composer + Conversations composer). Fixes a
    live broken mic and a §45 branded-error leak.
- **Wave B — the substrate work:**
  - **#169** New-Conversation modal: inline contact create + smart routing + the dedup
    UNIQUE indexes + the atomic create-and-attach RPC (the load-bearing slice).
  - **#168** Call → Conversations wiring: every outbound + inbound call writes a
    `channel_type='voice'` message into the contact's thread; missing contact auto-creates
    per #169's rules.
  - **#171** Conversations composer enrichment: `[attach] [mic] [draft-with-Paige] [text]
    [send]` — all shared primitives.
- **Wave C — design:**
  - **#167** Voice picker UX: per-tenant Paige voice in Playbook JSONB, audio-preview tiles,
    tier-gated (Solo 3 / Agency 5 / Enterprise + Marketplace = cloning slot #132).

## Relationship to existing doctrine

§49 is the comms expression of the platform's standing rules: §7 (tenant-authored — the
contact record and thread are the tenant's) · §9 (tenant-scoped — dedup + threads never
cross tenants) · §12 (one home per capability — one contact, one thread) · §18 (no
redundant surface, no pre-classification — the fifth gate question) · §37 (every producer
of a contact/message inherits the same dedup rule) · §36 (the tenant never has to know
*how* to ask for a unified view — it's just there).

**The test, every time:** *"One contact, one thread — did this touch land there, and could
it ever have created a duplicate?"* If not, it isn't done.
