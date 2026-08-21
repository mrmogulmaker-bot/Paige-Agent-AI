# PAIGE Vibe Studio — repository reconciliation and integrity gate

**Date:** 2026-08-21  
**Scope:** repository policy definitions reconciled against the supplied read-only production audit for Supabase project `xygzykjyynhzqytbqnzu`. No production DDL or data mutation was performed.

## Decision

The real Studio must **not** be mounted broadly inside the tenant redesign until the production policy drift is resolved and authenticated multi-user tests pass. The public prototype remains bridge-backed and labels Studio **Live but incomplete**.

## Repository evidence

The repository's intended policy shape is narrower than the supplied production finding:

- `studio_sessions` has a restrictive tenant wall plus a permissive SELECT for session owner, tenant admin, platform owner, or tenant template. Authenticated INSERT/UPDATE/DELETE grants are revoked; mutations travel through gated RPCs.
- `studio_artifact_versions` has the same restrictive tenant wall plus a SELECT joined to a parent session owned by the caller or visible to a tenant admin. Direct authenticated writes are revoked.
- Therefore, the reported production `PERMISSIVE ALL` policies on these two tables are not part of the current repository's declared design. If present live, they are migration/catalog drift and may widen SELECT through Postgres' permissive-policy OR semantics.

The repository also confirms additional cleanup targets:

- `studio_library_items` and `studio_deliverable` define tenant-manager `FOR ALL` policies without an explicit `TO authenticated` clause, and separate `auth.role() = 'service_role'` policies.
- `studio_visual_critique_log` has an explicit authenticated tenant-read policy plus a service policy using `auth.role()`.
- Service-role policies are unnecessary in the normal Supabase posture because service role bypasses RLS; their exact live role/grant posture must be proven before removal.
- The private `studio-deliverables` bucket policies allow active members of the tenant folder to read/manage objects. That may be the intended tenant collaboration model, but it is broader than per-session ownership and must be accepted explicitly.

## Why no blind corrective migration was authored

The supplied audit identifies the **shape** of extra production policies but not their live policy names or complete expressions. This checkout has no authenticated Supabase metadata session. Dropping policies by guessed name—or dynamically deleting every `ALL` policy—would be an unsafe authorization change without authenticated multi-user proof or a confirmed collaboration decision.

Instead, `scripts/audit-studio-rls.sql` is checked in as a read-only catalog proof. It returns:

1. RLS and grants for all five Studio tables;
2. every policy's roles, command, permissiveness, `USING`, and `WITH CHECK`;
3. a must-be-empty findings set for permissive `ALL` on sessions/versions, `{public}` targets, and `auth.role()` expressions;
4. private/public bucket metadata;
5. all `studio-deliverables` object policies.

## Required remediation sequence

1. Run the read-only audit against production and save the output as review evidence without row payloads or PII.
2. Decide and document the collaboration rule: owner-only, owner+tenant-admin, or tenant-wide for non-template sessions and private deliverables.
3. Generate a migration with the repository's configured Supabase CLI workflow; do not invent a migration timestamp.
4. Drop the exact widening policy names proven by the catalog and recreate policies with explicit roles.
5. Replace deprecated `auth.role()` service policies only after confirming `FORCE ROW LEVEL SECURITY` and service behavior.
6. Run authenticated tests with two ordinary users in one tenant, an admin in that tenant, a user in another tenant, and a platform operator.
7. Verify signed URL expiry, cross-tenant object denial, tenant-switch cache invalidation, and no transcript/scratchpad leakage.
8. Only then mount the real Studio family inside the redesign.

## Required security assertions

| Actor | Session/list expectation | Version expectation | Private deliverable expectation |
|---|---|---|---|
| Session owner | Own sessions + tenant templates | Versions for own sessions | Approved collaboration scope only |
| Same-tenant ordinary user | Templates only unless collaboration is explicitly enabled | No other-owner versions | No other-owner objects unless tenant-wide collaboration is approved |
| Tenant admin | Tenant oversight per doctrine | Tenant oversight | Explicitly approved admin oversight |
| Different-tenant user | No rows | No rows | No object or signed URL |
| Platform operator | Only through documented operator/effective-actor rules | Audited access | Audited signed access |
| Service role | Headless PAIGE seam only; tenant must be named and logged | Same | Private storage; never expose service credentials |

## Integration classification

- Shell and interaction architecture: **Live code, not mounted in redesign**.
- Session persistence: **Connected substrate with supplied evidence of production use**.
- Artifact versions: **Connected substrate, lightly used in supplied audit**.
- Library, deliverable ledger, critique log: **Schema/UI/function present; production lifecycle unproven**.
- Learning and publishing: **Real seams; authenticated end-to-end completion owed**.
- Redesign Studio: **Front-end design plus one temporary same-tab bridge**.
