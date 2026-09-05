# Grounding Report 01 — Runtime headroom substrate (F01)

**Program:** PAIGE-at-Cowork-Level · **Phase:** 1 · **Flow:** F01 (PAIGE dispatches a long-running task
OUTSIDE the chat turn, monitors it, reports back honestly next turn) · **Date:** 2026-09-05 · **Base:**
`b0af098`. Repo citations = Explore scout; prod facts = **CC-verified** (Supabase MCP, ref `xygzykjyynhzqytbqnzu`).

---

## Headline
The in-turn ceiling is **45s**, not the handoff's ~180s. A **complete** dispatch→poll→result loop already
exists (`dispatch-queued-workflow-runs`) but is **gated off** and unscheduled. F01 is mostly a
wiring/activation job, and it collides with two open PRs that own the exact file it must touch.

## EXISTS
- **In-turn budget = 45s** (not 180s): `paige-ai-chat/index.ts:11080` `MAX_ROUNDS=5, MAX_TOTAL_TOOL_CALLS=12,
  WALL_CLOCK_MS=45_000`; enforced `:11484`, break `:11552`. (~180s is the Supabase edge platform wall-clock —
  `paige-ai-chat` has **no `config.toml` entry**, so it defaults `verify_jwt=true` with no per-fn timeout;
  confirm the exact platform ceiling on prod — Owner Q1.) Reply persisted post-stream via
  `EdgeRuntime.waitUntil` (`:4520,:11845,:11863,:12142`).
- **Model seam:** chat uses `gatewayCompat("anthropic",…)` from `_shared/claude.ts` (NOT `model-router.ts`);
  turn model is an inline ternary gemini-2.5-pro/flash (`:11561,:11578`).
- **Tool dispatch:** bounded round loop `:11077-11080`, `executeToolCalls` `:11504`, per-tool switch.
- **Autonomy gate:** `resolveToolAutonomy` (`:7346`) → RPC `resolve_tool_autonomy(_tenant_id,_tool_key)`
  (safe default `confirm`); **CC-verified live on prod** (`resolve_tool_autonomy(uuid,text)`). Confirm/approval
  via SHA-256 fingerprint → `paige_pending_confirmations`.
- **Background-job patterns (the shape out-of-turn work takes):**
  - **`systems-check-run-scheduled`** — canonical: pg_cron → `net.http_post` w/ `x-cron-token`
    (`20260816150000_…cron.sql:29-42`); `verify_jwt=false` (`config.toml:420-421`); in-fn gate accepts
    service-role bearer OR `x-cron-token` (`_shared/systems-check-http.ts:135-143`); bounded batch.
  - **`paige-action-worker`** — action-bus drainer; cron `*/2`; atomically claims via `claim_filed_actions`
    (`FOR UPDATE … SKIP LOCKED`); invokes orchestrator w/ 55s AbortController; **drafts only, never sends**;
    stale-claim self-heal after 10 min.
  - **`dispatch-queued-workflow-runs`** — a COMPLETE dispatch→poll→result loop (claim, dispatch, poll remote
    `get_run`, flip to terminal w/ `result`+`completed_at`, dead-letter on exhaustion, honest `ok`). **GATED
    by `WORKFLOW_EXECUTION_ENABLED`**; returns `503 workflow_execution_disabled` naming two **missing
    contracts: `budget_or_cost_control` and `trust_compass_autonomy_consult`**; **no cron schedules it**.
- **Outcome-read surfaces a next turn can read:** `paige_workflow_runs` (**CC-verified prod: exists, 0 rows,
  status CHECK = `queued|running|succeeded|failed|cancelled`** — so the scout's feared repo-vs-prod CHECK
  mismatch does NOT exist on prod, §13 correction), `paige_subagent_invocations` (has a `'dispatched'`
  in-flight state), `capability_run` via `record_capability_run(...)` (**CC-verified live**: signature
  `(uuid,uuid,text,text,uuid,text)`) with an honest `capability_outcome_unknown` outcome for
  "dispatched-no-result."

