import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SpineSignal } from "@/../supabase/functions/_shared/paige-spine/contracts.ts";
import {
  PIPELINE_MIND_CAPABILITY,
  loadPipelineMindEvidence,
  projectPipelineMindEvidence,
  renderPipelineMindEvidence,
} from "@/../supabase/functions/_shared/paige-spine/mindEvidence.ts";

const RECORDED: SpineSignal = {
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

const STALE: SpineSignal = {
  ...RECORDED,
  signal_id: "f1000000-0000-4000-8000-00000000e102",
  source_record_ref: "rail:f1000000-0000-4000-8000-00000000e102",
  outcome_ref: "rail:f1000000-0000-4000-8000-00000000e102",
  occurred_at: "2026-08-02T09:14:00.000Z",
  recorded_at: "2026-08-02T09:15:00.000Z",
  availability: "stale",
  source_actor_type: "paige",
  facts: { change_type: "stage_changed", outcome: "succeeded", actor: "paige" },
};

const rpc = (data: unknown, error: unknown = null) => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    client: { rpc: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return { data, error }; } },
  };
};
const current = { isCurrent: () => true };

describe("PAIGE Mind — Pipeline deal-stage evidence", () => {
  it("projects only the safe fields a person may see, and states what the record proves", () => {
    const evidence = projectPipelineMindEvidence({ status: "available", signals: [RECORDED, STALE] });
    expect(evidence.status).toBe("recorded");
    if (evidence.status !== "recorded") return;
    expect(evidence.capability).toBe(PIPELINE_MIND_CAPABILITY);
    expect(evidence.records).toEqual([
      {
        occurredAt: "2026-09-01T12:00:00.000Z",
        recordedBy: "person",
        freshness: "available",
        statement: "A pipeline stage changed.",
        citation: "rail:f1000000-0000-4000-8000-00000000e101",
        facts: { change_type: "stage_changed", outcome: "succeeded", actor: "person" },
      },
      {
        occurredAt: "2026-08-02T09:14:00.000Z",
        recordedBy: "paige",
        freshness: "stale",
        statement: "A pipeline stage changed.",
        citation: "rail:f1000000-0000-4000-8000-00000000e102",
        facts: { change_type: "stage_changed", outcome: "succeeded", actor: "paige" },
      },
    ]);
    // The scope evidence the resolver used to validate the envelope stops here. A record
    // is what a person may read; tenancy and subject identity are how the server decided
    // they may read it, and are not the same thing.
    const serialized = JSON.stringify(evidence);
    for (const forbidden of [RECORDED.tenant_id, RECORDED.subject_ref, RECORDED.recorded_at, RECORDED.expires_at, "signal_id", "outcome_ref", "audience", "schema_version"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps every forbidden raw field out of the rendered block", () => {
    const block = renderPipelineMindEvidence(projectPipelineMindEvidence({ status: "available", signals: [RECORDED] }));
    for (const forbidden of ["title", "summary\"", "payload", "stage_name", "deal_id", "actor_user_id", "contact_id", "ref_id", RECORDED.tenant_id, RECORDED.subject_ref]) {
      expect(block).not.toContain(forbidden);
    }
    expect(block).toContain("source: rail:f1000000-0000-4000-8000-00000000e101");
  });

  it("marks a stale record as stale and never as current", () => {
    const block = renderPipelineMindEvidence(projectPipelineMindEvidence({ status: "available", signals: [STALE] }));
    expect(block).toContain("| stale |");
    expect(block).toContain("report it as old, never as current");
    expect(block).not.toContain("| available |");
  });

  it("says an empty projection is not proof that nothing happened", () => {
    const block = renderPipelineMindEvidence(projectPipelineMindEvidence({ status: "available", signals: [] }));
    expect(block).toContain("Status: NO VERIFIED EVIDENCE");
    expect(block).toContain("Do not treat that as proof that no activity occurred.");
  });

  it("states the read-only boundary on every turn that carries evidence", () => {
    const block = renderPipelineMindEvidence(projectPipelineMindEvidence({ status: "available", signals: [RECORDED] }));
    expect(block).toContain("This evidence is read-only.");
    expect(block).toContain("no tool exists here to do so");
    // No mutation vocabulary may appear as something PAIGE could do.
    expect(block).not.toMatch(/you (can|may) (move|create|archive|update)/i);
  });

  it("reads the registered capability through the caller's own client, with no tenant argument", async () => {
    const { calls, client } = rpc([RECORDED]);
    await loadPipelineMindEvidence(client, "  clt-spine-a  ", current);
    expect(calls).toEqual([["get_pipeline_spine_evidence", { p_client_ref: "clt-spine-a", p_limit: 20 }]]);
    expect(JSON.stringify(calls)).not.toContain("tenant");
  });

  it("fails closed on a resolver error, a malformed row, and a mixed-tenant batch", async () => {
    const refused = async (data: unknown, error: unknown = null) =>
      renderPipelineMindEvidence(await loadPipelineMindEvidence(rpc(data, error).client, "CLT-SPINE-A", current));
    const generic = "Status: UNAVAILABLE";
    expect(await refused(null, { secret: "do-not-leak" })).toContain(generic);
    expect(await refused([{ ...RECORDED, raw_payload: "SECRET" }])).toContain(generic);
    expect(await refused([RECORDED, { ...STALE, tenant_id: "f2000000-0000-4000-8000-000000002222" }])).toContain(generic);
    // Every refusal is the SAME block, so the shape of the failure cannot be read off it,
    // and the underlying reason never reaches the model or the person.
    expect(await refused(null, { secret: "do-not-leak" })).toBe(await refused([{ ...RECORDED, raw_payload: "SECRET" }]));
    expect(await refused(null, { secret: "do-not-leak" })).not.toContain("do-not-leak");
  });

  it("refuses a citation that is not the exact opaque record handle", () => {
    for (const bad of ["deal:f1000000-0000-4000-8000-00000000e101", "rail:not-a-uuid", "rail:f1000000-0000-4000-8000-00000000e101 extra"]) {
      const evidence = projectPipelineMindEvidence({
        status: "available",
        signals: [{ ...RECORDED, source_record_ref: bad, outcome_ref: bad }],
      });
      expect(evidence.status).toBe("unavailable");
    }
    // A citation that no longer agrees with the outcome it names is not a citation.
    expect(projectPipelineMindEvidence({
      status: "available",
      signals: [{ ...RECORDED, outcome_ref: "rail:f1000000-0000-4000-8000-00000000e199" }],
    }).status).toBe("unavailable");
  });

  it("discards a result that arrives after the client or account scope changed", async () => {
    let live = true;
    const scope = { isCurrent: () => live };
    const client = { rpc: async () => { live = false; return { data: [RECORDED], error: null }; } };
    const evidence = await loadPipelineMindEvidence(client, "CLT-SPINE-A", scope);
    expect(evidence.status).toBe("unavailable");
    await expect(loadPipelineMindEvidence(rpc([RECORDED]).client, "CLT-SPINE-A", { isCurrent: () => false }))
      .resolves.toMatchObject({ status: "unavailable" });
    // A scope that throws is a scope that cannot vouch for itself.
    await expect(loadPipelineMindEvidence(rpc([RECORDED]).client, "CLT-SPINE-A", { isCurrent: () => { throw new Error("gone"); } }))
      .resolves.toMatchObject({ status: "unavailable" });
  });

  it("registers no Pipeline mutation and keeps Chat as one caller of one projection", () => {
    const pipeline = readFileSync("supabase/functions/_shared/paige-spine/domains/pipeline.ts", "utf8");
    expect(pipeline).toContain('mindBinding: "PARTIAL"');
    expect(pipeline).toContain('classification: "read"');
    expect(pipeline).toContain('riskPolicyKey: "read_only"');
    expect(pipeline).toContain('approvalAuthority: "none"');
    expect(pipeline).not.toContain("chatTool");

    // Chat renders the Mind projection rather than the raw signals, so the two cannot
    // give a person two accounts of the same record.
    const chat = readFileSync("supabase/functions/_shared/paige-spine/chatEvidence.ts", "utf8");
    expect(chat).toContain("renderPipelineMindEvidence");
    expect(chat).toContain("loadPipelineMindEvidence");

    // The Mind reads through the merged Spine adapter only. It never touches the Rail
    // table, and it does not use the separately-owned Mind-to-Rail resolver.
    const mind = readFileSync("supabase/functions/_shared/paige-spine/mindEvidence.ts", "utf8");
    expect(mind).not.toContain("paige_client_events");
    expect(mind).not.toContain("get_solo_mind_rail_events");
  });
});

describe("Pipeline deal client reference — the scope source", () => {
  const migration = readFileSync("supabase/migrations/20261041000000_pipeline_deal_carries_its_client_reference.sql", "utf8");

  it("reads the identifier off the visibility-filtered client join, never off the deal", () => {
    // `c.id` is null exactly when the caller may not see that client, so the identifier
    // can never outrun the name beside it. `d.contact_client_id` would bypass the join
    // and hand out a client id for a client the caller cannot read.
    expect(migration).toContain("'client_id',c.id,'client_name'");
    expect(migration).not.toContain("'client_id',d.contact_client_id");
  });

  it("carries every original predicate through unchanged", () => {
    for (const predicate of [
      "if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant=public.current_user_tenant_id()) then raise exception 'PIPELINE_FORBIDDEN'",
      "left join public.clients c on c.id=d.contact_client_id and c.tenant_id=_tenant",
      "(_client_admin or (_is_coach and (c.assigned_coach_user_id=_caller or c.created_by=_caller or public.is_assigned_to_client(_caller,c.id,'coach'))))",
      "where d.tenant_id=_tenant and (_deal_admin or (_is_coach and (d.owner_user_id=_caller",
      "security definer set search_path=public",
    ]) {
      expect(migration).toContain(predicate);
    }
  });

  it("adds no grant and keeps the projection internal", () => {
    expect(migration).toContain("revoke all on function public.get_pipeline_workspace_pre_identity(uuid) from public,anon,authenticated");
    expect(migration).not.toMatch(/grant\s+execute/i);
    // It re-creates the innermost projection only. The public entry point and its grants
    // are owned by the folders migration and are not touched here.
    expect(migration).not.toContain("create or replace function public.get_pipeline_workspace(");
  });

  it("emits no raw Rail or deal content", () => {
    for (const forbidden of ["e.title", "e.summary", "e.payload", "paige_client_events"]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});
