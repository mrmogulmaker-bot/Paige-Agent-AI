# Platform-operator tenant (§200) — the operator's own system workspace

The god/platform actor (the `PAIGE_MCP_PLATFORM_KEY` bearer, and any service-role caller
with no user JWT) has no tenant of its own. It used to be pinned to a hardcoded
`MMA_TENANT_ID` constant — which had gone **stale/phantom**: that UUID
(`a25194e0-…`) no longer matched any tenant row, so every god-key tenant-scoped
operation resolved to a non-existent tenant (verified: **zero** rows ever landed there).
That is the exact §200 platform-independence failure — one tenant's id baked into a
code path shipped to the whole platform.

## What shipped (code — this PR)

A config-as-data seam (§18/§10) resolves the operator's designated system tenant instead
of a hardcoded id:

- **`_shared/platform-operator-tenant.ts`** — `platformOperatorTenantId(admin)` reads
  `admin_app_settings` key `platform_operator_tenant_id` (a bare JSONB string scalar),
  UUID-validates it, and returns it — or **`null`** when unset / malformed / on a read
  error. It **fails closed**, never falls back to the phantom or any default, never
  throws, and TTL-caches (60s on a hit, 10s on unset-null, never on an error).
- **3 consumers moved onto the seam (§37 lockstep, same commit):**
  1. `paige-mcp` `actorTenantId()` platform branch → `platformOperatorTenantId(admin)`.
     Undesignated ⇒ `null` ⇒ the ~56 `if (!tenantId) return err("tenant_not_resolved")`
     sites already fail closed (strictly safer than pinning to a phantom).
  2. `paige-mcp` `resolveMarketplaceActor` guard → compares the god actor's resolved
     tenant against the operator tenant (was `!== MMA_TENANT_ID`).
  3. `_shared/workflowDispatch.ts` §118 provider gate (n8n / langgraph_bridge =
     platform-owner-only) → compares `callerTenantId` against the resolved operator
     tenant. **Restrict-don't-open:** the operator-tenant compare is a plain `!==`
     *inside* the block, so an unset (null) operator tenant keeps a real (truthy)
     tenant caller blocked; a god caller (callerTenantId=null) and the cron sweeper
     (callerTenantId=undefined) bypass via the precondition, unchanged.

The phantom literal is deleted from all runtime code. **Behavior is unchanged until an
operator tenant is designated** — god-key tenant-scoped ops just fail closed honestly
(`tenant_not_resolved` / `provider_restricted_to_platform_owner`) instead of targeting a
phantom.

Guard: the designation key is safe. `admin_app_settings` RLS is `is_platform_owner()`
on both read and write (verified live), so a tenant admin can never self-designate their
tenant as the operator. The helper's read uses the service-role client (RLS-bypassing),
which is correct.

## Verification (§32)

- **Headless smoke — SHIPPED:** `scripts/platform-operator-tenant-smoke.mts` exercises the
  real resolver against a programmable mock admin: valid UUID resolves; unset / object /
  non-UUID / read-error all return `null`; error is never cached; cache-hit doesn't
  re-query. 12/12 pass. Plus grep proves `MMA_TENANT_ID` / the phantom literal are gone
  from runtime.
- **Edge deploy:** merge to `main` → `deploy-edge-functions.yml` redeploys `paige-mcp`
  and every function importing the changed `_shared` files, and moves the `edge-live` tag.
  Confirm `git diff edge-live..origin/main -- supabase/functions` is empty afterward.
- **Owed to a capable/Cowork session (auth-gated, no headless browser here):** after
  designation, a god-key `tools/call` to a tenant-scoped read (e.g. `marketplace_browse`)
  resolves against the operator tenant (returns items/empty, not `tenant_not_resolved`);
  before designation the same call returns `tenant_not_resolved` (fail-closed-honest).

## Designating the operator system tenant (one-time prod-data step — NOT in this PR)

This is a data operation, not schema (no migration seeds it, §18). It needs a **fresh
dedicated auth user** because the live `provision_tenant` RPC is `auth.uid()`-gated,
agreement-gated, and enforces one top-level tenant per owner — so it cannot run from
service-role alone, and the operator's own uid already owns the MMA tenants. Run it via a
capable session (Supabase dashboard / GoTrue admin API for STEP 1; MCP `execute_sql` for
STEP 3–4):

1. **Create a dedicated system auth user** (owns no top-level tenant), e.g.
   `paige-operator-system@<ops-domain>`, `email_confirm: true`. Capture its uid as
   `:SYSUID`. This is the workspace owner-of-record — **not** the God/super_admin account,
   **not** the `paige-platform-defaults` registry tenant (§9-clean).
2. **Resolve the current standalone agreement** (don't guess, §15):
   `SELECT slug, version FROM public.legal_documents WHERE is_current AND slug ILIKE 'saas%' ORDER BY slug;`
   Pick the standalone-lane row → `:AGR_SLUG` / `:AGR_VER`.
3. **Provision through the real seam** by impersonating `:SYSUID` in one transaction
   (prove it first with `BEGIN … ROLLBACK`, then `BEGIN … COMMIT`):
   ```sql
   BEGIN;
   SELECT set_config('request.jwt.claims', json_build_object('sub','<:SYSUID>','role','authenticated')::text, true);
   SELECT set_config('request.jwt.claim.sub', '<:SYSUID>', true);
   SELECT auth.uid();  -- MUST return :SYSUID; if NULL, abort (impersonation failed)
   SELECT id, slug, account_type FROM public.provision_tenant(
     _name              := 'Paige Operations',
     _industry          := 'consulting',
     _team_size         := '1-10',
     _description       := 'Platform-operator system workspace (dogfood, coaching-generic, §9-clean).',
     _account_type      := 'standalone',
     _agreement_slug    := '<:AGR_SLUG>',
     _agreement_version := <:AGR_VER>
   );
   COMMIT;
   ```
   Coaching-generic name/industry, zero finance/credit wording (§2). Capture id → `:OPTENANT`.
4. **Designate it** (service-role write; `admin_app_settings` write is `is_platform_owner()`-gated):
   ```sql
   INSERT INTO public.admin_app_settings (key, value, updated_by, updated_at)
   VALUES ('platform_operator_tenant_id', to_jsonb('<:OPTENANT>'::text), '<OPERATOR_SUPER_ADMIN_UID>', now())
   ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
   ```
   `to_jsonb(text)` stores the bare JSON string scalar the helper expects. `updated_by` =
   the operator's real super_admin uid (attribution).

Then run the §32 post-designation god-key check above. Warm isolates pick up a fresh
designation within ~10s (unset-null TTL) or on next `paige-mcp` redeploy.

Once designated, the operator dogfoods Conversations / uploads / Studio in **their own
system workspace** instead of resolving to a phantom (or MMA's business account). Wiring
that workspace's live email connector is a separate, outward-facing step.
