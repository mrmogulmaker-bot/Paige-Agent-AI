-- THE RECEIPT SEAM LOST ITS LOCK TO AN OVERLOAD.
--
-- `public.record_capability_run` is the one write path into `paige_workspace_events`, a table
-- that is otherwise sealed: FORCE ROW LEVEL SECURITY, and `REVOKE ALL ... FROM PUBLIC,anon,
-- authenticated` (20261201000200:17-20). The SECURITY DEFINER functions are the ONLY way in.
-- That lockdown is the defence, and it is load-bearing.
--
-- The 6-argument signature was locked correctly, twice:
--   20261212000000:491-493  REVOKE ALL ... FROM PUBLIC,anon,authenticated; GRANT ... TO service_role
--   20261220000000:265-267  (identical, after a redefinition)
--
-- Then 20270107000000:94 created a TEN-argument overload — four optional trailing params for
-- correlation and detail. An overload is a NEW `pg_proc` entry, not a replacement, so it did not
-- inherit the older signature's ACL. That migration issues no GRANT and no REVOKE for it. Its one
-- ACL statement (:90) is for a different function, `_record_workspace_rail_event`.
--
-- With no ACL of its own, the new signature falls to PostgreSQL's default for functions:
-- EXECUTE TO PUBLIC. In this database PUBLIC includes `anon` and `authenticated`, and PostgREST
-- exposes `public`-schema functions to both. A caller supplying all ten named arguments binds to
-- this overload unambiguously, so the still-revoked 6-arg function does not shield it.
--
-- WHY NOTHING CAUGHT IT. The migration's own header says "existing grants and callers unchanged"
-- (20270107000000:23-24) — true of the existing grants, and irrelevant to the new function. The
-- §9/§37 guard `scripts/ci/definer-fn-lint.mjs` matches an EXPLICIT `GRANT ... TO anon|public`;
-- an implicit default grant is invisible to it. And name-level auditing reports this function as
-- ACL'd, because the NAME is — only a signature-level check surfaces it.
--
-- AS OF THIS COMMIT THAT GUARD IS STILL BLIND. An earlier draft of this header said the guard "is
-- widened in the same change that lands this migration", which was a promise, not a fact, and a
-- promise has no business inside a migration whose whole subject is a claim that stopped being
-- true. Widening it is the next commit on this branch; until that lands, `definer-fn-lint` would
-- not catch a second overload shipped the same way.
--
-- THE REPO ALREADY KNEW. 20261201000800:542-543, thirty-seven days earlier, on the sibling writer:
--   "LOAD-BEARING. DROP FUNCTION above discarded the ACL and the recreated function defaults to
--    PUBLIC EXECUTE. Without these two lines `anon` can reach the trusted service-caller branch."
--
-- WHAT THE BODY DOES NOT DO. It never calls `auth.uid()`. Its only caller-shaped check asks
-- whether the actor named in the argument is an active member of the tenant named in the argument
-- (20270107000000:133-138) — it constrains the SUBJECT, not the CALLER, and both values arrive
-- from the request. So an ungated caller who knows any active (tenant_id, user_id) pair could
-- write a receipt attributing any capability key, any outcome including `capability_succeeded`,
-- and up to 16KB of `_detail` — and `_record_workspace_rail_event` broadcasts the forged row to
-- that tenant's Rail subscribers live via `realtime.send`.
--
-- THE FIX IS THE GRANT, AND THAT IS THE RIGHT FIX HERE (§59). Normally "the grant is never the
-- guard" — but that rule is about functions reachable by `authenticated`, which must re-prove the
-- caller in-body (`record_rail_event` is granted to `authenticated` and therefore carries a full
-- `auth.uid()` + server-resolved-tenant guard, 20261201000800:399-447; it is the class-A model).
-- This function is service_role-only by design, matching the 6-arg posture that shipped and was
-- accepted. A service-role caller is trusted by construction and `auth.uid()` is NULL for it, so
-- an in-body auth check would refuse every legitimate caller. The grant IS the boundary here,
-- which is precisely why its absence was the hole. No in-body change is made.
--
-- SAFE WHICHEVER STATE PRODUCTION IS IN. Prod SQL access was not available to the session that
-- found this, so `pg_proc.proacl` was never read back; the finding rests on migration source plus
-- PostgreSQL's documented default plus the in-repo comment above confirming this team has observed
-- that default in this database. These two statements are correct either way — a no-op if the
-- signature is somehow already sealed, the fix if it is not. They are idempotent and re-runnable.
--
-- STILL OWED, and not claimed here: a `pg_proc.proacl` readback confirming the applied state, by a
-- session with production SQL access.

REVOKE ALL ON FUNCTION public.record_capability_run(
  uuid, uuid, text, text, uuid, text, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_capability_run(
  uuid, uuid, text, text, uuid, text, text, uuid, text, jsonb)
  TO service_role;

-- The 6-argument signature is re-asserted, not because it is known to have drifted, but because
-- both signatures still exist (no DROP FUNCTION for either appears in any migration) and a reader
-- checking this seam's posture should find both answers in one place rather than three files.
REVOKE ALL ON FUNCTION public.record_capability_run(uuid, uuid, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_capability_run(uuid, uuid, text, text, uuid, text)
  TO service_role;
