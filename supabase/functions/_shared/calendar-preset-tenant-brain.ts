/**
 * Solo Tenant Brain — verified booking-preset create / revise / publish / pause /
 * duplicate / archive / restore.
 *
 * This is the sibling of `campaign-brief-tenant-brain.ts`, adapted to the calendar
 * booking-preset seam. It composes the EXISTING caller-scoped booking-preset RPCs
 * (create/update/publish/pause/duplicate/archive/restore + the get_calendar_presets
 * projector) — the SAME server-authorized path the Settings › Connections › Calendars
 * UI drives (owner ruling 2026-09-13; §10). There is NO second preset model and NO
 * chat-only calendar implementation.
 *
 * It owns no table, authority resolver, approval path, Mind projection, Memory writer,
 * or UI. A write response is NEVER treated as proof: the canonical presets are freshly
 * projected through `get_calendar_presets` and the per-verb post-condition is checked
 * before the existing Rail writer is called (§13/§32).
 *
 * HONEST BOUNDS this helper preserves (§13):
 *  - It never publishes silently: `booking_preset_publish` is its own confirmed, server-
 *    validated act, and a `22023` refusal (PRESET_NEEDS_HOSTS / PRESET_NO_HOURS /
 *    PRESET_NO_METHOD) is reported as the exact reason, never as a success.
 *  - It never connects a provider, sends an invitation, creates an external event, or
 *    mints a meeting link. Create/duplicate yield a PRIVATE DRAFT (enabled=false).
 *  - Authority is server-authoritative: each RPC enforces its own §59 in-body caller
 *    scope and raises PRESET_FORBIDDEN (42501); this helper does not launder that.
 *  - `get_calendar_presets` is a COARSE projector (id/slug/title/type/duration/capacity/
 *    lifecycle/archived_at/host_count). Verification is STRICT on the fields it exposes;
 *    for the finer revise fields it does not project (min_notice, buffers, description)
 *    the bound is "the preset persisted and the RPC accepted the change" — the result
 *    note states this rather than claiming a field changed that could not be confirmed.
 */

type RpcError = { message?: string } | null;

export type CalendarPresetRpcPort = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError }>;
};

/** The mutating verbs. `booking_preset_list` is a read, handled by the list-context helper. */
export type CalendarPresetMutationTool =
  | "booking_preset_create"
  | "booking_preset_revise"
  | "booking_preset_publish"
  | "booking_preset_pause"
  | "booking_preset_duplicate"
  | "booking_preset_archive"
  | "booking_preset_restore";

type PresetLifecycle = "draft" | "live" | "paused" | "archived";

type CanonicalPreset = {
  id: string;
  slug: string;
  title: string | null;
  type: string;
  durationMin: number | null;
  capacity: number | null;
  enabled: boolean;
  publishedAt: string | null;
  archivedAt: string | null;
  hostCount: number;
  lifecycle: PresetLifecycle;
};

export type CalendarPresetContext = {
  lane: "calendar_preset";
  canonicalSource: "public.get_calendar_presets";
  observedAt: string;
  freshness: "current_canonical_projection";
  mindEligibility: "UNAVAILABLE";
  memoryRetention: "UNAVAILABLE";
};

export type CalendarPresetListContextResult =
  | { ok: true; tenantId: string; context: CalendarPresetContext; presets: CanonicalPreset[] }
  | { ok: false; code: string; tenantId?: string };

type RecordRun = (input: {
  tenantId: string;
  actorId: string;
  capabilityKey: CalendarPresetMutationTool;
  outcome: "capability_succeeded";
  runId: string;
}) => Promise<boolean>;

