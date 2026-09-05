# Sandboxed Research & External Execution — MVP Capability Decision + Delivery Plan

**Program:** PAIGE-at-Cowork-Level · **Flow-by-Flow route:** audit (existing product) → foundation
decomposition (dependency-ordered slices) · **Date:** 2026-09-05 · **Base:** `main` @ post-#962/S1.1.
**Status of the capability: APPROVED MVP DIRECTION — not a live capability.** Owner-directed 2026-09-05.

> **This is a DECISION + PLAN record, not a shipped-capability claim.** No sandbox is called "live"
> because a design or a handler exists (§13/§32/§70). Every row below carries an honest state label:
> **LIVE** (proven contract in the tested env) · **PARTIAL** (proven subset, missing part named) ·
> **UNAVAILABLE** (required substrate absent) · **PLANNED** (approved, not built) · **PROOF-OWED**
> (built, authenticated-runtime proof not yet captured). Grounded against real code by four read-only
> scouts (browser/research · connectors/workers/MCP · Rail/Spine/Mind · approval/autonomy/sandbox),
> every claim file:line-citable in the grounding reports.

---

## 0. The operating model (owner-locked framing, 2026-09-05)

- **PAIGE is the governed orchestration + decision layer.** She decides the goal, selects the worker,
  carries the minimum necessary task context, and receives a structured outcome.
- **Native Paige capabilities operate INSIDE the tenant's platform** (CRM · People · clients ·
  pipelines · campaigns · records · setup · future native social/advertising).
- **n8n · Zapier · MCP · future integrations are CONTROLLED EXTERNAL WORKERS**, never a bypass around
  Paige's authority, tenant isolation, approvals, or outcome recording.
- **Specialist agents may perform BOUNDED web research** (competitor/market/website/document
  inspection), returning **sourced findings + a plain-English recommendation** to Paige.
- **A SANDBOX is the contained workbench** for untrusted / experimental / generated-code / browser /
  file / external-worker execution — **not** a replacement for Paige, n8n, Zapier, or the governed
  tool system, and not a way to make Paige passive or slow.

**The single most important honest finding (§0/§BRAIN.2 — answered from source, not memory):** the
**research half is largely already built**; the **sandbox half is genuinely greenfield**. Treating
"Sandboxed Research & External Execution" as one net-new feature would re-invent shipped, proven code
(§18). The plan below builds on what's live and names precisely what is not.

---

## 1. What EXISTS today — the seams this plan builds on (§18: extend, never reinvent)

| Capability seam | What it is | State | Source |
|---|---|---|---|
| `web_search` chat tool → `paige-web-search` (Firecrawl) | public-web search in chat | **PARTIAL** (config-gated on `FIRECRAWL_API_KEY`; honest `configured:false` degrade) | `paige-ai-chat/index.ts` web_search dispatch; `paige-web-search/index.ts` |
| `deep_research` chat tool → `paige-deep-research` | multi-hop PLAN→SEARCH→READ→gap-check→synthesize with a hard **anti-fabrication citation gate** (every finding ≥1 real source or empty+honest) | **LIVE** | `paige-deep-research/index.ts` |
| `fetch-url-content` | SSRF-guarded single-URL reader (the READ step) | **LIVE** (weaker guard — see gap G1) | `fetch-url-content/index.ts` |
| `paige-browser` Fly service — `/browse-public-url` | self-hosted Playwright general public-web reader (title/meta/h1/body/links), **read-only** (click/submit/type/download rejected), DB-free, shared-secret gated, strong DNS-resolving SSRF guard + denylist | **LIVE** (per repo/second-brain; live Fly state not observable headless — PROOF-OWED) | `services/paige-browser/server.js`; `docs/brain/config-registry.md` |
| `browse_public_url` skill (`paige_skills`) | the governed public-web research capability; first writer of the tenant-scoped `paige_browser_usage` audit rail; reachable via `run_skill` | **LIVE** (§32.a persisted-apply confirmed; §32.c live-drive OWED) | migration `20260914000000`; `skill-runner`/`skill-interpreter` |
| `verify_deployed_surface` skill → `/self-verify` | Paige self-verifies her own deployed surfaces | **LIVE** (§32.c GREEN) | migration `20260912000000` |
| Governed CHAT dispatch (action-risk → autonomy lane → ceiling clamp → approval card → dispatch → outcome projection) | the strong governance path for external workers | **LIVE** | `_shared/action-risk.ts`; `paige-ai-chat/index.ts` gate |
| n8n (12 Spine caps: 6 read + 6 write, all writes `high`) + `zapier_run_action` (`high`) | controlled external workers, tenant-server-derived, outcome-recorded, raw payload never reaches the model | **LIVE (via Chat)** | `_shared/paige-spine/domains/n8n_management.ts`; `call-zapier-action/index.ts`; `_shared/workflowDispatch.ts` |
| `_shared/capability-record.ts` + `record_capability_run` (6 outcomes) | the one home for recording a safe, attributable outcome | **LIVE** (RPC unexercised on prod — 0 rows) | `capability-record.ts`; migration `20261220000000` |
| `_shared/ssrfGuard.ts` `assertPublicHttpUrl`/`safeFetch` | egress hardening (HTTPS-only, DNS-resolve, refuse redirects, bounded body/time) | **LIVE** (denylist model, not a per-worker allowlist) | `_shared/ssrfGuard.ts` |
| Trust Compass CEILING + `resolve_tool_autonomy` clamp; §16 `autonomy_lane` (`auto\|confirm\|off`) | the account ceiling that clamps every tool lane | **LIVE** | `20261039000000`; `20260711024632_action_bus.sql` |
| `_shared/paige-spine/governedExecution.ts` `decideGovernedExecution` | the intended ONE seam every door (chat/automation/agent/skill/mcp) should call | **PARTIAL — pure module, NOT wired to any edge function** (the live gate is inline in `paige-ai-chat`; `paige-mcp` ships 117 tools that never call `resolve_tool_autonomy`) | `governedExecution.ts` header |

