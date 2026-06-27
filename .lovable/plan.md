# Customizable Sales Pipeline

Today the Pipeline tab just shows client rows in 4 hard-coded buckets tied to `clients.status`. There are no deals, no custom stages, no value/forecast, no tasks/activities/coach context, and nothing for a subscriber to configure. We'll replace it with a real CRM pipeline.

## What the user gets

### 1. Customizable pipelines & stages (Settings → Pipelines)
- Create / rename / delete multiple pipelines (e.g. "Funding Deals", "Coaching Sales", "Broker Referrals").
- Add, reorder (drag), rename, recolor, and delete stages per pipeline.
- Each stage has: label, color, win probability %, type (open / won / lost), order.
- Set a default pipeline.

### 2. Deals (separate from contacts)
A contact can have many deals. Each deal has:
- Title, value ($), currency, expected close date
- Pipeline + stage
- Linked contact (clients row) + linked coach owner
- Source (manual / referral / ghl / stripe / paige), tags
- Status (open / won / lost), lost reason
- Notes

### 3. Pipeline board (the main view)
- Pipeline switcher in the header.
- Kanban columns = stages, color-banded, with count + stage $ total + weighted forecast.
- Drag deals between stages (writes to DB + logs activity).
- Header strip: total open value, weighted forecast, won this month, avg deal age.
- Filters: owner (coach), value range, close-date range, tag, search.
- "+ New Deal" button (dialog: title, contact picker, pipeline, stage, value, close date, coach).

### 4. Deal detail drawer (slides in on card click)
Tabs inside the drawer so the pipeline is connected to the rest of the CRM:
- Overview — value, stage, probability, close date, owner, contact card, quick-edit
- Activity — timeline from `communication_log` filtered to the linked contact + stage-change events
- Tasks — `tasks` filtered to this deal (create task → due date, assignee)
- Notes — free-form notes saved on the deal
- Coach — assigned coach with "Reassign" picker (writes to `clients.assigned_coach_user_id` + deal.owner)
- Reports link — jumps to /admin/analytics filtered by this pipeline

### 5. Mark Won / Lost
Stage-type "won" auto-marks deal won, captures close date, fires `crm_log_activity`. "Lost" prompts for reason.

## Where it plugs in

- Replaces `src/pages/admin/PipelineAdmin.tsx` entirely.
- New route: `/admin/settings/pipelines` (added to Admin Settings Hub).
- Paige's existing `crm_update_pipeline_stage` tool gets pointed at the new `deals` table (with a fallback to the legacy `clients.status` for unmigrated rows).
- Contact detail page (`/admin/contacts/:id`) gets a new "Deals" tab listing that contact's deals.

## Technical details

New tables (with grants + RLS + service_role policy + admin/coach access):

```text
pipelines(id, name, description, is_default, color, created_by, created_at, updated_at)

pipeline_stages(id, pipeline_id, label, color, order_index,
                probability NUMERIC(5,2), stage_type TEXT
                CHECK in ('open','won','lost'))

deals(id, title, pipeline_id, stage_id, contact_client_id,
      owner_user_id, value_cents BIGINT, currency TEXT DEFAULT 'USD',
      expected_close_date DATE, actual_close_date DATE,
      status TEXT CHECK in ('open','won','lost'),
      lost_reason TEXT, source TEXT, tags TEXT[],
      notes TEXT, created_by, created_at, updated_at)

deal_activities(id, deal_id, type TEXT, summary TEXT,
                actor_user_id, payload JSONB, created_at)
```

RLS: admins full access; coaches see deals where `owner_user_id = auth.uid()` OR they are the assigned coach on the linked contact; service_role full.

Tasks link by adding nullable `deal_id UUID` to `public.tasks`. Communication log already keys off contact, so we filter by `contact_client_id` for the Activity tab.

Seed a default "Funding Deals" pipeline with stages: Lead → Qualified → Proposal → Negotiation → Won / Lost so the board is never empty for new admins.

Frontend:
- `src/pages/admin/PipelineAdmin.tsx` — board + filters + new-deal dialog + drawer
- `src/pages/admin/PipelineSettings.tsx` — pipeline & stage CRUD
- `src/components/admin/pipeline/DealDrawer.tsx` — tabbed detail
- `src/components/admin/pipeline/NewDealDialog.tsx`
- `src/hooks/usePipelines.ts`, `useDeals.ts`

## What I will NOT touch this round

- Existing `clients.status` field stays as-is (legacy compatibility).
- Communications & Tasks pages stay where they are; pipeline pulls from them read-only via the drawer.
- No new edge functions — all reads/writes go through RLS-protected tables.

Approve and I'll ship the migration first (you'll review it), then the UI.
