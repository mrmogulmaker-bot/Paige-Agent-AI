# Booking-preset Chat capability — adoption contract (hand-off to the Chat owner)

**Status: shared SERVER seam LIVE; Chat adoption OWED.** Authored 2026-09-13 alongside the
booking-preset Draft→Publish lifecycle. This is the precise, self-contained contract for wiring the
booking-preset capabilities into the Chat handler — so the Calendar-preset work does NOT duplicate
Chat infrastructure (owner ruling 2026-09-13; §10, §18).

## What is already shipped (the shared server seam — the thing both UI and Paige call)

Migration `20270129000000_calendar_booking_preset_lifecycle.sql` — five `SECURITY DEFINER` RPCs,
`REVOKE`d from anon, `GRANT`ed to `authenticated` + `service_role`, each with §59 in-body caller
scope (an authenticated caller must satisfy `can_manage_calendar` / tenant membership; a service-role
caller is trusted only for the tenant it names). Proven by a local-Postgres replay of 17 assertion
groups (§59 tenant scope across authenticated / cross-tenant / service-role / platform-admin / plain
member, draft-by-default, publish validation, pause-keeps-`published_at`, patch-injection immunity,
lifecycle derivation).

| RPC | Purpose | Notes |
|---|---|---|
| `create_calendar_preset(_tenant uuid, _slug text, _patch jsonb, _created_by uuid)` → `jsonb` | Create a **private draft** (`enabled=false`, `published_at=NULL`); registers the creator as host 0. | Applies a fixed column allowlist from `_patch`; `enabled`/`published_at` can never be set from `_patch`. |
| `update_calendar_preset(_cal uuid, _patch jsonb, _tenant uuid)` → `jsonb` | Partial config update (only keys present in `_patch`). | Never touches `enabled`/`published_at`/`slug`/`tenant_id`. |
| `publish_calendar_preset(_cal uuid, _tenant uuid)` → `jsonb` | The ONLY seam that sets `enabled=true`. Revalidates: enough hosts for the model (2+ for round_robin/collective), an open window, a usable method. | Refuses with `22023` + a specific message (`PRESET_NEEDS_HOSTS` / `PRESET_NO_HOURS` / `PRESET_NO_METHOD`). Converges (idempotent), preserves original `published_at`. |
| `pause_calendar_preset(_cal uuid, _tenant uuid)` → `jsonb` | `enabled=false`, keeps `published_at` (so Paused ≠ Draft). | Reversible via publish. |
| `get_calendar_presets(_tenant uuid)` → `TABLE` | Tenant-scoped read: id, slug, title, type, duration_min, capacity, enabled, published_at, host_count, derived `lifecycle` (draft/live/paused). | The truthful-readback path. |

The public `/book/:slug` resolver already gates on `enabled=true`, so a Draft or Paused preset is
never publicly bookable (`public-booking/index.ts`). Nothing above sends, connects a provider, or
mints a meeting link.

## The adoption artifact (ready, NOT yet registered)

`supabase/functions/_shared/paige-spine/domains/calendar_preset.ts` exports:
- `CALENDAR_PRESET_CAPABILITIES` — five `SpineCapability` consts (create, revise, publish, pause, list).
- `CALENDAR_PRESET_TOOLS` — the five model-facing tool JSON defs (authored compact so the
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
   `["booking_preset_create","ordinary",…]` (private draft), `["booking_preset_pause","ordinary",…]`
   (reversible). `booking_preset_list` is a read — do not classify it. `lint:action-risk` is
   bidirectional: these entries must land in the same change as the handler declarations, or it fails.
3. **Declare the tools via the adapter, not inline.** Spread `CALENDAR_PRESET_TOOLS` into the handler
   through the Chat-owner adapter seam (the same path `campaign_brief_*` uses). The
   `chat-tool-registry` lint fails a new inline `name:` literal — enter through the gateway spread.
4. **Dispatch each tool → its RPC** in the handler dispatch switch, with the mapping below. Resolve
   `_tenant` from the server-derived active tenant (NEVER a tool arg); never accept a tenant/slug from
   the model.
5. **Autonomy catalogue.** Add the four mutating tool keys to `list_tool_autonomy` in a new migration
   (the `lint:tool-catalogue` requirement — an operator must be able to see/flip/disable them), with
   an operator label and a category from the existing set. Add them to `MUTATING_TOOLS` +
   `TOOL_RESULT_IS_RECEIPT` where the handler requires, and to `RAIL_ACTION_TOOLS` + the row mapping so
   a genuine success mirrors to the Rail (FU-3).
6. **Confirm loop.** `publish` and `revise` are `high` → the rendered approval card whose fingerprint
   travels in the request body; `create` and `pause` are `ordinary` → the compact confirm. Never a
   model-asserted "they said yes" for the `high` ones (the platform already enforces this).

### Tool → RPC argument mapping

| Chat tool | RPC | Mapping (server fills `_tenant` from the session; never from the model) |
|---|---|---|
| `booking_preset_create` | `create_calendar_preset` | `_slug = slugify(name) + "-" + randomSuffix()`; `_patch = { type: model, title: name, duration_min?, capacity?, description? }` — plus, to match a UI-created draft's working defaults, `availability_json` = Mon–Fri 09:00–17:00, `location_options = [{type:"phone",value:null}]`; `_created_by =` caller uid. Result is always a Draft. |
| `booking_preset_revise` | `update_calendar_preset` | `_cal = presetId`; `_patch =` only the provided fields (partial). Read `booking_preset_list` first for the id. |
| `booking_preset_publish` | `publish_calendar_preset` | `_cal = presetId`. On a `22023` refusal, report the exact returned reason — do NOT claim it went live. |
| `booking_preset_pause` | `pause_calendar_preset` | `_cal = presetId`. |
| `booking_preset_list` | `get_calendar_presets` | no args; returns the tenant's presets + derived lifecycle. |

### Honesty / authority constraints the wiring MUST preserve (§13, owner 2026-09-13)

- Paige may **propose** a template or custom setup, **create/edit a draft** after the owner approves
  the exact configuration, **show a truthful readback** (from `get_calendar_presets`), **pause** with
  confirmation, and **propose publishing** only once the configuration is complete.
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
