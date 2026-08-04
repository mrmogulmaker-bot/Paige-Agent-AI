# L8 Memory Fabric — Workstream Scope Brief

**Cross-Chat Memory + Chat Compaction, tier-gated.**
**Owner-ruled 2026-08-03.** Concrete scope definition of the L8/L6 Memory Fabric workstream already on the §196 pre-launch sequence. This file IS the starting point when the workstream fires — no re-scoping from scratch.

> **Filing note (§12):** filed here in `docs/doctrine/` alongside the sibling §196 pre-launch brief `paige-practice-blueprints-2026-07-29.md`, not in a new loose `docs/roadmap/`, to keep the pre-launch workstream briefs in one registry.

**Origin trigger:** owner watched the context-compaction UI mid-Cowork session and asked — *"should we add this feature platform-wide to the Paige Agent AI Chats and full memory across each chat like you have here on Claude? Gated by each account type?"* Ruled to file after a doctrinal alignment check.

---

## Why this is load-bearing (doctrinal anchors)

- **§7** — a portal that forgets between chats is a filing cabinet, not intelligence. Memory IS the moat.
- **§8** — the two-department action bus requires shared memory; without it the Client team + Owner Ops team can't coordinate.
- **§15** — Paige can't probe intelligently or propose the smarter move without remembering what she's already seen.
- **§26** — the storage substrate already exists (`paige_prompt_memory`, voyage-3 @ 1024 dims, tenant-scoped, §9-clean by construction). This workstream **EXTENDS** it (§18 one home), never rivals it.
- **§34** — L6 Learning is one of the 7 internal Paige departments. This is L6 made user-facing.
- **§35** — a Paige OS that forgets between chats isn't an OS. Memory scales to household/portfolio/device contexts in future waves.
- **§17 + §38** — memory-as-tier is a real Engine-2 metered revenue path on Paige's own rails (§38-clean: tenant→Paige billing, never tenant client money).
- **§9 + §51** — tier-gated per six-tier discipline; the agency's cross-sub visibility still binds to §9 isolation + #218 opt-in privacy.

---

## Scope — two distinct features, built together

### 1. Chat compaction (universal, table-stakes)
Auto-summarize when a chat approaches token limits so long conversations don't die mid-workflow. **Every tier** gets this — Solo through Super Admin. Without it, tenants hit invisible token walls and lose context mid-task. Same mechanic Claude uses (the "Compacting our conversation" moment).

### 2. Cross-chat memory (tier-gated, monetizable)
Persistent memory across sessions — Paige remembers what happened last week, what worked, what the tenant told her, what the agency's playbook is. This is the **L6 Learning department made user-facing**. Semantic retrieval from `paige_prompt_memory` (extend, don't fork) feeds into the current chat's context so Paige never restarts cold.

---

## Tier-gating matrix (§9 tenant/operator seam + §51 six-tier discipline)

| Tier | Compaction | Cross-chat memory |
|---|---|---|
| **Solo / Sub-account / Standalone** | Auto (always on) | Tenant-scoped memory within their own account. Last N conversations summarized to Paige's context. |
| **Agency** | Auto (always on) | Same + a roll-up view across sub-accounts — **§9 isolation binds**: the agency sees the aggregate learning of *their own operation*, NOT sub-account private data unless opt-in per #218. |
| **Enterprise** | Auto (always on) | Same + deeper retention, longer memory window, cross-context reasoning across subsidiary units. Highest depth. |
| **Super Admin (God)** | Auto (always on) | Platform-lens memory (patterns across tenants for support/product improvement) with **immutable audit per §17 God-account governance. Never silent break-glass.** |

Tier-gating MUST resolve tiers through the **canonical §51 resolvers** (`tier-matrix.md`), **not** a single `tenants` column — the six tiers do not all key off one field (God has no home tenant, Client resolves via `clients.linked_user_id`, Anonymous has no tenant, and Standalone + Sub-account share `account_type`). Use those resolvers + a capability flag, **never** a hardcoded `"agency"`/`"enterprise"` per-tier branch (§213/§213.e). Compaction is universal (every authenticated tenant tier); only cross-chat-memory *depth* is tier-resolved.

---

## Substrate reuse (§18 one home — critical)

**Two DISTINCT existing substrates — do not conflate them (§18).** Compaction and cross-chat memory are different mechanics with different homes; routing both into one table creates a competing source of truth.

