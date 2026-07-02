# Doctrine §198 — Legacy Data Deprecation Protocol

**Status:** Ratified 2026-07-02 · **First application:** Ship #2.6 (legacy MMA `subscription_plans` + `user_subscriptions`)

## Principle

**Never single-command destructive migrations on data that has ever held customer information.** Every legacy table drop follows the four-phase pattern below, each phase gated by an independent manual trigger with an operator review window between phases.

## The Four Phases

| # | Phase | Trigger key | Side effects | Reversible? |
|---|---|---|---|---|
| 1 | **Export** | `export_only` | Snapshot rows → CSV → cold storage (Google Drive `MMA-Legacy-Archive/YYYY-MM/`) | N/A (read-only) |
| 2 | **Integrity Check** | `check_dependencies` | Enumerate FKs, RLS policies, edge fn / MCP tool references | N/A (read-only) |
| 3 | **Freeze** | `freeze_writes` | `REVOKE INSERT, UPDATE, DELETE` from all roles. `SELECT` stays. Snapshot row counts. Audit row: `ship_<n>.freeze_writes` | Yes — re-GRANT |
| 4 | **Drop** | `drop_tables` | `DROP TABLE ... CASCADE`. Audit row: `ship_<n>.drop_tables` | **No** — PITR only |

## Non-negotiable gates

- **Manual trigger per phase.** No auto-progression. No cron. No "run all phases" shortcut.
- **Two-key confirmation on destructive phases.** Freeze and Drop require `confirm_phrase = "SHIP_<N>_<PHASE>"` in addition to `super_admin` auth.
- **Minimum 7-day freeze observation window.** Drop phase rejects if the most recent freeze audit row is younger than 7 days. Override requires `_force=true` **and** a written approval trail.
- **Row-invariant check at drop.** Row counts at drop-time must equal the freeze snapshot. Drift = something wrote after freeze → investigate, don't drop.
- **Point-in-time recovery timestamp logged before drop.** `paige_audit_log` action `ship_<n>.drop_tables` captures `dropped_at`, `freeze_snapshot`, `final_counts`, `forced`. This is the PITR anchor if a rollback is ever needed.
- **Super-admin only.** All RPCs assert `user_roles.role = 'super_admin'` via `SECURITY DEFINER` helper.

## Standard file layout

```
supabase/functions/ship-<n>-legacy-cleanup/index.ts   ← orchestrator (dispatches to RPCs)
docs/security/DOCTRINE_198_LEGACY_DEPRECATION.md      ← this file
```

DB-side: four `SECURITY DEFINER` RPCs prefixed `ship_<n>_` — `_assert_super_admin`, `_check_dependencies`, `_freeze_legacy_tables`, `_drop_legacy_tables(_force)`.

## Ship #2.6 specifics

- Targets: `public.subscription_plans`, `public.user_subscriptions` (MMA operational leakage — pre-dates the platform/tenant boundary)
- Export destination: Google Drive `MMA-Legacy-Archive/2026-07/`
- Data must be handed off to MMA's own rails (Skool + GHL) **before** freeze.
- Ship #2.6 runs independently of Ship #3 (credit monitoring). Antonio chooses ordering.

## What §198 explicitly forbids

- Single-migration `DROP TABLE` on any table that has ever held rows tied to a real customer.
- Renaming legacy tables in place instead of exporting + dropping them. Renaming preserves cross-schema noise and re-scopes the wrong data model.
- Skipping export because "we can always restore from backup." PITR is a last resort, not a workflow.
