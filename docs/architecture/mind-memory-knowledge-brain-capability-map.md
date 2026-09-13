# Mind · Memory · Tenant Knowledge · Second Brain — the grounded capability map

**One consolidated status map for the whole vertical.** It answers, per capability and per surface:
*what actually works for a real person today, what is only built at the seam, and what is not built
at all* — using the owner's five-state taxonomy, with every claim tied to a primary source.

> **This is the Phase-2 deliverable** of the Mind/Memory/Knowledge/Second-Brain assignment. It is a
> **read-only status map** produced from source. It changes no runtime surface, no shared module, no
> Rail, no Spine, no Mind, no Memory, and no migration. It exists to be reviewed **before** any
> production implementation (Phase 4 gate).

---

## Grounding provenance (read this first — it bounds every claim below)

- **Verified against `origin/main` @ `af249ef` (2026-09-13).** The working branch
  `claude/command-center-mind-redesign-wpjt5e` carries **zero diff** vs `origin/main`
  (`git rev-list --left-right --count origin/main...HEAD` = `0 0`). Every claim here is a claim about
  **current `main`**, not about un-merged work. The branch name is historical; grounding is against
  fresh main.
- **Deploy-tag state (the §32.a CI-persistence signal):** `db-live` and `edge-live` are both at
  `e560a4ab` (2026-09-13 14:50). The one migration showing in `git diff db-live..HEAD` is
  `20270312000000_create_class_booking_tenant_scope_guard.sql` — **outside this vertical** (a
  class-booking guard; a branch/tag graph artifact from the branch reset). Every migration in **this
  vertical** (memory, knowledge, vault, spine) is contained in `main` and, per the grounding scouts,
  in `db-live` at grounding time.
- **GLOBAL HONESTY CAVEAT — authenticated-prod re-confirm is PROOF OWED across the entire map.**
  Supabase MCP (`list_projects`/`list_tables`/`execute_sql`/`list_migrations`) was **permission-denied
  for this session** on every scout. So **no live-prod schema, RLS, grant, or row-count reading was
  taken.** RLS/grant/`prosecdef` facts below are read from migration **source** that the CI deploy
  tags say is persisted; **live row counts and the authenticated production drive were not obtainable
  and are owed** (§32.c/§70). Where a state says "LIVE," it means *wired into a mounted surface and
  reading a real seam*; it does **not** mean an authenticated owner drive was performed this session
  unless explicitly noted.

### The five states (owner's taxonomy — used verbatim)

| State | Meaning |
|---|---|
| **LIVE** | Wired into a mounted surface and exercising a real seam end-to-end in code (the grounding verdict). The owner's bar is **authenticated real-user proof**; because MCP was denied this session, **every "LIVE" row below also carries "auth re-confirm PROOF OWED"** (see the global caveat). Nothing in this vertical is authenticated-`LIVE` this session. |
| **SOURCE-BUILT** | A real seam is deployed and proven at source / behaviorally, but **not** authenticated-runtime-proven, and/or has no user-visible surface. |
| **PARTIAL** | Implemented and tested, but **not** end-to-end usable by a person. |
| **UNAVAILABLE** | No source, deliberately not built, or not mounted for that tier. |
| **PROOF OWED** | Deployed, but authenticated proof has not been taken. |

