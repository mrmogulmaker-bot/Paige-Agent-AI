# Governed CRM/Pipeline operational access — release candidate

Date: 2026-09-13
Status: source-complete release candidate; NOT SHIPPED; authenticated/deployment proof owed.

This delivery completes one canonical Paige CRM path across the shared capability catalogue, trusted `crm-command` Edge door, action-risk/autonomy decision, existing single-use confirmations, service-only `execute_crm_command`, canonical CRM/Pipeline writes, durable readback, capability receipt/Rail, and persistent Chat result cards.

## Two separate release truths

### Callable CRM actions after merge and deployment

Subject to trusted tenant/membership resolution, the stored autonomy lane, exact role/risk decision, and explicit confirmation where required, Paige will expose these 32 canonical command actions through `crm-command`:

- Contacts: `contact.create` (`crm_create_contact`), `contact.update` (`crm_update_contact`), `contact.archive` (`crm_archive_contact`), `contact.restore` (`crm_restore_contact`), `contact.link_company` (`crm_link_contact_company`), `contact.unlink_company` (`crm_unlink_contact_company`), `contact.assign_coach` (`crm_assign_coach`), `contact.assign_owner` (`crm_assign_contact_owner`), `contact.merge` (`crm_merge_contacts`), `contact.hard_delete` (`crm_hard_delete_contact`), and `contact.bulk_update` (`crm_bulk_update_contacts`).
- Companies: `company.create` (`crm_create_company`), `company.update` (`crm_update_company`), `company.archive` (`crm_archive_company`), and `company.restore` (`crm_restore_company`).
- Deals/Pipeline: `deal.create` (`deal_create`), `deal.update` (`crm_update_deal`), `deal.assign_owner` (`crm_assign_deal_owner`), `deal.assign_contact` (`crm_assign_deal_contact`), `deal.move` (`deal_move_stage`), `deal.close` (`crm_close_deal`), `deal.reopen` (`crm_reopen_deal`), and `deal.delete` (`crm_delete_deal`).
- Tasks: `task.create` (`crm_create_task`), `task.update` (`crm_update_task`), `task.assign` (`crm_assign_task`), `task.reschedule` (`crm_reschedule_task`), `task.complete` (`crm_complete_task`), `task.reopen` (`crm_reopen_task`), `task.cancel` (`crm_cancel_task`), and `task.delete` (`crm_delete_task`).
- Activities: `activity.log` (`crm_log_activity`) records an internal note/call/meeting/email/SMS activity. It never sends an email or SMS, places a call, or schedules a meeting.

High-risk commands remain approval-required even if a tenant stored a more permissive autonomy preference: contact coach/owner changes, contact merge/hard-delete/bulk update, deal owner/contact assignment, deal close/reopen/delete, and task assignment/cancel/delete. No command is production `LIVE` merely because it appears in this source candidate; merge, migration/Edge deployment, exact deployment identity, and the remaining runtime proof gates still apply.

### CRM activity observation/listening

`activity.log` is a write and is not listening. PR #1234 does not implement a tenant-safe observer for CRM notes, calls, meetings, logged email/SMS activity, task changes, deal changes, or pipeline movement. General CRM activity observation/listening is therefore **UNAVAILABLE / PROOF OWED**, not `LIVE` or `PARTIAL`.

Fresh `main` does contain the narrower `contact.event_status` / `contact_event_status` read. It is `PARTIAL` and reports only durable `contact.created` native-event and subscriber-delivery state through `public.get_contact_event_status`; it is not a general CRM activity listener.

**FIRST DEDICATED CRM FOLLOW-ON:** extend the shared `paige_native_events` / `paige_event_dispatches`, existing `paige_automations` subscriber, Orchestration, Spine/Gateway, and Rail seams with tenant-safe CRM activity observation. Do not add a polling loop, parallel activity model, or uncontrolled auto-action path. Observation begins read-only; any downstream mutation must re-enter the canonical Gateway, risk, authority, and approval path.
It covers contact/company CRUD and relationships; deal creation/edit/assignment/move/outcome/reopen/delete on the canonical Pipeline model; task CRUD/status/assignment; internal activity logging; contact merge and hard delete; and exact-set bulk contact update. All referenced tenant, actor, role, membership, owners, assignees and targets resolve or validate server-side. Model schemas contain none of those authority fields.

High-risk previews bind immutable target/version/dependency facts. Merge refuses conflicting portal identities and unsupported dependencies. Hard delete refuses dependent/portal contacts. Bulk execution refuses changed target versions. Identical idempotent replay returns the durable result; changed-payload replay refuses. Receipt or readback failure rolls back the transaction.

Chat success cards are derived from the executor result, persisted in the existing `bundle_ref`, and offer only the exact route or surface route returned by the server. Activity cards state that no email/SMS was sent, no call placed and no meeting scheduled.

Proof: the focused CRM/Chat/Pipeline/Gateway and rendered-card suite passes 77/77 locally; production build, action-risk, tool-catalogue, migration-version and SECURITY DEFINER checks pass. The current PR #1234 PAIGE Spine run is the authoritative fresh-migration database/RLS proof and is configured to exercise all 81 assertions in `supabase/tests/governed_crm_commands.sql`; its final status belongs to the PR check record rather than this source document. Authenticated tenant, rendered UI, and deployment proof remain owed. Do not add this candidate to the shipped log until the exact deployed SHA passes those gates.
