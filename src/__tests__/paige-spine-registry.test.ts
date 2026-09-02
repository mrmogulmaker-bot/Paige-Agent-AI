import { describe, expect, it } from "vitest";
import { SPINE_ACTION_CLASSIFICATIONS, type SpineCapability, type SpineSignal } from "@/../supabase/functions/_shared/paige-spine/contracts.ts";
import { PAIGE_SPINE_CAPABILITIES, validateSpineRegistry } from "@/../supabase/functions/_shared/paige-spine/registry.ts";
import { resolveSpineEvidence } from "@/../supabase/functions/_shared/paige-spine/resolveEvidence.ts";

const validSignal: SpineSignal = {
  signal_id: "f1000000-0000-4000-8000-00000000e101",
  kind: "pipeline.deal_stage_moved",
  tenant_id: "f1000000-0000-4000-8000-000000001111",
  subject_type: "client",
  subject_ref: "CLT-SPINE-A",
  occurred_at: "2026-09-01T12:00:00.000Z",
  recorded_at: "2026-09-01T12:00:01.000Z",
  source_system: "context_rail",
  source_record_ref: "rail:f1000000-0000-4000-8000-00000000e101",
  source_actor_type: "person",
  availability: "available",
  classification: "operational",
  lifecycle: "observed",
  safe_summary: "A pipeline stage changed.",
  facts: { change_type: "stage_changed", outcome: "succeeded", actor: "person" },
  audience: "owner_internal",
  schema_version: 1,
  expires_at: "2027-09-01T12:00:00.000Z",
  outcome_ref: "rail:f1000000-0000-4000-8000-00000000e101",
};

function rpc(data: unknown, error: unknown = null) {
  return { rpc: async () => ({ data, error }) };
}

describe("PAIGE Spine registry", () => {
  it("registers one honest, domain-owned, read-only vertical slice", () => {
    expect(validateSpineRegistry(PAIGE_SPINE_CAPABILITIES)).toEqual([]);
    expect(PAIGE_SPINE_CAPABILITIES).toHaveLength(1);
    expect(PAIGE_SPINE_CAPABILITIES[0]).toMatchObject({
      key: "pipeline.deal_stage_evidence", owner: "solo-pipeline", maturity: "PARTIAL",
      chatBinding: "UNAVAILABLE", mindBinding: "UNAVAILABLE", sharedPrimitiveChange: "NONE",
      action: { classification: "read", riskPolicyKey: "read_only", approvalAuthority: "none" },
    });
    expect(PAIGE_SPINE_CAPABILITIES[0].evidence.projectionWindowDays).toBe(365);
  });

  it("has no account or plan fork and no approval-gated prepare classification", () => {
    expect(JSON.stringify(PAIGE_SPINE_CAPABILITIES)).not.toMatch(/plan|subscription|account_type/i);
    expect(SPINE_ACTION_CLASSIFICATIONS).toEqual(["read", "mutate", "external_effect"]);
  });

  it("fails a mutable declaration closed without exact Chat enforcement metadata", () => {
    const unsafe: SpineCapability = {
      ...PAIGE_SPINE_CAPABILITIES[0], key: "pipeline.unsafe_mutation", chatBinding: "PARTIAL",
      action: {
        classification: "mutate", executor: "public.move_deal", chatTool: "deal_move_stage",
        idempotency: "", riskPolicyKey: "read_only", approvalAuthority: "none",
      },
    };
    expect(validateSpineRegistry([unsafe]).join("\n")).toMatch(/chat-canonical/);
    expect(validateSpineRegistry([unsafe]).join("\n")).toMatch(/LIVE Chat/);
    expect(validateSpineRegistry([unsafe]).join("\n")).toMatch(/ordinary or high/);
    expect(validateSpineRegistry([unsafe]).join("\n")).toMatch(/idempotency/);
  });

  it("rejects duplicate capability keys", () => {
    expect(validateSpineRegistry([PAIGE_SPINE_CAPABILITIES[0], PAIGE_SPINE_CAPABILITIES[0]])).toContain("duplicate capability key: pipeline.deal_stage_evidence");
  });
});