## BLOCKED-ON
1. **`WORKFLOW_EXECUTION_ENABLED` + its two missing contracts.** Reusing the built loop requires supplying
   `budget_or_cost_control` and `trust_compass_autonomy_consult` — **the latter directly couples F01 to
   F04** (the dispatch path must consult Trust Compass). Owner ruling: reuse-the-gated-loop vs
   build-a-narrower-ungated job path.
2. **No cron schedules the sweeper**, and it isn't in `config.toml`.
3. **PR collision on `paige-ai-chat/index.ts`** — **#576** (Chat Runtime Correctness Phase 0,
   `claude/paige-chat-runtime-correctness`) and **#591** (Active-tenant Knowledge isolation,
   `claude/kb-active-tenant-retrieval`) both own edits to this file on **stale bases**, both OPEN/draft
   (**CC-verified**). #576 lands `runGeneralDocumentExtraction` + two sibling ReferenceErrors. F01 must NOT
   re-implement — it must sequence AFTER #576/#591 land (or rebase onto them), or it will collide/regress.
   This is Week-1 T1.2 (reconcile #591/#576/#4).
4. **Agent 1's queue** (#37/#36/#32/#41/#42/#43/#44) — Week-1 T1.1 waits; DO NOT build ahead (§0.3).

## NEEDS-BUILDING (delta)
1. **Job envelope.** Prefer a dedicated F01 job table with an explicit `deadline`/budget column over
   inheriting `paige_workflow_runs`' gate — or reuse `paige_workflow_runs` (prod CHECK already fits) if the
   gate is lifted. `{tenant_id, actor_specialist_slug, capability_key, payload, callback, deadline, status,
   result, error}`.
2. **Fire-and-forget dispatch tool** in the chat turn (autonomy-gated via `resolveToolAutonomy`) that INSERTs
   the job and returns immediately — never awaits inside the 45s loop.
3. **Out-of-turn executor + callback:** activate `dispatch-queued-workflow-runs` (cron + gate + 2 contracts)
   OR add a `paige-action-worker`-style drainer with the standard cron-token/service-role gate; write terminal
   `status/result/error/completed_at` + an honest `record_capability_run` (incl. `capability_outcome_unknown`).
4. **Next-turn honest read-back** in `paige-ai-chat` (net-new): read the job's terminal row (RLS-scoped by
   `triggered_by_user_id`/tenant) and narrate truthfully — success/failure/**unknown** — per the honesty
   discipline already in `_shared/mcp-outcome.ts`.
5. **Budget/deadline primitive** — none exists for cross-turn jobs (AbortController is per-call only). Add a
   per-job `deadline` + stale-claim self-heal (10-min window, cf. `claim_filed_actions`).

## OWNER / PROD QUESTIONS
1. Confirm the actual Supabase edge wall-clock for `paige-ai-chat` on prod (F01's "outside the turn" boundary).
2. Are `FEATHERLESS_API_KEY` / `GROQ_API_KEY` set on prod? (Determines if the cheap tier is genuinely
   dead-by-config — Agent 1 #32 — or live. No tool here reads edge-secret presence; owner/CI confirm.)
3. Reuse the gated `dispatch-queued-workflow-runs` loop (supplying budget + Trust Compass consult, coupling to
   F04) vs a narrower ungated F01 job path? (§18 one-home ruling.)
4. Which job store: `paige_workflow_runs` vs `paige_subagent_invocations` vs a new F01 table?

## PROD VERIFICATION LEDGER (CC-run, §13)
- `paige_workflow_runs`: exists · **0 rows** · status CHECK `queued|running|succeeded|failed|cancelled`
  (no mismatch). `record_capability_run(uuid,uuid,text,text,uuid,text)` live. `resolve_tool_autonomy(uuid,text)`
  live. (Supabase MCP, 2026-09-05.)
- OWED: edge wall-clock value; prod env-secret presence for cheap-tier keys; §32.c live-drive of a full
  dispatch→next-turn-report once built.