const SCHEDULING_MODELS = new Set(["personal", "round_robin", "collective", "event"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stringValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const boundedInt = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;

/** Mirror of `config.ts` slugify — one behaviour, not a second rule. */
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Mirror of `config.ts` randomSuffix — booking links are unique platform-wide. */
function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

/**
 * The working default hours a UI-created draft carries (`availToJson(DEFAULT_AVAIL)`):
 * Mon–Fri 09:00–17:00. Supplied on create so a Paige-created draft is the SAME shape a
 * human-created one is (no parallel model) and can be published once its owner is ready,
 * rather than landing with NULL hours the create RPC would leave (which would only refuse
 * at publish with PRESET_NO_HOURS). The owner can change these in the editor or via revise.
 */
function defaultAvailabilityJson(): Array<{ day: number; start: string; end: string }> {
  return [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "17:00" }));
}

/** The friendly, stable error codes the calendar RPCs raise, mapped from the RPC message. */
const rpcCode = (error: RpcError, fallback: string): string => {
  const message = stringValue(error?.message);
  if (!message) return fallback;
  for (const code of [
    "ACTIVE_ACCOUNT_CHANGED",
    "PRESET_FORBIDDEN",
    "PRESET_NOT_FOUND",
    "PRESET_ARCHIVED",
    "PRESET_NEEDS_HOSTS",
    "PRESET_NO_HOURS",
    "PRESET_NO_METHOD",
    "PRESET_SLUG_TAKEN",
    "PRESET_BAD_PATCH",
    "PRESET_BAD_GROUP",
    "PRESET_TENANT_REQUIRED",
    "PRESET_SLUG_REQUIRED",
    "PRESET_CREATOR_REQUIRED",
  ]) if (message.includes(code)) return code;
  return fallback;
};

/** A tagged refusal means the write did NOT persist; only an untagged/unknown error may have. */
const WROTE_NOTHING = new Set([
  "PRESET_FORBIDDEN", "PRESET_NOT_FOUND", "PRESET_ARCHIVED", "PRESET_NEEDS_HOSTS",
  "PRESET_NO_HOURS", "PRESET_NO_METHOD", "PRESET_SLUG_TAKEN", "PRESET_BAD_PATCH",
  "PRESET_BAD_GROUP", "PRESET_TENANT_REQUIRED", "PRESET_SLUG_REQUIRED", "PRESET_CREATOR_REQUIRED",
]);

function asCanonicalPreset(value: unknown): CanonicalPreset | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = stringValue(row.id);
  const slug = stringValue(row.slug);
  const type = stringValue(row.type);
  const lifecycle = stringValue(row.lifecycle);
  if (!id || !slug || !type || !lifecycle) return null;
  if (lifecycle !== "draft" && lifecycle !== "live" && lifecycle !== "paused" && lifecycle !== "archived") return null;
  return {
    id,
    slug,
    title: stringValue(row.title),
    type,
    durationMin: typeof row.duration_min === "number" ? row.duration_min : null,
    capacity: typeof row.capacity === "number" ? row.capacity : null,
    enabled: row.enabled === true,
    publishedAt: stringValue(row.published_at),
    archivedAt: stringValue(row.archived_at),
    hostCount: typeof row.host_count === "number" ? row.host_count : 0,
    lifecycle,
  };
}

async function resolveTenant(caller: CalendarPresetRpcPort): Promise<string | null> {
  try {
    const { data, error } = await caller.rpc("current_user_tenant_id", {});
    return error ? null : stringValue(data);
  } catch {
    return null;
  }
}

