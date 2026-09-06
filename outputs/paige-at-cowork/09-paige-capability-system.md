# The Paige Capability System — full-range capability direction + dependency-ordered matrix

**Program:** PAIGE-at-Cowork-Level · **Flow-by-Flow route:** audit (existing product) → foundation
decomposition (dependency-ordered slices) · **Date:** 2026-09-05 · **Base:** `main` @ post-#965.
**Status: OWNER-LOCKED MVP DIRECTION — a decision + plan, not a live capability claim.**

> **PAIGE is the tenant's governed operating environment; chat is the natural-language front door to a
> full range of real capabilities.** Do NOT narrow Paige into chat-only, read-only, or
> recommendation-only. This is ONE **Paige Capability System** — a set of governed capability
> contracts — not a collection of unrelated chat widgets. No capability is called live because a
> static UI, prototype, or backend helper exists (§13/§32/§70). Grounded against real code by six
> read-only scouts (research · connectors/workers/MCP · Rail/Spine/Mind · approval/autonomy/sandbox ·
> artifact-creation/image-gen · file-upload/download); every state label is file:line-citable.
> This record **subsumes** `08-sandboxed-research-external-execution.md` (its browser/sandbox/worker
> slices map into slices 4/5/7 here — §18, one home).

State labels: **LIVE** (proven usable contract) · **PARTIAL** (proven subset, gap named) ·
**UNAVAILABLE** (substrate absent) · **PLANNED** (approved, not built).

---

## 0. The operating model (owner-locked 2026-08-… → 2026-09-05)

- **PAIGE decides and governs.** She reads the goal, selects the capability/worker, carries the
  minimum necessary tenant-scoped context, performs the work the policy permits, and reports the
  **true** outcome — she does not merely describe a change she could make.
- **One governance, one approval path, one truth record.** Every consequential capability is
  tenant-isolated, authorization-gated, and produces a Rail outcome (succeeded / refused / failed /
  unreachable / outcome-unknown / completed-unrecorded). Spine/Mind retain only safe, scoped, sourced
  facts. Connected workers (n8n/Zapier/MCP/provider APIs/browser) are execution workers **under**
  Paige's authority — never a bypass, never a weaker "chat shortcut."
