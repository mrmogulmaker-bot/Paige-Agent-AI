# PAIGE Chat — delivery map

**Mode:** Existing Project · **Depth:** Full Project Audit · **Paradigm:** `web`
**Grounded:** 2026-08-31, branch `codex/paige-knowledge-active-tenant-isolation-v2` @ `31f927dc0`
**Method:** Flow-by-Flow (`references/orchestration.md` + `delivery.md` + `audit.md` + `build.md` + `review.md` + `verification.md`)

Five independent read-only discovery tracks (Solo surface · document seam · Rail/Trust/Action ·
client scope & memory · portal + integration boundary) plus a 100-mutation adversarial review of the
in-flight #675 work. Every claim below carries a `file:line`. Findings are separated into
**verified by reading code/SQL** and **inferred**; inferences are labelled.

---

## 0. The actor and the goal

One actor owns this project: **the signed-in Solo owner**, in `/solo/{account}/paige/chat`.
Secondary actors that share the same backend and therefore the same contracts: the **portal client**
(`/app`, `PaigeChat.tsx`), the **platform operator** (`useOperatorChat.ts`), and the **Studio design
agent** (`StudioChat.tsx`).

The nine purpose clauses in the brief are the acceptance contract. Each slice below closes one.

---

## 1. What the estate actually is

**One engine, four front doors.** `src/components/dashboard/PaigeAIChat.tsx` (1528 lines) IS the Solo
chat; `SoloPaigeWorkspace.tsx:318` mounts it with `soloTenantSafety` + `enableHistory`. `src/solo/
data/useSoloChat.ts` is **dead code** — imported only by `src/solo/agent.tsx`, which no live module
imports. `src/solo/paigehub.tsx` is a 5-line re-export.

**One backend.** `supabase/functions/paige-ai-chat/index.ts` (~9.5k lines) serves Solo, portal,
operator, floating widget and Studio. Every contract change is therefore a multi-consumer change and
gets a §37 producer inventory.

**What is genuinely sound and must not regress (§58):**

