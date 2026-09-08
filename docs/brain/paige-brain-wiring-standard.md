# Wiring every capability back to Paige's brain — the standing standard

**Owner directive (2026-08-19).** *"For each one of these functions, we always wire back to the
second brain… We need to make sure that we always wire everything back to Paige Agent AI's primary
brain. That way, she can always call on any one of the departments or any particular URL that our
platform has on a per-tier basis. For the God-level tier, she should be able to call on every aspect
of the platform that's feeding the brain… If someone asks her inside of the chat, either the one
that pops out or the one that's mounted in the Paige chat menu, she should be connected directly to
the central brain of the entire platform."* · *"That way, as we grow, Paige becomes more aware of the
entire platform."*

**The failure this prevents:** we ship a surface, a human can see it, and **Paige cannot**. She is
then an assistant sitting inside a platform she is blind to — the opposite of §7 (she IS the
intelligent portal), §10 (nothing is Paige-ungovernable) and §35 (OS north star). Every surface we
add without this wiring widens the blindness.

---

## 1. Second Brain and Runtime Harness are distinct. Do not conflate them.

The owner-approved canonical decision is in
[`docs/PAIGE-MASTER-PROJECT-REFERENCE.md`, Section 3](../PAIGE-MASTER-PROJECT-REFERENCE.md#paige-runtime-harness--owner-approved-internal-operating-architecture-2026-09-08).
It supersedes this file's older “two brains” shorthand.

| | **Second Brain** | **Runtime Harness** |
|---|---|---|
| What it is | Paige's governed, scoped knowledge layer: approved business facts, plans, policies, evidence, skills, and eligible lessons | Paige's internal operating layer: context assembly, model routing, skill/tool selection, Spine authority, durable work, verification, cost controls, receipts/Rail, evaluation, and controlled improvement |
| Durable record | `docs/brain/` is the architecture/governance/index home; it is not automatically injected into runtime context | Runtime components and canonical stores, reached only through tenant-safe server contracts |
| Runtime rule | Knowledge enters a task only through an authorized, scoped projection | The Harness may use Brain knowledge but does not replace it or become a second knowledge store |
| Failure if incomplete | Builders or Paige lack eligible, governed knowledge | Paige cannot safely see, act, verify, recover, or report |

The other boundaries remain load-bearing: **Paige Spine** is the governed action and authority seam;
**Rail and receipts** are durable evidence of action, readback, outcome, and attribution; **Mind** is
bounded working reasoning/evidence, not automatic durable memory; and **Memory** is durable,
governed, owner-confirmed knowledge only. See `paige-spine-and-rail-state.md`,
`paige-memory-contract.md`, and `paige-skills-inventory.md` rather than copying their contracts here.

### One runtime, many capability domains (owner correction 2026-09-08)

`One Paige → one shared governed runtime → coordinated work across many platform domains.`

“Department,” “VP,” “specialist,” and “sub-agent” identify capability ownership, routing, or a
bounded worker role. They do **not** create another Paige, Brain, Harness, memory, authority system,
job fabric, evaluator, cost controller, or disconnected tool surface. Command Center and strategy;
Clients and relationships; Campaigns/content/social/growth; Sales and Pipeline; Calendar/tasks;
Analytics; Vibe Studio; Vault/Connections/Secure Browser; Settings and workspace configuration; and
future Platform Operator operations all register into the same Harness contract in the Master.

A cross-domain task remains one Paige-led flow. Every domain hand-off carries bounded references,
authority-relevant provenance/scope references, and receipts through the shared job/Spine path; it
does not copy raw context into an “agent memory” or carry an inherited authority grant. Each
execution step independently re-resolves tenant, actor, workspace, role, tool scope, provider state,
approval, budget, and verification. Full-platform coordination therefore never means blanket
automatic authority.

**Every shipped capability updates the relevant Second Brain record and completes its eligible
Runtime Harness path.** One without the other is half-done.

#### Tenant Client Portal is a client-scoped projection, not another intelligence system

`Tenant business → shared governed Paige Runtime Harness → client-scoped portal experience`

The Tenant Client Portal is MVP scope and currently `PARTIAL`. For every client-facing operation,
the shared Harness independently resolves external client identity, sponsoring tenant, the explicit
client-to-tenant relationship, workspace/record scope, client role and consent, the tenant's allowed
shared information and authority policy, provider/file/document state, and the applicable
verification, receipt, and Rail contract. The client sees only a deliberate projection of canonical
shared work. The tenant's full Brain, private Mind/Memory, Vault, connections, internal conversations,
other clients, private strategy, financial controls, and autonomous authority stay excluded.

A future Paige Enterprise Success Portal for Paige's own enterprise customers is a separate later
product opportunity. It is not the Tenant Client Portal, not this MVP commitment, and not authority
to create a second Brain, Harness, memory, or operating path.

#### Self-Knowledge & Migration Advisor consumes the existing truth system

The canonical contract is the Master Runtime Harness subsection **“Paige Self-Knowledge & Migration
Advisor.”** Its current end-to-end status is `UNAVAILABLE`; existing self-description pieces are
`PARTIAL` and distributed. A future callable advisor derives a tenant-safe manifest from current
route/tier truth, Spine/tool registrations, eligible skills, provider-result state, the Integration
Capability Registry's limitations, Surface Binding Ledger state, model/cost evidence, and approved
release identity. It does not copy those sources into a new registry or treat historical prose as
live runtime truth.

The wiring checklist for this capability is additive to the standing six-part checklist:

1. preserve delivery, tenant connection, eligibility, authority, proof, and release identity as
   separate fields with source revision, observed-at, freshness, and conflict state;
2. resolve authenticated/effective actor, tenant, workspace, tier, role, act-as state, and object
   scope before advice, and again before every separately authorized action;
3. lead with Paige's verified tenant replacement coverage and gaps; keep competitor claims dated,
   cited, edition/region-scoped, and unable to override internal truth;
4. normalize replacement direction and ask the smallest clarification when ambiguous;
5. default every migration object class to read-only planning; a plan creates no tool authority;
6. return a redacted receipt of reads, draft, verification, deliberate non-actions, approvals, gaps,
   and rollback boundary; and
7. admit no raw tenant data, secrets, transcripts, workflow/browser payloads, hidden prompts, or
   cross-tenant knowledge into generalized comparison or learning material.

Do not add the advisor to `paige-spine-and-rail-state.md` as a registered capability until a callable
Spine path actually lands. Inventory approval is not registration or runtime eligibility.

---

## 2. What Paige's distributed Runtime Harness components were on 2026-08-19

Grounded in code, not aspiration. **It is more built than a quick grep suggests** — a first pass
here looked only at `paige-mcp` + `paige-ai-chat` for one keyword and wrongly concluded the runtime
was thin. It was not. The inventory below is historical grounding for **four real layers**, not a
claim that the complete centralized Harness was live then or is live now:

**Layer A — CONTEXT (what she already knows when the session opens).**
`supabase/functions/_shared/owner-context.ts` (§52) composes the operator briefing that leads every
God-tier session. Verified: it runs **real queries** with **honest degradation** —
- tenant counts by `revenue_class` (from `tenant_revenue_classification`), falling back to
  *"count not available right now (classification read failed)"* rather than a number;
- **real ARR** — only live Stripe-backed active subs count, so a comped `active` row is not revenue;
- owner memory from `paige_owner_memory` (config-as-data — the founder's identity is never
  hardcoded in edge code);
- the doctrine §-index and the 4 platform pillars as compiled constants.
This is the right home for *"what is the state of the platform?"* facts. It is also the pattern to
copy: **a real read plus a stated absence, never a fabricated figure.**

**Layer B — MEMORY.** `paige_owner_memory` (L8 fabric), `paige_prompt_memory` + `match_prompt_memory`
(voyage-3), `_shared/session-memory.ts`, `paige_llm_trace`. What she retains and retrieves.

**Layer C — PER-CONTACT CONTEXT.** `paige-context-router` (Customer-Scoped Paige) with
`load_contact_context` / `load_self_context`, plus `paige_context_rail`. **Client-scoped, not the
platform brain** — do not mistake it for the operator brain.

**Layer D — TOOLS (what she can DO), already tier-gated.**
`supabase/functions/paige-mcp/index.ts` is the real registry and already implements exactly the
per-tier model the directive describes:
   - `TOOL_SCOPE[name]` — the capability scope a tool requires.
   - `MASTER_ONLY_TOOLS` — the **god set**; the single source of operator-only tools.
   - `AGENCY_TOOLS` — the caller's OWN sub-accounts only.
   - `toolTier(name)` → `god | agency | tenant | client`. Anything `self.*` is `client`; everything
     else defaults to `tenant`.
   - Lesson already encoded there (do not re-learn it): a `platform.*` scope **alone did not stop a
     tenant caller** who held `platform.write` — the **tier gate** is what denies. If a tool has no
     in-handler guard, it must be god-locked in `MASTER_ONLY_TOOLS` rather than trusting its scope.
2. **The skills engine** — `paige_skills.allowed_tools` composes those tools into procedures.
3. **`_shared/owner-context.ts` (§52)** — the operator briefing composed into the system prompt so
   she opens a session already knowing who she reports to and the live platform state.
4. **Memory / trace** — the voyage-3 memory fabric and `paige_llm_trace`.

**The chat doors are already unified.** The ✦ slide-out and the Paige branch share ONE controlled
thread (`one thread, two doors`), so anything registered here is reachable from **both** doors by
construction — no second wiring path.

---

## 3. The mandatory checklist — every capability, every tier, every modality

When any surface, function, department or URL ships, it is not done until all six are true:

- [ ] **1. Second-brain entry.** The relevant `docs/brain/` doc updated in the SAME commit
      (§BRAIN.3): `codebase-map.md` for new surface area, `config-registry.md` for integration
      wiring (NAMES/IDs only, never secret values), `decision-log.md` for the ruling,
      `lessons-learned.md` for a new class of mistake.
- [ ] **2. A callable seam (§10).** The logic lives in an RPC / edge function / config-as-data — not
      only inside a React handler. If a human clicking is the only way to drive it, it is a dead end.
- [ ] **3a. CONTEXT (Layer A) — does she need to KNOW it unprompted?** If it is part of "the state of
      the platform / this business", add a line to the tier's context composer (`owner-context.ts`
      for the operator) as a **real query with an honest "not available" fallback**. This is what
      makes her *already briefed* (§52) instead of merely answerable.
