import { describe, expect, it, vi } from "vitest";

import {
  PAIGE_SPINE_CAPABILITIES,
  validateSpineRegistry,
} from "../../supabase/functions/_shared/paige-spine/registry.ts";
import {
  resolveSpineEvidence,
  type SpineEvidenceRpcClient,
} from "../../supabase/functions/_shared/paige-spine/resolveEvidence.ts";

describe("PAIGE Spine registry", () => {
  it("registers the Pipeline evidence slice without tenant-tier forks", () => {
    expect(validateSpineRegistry(PAIGE_SPINE_CAPABILITIES)).toEqual([]);
    expect(PAIGE_SPINE_CAPABILITIES).toEqual([
      expect.objectContaining({
        key: "pipeline.deal_stage_evidence",
        domain: "pipeline",
        owner: "solo-pipeline",
        humanSurface: "/solo/:account/growth/pipeline",
        maturity: "PARTIAL",
        evidence: expect.objectContaining({
          signalKinds: ["pipeline.deal_stage_moved"],
          adapter: "public.get_pipeline_spine_evidence",
          audience: "owner_internal",
        }),
        action: expect.objectContaining({
          classification: "read",
          approvalAuthority: "none",
        }),
      }),
    ]);

    const serialized = JSON.stringify(PAIGE_SPINE_CAPABILITIES);
    for (const forbidden of ["tenantType", "plan", "accountIdentity", "agencyOnly", "soloOnly"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("fails closed on duplicate keys and unsafe mutating action metadata", () => {
    const valid = PAIGE_SPINE_CAPABILITIES[0];
    expect(validateSpineRegistry([valid, valid])).toContain(
      "duplicate capability key: pipeline.deal_stage_evidence",
    );

    const unsafeMutation = {
      ...valid,
      key: "pipeline.unsafe_mutation",
      action: {
        ...valid.action,
        classification: "mutate" as const,
        approvalAuthority: "none" as const,
        idempotency: "",
        riskPolicyKey: "",
      },
    };
    const findings = validateSpineRegistry([unsafeMutation]);
    expect(findings).toEqual(
      expect.arrayContaining([
        "pipeline.unsafe_mutation: mutating actions require chat-canonical approval authority",
        "pipeline.unsafe_mutation: mutating actions require idempotency metadata",
        "pipeline.unsafe_mutation: mutating actions require a risk policy key",
      ]),
    );
  });
});

describe("PAIGE Spine evidence resolver", () => {
  it("passes only a public client selector and clamped limit to the registered RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ signal_id: "signal-1", kind: "pipeline.deal_stage_moved", facts: { outcome: "succeeded" } }],
      error: null,
    });
    const result = await resolveSpineEvidence(
      { rpc } as SpineEvidenceRpcClient,
      "pipeline.deal_stage_evidence",
      { clientRef: " CLT-ABC123 ", limit: 500 },
    );

    expect(rpc).toHaveBeenCalledWith("get_pipeline_spine_evidence", {
      p_client_ref: "CLT-ABC123",
      p_limit: 100,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("tenant");
    expect(result).toEqual({ status: "available", signals: expect.any(Array) });
  });

  it("does not leak endpoint errors or stale prior-scope results", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ payload: { secret: "must-not-escape" } }],
      error: { message: "private endpoint failed with token=secret" },
    });
    const result = await resolveSpineEvidence(
      { rpc } as SpineEvidenceRpcClient,
      "pipeline.deal_stage_evidence",
      { clientRef: "CLT-ABC123", limit: 5 },
    );

    expect(result).toEqual({
      status: "unavailable",
      reason: "resolver_unavailable",
      signals: [],
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|endpoint|token/i);
  });

  it("refuses unknown capabilities and empty client references without calling a resolver", async () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as SpineEvidenceRpcClient;

    await expect(resolveSpineEvidence(client, "pipeline.unknown", { clientRef: "CLT-1" }))
      .resolves.toEqual({ status: "unavailable", reason: "capability_unavailable", signals: [] });
    await expect(resolveSpineEvidence(client, "pipeline.deal_stage_evidence", { clientRef: " " }))
      .resolves.toEqual({ status: "unavailable", reason: "subject_required", signals: [] });
    expect(rpc).not.toHaveBeenCalled();
  });
});