**Structural safety already true today (the research constraints the owner named are mostly met):**
public browsing is **read-only by construction** (write/click/submit/download steps are rejected at
the Fly host), so it *cannot* silently log in, submit forms, purchase, publish, alter external
records, or download untrusted files into production; any action beyond research must enter the
governed action/approval path. Provider credentials never enter agent prompts/artifacts (creds are
service-role-resolved server-side; the browser host is DB-free and holds none).

---

## 2. What is UNAVAILABLE / greenfield — the genuine net-new (do NOT call these live)

| Missing capability | Why it's net-new | State |
|---|---|---|
| **A general untrusted-execution SANDBOX** — tenant+task isolation, no cross-tenant data, creds out of prompts/artifacts/logs, per-task/connector network policy (not a global denylist), quarantined downloads (never treated as instructions), short-lived task envs, explicit retry/timeout/cancel/failure | Exhaustive grep (sandbox/isolate/quarantine/vm2/firecracker/gvisor/nsjail/Deno.Command/child_process/eval/new Function/untrusted/ephemeral) found **no isolated code-runner**; the only "sandboxes" are the two Fly Playwright browser services (read-only browse/screenshot, Chromium `--no-sandbox`) and the inert Browserbase stub | **UNAVAILABLE** |
| **Advanced browser automation** (login, submit, click, download) | current browse is read-only by construction; any mutation must go through the governed action path, on top of the sandbox | **UNAVAILABLE / PLANNED** |
| **Per-worker network allowlist + worker network isolation** | egress today is a global SSRF **denylist** (`ssrfGuard.ts`) + per-service content denylist; there is no positive per-task/connector allowlist and no worker-level network isolation | **UNAVAILABLE** |
| **One unified risk gate across BOTH regimes + governance over sub-agent/worker DOWNSTREAM actions** | `action-risk.ts` is Chat-only; `paige-mcp` enforces tier+scope but no approval-card/risk gate; `delegate_to_subagent` runs the orchestrator as service-role and the specialist's actions run outside the gate ("delegating IS the authority decision") | **UNAVAILABLE** (the `decideGovernedExecution` seam exists as a pure module but is unwired) |
| **Budget/cost control + Trust Compass consult on the worker EXECUTION path** | `trigger-workflow` is fail-closed **disabled** precisely because neither exists; the F01↔F04 contracts `trust_compass_autonomy_consult` + `budget_or_cost_control` are declared `missing_contracts` on the dispatch paths | **UNAVAILABLE** |
| **Recurring autonomous schedules / agent operations** | depends on §67 (autonomy granted to a PROCESS) + §68 (no authority is permanent) + the sandbox + governed dispatch; cloud-native (§64), never laptop | **PLANNED** |

---

## 3. The five dependency-ordered slices (owner's requested distinction)

```
S-R1 Browser research MVP ──► S-R2 Governed worker dispatch ──► S-R3 Sandboxed file/code/data work
        (LIVE/PARTIAL)              (PARTIAL, net-new gov)            (UNAVAILABLE / greenfield)
                                          │                                   │
                                          └──────────────► S-R4 Advanced browser automation
                                                                (UNAVAILABLE; needs S-R2+S-R3)
                                                                        │
                                                                        └─► S-R5 Recurring autonomous
                                                                              (PLANNED; needs §67/§68)
```

