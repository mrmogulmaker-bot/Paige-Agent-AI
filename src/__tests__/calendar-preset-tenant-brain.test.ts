// @vitest-environment node
//
// Solo Tenant Brain — booking-preset lifecycle (E5). Mirrors campaign-brief-tenant-brain.test.ts.
// Proves the owner-required adversarial matrix against a mock caller port: create/duplicate draft,
// revise, publish (and its server refusals), pause, archive, restore, permission denial, archived
// refusal, tenant switch (before AND after the write), no false success on a mismatched/missing
// readback, and Rail-evidence retry/failure. The write response is NEVER treated as proof — every
// success is a fresh get_calendar_presets projection matching the per-verb post-condition (§13/§32).
import { describe, expect, it, vi } from "vitest";
import {
  executeVerifiedCalendarPresetMutation as executeImpl,
  resolveCalendarPresetListContext as resolveImpl,
} from "../../supabase/functions/_shared/calendar-preset-tenant-brain";

const TENANT = "20000000-0000-4000-8000-000000000001";
const OTHER_TENANT = "20000000-0000-4000-8000-000000000002";
const ACTOR = "10000000-0000-4000-8000-000000000001";
const CAL = "30000000-0000-4000-8000-000000000001";
const CAL2 = "30000000-0000-4000-8000-000000000002";
const RUN = "40000000-0000-4000-8000-000000000001";

type Response = { data: unknown; error: { message?: string } | null };
function port(responses: Record<string, Response | Response[] | "throw">) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    calls.push([name, args]);
    const configured = responses[name];
    if (configured === "throw") throw new Error("transport");
    if (Array.isArray(configured)) {
      const next = configured.shift();
      if (!next) throw new Error(`No response left for ${name}`);
      return next;
    }
    if (!configured) throw new Error(`Unexpected RPC ${name}`);
    return configured;
  });
  return { rpc, calls };
}

/** A get_calendar_presets projector row (a TABLE result — an ARRAY of these, not an envelope). */
const row = (o: Record<string, unknown> = {}) => ({
  id: CAL, slug: "intro-call-ab12cd34", title: "Intro call", type: "personal",
  duration_min: 30, capacity: 1, enabled: false, published_at: null, archived_at: null,
  host_count: 1, lifecycle: "draft", ...o,
});
const list = (rows: unknown[]): Response => ({ data: rows, error: null });
const twice = (v: unknown): Response[] => [{ data: v, error: null }, { data: v, error: null }];

const execute = (input: Omit<Parameters<typeof executeImpl>[0], "expectedTenantId" | "actorId" | "runId">) =>
  executeImpl({ expectedTenantId: TENANT, actorId: ACTOR, runId: RUN, ...input });

describe("Solo Tenant Brain — booking-preset source context (list)", () => {
  it("server-resolves the tenant and labels the canonical source (no envelope, an array projection)", async () => {
    const caller = port({
      current_user_tenant_id: { data: TENANT, error: null },
      get_calendar_presets: list([row(), row({ id: CAL2, slug: "team-xy", type: "round_robin", lifecycle: "live", enabled: true, published_at: "2026-09-10T00:00:00Z", host_count: 2 })]),
    });
    const result = await resolveImpl({ caller, expectedTenantId: TENANT, observedAt: new Date("2026-09-13T12:05:00.000Z") });
    expect(result).toMatchObject({
      ok: true,
      tenantId: TENANT,
      context: { lane: "calendar_preset", canonicalSource: "public.get_calendar_presets", observedAt: "2026-09-13T12:05:00.000Z", freshness: "current_canonical_projection", mindEligibility: "UNAVAILABLE", memoryRetention: "UNAVAILABLE" },
      presets: [{ id: CAL, lifecycle: "draft" }, { id: CAL2, lifecycle: "live", enabled: true }],
    });
    expect(caller.calls).toEqual([["current_user_tenant_id", {}], ["get_calendar_presets", { _tenant: TENANT }]]);
  });

  it("fails closed before reading when the active workspace changed", async () => {
    const caller = port({ current_user_tenant_id: { data: OTHER_TENANT, error: null } });
    await expect(resolveImpl({ caller, expectedTenantId: TENANT })).resolves.toEqual({ ok: false, code: "ACTIVE_ACCOUNT_CHANGED", tenantId: OTHER_TENANT });
    expect(caller.calls).toHaveLength(1);
  });

  it("maps a PRESET_FORBIDDEN read (a non-member) to a forbidden list result", async () => {
    const caller = port({ current_user_tenant_id: { data: TENANT, error: null }, get_calendar_presets: { data: null, error: { message: "PRESET_FORBIDDEN: membership required" } } });
    await expect(resolveImpl({ caller, expectedTenantId: TENANT })).resolves.toMatchObject({ ok: false, code: "PRESET_FORBIDDEN" });
  });
});

