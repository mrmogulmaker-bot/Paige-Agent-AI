# Relationship Context & Governed Memory — the source-of-truth and handoff contract

> **OWNER-STATED 2026-09-05.** A bounded architecture deliverable. It defines how Paige understands
> and safely contextualizes real client relationships across calls, transcripts, chat, notes, forms,
> approved imports, and future connected systems — around **one** trustworthy relationship model. It
> authorizes NO parallel CRM schema, NO People/Clients UI, NO Marketplace feature, and NO transcript
> pipeline. It is the map the future pieces join onto cleanly.

## 0. The one rule

There is exactly **one canonical record of a client relationship**, owned by the People/Clients
backend. Everything Paige learns elsewhere (chat, calls, email, notes, approved imports) is **governed
context** that DERIVES from or PROPOSES to that record — it never silently becomes it. A transcript
inference is never permanent canonical truth merely because it appeared in a conversation (§57 source
of truth; connections-rail-contract `Human → Read → Brain → … `: the Brain concludes; a conclusion is
not evidence, and evidence is not a canonical fact until it is confirmed through the owning write path).

Four layers, kept strictly separate:

| Layer | Owns | Store (today) | May it be canonical truth? |
|---|---|---|---|
| **1 · Canonical CRM relationship facts** | People/Clients backend | `clients` + `tenant_entity_relationships` (§202) + `corporate_entity_registry` | **Yes — the only source of truth.** |
| **2 · Governed relationship context** | Mind / Memory | `client_memory` + `paige_owner_memory` via the Release C seam (`record_/get_/forget_paige_memory`) | No — governed context, always attributable, correctable, forgettable. |
| **3 · Evidence ingestion** (future) | Conversations / Transcription | `public.messages.transcript` / `recording_url` (tenant-scoped, mostly null today), email/chat/notes | No — evidence PROPOSES; it never auto-promotes. |
| **4 · Engagement/service templates** (future) | Marketplace | `paige_skills` / Blueprints | No — a template guides WHAT to track; it is never a client's actual record. |

## 1. Layer 1 — the exact canonical fields/relationships People/Clients MUST own

The relationship model needs these to be canonical, server-owned, and the ONLY promotion target. What
exists today is marked; the rest is what the People/Clients owner must provide (this contract does not
build it — §202 is the home to extend, never a parallel schema).

**The contact and its kind**
- `clients.id` — one row per natural person; never duplicated to represent multiple relationships (§202). **Exists.**
- **`subject_kind` — person vs business/organization.** A relationship's counterparty may be an
  organization, not just a person. `corporate_entity_registry` models platform/portfolio entities;
  a general **tenant-authored organization** entity + a person-vs-org marker on the contact is the gap
  the People/Clients owner must close (do NOT model it in Memory). **Owner must provide / confirm.**

**Organization ↔ contact structure**
- `tenant_entity_relationships (contact_id → clients.id, entity_id, relationship_type, status, started_at, ended_at, tenant_id)` — the many-relationship join. **Exists (§202).**
- **Primary contact** (per organization/engagement) — an explicit `is_primary_contact` (or equivalent)
  on the relationship. **Owner must provide.**
- **Contact role · decision authority · relationship-to-organization** — explicit fields on the
  relationship (`role`, `decision_authority`, and a typed relationship-to-org). `relationship_type`
  exists as a coarse label; role/authority as first-class fields are the gap. **Owner must provide.**

**Ownership, lifecycle, service relationship, program/engagement**
- **Owner** — `clients.assigned_coach_user_id` (and `created_by`). **Exists.**
- **Lifecycle / status** — the relationship `status` + `started_at`/`ended_at` (§202) and the client
  lifecycle stage. **Partly exists.**
- **Service relationship / applicable program or engagement** — `relationship_type` + the tenant's
  program/engagement reference. **Partly exists; formalize the engagement reference. Owner must confirm.**