### S-R1 — Browser research MVP · **PARTIAL → harden + reach, do NOT rebuild**
The researcher (Paige/specialist) conducts bounded public-web research and returns sourced findings +
a plain-English recommendation. **Already delivered by `deep_research`/`web_search`/`browse_public_url`.**
Slice work is hardening + reachability, not construction:
- **G1 — reconcile the two unequal SSRF guards (§18 one home):** route `fetch-url-content` through the
  strong DNS-resolving `paige-browser/ssrf-guard.mjs` (or the shared `_shared/ssrfGuard.ts`) so the
  deep-research READ step is as strong as the Fly browse path. Close DNS-rebinding (#138); schedule the
  denylist refresh (#151).
- **G2 — honest config surface:** confirm/verify `FIRECRAWL_API_KEY` on prod; keep the `configured:false`
  degrade truthful (§13). (Config-registry names it; live secret state is PROOF-OWED.)
- **G3 — §36 reachability (behavioural, adversarial-verifier owns; how it LOOKS is CD's, §00):** confirm a
  non-technical owner can invoke research from the one Paige conversation ("Research competitors", "Find
  current pricing", "Review this file") — `deep_research`/`web_search` are in the chat tool loop; the
  `browse_public_url` skill is reachable via `run_skill` but NOT yet in the main chat tool loop (a tracked
  exposure decision, its own slice + §32).
- **G4 — §32.c live-drive:** authenticated drive of `deep_research` + `browse_public_url` painting real
  sourced findings + a `paige_browser_usage` row (needs a browser/paige-mcp-capable session — OWED by this
  headless session).
- **Cross-cutting (met today, assert in the slice):** read-only browse; any action beyond research → the
  governed path; creds never in prompts/artifacts.
- **UI:** if research adds a material new Chat surface, the #955/§00 UI-delivery standard (paige-ui-design +
  flow-prototype + evidence) gates it. Surfacing existing results in the one conversation does not.

### S-R2 — Governed worker dispatch · **PARTIAL, real net-new governance**
Every n8n/Zapier/MCP/browser/future action must **originate from a Paige-governed capability decision**;
workers must not be an alternate door around authority/approval/tenant-boundary/outcome rules.
- **The CHAT path is already strongly governed** (classify → lane → ceiling clamp → approval card → dispatch
  → outcome projection; tenant server-derived; raw payload never reaches the model). Build on it.
- **The gaps to close (net-new):**
  - **Unify the gate across regimes:** wire the existing pure `decideGovernedExecution` seam so `paige-mcp`
    `tools/call` and Chat pass the SAME classify→clamp→approve logic (today MCP is tier+scope only; 117 MCP
    tools never call `resolve_tool_autonomy`).
  - **Govern sub-agent/worker DOWNSTREAM actions:** `delegate_to_subagent` runs the orchestrator as
    service-role and the specialist acts outside the gate ("delegating IS the authority decision"). Bring the
    specialist's tool use under the same risk gate — the explicit precondition for delegation to be less than
    a blanket authority grant.
  - **Carry tenant + minimum task context explicitly to workers**, and record the worker's structured outcome
    to the Rail (reuse `capability-record.ts`) — the worker may perform the task but must not silently enlarge
    it, change its tenant, or invoke unrelated capabilities. (n8n webhook body carries `paige_run_id`+`source`
    but no explicit tenant_id — tenant binding is implicit in the registered webhook; fence stays operator-tenant.)
  - **Budget/cost + Trust Compass consult on the execution path** (the reason `trigger-workflow` is fail-closed
    disabled). Ties to §67/§68 + the metering prerequisite (M1: carry the trace into `platform_metered_events`).

### S-R3 — Sandboxed file/code/data work · **UNAVAILABLE / greenfield (the real net-new)**
The contained workbench for untrusted / experimental / generated-code / browser / file / external-worker
execution. Cloud-native (§64 — a Fly/container service or equivalent, never laptop), DB-free like
`paige-browser`, shared-secret gated. Hard requirements (all from the owner's sandbox-boundary list):
- Isolate execution **by tenant AND task**; **no cross-tenant data access**.
- Keep provider credentials **out of** agent prompts, artifacts, logs, and resulting chat content.
- **Restrict network per task + connector policy** (a positive allowlist, not the global denylist) — no
  arbitrary internet or internal-network reach by default.
- **Quarantine untrusted downloads/files**; never treat their content as instructions (prompt-injection
  boundary — mirror the existing MCP-egress projection discipline).
- **Short-lived task environments**, cleaned up after completion.
- **Explicit retry / timeout / cancellation / failure** states, safe by construction.
- Records a safe, attributable Rail outcome for every meaningful sandboxed action (reuse the 6-outcome
  `capability-record.ts`); Spine/Mind retain only scoped, sourced, safe facts (F02 Memory contract — a
  handoff dep, not built).
- **Honest gate:** ship inert/flagged-off until the isolation invariants are proven (§32/§68 — a registered
  check that never ran is the failure §68 exists to catch).

### S-R4 — Advanced browser automation · **UNAVAILABLE / PLANNED**
Login, submit forms, click, download — beyond read-only research. **Only through the governed action/approval
path** (never a research-path bypass), executed inside the S-R3 sandbox, dispatched via S-R2. Every such act
is a `high`/`external_effect` capability with an approval card and a recorded outcome.

### S-R5 — Recurring autonomous schedules / agent operations · **PLANNED**
Repeatable processes that run unattended. Governed by §67 (autonomy is granted to a PROCESS, not a tool) +
§68 (no authority is permanent — attestation + passing safety loops). Cloud-native scheduling (§64 —
`pg_cron`/GitHub Actions, never laptop). Each firing passes the floor + ceiling before anything runs; states
its metering consequence (§67).

---

## 4. Cross-cutting behaviour (every slice answers these — real contracts only)

| Concern | Rule | Backing |
|---|---|---|
| **Tenant isolation** | every read/write scoped by `current_user_tenant_id()`; sandbox isolates by tenant+task; no cross-tenant data | RLS + `paige_browser_usage` (server-resolved tenant, never body) |
| **Credential hygiene** | creds service-role-resolved server-side; never in prompts/artifacts/logs/chat; browser host DB-free | `call-zapier-action` `get_tenant_mcp_secret`; `paige-browser` DB-free |
| **Prompt-injection / untrusted content** | worker/MCP/download output is UNTRUSTED data, never instructions; asserted on the exact bytes reaching the model | `mcp-egress-smoke.mjs`; sandbox download quarantine (S-R3) |
| **Evidence (Rail)** | every meaningful external/sandboxed action records succeeded/refused/failed/cancelled/outcome-unknown/completed-unrecorded — no secrets, no raw payload, no invented success | `_shared/capability-record.ts` (6 outcomes) |
| **Evidence (Spine/Mind)** | retain only scoped, safe, sourced facts with source/freshness/correction/retirement | F02 Memory contract — **handoff dep** (`paige_owner_memory` schema LIVE, no tenant writer) |
| **Bypass prevention** | every worker action originates from a Paige-governed decision; no alternate door | S-R2 (unify the gate; govern downstream) |
| **Report honesty** | Paige explains in chat what happened, what's unresolved, the next move — no "Paige handled it" without a row | `_workspace_event_display` projection; §13 |

---

## 5. What the owner sees (UX — §20/§21/§36)

The owner asks Paige **normally**, in the one conversation ("Research competitors", "Find current pricing",
"Review this file", "Prepare a campaign"). Paige **names which specialist/worker is handling it, what it may
do, and when approval is required** — draft-first, one-click approve (§36). **No second hidden approval
system; no fake activity feed** (§13/§20 — the transcript + the existing Rail/Command Center are the only
surfaces; consumed, not rebuilt). If a slice introduces a material new Chat UI surface, the #955/§00
UI-delivery + flow-prototype gate runs before implementation.

---

## 6. Handoffs (dependencies consumed, not built here)

- **F02 Memory contract** (Mind/Memory recovery agent): `paige_owner_memory` (L8) schema/RLS/RPC are LIVE
  but have **no tenant writer**; sourced-fact retention for research/sandbox outcomes rides this contract.
- **Unified governed-execution wiring** (`decideGovernedExecution` → every door) + **MCP tool-risk +
  sub-agent downstream governance**: the S-R2 precondition; today a pure module + a Chat-only gate.
- **Budget/cost metering** (M1: trace → `platform_metered_events`) + **Trust Compass posture derivation**
  (F04): the execution-path safety/cost consult (§67/§68); posture-derivation is planning-docs-only today.
- **Sandbox infra decision** (Fly/container/other) is a §00-adjacent engineering choice + a possible new
  dependency → §14 cost-low proposal, never a reflex.

---

## 7. Exit gate (this planning slice)
- [x] Re-grounded the real seams (4 read-only scouts, file:line) BEFORE proposing implementation.
- [x] Distinguished LIVE / PARTIAL / UNAVAILABLE / PLANNED / PROOF-OWED honestly; no planned sandbox called live.
- [x] Five dependency-ordered slices (research MVP → governed dispatch → sandboxed code/data → advanced
      browser → recurring autonomous).
- [x] Cross-cutting sandbox-boundary + connector-rule + evidence + UX behaviours on real contracts.
- [x] Handoffs named for the not-owned deps.
- [ ] Owner review of the direction + slice order (offered; pre-launch §4 — the decision record ships).
```