| Thing | Evidence |
|---|---|
| Active-tenant resolution | `get_paige_persona_context` keys on `auth.uid()` only, deterministic ordering — `20260805130000…sql:56-110` |
| Client-scope authorization | tenant **equality** not visibility, six fail-closed branches, choke point ends the turn before any model egress — `index.ts:556-694` |
| Solo account-switch fence | 5 independent layers: key-remount, epoch guard, request fence, late-result rejection, query-key scoping — `SoloApp.tsx:236`, `PaigeAIChat.tsx:84-105,376-399` |
| Knowledge retrieval scope | JWT client so `match_tenant_knowledge`'s guard engages, deliberately not service-role — `index.ts:1497-1503` |
| Protected-content buffering (#675) | clean across 100 adversarial mutations; **9 of the 10** entry sources individually load-bearing (source 7, `fundingEnabled && relevantKnowledge`, is not — deleting it leaves the suite green, which `stage1-check.mjs` states at its own definition) |
| Chat owns no OAuth | zero hits for `access_token`/`refresh_token`/`oauth` in the handler |
| The Rail's TOOL emit carries no raw payloads | `p_title` is a curated `describeStep` label, `p_summary` hardcoded `null`. Scoped to that emit deliberately: the second `record_rail_event`, on the client-message branch, does pass a 140-char preview of the user's own message |

---

## 2. Where the estate contradicts the brief

Ordered by contract, not by file. **DV** = direct violation of a named purpose clause.

### Clause 2 — active tenant + focused client, no carry-over across a switch

| # | Finding | Evidence |
|---|---|---|
| **DV** | **A focused-client switch does not clear the transcript.** No effect keyed on `clientId`; the whole local `messages` array is re-POSTed every turn, so the prior client's content stays in the prompt under the new scope | no `clientId` effect in `PaigeAIChat.tsx`; re-POST at `:660` |
| | The account-switch fence is **opt-in**. `soloTenantSafety` is passed only by `SoloPaigeWorkspace.tsx:322`; the command-center mount omits it, so there an account switch neither aborts the in-flight request nor clears the transcript | `PaigeWorkspace.tsx:176-187` |
| | `paige_chat_turn_append` is `SECURITY DEFINER` and checks **only** `caller_user_id = auth.uid()` — no tenant predicate. A user active in tenant B can append turns to their own tenant-A thread by passing its id. Reads stay fenced, so this is a write hole, not a read leak | `20260711300000…sql:38-72`, esp. `:51-53` |
| | Solo passes **no** `clientId`/`clientContext` at all — the focused-client capability the brief requires does not exist on the Solo surface | `SoloPaigeWorkspace.tsx:318-326` |
| | The `client_scope` refusal frame is consumed by **nothing** (zero hits in `src/`). The code admits it: *"an advisory signal is not a control"* | `index.ts:662-666`, `:8392` |

### Clause 7 — documents are human-reviewed proposals, never auto-writes

| # | Finding | Evidence |
|---|---|---|
| **DV** | **A credit-report PDF dropped in chat auto-writes 8 tables with no human in the loop** — `profiles` FICO ×3, `credit_negative_items`, `credit_accounts`, `credit_inquiries`, `credit_factor_scores`, `funding_readiness_scores`, plus `client_memory` and the whole model JSON into `credit_report_uploads.analysis_result`. The only gates are scope re-checks and model self-validation. None is a person | `index.ts:8871` → `:9240-9487`; `sync-credit-report-data/index.ts:314,415,436,457,543,700,722,753` |
| **DV** | **`runGeneralDocumentExtraction` does not exist.** Called at `index.ts:1015`, defined nowhere in the repo, `ReferenceError` swallowed by the adjacent catch. So for every non-credit document the proposal path is dead and no `extraction_proposal` frame is ever emitted | `:1015`, `:1018-1020`; one grep hit repo-wide |
| | The `extraction_proposal` SSE frame has **zero consumers**. `ExtractionProposalCard` exists and works but is fed only by a client-side regex over *typed text* in the portal, never by a document. Solo never imports it | emitter `index.ts:8916`; zero hits in `src/` |
| | **No exclusion list for prohibited sensitive categories** anywhere in the path. No redaction applied to document text, model output, `client_memory.content`, or `analysis_result` | repo-wide grep |
| | **Uncertainty cannot be represented.** `ExtractionField` has no confidence, no provenance, no "uncertain" state — a value is a bare primitive | `ExtractionProposalCard.tsx:8-17` |
| | Solo's SSE parser never handles `sync_status`, so in the Solo workspace those 8 tables are rewritten with **no visible confirmation at all** | `PaigeAIChat.tsx:749-785` |
| | The prompt tells the model *"The system will offer the client a save dialog separately for any extracted fields"* — nothing fulfils it | `index.ts:4382` |
| | `PaigeChat.tsx:376` and `FloatingChatbot.tsx:180` hardcode `mimeType: "application/pdf"` and drop `kind`/`textContent`, so a DOCX arrives with empty base64 and the model receives only a filename | verified |
| | `isProcessingFile` is returned but read by no consumer — no affordance while a 10 MB PDF is base64-encoded on the main thread | `useChatDocumentUpload.ts:191` |

### Clause 5 — writes are bounded, understood, approved, attributable

| # | Finding | Evidence |
|---|---|---|
| **DV** | **An approval is not bound to what was proposed.** The human reads `confirm_summary`, the UI sends the literal string `"Approved — run it."`, and the model **re-emits the tool call from scratch** — possibly with different arguments. The gate's only re-entry test is `gateArgs.confirm !== true`. Nothing ties the approved summary to the executed args | gate `index.ts:6269`; UI `PaigeAIChat.tsx:1167-1168` |
| **DV** | **Trust Compass is consulted by no server-side write path.** `resolve_tool_autonomy` never reads it; the only two edge-function references are refusal strings naming it as a *missing* contract. The clamp exists client-side, on one operator surface | `20260711200000…sql:45-77`; `trigger-workflow/index.ts:94`; `useToolAutonomy.ts:133` |
| | **`update_client_data` bypasses the autonomy gate entirely** — not in `MUTATING_TOOLS`, so it never reaches the gate. It writes a named client's profile fields through `paige-write-back` with no confirm, no off switch, no autonomy row | `index.ts:6276`; set-difference vs `:5833-5857` |
| | `delegate_to_subagent` is ungated (its sibling `forge_subagent` is gated) | `index.ts:8038` |
| | **Two audit inserts use columns that do not exist** (`resource_type`/`resource_id`/`metadata` vs the real `entity`/`entity_id`/`data`), unawaited and unchecked — so pipeline-stage changes and bulk coach reassignment produce **no audit row, silently**. The file documents the correct shape 180 lines later | `index.ts:6903-6910`, `:6923-6930`; correct shape at `:7086-7089` |
| | Rail mirrors **10 of ~45** write tools; publishes, documents, n8n, zapier, role grants, deals and plans leave no trace. `p_ref_id` is always `null`, so a Rail event cannot navigate to the record it changed | `index.ts:8322-8367` |
| | Autonomy catalog regression: `list_tool_autonomy` returns 23 entries but ~45 tools are gated, so ~22 are permanently `confirm` and un-settable from the UI. The n8n rows were dropped by a "verbatim" re-declaration | `20260716171236…sql:55-78` vs `20260711220000…sql:58-61` |
| | `paige_resolve_autonomy` is a stub: `SELECT p_default` — the action-bus lane resolver ignores tenant and kind. Six call sites depend on it | `20260711024632_action_bus.sql:190-193` |
| | No server-side rejection state — "Hold off" is model-interpreted prose; nothing marks a proposal dead *(inferred: a later turn could re-propose)* | no server state found |

### Clause 6 — integration boundary

| # | Finding | Evidence |
|---|---|---|
| **DV** | **Raw provider payloads are spread verbatim into model context** — `result = { success: true, ...(n8nData as any) }` and the Zapier twin. No sanitizer at this seam, in contrast to the frontend seam which does allowlist | `index.ts:7882-7886`, `:7900-7904`; cf. `settings-integrations.tsx:29-47` |
| | **`fetchedUrlContent` egresses on its own.** A regex scans the last user message for `https?://` and silently fetches the first URL — no tool call, no consent, no confirm, and it runs *before* tier resolution, so it is outside the client-seat allowlist | `index.ts:1069-1090`; tier resolved at `:4150` |
| | There is **no Integration Registry** in code — zero hits repo-wide. What exists is a hardcoded 8-row catalogue with exactly one connectable provider (n8n) over two encrypted connection tables | `settings-integrations.tsx:139-156` |

### Clause 1 & 3 — a usable workspace that answers honestly

| # | Finding | Evidence |
|---|---|---|
| **§70** | The composer advertises **three affordances that do not exist**: *"@ hand it to someone · / call a skill · # remember"*. Solo passes no chips so `/` can never open; there is no `@` or `#` handling anywhere in the file | `PaigeAIChat.tsx:1473-1479`, `:880`, `:891` |
| **§70** | `⌘K` is printed in the command field and is **not bound** in Solo (the real binding is ⌘+`\`; the global ⌘K owner is registered only when `launcherEnabled`, which Solo sets false) | `TenantCommandCenterShell.tsx:138-139`, `:439`; `SoloApp.tsx:249` |
| **§13** | The Capabilities panel states *"Voice input — Partial / Not activated"* while the mic button is live in the same workspace | `SoloPaigeWorkspace.tsx:250` vs `PaigeAIChat.tsx:979-992` |
| | Rename / archive / delete thread are implemented in the hook and have **no Solo UI** | `usePaigeThreads.ts:119-162`; `SoloHistoryRail` never calls them |
| | Retry exists only for offline/timeout. An HTTP error rolls back with no retry affordance | `PaigeAIChat.tsx:1272-1275` vs `:810-826` |
| | No in-transcript permission-denied state | verified |
| | `usePaigeMemory.ts:86` sends `Authorization: Bearer undefined` | verified |
| | *(inferred)* `match_paige_memory` is called on the service-role client where `auth.uid()` is NULL, and its hardened guard has no service-role exemption — so it likely raises on every call and degrades silently to `[]` | `index.ts:1128`; `20260821000000…sql:458-498` |

### Clause 4 — protected content (the #675 work in flight)

Mechanism clean across 100 mutations. Outstanding, from the fifth review:

- **H1/H2 — the two false claims at the close decision.** *(repaired in this session — see slice 1)*
- **M1** — `21.ad`'s control cannot fail for the right reason: deleting the entire §9 choke point survives 335/0 because the previously-dead agentic emit supplies the frame the control looks for. The sibling suite does catch it (66 passed, 5 failed).
- **M5** — the document path's close decision has no shape pin, so deleting it *shrinks* the suite (330 passed) instead of reddening it.
- **M2/M3/M4/M6/M7/M8, L1–L5** — miscounts, a stale count inside a block that forbids counting, a group whose title asserts a property it does not measure, and a marker scan defeated by truncation.

---

## 3. The slices, in order

Every slice: failing-first test → smallest coherent implementation → regression map → independent
adversarial review → repair → evidence separated by class. No slice starts while the previous one
is red.

| # | Slice | Closes | Risk | Shape |
|---|---|---|---|---|
| ~~S1~~ | ✅ **Closed** — reviewed, repaired, re-reviewed. **Close #675 honestly** — trace attribution threaded through all nine provider call sites; the two false claims replaced with the executed truth; `21.ad` asserts refusal text + zero provider calls; document close decision gets its shape pin; the counting defects corrected | 4 | R3 | in flight, near done |
| ~~S2~~ | ✅ **Shipped to the branch.** **A switch actually ends the conversation** — focused-client change clears transcript and in-flight work the way an account change already does; the fence stops being opt-in; `paige_chat_turn_append` gets its tenant predicate; the `client_scope` refusal becomes visible, not merely observable | 2 | R3 | foundation for S3–S6 |
| ~~S3~~ | ✅ **Shipped to the branch.** **Documents propose, never write** — the chat path stops auto-writing extracted fields; the proposal seam is built end to end (server emits → Solo renders → human reviews field by field → the approved write goes through the owning contract); prohibited sensitive categories excluded; uncertainty represented rather than guessed; **NOT** the dead `runGeneralDocumentExtraction` call — still undefined, still one of the 14 baseline `deno check` errors, still filed as its own item. Naming it as resolved here was wrong and is corrected rather than quietly dropped | 7 | R3 | largest |
| **S4** | **A write is what the human approved** — the approval binds to the exact proposed call; `update_client_data` and `delegate_to_subagent` enter the gate; Trust Compass is consulted server-side; the two silent audit failures fixed; Rail coverage and `ref_id` so an event names its record | 5 | R3 | |
| ~~S5~~ | ✅ **Shipped to the branch — and half of it was already done.** **The external boundary holds** — provider responses sanitized at the chat seam instead of spread verbatim; URL fetch becomes a consented, tier-gated act rather than an automatic egress | 6 | R2 | |
| ~~S6~~ | ✅ **The correctness half shipped; the design half is CD's and is listed below.** **The workspace is honestly usable** — every advertised affordance either works or stops being advertised; thread management reaches the UI; retry covers HTTP failure; permission-denied has a state; sources and honest unknowns are presented | 1, 3 | R2 | |

**Deferred, named rather than silently dropped:** clause 8 (client-portal parity) is *foundation* work
here — S2–S5 harden the shared backend the portal already uses; the portal's own build is a separate
project gated on the two-tool client seat allowlist (`actorTier.ts:66-69`). Clause 9 (client-health
awareness) is largely unbuilt and depends on S4's attribution landing first.

---

### S5 — re-grounded against `main`, and the scope shrank

The discovery tracks read this branch, which was 18 migrations behind `main`. After merging, one of
S5's two named violations was **already closed**: the raw provider-payload spread
(`result = { success: true, ...(n8nData as any) }`) is now `projectN8nForModel(n8nData)` /
`projectOutcomeForModel(zapData)`, and `main` ships `smoke:mcp-egress` (80 assertions) and
`smoke:n8n-egress` (39) asserting that no provider payload, injection, credential or foreign-tenant
data reaches the model. Both pass on this branch. Nothing was rebuilt.

That leaves the automatic URL fetch, which was real and is now tier-gated — a portal client pasting
a link no longer causes server-side egress. **What remains open and is NOT claimed as fixed:** for an
owner-tier caller the fetch is still automatic rather than consented. Making it deliberate changes
what the person sees and when, which is CD's call under §00, so it is named rather than decided.

**Also named, not covered:** `paige-mcp` is a second write path that does not consult
`resolve_tool_autonomy` at all. S4's gate hardens the chat, not the MCP surface.

## 4. Collision ownership

**`supabase/functions/paige-ai-chat/index.ts` is the shared contract of every slice.** It is therefore
worked **strictly sequentially** — one slice in flight at a time, no parallel implementers. Research
and review parallelize freely; implementation does not.

| Owner | Files |
|---|---|
| S1 | `paige-ai-chat/index.ts` (trace + comments), `scripts/knowledge-scope/*` |
| S2 | `PaigeAIChat.tsx`, `PaigeWorkspace.tsx` (chat props only), `SoloPaigeWorkspace.tsx`, one migration for `paige_chat_turn_append` |
| S3 | `paige-ai-chat/index.ts` (document branch), `ExtractionProposalCard.tsx`, `useChatDocumentUpload.ts`, `extractionProposal.ts` |
| S4 | `paige-ai-chat/index.ts` (gate + Rail + audit), `PaigeConfirmCard.tsx`, autonomy migrations |
| S5 | `paige-ai-chat/index.ts` (integration + URL seams) |
| S6 | `PaigeAIChat.tsx`, `SoloPaigeWorkspace.tsx`, `TenantCommandCenterShell.tsx` (chrome copy only) |

**Declared collisions and how they are handled**

1. **`sync-credit-report-data` has five producers** — chat plus `CreditReportUploader.tsx:169`,
   `ReportUploadTab.tsx:213`, `CreditIntelligence.tsx:203`, and `analyze-credit-report/index.ts:697`.
   S3 **does not change that contract**. It gates the *chat* caller and leaves the four non-chat
   uploaders on their existing path, so no out-of-scope surface changes behaviour. §37 inventory runs
   before the change lands.
2. **`PaigeWorkspace.tsx` sits inside the command-center shell.** The brief forbids modifying Command
   Center. S2 touches **only the Paige chat props on that mount** — the fence flag — and nothing of
   the shell's own behaviour. Recorded here rather than assumed.
3. **`actorTier.ts` is shared with `paige-mcp`.** No slice widens the client seat allowlist.
4. **`paige-mcp` is a second, entirely ungated write path.** Out of scope for this project and named
   so it is not mistaken for covered: S4 hardens the chat gate, not the MCP one.

---

## 4b. OWED TO CLAUDE DESIGN — found by CC, not decided by CC (§00)

The audits surfaced gaps that are real but are **design decisions, not correctness ones**. CC has
removed the false claims and left honest absences; what should be there instead is CD's call. Listed
so they are tracked rather than quietly dropped.

| Surface | What CC found and did | What is owed |
|---|---|---|
| Solo composer, guidance row | The row advertised three sigils (at-sign / slash / hash) that do nothing here — no chips are passed, so the slash menu cannot open, and there is no at-sign or hash handling at all. CC emptied the row and **kept the element**, because the three-level composer is CD's layout and deleting a level would be restyling their surface. | What that row should say or offer. It currently renders nothing. |
| Thread rename · archive · delete | Fully implemented in `usePaigeThreads` and reachable from the default rail, but Solo's custom rail exposes none of them. CC did not add controls — a new affordance on a designed surface is CD's. | Whether Solo's rail should carry them, and how. |
| Permission-denied in the transcript | There is no in-transcript state for a refused turn; a toast fires and the turn rolls back. CC made a transient server failure retryable (behaviour), but did not invent a state. | What a refused turn should look like in the transcript. |
| Rail search | Title-only, client-side. Not a defect; a scope decision. | Whether it should search content. |

**CC's line, restated:** the false claims are gone because a claim without a capability is a
correctness defect (§70.1) and an honest absence is what CC owes. Deciding what replaces them is not
CC's to make, and none of the above has been guessed at.

## 5. Proof standard

Per slice, evidence is reported in five separate classes and never merged:

1. automated test · 2. static/build (`tsc-ratchet`, `deno check`, lint gates) · 3. structural/harness
render · 4. **authenticated runtime on the real platform** · 5. `UNVERIFIED` with the exact reason.

**Standing UNVERIFIED (§32, honest):** this session has no browser-driving capability and cannot reach
the authenticated Solo surface. Every §70.1 gate item that requires a person completing the flow on the
live platform is owed to a capable session and is reported as owed, never as met.

**Gate 1 (foundation structure):** N/A — existing product, not a new foundation.

**Gate 5 (installation): PASS, with a §13 correction to an earlier reading.** Both skills are present
at 2.0.1. An earlier pass here recorded "every routed reference" as present; on re-checking, the
installed bundle contains `SKILL.md` ONLY — there is no `references/` directory on disk. The
references are INLINED in `SKILL.md` (it says so itself, under "Inlined references"), so nothing is
missing and the gate still passes — but the earlier wording described a file layout that does not
exist, and a session that went looking for `references/orchestration.md` would have found nothing and
had to guess. Recorded rather than quietly reworded.

---

## 6. The autonomy wave (§67/§68) — added after the six slices

Not in the original map. The owner's direction after S1–S6 was to take Paige's autonomy to where it
was meant to be, so the work continued into the three slices the architecture doc specifies as the
substrate. Its own §-doctrine is `docs/doctrine/autonomy-architecture.md`; the tier consequences are
in `docs/doctrine/tier-matrix.md` per §66.

| Slice | What it is | Proof |
|---|---|---|
| **R1 — the gate is reachable** | The confirm gate had been made unusable: five of six chat surfaces cannot echo a fingerprint, the client seat lost its only write, 45 of 48 gated tools never declared an approval parameter, and free-text tools livelocked. The proposed call is now persisted and approval carries a token; the STORED arguments execute. | 12-case prod proof (2 negative controls, 1 case corrected the RLS policy) · 13 harness checks · 8 mutations driven, all red |
| **A — the process record** | `paige_automations` + acts + trigger catalogue. A grant is fingerprinted over the chain, so changing the chain drops an `auto` grant to `confirm`. | 16-case prod proof (1 negative control; found the missing GRANTs and one wrong expectation of mine) |
| **B — the resolver** | `resolve_automation_autonomy` = min(grant, act floor, ceiling), returning `capped_by` and `dark` separately. | 11-case prod proof, each bound driven independently with its own negative control |
| **C — the chat seam** | Five tools. Paige builds a process; she can never grant herself one. | 8 harness checks · 4 mutations driven, all red |

| **R2 — a key anyone can ask for is not a key** | An independent review broke R1's binding and it reproduced: `confirm_token` was the fingerprint of the action, so any later request that re-proposed the same call got it back and could spend it — including a request whose human message was "cancel that". The token is removed. Approval is now a rendered card (unforgeable: the model cannot write a request body) or `confirm: true` (the model's word). Declining CANCELS the proposal. | 15 mutations driven, all red on the check built for them · the two-request drive the old suite could not express |
| **R3 — the risk split becomes a policy** | `_shared/action-risk.ts` classifies all 51 mutations once: 28 `ordinary`, 21 `high` (card only), 2 `owner_only` (not a chat action at any strength). `MUTATING_TOOLS` is the policy's key set, so there is no second list to drift. Unclassified writes refuse at dispatch AND fail CI. | 9 policy mutations driven at the DISPATCH paths · `lint:action-risk` with a 12-case self-test · two shipped tests repointed rather than weakened |

| **C1 — every write is attributable** | One seam at the point every executed tool passes through files a `paige_audit_log` row: entity + record, actor, tenant, risk class, the AUTHORITY it ran on, and the real outcome. The rail's membership is derived from the same target map (adding `update_client_data`) and `ref_id` is filled, so an event can name the record it changed. Two policy defects closed: a `client` seat could not record its own action, and a tenant admin could read every untenanted row. | 8 mutations driven, all red on the check built for them · 5-case prod rollback proof with 2 negative controls that confirmed both defects were real first |

**Owner ruling absorbed (2026-09-01).** *"Paige may never grant or raise her own autonomy through
Chat, regardless of action class or owner wording."* `automation_set_grant` and `automation_set_state`
are `owner_only` and refuse down every channel, including a clicked card. **Named rather than
buried: no Settings control for automation grants exists yet, so those two fields are currently
settable by nothing.** Automations were already inert (no trigger emits), so nothing regressed — but
the Settings control is the close-out, and it is CD's surface (§00).

**What the autonomy wave does NOT claim.** Triggers do not yet EMIT — slice D in the architecture doc.
Four trigger rows are seeded, not the eighty the pack declares, because `is_live` is the field a
builder trusts and only what was verified against production is claimed live. `paige-mcp` performs no
autonomy resolution for any tool (pre-existing); it is scope-enforced, not lane-enforced, and the tier
matrix says so rather than letting the stronger claim be assumed.
