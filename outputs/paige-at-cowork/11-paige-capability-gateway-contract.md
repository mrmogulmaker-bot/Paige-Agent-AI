# Paige Capability Gateway — contract + affected-flow/collision assessment (Phase 1)

Owner direction 2026-09-12 (Gate A): build the Spine-to-Paige Capability Gateway as core operating
infrastructure — the governed consumer boundary that makes Paige's chat a truthful consumer of the
Runtime Harness + Spine, not a hand-written drifting list of tools. This is the Phase-1 record
(architecture reconciliation + the gateway contract + collision assessment + the legacy migration
register), written as part of delivery — NOT a separate approval gate.

Base: fresh `main` `bb4828ba` (my #1145 is merged into it). Branch: `claude/paige-cowork-handoff-rpf6dw`
restarted from that base. Ground-truth only — no outside-environment coordination.

## 1. The grand design (the flow this serves)

```
Platform domains own real capabilities
  → Spine declares the governed capability contract (registry.ts)
  → Tenant capability resolver determines what is TRUE right now (server-resolved)
  → Paige Capability Gateway exposes ONLY admissible capabilities to Chat
  → Paige selects a governed action / draft / question / explanation
  → domain tool or RPC performs the work through the Spine
  → canonical write or provider action
  → fresh canonical readback
  → receipt + owner-visible Rail evidence
  → truthful owner-facing result
  → Mind/Memory may learn ONLY from scoped, proven evidence
```

Chat is a consumer of governed truth, never a second source of capability truth. Mind is not
authority. Rail/receipts are evidence, not memory.

## 2. Grounded current architecture (what is real at bb4828ba)

- **Spine registry** `supabase/functions/_shared/paige-spine/registry.ts` + `contracts.ts`. A
  `SpineCapability` declares: `key` (domain.capability), `domain`, `owner`, `humanSurface`, optional
  `evidence` (read projection), optional `action` (`classification` read|mutate|external_effect ·
  `executor` exact `public.*` symbol · `chatTool` · `idempotency` · `riskPolicyKey`
  read_only|ordinary|high · `approvalAuthority` chat-canonical|none), `outcome`, and
  `chatBinding`/`mindBinding`/`maturity` (LIVE|PARTIAL|UNAVAILABLE). Validated fail-closed at import:
  mutating actions REQUIRE chat-canonical approval + LIVE chatBinding + chatTool + ordinary/high risk +
  idempotency; reads REQUIRE read_only + approvalAuthority none.
- **Registered action-capable entries with a `chatTool`** today: the n8n-management family (executor
  `edge.paige-ai-chat`) + campaign-brief family; `comms.messages_read`→`inbox_list`,
  `integrations.list`→`integrations_list`, `integrations.health`→`integrations_health` (reads). Most
  of the ~100 chat tools have NO registry declaration.
- **Chat handler** `supabase/functions/paige-ai-chat/index.ts`: a single static `const toolDefs = […]`
  (~line 5101), sent wholesale to the model (`tools: toolDefs`, ~line 7842 / 12648). Authority is
  enforced at DISPATCH (the client-seat refusal ~7961; the admin/coach/super_admin role block ~9290;
  the `resolve_tool_autonomy` confirm-gate for MUTATING_TOOLS ~7985). So today: offer-all-to-model,
  gate-on-dispatch.
- **The admissibility seed (merged #1145)**: `_shared/paige-capability-status/resolver.ts`
  (`resolveCapabilityStatus`: signals → one honest availability) + `signals.ts` (facts → signals) +
  the inline `capability_status` + `contact_event_status` chat tools. The Gateway GENERALISES this:
  the resolver becomes the admissibility core; the tools become its first consumers routed through
  the gateway instead of inline.
- **The governed action path** (preserve exactly): `resolve_tool_autonomy` (ceiling-clamped lane) →
  confirm gate for MUTATING_TOOLS → domain RPC → readback → `recordCapabilityRun`/`record_rail_event`
  receipts. Budget enforcement at the model-call entry points. None of this is bypassed.
- **The registry ratchet** `scripts/ci/chat-tool-registry-lint.mjs` + `chat-tool-baseline.txt`
  (frozen 2026-09-01; may only DESCEND). It flags any inline `name: "x",` tool not in the baseline.
  **#1145 grew it 8→10** (added `capability_status`, `contact_event_status` inline) — the regression
  this slice repairs by routing them through the gateway (so they are no longer inline `name:` lines).

## 3. The Gateway contract (the new shared primitive)

`_shared/paige-capability-gateway/` — ONE typed, testable server-side consumer boundary.

- **Input:** only server-resolved context — `{ tenantId, actorUserId, callerTier, roles, personaTenantId, … }`
  resolved from the verified JWT (never the request body, never prompt narrative, §9/§588).
- **Reads:** the Spine registry (`PAIGE_SPINE_CAPABILITIES`) for gateway-registered chat tools — a
  capability is gateway-eligible only when it carries an `action.chatTool` AND opts into the gateway
  (see the ratchet). It does NOT auto-expose every registry entry (owner correction §2).
- **Admissibility (the enriched resolver):** for each eligible capability, resolve INDEPENDENTLY the
  intersection — `declared ∩ tenant/workspace ∩ actor/role ∩ plan/tier/entitlement ∩ connection/
  provider state ∩ authority/approval ∩ autonomy/budget ∩ evidence/freshness/conflict ∩ release/
  maturity` — extending `resolveCapabilityStatus` to the richer status set:
  `available_now · needs_confirmation · needs_connection · needs_upgrade · draft_only · read_only ·
  unavailable · prohibited · stale_or_conflict_blocked · proof_owed`.
- **Output (three shapes):**
  1. a **safe model tool definition** for each capability whose execution is admissible now (spread
     into the model's tools — no inline `name:` literal, so the ratchet is satisfied);
  2. a **safe explanatory capability card / answer** where execution is not admissible (so Paige can
     say what she needs — a connection, an approval, an upgrade — instead of pretending or bluntly
     refusing);
  3. a **governed denial / clarification requirement**.
- **Dispatch:** a typed router the handler calls for gateway tools; it re-resolves authority and runs
  through the EXISTING governed path (autonomy → approval/budget → domain RPC → readback →
  receipt/Rail). The gateway never bypasses Spine/approval/budget/provider/canonical-write/readback/
  receipt/Rail, never exposes secrets/raw credentials/internal policy/hidden reasoning, never offers a
  tool outside the active actor's authority.
- **Relationships:** Spine = the declared contract (source of truth); resolver = what's true now;
  gateway = the admissibility + offer/route boundary for Chat; Rail/receipts = evidence of what ran;
  Mind = may read scoped proven evidence, never grants authority; domain adapters = the executors the
  gateway routes to. The gateway is the consumer END of the Spine, built FROM it.

## 4. `capability_status` as real self-knowledge (the first gateway consumer)

`capability_status` is re-grounded to derive its answer from the SAME gateway admissibility the system
uses to decide execution — never a persona narrative. It leads with the tenant's verified coverage,
then names gaps, required connections/approvals/upgrades, limitations, and next steps. It answers
"what can you do for me here?", "can you create a contact?", "what do you need before you can do
that?", "can you replace this external tool?", "why can't you do this yet?". `contact_event_status`
likewise becomes a gateway-registered read ("what did you just do?" for a new contact).

## 5. The migration-ratchet rule

New action tools MUST enter Chat through the gateway, not inline. Enforcement: `chat-tool-registry-lint`
stays (inline baseline may only descend). The gateway-emitted tools carry no inline `name:` literal so
they are invisible to that lint by construction — and a NEW guard asserts that a gateway-registered
capability's `chatTool` is NOT ALSO declared inline (no double-wiring) and that the gateway is the only
non-baseline path. My 2 tools leave the inline array → baseline returns to 8.

## 6. Affected-flow + collision assessment

- **Files this touches:** `_shared/paige-capability-gateway/*` (NEW); `_shared/paige-capability-status/*`
  (extend the resolver's status set); `paige-ai-chat/index.ts` (remove the 2 inline tool defs +
  dispatches; spread gateway tools; route gateway dispatch); a new/edited domain declaration for
  `capability.status` + `contact.event_status` in `_shared/paige-spine/domains/*`; the ratchet guard;
  tests. Docs: this file + master §4 + tier-matrix + decision-log on delivery.
- **Collision:** fresh `main` bb4828ba; my branch 0-behind. The 8 legacy inline tools
  (`inbox_list`, `integrations_list`, `improvement_*`, `social_*`) are other workstreams' — NOT
  absorbed here (register parked, §7). (UPDATE post-merge: #1147 has since landed and the contact
  migration is now applied on prod, so `contact_event_status`'s read RPC is live; it no longer
  depends on a pending migration.) No active non-composable collision.
- **Protected behavior to preserve (do NOT break):** server-resolved tenant identity; account
  switching; approval gates; transcript reading position / the scroll owner (no timer workaround);
  budget enforcement; receipts/Rail; existing honest-unavailable states; sensitive-data boundaries.

## 7. Legacy inline-tool migration register (PARKED — plan, not authorization)

The 8 pre-existing inline tools, to migrate to the gateway in a later selected phase, ranked by risk
(owner notif 2026-09-12 flagged the security defects — owned by their domains, not this slice):

| Tool | Risk | Note (owner-flagged) |
|---|---|---|
| `social_post` | HIGH (external write) | paige-social accepts service-role + supplied tenant_id; random run UUID (no idempotency). Must fail-closed/not-offered until its domain proves server-derived authority + idempotency + approval. |
| `social_accounts` | MED (read) | reads provider-global profiles (not tenant-scoped). |
| `social_analytics` | MED (read) | trusts a supplied profile. |
| `improvement_decide` | MED (mutate) | performs an UPDATE but was treated as a read; needs mutation classification + approval. |
| `improvement_propose` | MED (mutate) | lacks idempotency. |
| `improvement_list` | LOW (read) | re-front only after caller-scoped read authority verified. |
| `inbox_list` | LOW (read) | registered (comms.messages_read); re-front through adapter after read-authority verify. |
| `integrations_list` | LOW (read) | registered (integrations.list); re-front through adapter. |

Until migrated, these remain the descending baseline; this slice does not certify them compliant.

## 7b. Chat is the orchestration FRONT DOOR (owner addendum 2026-09-12)

Paige Chat is the owner's primary conversational operating console for the Runtime Harness — it must
SURFACE orchestration, not hide it, and never become a second orchestration system / parallel registry.
The gateway's outputs are therefore shaped as governed, evidence-backed STATE the chat can render:
capability summaries, proposed plans/actions, approval prerequisites, active job/delegation status
(from REAL durable-job state), blocked/denied/unavailable explanations, budget/connection prerequisites,
completion summaries, receipt/Rail references, and **deep-link targets** into the exact detailed surface
(Clients, Campaign, Social, Vibe Studio, Calendar, Integration, Analytics, Settings, Command Center —
routed per the §65 route taxonomy). Chat coordinates across surfaces and takes the owner to the right
place; it does NOT replace Command Center (strategic overview), domain pages (detailed work), Rail
(durable evidence), or Systems Check (health).

**§00 boundary (hard):** I wire the governed STATE + the deep-link TARGET (a route string, a receipt
ref, a real job id/status) to real backend truth or an honest absence — that is backend correctness,
mine. The VISUAL rendering of any card (capability card, approval card, job-status card) is Claude
Design's pack; I never invent or restyle it, and a genuinely new visible card routes through the pack +
the paige-ui-design skill, not this slice. **Never** render fake progress, fake controls, decorative
orchestration visuals with no backing state, raw prompts, chain-of-thought, secrets, or fabricated
"agent thinking" (§13/§32/§947). For THIS slice the gateway returns structured governed data as tool
results (availability · reason · prerequisite · deep-link target · receipt/Rail ref); existing chat
render paths + Paige's narration present it. Dedicated new visual card types are CD's, sequenced
separately.

## 8. Honest scope + proof owed

- IN: the gateway primitive; `capability_status` + `contact_event_status` routed through it; the
  enriched resolver status set; the ratchet guard; the honest contact outcome (preserved); tests.
- NOT in: migrating the 8 legacy tools; fixing the social/improvement domain defects; Telegram/n8n/
  Zapier/external sends for contact.created; any new provider/credential.
- PROOF OWED (§32.c/§70): the authenticated Solo-owner drive. See §9 correction 5 for the honest,
  specific blocker (this is NOT "owed to the owner's live review"). (UPDATE post-merge: the contact
  pieces' prod migration apply is no longer owed — #1147 landed and the queue drained, so those
  migrations are applied on prod.)

## 9. Foundation corrections folded (owner, 2026-09-12) + Increment 1 delivered

The owner issued five foundation corrections after the Phase-1 record above. They are folded here so
this doc stays the single contract, and Increment 1 (this PR) delivers against them.

**Correction 1 — four SEPARATE concerns, never one number; 10→8 is interim, not "green".** The
chat-tool-registry red is a migration *register*, not a failure to paper over. Reported as four
distinct facts, each with its own truth:
- **(a) Inline-baseline register** — `chat-tool-registry-lint` reports **8 added** inline tools
  (`improvement_decide/list/propose`, `inbox_list`, `integrations_list`,
  `social_accounts/analytics/post`). This PR took it from **10 → 8** by moving `capability_status` +
  `contact_event_status` onto the gateway; the remaining 8 are the parked register (§7), and the lint
  staying red at 8 is the owner-sanctioned interim, not a thing to force green by baselining them.
- **(b) Action-risk classification** — RECONCILED on merge: `action-risk-lint` was red on
  `improvement_propose` + `social_post` when this branch opened; `main`'s #1152 has since classified
  `improvement_propose=ordinary` / `social_post=high` / `improvement_decide=high` to close an
  approval BYPASS (classification that *enforces* approval, not auto-execution), and after merging
  `origin/main` this lint is GREEN on the branch (122 classified, 0 unclassified writes). This PR
  itself classified nothing — Correction 2 compliance was "CC does not unbrick by classifying," which
  holds; #1152 is a separate owner-directed track that landed the classification for a different
  (bypass-closing) reason. A DISTINCT concern from (a).
- **(c) Capability truth** — the resolver + gateway decide what is honestly exposed. Delivered: the
  gateway core (`decideGatewayEntry`) maps each resolved status to exactly one disposition.
- **(d) Runtime availability** — RECONCILED on merge: #1147 has LANDED and the prod migration queue
  drained, so the contact.created substrate (migrations `20270118`/`20270119`) is now **applied on
  prod** — `contact_event_status` returns real delivery data, its honest "not available yet" degrade
  no longer the state. The shared seam's new status gate refuses a non-live capability at execution.
- **Ratchet:** the existing `chat-tool-registry-lint` already forbids GROWTH (any new inline tool is
  an `added` failure) and only DESCENDS. This PR relies on it; it did not need a new guard.

**Correction 2 — do NOT "unbrick" Social/improvement by classifying.** THIS PR classified nothing:
CC's compliance with the owner correction is that it never made `social_post`/`improvement_propose`
auto-executable via a risk classification shortcut. (RECONCILED with merged reality — Codex P2, and
consistent with the §9(b) note above: `main`'s #1152, a separate owner-directed track, has SINCE
classified `social_post=high` / `improvement_propose=ordinary` / `improvement_decide=high` to close an
approval BYPASS. A `high`/`ordinary` classification ENFORCES an approval gate — it does not
auto-execute — so it serves this correction's intent rather than violating it; "remain unclassified"
is no longer accurate.) These tools are NOT routed through the gateway in this increment (they stay in
the register); when they do migrate, the gateway's status-withholding (an unconnected social
capability resolves `needs_setup` → withheld; an unbuilt one resolves `planned` → withheld) PLUS the
approval gate are what keep them from running unapproved.

**Correction 3 — the finish line: ONE shared execution-decision contract, re-resolving at execution.**
`decideGovernedExecution` already IS that contract ("one pathway, whichever door knocked" — doors
chat|automation|agent|skill|mcp|other, CI-asserted door-blind, consumed by MCP). This PR EXTENDS it
(does not fork) with the **capability-status dimension** — the last inheritance gap. A new
`capability.availability` (resolved by the SAME capability-status resolver the gateway uses) is
gated at step 5.5: `needs_setup`/`planned`/`not_for_tier`/`unavailable` refuse through EVERY door,
byte-identically, so a capability hidden from Chat cannot be reached via MCP, a durable job, or a
delegated subagent. "No permission inheritance from delegation" is thus extended from the ACT to the
act's AVAILABILITY, and proven by a door-blind property test over the new codes.
- **Honest adoption boundary (§13):** the field is OPTIONAL and does not fail closed on absence —
  the dimension is adopted incrementally. MCP declares `"unknown"` (a no-op; its 51 reads unchanged,
  68 mutations still refuse structurally). Wiring the real status resolution into the **MCP door,
  durable/background jobs, and bounded-subagent execution** is NAMED, sequenced follow-up — NOT
  claimed done here. What IS done: the shared seam now carries the dimension, so those doors adopt a
  gate that already exists rather than inventing one.

**Correction 4 — the gateway decides PER-ENTRY.** `decideGatewayEntry` returns one of: `tool`
(executable) · `approval_card` (needs_approval — exposed, routed through approval) · `setup_explanation`
(needs_setup) · `planned_explanation` (planned) · `tier_explanation` (not_for_tier) · `unavailable` ·
`none` (no chat verb). Only `live`/`needs_approval` emit a callable tool. A registered capability with
no real executable path (status not live) is never emitted as a working tool. `contact_event_status`
is returned as an honest read whose `available:false` degrade lives INSIDE the read (never a broken
invocation). (That degrade path is now dormant on prod — #1147 has landed and the substrate is
applied — but it remains the correct honest fallback for any workspace where the read cannot resolve.)

**Correction 5 — authenticated proof is the TEAM's responsibility; name the SPECIFIC blocker.** This
increment is a BACKEND governance foundation — pure decision functions (`decideGovernedExecution`
gate, `decideGatewayEntry`) + a tool-def relocation — so its proof class is unit/property tests +
the CI lints, ALL of which are run and green (see §10). The one thing that genuinely owes an
authenticated drive is the end-to-end Chat experience, and the SPECIFIC blocker is recorded honestly:
this is a headless remote CI session with **no browser-driving tool** (no Chrome MCP / Playwright
session bound here) and, per CLAUDE.md §32, **live prod is not reachable headless from this sandbox
even via the proxy**. So the authenticated Solo-owner drive is owed to the **next capable session**
(a Cowork/Chrome session, or `scripts/live-drive` with a scoped test tenant and
`LIVE_DRIVE_EMAIL`/`_PASSWORD`), NOT to "the owner's eyes." It is named here as a delivery blocker,
not labelled LIVE.

### 10. Increment 1 — what shipped, proven how (§13 evidence classes)

- **Shared seam** `governedExecution.ts`: `availability?` on `GovernedCapability`; step-5.5 status
  gate; 4 new refusal codes. **Proof:** `src/__tests__/spine-governed-execution.test.ts` (new
  availability-gate property block — each code, byte-identical across all 6 doors; live/needs_approval/
  unknown/absent proceed; exhaustive sweep still green) + `governed-execution-lint` GREEN (door-blind,
  approval allowlist intact, no claim of its own) + focused `tsc` of the pure edge files GREEN.
- **Gateway** `paige-capability-gateway/gateway.ts` (new): `decideGatewayEntry` + `buildGatewayToolDefs`.
  **Proof:** `src/__tests__/paige-capability-gateway.test.ts` (every availability → one disposition;
  only live/needs_approval emit; no-chat-verb → none; emits exactly the 2 tools).
- **Handler** `paige-ai-chat/index.ts`: 2 inline defs removed, gateway spread in. **Proof:**
  `chat-tool-registry-lint` 10 → 8; updated wiring tests assert the handler no longer declares them
  inline and spreads them from the gateway; dispatch + describeStep unchanged (§58 byte-identical).
- **MCP** `governed-adapter.ts`: declares `availability:"unknown"`. **Proof:** `mcp-governed-door-lint`
  GREEN (119 tools, one door) + `mcp-governed-door.test.ts` green (behaviour unchanged).
- **Evidence classes (honest):** automated unit/property tests ✅ · static CI lints ✅ **EXCEPT two
  expected reds that are NOT green and must not be reported as such (Codex P2):** `chat-tool-registry`
  **exits 1** at the owner-sanctioned interim of 8 (the `ci → verify` step at `.github/workflows/ci.yml`
  line 298), and the pre-existing `lint:views` — both documented above and non-required · focused edge
  `tsc` ✅ (CI `deno check` ratchet GREEN too) · authenticated runtime on the real platform — **OWED**
  (Correction 5 blocker) · prod migration apply for the contact substrate — **applied on prod**
  (#1147 landed, queue drained; no longer blocked).
- **§39 peer-gate folded (post-push):** 3 findings, all folded — (1) code comments aligned to the
  decision-log's honest "interim red at 8" framing; (2) the 4 status refusal codes added to the MCP
  adapter's truer-than-door set (forward-correct, inert today); (3) a fail-closed `default` on the
  step-5.5 switch so a future availability member cannot fall through + a test. No confirmed runtime
  defect; relocation byte-faithful; door-blindness + approval allowlist + §37 inventory clean.
- **NOT claimed:** MCP/job/subagent status re-resolution (named follow-up); per-tier availability-aware
  WITHHOLDING of the 2 reads (the core supports it; emission is behaviour-preserving this increment);
  the 8 legacy tools' migration; social/improvement executability.