- [ ] **3b. TOOL (Layer D) — does she need to QUERY or ACT on it?** Register in `paige-mcp` with the
      correct `TOOL_SCOPE` **and** the correct tier (`MASTER_ONLY_TOOLS` / `AGENCY_TOOLS` /
      default). **If the handler has no in-handler guard, god-lock it** — see the lesson in §2.
      Most capabilities need BOTH 3a and 3b; a metric may need only 3a, a mutation only 3b.
- [ ] **4. Tier availability declared** via `getTierFeatureSet()` / `hasFeature()` (§60), never an
      inline `account_type ===` compare. `lint:tier-features` enforces this.
- [ ] **5. Honest when it cannot answer (§13).** A tool that has no substrate returns a stated gap —
      never a fabricated number and never silence.

- [ ] **6. Modality-neutral acceptance.** Every text, Live Conversation, future phone/SIP, Secure
      Browser, handoff, and card surface reuses the one workspace and Spine path: server-resolved
      scope → shared authority decision → canonical tool/RPC → verified readback → detailed receipt
      + Rail evidence → truthful modality presentation. No surface may fork authority, mutation,
      memory, or upgrade a capability's evidence state. A department/domain registration follows
      the same rule: its skill, adapter, record, or tool joins the shared Harness and may not create
      separate operating logic or memory. See
      `../doctrine/paige-modality-neutrality.md`.