async function readCanonicalList(input: {
  caller: CalendarPresetRpcPort;
  expectedTenantId: string;
  observedAt: Date;
}): Promise<CalendarPresetListContextResult> {
  const tenantId = await resolveTenant(input.caller);
  if (!tenantId) return { ok: false, code: "CALENDAR_PRESET_TENANT_NOT_RESOLVED" };
  if (tenantId !== input.expectedTenantId) return { ok: false, code: "ACTIVE_ACCOUNT_CHANGED", tenantId };

  let response: { data: unknown; error: RpcError };
  try {
    response = await input.caller.rpc("get_calendar_presets", { _tenant: tenantId });
  } catch {
    return { ok: false, code: "CALENDAR_PRESET_READ_OUTCOME_UNKNOWN", tenantId };
  }
  if (response.error) return { ok: false, code: rpcCode(response.error, "CALENDAR_PRESET_READ_FAILED"), tenantId };
  // get_calendar_presets is a TABLE-returning RPC: the projection is an array of rows.
  if (!Array.isArray(response.data)) {
    return { ok: false, code: "CALENDAR_PRESET_READBACK_INVALID", tenantId };
  }
  const presets = response.data.map(asCanonicalPreset);
  if (presets.some((preset) => preset === null)) {
    return { ok: false, code: "CALENDAR_PRESET_READBACK_INVALID", tenantId };
  }
  return {
    ok: true,
    tenantId,
    context: {
      lane: "calendar_preset",
      canonicalSource: "public.get_calendar_presets",
      observedAt: input.observedAt.toISOString(),
      freshness: "current_canonical_projection",
      mindEligibility: "UNAVAILABLE",
      memoryRetention: "UNAVAILABLE",
    },
    presets: presets as CanonicalPreset[],
  };
}

export async function resolveCalendarPresetListContext(input: {
  caller: CalendarPresetRpcPort;
  expectedTenantId: string;
  observedAt?: Date;
}): Promise<CalendarPresetListContextResult> {
  return readCanonicalList({ ...input, observedAt: input.observedAt ?? new Date() });
}

/* --------------------------------------------------------------- arg validation */

function validMutationArgs(tool: CalendarPresetMutationTool, args: Record<string, unknown>): boolean {
  if (tool === "booking_preset_create") {
    if (!SCHEDULING_MODELS.has(String(args.model))) return false;
    if (!stringValue(args.name)) return false;
    if (args.duration_min !== undefined && boundedInt(args.duration_min, 5, 1440) === null) return false;
    if (args.capacity !== undefined && boundedInt(args.capacity, 1, 100000) === null) return false;
    if (args.description !== undefined && typeof args.description !== "string") return false;
    return true;
  }
  // Every other verb targets an existing preset by id.
  const presetId = stringValue(args.presetId);
  if (!presetId || !UUID_RE.test(presetId)) return false;
  if (tool === "booking_preset_revise") {
    if (args.name !== undefined && !stringValue(args.name)) return false;
    if (args.description !== undefined && typeof args.description !== "string") return false;
    for (const [key, min, max] of [
      ["duration_min", 5, 1440], ["capacity", 1, 100000], ["min_notice_min", 0, 100000],
      ["buffer_before_min", 0, 1440], ["buffer_after_min", 0, 1440],
    ] as const) {
      if (args[key] !== undefined && boundedInt(args[key], min, max) === null) return false;
    }
  }
  if (tool === "booking_preset_duplicate" && args.name !== undefined && !stringValue(args.name)) return false;
  return true;
}

/** The create `_patch`, matching a UI-created draft's working defaults (no parallel model). */
function createPatch(args: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    type: String(args.model),
    title: stringValue(args.name),
    availability_json: defaultAvailabilityJson(),
    location_options: [{ type: "phone", value: null }],
  };
  const duration = boundedInt(args.duration_min, 5, 1440);
  if (duration !== null) patch.duration_min = duration;
  const capacity = boundedInt(args.capacity, 1, 100000);
  if (capacity !== null) patch.capacity = capacity;
  const description = stringValue(args.description);
  if (description !== null) patch.description = description;
  return patch;
}

/** The revise `_patch`: only the provided fields, mapped to the columns the RPC allowlists. */
function revisePatch(args: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const name = stringValue(args.name);
  if (args.name !== undefined && name !== null) patch.title = name;
  if (args.description !== undefined && typeof args.description === "string") patch.description = args.description;
  for (const key of ["duration_min", "capacity", "min_notice_min", "buffer_before_min", "buffer_after_min"] as const) {
    if (args[key] !== undefined) patch[key] = args[key];
  }
  return patch;
}

