# Paige Wave 2 — Build Plan

Answers to Antonio's 3 open questions land inline. Doctrine §82, §85, §86 honored: MMA OS = upstream, Paige = pipeline source of truth, no GHL direct reads.

## Answers to open Qs

1. **`clients.tier` column?** No — `lifecycle_stage` exists but uses a different enum (lead/mql/sql/opportunity/customer/...). **Adding `tier` as a separate column** matching MMA OS enum (`lead`, `standard`, `premium`, `vip`, `internal`, `staff`).
2. **`clients.ghl_contact_id`?** No — **adding it**, indexed unique-when-not-null, populated by `upsert_contact_mirror`.
3. **Paige opportunities table?** Named **`deals`** (already in production, Phase pipeline overhaul). Columns: `id, title, pipeline_id, stage_id, contact_client_id, owner_user_id, value_cents, currency, expected_close_date, actual_close_date, status (open|won|lost|abandoned), lost_reason, source, tags[], notes, created_by`. No rename needed — bridge verb `get_opportunities_for_contact` reads from `deals`.

## Database migration

```text
clients
  + tier                  text  (check constraint: lead|standard|premium|vip|internal|staff)
  + ghl_contact_id        text  (unique partial index where not null)
  + last_mirrored_at      timestamptz
  + mirror_source         text  ('mma_os' | 'manual' | 'ghl_legacy')

paige_unassigned_queue   VIEW
  SELECT clients ordered by tier priority, with unassigned_for_hours computed,
  filtered to rows with no active paige_coach_assignments row for lead_owner/cs_primary.

Function: public.auto_assign_on_mirror(client_id uuid)
  - reads tier
  - tier in (premium,vip,internal,staff) → insert assignment role='cs_primary', rep_user_id=NULL
  - tier in (lead,standard,free) → no row (lives in pool)
  - if metadata.assigned_to maps to known Paige user → insert role='lead_owner', rep_user_id=mapped

Trigger: trg_clients_auto_assign  AFTER INSERT on clients WHEN mirror_source='mma_os'
```

## Bridge v15 — new + extended verbs

Add to `supabase/functions/paige-bridge/index.ts`:

| Verb | In/Out | Behavior |
|------|--------|----------|
| `get_coach_for_client` | MMA OS → Paige | Input `{email}`. Returns active assignments `[{role, user_id, email}]` from `paige_coach_assignments` joined to `auth.users`. |
| `get_opportunities_for_contact` | MMA OS → Paige | Input `{email}`. Returns `deals` rows for the matched `clients.id` with stage + pipeline names. |
| `list_modified_clients_since` | MMA OS → Paige | Input `{since: ISO ts, limit}`. Returns `clients` rows where `updated_at > since AND (mirror_source IS NULL OR mirror_source <> 'mma_os')` — i.e. Paige-side edits to mirror back. |
| `notify_admin` (extended) | MMA OS → Paige | Accept `scope: 'global'|'role'|'assigned_user'`, `scope_role`, `assigned_user_id`. Persist to `paige_admin_notifications` (add `scope`, `scope_role`, `assigned_user_id` columns). |
| `upsert_contact_mirror` (extended) | MMA OS → Paige | Accept `tier`, `ghl_contact_id`, `custom_fields`, `assigned_to_email`. Sets `mirror_source='mma_os'`, `last_mirrored_at=now()`. Auto-assignment trigger fires. |

## RLS scoping (Q3 hybrid)

`clients` SELECT policy rewrite:
- super_admin / admin / coach → all
- sales_rep → assigned (lead_owner) OR unassigned in tier IN ('lead','standard') OR same-tier read-only
- cs_rep → assigned (cs_primary) OR tier IN ('premium','vip','internal','staff')
- viewer / linked_user → own row only

## Unassigned queue + SLA alerts

`paige_unassigned_queue` view (super_admin + admin always; reps scoped to their tier).
Edge cron `unassigned-sla-watcher` (later wave) fires `notify_admin` when VIP > 24h or Premium > 72h.

## What we won't do this wave

- Round-robin auto-distribution (deferred per Q1)
- GHL direct pulls (deprecated per §86)
- Mirror MMA OS `customer_profiles` into Paige (read on-demand via future bridge GETs, not denormalized)
- SLA watcher cron (Wave 3)

## Verification

- `psql \d clients` shows new columns
- Hit `paige-bridge` with each new verb using `PAIGE_BRIDGE_API_KEY`, expect 200 + shape
- Insert a test client with `mirror_source='mma_os'` + `tier='vip'` → assignment row auto-created