**The test, every time:** *"If the operator asks through any Paige modality, can Paige actually
answer or act through the same governed contract — and does a tenant asking the same question get
only what their tier permits?"*

---

## 4. Tier reach (what "per-tier basis" means concretely)

- **God / Super Admin** — reaches **every** aspect of the platform that feeds the brain. This is the
  dogfooding tier (§35): if Paige cannot see it here, it is not wired.
- **Agency** — its own book **plus** its sub-accounts (`AGENCY_TOOLS`), never a sibling agency.
- **Solo / Sub-account** — its own book only.
- **Client** — `self.*` only.
- **Anonymous** — public surfaces only.

Tier reach is decided by the **server**, never by the design or the prompt (§9/§51/§53).

---

## 5. Register — the running ledger

The point of this file: every capability lands here so the coverage gap is visible rather than
assumed. **Status is verified, not aspirational.**

Columns map to the layers in §2: **Context** = does she KNOW it at session open (Layer A);
**Tool** = can she QUERY/ACT on it (Layer D).

| Capability | Callable seam | Context (A) | Tool (D) | Second brain | Notes |
|---|---|---|---|---|---|
| **Systems Check** (operator) | ✅ `systems-check-run-operator`; `enqueue_fleet_systems_check()` | ✅ `owner-context.ts` — "Platform health" line | ✅ `get_systems_check_status` (god-locked) | ✅ `cd-pack-port-playbook.md` | **First capability taken through the full standard** (was the first tracked gap; closed in the same PR). Both surfaces report **skips as their own axis** — a blocking check that never ran is reported UNASSESSED, never folded into a healthy ratio. |
| Tenant counts by revenue class | ✅ `tenant_revenue_classification` | ✅ `owner-context.ts` | — | ✅ | Real read + honest fallback |
| Real ARR | ✅ `platform_subscriptions` | ✅ `owner-context.ts` | — | ✅ | Stripe-backed only; comped ≠ revenue |
| Owner identity / preferences | ✅ `paige_owner_memory` | ✅ `owner-context.ts` | — | ✅ | Config-as-data (§10/§45) |
| Sub-accounts | ✅ RPCs | ✅ `AGENCY_TOOLS` | ✅ `roles-permissions.md` | Agency tier |
| Skills | ✅ `paige_skills` + interpreter | ✅ `list_skills` / `run_skill` | ✅ `paige-skills-inventory.md` | |
| Marketplace | ✅ RPCs | ✅ `marketplace_*` | ✅ | |
| **Platform alerting** (operator) | ⏳ partial — tables `paige_alert_rule` / `_firing` / `_signal` (A1) **+ the evaluator** `alerting-evaluate`, cron `*/5` (A2, 2026-08-20). Still NO rule-authoring RPC and NO delivery (A3) | ❌ **owed — A-Weave-6** | ❌ **owed — A-Weave-2** (`paige-mcp` rule CRUD) | ✅ `config-registry.md` + `decision-log.md` | **Deliberately incomplete, and the incompleteness is the point.** A1 ships the substrate, A2 the sweep that evaluates it; the owner ruled 2026-08-20 that it must NOT stay isolated, so the ❌ above are FILED slices (#205–#210), not unknowns. **Paige still cannot author a rule, cannot recall a firing, and nothing is delivered anywhere** — do not claim otherwise. |
| **Pipeline deal-stage evidence** (Mind) | ✅ `public.get_pipeline_spine_evidence` (safe lens; direct Rail access stays revoked) | ✅ Chat renders the Pipeline domain's Mind projection when a client is in context — citation, freshness, read-only boundary | — read-only; **no Chat tool and no write path, by design** | ✅ `../delivery/paige-spine-mind-handoff.md` | **Mind binding `PARTIAL`** (was `UNAVAILABLE`), 2026-09-02. Scope comes from a Pipeline deal via `paige:open`; the server re-resolves tenant, authorization and client scope. `LIVE` awaits the authenticated drive — do not claim it before. **Entry path repaired 2026-09-02 (#765, PR #773).** Focusing a client was undone immediately by the saved-thread auto-resume on any account holding history — i.e. every real account — so the binding was reachable in code and not completable by a person. Repaired in the shared Chat component, so BOTH client-focusing surfaces (`PaigeWorkspace`, `SoloPaigeWorkspace`) are covered. Three connected defects were repaired with it: a refusal explanation destroyed by the same resume, a saved conversation opening the wrong thread, and a stale cross-account focus. Still `PARTIAL` — the repair is mutation-proven in code, and the authenticated two-Solo-tenant drive remains OWED. That drive is the check that would have caught this. |
| Analytics · Marketing · Calls/transcripts · Web pages | — | ❌ | — | Named by the owner as future reach; **not yet wired — do not claim otherwise.** |

---

## 6. Systems Check — SHIPPED through the standard (the worked example)

Owner expanded the sub-tab-1 exit gate mid-fire: *"Systems Check state feeds into owner-context.ts
briefing composer AND is registered as a paige-mcp tool (operator tier-scoped)… you should be able to
open the ✦ slide-out from Systems Check tab, ask 'is the platform healthy?', and Paige answers with
real state."* Both halves shipped in the same PR:

- **Context (Layer A)** — `owner-context.ts` gained a "Platform health" line: last sweep, pass of
  total, failing check ids, and the skipped count — plus a separate `UNASSESSED` line naming any
  **blocking** check that could not run, with the explicit instruction to treat it as unknown rather
  than healthy. Honest fallback on read failure, matching the tenant-count and ARR lines beside it.
- **Tool (Layer D)** — `get_systems_check_status` in `paige-mcp`: `TOOL_SCOPE = platform.read` **and**
  god-locked in `MASTER_ONLY_TOOLS`, because the handler reads operator-global rows with the
  service-role client and has no in-handler tenant guard — the tier gate is what denies a tenant
  caller (the lesson already encoded in that file, applied rather than re-learned). It returns
  `could_not_run` and `unassessed_blocking` as **separate axes** from `passing`/`failing`, so no
  consumer can mistake "not failing" for "passing".

**Still open (specified, not built):** `run_systems_check` as a tool (fire the sweep from chat —
must return "started", never "swept", on the fleet half), and the tenant-scope equivalents of both,
RLS-scoped to `current_user_tenant_id()`. §37 producer inventory required before either ships.

---

## 7. Cross-references

§7 (Paige IS the portal) · §10 (Paige-governable, callable seam) · §13 (honest gaps) · §35 (OS north
star — every seam is OS surface area) · §51/§53 (tier + operator role gating) · §52 (already-briefed
operator context) · §60 (declared tier availability) · §BRAIN.1–.3 (second-brain discipline) ·
`cd-pack-port-playbook.md` (how a tier surface gets ported in the first place) ·
`../doctrine/paige-modality-neutrality.md` (one workspace and execution path across modalities).

## Solo Team context — narrow contract (SHIPPED via PR #728, 2026-09-02; ~~Gate 2 pending~~)

`get_paige_team_context()` is the Team-owned hydration seam for the authenticated speaker's active tenant. It carries confirmed active roster identity, existing enforced role, informational job title/responsibilities, and—only for an existing Team owner/admin—the Team invitation lifecycle without a token. A missing stored name retains the verified account email so PAIGE can identify the real teammate without inventing a name.

PAIGE may use this reference context to identify the right teammate and prepare the governed Team action.

**CORRECTED 2026-09-02.** ~~*She may not send an invitation, change a role, grant access, or take an external action from context alone.*~~ She **can** now send invitations and change access — but the load-bearing half of that sentence survives intact and is why the correction is safe: **not from context alone.** Every act runs through the governed Team tools on the same server seam the Team screen uses, and the six access-changing ones are `high`, requiring the real owner approval card whose fingerprint travels in the request body. Tenant-authored titles and responsibilities remain untrusted reference data that confer no authority. The existing Team authorization checks remain the owning write path; PAIGE is one more caller of them, never a way around them.

There is no cross-domain Hidden/View/Manage profile in this contract. Clients, Campaigns, Analytics, Connections, Integrations, Billing, Mind, Trust Compass, Systems Check, Rail, and the canonical Solo shell are unchanged.
