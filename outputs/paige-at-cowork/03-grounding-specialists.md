# Grounding Report 03 — Parallel specialists substrate (F03)

**Program:** PAIGE-at-Cowork-Level · **Phase:** 1 · **Flow:** F03 (PAIGE Chief of Staff dispatches 2–4 named
specialists IN PARALLEL, reconciles, reports plain-English with citations) · **Date:** 2026-09-05 · **Base:**
`b0af098`. Repo citations = Explore scout; prod facts = **CC-verified** (Supabase MCP + GitHub MCP).

---

## Headline
The single-specialist dispatch seam is solid and reused; **nothing composes several.** No parallel dispatch,
no reconciliation. Two handoff assumptions are wrong (corrected below). The forge path is safe post-#923.

## EXISTS
- **Forge (authoring, not a runtime dispatcher):** `supabase/functions/subagent-forge/index.ts` (real path —
  **not** `paige-subagent-forge`). Actions `propose|approve|reject|list|disable`; soft proposals auto-ship,
  hard route to `paige_pending_approvals` (`:356-394`). Authority via the shared helper.
- **Authority helper (§18 one home):** `_shared/subagent-authority.ts` `decideSubagentAuthority(caller,
  rowTenantId,noun)` — operator always; `tenant_id IS NULL` → operator-only; `tenant_id=X` → operator or a
  same-workspace admin. This is #923's fix — **CC-verified MERGED 2026-09-04** → on `main` (foundation, not a
  blocker).
- **`paige_subagents` shape (CC-verified on prod):** has `tenant_id` (nullable), `config jsonb`,
  `system_prompt`, `role/goal/backstory/version`, `department`, `daily_invocation_cap`, `monthly_token_cap`,
  `rail_display_name`. **Prod: 24 rows, ALL platform-default (tenant_id NULL), 0 tenant-owned.**
- **`delegate_to_subagent` (single-slug):** MCP tool (`paige-mcp/index.ts:3197-3239`, one `slug`) and chat
  tool loop (`paige-ai-chat/index.ts:10818-10848`, one `slug` → POST `paige-orchestrator {action:"tool_invoke",
  slug,…}`). Orchestrator requires one `payload.slug`, reads one agent §9-scoped, dispatches by runtime
  (`local`/`soft`/`langgraph`), logs one `paige_subagent_invocations` row.

## §13 CORRECTIONS to handoff assumptions
1. **`paige_subagents` has NO `autonomy_lane` column and NO `scope` column** (CC-verified on prod). "Scope" =
   `tenant_id` null/non-null; `autonomy_lane` lives on `paige_action_kinds`/`paige_actions`/`paige_skills`. A
   subagent's cost/quality tier is `config.job_kind` resolved by the model-router. F03 must not assume those
   columns exist on the subagent row.
2. **`paige_agents` does NOT exist** (CC-verified: `to_regclass('public.paige_agents')` = null; 0 migrations).
   The real registry is `paige_subagents`; `paige_agents` is a roadmap C-suite table (#921 design only).

## PARALLEL TODAY? — NO
Single-slug only; the chat tool loop `executeToolCalls` is a sequential `await` for-loop
(`paige-ai-chat/index.ts:7494-7504`) — even two `delegate_to_subagent` calls in one round run one-after-another.
No `Promise.all` fans out subagent dispatch anywhere. No reconciliation step exists.

## BLOCKED-ON
- **PR #921 (PAIGE Agent Registry)** — **CC-verified OPEN/draft, mergeable clean, planning-only** (+2850/-18,
  14 docs), with an explicit **STOP-POINT ("no production implementation until the owner reviews & approves
  the prototype and registry")** and **4 open owner decisions** (finance→MERIT; MASON vs generic Automation
  Agent; OATHEN/SCRIBE names; do named specialists become visible on Solo). F03's **named-VP identity layer is
  gated on your review of #921.** But F03 **mechanics** (parallel dispatch + reconciliation) can be built
  entirely on existing `paige_subagents` slugs today — the C-suite names are a presentation overlay.
- **#923** — MERGED; its tenancy-scope fix is the foundation for safe multi-dispatch.

## NEEDS-BUILDING (delta)
1. **Refactor the orchestrator single-slug body** (`paige-orchestrator` `:539-619`) into a reusable
   `invokeOne(slug,input,ctx,tenantId,fundingEnabled)`, then add a **`tool_invoke_parallel`** action taking an
   array of 2–4 `{slug,input}` run with `Promise.allSettled` — preserving every per-agent gate (§9 tenant
   scope, finance gate, enabled check), one invocation row each (§18 one home).
2. **Extend `delegate_to_subagent`** (or add `delegate_to_specialists`) at both invokers to route a list to the
   parallel action; parallelism lives INSIDE one tool handler (the chat loop is sequential). Keep the
   admin/coach gate + `high` risk class.
3. **Reconciliation layer (entirely new):** normalize 2–4 results, carry each `invocation_id` as the citation
   handle, detect agree/conflict; **agree → ship** a plain-English synthesis with per-claim citations;
   **disagree → escalate to owner** by reusing the forge's existing `paige_pending_approvals` filing (Trust
   Compass Ask-first, §18 — do not invent a new queue).
4. **Optional VP-name overlay** — only if F03 requires named VPs (gated on #921); today attribution is `slug` +
   `rail_display_name`.

## OWNER / PROD QUESTIONS
1. Reconciliation "disagree" threshold (any divergent field vs a material-conflict heuristic) — a Trust Compass
   Ask-first policy call.
2. Does F03 v1 require VP-named specialists (needs #921 approved + `paige_agents` built) or is dispatch-by-slug
   acceptable? (Decides whether #921 is on F03's critical path.)
3. Parallel ceiling (2–4) + per-tenant concurrency/spend cap (today's cap is proposal-only; no invoke-concurrency cap).

## PROD VERIFICATION LEDGER (CC-run, §13)
- `paige_agents` = does not exist. `paige_subagents` = 24 rows, all platform-default, no `autonomy_lane`/`scope`
  column. #923 MERGED; #921 OPEN/draft/clean planning-only. (Supabase MCP + GitHub MCP, 2026-09-05.)
- OWED: §32.c live-drive of a parallel dispatch + reconciliation once built (needs paige-mcp/browser-capable session).