- **Compaction → EXTEND `paige_chat_threads.summary` + `summary_through_seq`** — the rolling per-thread summary shipped in `20260711300000_paige_owner_chat_persistence.sql`, which `paige-ai-chat` already writes and refreshes. Compaction is a *per-thread rolling summary*, so it lives **with the thread**, NOT in `paige_prompt_memory`. Routing compaction into the vector-memory table would create a competing source of truth and collide with that table's required artifact-memory fields. **Reject on sight.**
- **Cross-chat memory → EXTEND `paige_prompt_memory`** (§26 — already tenant-scoped, voyage-3 @ 1024 dims, §17 embedder-tier gated). Semantic retrieval **across** threads is a **new query path over existing vector storage**, not new storage. Do **NOT** stand up a second memory table or a rival vector space. Any compaction summary that is *also* embedded for cross-chat recall carries the same §9 isolation + §17 tagging discipline (`embedding_model='voyage-3'`, `embedding_dim=1024`, explicit `tenant_id`).
- **The adversarial MUST re-attack:** *"is there a second embedder anywhere in this diff? is there a way to route embeddings to a frontier/generation model? does anything skip the §9 tenantId scope? did compaction leak into the vector table instead of the thread summary?"*

---

## Revenue rail (§38-clean)

- Engine-2 metered usage on Paige's own rails — memory depth (retention window, context size, cross-chat reasoning) is a real tier-upgrade lever.
- **§38 test:** this is tenant→Paige for a Paige capability. Merchant-of-record = Paige. **Passes.**
- Same monetization pattern GHL / Salesforce / HubSpot use for AI features.

---

## Adversarial questions to hunt (log into the design pass upfront)

- **§213/§213.e** — Does the tier-gating logic use a generic predicate (canonical §51 resolvers + capability flag), or hardcode `"agency"`/`"enterprise"` per-tier? Framework-level, not per-tenant. Does it cover ALL current AND future tiers, or tunnel on today's tier set?
- **§9** — Can a sub-account's memory ever leak into another sub-account's context via the agency roll-up? Can Super Admin platform-lens ever return raw tenant PII without audit + an operator-scope gate?
- **§26/§17** — Does any new code path route an embedding through a frontier/generation model? The structural **voyage-only** invariant must hold.
- **§18** — Does this create a second memory table / second retrieval path when the existing one could extend? Did compaction land in `paige_prompt_memory` instead of the existing thread summary? **Reject on sight.**
- **§46 rhythm** — Does compaction fire silently, or does the tenant know Paige is compacting (a small ambient signal, not a modal wall)?
- **§28 approval** — Does memory ever surface an approved-frozen artifact as an "editable suggestion"? Frozen must stay frozen.
- **§13** — Does retrieval report honestly what it found (real matches with confidence), or hallucinate *"you told me last week…"* from a near-miss?
- **Data-sovereignty (§199 pattern)** — Where does the summarization LLM call route? Is any tenant PII crossing into a provider that shouldn't see it?

---

## NOT in scope for this workstream (file as future/adjacent)

- **Cross-TENANT memory** (Solo A learning from Solo B) — **permanently out.** Never crosses §9 isolation.
- **Consumer-side memory** (a coach's client getting persistent memory of THEIR own portal) — a real feature, but its own scope; sequence separately.
- **Voice memory / device memory** (§35 OS extension) — later wave.

---

## Sequencing

- **Blocked by:** Waves 1–5 close-out + the full hotfix bundle (#227–#233) landing + prod-confirm.
- **Position:** fires in the §196 pre-launch sequence between **Owner Trilogy** and **Paige Quality Wave** (the roadmap's existing L8 Memory Fabric slot). Full pre-launch order: Owner Trilogy → **L8 Memory Fabric** → Paige Quality Wave → Playwright → BETA LAUNCH → SOC 2. **Practice Blueprints is NOT a pre-launch predecessor** — the owner-locked `paige-practice-blueprints-2026-07-29.md` schedules it **post-launch v2, AFTER L8 + SOC 2**. (An earlier draft of this line wrongly listed Blueprints first; corrected here to the canonical owner-locked order.)
- **Blocked by (new work):** nothing — the substrate already exists (§26).
- **Blocks:** any pre-launch feature that assumes cross-chat continuity (arguably everything customer-facing).

---

## Workstream discipline (per §14, when it fires)

- **Convene crew:** memory-domain engineer + adversarial verifier + compliance officer + **design critic** (chat-compaction UX is a real design surface).
- **§32 dual-leg proof** on all data-modifying migrations (pre-merge behavioral + post-merge persisted-apply).
- **§37 producer inventory** on any RPC/edge contract change.
- **Owner-review-before-merge** (touches auth-adjacent + tenant-scoped data).
- **§213.e re-attack:** does the tier-gating cover ALL current + future tiers via a generic predicate, or tunnel on today's tier set?
