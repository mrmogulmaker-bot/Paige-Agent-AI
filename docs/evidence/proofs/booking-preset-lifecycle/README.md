# Booking-preset lifecycle + duplicate/archive/restore — server-seam proof (§32)

A faithful local-Postgres replay of the two preset-seam migrations —
`20270301000000_calendar_booking_preset_lifecycle.sql` (Draft→Publish→Pause) and
`20270302000000_calendar_preset_duplicate_archive_restore.sql` (Duplicate·Archive·Restore, S1) —
against the real `calendars`/`calendar_hosts` DDL (+ CHECK constraints) and verbatim authority helpers.
Prod MCP is permission-denied from the build session, so this is the pre-merge behavioral proof; prod
persisted-apply is owed via `deploy-migrations.yml` on eventual merge.

## Run
```
createdb presettest
cat harness.sql \
    ../../../../supabase/migrations/20270301000000_calendar_booking_preset_lifecycle.sql \
    ../../../../supabase/migrations/20270302000000_calendar_preset_duplicate_archive_restore.sql \
    assertions.sql \
  | psql -v ON_ERROR_STOP=1 -d presettest
```
Expect: `==== ALL PRESET-LIFECYCLE ASSERTIONS PASSED ====`, 95 PASS, 0 fail, exit 0.
The captured run is in `transcript.txt`.

## What it proves (34 assertion groups, T1–T34)
**Lifecycle (T1–T24):** Draft-by-default (enabled=false, creator-host); member self-create; cross-tenant
create refused (42501); slug collision (23505); publish refused with no window / round_robin with 1 host
(22023); publish live + idempotent (keeps published_at); pause keeps published_at (Paused ≠ Draft); update
config-only (enabled/published_at/slug immune to patch injection); §59 caller scope across authenticated /
cross-tenant owner / platform-admin / service-role (trusted only for the named tenant) / plain member;
not-found (P0002); migration backfill; tenant-scoped read + derived lifecycle; the shared publish bar and
the update auto-pause gate; and the public resolver's exact `enabled=true` gate admitting neither a Draft
nor a Paused preset.

**Duplicate/Archive/Restore (T25–T34):** duplicate makes a fresh DRAFT with copied config + host pool +
a registered creator (T25), refuses a taken slug (23505, T26), refuses a non-manager of the source
(42501, T27), and honors service-role trusted-tenant + creator rules (T28); archive sets `archived_at` +
`enabled=false` (off the air), is idempotent, and forces the public resolver's `enabled` gate to refuse it
(T29); an archived preset is FROZEN — publish and update both raise the tagged `PRESET_ARCHIVED` (T30) —
and a non-manager cannot archive/restore (T30b); restore clears `archived_at`, keeps `enabled=false`
(returns to Paused, never straight to Live), and re-enables edit + re-publish (T31); a never-published
archived draft restores to Draft (T32); `get_calendar_presets` exposes `archived_at` and derives the
`archived` lifecycle with precedence (T33); and service-role archive/restore is trusted for the named
tenant, refused on a mismatch (T34).
