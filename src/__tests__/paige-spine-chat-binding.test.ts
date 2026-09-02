import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SpineSignal } from "@/../supabase/functions/_shared/paige-spine/contracts.ts";
import {
  loadSpineEvidenceForChat,
  renderSpineEvidenceForChat,
} from "@/../supabase/functions/_shared/paige-spine/chatEvidence.ts";

const signal: SpineSignal = {
  signal_id: "f1000000-0000-4000-8000-00000000e101",
  kind: "pipeline.deal_stage_moved",
  tenant_id: "f1000000-0000-4000-8000-000000001111",
  subject_type: "client",
  subject_ref: "CLT-SPINE-A",
  occurred_at: "2026-09-01T12:00:00.000Z",
  recorded_at: "2026-09-01T12:05:00.000Z",
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

describe("PAIGE Spine Chat binding", () => {
  it("renders only bounded model-safe evidence and drops internal provenance", () => {
    const block = renderSpineEvidenceForChat({ status: "available", signals: [signal] });
    expect(block).toContain("PAIGE SPINE — VERIFIED PIPELINE EVIDENCE");
    expect(block).toContain("A pipeline stage changed.");
    expect(block).toContain("change_type=stage_changed");
    expect(block).toContain("outcome=succeeded");
    expect(block).not.toContain(signal.tenant_id);
    expect(block).not.toContain(signal.signal_id);
    expect(block).not.toContain(signal.source_record_ref);
    expect(block).not.toContain(signal.subject_ref);
  });

  it("uses the registered resolver through the supplied caller-scoped client", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const block = await loadSpineEvidenceForChat(
      { rpc: async (name, args) => { calls.push([name, args]); return { data: [signal], error: null }; } },
      "CLT-SPINE-A",
      { isCurrent: () => true },
    );
    expect(calls).toEqual([["get_pipeline_spine_evidence", { p_client_ref: "CLT-SPINE-A", p_limit: 20 }]]);
    expect(block).toContain("Status: AVAILABLE");
  });

  it("fails closed with one generic block for errors, missing subjects, and stale scope", async () => {
    const unavailable = "Status: UNAVAILABLE\nNo verified Pipeline evidence is available for this turn. Do not infer activity, absence, or outcomes.";
    await expect(loadSpineEvidenceForChat({ rpc: async () => ({ data: null, error: { secret: "do-not-leak" } }) }, "CLT-SPINE-A", { isCurrent: () => true }))
      .resolves.toContain(unavailable);
    await expect(loadSpineEvidenceForChat({ rpc: async () => ({ data: [signal], error: null }) }, "", { isCurrent: () => true }))
      .resolves.toContain(unavailable);
    await expect(loadSpineEvidenceForChat({ rpc: async () => ({ data: [signal], error: null }) }, "CLT-SPINE-A", { isCurrent: () => false }))
      .resolves.toContain(unavailable);
  });

  it("binds the handler at its authorization and protected-streaming choke points", () => {
    const source = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");
    expect(source).toContain('import { loadSpineEvidenceForChat } from "../_shared/paige-spine/chatEvidence.ts"');
    expect(source).toContain('.select("id, tenant_id, account_number")');
    expect(source.match(/\.select\("id, tenant_id, account_number"\)/g)).toHaveLength(1);
    expect(source).toContain("loadSpineEvidenceForChat(supabaseClient, scopedClientRef");
    expect(source).toContain("isCurrent: () => !req.signal.aborted");
    expect(source).toContain("!!spineEvidenceBlock");
    expect(source).toContain("...(spineEvidenceBlock ? [{ role: \"system\", content: spineEvidenceBlock }] : [])");
    expect(source).not.toContain("loadSpineEvidenceForChat(supabase,");
  });

  it("keeps future domain additions self-service while shared changes stay governed", () => {
    const guard = readFileSync("scripts/ci/chat-tool-registry-lint.mjs", "utf8");
    const doctrine = readFileSync("docs/architecture/paige-spine-foundation.md", "utf8");
    expect(guard).toContain("PAIGE_SPINE_CAPABILITIES");
    expect(guard).not.toContain("There is no Spine registry in this repository yet");
    expect(doctrine).toContain("Domain self-service lane");
    expect(doctrine).toContain("Shared-contract lane");
    expect(doctrine).toContain("Fresh collision check");
  });
});
