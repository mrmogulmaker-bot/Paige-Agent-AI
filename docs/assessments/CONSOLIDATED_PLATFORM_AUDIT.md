# Paige Agent AI — Consolidated Platform Audit

**Prepared:** 2026-07-20 by Cowork (session with Antonio) · **Purpose:** one living rollup that reconciles the backlog (as Antonio described it in chat) against the two prior deep audits and against what's actually in prod today. **Not a new deep audit** — the prior audits are still mostly valid. This is the reconciliation layer they lack.

> **This is a LIVING doc.** Per §8 below, update §1 (state) + §2 (what changed) at the end of every brain-build session. Do not rewrite the source audits — they capture point-in-time state and remain the authority for their lanes.

---

## 0. What this doc is (and isn't)

**Is:** a normalized view of what's built, what's half-built, what's duplicated under different names, and what remains for launch — accurate as of the end of the 2026-07-20 brain-build session.

**Isn't:** a replacement for the prior audits. Both remain the source of truth for their respective lanes:

- `docs/paige-master-implementation-order.md` — the properly ordered master plan (spine → phases 1–10)
- `docs/assessments/PLATFORM_ASSESSMENT_2026-07-13.md` — the deep state-of-the-platform assessment (500+ lines, still ~85% valid — see §2 for what's changed since)
- `docs/assessments/DRIFT_AUDIT_2026-07-14.md` — the live-vs-repo drift audit (~55% valid — see §2 for critical items already remediated)
- `docs/security/PLATFORM_SEPARATION_AUDIT_2026-07-02.md` — the §9 platform-vs-tenant audit
- `docs/security/AUDIT_213c_RETRO_2026_07_03.md` — migration hygiene retro
- `docs/security/MIGRATION_B0_ROW_CLASSIFICATION_AUDIT.md` — data classification audit

**Discipline going forward:** update THIS doc's §2 (what's changed) at the end of every brain-build session. Do not re-write the source audits — they capture point-in-time state. Layer deltas here.

---

## 1. Where we are — end of 2026-07-20 session

