import type { SpineCapability } from "../contracts.ts";

// Booking-PRESET lifecycle — the conversational create / revise / publish / pause / list path onto the
// EXISTING governed booking-preset seam (migration 20270127000000: create_calendar_preset,
// update_calendar_preset, publish_calendar_preset, pause_calendar_preset, get_calendar_presets).
// Registered here, in its own domain, so the Chat handler consumes it THROUGH the Spine rather than
// hand-wiring a tool — the exact same server-authorized RPC path the Settings › Connections › Calendars
// UI uses (owner ruling 2026-09-13; §10 callable seam). There is NO second preset model and NO chat-only
// calendar implementation: the UI and Paige both drive these five RPCs.
//
// THE THREE THINGS THIS CAPABILITY IS NOT (§13, and the owner's explicit boundary 2026-09-13):
//   1. It is NOT the internal-appointment seam. Booking a real meeting on the calendar is
//      `calendar_book_meeting` → create_internal_booking (a different table, a different job). A
//      booking PRESET is the reusable public /book page a client books THROUGH.
//   2. It is NOT a provider connection. Connecting Google/Zoom is a personal OAuth act owned by
//      Settings › Connections; nothing here connects a provider or mints a provider meeting link.
//   3. It does NOT make anything public on its own. Create yields a PRIVATE DRAFT. Only publish makes
//      the /book page reachable, and only after the server revalidates it can honestly take a booking.
//      Paige must never silently publish a page, connect a provider, send an invitation, create an
//      external event, or make a meeting link from conversational text — publish is its own explicit,
//      confirmed, server-validated step.
//
// THE AUTHORITY MODEL (mirrors the runtime clamp, and the action-risk table).
//   • create  = `ordinary`: it produces a PRIVATE draft — reversible, in-tenant, nothing public — so it
//     is the class a tenant owner MAY grant Paige standing authority over. Confirmation is the default.
//   • revise  = `high`: the SAME tool can edit a LIVE, client-facing booking page, and a per-tool risk
//     class must assume its highest-impact use. It carries the rendered approval card.
//   • publish = `high`: makes the page public and reachable by anyone with the link — never silent,
//     always confirmed, and the server (`publish_calendar_preset`) refuses an invalid page anyway.
//   • pause   = `ordinary`: reversible (publish again), removes visibility rather than exposing anything.
//   • list    = `read`: a scoped, read-only projection — the truthful-readback path.
// Runtime authority resolves through `resolve_tool_autonomy` + `classifyAction` exactly as every other
// governed tool does; nothing here is a second channel.
//
// IDEMPOTENCY, honestly (§13). publish/pause/revise CONVERGE — publishing a live preset again leaves it
// live, pausing a paused one leaves it paused, a revise with the same patch is a no-op — so a confirmed
// replay is safe. create is NOT slug-idempotent (a blind retry would mint a second draft); execute-once
// is provided by the Chat layer's confirmation fingerprint (`paige_pending_confirmations`), not by a
// command ledger here. A follow-up may add a command-ledger key to create_calendar_preset.

