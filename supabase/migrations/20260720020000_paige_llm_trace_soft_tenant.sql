-- §34 Layer 1 fix — make paige_llm_trace.tenant_id a SOFT reference.
--
-- paige_llm_trace is an APPEND-ONLY LLM observability store; a trace must NEVER be silently lost
-- because its tenant_id isn't a row in `tenants`. The original hard FK
-- (tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE) caused two data-loss modes, both
-- HIDDEN by the writer's best-effort swallowing catch (llm-trace.ts) — the §13/§32 anti-pattern of a
-- correct-looking write that silently drops rows:
--
--   1. An INSERT whose tenant_id is a well-formed uuid NOT present in `tenants` — a God/platform/operator
--      context that threaded an id instead of NULL, a sub-account/agency id not stored in `tenants`, or a
--      since-deleted tenant — raised foreign_key_violation (23503) → the trace vanished with zero signal.
--      PROVEN in prod (a bogus-tenant insert returns 23503), and it specifically kneecaps the L7 God-view
--      observability §34 is building toward.
--   2. ON DELETE CASCADE erased a tenant's ENTIRE trace history the instant the tenant row was deleted —
--      exactly wrong for an audit/observability store whose whole job is durable history.
--
-- Fix: drop the FK, keep the column for correlation (a soft reference). §9 tenant isolation is UNCHANGED —
-- it is enforced by RLS, which does not depend on the FK:
--   • paige_llm_trace_service     (service_role full access)
--   • paige_llm_trace_tenant_read (USING tenant_id IS NOT NULL AND tenant_id = current_user_tenant_id())
-- NULL still means a platform/system row, invisible to every tenant. A stray/wrong tenant_id was never
-- guarded by the FK anyway (any real tenant's id passes it); cross-tenant reads are prevented by RLS, not
-- referential integrity. The writer (llm-trace.ts) additionally coerces empty/malformed ids to NULL so a
-- non-uuid can't throw a 22P02 cast error into the same swallowed catch.
--
-- Idempotent and safe on both prod (constraint present) and a fresh DB (IF EXISTS). Pure Postgres (§34).
ALTER TABLE public.paige_llm_trace DROP CONSTRAINT IF EXISTS paige_llm_trace_tenant_id_fkey;

COMMENT ON COLUMN public.paige_llm_trace.tenant_id IS
  'Soft correlation id (no FK): NULL = platform/system row (invisible to tenants via RLS). An observability '
  'trace is never dropped or cascade-deleted because its tenant is missing/removed. Reads are scoped by RLS.';