describe("Solo Tenant Brain — verified booking-preset mutation", () => {
  it("creates a private draft on empty first use, re-reads it as a Draft, then records Rail", async () => {
    const caller = port({
      current_user_tenant_id: twice(TENANT),
      get_calendar_presets: [list([]), list([row()])],
      create_calendar_preset: { data: { ok: true, calendar_id: CAL, enabled: false, status: "draft" }, error: null },
    });
    const recordRun = vi.fn(async () => true);
    const result = await execute({ caller, tool: "booking_preset_create", args: { model: "personal", name: "Intro call", duration_min: 30 }, recordRun });
    expect(result).toMatchObject({ success: true, verified: true, railRecorded: true, preset: { lifecycle: "draft", safeFields: { enabled: false } }, receipt: { source: "public.record_capability_run", runId: RUN, outcome: "created" } });
    expect(recordRun).toHaveBeenCalledWith({ tenantId: TENANT, actorId: ACTOR, capabilityKey: "booking_preset_create", outcome: "capability_succeeded", runId: RUN });
    expect(caller.calls.map(([n]) => n)).toEqual(["current_user_tenant_id", "get_calendar_presets", "create_calendar_preset", "current_user_tenant_id", "get_calendar_presets"]);
    // No parallel model: the create patch carries the same working defaults a UI draft does.
    const createArgs = caller.calls.find(([n]) => n === "create_calendar_preset")![1] as { _patch: Record<string, unknown>; _created_by: string };
    expect(createArgs._created_by).toBe(ACTOR);
    expect(createArgs._patch).toMatchObject({ type: "personal", title: "Intro call", location_options: [{ type: "phone", value: null }] });
    expect(createArgs._patch.availability_json).toEqual([1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "17:00" })));
  });

  it("duplicates into a private draft copy with a '(copy)' title and a fresh slug", async () => {
    const caller = port({
      current_user_tenant_id: twice(TENANT),
      get_calendar_presets: [list([row()]), list([row(), row({ id: CAL2, slug: "intro-call-copy-99", title: "Intro call (copy)" })])],
      duplicate_calendar_preset: { data: { ok: true, calendar_id: CAL2 }, error: null },
    });
    const recordRun = vi.fn(async () => true);
    const result = await execute({ caller, tool: "booking_preset_duplicate", args: { presetId: CAL }, recordRun });
    expect(result).toMatchObject({ success: true, verified: true, railRecorded: true, preset: { sourceRef: CAL2, lifecycle: "draft" }, receipt: { outcome: "created" } });
    const dupArgs = caller.calls.find(([n]) => n === "duplicate_calendar_preset")![1] as { _new_title: string; _new_slug: string; _created_by: string };
    expect(dupArgs._new_title).toBe("Intro call (copy)");
    expect(dupArgs._new_slug).toMatch(/^intro-call-copy-[0-9a-f]{8}$/);
    expect(dupArgs._created_by).toBe(ACTOR);
  });

  it("revises the projector-visible fields and verifies them on readback", async () => {
    const caller = port({
      current_user_tenant_id: twice(TENANT),
      get_calendar_presets: [list([row()]), list([row({ title: "Discovery", duration_min: 45 })])],
      update_calendar_preset: { data: { ok: true, calendar_id: CAL, auto_paused: false, reason: null }, error: null },
    });
    const recordRun = vi.fn(async () => true);
    const result = await execute({ caller, tool: "booking_preset_revise", args: { presetId: CAL, name: "Discovery", duration_min: 45 }, recordRun });
    expect(result).toMatchObject({ success: true, verified: true, railRecorded: true, preset: { safeFields: { title: "Discovery", durationMin: 45 } }, receipt: { outcome: "updated" } });
    const patch = (caller.calls.find(([n]) => n === "update_calendar_preset")![1] as { _patch: Record<string, unknown> })._patch;
    expect(patch).toEqual({ title: "Discovery", duration_min: 45 });
  });

  it("publishes and verifies the /book page is live", async () => {
    const caller = port({
      current_user_tenant_id: twice(TENANT),
      get_calendar_presets: [list([row({ host_count: 1 })]), list([row({ enabled: true, published_at: "2026-09-13T12:00:00Z", lifecycle: "live" })])],
      publish_calendar_preset: { data: { ok: true, calendar_id: CAL }, error: null },
    });
    const recordRun = vi.fn(async () => true);
    await expect(execute({ caller, tool: "booking_preset_publish", args: { presetId: CAL }, recordRun }))
      .resolves.toMatchObject({ success: true, verified: true, railRecorded: true, preset: { lifecycle: "live" }, receipt: { outcome: "published" } });
  });

  it.each([
    ["PRESET_NEEDS_HOSTS", "PRESET_NEEDS_HOSTS: needs 2 hosts, has 1"],
    ["PRESET_NO_HOURS", "PRESET_NO_HOURS"],
    ["PRESET_NO_METHOD", "PRESET_NO_METHOD"],
  ])("reports a publish refusal (%s) as the exact reason, never a success, and never records Rail", async (code, message) => {
    const caller = port({
      current_user_tenant_id: { data: TENANT, error: null },
      get_calendar_presets: list([row({ type: "round_robin", host_count: 1 })]),
      publish_calendar_preset: { data: null, error: { message } },
    });
    const recordRun = vi.fn(async () => true);
    await expect(execute({ caller, tool: "booking_preset_publish", args: { presetId: CAL }, recordRun }))
      .resolves.toMatchObject({ success: false, verified: false, mutationMayHavePersisted: false, code });
    expect(caller.calls.map(([n]) => n)).not.toContain("get_calendar_presets_after"); // sanity: no fabricated readback path
    expect(recordRun).not.toHaveBeenCalled();
  });

  it("pauses a live preset and verifies it is off the air", async () => {
    const caller = port({
      current_user_tenant_id: twice(TENANT),
      get_calendar_presets: [list([row({ enabled: true, published_at: "2026-09-10T00:00:00Z", lifecycle: "live" })]), list([row({ enabled: false, published_at: "2026-09-10T00:00:00Z", lifecycle: "paused" })])],
      pause_calendar_preset: { data: { ok: true, calendar_id: CAL }, error: null },
    });
    const recordRun = vi.fn(async () => true);
    await expect(execute({ caller, tool: "booking_preset_pause", args: { presetId: CAL }, recordRun }))
      .resolves.toMatchObject({ success: true, verified: true, preset: { lifecycle: "paused" }, receipt: { outcome: "paused" } });
  });

  it("archives, then restores back to a non-live state (never straight to Live)", async () => {
    const archiveCaller = port({
      current_user_tenant_id: twice(TENANT),
      get_calendar_presets: [list([row({ enabled: true, published_at: "2026-09-10T00:00:00Z", lifecycle: "live" })]), list([row({ enabled: false, published_at: "2026-09-10T00:00:00Z", archived_at: "2026-09-13T12:00:00Z", lifecycle: "archived" })])],
      archive_calendar_preset: { data: { ok: true, calendar_id: CAL }, error: null },
    });
    await expect(execute({ caller: archiveCaller, tool: "booking_preset_archive", args: { presetId: CAL }, recordRun: vi.fn(async () => true) }))
      .resolves.toMatchObject({ success: true, verified: true, preset: { lifecycle: "archived" }, receipt: { outcome: "archived" } });

    const restoreCaller = port({
      current_user_tenant_id: twice(TENANT),
      get_calendar_presets: [list([row({ archived_at: "2026-09-13T12:00:00Z", published_at: "2026-09-10T00:00:00Z", lifecycle: "archived" })]), list([row({ enabled: false, published_at: "2026-09-10T00:00:00Z", archived_at: null, lifecycle: "paused" })])],
      restore_calendar_preset: { data: { ok: true, calendar_id: CAL }, error: null },
    });
    await expect(execute({ caller: restoreCaller, tool: "booking_preset_restore", args: { presetId: CAL }, recordRun: vi.fn(async () => true) }))
      .resolves.toMatchObject({ success: true, verified: true, preset: { lifecycle: "paused", safeFields: { enabled: false } }, receipt: { outcome: "restored" } });
  });

  it("refuses an archived preset's edit as the RPC raises it, without recording Rail", async () => {
    const caller = port({
      current_user_tenant_id: { data: TENANT, error: null },
      get_calendar_presets: list([row({ archived_at: "2026-09-13T12:00:00Z", lifecycle: "archived" })]),
      update_calendar_preset: { data: null, error: { message: "PRESET_ARCHIVED: restore this preset before editing" } },
    });
    const recordRun = vi.fn(async () => true);
    await expect(execute({ caller, tool: "booking_preset_revise", args: { presetId: CAL, name: "New" }, recordRun }))
      .resolves.toMatchObject({ success: false, verified: false, mutationMayHavePersisted: false, code: "PRESET_ARCHIVED" });
    expect(recordRun).not.toHaveBeenCalled();
  });

  it("refuses a preset that is not in this tenant's set BEFORE writing", async () => {
    const caller = port({ current_user_tenant_id: { data: TENANT, error: null }, get_calendar_presets: list([row({ id: CAL2 })]) });
    const recordRun = vi.fn(async () => true);
    await expect(execute({ caller, tool: "booking_preset_publish", args: { presetId: CAL }, recordRun }))
      .resolves.toMatchObject({ success: false, verified: false, code: "PRESET_NOT_FOUND" });
    expect(caller.calls.map(([n]) => n)).not.toContain("publish_calendar_preset");
    expect(recordRun).not.toHaveBeenCalled();
  });

  it.each([
    ["bad model", "booking_preset_create", { model: "webinar_pro", name: "X" }],
    ["missing name", "booking_preset_create", { model: "personal" }],
    ["non-uuid presetId", "booking_preset_publish", { presetId: "not-a-uuid" }],
    ["out-of-range duration", "booking_preset_revise", { presetId: CAL, duration_min: 5000 }],
  ] as const)("rejects malformed args (%s) before reading or writing", async (_l, tool, args) => {
    const caller = port({});
    const recordRun = vi.fn(async () => true);
    await expect(execute({ caller, tool, args, recordRun })).resolves.toMatchObject({ success: false, verified: false, code: "CALENDAR_PRESET_ARGUMENTS_INVALID" });
    expect(caller.calls).toHaveLength(0);
    expect(recordRun).not.toHaveBeenCalled();
  });

  it("maps a PRESET_SLUG_TAKEN create refusal to wrote-nothing (no readback, no Rail)", async () => {
    const caller = port({
      current_user_tenant_id: { data: TENANT, error: null },
      get_calendar_presets: list([]),
      create_calendar_preset: { data: null, error: { message: "PRESET_SLUG_TAKEN: that booking link is already in use" } },
    });
    const recordRun = vi.fn(async () => true);
    await expect(execute({ caller, tool: "booking_preset_create", args: { model: "personal", name: "Intro" }, recordRun }))
      .resolves.toMatchObject({ success: false, verified: false, mutationMayHavePersisted: false, code: "PRESET_SLUG_TAKEN" });
    expect(recordRun).not.toHaveBeenCalled();
  });

  it("treats a thrown write as outcome-unknown and does not read back or record Rail", async () => {
    const caller = port({ current_user_tenant_id: { data: TENANT, error: null }, get_calendar_presets: list([row()]), publish_calendar_preset: "throw" });
    const recordRun = vi.fn(async () => true);
    await expect(execute({ caller, tool: "booking_preset_publish", args: { presetId: CAL }, recordRun }))
      .resolves.toMatchObject({ success: false, verified: false, mutationMayHavePersisted: true, code: "CALENDAR_PRESET_WRITE_OUTCOME_UNKNOWN" });
    expect(recordRun).not.toHaveBeenCalled();
  });

  it("fails closed when the workspace changes AFTER the mutation", async () => {
    const caller = port({
      current_user_tenant_id: [{ data: TENANT, error: null }, { data: OTHER_TENANT, error: null }],
      get_calendar_presets: list([row()]),
      pause_calendar_preset: { data: { ok: true, calendar_id: CAL }, error: null },
    });
    const recordRun = vi.fn(async () => true);
    await expect(execute({ caller, tool: "booking_preset_pause", args: { presetId: CAL }, recordRun }))
      .resolves.toMatchObject({ success: false, verified: false, mutationMayHavePersisted: true, code: "ACTIVE_ACCOUNT_CHANGED" });
    expect(recordRun).not.toHaveBeenCalled();
  });

  it.each([
    ["missing readback", list([])],
    ["mismatched readback (publish did not take)", list([row({ enabled: false, lifecycle: "draft" })])],
  ])("does not claim success for %s", async (_l, postRead) => {
    const caller = port({
      current_user_tenant_id: twice(TENANT),
      get_calendar_presets: [list([row({ host_count: 1 })]), postRead],
      publish_calendar_preset: { data: { ok: true, calendar_id: CAL }, error: null },
    });
    const recordRun = vi.fn(async () => true);
    const result = await execute({ caller, tool: "booking_preset_publish", args: { presetId: CAL }, recordRun });
    expect(result).toMatchObject({ success: false, verified: false, mutationMayHavePersisted: true });
    expect(String((result as { code?: string }).code)).toMatch(/PRESET_NOT_FOUND|CALENDAR_PRESET_READBACK_MISMATCH/);
    expect(recordRun).not.toHaveBeenCalled();
  });

  it("repairs Rail evidence with one bounded retry using the same run id", async () => {
    const caller = port({
      current_user_tenant_id: twice(TENANT),
      get_calendar_presets: [list([]), list([row()])],
      create_calendar_preset: { data: { ok: true, calendar_id: CAL }, error: null },
    });
    const recordRun = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(execute({ caller, tool: "booking_preset_create", args: { model: "personal", name: "Intro" }, recordRun }))
      .resolves.toMatchObject({ success: true, verified: true, railRecorded: true });
    expect(recordRun).toHaveBeenCalledTimes(2);
    expect(recordRun.mock.calls[0][0].runId).toBe(RUN);
    expect(recordRun.mock.calls[1][0].runId).toBe(RUN);
  });

  it("does not report end-to-end success when Rail cannot be recorded", async () => {
    const caller = port({
      current_user_tenant_id: twice(TENANT),
      get_calendar_presets: [list([]), list([row()])],
      create_calendar_preset: { data: { ok: true, calendar_id: CAL }, error: null },
    });
    const recordRun = vi.fn(async () => false);
    await expect(execute({ caller, tool: "booking_preset_create", args: { model: "personal", name: "Intro" }, recordRun }))
      .resolves.toMatchObject({ success: false, verified: true, railRecorded: false, mutationMayHavePersisted: true, code: "CALENDAR_PRESET_RAIL_WRITE_FAILED" });
    expect(recordRun).toHaveBeenCalledTimes(2);
  });
});
