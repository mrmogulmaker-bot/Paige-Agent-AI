-- §34 L1 — Observability: additive working-context capture on paige_llm_trace (owner item #489).
--
-- WHY (owner #489 — DISPLAY ITEMIZATION, not a leak fix, not a writer bug):
--   The paige-ai-chat trace writer stamps the caller's OWN persona-context tenant on each row via
--   get_paige_persona_context()'s fallback chain. When the owner is signed into their AGENCY and
--   working across a SUB-ACCOUNT, the persona tenant resolves to the owned agency, so a row's
--   tenant_id is the agency. That per-row attribution is HONEST. The only gap is READABILITY: the
--   operator cannot see WHICH sub-account an agency-scope session was actually working on. This
--   column captures the caller's ACTUAL active workspace so the operator Intelligence surface can
--   itemize it beneath the workspace label. Attribution (tenant_id) is UNCHANGED.
--
-- WHAT CHANGES (additive, backward-compatible):
--   One nullable column, working_context_tenant_id. The paige-ai-chat writer sets it to the caller's
--   own active_tenant_id (SERVER-DERIVED from the authenticated user's profile, never a body-supplied
--   id — §9). Every other producer leaves it unset, so it defaults to NULL. No existing column, index,
--   grant, policy, or row is touched.
--
-- SOFT REFERENCE — deliberately NO foreign key, consistent with the tenant_id soft-ref posture set in
--   20260720020000: an observability row must never be LOST because its working-context id is not a
--   live tenants row (a since-deleted sub-account, or a platform/system context). The writer coerces
--   any non-uuid to NULL before insert (cleanTenantId), so a malformed id cannot throw a cast error
--   into the (swallowed) detached insert.
--
-- SECURITY / PII:
--   §9  server-derived only — the value is the authenticated caller's OWN active workspace id, read
--       from their profile; never trusted from the request body. It is a tenant id, not member/client
--       PII, and is operator-tier legitimate (the operator already sees the fleet + hierarchy).
--   §34 pure Supabase Postgres; no vendor substrate.
--
-- Idempotent; ADDITIVE only.

ALTER TABLE public.paige_llm_trace
  ADD COLUMN IF NOT EXISTS working_context_tenant_id uuid;

COMMENT ON COLUMN public.paige_llm_trace.working_context_tenant_id IS
  'Additive (owner #489): the caller''s OWN active workspace tenant id, server-derived from the authenticated user profile and captured for operator display itemization (which sub-account an agency-scope session was working on). SOFT reference — no FK; coerced to NULL by the writer if non-uuid. Distinct from tenant_id, which holds the persona-context attribution. No member/client PII.';