export const CALENDAR_PRESET_CREATE = {
  key:"calendar_preset.create",domain:"calendar_preset",owner:"booking-preset-system",humanSurface:"/solo/:account/settings/connections/calendars",
  action:{classification:"mutate",executor:"public.create_calendar_preset",chatTool:"booking_preset_create",riskPolicyKey:"ordinary",approvalAuthority:"chat-canonical",idempotency:"Not slug-idempotent — a blind retry mints a second draft; the Chat confirmation fingerprint (paige_pending_confirmations) is the execute-once guard for a confirmed create. Creates a private draft only (enabled=false)."},
  outcome:{kinds:["created","refused","failed"],projector:"public.get_calendar_presets",railVisibility:"LIVE only after a fresh canonical readback shows the new preset exists as a Draft (enabled=false); capability key booking_preset_create records a private-draft-created outcome and never a publish, a public link, a provider connection, a sent invitation, or a booking."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const CALENDAR_PRESET_REVISE = {
  key:"calendar_preset.revise",domain:"calendar_preset",owner:"booking-preset-system",humanSurface:"/solo/:account/settings/connections/calendars",
  action:{classification:"mutate",executor:"public.update_calendar_preset",chatTool:"booking_preset_revise",riskPolicyKey:"high",approvalAuthority:"chat-canonical",idempotency:"Converges — a partial-patch update with the same fields leaves the preset unchanged, so a confirmed replay is safe. It never changes the lifecycle (enabled/published_at) or the slug."},
  outcome:{kinds:["updated","refused","failed"],projector:"public.get_calendar_presets",railVisibility:"LIVE only after a fresh canonical readback matches the intended fields; capability key booking_preset_revise records a configuration-changed outcome and never a publish, a pause, a provider connection, or a booking."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const CALENDAR_PRESET_PUBLISH = {
  key:"calendar_preset.publish",domain:"calendar_preset",owner:"booking-preset-system",humanSurface:"/solo/:account/settings/connections/calendars",
  action:{classification:"mutate",executor:"public.publish_calendar_preset",chatTool:"booking_preset_publish",riskPolicyKey:"high",approvalAuthority:"chat-canonical",idempotency:"Converges — publishing a preset that is already live leaves it live and preserves its original published_at. The server revalidates hosts, open hours, and a usable method on every call and refuses an invalid page."},
  outcome:{kinds:["published","refused","failed"],projector:"public.get_calendar_presets",railVisibility:"LIVE only after a fresh canonical readback shows the preset is enabled with a published_at; capability key booking_preset_publish records that the /book page became public — never that a booking, an invitation, a provider connection, or an external event occurred."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const CALENDAR_PRESET_PAUSE = {
  key:"calendar_preset.pause",domain:"calendar_preset",owner:"booking-preset-system",humanSurface:"/solo/:account/settings/connections/calendars",
  action:{classification:"mutate",executor:"public.pause_calendar_preset",chatTool:"booking_preset_pause",riskPolicyKey:"ordinary",approvalAuthority:"chat-canonical",idempotency:"Converges — pausing an already-paused or draft preset leaves it off the air; published_at is preserved so it stays distinguishable from a never-published draft. Reversible by publishing again."},
  outcome:{kinds:["paused","refused","failed"],projector:"public.get_calendar_presets",railVisibility:"LIVE only after a fresh canonical readback shows the preset is disabled; capability key booking_preset_pause records that the public page was taken off the air, and nothing else."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const CALENDAR_PRESET_LIST = {
  key:"calendar_preset.list",domain:"calendar_preset",owner:"booking-preset-system",humanSurface:"/solo/:account/settings/connections/calendars",
  action:{classification:"read",executor:"public.get_calendar_presets",chatTool:"booking_preset_list",riskPolicyKey:"read_only",approvalAuthority:"none",idempotency:"Read-only projection; no write and no idempotency key."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

// The S1 object-lifecycle verbs onto migration 20270302000000
// (duplicate_/archive_/restore_calendar_preset). Same authored-unregistered posture as the five
// above: LIVE chatBinding, PARTIAL maturity, entering Chat via the adapter spread once the E5 wiring
// lands. Authority classes (mirroring the runtime clamp + the action-risk table):
//   • duplicate = `ordinary`: it produces a PRIVATE draft copy — reversible, in-tenant, nothing public
//     — the class a tenant owner MAY grant standing authority over. Confirmation is the default.
//   • archive   = `high`: archiving a LIVE, client-facing booking page takes it OUT OF SERVICE (its
//     /book page stops taking bookings) — externally-consequential, so a per-tool risk class assumes
//     that highest-impact use and it carries the rendered approval card. Reversible via restore.
//   • restore   = `ordinary`: brings a preset back to Draft/Paused — exposes nothing public (restore
//     never re-publishes; publish is its own explicit step), so it is the reversible, in-tenant class.
export const CALENDAR_PRESET_DUPLICATE = {
  key:"calendar_preset.duplicate",domain:"calendar_preset",owner:"booking-preset-system",humanSurface:"/solo/:account/settings/connections/calendars",
  action:{classification:"mutate",executor:"public.duplicate_calendar_preset",chatTool:"booking_preset_duplicate",riskPolicyKey:"ordinary",approvalAuthority:"chat-canonical",idempotency:"Not slug-idempotent — a blind retry mints a second copy; the Chat confirmation fingerprint (paige_pending_confirmations) is the execute-once guard. Produces a private draft copy only (enabled=false)."},
  outcome:{kinds:["created","refused","failed"],projector:"public.get_calendar_presets",railVisibility:"LIVE only after a fresh canonical readback shows the copy exists as a Draft (enabled=false); capability key booking_preset_duplicate records a private-draft-copy outcome and never a publish, a public link, a provider connection, a sent invitation, or a booking."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const CALENDAR_PRESET_ARCHIVE = {
  key:"calendar_preset.archive",domain:"calendar_preset",owner:"booking-preset-system",humanSurface:"/solo/:account/settings/connections/calendars",
  action:{classification:"mutate",executor:"public.archive_calendar_preset",chatTool:"booking_preset_archive",riskPolicyKey:"high",approvalAuthority:"chat-canonical",idempotency:"Converges — archiving an already-archived preset preserves the original archived_at and keeps it off the air. Reversible via restore."},
  outcome:{kinds:["archived","refused","failed"],projector:"public.get_calendar_presets",railVisibility:"LIVE only after a fresh canonical readback shows the preset is archived (archived_at set, enabled=false); capability key booking_preset_archive records that the page was put away and taken off the air, and nothing else."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const CALENDAR_PRESET_RESTORE = {
  key:"calendar_preset.restore",domain:"calendar_preset",owner:"booking-preset-system",humanSurface:"/solo/:account/settings/connections/calendars",
  action:{classification:"mutate",executor:"public.restore_calendar_preset",chatTool:"booking_preset_restore",riskPolicyKey:"ordinary",approvalAuthority:"chat-canonical",idempotency:"Converges — restoring a non-archived preset is a no-op. Returns it to Draft or Paused (never Live); re-publishing is a separate explicit step."},
  outcome:{kinds:["restored","refused","failed"],projector:"public.get_calendar_presets",railVisibility:"LIVE only after a fresh canonical readback shows archived_at cleared; capability key booking_preset_restore records that the preset returned to Draft/Paused — never that it went public or that a booking occurred."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const CALENDAR_PRESET_CAPABILITIES=[CALENDAR_PRESET_CREATE,CALENDAR_PRESET_REVISE,CALENDAR_PRESET_PUBLISH,CALENDAR_PRESET_PAUSE,CALENDAR_PRESET_LIST,CALENDAR_PRESET_DUPLICATE,CALENDAR_PRESET_ARCHIVE,CALENDAR_PRESET_RESTORE] as const;

// Model-facing tool JSON. Authored COMPACT (single-line objects, `name:"…"` never alone on its own line)
// so the chat-tool-registry lint does not count these as inline hand-wired tools — they register via the
// domain above and enter Chat through the adapter spread. Every description states the honest boundary:
// draft-by-default, publish is separate + explicit + server-validated, and none of these connects a
// provider, sends anything, makes a meeting link, or books a real meeting.
export const CALENDAR_PRESET_TOOLS = [
  {type:"function",function:{name:"booking_preset_create",description:"Create a NEW booking preset as a PRIVATE DRAFT for this workspace — a reusable public /book page a client can later book through (NOT a booked meeting; that is calendar_book_meeting). Pick a scheduling model and a name; sensible defaults fill the rest, all editable. It is a DRAFT: nothing is public, no provider is connected, no invitation is sent, and no meeting link is made. Publishing is a separate, explicit step (booking_preset_publish). Round Robin and Collective need two or more hosts before they can be published.",parameters:{type:"object",properties:{model:{type:"string",enum:["personal","round_robin","collective","event"],description:"Scheduling model: personal = one host meets one guest; round_robin = rotate across a team (needs 2+ hosts); collective = several hosts must all attend (needs 2+ hosts); event = a group session / class / webinar with a capacity."},name:{type:"string",minLength:1,maxLength:200,description:"A short name for the preset (the owner can rename it)."},duration_min:{type:"integer",minimum:5,maximum:1440,description:"Meeting length in minutes; defaults to 30."},capacity:{type:"integer",minimum:1,maximum:100000,description:"For an event/class/webinar: how many people may book the session."},description:{type:"string",maxLength:4000}},required:["model","name"]}}},
  {type:"function",function:{name:"booking_preset_revise",description:"Revise an EXISTING booking preset's configuration, from a verified booking_preset_list read (pass presetId). Only include the fields you are changing. This edits configuration only — it does NOT publish, pause, connect a provider, or send anything. NOTE: revising a preset that is currently Live changes its public, client-facing booking page, so confirm the exact change first. It never changes the public link (slug) or the lifecycle.",parameters:{type:"object",properties:{presetId:{type:"string",format:"uuid"},name:{type:"string",minLength:1,maxLength:200},description:{type:"string",maxLength:4000},duration_min:{type:"integer",minimum:5,maximum:1440},capacity:{type:"integer",minimum:1,maximum:100000},min_notice_min:{type:"integer",minimum:0,maximum:100000},buffer_before_min:{type:"integer",minimum:0,maximum:1440},buffer_after_min:{type:"integer",minimum:0,maximum:1440}},required:["presetId"]}}},
  {type:"function",function:{name:"booking_preset_publish",description:"PUBLISH a booking preset — make its /book page PUBLIC and bookable by anyone with the link. Do this ONLY after the owner explicitly confirms it, and never silently or on assumption. The server revalidates first and refuses unless the page can honestly take a booking: enough hosts for its scheduling model (2+ for Round Robin / Collective), at least one open window, and a usable meeting method. If it refuses, report the exact reason it returns — do not claim the page went live. This publishes a booking page only; it does not send invitations, create calendar events, or connect a provider.",parameters:{type:"object",properties:{presetId:{type:"string",format:"uuid"}},required:["presetId"]}}},
  {type:"function",function:{name:"booking_preset_pause",description:"PAUSE a Live booking preset — take its public /book page off the air so it stops accepting bookings. Reversible: publish it again to put it back. Confirm before pausing a page that may have real bookings arriving. The link is kept (it is not deleted); it simply stops accepting bookings until republished.",parameters:{type:"object",properties:{presetId:{type:"string",format:"uuid"}},required:["presetId"]}}},
  {type:"function",function:{name:"booking_preset_list",description:"List this workspace's booking presets (newest first) with each one's scheduling model, duration, capacity, host count, and lifecycle (Draft / Live / Paused / Archived). Read this before revising, publishing, pausing, duplicating, archiving, or restoring so you have the exact presetId and its current state. A Draft, Paused, or Archived preset is NOT public — only a Live one accepts bookings.",parameters:{type:"object",properties:{}}}},
  {type:"function",function:{name:"booking_preset_duplicate",description:"Duplicate an EXISTING booking preset (pass presetId, from a verified booking_preset_list read) into a NEW PRIVATE DRAFT that copies its configuration and host pool. The copy is a draft: nothing is public, no provider is connected, no invitation is sent, and no meeting link is made. Publishing the copy is a separate, explicit step (booking_preset_publish). Use this to start a new booking type from one that already works.",parameters:{type:"object",properties:{presetId:{type:"string",format:"uuid"},name:{type:"string",minLength:1,maxLength:200,description:"Optional name for the copy; defaults to the source name with \" (copy)\"."}},required:["presetId"]}}},
  {type:"function",function:{name:"booking_preset_archive",description:"ARCHIVE a booking preset (pass presetId) — put it away and take its /book page OFF THE AIR so it stops accepting bookings. NOTE: archiving a preset that is currently Live removes a public, client-facing booking page from service, so confirm the exact preset first and never archive on assumption. Reversible: restore it later (booking_preset_restore). This does not delete the preset or its history; it files it away.",parameters:{type:"object",properties:{presetId:{type:"string",format:"uuid"}},required:["presetId"]}}},
  {type:"function",function:{name:"booking_preset_restore",description:"RESTORE an archived booking preset (pass presetId) — bring it back to Draft (or Paused, if it had been published before). It does NOT go straight back on the air: re-publishing is a separate, explicit, server-validated step (booking_preset_publish). Use this to reopen a preset that was archived.",parameters:{type:"object",properties:{presetId:{type:"string",format:"uuid"}},required:["presetId"]}}},
] as const;
