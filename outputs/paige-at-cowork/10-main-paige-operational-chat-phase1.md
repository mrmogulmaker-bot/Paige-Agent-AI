# 10 — Main Paige Operational Chat · Phase 1 (re-ground + stabilize)

> **Program:** PAIGE-at-Cowork-Level → Main Paige Operational Chat.
> **Flow-by-Flow route:** Existing-Project + New-Feature · **Depth: Deep → Full Project Audit** · this is the
> pre-edit packet (affected flows, ownership/collision result, regression map, proof plan, gates) returned
> **before** the first product-code edit, per CLAUDE.md §69.
> **Base commit:** `main` @ `299c39b2`.
> **Owner mandate:** 2026-09-12 — "You are now the dedicated owner of Paige's primary operational chat experience."
> **Status of this document:** Phase-1 deliverable. No product code has been written. Every current-state claim
> below is grounded in code at `299c39b2` (cited) or labelled inference.

---

## A. Owner Intent & Experience Contract

**The outcome being built (owner's words):** *one Paige conversation where an owner can direct the business, ask
questions, create work, coordinate operations, approve consequential actions, inspect results, and understand what
Paige can truly do right now* — at the practical operating standard of a best-in-class work assistant (the
ChatGPT-Work / Claude-Cowork bar), **not** a coding agent (that is a separate, later capability) and **not** a
passive or read-only chat box.

**What the owner must be able to DO (acceptance surface):** speak naturally ("what needs my attention today?",
"check which integrations are connected", "create a contact", "what can you actually do in this workspace?");
have Paige understand the active business without pretending unverified facts; create real work (plans, drafts,
tasks, reminders, briefs, approved records, approval requests); see understandable progress (checking / missing /
ready / needs-approval / done / failed / unavailable); get a concise outcome + an owner-visible receipt/Rail record
when a consequential action occurs.

**What must NOT happen:** Paige must never claim a capability she cannot prove for the active tenant; never report
an act that did not happen (§13/§947); never expose hidden reasoning, raw secrets, raw provider payloads, internal
prompts, or another tenant's data; never let browser state / route params / stale localStorage / a fixture account /
a chat assertion create authority.

**What must be preserved (protected shared seams):** the anchored transcript scroll / reading-position contract;
server-derived authority re-resolution (actor, tenant, workspace, role, entitlement, tool-scope, provider status,
budget, approval requirement, verification requirement); the propose→confirm approval model; tenant isolation (§9);
the budget ceiling (§67 cost); the Social workstream's ownership of Social Studio/providers; the signup/paywall
workstream's ownership of enrollment/entitlement.

**Truth boundary (every capability carries exactly one label):** `LIVE` (available now + verified) · `PARTIAL` ·
`NEEDS-APPROVAL` · `NEEDS-SETUP/CONNECTION` · `PLANNED` (not available yet) · `NOT-FOR-TIER` · `UNAVAILABLE`
(provider/account evidence missing). Nothing is called `LIVE` without authenticated-runtime proof (§32.c/§70).

**Required evidence classes (reported separately, never conflated):** automated test · static/lint/type/build ·
structural/harness render · **authenticated runtime on the real platform** · `UNVERIFIED`/`UNAVAILABLE` with reason.

---

## B. Flow-by-Flow frame

**Mode:** Existing Project + New Feature. **Depth:** Deep → Full Project Audit (cross-flow, persistence,
integrations, security/tenant-isolation, major UI) → crew + independent review mandatory; no product-code edit
until this packet is recorded (done, here).

**Affected actor-goal flows (this program):**

| ID | Actor → goal | Surface | Phase |
|----|--------------|---------|-------|
| MPC-1 | Owner asks "what can you do in this workspace?" → truthful tenant-scoped capability status | Main Paige chat | P2 |
| MPC-2 | Owner asks "which integrations are connected?" → a real authorized read, fresh result | Main Paige chat | P2 |
| MPC-3 | Owner asks to create a contact → approval → governed write → readback → truthful outcome → receipt/Rail | Main Paige chat | P2 |
| MPC-4 | A confirmed **new** contact fires a reusable `contact.created` event an approved subscriber can consume, with a delivery receipt | backend event contract | P3 |
| MPC-5 | Conversations inbox triage/labels + Main chat operate on one shared authority/approval/Rail seam | Conversations + Main chat | P3 |
| MPC-6 | Owner expands domain-by-domain (Clients→Pipeline→Calendar/Tasks→Campaigns→Social→Analytics→Integrations) each earning its label | Main Paige chat | P4 |

**Regression impact map (what my changes must not break):** the anchored transcript scroll contract
(`src/components/chat/anchoredTranscriptScroll.ts`, test-guarded — untouched); the retired floating chat guard
(`src/__tests__/no-floating-platform-chat.test.ts`); the propose→confirm live gate (`paige_pending_confirmations`,
high-risk never self-approvable); tenant-isolation tests (`test:knowledge-scope`, `smoke:comms-tenant-scope`,
`lint:conversation-tenant`); the four-state Rail readers (`useRailEvents`, `useSoloActivityFeed`); the Spine
registry load-time invariants; the tsc Deno ratchet (baseline 14) and the TS tsc ratchet.

**Failing-first plan (P2):** each MPC flow gets a failing test first — the capability-status resolver contract,
the contact honest-outcome classifier (created / already-existed / needs-clarification / failed), the
genuine-insert Rail-emission gate (the §947 fix), and the duplicate-prevention (idempotency) guard.

**Gates:** §69 pre-edit packet (this doc) · §1/§14 crew + §5 compliance + §39 peer-gate before done ·
§70.1 user-usability gate + §70.2 owner-intent gate before "feature-complete" · §32.a persisted-deploy +
§32.c authenticated-runtime proof before any "LIVE" claim · §50/§63 greps · no merge/deploy without owner approval.

---

## C. Capability / action / receipt / Rail — GAP MAP (grounded @ `299c39b2`)

### C.1 The chat surface & authority (LIVE — strong foundation)
- **One Solo-owner chat:** `PaigeAIChat` — `src/components/dashboard/PaigeAIChat.tsx`, mounted via
  `src/solo/SoloPaigeWorkspace.tsx:340` inside `TenantCommandCenterShell`; route `/solo/{account}/paige/{subtab}`.
  Floating chat retired + regression-guarded. **LIVE.**
- **Server-derived authority (never request body):** `auth.getUser()` on the JWT-scoped client
  (`paige-ai-chat/index.ts:635`); tenant/persona via `get_paige_persona_context` keyed on `auth.uid()` (`:1682`);
  tier via `getActorTier` fail-closed-to-`client` (`:1368`); `revalidateTenantKnowledgeScope()` re-checks the active
  workspace mid-turn (`:7789`). **LIVE.**
- **Budget enforcement at the chat front door:** every model call via `gatewayCompat(...)` which fails closed on
  budget block (`_shared/claude.ts:556-605`). **LIVE.**
- **Propose→confirm:** live gate `paige_pending_confirmations` + pure `decideToolConfirmation`; high-risk/owner-only
  never self-approvable; approved **stored** args run (not a model re-author) (`index.ts:7985-8445`,
  `_shared/toolConfirmation.ts`). **LIVE.** *Partial:* a second, unwired confirmation home
  (`paige_tool_confirmations`) exists in-tree (§18 two-homes smell, not a correctness gap).

### C.2 Truthful capability awareness (NET-NEW — does not exist)
- **No tenant capability-status resolver exists.** "What can Paige do for THIS tenant right now?" is net-new
  assembly over distributed sources: Spine maturity (`_shared/paige-spine/registry.ts`) × tier
  (`src/lib/tier/tierFeatures.ts:273 getTierFeatureSet()`) × connection
  (`integrations.list`→`public.list_integration_surface`) × autonomy (`resolve_tool_autonomy` /
  `src/solo/data/useSoloToolGovernance.ts`) × evidence presence. No code joins these today
  (binding-ledger `README.md:143-145`). **This is the "first implementation priority."** → **PLANNED → P2.**

### C.3 Contact creation (LIVE write; PARTIAL + a live honesty defect on the outcome)
- **Path:** chat tool `crm_create_contact` (`index.ts:5326`, handler `:9926-10010`) → fuzzy dedup
  `find_duplicate_contacts` first; on match returns `needs_dedup_confirmation` without inserting (`:9966`); else
  `create_contact` RPC (`:9989`). RPC (`supabase/migrations/20261020010000_client_identity_contract.sql:56-91`)
  is `SECURITY DEFINER`, role+member gated, writes only `clients` + `audit_logs`.
- **§947 LIVE DEFECT (the centerpiece to fix):** the RPC returns an **existing** row id on an exact-email match
  **without inserting** (`:72-76`), still returning `success:true`. The chat Rail emitter `emitRailForTool`
  (`index.ts:12278-12305`, invoked `:12513`) writes a per-client `paige_client_events` "owner.crm_mutation" row
  **gated only on `success===true`** — so **an already-existing contact currently produces a "created" Rail
  event**. Honest outcome classification (created / already-existed / needs-clarification / failed) does not exist;
  emission must key on a genuine-insert signal. **PARTIAL + defect.**
- **Outcome asymmetry (§37):** only the chat path conditionally emits a per-client Rail row; the other six
  `create_contact` consumers (`NewContactDialog`, `AddInternalClientDialog`, `ClientManagementDashboard`,
  `GrowthHub`, `growth-process-submission`, the MCP door `paige-mcp/capability-policy.ts:496`) emit **zero**
  owner-visible outcome — only `audit_logs`. **PARTIAL.**
- **No capability receipt:** `crm_create_contact` is **not** in `CRM_WRITE_CAPABILITIES`
  (`_shared/crm-capability-outcome.ts:46-50`), so `record_capability_run` never fires for it. **GAP.**

### C.4 Rail + receipts (writer LIVE; adoption PARTIAL; ~0 prod rows)
- `record_capability_run` + 6 outcomes writing `paige_workspace_events` — writer **LIVE**, service-role only
  (`20261212000000_…:447`; 6th outcome `20261220000000_…`). Reader `get_solo_rail_activity` UNIONs client+workspace
  events, fails closed (`20261212000000_…:514`). **Readers are four-state** (the old "refusal→empty" defect is
  FIXED in `useRailEvents`, `PaigeRailFeed`, `ClientActivityFeed`, `useSoloActivityFeed`; the Zapier panel is still
  2-state — residual).
- **Adoption PARTIAL:** measured prod reality in-migration — **142 `paige_audit_log` rows vs 10
  `paige_workspace_events`, zero `capability_run`**. Idempotency never fires (each caller mints a fresh UUID → a
  retry writes two rows) — **directly relevant to MPC-3's duplicate-prevention requirement.** **PROOF-OWED.**

### C.5 Native event / outbox to EXTEND (substrate LIVE; `contact.created` PLANNED)
- **§67 Process Record** `paige_automation_triggers` (trigger catalogue w/ `is_live`/`dark_reason`) +
  `paige_automations` + `paige_automation_acts` (`20261022000000_…`) — the subscriber seam. Seeded LIVE triggers:
  `manual.run_now`, `pipeline.stage_changed`. **No `contact.created` trigger exists.**
- **Emitter pattern (repo's §18 canonical):** DB-trigger → edge via `net.http_post` + `pg_cron` sweeper backstop
  (growth: `20260715125000_…`). **Per-subscriber fire-once receipts:** `growth_submission_dispatches`
  (`20260714092000_…:116`) — one row per (source, subscriber), `status∈{done,error,skipped}`, UNIQUE fire-once.
- `executor='workflow'` on the Action Bus is **UNIMPLEMENTED** (`advance_action` raises). **Extension point for P3.**

### C.6 Conversations Intelligence (LIVE surfaces; one shared seam; PARTIAL Compass enforcement)
- `useConversations` (`src/solo/useConversations.ts`) + `inbox2.tsx`; labels/triage
  (`20270115000000_conversation_labels.sql`); `paige-inbox-triage` files actions via the **same Action Bus**
  (`file_action`, kinds `client.at_risk`/`owner.followup_email`). Shares tenant context, Action Bus, approval lane,
  Trust Compass, and Rail writers with Main chat — **one experience by construction.**
- **PARTIAL:** triage edge hardcodes `defaultLane="auto"` (doesn't yet read the per-tenant Compass lane);
  classification is keyword/regex, not LLM yet. (Owned jointly w/ the Conversations work; P3/P4 touchpoint.)

---

## D. Collision & ownership assessment

**Ownership (this program):**
- **I OWN (backend, §00):** the capability-status resolver; the contact honest-outcome model + the genuine-insert
  Rail-emission gate; `record_capability_run` adoption for contacts; the reusable `contact.created` event contract;
  the governed-action/receipt/Rail wiring for Main chat flows.
- **I CONSUME via explicit contract, never rebuild:** the Spine registry; `get_paige_persona_context` /
  `current_user_tenant_id()` / `getActorTier`; `gatewayCompat` budget; `paige_pending_confirmations` propose→confirm;
  the four-state Rail readers; the Action Bus / §67 Process Record; `growth_submission_dispatches` receipt shape;
  the anchored transcript scroll contract (**read-only — I do not modify it**).
- **NOT MINE:** Social Studio / social providers / connection-wall (Social workstream); public enrollment /
  entitlement / Solo-only onboarding (signup/paywall workstream); Live Conversation, Intentful Interview, Secure
  Browser (their own boundaries).

**Active shared-file collision result: NONE blocking.**
- **PR #591** (knowledge-isolation; touches `paige-ai-chat/index.ts`) — **draft, not merge-authorized, base
  `e752…` (weeks behind `299c39b2`)**; its revalidation partly already on `main`. Its edits are in the
  knowledge-egress region, **not** the CRM-dispatch region (~L9926-12513) this program touches.
- **PR #729** (rail scope guard; touches `useRailEvents.ts`) — **draft, not merge-authorized, base `76bb…`**; its
  sole stated blocker (#746) is **CLOSED** (PRs #785/#801) and its four-state consumer fix already appears on
  `main`. Likely superseded.
- **Resolution:** I build on current `main`; `paige-ai-chat/index.ts` is edited strictly sequentially within this
  program. If either draft is ever revived it rebases onto my merged work, not the reverse. Recorded, not a stop.

**Blocker reconciliation:** #757 ("CRM Wave 1 — do not start") was gated on Wave 0 / #746. **#746 is closed**; #757
states stage **1b ("ordinary client-subject writes", incl. `crm_create_contact`) "can migrate under the existing
contract once #746 closes."** SCR-1 (workspace outcome projection) shipped as `record_capability_run`. So
contact-create is **unblocked** under the existing contract; SCR-2/SCR-3 (which govern reads & non-client subjects)
remain open but do not gate contact-create. The owner mandate (2026-09-12) authorizes the vertical.

---

## E. Stale current-state records to reconcile (Phase-1 doc edits; §66/§BRAIN.3 same-commit)

1. **Surface Binding Ledger `clients.people`** (`docs/binding-ledger/surface-binding-ledger.json`): currently
   `state: UNAVAILABLE`, reason "#757 do not start", and the loose wording "Chat path emits
   (crm_create_contact/crm_update_contact)". Reconcile to: #746 closed → stage-1b unblocked; the precise truth is
   the chat path emits a **conditional per-client Rail** row (not a capability_run), with the §947 genuine-insert
   defect named; owner mandate authorizes the vertical. (Exact JSON edit staged for the P2 commit that lands the fix,
   so the ledger matches shipped reality, not intent.)
2. **`docs/brain/decision-log.md`** — add the program kickoff + the #1040 closure + this Phase-1 plan (dated).
3. **`docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §4/§5** — record Main Paige Operational Chat as the active
   workstream; note the contact honest-outcome defect as a known limitation until P2 lands.
4. **`docs/doctrine/tier-matrix.md`** — when the contact vertical ships, record per-tier reality (Solo / Sub-account
   / Enterprise carry the client book; Agency does not) in the same commit (§66).
> These are documentation reconciliations, made in the same commits as the work they describe — never ahead of it.

---

## F. First governed vertical + proof plan (P2)

**Chosen first vertical: contact creation with a truthful outcome model** — it is the owner's named foundational
slice, it is now unblocked, and it carries a **live honesty defect** (§947 false "created") that must be fixed
regardless. A safer alternative (a pure read like `integrations.list`) is used as the *read* leg of the same proof,
not as a substitute — because the write leg is where the honesty value is.

**The governed action path (MPC-3), honest by construction:**
```
Owner asks to create a contact
 → server re-resolves actor + tenant/workspace (auth.uid()/current_user_tenant_id(); never body)
 → dedup guard runs → if a likely match: "same person?" clarification that RECORDS NOTHING (classifier → null, never "refused")
 → on confirm-new: governed create_contact runs
 → fresh readback distinguishes INSERTED vs RETURNED-EXISTING (RPC return-contract change → §37 sweep of all 6 RPC-return consumers; the inbound MCP door does a DIRECT insert, not an RPC call, so it is unaffected)
 → outcome classified truthfully: created / already-existed / needs-clarification / failed
 → record_capability_run receipt (RPC-resolved tenant attribution, never personaCtx) with a STABLE idempotency key (fix the dup-row bug)
 → per-client Rail event emitted ONLY on a genuine insert, labelled truthfully (the §947 fix)
 → Paige reports the exact result; the owner sees a matching receipt/Rail outcome
```

**Capability awareness (MPC-1), MVP-scoped:** a tenant capability-status resolver that composes the existing
sources into the truth labels, delivered first for the capabilities this vertical touches (contacts + integrations),
honestly returning `PLANNED`/`UNAVAILABLE`/`NEEDS-SETUP` for the rest — extended domain-by-domain in P4. One home;
no second registry.

**The authenticated proof (§70.1, the 12 steps):** owner opens Main Paige chat in the Solo shell → Paige identifies
the active authorized workspace → owner asks what Paige can do → truthful tenant-scoped status → owner asks to
inspect a connected capability (`integrations.list` real read) → fresh result → owner asks to create a contact →
Paige presents the correct approval boundary → after approval the governed action runs → readback → a matching
receipt/Rail outcome is visible → refresh / thread-change / account-switch / error / retry / abandonment do **not**
lose truthful state or create duplicate work. Evidence reported by class; authenticated-runtime leg is owed and
named if this session cannot drive it headless (§32.c).

---

## G. Explicitly OUT of scope / deferred (guardrails)

- **No `contact.created` → Telegram delivery until P3**, and only after the native event + a secure Vault
  connection path are proven. The Telegram bot token exposed in chat is treated as **COMPROMISED**: never reused,
  logged, displayed, or re-requested in chat. **No two-way inbound Telegram** until identity binding, authz, tenant
  routing, retention, webhook/polling security, budget, and abuse protection are designed and proven.
- **No native Google Docs/Sheets/Slides** (provider-gated, owner-owned).
- **No live social publishing / paid-media / external-connection changes from chat** (Social workstream owns the
  governed action + provider proof).
- **No decorative "thinking" animation, generic persona labels, more specialist personas, or chat-compaction polish**
  ahead of the core operating flow.
- **No merge / deploy / live-provider enablement / customer communication / production-acceptance claim** without
  explicit final owner approval.

---

## H. Canonical governed contact-create contract (create_contact_v2 is TRANSITIONAL, not a second system)

**Owner directive (2026-09-12):** keep `create_contact_v2` transitional only; do not create a permanent
second contact-action system; document the canonical contract, the shim behavior, the migration path, and
the retirement condition.

- **One logic home (canonical seam):** `public.create_contact_v2(...) RETURNS TABLE(contact_id, client_ref,
  was_created)` — `SECURITY DEFINER`, authority enforced IN-BODY (`auth.uid()` / `current_user_tenant_id()`,
  role + active-membership gates, §59), tenant-scoped email dedup, and the inserted-vs-existing signal. This
  is the ONLY place contact-create logic lives. The chat path calls it, classifies the outcome
  (created / already-existed / needs-clarification / failed), emits the per-client Rail ONLY on a genuine
  insert (§947), and records a receipt under a stable idempotency key attributed to the RPC-resolved tenant.
- **The shim is an adapter, not a system:** `public.create_contact(...) RETURNS uuid` is now a one-line
  `SELECT contact_id FROM public.create_contact_v2($1..$15)`. It carries **no logic of its own** (so it
  cannot drift), and exists solely to preserve the `RETURNS uuid` wire shape for the five existing scalar
  RPC-return consumers. There is one contact-create brain; `v2` and the shim are the same brain seen through
  two return shapes.
- **The six consumers (§37):** scalar-shim consumers — `NewContactDialog`, `AddInternalClientDialog`,
  `ClientManagementDashboard`, `GrowthHub`, `growth-process-submission` (all use the returned id only); the
  chat path is migrated to `create_contact_v2` (it needs the signal). The inbound MCP door is **not** a
  consumer — it does a DIRECT insert and never calls this RPC (its own honesty is a separate slice).
- **Migration path:** migrate a scalar consumer to `create_contact_v2` only when it genuinely needs the
  signal (e.g. a dialog that should say "already exists" vs "created"); until then the shim is correct and
  nothing is owed. No consumer is forced to change to satisfy the refactor.
- **Retirement condition for the old path:** the `create_contact` shim is dropped ONLY when a §37 sweep
  proves **zero** remaining `.rpc("create_contact"` callers across all eight caller classes (frontend, edge,
  MCP, tests, cron, webhooks), i.e. every consumer has moved to `create_contact_v2`. Dropping it before that
  is a §58 regression. (A later cosmetic collapse — folding the composite back under the name `create_contact`
  once all callers take the signal — is optional and owner-gated; it is not required for correctness.)
- **Status:** unmerged candidate. LIVE requires the authenticated owner drive (§32.c/§70), the migration's
  persisted-apply (blocked on #1147, the Social workstream's migration-replay fix — recorded as an external
  exact-head verification dependency, NOT this program's to touch), and owner acceptance.