- **Chat is the front door, not the ceiling.** The user asks naturally ("research my competitors,"
  "create a proposal from these notes," "generate three campaign images and save my favorite,"
  "turn this call into client context + a follow-up plan," "upload this spreadsheet and map the
  contacts," "update the pipeline after I approve"). Paige shows what she's doing, which
  specialist/worker is handling it, what source/context she used, whether the result is a
  draft/saved-artifact/completed-action/refused/failed/outcome-unknown, and the next available action.

---

## 1. The dependency-ordered capability matrix (the core deliverable)

Each capability area, its current honest state, the contract it needs (see §2), and what it depends on.

| # | Capability area | Current state | Key evidence (grounded) | Contract | Depends on |
|---|---|---|---|---|---|
| R | **Read & understand** (tenant records, CRM/client, connected data, governed knowledge, files, permitted web) | **LIVE / PARTIAL** | RLS + `current_user_tenant_id()` everywhere; Spine `evidence` signals carry source/freshness/lifecycle; `marketing_content.brief/meta` = provenance | Read contract (provenance-preserving; no cross-tenant / credential / raw-payload / hidden-reasoning leak) | — |
| A | **Create artifacts in chat** (image · document · copy · page · funnel · form) | **LIVE** (core) / gaps | `generate_image` (4 providers) · `document_generate` (8 types) · `draft_marketing_content`/`content_save` · `growth_*`; durable home `marketing_content` (`status='draft'`); `save_marketing_content` write seam; `chatArtifacts`→`paige_artifact`→`PaigeArtifactCard`; `studio_artifact_versions` | **Artifact contract** + **image-gen contract** | R |
| U | **Upload / download & inspect files** | **LIVE** (upload+inspect) / **PARTIAL** (download) / **GAP** (injection fence) | `useChatDocumentUpload` (pdf/img/docx, 10MB, inlined) · read-check + approve-to-apply extraction · `kb-ingest-file` OCR · folder-scoped storage RLS + server-side scope refusal | **File-handling contract** | R (bounded ops); Sandbox (untrusted-exec hardening only) |
| W | **Write & operate native records** (business/client context, notes, briefs, plans, pipeline, tasks, memory) | **LIVE** (wired) / **PARTIAL** (Rail coverage) | `deal_move_stage` (now honest outcome, S1/S1.1) · `content_save`/`document_generate`/`growth_*` · `capability-record.ts` (6 outcomes); ~43 actions still write only `paige_audit_log`, not the Rail | **Native-write contract** | R, approval |
| Rs | **Research** (bounded web, competitor, crawl, synthesis) | **LIVE / PARTIAL** | `deep_research` (anti-fabrication citation gate) · `web_search` · `browse_public_url` + SSRF-hardened `paige-browser` + `paige_browser_usage`; gaps: FIRECRAWL config, DNS-rebinding #138, two unequal SSRF guards, page-write G5, §32.c live-drive | **Browser-research contract** | R (bounded ops); Sandbox (untrusted-exec hardening only) |
| X | **External execution / integrations** (n8n · Zapier · MCP · provider APIs · browser workers) | **PARTIAL** | Chat path strongly governed (classify→lane→ceiling→approval→dispatch→outcome); `paige-mcp` is tier+scope only (no risk gate); `delegate_to_subagent` runs specialists outside the gate; `decideGovernedExecution` pure module, unwired | **Connected-worker contract** | W, approval |
| P | **Communications / publishing / spend** (send · post · schedule · media-buy · commit) | **PARTIAL** (approval-gated) | comms tools LIVE; `paige_pending_confirmations`/`_approvals`; §38 money boundary; sending/publishing is a separate approval step | **External-publishing contract** | X, approval |
| Ap | **One approval path** (the single governing permission gate) | **LIVE** (core) / **PARTIAL** (unify) | `MUTATING_TOOLS` + `action-risk.ts` classify + `resolve_tool_autonomy` + Trust-Compass ceiling clamp + `paige_pending_confirmations` (stored-args, body-fingerprint); NOT applied on the MCP door or sub-agent downstream | cross-cutting (binds W/X/P) | — |
| Sb | **Sandbox** (isolated untrusted/generated-code/browser/file execution) | **UNAVAILABLE / greenfield** | no untrusted-execution sandbox exists (only read-only Fly Playwright services); no per-worker network isolation | **Sandbox contract** (substrate for U/Rs/X/P) | — |
| Ev | **Evidence — Rail / Spine / Mind** | **PARTIAL** (Rail proof-owed) / **PARTIAL** (Mind) | `record_capability_run` (6 outcomes) — RPC deployed + wired via S1/S1.1, but **§32.c live-drive OWED: 0 prod rows, end-to-end unproven** (Codex P1) · Spine registry · `paige_owner_memory` schema LIVE but no tenant writer (F02 handoff dep) | cross-cutting (binds every area) | — |

---

## 2. Capability contracts (every area declares these — §9/§13/§32)

Each capability contract MUST specify: **tenant isolation** (server-derived `tenant_id`, never body) ·
**authorization** (role/tier gate that refuses, not the grant alone — §59) · **audit/outcome
recording** (a Rail outcome via `capability-record.ts`, never a fabricated success) · **source /
provenance rules** (what was read, freshness, no raw-payload/credential/hidden-reasoning leak) ·
**safe-failure behavior** (honest degrade; refused/failed/unknown distinct) · **durable
artifact/record home** where applicable.

- **Read contract (R).** Tenant-scoped reads only; provenance (source + scope + freshness) preserved
  and shown; never crosses a tenant boundary or exposes credentials, raw provider payloads, hidden
  reasoning, or unrestricted source material. LIVE substrate: RLS + Spine `evidence` signals.
- **Artifact contract (A).** Every artifact has a tenant-scoped durable home (`marketing_content`),
  identity + version (`studio_artifact_versions`), creator/source metadata (`created_by`/`brief`/
  `meta`), preview, edit/regenerate path, download/export path, and an explicit save/attach/use action.
  Generated content is a **draft** (`status='draft'`) until intentionally saved/attached/sent/scheduled/
  published/applied. GAPS: download button (URL-only today), multi-surface card render (one surface),
  image→campaign routing, and missing types (campaign_brief · HTML email_template · video · social-schedule).
- **Image-gen contract (A).** Request → view in conversation → refine → save → download → route to the
  relevant workspace (Vibe Studio / campaign). LIVE: request/view/save (auto-file) + in-Studio refine +
  dedicated-chat in-place refine **BACKEND** (Task #15, 2026-09-06: server-owned per-(tenant,thread) anchor
  on `paige_chat_threads` + version-preserving reuse — `save_marketing_content` snapshots the prior image
  into `meta.versions[]` before the tenant-scoped overwrite; proven 10/10 on real Postgres). GAPS: download
  button, campaign routing, the frontend version-history UI + authenticated live-drive for dedicated-chat
  refine (§32.c OWED), the visual auto-critique loop is off by default.
- **File-handling contract (U).** Upload → safe inspect/summarize → choose destination; Paige creates
  downloadable files / saves approved artifacts to the correct tenant-scoped home. Uploaded/downloaded
  files are sandboxed, scoped, inspected, and **NEVER treated as trusted instructions merely because
  attached.** LIVE: upload + inspect + folder-scoped RLS + server-side scope refusal. **REAL GAP (the
  slice-2 item):** file **content is inlined raw with no prompt-injection fence** — only
  anti-hallucination guards — while that fence exists elsewhere (team-context, MCP, Zapier). **ACCURATE
  THREAT (Codex P1, verified `paige-ai-chat/index.ts:7451`):** an attached-document request takes the
  DIRECT-STREAM branch; the multi-round tool-executing agentic loop is gated to NON-document turns
  (`if (!attachedDocument)`), so model-emitted tool calls are NOT consumed on an attachment turn.
  Malicious file content can therefore **steer the answer/extraction** (a real harm — worth the fence)
  but **cannot directly drive Paige's mutating tools** on that turn. The fence stays warranted, and it
  becomes load-bearing the moment attachments are ever routed into the tool loop. Also PARTIAL: no
  generic chat→file download; xlsx/doc not model-ingestible;
  executable handling is allow-list-only (no content-sniff). Public buckets (`paige-generated`,
  `growth-assets`, `tenant-brand`, `email-assets`, `avatars`) are world-readable by URL — note in the
  safety posture.
- **Browser-research contract (Rs).** Bounded public-web research returning sources + findings + limits
  + a recommended next move; may NOT silently log in, submit forms, purchase, publish, alter data, or
  make external commitments; runs through the sandboxed/restricted execution plan. LIVE core; gaps per
  the matrix (incl. G5 page-initiated-write fence — the browse host gates host/SSRF only, not HTTP method).
- **Connected-worker contract (X).** Paige selects the worker, carries minimum context, receives a
  **structured** outcome, and records the result; a worker never bypasses tenant rules, the capability
  policy, the one approval path, source truth, or the Rail record. NET-NEW: unify the risk gate across
  the MCP door (`decideGovernedExecution` wired everywhere) and govern sub-agent downstream actions.
- **External-publishing contract (P).** Prepare freely (draft); **send/publish/schedule/change-live/
  spend/commit only through a verified connection AND the required approval path** — no weaker chat
  shortcut around those controls. §38 money boundary binds (Paige never merchant-of-record for a
  tenant→client charge).
- **Sandbox contract (Sb).** Isolate by tenant + task; no cross-tenant data; creds out of prompts/
  artifacts/logs; per-task/connector network policy (allowlist, not the global denylist); quarantined
  downloads (never instructions); short-lived envs; explicit retry/timeout/cancel/failure. UNAVAILABLE
  today — the substrate under U (safe file exec), Rs (browser), X, and P advanced actions.

---

## 3. The seven bounded slices (owner's sequencing — LOCKED)

> The owner's order LEADS with artifact creation + image gen (slice 1), then upload/download, then
> native writes, then research — a deliberate reorder of `08`'s research-first framing (§18 reconciled).

**Sandbox dependency, resolved without reordering (Codex P1):** the **bounded** operations of slices 2
(upload/inspect) and 4 (research) do NOT require the general untrusted-execution sandbox — they run on the
**existing guarded seams** (folder-scoped storage RLS + server-side scope refusal for files; the
SSRF-hardened `paige-browser` for research). The **sandbox substrate (Sb) is a prerequisite scheduled
BEFORE slice 7** and it feeds the *untrusted-execution HARDENING* inside slices 2/4 (safe generated-code/
file exec, advanced browser) — it does not gate their bounded MVP. So the locked order stands: slices 2/4
ship their bounded ops on live seams; Sb is provisioned as its own prerequisite ahead of slice 7. The
matrix "depends-on: Sandbox" for U/Rs is therefore narrowed to "untrusted-exec hardening only."

### Slice 1 — Chat artifact creation + tenant-scoped storage, incl. image generation · **LARGELY LIVE → harden + reach + fill type-gaps**
Build on: `generate_image`, `document_generate`, copy, pages/funnels/forms, `marketing_content` home,
draft-until-applied. Net-new: a **download/export action** on the artifact card; **image→campaign
routing**; the missing artifact types (campaign_brief · HTML email_template · video · social-schedule)
as their own tracked sub-slices; regular-chat in-place refine. Each new type declares the artifact
contract (§2).

> **RETIRED by owner decision (2026-09-06):** the earlier Slice-1 item "render the artifact card on
> **all** chat surfaces" is REMOVED. There must be NO floating Paige chat inside the authenticated
> platform; the only tenant-aware Paige experience is the dedicated authenticated Paige chat/workspace,
> which already renders the card. Do not port/repair/render artifact cards in a floating platform chat.
> The remaining reach items (download/export, image→campaign routing, new types, in-place refine) belong
> to the DEDICATED experience. A public-site Product Guide is a separate, tenant-isolated product (see
> decision-log 2026-09-06; task #14) — not built here. **Receipt/creation hardening in the dedicated
> Paige experience is the re-scoped Slice-1 focus** (§13/§70). Slice-1 receipt honesty shipped: #972 +
> #974 (see §5).

### Slice 2 — Safe upload/download + file inspection · **LIVE (upload/inspect) + the injection fence is the net-new**
Build on: `useChatDocumentUpload`, read-check + approve-to-apply extraction, `kb-ingest-file`,
folder-scoped storage RLS. **NET-NEW (first-class security):** a **prompt-injection fence** so uploaded
file content is treated as **untrusted data, not instructions** (reuse the existing team-context/MCP fence
pattern — §18). Accurate scope (Codex P1, verified `:7451`): the attachment turn does NOT execute
model-emitted tool calls, so today the fence guards against *steered answer/extraction*; it becomes
load-bearing the moment attachments are routed into the tool loop. Also: a generic chat→file **download**
primitive; executable/content sniffing beyond the MIME allow-list. Untrusted-exec hardening ties to Sb.

### Slice 3 — Governed native record writes · **LIVE core → continue F05 coverage**
Build on: `deal_move_stage` (honest outcome, S1/S1.1), `content_save`/`document_generate`/`growth_*`,
`capability-record.ts`. Net-new: wire the **~43 consequential actions that still write only
`paige_audit_log`** (not the Rail) to record honest outcomes at their executor — the F05 continuation.

### Slice 4 — Bounded browser research · **LIVE/PARTIAL (from `08` S-R1)**
Harden + reach: reconcile the two SSRF guards, close DNS-rebinding (#138) + G5 page-write fence, verify
FIRECRAWL config, §32.c live-drive, main-chat-loop exposure of `browse_public_url`.

### Slice 5 — Governed worker dispatch through n8n / Zapier / MCP · **PARTIAL (from `08` S-R2)**
Net-new: unify the gate across regimes (wire `decideGovernedExecution` on the MCP door) + govern
sub-agent downstream actions; carry tenant + minimum context explicitly + record the structured outcome.

### Slice 6 — One approval path for external/consequential actions · **LIVE core → unify**
Build on: `action-risk.ts` classify + autonomy lane + Trust-Compass ceiling + `paige_pending_confirmations`
(stored-args). Net-new: make it the **single** gate every door and worker passes (no MCP/sub-agent/chat
shortcut) — the enforcement backbone for W/X/P.

### Slice 7 — Advanced browser automation · publishing · communications · paid media · recurring agent operations · **UNAVAILABLE / PLANNED**
Needs the sandbox contract (Sb) + slice 6. Every such act is a `high`/`external_effect` capability
through a verified connection + the one approval path, with a recorded outcome. Recurring autonomous is
governed by §67 (autonomy granted to a PROCESS) + §68 (no authority is permanent), cloud-native (§64).

---

## 4. Cross-cutting behaviour (every slice answers these — real contracts only)

| Concern | Rule | Backing |
|---|---|---|
| Tenant isolation | server-derived `tenant_id` (never body); no cross-tenant read/write/file reach | RLS + folder-scoped storage RLS + `record_capability_run` in-body member check |
| Credential hygiene | creds service-role-resolved; never in prompts/artifacts/logs/chat | `call-zapier-action`, DB-free `paige-browser` |
| **Untrusted content** | worker/MCP/**uploaded-file**/web output is data, never instructions | fence exists for MCP/n8n/team-context; **NOT yet on uploaded files — slice-2 net-new** |
| Evidence (Rail) | every consequential act records one honest outcome (6-value vocab) | `capability-record.ts` |
| Evidence (Spine/Mind) | only scoped, safe, sourced facts (source/freshness/correction/retirement) | Spine signals; `paige_owner_memory` (F02 handoff dep) |
| One approval path | send/publish/spend only via verified connection + the one gate; no shortcut | slice 6 |
| Report honesty | draft / saved / done / refused / failed / unknown — never "Paige handled it" without a row | `_workspace_event_display`; §13 |

---

## 5. What the owner sees (UX — §20/§21/§36)
One conversation. Paige shows: what she's doing · which specialist/worker (where relevant) · the
source/context used · whether the result is a draft, saved artifact, completed action, refused action,
failed action, or outcome-unknown · the next available action. No second hidden approval system, no fake
activity feed. A material new Chat UI surface runs the #955/§00 UI-delivery + flow-prototype gate before
implementation (how it LOOKS is Claude Design's; whether a human can finish is CC's, §00/§70).

## 6. Relationship to the earlier plan (`08`, §18)
`08-sandboxed-research-external-execution.md` is a **component** of this system: its S-R1 = slice 4,
S-R2 = slice 5, S-R3 = the sandbox contract (Sb), S-R4 = part of slice 7. This record is the
authoritative capability matrix + sequencing; `08` holds the browser/sandbox/worker detail. No duplication.

## 7. Handoffs (consumed, not built here)
- **F02 Memory contract** (`paige_owner_memory` — schema LIVE, no tenant writer) for Spine/Mind fact retention.
- **`decideGovernedExecution` wiring + MCP tool-risk + sub-agent downstream governance** (slice 5/6 precondition).
- **Sandbox infrastructure** decision (Fly/container) — a §14 cost-low proposal, not a reflex.
- **Budget/cost metering** (M1: trace → `platform_metered_events`) + Trust-Compass posture derivation (F04).

## 8. Exit gate (this planning slice)
- [x] Re-grounded all capability areas (6 read-only scouts, file:line) before proposing implementation.
- [x] Dependency-ordered capability matrix with honest LIVE/PARTIAL/UNAVAILABLE/PLANNED labels.
- [x] Capability contracts per area (isolation/authz/audit/provenance/safe-failure/durable-home).
- [x] The 7 owner-sequenced slices, each with LIVE-substrate + net-new + gate.
- [x] Cross-cutting behaviours incl. the uploaded-file injection-fence gap named as first-class.
- [x] Subsumes `08` without duplication (§18); handoffs named.
- [ ] Owner review of the matrix + slice order (offered; pre-launch §4 — the direction record ships).