/** The projector-visible scalar fields a revise touched, for a strict readback comparison. */
function projectedReviseExpectations(args: Record<string, unknown>): Partial<Pick<CanonicalPreset, "title" | "durationMin" | "capacity">> {
  const out: Partial<Pick<CanonicalPreset, "title" | "durationMin" | "capacity">> = {};
  const name = stringValue(args.name);
  if (args.name !== undefined && name !== null) out.title = name;
  const duration = boundedInt(args.duration_min, 5, 1440);
  if (duration !== null) out.durationMin = duration;
  const capacity = boundedInt(args.capacity, 1, 100000);
  if (capacity !== null) out.capacity = capacity;
  return out;
}

/** The per-verb post-condition, checked against the FRESH projection (never the write response). */
function verifyOutcome(tool: CalendarPresetMutationTool, args: Record<string, unknown>, after: CanonicalPreset): boolean {
  switch (tool) {
    case "booking_preset_create":
    case "booking_preset_duplicate":
      // A private draft: never live, never archived on creation.
      return after.lifecycle === "draft" && after.enabled === false && after.archivedAt === null;
    case "booking_preset_publish":
      return after.lifecycle === "live" && after.enabled === true && after.publishedAt !== null;
    case "booking_preset_pause":
      // Converges: pausing a live preset → paused; pausing a draft leaves it a draft. The
      // honest post-condition is that it is OFF THE AIR.
      return after.enabled === false && after.archivedAt === null;
    case "booking_preset_archive":
      return after.lifecycle === "archived" && after.archivedAt !== null && after.enabled === false;
    case "booking_preset_restore":
      // Back to Draft or Paused; never straight to Live (publish is separate).
      return after.archivedAt === null && after.enabled === false;
    case "booking_preset_revise": {
      // Strict on the projector-visible fields that were sent; the finer fields the
      // projector does not expose are bounded by "the preset persisted + RPC ok" (noted).
      const expect = projectedReviseExpectations(args);
      if (expect.title !== undefined && after.title !== expect.title) return false;
      if (expect.durationMin !== undefined && after.durationMin !== expect.durationMin) return false;
      if (expect.capacity !== undefined && after.capacity !== expect.capacity) return false;
      return after.archivedAt === null;
    }
  }
}

const OUTCOME_LABEL: Record<CalendarPresetMutationTool, string> = {
  booking_preset_create: "created",
  booking_preset_duplicate: "created",
  booking_preset_revise: "updated",
  booking_preset_publish: "published",
  booking_preset_pause: "paused",
  booking_preset_archive: "archived",
  booking_preset_restore: "restored",
};

/**
 * Run one booking-preset mutation through the canonical RPC, verify the persisted
 * outcome against a fresh projection, and only then record the Rail run.
 *
 * `runId` is minted per confirmed tool-call by the caller (the Chat handler) so a retry
 * of the SAME confirmed call folds to one Rail row; a distinct confirmed act gets its
 * own row. Create/duplicate are not slug-idempotent — execute-once for them is the Chat
 * confirmation fingerprint (`paige_pending_confirmations`), not a command ledger here.
 */
