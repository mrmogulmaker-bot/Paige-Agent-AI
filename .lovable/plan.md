
# Contacts Hub Upgrade Plan

## What's missing today
The contacts list lets you change lifecycle and reassign coach inline, but everything else (name, email, phone, business, title, funding goal, tags, DNC, lead score, source, notes) is read-only. There's no bulk anything, no quick-log, no merge, no delete, and no way to add a deal or task from the detail page header. Tags appear but can't be edited from the UI — they only exist if seeded by intake/imports.

## Build order (one ship, ~6 sections)

### 1. Editable contact — full inline editor
- Add `EditContactDialog.tsx` covering: first/last name, email, phone, business name, title, source, funding goal, lifecycle stage, assigned coach, DNC toggle, tags (chip input with autocomplete from existing tags), and a free-text "current notes" field.
- Wire **Edit** button into both the contact list row (icon button next to Open) and the ContactDetail header.
- All writes flow through a single `updateContact(id, patch)` helper in `src/lib/contacts.ts` with optimistic UI + toast.

### 2. Tag system — first-class
- New helper component `TagPicker.tsx` (combobox + create-new) reused inside Edit dialog, bulk-action menu, and a new "Tags" cell action in the list.
- Seed a starter palette of suggested tags ("BTF Active", "BTF Lead", "VIP", "Premium", "Cold", "Hot Lead", "Needs Follow-Up", "Funded", "Churn Risk", "Coach Required") via `src/lib/contactTags.ts` so the dropdown isn't empty on a fresh install.
- Tags persist to `clients.tags text[]` (already exists) — no migration.

### 3. Bulk actions toolbar
- Checkbox column + "select all on page" in the list.
- Floating bulk bar appears when ≥1 selected: **Assign coach**, **Set lifecycle**, **Add tag**, **Remove tag**, **Mark DNC**, **Export selected**, **Delete**.
- Delete uses a guarded confirm dialog and a new `delete_contact` Cloud function (admin-only, blocks if linked_user_id has live BTF workspace).

### 4. Quick-log + quick-create from contact detail
- Header gains a **"+ Log"** menu (Call, Email, SMS, Meeting, Note) → inserts into `communication_log` with the right channel/message_type.
- Header gains **"+ Add task"** (opens task dialog pre-filled with this contact) and **"+ New deal"** (jumps to pipeline pre-filled).

### 5. Saved views + smart segments
- A row of preset chips above the table: **My Coachees**, **Unassigned**, **Hot Leads (lead_score ≥ 70)**, **Stale (no touch 30d+)**, **BTF Active**, **DNC**, **Churned**. Each is a one-click filter combination.
- Filter state syncs to URL search params so views are shareable.

### 6. Duplicate detection + merge (lightweight)
- A "Possible duplicates" banner appears on ContactDetail when another contact shares the same email or phone.
- One-click **Merge into…** picker that calls a new `merge_contacts` Cloud function which moves deals, tasks, notes, files, and communication_log to the surviving record and soft-deletes the loser.

## Bonus polish (cheap)
- Show `lead_score` as a colored chip in the list.
- Show `do_not_contact` as a red ribbon on the detail header.
- "Last touch" cell becomes a tooltip with the actual date.
- CSV export respects bulk selection if any rows are selected.

## Technical notes (devs only)

```
src/
  lib/
    contacts.ts             ← add updateContact, deleteContact, mergeContacts, applyTags
    contactTags.ts          ← suggested tag palette
  components/admin/contacts/
    EditContactDialog.tsx   ← new
    TagPicker.tsx           ← new
    BulkActionsBar.tsx      ← new
    QuickLogMenu.tsx        ← new
    DuplicatesBanner.tsx    ← new
  pages/admin/
    ContactsAdmin.tsx       ← add selection, bulk bar, edit launcher, smart segments
    ContactDetail.tsx       ← header edit/log/task/deal buttons, dup banner, DNC ribbon
supabase/functions/
  delete-contact/           ← admin-guarded hard delete
  merge-contacts/           ← move children, soft-delete loser
```

No schema changes required — `clients` already has `tags`, `lead_score`, `do_not_contact`, `source`, `current_notes`. Only two new edge functions and no migrations.

## Out of scope (call out separately)
- Custom fields per tenant (would need a `contact_custom_fields` table) — flag this as a Phase 2 ask.
- Email/SMS sending from the contact page — already covered by the existing campaign + paige-mcp `send_transactional_email` tools; we'll just link to them rather than rebuild.
