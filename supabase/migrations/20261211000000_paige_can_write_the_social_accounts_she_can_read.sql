-- PAIGE could read the social accounts on record and not write them.
--
-- ─── THE DEFECT, AND HOW IT GOT PAST EVERYTHING ──────────────────────────────────────────────
--
-- `20261210000000` shipped both halves of the capability and granted them differently:
--
--   get_social_presence_evidence  →  GRANT EXECUTE TO authenticated, service_role
--   record_social_handles         →  GRANT EXECUTE TO authenticated          ← service_role missing
--
-- `record_social_handles` has a deliberate trusted arm for exactly one caller: when `auth.uid()` is
-- NULL it honours the passed tenant, which is how PAIGE's own agent reaches it through `paige-mcp`
-- (`record_social_accounts`, `crm.write`). `paige-mcp` builds its client with
-- `SUPABASE_SERVICE_ROLE_KEY` (`paige-mcp/index.ts:39`), so it executes as `service_role` — which
-- held no EXECUTE. The tool would have failed with `42501 permission denied for function
-- record_social_handles` on its first real call.
--
-- **Nothing in the repo could have caught this.** The rollback proof ran as the migration's own
-- superuser connection, where every grant is satisfied, so all ten assertions passed against a body
-- the intended caller could not enter. `definer-fn-lint` only asks whether `anon`/`PUBLIC` were
-- granted — a missing grant is invisible to it, and correctly so. The contract test asserted the
-- REVOKEs and the `authenticated` grant, because those were the lines that had been written.
--
-- It was found by querying `has_function_privilege` on production after the merge and then
-- reproducing it under `SET LOCAL ROLE service_role`, which returned the 42501 above. That is the
-- §32 rule doing its job one layer further out than usual: a green proof of the LOGIC proved
-- nothing about REACHABILITY, exactly as "it compiled" proves nothing about "it runs".
--
-- ─── WHY A GRANT AND NOT A WIDER CHANGE ──────────────────────────────────────────────────────
--
-- The function's authority is enforced in its BODY, not by this grant (§59). `service_role` gains
-- only what the trusted arm already contemplates and gates: it must still name a workspace, and the
-- arm is reachable only when `auth.uid()` IS NULL, so no JWT caller can ever take that path. `anon`
-- stays revoked. This restores the grant to what the two halves were always meant to share.

GRANT EXECUTE ON FUNCTION public.record_social_handles(uuid, jsonb) TO service_role;

-- Re-asserted rather than assumed: a grant migration is exactly where a REVOKE quietly stops being
-- true, and `anon` holding EXECUTE on a DEFINER function that writes a workspace record is the one
-- outcome that would matter.
REVOKE ALL ON FUNCTION public.record_social_handles(uuid, jsonb) FROM anon;

COMMENT ON FUNCTION public.record_social_handles(uuid, jsonb) IS
  'Records the social accounts a workspace posts from, at tenants.features->social_handles. The '
  'first writer that key has ever had — Systems Check #3 (social_handles_captured) reads it and '
  'nothing could set it. §38 CAPTURE-ONLY: creates no external provider state — no OAuth, no '
  'token, no provider API call, nothing published or scheduled. Merges one key so sibling feature '
  'flags cannot be clobbered. EXECUTE is held by authenticated (the surface, JWT arm) and '
  'service_role (PAIGE via paige-mcp, trusted arm, reachable only when auth.uid() IS NULL); anon '
  'is revoked.';