export async function executeVerifiedCalendarPresetMutation(input: {
  caller: CalendarPresetRpcPort;
  expectedTenantId: string;
  actorId: string;
  tool: CalendarPresetMutationTool;
  args: Record<string, unknown>;
  runId: string;
  recordRun: RecordRun;
  observedAt?: Date;
}): Promise<Record<string, unknown>> {
  if (!validMutationArgs(input.tool, input.args)) {
    return { success: false, verified: false, code: "CALENDAR_PRESET_ARGUMENTS_INVALID" };
  }

  const beforeRead = await readCanonicalList({
    caller: input.caller,
    expectedTenantId: input.expectedTenantId,
    observedAt: input.observedAt ?? new Date(),
  });
  if ("code" in beforeRead) return { success: false, verified: false, code: beforeRead.code };

  // For a verb targeting an existing preset, prove it is in this tenant's set BEFORE writing
  // (a truthful "not found" rather than leaning on the RPC to raise it).
  let sourceTitle: string | null = null;
  if (input.tool !== "booking_preset_create") {
    const presetId = stringValue(input.args.presetId);
    const before = beforeRead.presets.find((preset) => preset.id === presetId) ?? null;
    if (!before) return { success: false, verified: false, code: "PRESET_NOT_FOUND" };
    sourceTitle = before.title;
  }

  // Build the RPC call for the verb.
  let rpcName: string;
  let rpcArgs: Record<string, unknown>;
  switch (input.tool) {
    case "booking_preset_create": {
      const name = stringValue(input.args.name) ?? "calendar";
      rpcName = "create_calendar_preset";
      rpcArgs = {
        _tenant: beforeRead.tenantId,
        _slug: `${slugify(name) || "calendar"}-${randomSuffix()}`,
        _patch: createPatch(input.args),
        _created_by: input.actorId,
      };
      break;
    }
    case "booking_preset_duplicate": {
      const base = stringValue(input.args.name) ?? (sourceTitle ? `${sourceTitle} (copy)` : "Booking calendar (copy)");
      rpcName = "duplicate_calendar_preset";
      rpcArgs = {
        _cal: stringValue(input.args.presetId),
        _new_slug: `${slugify(base) || "calendar"}-${randomSuffix()}`,
        _new_title: base,
        _tenant: beforeRead.tenantId,
        _created_by: input.actorId,
      };
      break;
    }
    case "booking_preset_revise":
      rpcName = "update_calendar_preset";
      rpcArgs = { _cal: stringValue(input.args.presetId), _patch: revisePatch(input.args), _tenant: beforeRead.tenantId };
      break;
    case "booking_preset_publish":
      rpcName = "publish_calendar_preset";
      rpcArgs = { _cal: stringValue(input.args.presetId), _tenant: beforeRead.tenantId };
      break;
    case "booking_preset_pause":
      rpcName = "pause_calendar_preset";
      rpcArgs = { _cal: stringValue(input.args.presetId), _tenant: beforeRead.tenantId };
      break;
    case "booking_preset_archive":
      rpcName = "archive_calendar_preset";
      rpcArgs = { _cal: stringValue(input.args.presetId), _tenant: beforeRead.tenantId };
      break;
    case "booking_preset_restore":
      rpcName = "restore_calendar_preset";
      rpcArgs = { _cal: stringValue(input.args.presetId), _tenant: beforeRead.tenantId };
      break;
  }

  let writeData: unknown;
  try {
    const { data, error } = await input.caller.rpc(rpcName, rpcArgs);
    if (error) {
      const code = rpcCode(error, "CALENDAR_PRESET_WRITE_OUTCOME_UNKNOWN");
      return {
        success: false,
        verified: false,
        mutationMayHavePersisted: !WROTE_NOTHING.has(code),
        code,
      };
    }
    writeData = data;
  } catch {
    return { success: false, verified: false, mutationMayHavePersisted: true, code: "CALENDAR_PRESET_WRITE_OUTCOME_UNKNOWN" };
  }

  // The affected preset id: create/duplicate MINT a new id (returned by the RPC); the
  // other verbs act on the presetId we already validated is in-tenant.
  let targetId: string | null;
  if (input.tool === "booking_preset_create" || input.tool === "booking_preset_duplicate") {
    targetId = stringValue((writeData as { calendar_id?: unknown } | null)?.calendar_id);
    if (!targetId) {
      return { success: false, verified: false, mutationMayHavePersisted: true, code: "CALENDAR_PRESET_WRITE_RESULT_INVALID" };
    }
  } else {
    targetId = stringValue(input.args.presetId);
  }

  // Re-resolve the tenant so a workspace change cannot be hidden by a stale value, then
  // read the projector directly and bind the row to it (§9/§13).
  const tenantAfterWrite = await resolveTenant(input.caller);
  if (tenantAfterWrite !== input.expectedTenantId) {
    return { success: false, verified: false, mutationMayHavePersisted: true, code: "ACTIVE_ACCOUNT_CHANGED" };
  }

  let readbackResponse: { data: unknown; error: RpcError };
  try {
    readbackResponse = await input.caller.rpc("get_calendar_presets", { _tenant: tenantAfterWrite });
  } catch {
    return { success: false, verified: false, mutationMayHavePersisted: true, code: "CALENDAR_PRESET_READ_OUTCOME_UNKNOWN" };
  }
  if (readbackResponse.error) {
    return { success: false, verified: false, mutationMayHavePersisted: true, code: rpcCode(readbackResponse.error, "CALENDAR_PRESET_READ_FAILED") };
  }
  if (!Array.isArray(readbackResponse.data)) {
    return { success: false, verified: false, mutationMayHavePersisted: true, code: "CALENDAR_PRESET_READBACK_INVALID" };
  }
  const after = readbackResponse.data.map(asCanonicalPreset).find((preset) => preset?.id === targetId) ?? null;
  if (!after) {
    return { success: false, verified: false, mutationMayHavePersisted: true, code: "PRESET_NOT_FOUND" };
  }
  if (!verifyOutcome(input.tool, input.args, after)) {
    return { success: false, verified: false, mutationMayHavePersisted: true, code: "CALENDAR_PRESET_READBACK_MISMATCH" };
  }

  let railRecorded = false;
  for (let attempt = 0; attempt < 2 && !railRecorded; attempt += 1) {
    try {
      railRecorded = await input.recordRun({
        tenantId: beforeRead.tenantId,
        actorId: input.actorId,
        capabilityKey: input.tool,
        outcome: "capability_succeeded",
        runId: input.runId,
      });
    } catch {
      railRecorded = false;
    }
  }

  const preset = {
    lane: "calendar_preset",
    canonicalSource: "public.get_calendar_presets",
    sourceRef: after.id,
    slug: after.slug,
    lifecycle: after.lifecycle,
    observedAt: (input.observedAt ?? new Date()).toISOString(),
    freshness: "current_canonical_projection",
    mindEligibility: "UNAVAILABLE",
    memoryRetention: "UNAVAILABLE",
    safeFields: {
      title: after.title,
      type: after.type,
      durationMin: after.durationMin,
      capacity: after.capacity,
      hostCount: after.hostCount,
      enabled: after.enabled,
    },
  };
  const receipt = {
    source: "public.record_capability_run",
    runId: input.runId,
    outcome: OUTCOME_LABEL[input.tool],
  };

  if (!railRecorded) {
    return {
      success: false,
      verified: true,
      railRecorded: false,
      mutationMayHavePersisted: true,
      code: "CALENDAR_PRESET_RAIL_WRITE_FAILED",
      preset,
      receipt,
      note: "The canonical booking-preset change was verified against a fresh projection, but its Rail evidence did not finish after a bounded same-key retry. Do not report end-to-end success and do not repeat the change; evidence repair remains required.",
    };
  }

  // The revise caveat the file's docstring promises (§13): get_calendar_presets is a COARSE projector,
  // so a revision is verified STRICTLY only on the fields it carries; finer fields it does not project
  // are recorded as accepted by the server, not independently re-read. The note must say so rather than
  // imply the whole patch was confirmed.
  const baseNote = "The canonical booking-preset change was verified against a fresh projection and recorded on the workspace Rail. Nothing was published unless this was a publish, and nothing connected a provider, sent an invitation, created an external event, made a meeting link, or took a booking. Mind and Memory remain unavailable.";
  const reviseCaveat = " Revision note: the title, type, duration and capacity were confirmed against the projection; finer fields it does not carry (reminder notice, buffers, description) were accepted by the server but not independently re-read here.";
  return {
    success: true,
    verified: true,
    railRecorded: true,
    preset,
    receipt,
    note: input.tool === "booking_preset_revise" ? baseNote + reviseCaveat : baseNote,
  };
}