describe("resolveSpineEvidence", () => {
  it("uses only the registered RPC, public client reference, and clamped limit", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const result = await resolveSpineEvidence({
      rpc: async (name, args) => { calls.push([name, args]); return { data: [validSignal], error: null }; },
    }, "pipeline.deal_stage_evidence", { clientRef: "  clt-spine-a  ", limit: 500 });
    expect(calls).toEqual([["get_pipeline_spine_evidence", { p_client_ref: "clt-spine-a", p_limit: 100 }]]);
    expect(result).toEqual({ status: "available", signals: [validSignal] });
    expect(JSON.stringify(calls)).not.toContain("tenant");
  });

  it("fails the whole response closed on extra, missing, wrong-kind, or nested fact data", async () => {
    const malformed = [
      { ...validSignal, raw_payload: "SECRET" },
      { ...validSignal, kind: "wrong.kind" },
      { ...validSignal, safe_summary: undefined },
      { ...validSignal, facts: { ...validSignal.facts, deal_id: "SECRET" } },
      { ...validSignal, facts: { change_type: { nested: "SECRET" } } },
    ];
    for (const row of malformed) {
      await expect(resolveSpineEvidence(rpc([row]), "pipeline.deal_stage_evidence", { clientRef: "CLT-SPINE-A" }))
        .resolves.toEqual({ status: "unavailable", reason: "resolver_unavailable", signals: [] });
    }
  });

  it("rejects subject, audience, invalid UUID, and mixed-tenant drift", async () => {
    const cases = [
      [{ ...validSignal, subject_ref: "CLT-OTHER" }],
      [{ ...validSignal, audience: "client_visible" }],
      [{ ...validSignal, tenant_id: "not-a-uuid" }],
      [validSignal, { ...validSignal, signal_id: "f2000000-0000-4000-8000-00000000e201", tenant_id: "f2000000-0000-4000-8000-000000002222" }],
    ];
    for (const data of cases) {
      await expect(resolveSpineEvidence(rpc(data), "pipeline.deal_stage_evidence", { clientRef: "CLT-SPINE-A" }))
        .resolves.toEqual({ status: "unavailable", reason: "resolver_unavailable", signals: [] });
    }
  });

  it("discards an in-flight tenant-A response after the caller changes scope", async () => {
    let resolveRpc: ((value: { data: unknown; error: unknown }) => void) | undefined;
    let current = true;
    const pending = resolveSpineEvidence({
      rpc: () => new Promise((resolve) => { resolveRpc = resolve; }),
    }, "pipeline.deal_stage_evidence", { clientRef: "CLT-SPINE-A", scope: { isCurrent: () => current } });
    current = false;
    resolveRpc?.({ data: [validSignal], error: null });
    await expect(pending).resolves.toEqual({ status: "unavailable", reason: "scope_changed", signals: [] });
  });

  it("fails closed for missing subject, unknown capability, RPC error, and thrown resolver", async () => {
    await expect(resolveSpineEvidence(rpc([]), "pipeline.deal_stage_evidence", { clientRef: " " }))
      .resolves.toEqual({ status: "unavailable", reason: "subject_required", signals: [] });
    await expect(resolveSpineEvidence(rpc([]), "missing.capability", { clientRef: "CLT-SPINE-A" }))
      .resolves.toEqual({ status: "unavailable", reason: "capability_unavailable", signals: [] });
    await expect(resolveSpineEvidence(rpc([{ secret: "do not retain" }], { message: "SECRET_DB_ERROR" }), "pipeline.deal_stage_evidence", { clientRef: "CLT-SPINE-A" }))
      .resolves.toEqual({ status: "unavailable", reason: "resolver_unavailable", signals: [] });
    await expect(resolveSpineEvidence({ rpc: async () => { throw new Error("SECRET"); } }, "pipeline.deal_stage_evidence", { clientRef: "CLT-SPINE-A" }))
      .resolves.toEqual({ status: "unavailable", reason: "resolver_unavailable", signals: [] });
  });
});
