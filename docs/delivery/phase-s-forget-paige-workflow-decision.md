# `forget_paige_workflow` — compatibility decision (owner-required, Phase S)

**Status: DECISION ITEM FOR THE OWNER. Phase S neither defines, replaces, nor removes this RPC.**
The owner ruled (2026-09-14): *"Treat the missing forget_paige_workflow definition as a separately proven
compatibility decision: determine its intended contract before defining, replacing, or removing anything.
Do not hide an undefined dependency in the migration."* This doc is that determination; the Connected MCP
Gateway migration (`20270319000000`) deliberately does not touch it.

## The finding (grounded)

- **It is CALLED but has no SQL definition.** `supabase/functions/paige-n8n/index.ts:323`:
  ```ts
  // Registry cleanup; if the RPC is absent, a subsequent list resync drops the ghost.
  await admin.rpc("forget_paige_workflow", { _tenant_id: tenantId, _n8n_workflow_id: body.workflow_id })
    .then(() => {}, () => {});
  ```
  It runs only after a **permanent n8n delete** of a workflow. Errors are swallowed. A repo-wide search
  finds **no `CREATE FUNCTION public.forget_paige_workflow`** anywhere in `supabase/**` — so today the call
  is a **silent no-op**.
- **It is NOT an undetected bug — it degrades gracefully by design.** The call-site comment states the
  intended fallback: the next `sync_tenant_workflows(_tenant_id, _workflows)` run reconciles the registry
  and marks any workflow no longer present in n8n as `present_in_n8n = false`
  (`supabase/migrations/20260711260000_tenant_workflows_registry.sql`). So a deleted workflow's "ghost" row
  is cleaned on the next list/sync even with `forget_paige_workflow` absent.
- **Its intended inverse exists:** `record_paige_workflow(_tenant_id, _n8n_workflow_id, _name)` (same
  migration, `:79`, service_role only) tags a Paige-authored workflow into `public.tenant_workflows`
  (PK `(tenant_id, n8n_workflow_id)`).

## Intended contract (derived, not invented)

`forget_paige_workflow(_tenant_id uuid, _n8n_workflow_id text)` — the inverse of `record_paige_workflow`:
after a workflow is permanently removed from a tenant's n8n, drop or mark its registry row for that exact
`(tenant_id, n8n_workflow_id)` so the registry does not surface a ghost **before** the next resync.
`SECURITY DEFINER`, `service_role`-only (same posture as `record_paige_workflow`), idempotent (no-op if the
row is already gone).

## Options

| # | Option | Effect | Cost / risk |
|---|---|---|---|
| **A** | **Define it** (recommended, as a *separate* tiny slice) — a `service_role` DEFINER fn that sets `present_in_n8n = false` (matching sync semantics) for the row, or deletes a `created_by_paige` row. | Immediate registry cleanup on permanent delete instead of waiting for the next resync. | Low. One small migration + a §37 check that `paige-n8n` is the only caller. Not a gateway concern. |
| **B** | **Remove the dead call** at `paige-n8n/index.ts:323`. | Removes the undefined-RPC call. | Loses the author's forward-compat intent; the ghost then lingers until resync with no explicit cleanup hook. Not recommended. |
| **C** | **Leave as-is**, documented. | No change; relies on the resync fallback (which already works). | Zero. The known-absence is benign and now recorded here rather than hidden. |

## Recommendation

**C now, A as a separately-tracked follow-up** — the absence is benign (resync cleans the ghost), so it is
**not a Phase S blocker and Phase S leaves it untouched**. If the owner wants immediate cleanup, Option A is
a small, separate slice owned by the n8n/registry lane (not the gateway), with its own §37 producer check.
Either way, the dependency is now **surfaced, not hidden** — which is what the ruling required.

**Owner decision requested:** A (define, separate slice) · B (remove call) · C (leave as-is, documented).

## Owner decision — 2026-09-14: **C** (leave as-is in Phase S; Option A tracked as a separate follow-up)

The owner ruled: *"For forget_paige_workflow, choose C: leave the existing graceful resync fallback unchanged
in Phase S and record the define/remove decision as a small separate compatibility follow-up."*

- **Phase S outcome:** the Connected MCP Gateway migration (`20270319000000`, merged as `6c745007`) left this
  RPC and its call site **untouched** — no define, no replace, no remove. The dependency is **surfaced here,
  not hidden in the migration** (which is what the 2026-09-14 ruling required). The resync fallback continues
  to clean any ghost row on the next `sync_tenant_workflows` run, exactly as today.
- **The define/remove decision is now its own tracked follow-up: issue
  [#1260](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/1260)** — Option A (define the tiny
  `service_role` `SECURITY DEFINER` cleanup fn), owned by the **n8n / workflow-registry lane**, not the MCP
  gateway workstream, with its own §37 producer check. It is a compatibility nicety (immediate cleanup vs
  next-resync cleanup), **not** a blocker for anything shipped in Phase S.
