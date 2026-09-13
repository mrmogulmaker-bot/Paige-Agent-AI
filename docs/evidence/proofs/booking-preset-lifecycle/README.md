# Booking-preset lifecycle — server-seam proof (§32)

A faithful local-Postgres replay of migration `20270301000000_calendar_booking_preset_lifecycle.sql`
against the real `calendars`/`calendar_hosts` DDL (+ CHECK constraints) and verbatim authority helpers.
Prod MCP is permission-denied from the build session, so this is the pre-merge behavioral proof; prod
persisted-apply is owed via `deploy-migrations.yml` on eventual merge.

## Run
```
createdb presettest
cat harness.sql ../../../../supabase/migrations/20270301000000_calendar_booking_preset_lifecycle.sql assertions.sql \
  | psql -v ON_ERROR_STOP=1 -d presettest
```
Expect: `==== ALL PRESET-LIFECYCLE ASSERTIONS PASSED ====`, 41 PASS, 0 fail, exit 0.

## What it proves (18 assertion groups)
Draft-by-default (enabled=false, creator-host); member self-create; cross-tenant create refused (42501);
slug collision (23505); publish refused with no window / round_robin with 1 host (22023); publish live +
idempotent (keeps published_at); pause keeps published_at (Paused ≠ Draft); update config-only
(enabled/published_at/slug immune to patch injection); §59 caller scope across authenticated /
cross-tenant owner / platform-admin / service-role (trusted only for the named tenant) / plain member;
not-found (P0002); migration backfill; tenant-scoped read + derived lifecycle; and the public resolver's
exact `enabled=true` gate admitting neither a Draft nor a Paused preset.
