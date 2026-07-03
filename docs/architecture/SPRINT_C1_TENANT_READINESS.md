# Sprint C.1 — Non-MMA Tenant Readiness Gate

**Blocker:** onboarding the second tenant. Any one of these silently binds a
new tenant's data to MMA or ships MMA branding to their operators.
**Doctrine anchor:** §199 (Ecosystem Boundaries) + §188 (Tenant vs Platform).
**Target:** all items clear before any non-MMA tenant provisions.

## Ticket queue (execution order)

### Silent leaks — highest urgency (data-integrity risk)

| # | Item | Files | Fix |
|---|------|-------|-----|
| 2C | `paige-mcp` MMA_TENANT_ID fallback removal | `supabase/functions/paige-mcp/index.ts` (L158, 2268, 2285, 2658, 2727, 5036), `supabase/functions/_shared/workflowDispatch.ts` | Replace `MMA_TENANT_ID` with `is_platform_owner(actor)` check + require explicit `tenant_id` for platform actors. Gate `paige_workflow_registry` insert on `is_platform_owner()` instead of tenant equality. |
| 2E | Subagent prompts to tenant config | `supabase/functions/subagent-*/index.ts`, `paige_subagents.system_prompt` rows | Move MMA-specific routing to `tenant_features.subagent_routing_rules` JSONB. Prompt loader hydrates from active tenant. |

### Visible leaks (branding — tenant-facing UI)

| # | Item | Status |
|---|------|--------|
| 5C | Landing hero copy scrub | ✅ shipped |
| 5A/6A | AppSidebar subtitle → tenant name | ✅ shipped (via `useTenantContext().activeTenant.name`) |
| 2F | Auth email sender from `tenant_sender_identity` | Pending — `send-transactional-email` already honors it; audit auth confirm / password-reset paths to route through the same resolver. |
| 2G | Invoice branding from tenant config | Pending — `generate-invoice/index.ts` still uses static "Mogul Maker Academy" strings. Replace with `tenant_legal_profile` lookup keyed by `invoice.tenant_id`. |

### Schema hygiene (breaking cross-tenant reuse)

| # | Item | Fix |
|---|------|-----|
| 1D | `mma_os_btf_deal_id` → `external_deal_ref jsonb` | Migration: add `external_deal_ref jsonb`, backfill `{provider:'mma_os', deal_id: mma_os_btf_deal_id}`, drop old column after 7-day observation. |
| 2A.1 | `mma-campaigns` / `mma-journey` edge functions | Rename to `tenant-campaigns` / `tenant-journey` — Sprint N+2 in flight. |
| 2A.2 | Tenancy-enforcement contract on `tenant-campaigns` / `tenant-journey` | Deferred to own ship — add `x-tenant-id` header requirement, refuse when caller `tenant_id !== body.tenant_id` and caller is not platform owner. |

## Sprint completion checklist
- [ ] Ship #2.6 GDrive-backed export succeeds against `subscription_plans` + `user_subscriptions` (parallel — Sprint C.2)
- [ ] `MMA_TENANT_ID` grep against `supabase/functions/**` returns zero hits outside `_shared/workflowDispatch.ts` (which becomes reference-only)
- [ ] Provisioning a synthetic `test-tenant-c1-verification` writes zero rows into MMA-scoped tables
- [ ] Auth confirmation email to a synthetic tenant user renders that tenant's `from_email` + logo
- [ ] Invoice PDF for a synthetic tenant renders that tenant's legal name / address

## Not in this sprint
- MCC ecosystem exit (Sprint C.3)
- Staleness UI badges (Sprint C.4)
- Landing polish (Sprint C.5)
- Credit monitoring (Ship #3 — contract-blocked)