**Brain build:**
- L1 (Observability / paige_llm_trace) — LIVE, tenant_id soft-FK silent-drop fixed via #146
- L4 (Reasoning — all 5 phases + engine) — LIVE
  - Phase-4 runReasoning engine (#144)
  - Phase-5 trace/learning seam (#145)
  - Phase-1 strategize (#147)
  - Phase-2 reflect (#148)
  - Phase-3 review (#150)
- L2 (Quality/Evals — Slice 1) — LIVE (#151), auth-gated verified
- L4↔L2 integration — LIVE (#152), first live `paige-strategist` trace confirmed
- L5 (Talent — Slice 1) — LIVE (#153), inert opt-in: crew-identity columns + 10 dormant review-crew rows + roster inspect + config.job_kind validation; verified in prod, edge redeploy confirmed byte-live
- §9 orchestrator security hardening (#149) — LIVE, closed cross-tenant IDOR + PostgREST injection + folded #206 funding leak; §32 exploit re-run against prod confirms all three attack vectors closed

**Brain-in-entirety COMPLETE (end 2026-07-20):** the full §34 build order shipped and is §32-verified live — L5 wiring (#156), L6 captureToMemory (#158), L7-S1 God-view dashboard (#160/#161), §16 10-department formalization (#162/#163), §8 two-way action-bus drainer (#164/#165). The §8 drainer runs on a */2 cron (post-deploy runtime check: fired + succeeded); the last brain layer is live.

**Now in flight — Post-Brain Cleanup Queue (Lane F first):** Lane F CI quality gate — the first typecheck/build/test/lint gate the repo has had (PLATFORM_ASSESSMENT Move 4). See §2 + docs/OPS.md.

---

## 2. What changed since the last audit (2026-07-14)

**Remediated since PLATFORM_ASSESSMENT_2026-07-13 / DRIFT_AUDIT_2026-07-14:**
- ✅ **DRIFT_AUDIT C1** (`businesses` table cross-tenant leak) — VERIFIED FIXED in prod. `businesses.tenant_id` column exists, `tenant_isolation` RESTRICTIVE policy exists (2026-07-20 live check).
- ✅ **PLATFORM_ASSESSMENT §2/#206 funding cross-tenant leak** — CLOSED as part of #149 orchestrator fix (folded in, verified live).
- ✅ **Silent-drop on paige_llm_trace tenant_id FK** — CLOSED via #146 (Cowork-flagged this session, Claude Code diagnosed + fixed).
- ✅ **Orchestrator §9 IDOR + PostgREST injection** — CLOSED via #149.
- ✅ **Lane A2 Finding 1 — kb-search cross-tenant private-KB read IDOR** — CLOSED (PR #167). `match_tenant_knowledge` was SECURITY DEFINER + GRANTed to `authenticated` + filtered on caller-supplied `p_tenant_id`; any authenticated user could read another tenant's private Tier-2 KB chunks. Fixed with the #149/#361 JWT-caller guard + the edge fn now derives tenant from `current_user_tenant_id()` (never body). §32-verified live (own allowed / foreign 42501 / service-role trusted); both crew auditors returned SHIP. Out-of-scope siblings filed: #380 (Studio drafters' service-role guard bypass), #381 (kb-ingest-doc write side), #382 (or-filter sanitization).
- ✅ **Move 2 · F1 — user_id-scoped consumer-finance tables (migration 20260721024632).** First finance-cluster family: narrowed the standalone `has_role('admin')` bypass on **9 tables** (banking_relationships, business_credit_reports, financial_document_analyses, funding_applications, funding_journey_applications, funding_milestones, quickbooks_financials, quickbooks_connections, quickbooks_transactions) via a new coach-less helper `tenant_staff_owns_user(_actor,_user)` = super_admin OR tenant-admin/agency-parent of the consumer's tenant (resolved `user_id → clients.linked_user_id → clients.tenant_id`). **Sixth stale-audit correction:** these tables carry a `business_id` column but do NOT scope by it — the audit's "business_id → businesses.tenant_id" assumption for this family is wrong; the real path is `user_id → clients.linked_user_id`. **PURE NARROWING** (§13): only the admin disjunct was swapped; owner-self + exact coach terms preserved verbatim — both auditors flagged that bundling coach into the helper would silently broaden coach access on admin-only tables, so that was deliberately avoided and filed as a product decision (#388). Crew: verifier SHIP (dual-layer exploit: cross-tenant admin GRANTED pre-fix → DENIED post-fix; no residual disjunct); compliance ITERATE→resolved (pulled the 3 grep-missed tables quickbooks_connections/_transactions/funding_milestones into the slice; coach-less helper approved as the right §18 call). §32-verified live (fidelity 0/9; cross-tenant denied / own / agency / super granted). Remaining finance families in #385: F2 (client_id → clients.id, reuses `can_access_contact`), F3 (user_id-only via clients.linked_user_id, reuses `tenant_staff_owns_user`), F4 (tenant_id direct, Slice-1 template), F5 (operator catalog → is_platform_owner).
- ✅ **Move 2 · can_access_contact tenant-scope (migration 20260721020716).** The finance sub-slicing surfaced the real keystone of the consumer-PII cluster: the SHARED `can_access_contact` helper (used by 19 policies on 15 tables + 2 RPCs — `start_client_impersonation` & `client_onboarding_status`) carried its OWN tenant-blind global-admin bypass (`has_any_role(_user_id,['admin','super_admin'])`). Narrowed it to `is_super_admin OR tenant-admin-of-the-contact's-tenant OR agency-parent` (agency-aware via `agency_can_manage_child`, matching the Slice-1 template), closing ~7 helper-sole tables + both RPCs. **Fifth stale-audit correction:** the "finance cluster" is NOT the Slice-1 template — it's per-scoping-family (5 families, ~27 tables, mostly no `tenant_id`); and 10 of the 15 helper tables are non-finance (bookings/payments/signatures/conversations/intake), so the fix is named for the helper, not "finance." Crew: compliance ITERATE→resolved (added the agency clause + honest rename); **adversarial verifier caught a real BLOCKER** — the helper narrowing alone left the 5 finance `paige_*` tables (+3 others) wide open because their policies carry a *standalone* `has_role('admin')` disjunct that bypasses the helper — so PART B narrows that disjunct on all 8 (10 policies), unifying them onto the tenant-scoped helper. §32-verified live (fidelity: 0/10 policies still reference has_role; behavioral: cross-tenant admin denied / agency-parent granted / own granted / super_admin retained). Overlap check for the owner's gate: **no Lane E exists**, and the §2 amputation (task #7) targets legacy UI surfaces only — the finance *tables* are retained Paige IP behind the `funding_readiness` opt-in, so RLS hardening is additive, not conflicting. Remaining finance families filed in #385 (user_id/business_id credit tables via clients/business_id join; operator catalog tables → is_platform_owner).
- ✅ **Move 2 · Slice 1 — cross-tenant client-PII admin bypass narrowed (migration 20260721002907).** The keystone lane (former Lane A4+A5, merged): global `has_role('admin')` was narrowed to tenant-scoped on the 4 highest-severity client-PII tables — `client_notes`, `client_files`, `growth_form_submissions`, `paige_subagents` — plus a god-role ceiling on `sync_tenant_member_to_user_roles` (auto-sync can never mint super_admin/platform_admin/developer). **Canonical Move-2 template = the `businesses` DRIFT-C1 shape**: operator escape `is_platform_owner()` (super_admin only); tenant scope `tenant_id = current_user_tenant_id() AND has_role(<staff>)` (agency-aware; neuters the global admin role by pairing it with the validated active-tenant check). §32-verified live (own-tenant allowed / foreign denied / operator retained / active-tenant coupling enforced). Both crew auditors passed (verifier SHIP; compliance ITERATE→resolved to the `businesses` canonical shape). Remaining Move 2 filed: #384 (Slice 2 bulk tables + client_memory/goals/comms which need a clients-join), #385 (finance/credit cluster), #386 (Slice 3 = 21 B3 edge fns via requireTenantScope), #387 (change_user_role 'developer' gap + §17 operator-access audit trail).

**Net-new since prior audits (this session):**
- L1 flight recorder + L1.1 text-path tracing (live and receiving rows)
- L4 reasoning engine + all 5 phases (inert opt-in code; L4↔L2 loop wired live into paige-deep-research)
- L2 quality/evals Slice 1 (4 tables, 10 deterministic scorers + frontier rubric_judge, auth-gated edge fn)
- L5 Talent Slice 1 + wiring (crew-identity columns, 10 dormant review-crew rows, roster inspect, per-agent job_kind swap)
- L6 captureToMemory, L7-S1 God-view intelligence dashboard, §16 10-department formalization
- **§8 two-way action-bus drainer (#164/#165)** — paige-action-worker on a */2 cron drains filed actions → drafts via the orchestrator → routes to approval; §16 tier-honoring (skips off-lane), idempotent approval insert, atomic claim. Brain-in-entirety complete.
- **Lane F CI quality gate Slice 1 (PLATFORM_ASSESSMENT Move 4)** — `ci.yml`: build + test hard gates, tsc signature-ratchet (baseline 22, fails on new only), changed-file eslint/gold, added-lines §3/jargon/policy regression lint. Grounding correction: the audit's "deploy ignores config.toml verify_jwt" item was already fixed by the 07-18 deploy-edge-functions.yml. Runbook: docs/OPS.md. **Owner action:** mark `ci / verify` a required status check in branch protection or the gate stays advisory.

**Still open from prior audits (highest severity first):**
- **PLATFORM_ASSESSMENT A1–A8 (money — no reachable Paige checkout, plan taxonomy fractured six ways, `platform_subscriptions` has zero writers, trial→paid conversion doesn't exist, entitlement bypass, Stripe idempotency inverted, `check-subscription` anon client, no dunning).** All still open. Antonio's ticket list does not surface these as go-live gates but PLATFORM_ASSESSMENT called them the top MVP blocker.
- **PLATFORM_ASSESSMENT B1 (privilege escalation).** ⚠️ **Two stale-audit corrections (live-grounded 2026-07-21):** (1) the **`→ super_admin` god-hop is ALREADY CLOSED** — the 07-13 emergency migration (`move1_privesc_emergency_core`) dropped the permissive `user_roles` "Admins can manage all roles" policy, so no plain admin can self-insert super_admin; only owner-gated writes + own-select remain, and `change_user_role`/`grant_tenant_member_role` block the god roles for non-owners. (2) What IS live: **public signup → global `app_role='admin'`** in 3 calls — but this is the *legitimate onboarding flow* (provision_tenant → tenant_members owner → sync trigger → global admin), inseparable from the B2 narrowing. Being closed by **Move 2** (admin global→tenant-scoped): Slice 1 shipped (above); god-role ceiling added to the sync trigger. Load-bearing; in progress.
- **PLATFORM_ASSESSMENT B2 (tenant tables cross-tenant readable/writable via `OR has_role(admin)` bypass).** ⚠️ **Stale-audit correction:** the blast radius is **231 live policies across ~150 tables**, not "~20" — a large undercount. Being closed by **Move 2**: Slice 1 shipped the 4 client-PII tables + set the canonical template; Slices 2/finance (#384/#385) cover the remainder.
- **PLATFORM_ASSESSMENT B3 (21 edge functions authorize with global admin then act via service-role client).** Still open — Move 2 Slice 3 (#386), `requireTenantScope` helper + retrofit. Same class as #149. Depends on the DB-layer narrowing landing first.
- **PLATFORM_ASSESSMENT C1 (password reset queued to Lovable worker that was never deployed).** Still open.
- **PLATFORM_ASSESSMENT C2 (QuickBooks OAuth callback 401s + unsigned state).** Still open.
- **PLATFORM_ASSESSMENT D1 (client portal cannot read own tenant's Playbook — every client sees generic default).** Still open — ~30 lines of SQL per the audit.
- ~~**PLATFORM_ASSESSMENT D2 (action bus has no drainer).**~~ ✅ **CLOSED** — §8 drainer shipped (#164/#165), paige-action-worker on a */2 cron, post-deploy runtime check confirmed fired + succeeded. This was the last brain layer.
- **PLATFORM_ASSESSMENT §2 violations (QuickStatsBar unconditional, OnboardingFlow credit-repair modal, Terms/Privacy CROA disclaimer, /app/credit routes unguarded).** Partially addressed via task #7 verticalization compliance debt (currently deferred per brain-first rule).
- **DRIFT_AUDIT C2 (`provision_tenant` loses agreement gate on rebuild) + C3 (`revoke_platform_access` re-widens on rebuild).** Latent regressions — prod correct, git armed to undo. Still open.
- **DRIFT_AUDIT H1 (agency_team_roles exists only in prod — 5 rows, 7 RPCs).** Still open — data loss on rebuild.
- **DRIFT_AUDIT §4 armed footgun (`db push` remediation trap — 124 ledger migrations exist in no git file).** Still open.

---

## 3. The layering map — "same concept, different names"

Antonio's concern was real. The schema has multiple parallel constructs for the same thing. Recorded here so any consolidation PR has one source to work from.

### 3.1 Skills
| Construct | Location | Status | Purpose |
|---|---|---|---|
| `paige_skills` | table (RLS on) | Live | Registry of skills Paige can invoke |
| `paige_skill_proposals` | table (RLS on) | Live | Proposed skills awaiting approval |
| `paige_skill_runs` | table (RLS on) | Live | Skill invocation log |
| `marketplace_items` | table (RLS on) | Live | Platform Marketplace catalog |
| `marketplace_item_versions` | table (RLS on) | Live | Marketplace versioning |
| `marketplace_installs` | table (RLS on) | Live | Which tenant installed which item |
| `marketplace_install_ledger` | table (RLS on) | Live | Install audit trail |
| `marketplace_install_bundle_links` | table (RLS on) | Live | Bundle relationships |
| `marketplace_vendors` | table (RLS on) | Live | Vendor registry |
| `skill-runner` edge fn | supabase/functions | Live | Executes a skill invocation |
| `skill-forge` edge fn | supabase/functions | Live | Authors new skills |

**Same concept problem:** the Marketplace items and paige_skills are separately-tracked registries. Cowork's earlier "add FDIC/NCUA as Marketplace skills" brief (task #6, deferred) assumed one concept; there are actually two. Any Marketplace-skill build needs to define whether it targets `paige_skills` (Paige's directly-invocable tools) or `marketplace_items` (tenant-installable products) or both. **PLATFORM_ASSESSMENT already flagged this — "Paige has no `skill_search`/`skill_run` tool" — meaning she cannot reach her own skills engine from chat.**

### 3.2 Actions / Automations / Workflows
| Construct | Location | Rows | Purpose |
|---|---|---|---|
| `paige_actions` | table | 16 | The action bus — filed/drafted/approved/executed |
| `paige_action_kinds` | table | seeded | Action-kind registry (draft_subagent_slug, etc.) |
| `paige_pending_approvals` | table | live | Approval queue for drafted actions |
| `paige_approval_policies` | table | live | Per-action-kind autonomy_lane rules |
| `paige_approval_comments` | table | live | Approval discussion thread |
| `paige_approval_queue_v` | view | 0 | Materialized approval-queue view (no RLS — it's a view) |
| `paige_workflow_registry` | table | live | Paige-authored workflow definitions |
| `paige_workflow_runs` | table | live | Workflow execution log |
| `tenant_workflows` | table | 200 | Tenant-authored workflows (probably n8n) |
| `paige_n8n_connections` | table | live | Paige's n8n connection state |
| `tenant_n8n_connections` | table | live | Tenant's n8n connection state |
| `stage_automation_rules` | table | live | Client-stage triggered automations |
| `stage_automation_events` | table | live | Stage automation execution log |
| `growth_automation_targets` | table | live | Growth-page/form automation targets |
| `growth_form_automations` | table | live | Growth-form triggered automations |
| `paige-orchestrator` edge fn | supabase/functions | Live | Sub-agent dispatch router |
| `paige-n8n` edge fn | supabase/functions | Live | n8n bridge |

**Same concept problem:** THREE parallel automation systems (`paige_workflow_*`, `tenant_workflows`, `stage_automation_*`, `growth_*_automation*`) plus TWO n8n connection tables (`paige_n8n_connections` and `tenant_n8n_connections`). §8's action bus and §14's automation-fabric are conceptually one — Paige orchestrates all automations across all surfaces. Right now the schema fragments this. **PLATFORM_ASSESSMENT D2 called this out:** the action bus has 16 real rows but no worker/cron picks up `filed` actions — so §8's core promise ("Client team detects a need → files an action → Owner team drafts → routes to approval") only happens when a human is chatting. This is the single highest-leverage missing piece.

### 3.3 Memory / Recall / Knowledge
| Construct | Location | Purpose |
|---|---|---|
| `paige_prompt_memory` | table | Semantic memory the reasoning engine writes to via `captureToMemory` |
| `paige_prompt_template` | table | Prompt template registry |
| `tenant_knowledge_docs` | table | Tenant-uploaded knowledge base docs |
| `tenant_knowledge_chunks` | table (0 rows) | Chunked+embedded KB content (EMPTY — never ingested) |
| `rag_retrieval_log` | table | RAG query audit |
| `paige_context_loads` | table | Context assembly log |
| `paige_conversations` | table | Conversation memory |
| `paige_chat_threads` (12 rows) + `paige_chat_turns` (103 rows) | tables | Paige chat history (actual conversation storage) |
| `kb-ingest-doc` / `kb-ingest-file` / `kb-ingest-url` / `kb-search` / `embed-text` | edge fns | KB ingestion + search stack |

**Same concept problem:** memory splits across at least THREE separate constructs — Paige's own semantic memory (`paige_prompt_memory`), tenant knowledge base (`tenant_knowledge_*`), and conversation history (`paige_chat_*` / `paige_conversations`). L6 in the brain roadmap says "captureToMemory wired end-to-end" — but memory into WHICH of these? Needs a scoping decision at L6 grounding time. Also: `tenant_knowledge_chunks` is EMPTY — the ingestion stack exists but has never actually ingested. Tenant KB is a hollow promise today.

### 3.4 Departments / Org
| Construct | Location | Status | Purpose |
|---|---|---|---|
| `paige_departments` | table | seeded, unread | §16 10-dept model |
| Hardcoded `["owner_ops","client_experience"]` | LLM tool schemas at paige-ai-chat:4228,4261,4863 | live | Actual routing |
| `paige_subagents` | table | shell + 10 dormant review-crew (L5) | The specialist registry L5 extends |
| `paige_subagent_proposals` | table | live | Forge proposals awaiting approval |
| `paige_subagent_factory_quota` | table | live | L5 forge quota gates |
| `paige_subagent_invocations` | table | live | Sub-agent invocation log |

**Same concept problem:** `paige_departments` was seeded with the 10-dept model **and never queried by any code path.** The LLM tool schemas hardcode 2 departments (owner_ops, client_experience) — so the 9 new departments seeded in the table cannot even be written. §16 is a table-shaped promise the executor was never built for. Building §16 = wire the executor to actually read `paige_departments` + expand the LLM tool schema beyond 2 fixed values.

### 3.5 Subscription plans — the six-way fracture (PLATFORM_ASSESSMENT A2)
Six different sources of truth for "what plan is a tenant on":
| Source | Slugs | Prices |
|---|---|---|
| `Pricing.tsx` (what you sell) | starter / growth / scale | $197 / $497 / $1,497 |
| `create-checkout` (only wired checkout) | starter / professional / premium / enterprise | $47 / $97 / $197 / $497 |
| `subscription_plans` (legacy) | consumer credit-repair | "5 disputes/month", etc. |
| `create-trial-checkout` (not wired) | starter | $49 |
| `stripe-webhook` | standard / premium / vip | — |
| `platform_subscription_plans` (§17-canonical, seeded, unread) | practice / academy / enterprise | $149 / $397 / — |

**Same concept problem:** already tracked by DOCTRINE_197_BILLING_LAYER_TAXONOMY. L1 = platform_subscription_plans (§17-canonical). L2 = the legacy subscription_plans (queued for deletion). Fix per PLATFORM_ASSESSMENT Move 3: make platform_subscription_plans the single source; retire the rest.

---

## 4. Antonio's ticket list — reconciled against master plan

Ticket numbers Antonio shared in chat map to `docs/paige-master-implementation-order.md` phases + PLATFORM_ASSESSMENT items. Not new work; existing plan under different numbering.

### 4.1 Go-live gates (Antonio's flag)
| Ticket | Master plan | Status |
|---|---|---|
| #185 Settings account security (password, 2FA, sign out everywhere) | Phase 2/Move 3 | Partial — #72 password work in-progress |
| #63 Email deliverability | Master Phase 7 #20 | Not started |
| #62 Post-signup welcome + onboarding sequence | Master Phase 7 #20 | Not started |
| #99 Branded tenant invite + signup page | Master security/hygiene | Not started |
| #189 Agency sub-account onboarding provisioning | Master Track S / signup work | Not started |
| #61 Landing copy sweep (broaden from coaching) | Master Phase 9 #22 | Deferred — partially in verticalization compliance debt (task #7) |

### 4.2 Security & §2/§9 compliance
| Ticket | Master plan | Status |
|---|---|---|
| #212 harden `current_user_tenant_id()` (self-writable active_tenant_id) | not explicit in master, load-bearing | OPEN — same class as #149 orchestrator IDOR just closed |
| #108 IDOR sweep across SECURITY DEFINER RPCs | Master Track S #2 | OPEN — the pattern the #149 fix was one instance of |
| #4 MMA OS RLS (22 tables exposed to anon) | Master Track S #3 | OPEN — biggest live security hole in the list |
| #194 admin_app_settings write-RLS + BrokersAdmin gating | Track S | OPEN |
| #206 funding-agents cross-tenant leak | Master §2/§9 #4 | ✅ CLOSED (folded into #149 this session) |
| #176 / #171 / #209 §2 finance-vocab leaks (staff bypass, MCP tagline, legal-doc registry) | Master §2/§9 #4 | OPEN — smaller, batchable |
| #197 nested-agency guard (sub-account self-upgrading child) | Track S | OPEN |

### 4.3 Brain items (already on brain roadmap under different names)
| Ticket | What it actually is | Status |
|---|---|---|
| #82 Paige command center | Surface for L4/L5 output + §16/§8 | Depends on §16/§8 |
| #83 Sales & prospecting suite | Brain application (Paige in Sales dept per §16) | Depends on L5 + insights ingest |
| #91 Multi-round agentic tool loop | L4 phase-4 extension | Partially done (runReasoning shipped; not yet wired as multi-round yet) |
| #93 / #117 Conversation memory + compaction | **This is L6.** | On brain roadmap |
| #204 EPIC: Operationalize $100M Org Blueprint | **This is §16.** | On brain roadmap |
| #190 Paige replicated at every level | L5 + §16 (per-tenant/agency/sub Paige) | On brain roadmap |
| #113 Billing Brain (dunning) | Brain application (Paige in Finance dept per §16) + PLATFORM_ASSESSMENT A8 | Depends on L5 + billing spine |
| #114 Meta lead-gen closed loop | Master Phase 3 #6 | Not started |
| #111 Client Heartbeat / at-risk save play | Master Phase 1 #3 (proof-of-spine play) | Not started — was originally the "prove the bus" moment |

### 4.4 Channels / connectors / infrastructure
| Ticket | Master plan | Status |
|---|---|---|
| #84 Voice / telephony | Master Phase 9 #22 | Not started |
| #64 per-tenant comms (Twilio, subdomains) | Master Phase 7 #20 | Not started |
| #167 / #49 Calendar OAuth (Zoom, Google two-way, Apple) | Master Phase 6 | Zoom done; Google token stored but never read (PLATFORM_ASSESSMENT); Apple not started |
| #173 Calendar polish | Master Phase 6 | Not started |
| #96 / #98 Voice chat config + inline UX | Master Phase 9 #22 | Not started |

### 4.5 Billing / growth (largely covered by PLATFORM_ASSESSMENT A1–A8)
| Ticket | Master plan | Status |
|---|---|---|
| #188 Self-serve plan upgrade | PLATFORM_ASSESSMENT A1 | OPEN — no reachable Paige checkout today |
| #27 Per-tier BYO merchant (Stripe Connect) | Master Phase 10 | L2 checkout exists (/store/:slug), no L1 |
| #113 Billing Brain (dunning) | Phase 2 #5 + PLATFORM_ASSESSMENT A8 | OPEN — first failed charge = silent downgrade today |
| #111 Client Heartbeat | Phase 1 #3 | OPEN |

### 4.6 Design / LMS / verticals / Studio waves
All pure front-end; independent lane; safe to run parallel to brain build; not blocking anything.

### 4.7 Hygiene batch
| Ticket | Notes |
|---|---|
| #79 / #130 Remove Lovable | Documented removed but still on auth-email hook path per PLATFORM_ASSESSMENT C1 |
| #170 Regenerate types.ts | Small, one-shot |
| #179 CI grep boundaries | Part of PLATFORM_ASSESSMENT Move 4 |
| #183 Copy button in chat | Small |
| #196 Mobile AccountSwitcher | Small |
| #195 Marketplace notify-me seam | Small |

### 4.8 The beast — #174 Client Experience epic
Marketplace populates tenant KB+functions · client-portal design + all portal functions live · invite→portal→onboarding→Paige-greets as one pipeline · "View as client" preview · one-click presets · readiness checklist. **This depends on L5 (specialist forge) + L6 (memory) + §16 (10-dept) + D1 fix (client portal can't read own tenant Playbook) + go-live UX pieces (#62/#99/#189).** Not parallelizable. Payoff of the brain build.

---

## 5. Recommended sequencing given both directives

Antonio has two directives that tension each other: (a) "build the brain in its entirety, then clean up everything else" and (b) "get real people on the platform is near-term." Reconciliation:

**Lane 1 — Brain build (current, do not interrupt).** Claude Code continues L5 → L6 → L7-S1 → §16 → §8 → insights → automations. Only a live-customer-facing prod bug interrupts. Currently on-mission.

**Lane 2 — Same-class-as-#149 security fixes (open in parallel, separate crew).** These are structural, not cleanup — every brain layer sits on them:
- #212 (self-writable `active_tenant_id`) — same IDOR class as #149
- #108 (IDOR sweep across SECURITY DEFINER RPCs) — same class
- #4 (MMA OS RLS on 22 anon-exposed tables) — largest live hole
- PLATFORM_ASSESSMENT B1 (global admin → super_admin escalation) — same auth-role class
- PLATFORM_ASSESSMENT B2 (20 tables cross-tenant readable via `OR has_role(admin)`) — same class
- PLATFORM_ASSESSMENT B3 (21 edge fns global-admin + service-role) — same class

**Lane 3 — Money spine + account recovery (open in parallel, separate crew).** These are PLATFORM_ASSESSMENT Move 3 (billing spine end-to-end) + C1 (password reset off Lovable to Resend) + C2 (QuickBooks OAuth). Without these, real people cannot self-serve — go-live is technically impossible.

**Lane 4 — CI pipeline (PLATFORM_ASSESSMENT Move 4).** Prerequisite for lanes 1–3 not silently regressing. Small effort, huge leverage.

**Lane 5 — §2 amputation (PLATFORM_ASSESSMENT Move 2 + task #7).** One PR. Every gate needed already exists. Fastest single move for §2 compliance + attack surface reduction + legal-exposure reduction.

**Sequence in absolute priority order (my recommendation):**
1. **Brain build (Lane 1) stays running** — L5 → L6 → L7-S1
2. **Lane 4 (CI pipeline) ships first among the parallel lanes** — 3–4 days, unblocks safe iteration for all other work
3. **Lane 5 (§2 amputation) ships next** — one PR, days
4. **Lane 2 (structural security) opens parallel** — pull #212 first (same class as #149, we know the pattern)
5. **Lane 3 (money spine + account recovery) opens parallel** — the go-live cash-register
6. **After brain L5+L6+§16 land AND lanes 2/3/5 ship**: unblock #174 Client Experience epic

**Lane 6 — Pure front-end (Studio waves 1–4, design uplift #103, scroll-wall #67, dark-mode #134, LMS #87, portal skins #88).** Fully independent, safe anytime, doesn't collide.

---

## 6. Deprecate / retire

Prior audits already flagged these as dead code / regression traps. Recording here so a consolidation PR can act:
- Second Plaid stack (PLATFORM_ASSESSMENT §3)
- `coaching-reminder-cron` (targets nonexistent table)
- `BrokerComingSoon`, `TasksAdmin` (dead front-end)
- LangGraph orchestrator branch (no seeded agent takes it)
- `complete-signup` (would classify every user into credit/funding persona)
- One of the two Stripe webhooks (they can't both verify against one secret)
- The `Dashboard.tsx` + `AppSidebar.tsx` + ~20 legacy credit components (routed nowhere, contain the hardcoded Personal Credit / Business Credit / BUILD Program / Funding Marketplace sidebar Cowork flagged in verticalization compliance debt task #7)
- `provision_tenant_profile_upsert_fix` — DRIFT_AUDIT explicitly says NEVER commit (recreates removed ungated overload)

---

## 7. Doctrine reminders (from PLATFORM_ASSESSMENT §7 handoff, still valid)

Load-bearing facts about this codebase that reading the code will not reveal:

1. **The Supabase CLI does not work here.** Deploy path is `./scripts/deploy-function.sh <slug> [--no-verify-jwt]`, one function per invocation. *(Note: edge functions now also auto-deploy on merge to `main` via CI — see `supabase/functions/CLAUDE.md` / root §24.)*
2. **`supabase/config.toml` is decorative** — deploy script doesn't read it. `verify_jwt` posture = whatever the human typed. 130 of 220 functions have no config entry.
3. **`docs/sprints/bootstrap-byo-schema.sql` is the real schema artifact.** 22,621 lines, ordered, extracted from prod 2026-07-05. Do not replay 479 migrations.
4. **`admin` is the tenant-owner role, NOT a platform role.** Every `has_role(auth.uid(),'admin')` is global and satisfied by every tenant owner. Correct platform predicate: `is_platform_owner()` / `super_admin`. This one collision is the root cause of most security blockers.
5. **`CLAUDE.md` is the spec, not a style guide.** §2 (no consumer finance in defaults), §3 (banned phrases), §9 (platform vs tenant seam), §10 (Paige-governable via RPC), §11 (primitive layer mandatory), §13 (fire is not a delivery).
6. **Two billing layers (L1 platform / L2 tenant-end-customer)** — `docs/security/DOCTRINE_197_BILLING_LAYER_TAXONOMY.md` is authority. Don't fix L2, build L1.
7. **`@/components/ui/page` is the design primitive layer** — mandatory on new/touched pages. Reference bars: `PracticeOverview.tsx` and `Marketplace.tsx`.
8. **There is no dark mode.** `next-themes` imported, never provided.
9. **The Anthropic gateway is `_shared/claude.ts`.** Legacy OpenAI/Gemini model strings get silently translated to `claude-haiku-4-5`. Paige's main tool loop is on the cheap tier by accident. Telemetry `p_model` is unreliable.
10. **`_shared/model-router.ts` cannot serve the streaming tool loop** — `routedChatCompletion` is non-streaming and returns null on tool use.
11. **RLS-filtered writes return success** — an UPDATE that matches zero rows because of a policy does NOT error. Several code paths log success, fire green toast, do nothing.
12. **`git log -S "<function-name>"` is your friend** — some "never wired" orphans are actually deleted callers.

---

## 7.6 Voice layer — architecture decisions locked (2026-07-20)

**Trigger:** Antonio + Cowork architecture conversation on voice agents post-brain-build. Decisions locked here so when the voice slice is sequenced (post-cleanup-queue, in the "Automations surface" tier of Tier 1 owner priorities), Claude Code has the design input ready and doesn't re-derive.

### 7.6.1 Middleware pick: Vapi

- Chosen over: Retell, ElevenLabs Conversational AI, OpenAI Realtime API, DIY Deepgram-Claude-Cartesia.
- Why: preserves Claude as the reasoning tier (§17), solves the real-time hard problems (WebRTC, VAD, sub-500ms latency, interruption handling), includes phone-number provisioning natively, cheaper per-minute than ElevenLabs Conversational AI, can still use ElevenLabs voices as the TTS backend.

### 7.6.2 Phone number provisioning: Vapi-native default; BYOT-Twilio as premium later

- **Default path (all tenants):** Vapi-provisioned numbers. One vendor, one API, one invoice. Perfect for the first cohort of tenants.
- **Premium path (advanced tenants):** Vapi supports bring-your-own-Twilio for tenants needing vanity toll-free, international coverage, SIP trunking, SMS-on-same-number. Add when a real tenant asks; not a Day-1 feature.
- **Explicitly NOT:** wire Twilio into the platform infrastructure directly. Vapi's telephony layer is enough.

### 7.6.3 Voice agent registry: extend `paige_subagents` with `voice_config`

- Add `voice_config jsonb` column to `paige_subagents` (voice_id, personality, tone, greeting_template, model tier).
- A "voice agent" is a sub-agent with voice metadata attached — no new table, no parallel architecture.
- Tenants create/customize via existing `subagent-forge` (L5, shipped) — same forge that already creates any other sub-agent.
- Persona resolution: existing `get_paige_persona_context` extended to return `voice_config` alongside persona → tenant renames Paige → voice agent inherits the new name automatically.
- Per §16, each of the 10 departments can carry a seeded default voice sub-agent (Sales = warm/professional outbound; Client Experience = welcoming/patient inbound; Finance = gracious/firm retainer reminders). Tenants override with their own via forge.

### 7.6.4 Phone number registry: new `tenant_phone_numbers` table + `/admin/phone-numbers` page

- **Schema:** `tenant_phone_numbers` (tenant_id, e164_number, provider, provider_ref, monthly_cost_cents, assigned_agent_slug, status, created_at).
- **Edge fn:** `provision-phone-number` — calls Vapi API, records the row, appends to tenant's L2 subscription add-ons (rides the money spine from Lane B).
- **UI:** new `/admin/phone-numbers` page — list currently-provisioned numbers, "Add a number" flow (search by area code / toll-free / country → select → provision), assign each number to a voice agent via dropdown.
- Also expose as a marketplace category — a tenant browsing `/admin/marketplace` sees "Phone Numbers" alongside skills, same install-through-subscription pattern as everything else. §12 organize: one home for all tenant-purchasable capabilities.

### 7.6.5 New action-kinds (with autonomy tiers)

Extend `paige_action_kinds` with:

- `voice.outbound-customer-call` — 🟡 confirm default (owner approves script + target pre-dial)
- `voice.outbound-internal-call` — 🟡 confirm default (calling internal team members: escalations, approval requests, urgency signal, distance-friendly reach)
- `voice.outbound-internal-call.c_suite` — 🔴 off default (C-suite outreach requires owner-explicit enable; trust here is graduated)
- `voice.inbound-answer` — 🟢 auto default (front-desk greeter picks up + intake)
- `voice.follow-up-call` — 🟡 confirm default (scheduled callbacks)
- `voice.emergency-escalation` — 🟡 confirm default (P0 incidents, immediate approval requests)

All route through the existing `file_action` → `paige-action-worker` → `advance_action` lifecycle (§8, shipped). Same drainer, same audit trail, same approval routing. Zero new architecture — voice is just a new modality on the existing action bus.

### 7.6.6 In-app voice-back (Paige speaks in the chat UI)

- Separate from the phone-call stack — different plumbing, different vendor path.
- New small edge fn `paige-tts` (Cartesia or ElevenLabs for voice quality) that streams Paige's chat responses as audio when the tenant toggles voice-output on.
- Not required for the phone-call features; optional user preference.

### 7.6.7 Cost + billing model

- Voice minutes metered per-tenant, aggregated per billing period.
- Rides the L2 subscription (Lane B money spine) — appears as a line item alongside plan + add-ons.
- Premium plan tiers get more included minutes; overage billed per-minute at a rate lower than Vapi's list price (small margin for the platform).
- Phone-number monthly cost is a separate line item under tenant's L2 subscription.

### 7.6.8 Sequencing when voice gets built (post-cleanup-queue)

Not blocking any current lane. When voice is sequenced (Tier 1 Automations surface phase), the natural slice order:

1. Vapi account setup + first API smoke test
2. Schema extension (`voice_config` on `paige_subagents` + `tenant_phone_numbers` table)
3. First action-kind (`voice.outbound-customer-call` to Sales dept, one path)
4. §32 live: one real outbound call to a test number, transcript captured, autonomy-lane approval flow verified end-to-end
5. Fan out: `voice.inbound-answer` + Client Experience dept
6. Then: `voice.outbound-internal-call` + management-department integration
7. Then: `/admin/phone-numbers` self-service UI + marketplace category
8. Then: `paige-tts` in-app voice-back
9. Then: BYOT-Twilio premium option

### 7.6.9 What this section does NOT change

- No brain-build layer changes. Voice extends what's shipped (`paige_subagents`, `paige_action_kinds`, action bus, drainer, persona resolver, marketplace, L2 billing) — no rearchitecture.
- The cleanup queue sequencing stands. Voice comes AFTER cleanup ships.
- Not in the pitch/prospectus as a current capability until it's actually built and §32-verified live per §7.5.3 honesty check.

---

## 8. Update rule for this doc

- End of every brain-build session: update §1 (state) + §2 (what changed).
- When a prior audit's finding is remediated: mark ✅ in §2, keep the original audit intact.
- When a new "layering" pattern is discovered: add to §3.
- When Antonio surfaces a new ticket list or reorganization: reconcile into §4 (don't create a fresh backlog).
- **Do not rewrite the source audits.** They capture point-in-time state and are still valuable as history.
- **Do not create new handoff docs for tactical fixes** — those go in the Cowork task list. Handoff docs are for cross-session load-bearing work only.

This is an update — a living rollup, maintained here, not re-derived each session.
