# Doctrine §200 — Platform Independence from Reference Tenant

**Status:** Active
**Codified:** 2026-07-02
**Supersedes framing of:** §188 (Tenant vs Platform Primitives), §199 (Ecosystem Boundaries)
**Related:** §118 (Master Tenant), §158 (Platform Owner), §189 (Feature Flags)

---

## The Principle

MMA is a tenant. Specifically, MMA is the **MASTER TENANT** with legitimately elevated capabilities per §118 and §158. But **Paige Agent AI is the PLATFORM** — its code, defaults, prompts, domains, and reference implementations must be **tenant-neutral**. MMA's elevated status flows through tenant configuration + master tenant capability grants, **never** through platform-level defaults or hardcoded assumptions.

## The Hierarchy

1. **Platform Owner** (Antonio) — §158 global cross-tenant powers.
2. **Paige Agent AI** — the platform itself (tenant-neutral, vendor-neutral, exit-ready).
3. **Master Tenant** (MMA) — elevated status per §118, brand and config in `tenant_configuration` table.
4. **Sub-Tenants** — standard capabilities per §189 feature flags.

## The Thought Experiment (PR review checkpoint)

> "If MMA became a regular sub-tenant tomorrow (still active, still paying, just without master tenant elevation), would the platform still work correctly?"

If **no** → MMA has leaked into platform primitives. **Extract** to tenant config or master tenant capability grant.

## Reframing Sprint C.1

We are **NOT** "removing MMA from platform." We **ARE** "moving MMA's tenant config OUT of platform defaults INTO MMA's `tenant_configuration` record." The same mechanism will populate sub-tenant configs on onboarding.

## Practical Rules

1. **Development reference tenant** = `test-tenant-189-verification`, never MMA. Test-tenant-189 lacks master-tenant elevation — that is the point.
2. **Feature specs** are written for generic tenant archetypes AND explicitly note when a feature requires master-tenant elevation (should be rare).
3. **Weekly grep sweep** flagging platform-code violations (see `platform-independence-sweep` edge function):
   - `/mma[_-]/i` in filenames or code (excluding tenant-config paths)
   - `"Mogul Maker"` or `"mogul-maker"` hardcoded strings
   - `BTF` in platform primitives (§188 already covers this)
   - `Skool` in platform code (belongs in MMA tenant config)
   - Hardcoded MMA `tenant_id` UUIDs in platform code
   Every match → `paige_admin_notifications` (severity: high). Justification required: (a) tenant_config path, (b) explicit master-tenant-only capability grant, or (c) violation to fix.
4. **Non-MMA login smoke test** every ship. Log in as `test-tenant-189-verification`, use the affected feature for 5 min. Any friction = platform default leak = fix before merge.
5. **Documentation archetypes** must match the landing page: Fitness Business Coaches Academy, Business Funding Brokers Group, Elite Credit Advisors.
6. **All tenant-specific config** lives in `tenant_configuration` (or `master_tenant_capabilities` for elevated grants), never in platform code.

## Enforcement

- Weekly cron: `platform-independence-sweep` edge function.
- PR template: `docs/PULL_REQUEST_TEMPLATE.md` §200 checklist.
- Security memory one-liner injected at every scanner run.