> A migration, a fixture, a preview page, an internal documentation record, or a static test is
> **never** counted as a user-visible capability (owner's rule).

---

## Executive headline — the one true paragraph

**Nothing in this vertical is LIVE for the owner as an authenticated, tenant-safe, end-to-end flow.**
The binding ledger's own honest position confirms it: *"As of the grounding SHA, NO surface is LIVE …
PROOF_OWED"* (`docs/binding-ledger/surface-binding-ledger.json:40`). What exists is a **strong,
safe-by-construction seam layer** with a **thin usable edge**:

- **The one thing a person can actually DO** in this vertical today is **Tenant Knowledge** on Solo:
  read the indexed doc list (mounted, real read) and **delete / share-toggle** a doc, plus **ingest**
  paste/URL/file (deployed edge functions). Even this is `SOURCE-BUILT` / `PROOF OWED` (no authenticated
  drive taken) and its **metadata-edit and organize/folders are UNAVAILABLE**.
- **The Solo Mind orb reads real data but is read-only** — a visualization over three tenant-scoped
  hooks. It is **not** the governed Mind evidence contract (that contract binds exactly one capability,
  pipeline, inside a client-scoped chat turn).
- **Memory** for the *client* audience is LIVE (chat auto-write + coach `ClientMemoryTab`). Memory for
  the *owner* — the governed `record/get/forget` seam, the confirmed-only projection, any owner-facing
  view/correct/forget UI — is `SOURCE-BUILT` or `UNAVAILABLE`: **zero product callers, no UI.**
- **Second Brain** (receipts via the Rail, current facts via the Spine, decisions/outcomes/lessons via
  owner memory) is **built as safe seams, not as a usable owner-facing history**: `SOURCE-BUILT` /
  `PARTIAL` / `PROOF OWED`, on near-empty underlying data.
- **The internal-vs-tenant boundary is SAFE**: developer `docs/brain/`, raw system prompts, and hidden
  chain-of-thought are **provably never** served as customer knowledge. One tracked adjacent hygiene
  gap (C-5) exists and is *not* on this boundary.

---

## Domain 1 — Paige Mind & context assembly

### 1a. The governed Mind evidence contract (Spine → Mind projection)

| Capability | State | Real seam (file:line) | Notes |
|---|---|---|---|
| Registered Spine capabilities | **SOURCE-BUILT** (all `maturity: PARTIAL`) | `_shared/paige-spine/registry.ts:21` assembles from 12 domain modules — **35 capabilities**, code-verified | Distribution: mindBinding 17 PARTIAL / 18 UNAVAILABLE / 0 LIVE. **Zero are `maturity: LIVE`.** |
| The C2/C3/C4 signal-envelope contract | **PARTIAL / PROOF OWED** | `_shared/paige-spine/resolveEvidence.ts` (19-key envelope) → `mindEvidence.ts:90` | **Binds exactly ONE of the 35**: `pipeline.deal_stage_evidence`. It is the only capability that flows the hardened envelope into a chat turn. |
| Mind evidence into a chat turn (cited) | **PARTIAL / PROOF OWED** | `paige-ai-chat/index.ts:1249,4625` `loadSpineEvidenceForChat` | Loads only when a client is scoped (C4); otherwise a byte-identical UNAVAILABLE block. |
| The other read capabilities (business_context, team, social, n8n_readiness) | **SOURCE-BUILT** | parallel `domains/*ChatEvidence.ts` per-domain projections | Each header states it is *"Deliberately NOT routed through resolveEvidence.ts"* — the **SCR-2 workaround** realized as hand-written per-domain bounded projections, not the one contract. |

### 1b. Context assembly — what actually reaches Paige in a turn

Built at `paige-ai-chat/index.ts:4613-4630`, in order. Every block is a real server read; none is
authenticated-runtime-proven this session.

| Context block | Source seam | Scope gate | State |
|---|---|---|---|
| Persona (tenant/brand/playbook/funding_enabled) | `get_paige_persona_context` RPC | tenant (server-resolved) | SOURCE-BUILT |
| VOICE block | compiled constant | none | SOURCE-BUILT |
| §52 Operator briefing | `loadOwnerContextBlock` (`_shared/owner-context.ts`) | tenant-less persona **AND** `is_platform_operator()` from verified JWT | **PARTIAL / PROOF OWED** — NO-OPs unless `paige_owner_memory` seeded; metrics real-queried with honest fallbacks |
| business_context.readiness | `get_business_context_readiness` | tenant | SOURCE-BUILT |
| public presence · team authority · social presence · business mission · n8n readiness | resolver RPCs (`get_*`) | tenant | SOURCE-BUILT (each) |
| Pipeline Spine evidence (the cited one) | envelope resolver on **caller JWT** client (`:1249`) | **client (C4)** | **PARTIAL / PROOF OWED** |
| capability status block (Gate A, #1158) | Capability Gateway | tenant | SOURCE-BUILT |
| systemPrompt + memory + clientContext | credit/funding prompt (**gated by tenant `funding_enabled`, §2 opt-in — never a platform default**) + `client_memory`/semantic | client/caller | client chat prompt LIVE-ish; memory recall per Domain 2 |

### 1c. The Command Center → Mind orb (`SoloMindWorkspace`)

**The orb is a read-only visualization over three ordinary tenant-scoped hooks — it is NOT the Mind
evidence contract.** It consumes no `resolveEvidence.ts` envelope, `mindEvidence.ts`, or `rail:`-cited
projection, and emits no citations. Self-labels the orbit "visual only. Tenant activity is unchanged."
(`SoloMindWorkspace.tsx:110`).

| Control | Real seam (file:line) | State |
|---|---|---|
| Knowledge-domain nodes / record cards | `useSoloKnowledge` → `tenant_knowledge_docs` (RLS) (`data/useSoloKnowledge.ts:156-160`) | SOURCE-BUILT / PROOF OWED (real read) |
| "Connected sources" nodes | `useN8nSpineReadiness` → `get_n8n_spine_readiness` RPC | SOURCE-BUILT / PROOF OWED |
| "Operating decisions" nodes | `useCommandCenter` → `usePendingApprovals` | SOURCE-BUILT / PROOF OWED |
| identity / people / offers domains | no hook → honest absence copy (`mindDomains.ts:237-254`) | **UNAVAILABLE** (honest empty) |
| Refresh records | re-reads the three real seams (`:308`) — explicitly "not a scan" | SOURCE-BUILT |
| Open PAIGE (header + drawer) | `openPaige` → `expandRail()`; **no Mind context attached** (`:309-316`) | PARTIAL (honest "No Mind context was attached") |
| Filter chips · callouts · drawer · expand | client-side `useState` | SOURCE-BUILT (presentation) |
| Pause/Resume orbit · Reduced motion · Reset view | `localStorage` via `mindOrbitPreference.ts` | SOURCE-BUILT (per-viewer pref, not a governed seam) |
| Clear (dismiss) / Restore card | `writeMindDismissed` → `localStorage` (non-destructive) | SOURCE-BUILT (per-viewer; the record is never touched) |
| Any create/update/delete from Mind | none exists | **UNAVAILABLE** (read-only by design) |

---

## Domain 2 — Persistent Memory & authority/RLS

| Capability | State | Real seam (file:line) | Notes |
|---|---|---|---|
| `client_memory` store + chat auto-write | **LIVE** · auth re-confirm PROOF OWED | `paige-ai-chat/index.ts:1113-1199,1692-1701` writes with voyage-3 embeddings each qualifying turn | The one memory audience wired end-to-end in code. Gated by `skipScopedMemoryWrites` when client scope is refused. Authenticated prod drive not taken this session. |
| `client_memory` recall | **LIVE** (arm), **PROOF OWED** (post-fix drive) | `match_paige_memory` via **service-role** client (`:1500-1508`) | §59 caller-scope fix shipped 2026-09-13 (`20270304000000`); authenticated prod drive still owed. |
| Coach viewing/correcting a client's memory | **LIVE** · auth re-confirm PROOF OWED | `ClientMemoryTab.tsx:102-114` (list, add coach_note, deactivate) via raw RLS-gated table access | Coach managing a *client's* memory — not owner self-memory. Authenticated prod drive not taken this session. |
| `paige_owner_memory` store | **SOURCE-BUILT** | `20260810120000_paige_owner_memory_l8_fabric.sql` (RLS own-user/own-tenant + operator NULL-tenant branch) | Deployed + persisted; **no owner-facing surface.** |
| Governed seam `record_/get_/forget_paige_memory` | **SOURCE-BUILT** | `20261223000000` (SECURITY DEFINER, anon-revoked, §59 in-body scope, six governance fields + confirmation_state) | Pre-merge `BEGIN..ROLLBACK` boundary-proven. **Zero product callers, no UI** (grep confirms only migration/tests/ledger/prototypes). |
| Owner-Ops / conversation / agent governed chat auto-write (slice 4b) | **UNAVAILABLE** (DEFERRED) | `paige-ai-chat/index.ts:590-602,1765-1778` ("STILL DEFERRED to slice 4b … NOT wired here") | Ships the seam it will call; not wired. |
| `match_paige_owner_memory` (owner semantic recall) | **SOURCE-BUILT** (unwired) | `20260810120000:113-155` | Deployed; read path into chat explicitly deferred (4b). NULL-tenant `=` filter documented as a latent trap. |
| Confirmed-only runtime projection | **UNAVAILABLE** | — | No code promotes `confirmation_state='confirmed'` memory into task context. Contract marks it UNAVAILABLE until built. |
| Owner-facing Memory UI (view/correct/forget) | **UNAVAILABLE** | — | No surface for an owner to see/correct/forget what Paige stored about them. `forget_paige_memory` exists as a seam but has **no UI caller** (§70 usability gap). |
| GDPR bulk hard-delete of owner memory | **UNAVAILABLE** | `process-data-deletion/index.ts:94-96` deletes `client_memory` only | Never touches `paige_owner_memory` or the governed forget. |
| `chat_message_embeddings` recall arm | **UNAVAILABLE** (dark) | read by `match_paige_memory` chat arm; **no live producer** | Function reads it; nothing writes it. |

---

## Domain 3 — Tenant Knowledge (documents, URL, extraction, retrieval, provenance, edit, delete)

> **Tenant Knowledge and the Business Vault are two SEPARATE systems.** Knowledge (`tenant_knowledge_docs`
> / `tenant_knowledge_chunks`, voyage-3 @ 1024) feeds Paige RAG. The Vault (`business_vault_*`) is a
> fail-closed evidence quarantine that **deliberately does not feed Mind** (Domain 4c).

| Capability | State | Real seam (file:line) | Notes |
|---|---|---|---|
| KB read (doc list) | **LIVE** (read, mounted) / PROOF OWED | `useSoloKnowledge` → `tenant_knowledge_docs` (RLS) | Mounted in the Solo Mind orb + Solo Paige Knowledge tab. |
| Ingest — paste | **SOURCE-BUILT** / PROOF OWED | `kb-ingest-doc` → `_shared/kb-ingest-core.ts` (1000/150 chunk, voyage-3) | §13 honesty: zero embeds ⇒ doc row deleted + `embedding_failed`, no phantom save. |
| Ingest — URL | **SOURCE-BUILT** / PROOF OWED | `kb-ingest-url/index.ts` (SSRF-guarded every hop via `_shared/ssrfGuard.ts`) → hands JWT to `kb-ingest-doc` | Single-page fetch, not a crawler. Writes `tenant_knowledge_docs` with `source:'url', source_url`. |
| Ingest — file (OCR/extraction) | **SOURCE-BUILT** / PROOF OWED | `kb-ingest-file/index.ts` (Claude native document/image OCR for scans) | Depends on Claude + `VOYAGE_API_KEY` at runtime (unverifiable via MCP). |
| Retrieval | **LIVE** (via source) / embedding-secret PROOF OWED | `match_tenant_knowledge()` (SECURITY DEFINER, tenant-scoped) via caller JWT (`paige-ai-chat/index.ts:2035`; `kb-search`) | Hardened §9 fail-closed: resolved scope must equal caller's declared `active_tenant_id`. ONE embedding space (voyage-3 / 1024). |
| Delete | **LIVE** (via source) / PROOF OWED | `KnowledgePanel.tsx:93-101` → `.delete()` under RLS; chunks cascade | Confirm dialog present. |
| Share-to-network toggle | **LIVE** (via source) · auth re-confirm PROOF OWED | `KnowledgePanel.tsx:83-91` UPDATE `share_to_network` | Promotion to global canon is operator-side (`kb-promote-to-network`, §9). |
| Provenance | **PARTIAL** | `source` + `created_at` surfaced (`KnowledgePanel.tsx:51-57,187-227`) | `source_url` is **stored but NOT surfaced** in any KB UI; **no `last_verified`/freshness column** exists. Sharpest honesty gap between "provenance" as framed and what a tenant can see. |
| Edit metadata (title/category/tags/summary post-ingest) | **UNAVAILABLE** | set only at ingest in `AddDocDialog`; no post-hoc edit UI/RPC | RLS `tkd_tenant_update` would permit it; nothing drives it beyond the share toggle. |
| Organize / folders / re-tag | **UNAVAILABLE** | no folder concept; `category`+`tags` freeform, written once | No move/re-file seam. |

---

## Domain 4 — Second Brain (decisions, facts, receipts, lessons, outcomes; internal vs tenant-visible)

### 4a. Receipts — the Rail

| Capability | State | Real seam | Notes |
|---|---|---|---|
| Rail write | **SOURCE-BUILT** | `record_rail_event` / `record_capability_run` (six-outcome vocabulary incl. `completed_unrecorded`) via `_shared/capability-record.ts` (20+ adopters) | Two legacy inline writers (`n8n-management.ts`, `mcp-outcome.ts`) predate the helper (tracked). |
| Rail read (owner-facing) | **PROOF OWED** | `get_solo_rail_activity` / `get_client_rail` SECURITY DEFINER resolvers; Slice B moved all four owner-facing consumers onto them (`useRailEvents.ts`, `useSoloActivityFeed.ts`, `PaigeRailFeed`, `ClientActivityFeed`) | Raw tables browser-**denied** (zero table privilege); resolvers raise `42501 RAIL_FORBIDDEN` on refusal (never empty). Safe by construction. `capability_run` rows = 0 (2026-09-05); rail ≈ 9 rows (2026-09-03). |
| Campaign Brief producer | **LIVE** (producer) / owner lane **PARTIAL / PROOF OWED** | PR #1047, merge `ae0a16a0` (2026-09-07) | The lone LIVE producer; the owner-visible card/Rail lane is still PARTIAL. |
| Rail write-path escalation gap (#824) | tracked | `record_rail_event` still carries `has_any_role` | member→staff inside one workspace; integrity not disclosure; escalation population 0. |

### 4b. Current facts — the Spine

Covered in Domain 1a. 35 registered, all `maturity: PARTIAL`, axis-B = NO for every surface. "What is
true now" reaches the **model** in a client-scoped turn; it is not an authenticated owner-facing capability.

### 4c. Decisions / outcomes / lessons — governed owner memory

| Type | State | Notes |
|---|---|---|
| `decision` / `commitment` / `correction` | **PARTIAL** | `paige_owner_memory` via governed seam; own-scope Owner-Ops audience; **no `src` reader**; auto-write deferred. Server/agent-only today. |
| `agent_outcome` | **PARTIAL** | Same store/seam; own-scope; no UI. Internal/agent-only. |
| `agent_lesson` | **PARTIAL** (internal **by design**) | "scoped lessons ONLY — never hidden reasoning." Runtime-Harness eligibility boundary: a `proposed` row is a candidate, not eligible knowledge; the confirmed-only projection is **UNAVAILABLE**. |
| Owner-visible operational-history feed | **PROOF OWED** | A real, safe feed EXISTS (`SoloSystemsCheckWorkspace` `RailActivityPanel`, Trust Compass, Team Activity) reading the safe resolver, distinguishing denied from empty — but axis-B = NO and underlying data is near-empty. |
| Business Vault (owner-entered evidence) | **PARTIAL** / binary intake **UNAVAILABLE by design** | `business_vault_*` (24 RPCs). Fail-closed quarantine (`business-vault-upload` → `503 inspection_unavailable`, no approved OCR/DLP adapter). **Vault-to-Mind boundary intact** — a Vault record is not copied to Mind, chat, or Rail. |

### 4d. Internal-vs-tenant-visible boundary — **SAFE**

- `docs/brain/` is **never served at runtime** (zero `docs/brain` in `src/`; the matches in
  `supabase/functions/**` are all comment provenance citations, not reads).
- Raw prompts / hidden reasoning / transcripts never reach the Rail or Brain context. Brain-hydration
  projects only `event_kind/title/occurred_at`. `paige_llm_trace` is a scrubbed/capped store, not a rail,
  not tenant-facing.
- Cross-tenant / private-knowledge boundary is **behaviorally proven** (`scripts/knowledge-scope/`,
  300+ falsified checks — closes the #588-class defect).
- §52 operator briefing ships ONLY to the tenant-less platform operator (dual-gated); owner name from
  auth metadata, never a committed artifact; fails closed to null.
- **Tracked adjacent hygiene gap C-5 (NOT this boundary):** four shipped emitters put raw message text
  into `paige_client_events.summary`, persisted and broadcast to same-tenant **staff** browsers. Not
  internal docs, not chain-of-thought, not cross-tenant, and **does not reach the model.** Flagged per §13.

---

## Domain 5 — Chat retrieval & citations

**Retrieval** is a fan-out of independent, mostly best-effort reads, not one RAG index:
`knowledge_base` full-text (`:1799`), `client_memory` recall + semantic (wrapped in an untrusted-content
fence), Rail hydration (`get_client_rail_for_chat`, ≤20 rows), `deep_research`/`web_search` tools (honest
`configured:false` degrade). Cross-session **owner** semantic memory is **UNAVAILABLE (deliberately unwired,
4b)**.

**Citations — two independent systems, both IN-PROSE only.** There is **no machine-readable citation
payload** streamed to the UI (grep confirms no `sources`/`references`/`citations` SSE event):

1. **Spine/Mind `rail:<uuid>` citation** — `mindEvidence.ts:126-147`; the model is *instructed* to name
   the source. **PARTIAL / PROOF OWED.**
2. **Deep-research `[n]` citations** — folded into the model tool-result; model weaves markers into prose.
   **SOURCE-BUILT** (honest no-source degrade).

Net: citations live in the model's text. The "the record says so vs Paige says so" guarantee rests on the
model following instructions — not a structural downstream contract. **Design implication for Phase 3:** a
trustworthy Mind Workspace that shows provenance/citation as a first-class, verifiable UI element would need
a **new structured citation contract** (a backend change — the §00 "backend must change for the design to
work" conversation), because none exists today.

---

## Domain 6 — UI surfaces (screen → seam) and per-tier availability

### Surface inventory

| Surface | Route | Tier(s) | State |
|---|---|---|---|
| Command Center → **Mind** orb (`SoloMindWorkspace`) | `/solo/{account}/command-center/mind` | **Solo only** | SOURCE-BUILT / PROOF OWED (read-only) |
| Solo Paige → **Knowledge** tab (read-only doc list) | `/solo/{account}/paige/knowledge` | Solo only | SOURCE-BUILT / PROOF OWED (read wired; mutations UNAVAILABLE) |
| Agency/Sub/Enterprise Paige → Knowledge (orb + rails) | `/agency|business|enterprise/{n}/paige/knowledge` | Agency, Sub, Enterprise | **UNAVAILABLE for these tiers (100% fixture-driven — no real read).** The KB *seam* is SOURCE-BUILT platform-wide, but a fixture is never a user-visible capability, so per tier this surface is UNAVAILABLE. |
| Operator Paige → Knowledge (`KnowledgeSurface`) | `/operator/paige/knowledge` | Operator (God) | SOURCE-BUILT / PROOF OWED (real read of `knowledge_base`, read-only) |
| Solo **Business Vault** | `/solo/{account}/settings/vault` | Solo | PARTIAL (real RPC read/write; binary upload UNAVAILABLE) |
| Agency/Sub/Enterprise Business Vault | `/agency|business|enterprise/{n}/business-vault` | Agency, Sub, Enterprise | **UNAVAILABLE for these tiers (fixture-driven — no real read);** the Vault seam is separate and PARTIAL on Solo only |
| Operator Platform Vault | `/operator/settings/vault/*` | Operator | SOURCE-BUILT (pack-spec; adjacent, not the KB corpus) |
| Chat reasoning receipts (`PaigeStepTrace`) | wherever chat mounts | all tiers | SOURCE-BUILT (streamed step receipts, **not** a doc-citation panel) |
| Memory management UI (view/correct/forget) | — | **NONE (tenant tiers)** | **UNAVAILABLE** |
| Orphan `src/solo/knowledge.tsx` (sample-graph fixture) | — | not mounted | **UNAVAILABLE** (dead code; buttons have no onClick) |

### Per-tier availability grid

| Tier | Mind (orb) | Knowledge | Memory (view/correct/forget) | Business Vault |
|---|---|---|---|---|
| **God / Operator** | UNAVAILABLE (no Mind orb) | SOURCE-BUILT/PROOF OWED (platform corpus, read-only) | UNAVAILABLE (`paige/memory` route is honest-empty) | SOURCE-BUILT (Platform Vault spec) |
| **Agency** | **UNAVAILABLE** (AGENCY_BRANCHES has no `mind` subtab) | UNAVAILABLE (fixture-only) | UNAVAILABLE | UNAVAILABLE (fixture-only) |
| **Enterprise** | **UNAVAILABLE** (= Agency tree) | UNAVAILABLE (fixture-only) | UNAVAILABLE | UNAVAILABLE (fixture-only) |
| **Solo** | **SOURCE-BUILT / PROOF OWED** (real reads) | SOURCE-BUILT/PROOF OWED (read); mutations UNAVAILABLE | UNAVAILABLE ("not activated") | **PARTIAL** (real RPC read/write; upload UNAVAILABLE) |
| **Sub-account** | **UNAVAILABLE** (routes via `AgencyApp`, no Mind subtab) | UNAVAILABLE (fixture-only path) | UNAVAILABLE | UNAVAILABLE (fixture-only) |
| **Client** | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| **Anonymous** | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |

**Two highest-value tier facts:**
- **The Mind orb is Solo-exclusive.** Sub-account/Agency/Enterprise render via `AgencyApp`, whose
  command-center has no Mind subtab. This is a **§60 "Solo ≡ Sub-account" divergence**, documented at
  `tierBranches.ts:624-648` as a known, sequenced gap (the §11c/§60 target once `/business` mounts SoloApp)
  — not an accident. **Owner-facing implication:** the assignment's "Solo first and all account types by
  design" means the Mind Workspace must be designed so the Solo surface is the one that later mounts under
  `/business`, not a Solo-only fork.
- **Memory management UI does not exist for any tenant tier.** The tables exist; no view/correct/forget
  surface does.

---

## Structural constraints & change requests (what the design must respect or explicitly change)

These are the seams that decide what a Mind Workspace *can* show without a backend change. Each is either a
constraint the design lives within, or a named Change Request (a §00 "backend must change for the design to
work" item) to raise at the review gate.

| ID | Constraint (as built) | Change Request if the design needs more |
|---|---|---|
| **C1** | The Rail is per-client; workspace-level outcomes have a home (`record_capability_run` → `paige_workspace_events`) but the owner-facing resolver surfaces are near-empty. | **SCR-1** — if the Workspace should show workspace-scoped outcome history as first-class, confirm the resolver + producer coverage. |
| **C2** | The signal-envelope resolver accepts only `subject_type = "client"` (`resolveEvidence.ts:40`). | **SCR-2** — non-client subjects (the business itself, a goal, a system) are today served by parallel hand-written `*ChatEvidence.ts` modules, not the one contract. A unified Mind evidence surface across subjects needs this reconciled. |
| **C3** | Safe facts are enumerated scalars checked against a declared allowlist — no free text, no unbounded counts (`resolveEvidence.ts:17-28`). | **SCR-3** — any Mind card that wants to show richer/free-text evidence needs the envelope contract widened (safely). |
| **C4** | Spine evidence loads only inside a client-scoped chat turn (`index.ts:1247-1259`). | The Mind Workspace as a **standalone** surface cannot show governed Spine evidence without a client scope — a design that shows it outside chat needs a scoped read path. |
| **C5** | Raw message text lands in `paige_client_events.summary`, staff-visible (tracked hygiene gap; not model-facing). | Not a Mind blocker; noted so the design never surfaces `summary` as "knowledge." |
| **No structured citations** | Citations are in-prose only; no machine-readable payload to the UI (Domain 5). | A verifiable, first-class provenance/citation UI needs a **new structured citation contract** (backend change). |

---

## What a person can actually DO today (the §70 usability truth)

- **Can DO (write-capable, wired):** Solo Business Vault — propose/save/review/archive facts & obligations
  via real RPCs. **Caveats:** binary upload UNAVAILABLE (inspection adapter gate); no authenticated
  live-drive → **PARTIAL, not LIVE**.
- **Can DO (Knowledge):** on Solo — read the doc list; **delete** a doc; **share-toggle** a doc; **ingest**
  paste/URL/file. All `SOURCE-BUILT` / `PROOF OWED`; **metadata-edit and organize are UNAVAILABLE.**
- **Renders real data but read-only:** Solo Mind orb; Solo Paige → Knowledge; Operator Paige → Knowledge.
- **Only renders (fixture / dead):** Agency/Sub/Enterprise Knowledge & Vault; Operator Paige
  Memory/Documents/Research; orphan `src/solo/knowledge.tsx`.
- **Cannot DO at all (UNAVAILABLE):** view/correct/forget owner memory; edit KB metadata; organize KB into
  folders; Business Vault binary upload; any create/update/delete from the Mind orb.

---

## PROOF-OWED ledger (what an authenticated drive must confirm before any "LIVE" claim)

1. **Global:** authenticated-prod schema/RLS/grant/row-count re-confirm (MCP was denied this session).
2. **Vertical migrations persisted on prod:** the governed memory seam (`20261223000000`),
   `match_paige_memory` fix (`20270304000000`), owner memory (`20260810120000`), KB retrieval guard,
   `business_vault_*`, spine foundation (`20260902004019`) — confirm each is in prod `schema_migrations`
   **and** the objects exist (§32.a).
3. **`match_paige_memory` post-fix authenticated drive:** legit recall works AND no cross-tenant leak in the
   running product (§32.c).
3b. **The "LIVE" client-memory rows (Domain 2):** authenticated drives that `client_memory` chat auto-write
   persists a row, semantic recall returns it, and the coach `ClientMemoryTab` lists/adds-note/deactivates —
   each on a real authenticated tenant, with the tenant boundary held. (Marked "LIVE · auth re-confirm PROOF
   OWED" because code-wired but not driven this session.)
4. **KB ingest→retrieval end-to-end:** `VOYAGE_API_KEY` + Claude key set on prod; a real paste/URL/file
   round-trips into a Paige answer with a citation.
5. **Rail/receipt live counts:** `paige_client_events`, `paige_workspace_events`, `capability_run`,
   `paige_audit_log` — actual rows, not the 8–10-day-old doc snapshots.
6. **Solo Mind orb authenticated render** at desktop + narrow, both themes (§32.c owed).

---

## Deltas vs the cited docs (what is stale and must not be answered from)

- **`docs/architecture/paige-mind-integration-matrix.md`** (grounded 2026-09-03) is **materially stale on
  its central claim** (`:103` "the registry holds exactly one capability"). **Reality on `main` today: 35.**
  It also predates: the 12 SCR-N8N-MANAGEMENT capabilities, the first mutating Spine capabilities
  (business_mission/campaign/calendar_preset), and the 7 new context blocks. A dated correction banner +
  inline note is added to that file in this same change (§13/§58/§66 — the dated grounding is preserved, the
  false answer is stopped).
- **`docs/brain/paige-spine-and-rail-state.md`** cites "~17" capabilities (2026-09-05). Superseded by the
  code-verified **35** here.
- **#746 tracker divergence** (GitHub-closed vs master-ref OPEN) is unreconciled and is the owner's call;
  functional position (safe resolver deployed, consumers moved onto it) is not in dispute.
- **`docs/brain/paige-memory-contract.md`** "self-serve forget ships now" is true at the **seam** but
  `forget_paige_memory` has **no UI caller** → not user-reachable (§70). Flagged, not a doc rewrite.
- **KB provenance** framing vs reality: `source_url` stored-not-surfaced; no `last_verified` column.

---

## Cross-references

§00 (CC ports the pack, no design authority by default — the owner granted CC design authority for the Mind surface via a Phase-1 AskUserQuestion ruling, and assigned this Phase-3 Mind Workspace design directly) ·
§7 (Paige is the intelligent portal; the intelligence is the moat) · §9/§51/§59 (tenant isolation, tier
matrix, in-body caller scope) · §13/§32/§70 (honest reporting, a green build is not a working render,
usability is the deliverable) · §18 (one home per capability) · §BRAIN/§0/§66 (this map + the master doc +
tier matrix update together) · `docs/architecture/paige-mind-integration-matrix.md` (the prior, Mind-only,
now-corrected matrix) · `docs/binding-ledger/surface-binding-ledger.json` (the binding ledger) ·
`docs/brain/paige-memory-contract.md` · `docs/brain/paige-spine-and-rail-state.md`.
