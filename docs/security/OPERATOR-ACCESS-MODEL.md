# Operator access model — which account operates the platform

**Owner decision (2026-07-23). Standing operating fact, not a bug.**

## The rule

**Operate the Paige Agent AI platform from `admin@paigeagent.ai`.** That is the
Paige Agent AI LLC platform-owner identity — the account correctly designed to
reach every operator surface (Fleet / Tenants, Platform Team, Platform Settings,
operator dashboards, intelligence, sends). It is the sole `super_admin` and the
`app_settings_owner.owner_email`.

**Personal / agency accounts are tenant identities, not operator identities.**
`mrmogulmaker@gmail.com` (personal) and `mogulmakeracademy@gmail.com` (MMA tenant)
are sub-accounts under the Project Mogul Enterprise Agency. They carry tenant-level
roles (e.g. `admin`, `coach`) and are **correctly denied** operator surfaces. Keep
`mrmogulmaker@gmail.com` as the tenant-experience test identity — appropriate role
separation, not a throwaway.

## Why (§9 clean seam)

1. The Paige Agent AI LLC operator identity must not be a Project Mogul Enterprise
   Agency sub-account — mixing them blurs the entity boundary §9 exists to protect.
2. Mirrors the pattern already applied at Meta app setup (a dedicated Paige-specific
   account, separate from the personal one).
3. Zero code, zero migration, zero risk — it is an identity choice, not a defect.

## How the gate actually works (verified live on prod 2026-07-23, ref `xygzykjyynhzqytbqnzu`)

All three access functions are **row-based** on live prod (there is no JWT-email
owner definition in effect):

```
is_platform_admin()  → EXISTS(user_roles WHERE role IN ('platform_admin','super_admin'))
is_super_admin()     → EXISTS(user_roles WHERE role = 'super_admin')
is_platform_owner()  → SELECT is_super_admin()          -- row-based alias
```

Because a `super_admin` row satisfies all three, the operator account passes every
operator gate (RLS + SECURITY DEFINER RPCs). A tenant-role account passes none of
them. There is **no `is_platform_admin` vs `is_platform_owner` drift** — the two
agree.

| account | roles | is_platform_admin / is_super_admin / is_platform_owner |
|---|---|---|
| `admin@paigeagent.ai` (operator) | admin, **super_admin** | ✅ / ✅ / ✅ — passes everything |
| `mrmogulmaker@gmail.com` (tenant/test) | admin, coach | ❌ / ❌ / ❌ — correctly denied |

## Operating discipline (applies to all owner-run work)

Before assuming access on any operator surface, **verify which account you are
signed in as.** Cross-tenant / cross-role identity confusion is exactly the class
of subtle bug §9 is designed to prevent. If an operator surface denies you, the
first check is *which identity am I?* — not *is the gate broken?*

## Provenance

Reclassified from #437 ("platform OWNER denied operator surfaces —
is_platform_admin vs is_platform_owner drift"), which was **INVALID**: the premise
did not reproduce at the DB layer. The denial the owner saw was correct behavior on
a tenant-role account, not a gate defect. Grounding audit resolved two contradictory
scout reports against live-prod ground truth before any fix was written; the
recommended fix was reclassification, not a migration.

**Verified closed (owner live walk, 2026-07-23).** Signed in as `admin@paigeagent.ai`
(super_admin), the operator surfaces render fully: `/admin/platform/tenants` (Fleet
Console — 8 active tenants, real fleet data) and `/admin/platform/settings` (feature
flags). The shell is unambiguously distinct — an `OPERATOR` pill in the branding, a
separate operator nav family, and a top-right workspace switcher for operator↔tenant
context without re-auth. No denial. #437 is closed as INVALID.