**Promotion rule.** Memory (Layer 2) and ingestion (Layer 3) **never write these tables.** A fact
becomes canonical only through People/Clients' own write path, after the Layer-3 confirmation rule
below. Approved imports (e.g. #917) ADD a `tenant_entity_relationships` row, never duplicate a contact
(§202 enforcement) — and they write canonical through People/Clients, not through Memory.

## 2. Layer 2 — the governed memory types + evidence rules Paige needs

Relationship context Paige learns lives in Memory (client-scoped context in `client_memory`; the
governed seam is Release C's `record_/get_/forget_paige_memory` over `paige_owner_memory`, and
`client_memory` for the consumer/client audience). Examples: preferences, stated goals, coaching
cadence, launch timing, communication preferences, known stakeholders, relevant business context.

**Every relationship-context memory item MUST carry (extends the Release C six governance fields):**
- **scope** — server-resolved tenant + subject (client/user), never caller-supplied (§9/§59).
- **source / provenance** — where it came from (a thread, a call, an email, a note, an approved import);
  `source_thread_id` + a provenance marker in `metadata` (e.g. `source: 'transcript' | 'chat' | 'note' | 'import'`).
- **time / freshness** — `created_at`/`updated_at`; a memory has an age and can go stale.
- **confidence / confirmation state** — `metadata.confirmation_state ∈ {proposed, confirmed, corrected, retired}`
  and an optional `confidence`. **This is the field that keeps an inference from masquerading as truth.**
  A `proposed` item may inform Paige's reasoning but is never presented, or promoted to canonical, as fact.
- **correction / supersession** — `record_paige_memory(p_supersede_prior)` marks prior active rows
  inactive; a correction is a new row that supersedes, never an in-place rewrite that loses history.
- **safe retirement / forgetting** — `forget_paige_memory` soft-deletes; retired context stops
  informing retrieval. (GDPR hard-delete is the tracked follow-up.)

**The load-bearing rule:** Paige must **never** treat a transcript/chat inference as permanent
canonical truth. It is stored as governed context with `confirmation_state='proposed'` until a human
confirms it or it is promoted through the People/Clients write path (Layer 1). Governed context may
shape Paige's answers ("last time you mentioned an August launch") but is spoken as *remembered and
correctable*, not as a canonical fact.

## 3. Layer 3 — ingestion requirements for future Conversations/Transcription work

(Not built here. These are the requirements the future integration must meet.)

- **Sources** — `public.messages.transcript` / `recording_url` (voice), email threads, chat, notes.
  These live in the **conversation store**, tenant-scoped, with their own RLS (connections-rail-contract §2).
- **Propose, do not promote.** A transcript/email/chat/note may PROPOSE or SUPPORT a relationship fact
  — written to Memory as `confirmation_state='proposed'` with full provenance. It never writes Layer-1
  canonical fields directly.
- **Sensitive / authority-changing / consequential details require the confirmation path.** Anything
  that would change decision authority, primary contact, the service relationship, or a consequential
  commitment must remain attributable and go through the appropriate confirmation gate (§16 confirm
  lane / `one-approval-gate`) before becoming canonical. Autonomy for this is a Trust-Compass grant,
  not a default (§67/§68).
- **No raw sensitive transcript content through broad memory retrieval.** Recordings and transcripts
  stay in the conversation store and its narrow, purpose-scoped readers; they are **never** projected
  into broad memory retrieval (`get_paige_memory`) or the Rail (connections-rail-contract §2 never-list).
  What crosses into Memory is a *derived, attributable fact* with provenance, not the raw content.

## 4. Layer 4 — Marketplace engagement/service templates (future)

- Coaching / agency / consulting / advisory templates may guide **what Paige tracks** for an engagement
  (which relationship fields and memory types matter). They are a schema-of-interest.
- A template is **never a second source of truth** for a client's actual relationship record. Applying
  a template configures what to capture; it does not assert facts about a specific client.

## 5. Collision boundaries + dependencies

- **People/Clients owns canonical; Mind/Memory owns governed context. Neither writes the other's store.**
  Memory proposes; promotion to canonical is People/Clients' write path + the Layer-3 confirmation gate.
- **Extend, never fork (§18).** Layer 2 is the Release C seam + `client_memory` + (a future addition)
  the `confirmation_state`/`confidence`/`provenance` metadata convention — not a new memory store.
  Layer 1 is §202 (`clients`/`tenant_entity_relationships`/`corporate_entity_registry`) extended with the
  person-vs-org, primary-contact, role, and decision-authority fields — not a parallel CRM schema.
- **Ingestion depends on** the conversation store (`messages`), the confirmation gate (§16 / one-approval-gate),
  and the Trust-Compass clamp (§67/§68) before any autonomous promotion. It must not expose raw transcript.
- **#917 (contact import)** is a Layer-1 producer via §202 (add a relationship, never duplicate a contact);
  it is the orchestration owner's lane and writes canonical through People/Clients, never through Memory.
- **Dependencies:** §202 (multi-entity model) · §57 (source of truth) · §9/§59 (tenant isolation, in-body
  scope) · §16/§67/§68 (confirm lane + autonomy) · connections-rail-contract (Read→Brain; transcripts stay
  out of broad memory/Rail) · `docs/brain/paige-memory-contract.md` (the Layer-2 governed seam) ·
  `docs/security/DOCTRINE_202_MULTI_ENTITY_CONTACTS.md`.

**What this contract does NOT authorize:** a parallel CRM schema, a People/Clients UI, a Marketplace
feature, or a speculative transcript pipeline. It exists so those pieces, when built, snap onto one
trustworthy relationship model instead of growing a second one beside it.
