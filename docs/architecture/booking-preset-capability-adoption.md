# Booking-preset Chat capability — adoption contract (hand-off to the Chat owner)

**Status: ADOPTED (E5, 2026-09-13). Shared SERVER seam LIVE; Chat wiring landed on branch
`claude/calendar-paige-e5` / PR #1220 (DRAFT — held for the owner's separate release decision).**
Authored 2026-09-13 alongside the booking-preset Draft→Publish lifecycle. This was the precise,
self-contained contract for wiring the booking-preset capabilities into the Chat handler — so the
Calendar-preset work did NOT duplicate Chat infrastructure (owner ruling 2026-09-13; §10, §18).

**What E5 actually wired (and two refinements to the plan below, made after grounding the REAL
`campaign_brief_*` pattern rather than this doc's first guess):**
- Registered `CALENDAR_PRESET_CAPABILITIES` in `paige-spine/registry.ts`; added the 7 mutating
  `booking_preset_*` rows to `action-risk.ts` (publish/revise/archive = `high`, create/pause/
  duplicate/restore = `ordinary`); spread `CALENDAR_PRESET_TOOLS` into the handler; dispatched each
  tool to its canonical RPC through a new `_shared/calendar-preset-tenant-brain.ts`; added the 7
  keys to `list_tool_autonomy` (migration `20270303000000`); added the `WRITE_TARGET` + `TOOL_LABELS`
  + `toolCallLabel` entries; taught `action-risk-lint.mjs` the new imported catalog.
- **Refinement 1 — Rail:** the doc said add the tools to `RAIL_ACTION_TOOLS`. The real
  `campaign_brief_*` pattern does NOT; it records the Rail run via a `recordRun` callback
  (`recordCapabilityRun`) injected into the tenant-brain, AFTER a verified readback. E5 mirrors that
  (cleaner, more governed, less handler surface). `RAIL_ACTION_TOOLS` is untouched.
- **Refinement 2 — idempotency:** the calendar RPCs take no command-ledger key, so there is no
  `idempotency_key` injection (the doc's step 6 note). Execute-once for the confirm lane is the
  generic confirmation-fingerprint claim (`paige_pending_confirmations`); the Rail `runId` is a
  per-tool-call `stableRunId` so a confirmed-call retry folds to one row. Create/duplicate are not
  slug-idempotent by design (a private draft is reversible), as this doc already stated.
- **Honest verification bound (§13/§32):** `get_calendar_presets` is a COARSE projector, so readback
  verification is strict on the fields it exposes (title/type/duration/capacity/lifecycle/archived)
  and, for finer revise fields it does not project, bounded to "persisted + RPC accepted" — the
  result note says so rather than claiming a field changed that could not be confirmed.

## What is already shipped (the shared server seam — the thing both UI and Paige call)

Migrations `20270301000000_calendar_booking_preset_lifecycle.sql` (create/update/publish/pause/list)
and `20270302000000_calendar_preset_duplicate_archive_restore.sql` (duplicate/archive/restore + the
archived guard + the `archived` lifecycle) — eight `SECURITY DEFINER` RPCs, `REVOKE`d from anon,
`GRANT`ed to `authenticated` + `service_role`, each with §59 in-body caller scope (an authenticated
caller must satisfy `can_manage_calendar` / tenant membership; a service-role caller is trusted only
for the tenant it names). Proven by a local-Postgres replay of 34 assertion groups / 95 checks, 0 fail
(§59 tenant scope across authenticated / cross-tenant / service-role / platform-admin / plain member,
draft-by-default, publish validation, pause-keeps-`published_at`, patch-injection immunity, lifecycle
derivation, and the S1 duplicate/archive/restore + archived-frozen matrix, T25–T34).

| RPC | Purpose | Notes |
|---|---|---|
| `create_calendar_preset(_tenant uuid, _slug text, _patch jsonb, _created_by uuid)` → `jsonb` | Create a **private draft** (`enabled=false`, `published_at=NULL`); registers the creator as host 0. | Applies a fixed column allowlist from `_patch`; `enabled`/`published_at` can never be set from `_patch`. |
| `update_calendar_preset(_cal uuid, _patch jsonb, _tenant uuid)` → `jsonb` | Partial config update (only keys present in `_patch`). | Never touches `enabled`/`published_at`/`slug`/`tenant_id`. |
| `publish_calendar_preset(_cal uuid, _tenant uuid)` → `jsonb` | The ONLY seam that sets `enabled=true`. Revalidates: enough hosts for the model (2+ for round_robin/collective), an open window, a usable method. | Refuses with `22023` + a specific message (`PRESET_NEEDS_HOSTS` / `PRESET_NO_HOURS` / `PRESET_NO_METHOD`). Converges (idempotent), preserves original `published_at`. |
| `pause_calendar_preset(_cal uuid, _tenant uuid)` → `jsonb` | `enabled=false`, keeps `published_at` (so Paused ≠ Draft). | Reversible via publish. |
| `duplicate_calendar_preset(_cal uuid, _new_slug text, _new_title text, _tenant uuid, _created_by uuid)` → `jsonb` | Copy an existing preset's config + host pool into a NEW **private draft** (`enabled=false`, `archived_at=NULL`); registers the creator as host. | (S1, migration `20270302000000`) Authority = manage-the-SOURCE; `23505` on slug collision. |
| `archive_calendar_preset(_cal uuid, _tenant uuid)` → `jsonb` | Set `archived_at`, force `enabled=false` (off the air). Idempotent. | (S1) Preserves `published_at`; the resolver's `enabled` gate keeps it unbookable — no resolver change. |
| `restore_calendar_preset(_cal uuid, _tenant uuid)` → `jsonb` | Clear `archived_at`, keep `enabled=false` → returns to Draft/Paused (never Live). | (S1) Re-publishing is a separate explicit step. |
| `get_calendar_presets(_tenant uuid)` → `TABLE` | Tenant-scoped read: id, slug, title, type, duration_min, capacity, enabled, published_at, **archived_at**, host_count, derived `lifecycle` (draft/live/paused/**archived**). | The truthful-readback path. |

The public `/book/:slug` resolver already gates on `enabled=true`, so a Draft, Paused, or Archived
preset is never publicly bookable (`public-booking/index.ts`; archive forces `enabled=false`). An
archived preset is FROZEN — `update_/publish_calendar_preset` raise `PRESET_ARCHIVED` (22023). Nothing
above sends, connects a provider, or
mints a meeting link.

## The adoption artifact (ready, NOT yet registered)

`supabase/functions/_shared/paige-spine/domains/calendar_preset.ts` exports:
- `CALENDAR_PRESET_CAPABILITIES` — eight `SpineCapability` consts (create, revise, publish, pause, list,
  and the S1 duplicate, archive, restore).
- `CALENDAR_PRESET_TOOLS` — the eight model-facing tool JSON defs (authored compact so the
  `chat-tool-registry` lint does not read them as inline hand-wired tools).

It is deliberately **not** in `PAIGE_SPINE_CAPABILITIES` yet: the validator forces `chatBinding:"LIVE"`
for a mutating capability, which is only true once the handler actually declares + dispatches the
tools. Register it in the SAME change that wires the handler (below), never before — otherwise the
registry asserts a chat-live binding that does not exist (§13).

## Adoption steps — all in ONE change (they are coupled by CI)

1. **Register the domain.** In `paige-spine/registry.ts`, import `CALENDAR_PRESET_CAPABILITIES` and
   spread it into `PAIGE_SPINE_CAPABILITIES` (remove the "ready to adopt" note there). The registry
   validator already accepts these entries (verified: `paige-capability-gateway.test.ts` passes with
   them present).
2. **Classify risk.** In `_shared/action-risk.ts` add — `["booking_preset_publish","high",…]`,
   `["booking_preset_revise","high",…]` (a revise can change a LIVE client-facing page),
   `["booking_preset_archive","high",…]` (archiving a Live page takes it out of service — outward),
   `["booking_preset_create","ordinary",…]` (private draft), `["booking_preset_pause","ordinary",…]`
   (reversible), `["booking_preset_duplicate","ordinary",…]` (private draft copy),
   `["booking_preset_restore","ordinary",…]` (returns to Draft/Paused, exposes nothing). Confirm the
   `high` set against the `IRREVERSIBLE_OR_OUTWARD` classifier when registering. `booking_preset_list`
   is a read — do not classify it. `lint:action-risk` is bidirectional: these entries must land in the
   same change as the handler declarations, or it fails.
3. **Declare the tools via the adapter, not inline.** Spread `CALENDAR_PRESET_TOOLS` into the handler
   through the Chat-owner adapter seam (the same path `campaign_brief_*` uses). The
   `chat-tool-registry` lint fails a new inline `name:` literal — enter through the gateway spread.
4. **Dispatch each tool → its RPC** in the handler dispatch switch, with the mapping below. Resolve
   `_tenant` from the server-derived active tenant (NEVER a tool arg); never accept a tenant/slug from
   the model.
5. **Autonomy catalogue.** Add the SEVEN mutating tool keys (create, revise, publish, pause, duplicate,
   archive, restore) to `list_tool_autonomy` in a new migration (the `lint:tool-catalogue` requirement —
   an operator must be able to see/flip/disable them), with an operator label and a category from the
   existing set. Add them to `MUTATING_TOOLS` + `TOOL_RESULT_IS_RECEIPT` where the handler requires, and
   to `RAIL_ACTION_TOOLS` + the row mapping so a genuine success mirrors to the Rail (FU-3).
6. **Confirm loop.** `publish`, `revise` and `archive` are `high` → the rendered approval card whose
   fingerprint travels in the request body; `create`, `pause`, `duplicate` and `restore` are `ordinary`
   → the compact confirm. Never a model-asserted "they said yes" for the `high` ones (the platform
   already enforces this).

### Tool → RPC argument mapping

| Chat tool | RPC | Mapping (server fills `_tenant` from the session; never from the model) |
|---|---|---|
| `booking_preset_create` | `create_calendar_preset` | `_slug = slugify(name) + "-" + randomSuffix()`; `_patch = { type: model, title: name, duration_min?, capacity?, description? }` — plus, to match a UI-created draft's working defaults, `availability_json` = Mon–Fri 09:00–17:00, `location_options = [{type:"phone",value:null}]`; `_created_by =` caller uid. Result is always a Draft. |
| `booking_preset_revise` | `update_calendar_preset` | `_cal = presetId`; `_patch =` only the provided fields (partial). Read `booking_preset_list` first for the id. |
| `booking_preset_publish` | `publish_calendar_preset` | `_cal = presetId`. On a `22023` refusal, report the exact returned reason — do NOT claim it went live. |
| `booking_preset_pause` | `pause_calendar_preset` | `_cal = presetId`. |
| `booking_preset_duplicate` | `duplicate_calendar_preset` | `_cal = presetId`; `_new_title = name ?? "<source> (copy)"`; `_new_slug = slugify(_new_title) + "-" + randomSuffix()`; `_created_by =` caller uid. Result is always a private Draft copy. |
| `booking_preset_archive` | `archive_calendar_preset` | `_cal = presetId`. `high` — confirm before archiving a Live page. |
| `booking_preset_restore` | `restore_calendar_preset` | `_cal = presetId`. Returns to Draft/Paused; never re-publishes. |
| `booking_preset_list` | `get_calendar_presets` | no args; returns the tenant's presets + derived lifecycle (incl. `archived`). |

### Honesty / authority constraints the wiring MUST preserve (§13, owner 2026-09-13)

- Paige may **propose** a template or custom setup, **create/edit/duplicate a draft** after the owner
  approves the exact configuration, **show a truthful readback** (from `get_calendar_presets`),
  **pause/archive** (archive with the `high` approval card since it takes a Live page out of service)
  and **restore** with confirmation, and **propose publishing** only once the configuration is complete.
  Restore never re-publishes; archive/restore write only after a fresh readback confirms the state.
- Paige must **never** silently publish a booking page, connect a provider, send invitations, create
  external events, or make a provider meeting link from conversational text. Publishing is its own
  explicit, confirmed, server-validated step.
- The three seams stay distinct: internal appointment (`calendar_book_meeting` →
  `create_internal_booking`), public booking preset (this), provider connection (Settings OAuth).

## Cross-references
`docs/architecture/paige-spine-foundation.md` · `docs/architecture/paige-spine-tool-migration-map.md`
· `docs/doctrine/calendar-capability-contract.md` (this lands the FU-2 preset-config write + FU-3 Rail
subset; FU-1 full per-capability Trust-Compass clamp still depends on §67/§68) · CLAUDE.md §10 (callable
seam), §16 (autonomy lanes), §13 (honest reporting), §59 (in-body caller scope).
