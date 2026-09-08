import { describe, expect, it, vi } from "vitest";
import {
  normalizeMigrationIntent,
  isVerifiedCoverageNow,
  projectN8nMigrationInventory,
  runReadOnlyMigrationAdvisor,
  type MigrationAdvisorInput,
} from "@/../supabase/functions/_shared/paige-migration-advisor.ts";

const NOW = "2026-09-08T18:00:00.000Z";
const REVISION = "610e609c0f4b5f78e232cdb17de8c4d75b2f40f0";
const TENANT = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "abcdefabcdefabcdefabcdefabcdefab";
const EPOCH = "fedcbafedcbafedcbafedcbafedcbafe";

const runtimeEvidence = (overrides: Record<string, unknown> = {}) => ({
  availability: "available" as const,
  verification: "VERIFIED" as const,
  freshness: "current" as const,
  observed_at: NOW,
  source: "tenant_runtime" as const,
  source_revision: REVISION,
  evidence_refs: ["public.get_n8n_spine_readiness"],
  conflicts: [],
  ...overrides,
});

const scopedInventory = (payload: unknown = workflowInventory()) => ({
  scope: { tenant_id: TENANT, workspace_ref: WORKSPACE, context_epoch: EPOCH },
  payload,
});

const readiness = (overrides: Record<string, unknown> = {}) => ({
  tenant_id: TENANT,
  api: {
    state: "api_connected",
    workflow_count: 2,
    last_successful_check: "2026-09-08T17:55:00.000Z",
    action_needed: "none",
  },
  mcp: {
    state: "connected_approved_tools",
    oauth_readiness: "authorized",
    approved_workflow_count: 2,
    approved_tool_count: 3,
    last_successful_check: "2026-09-08T17:56:00.000Z",
    action_needed: "none",
  },
  ...overrides,
});

const workflowInventory = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  workflows: [
    { id: "wf_comm_1", name: "Inbound lead routing", active: true, updatedAt: "2026-09-08T17:50:00.000Z" },
    { id: "wf_comm_2", name: "Owner notification", active: false, updatedAt: "2026-09-08T17:45:00.000Z" },
  ],
  total_count: 2,
  inventory_complete: true,
  estimated: false,
  observed_at: "2026-09-08T17:57:00.000Z",
  ...overrides,
});

const baseInput = (): MigrationAdvisorInput => ({
  utterance: "Check the n8n connections. I need Paige to take over communications for Mogul Maker Academy and replace our GoHighLevel-dependent operations.",
  request_id: "req_0123456789abcdef0123456789abcdef",
  plan_id: "plan_123456789abcdef0123456789abcdef0",
  now: NOW,
  source_revision: REVISION,
  scope: {
    tenant_id: TENANT,
    workspace_ref: WORKSPACE,
    context_epoch: EPOCH,
    tier: "solo",
    role: "owner",
    is_legal_owner: true,
    server_verified: true,
    is_current: () => true,
  },
  rpc_client: { rpc: vi.fn(async () => ({ data: readiness(), error: null })) },
  load_readonly_n8n_inventory: vi.fn(async () => scopedInventory()),
  capability_runtime_evidence: {
    "integrations.n8n_readiness": runtimeEvidence(),
    "integrations.n8n_list_workflows": runtimeEvidence(),
    "social.presence": runtimeEvidence(),
  },
  capability_eligibility: {
    "integrations.n8n_readiness": "eligible",
    "integrations.n8n_list_workflows": "eligible",
    "social.presence": "eligible",
  },
  provider_governance: [
    { provider: "n8n", delivery_status: "PARTIAL", authority_lane: "confirm", source_revision: REVISION, observed_at: NOW },
    { provider: "hubspot", delivery_status: "UNAVAILABLE", authority_lane: "prohibited", source_revision: REVISION, observed_at: NOW },
  ],
  external_comparison_evidence: [
    {
      subject: "gohighlevel",
      claim: "The referenced plan documents CRM and workflow automation features.",
      source_url: "https://www.gohighlevel.com/",
      publisher: "GoHighLevel",
      checked_as_of: "2026-09-08",
      applicable_plan_edition_region: "Public site; plan and region not established",
      limitation: "Feature availability and packaging require re-verification before a decision.",
      confidence: "limited",
      reverify_after_days: 30,
    },
  ],
});

describe("Paige Self-Knowledge & Migration Advisor", () => {
  it("cannot invert the required GHL-to-Paige MMA direction", () => {
    const intent = normalizeMigrationIntent(baseInput().utterance);
    expect(intent.direction).toBe("off_external_to_paige");
    expect(intent.source_systems).toContain("gohighlevel");
    expect(intent.dependency_systems).toContain("n8n");
    expect(intent.target_state).toBe("paige_managed_operations");
    expect(intent.desired_outcomes).toContain("communications_takeover");
    expect(intent.target_state).not.toBe("gohighlevel");
  });

  it.each([
    ["Move our project management into Asana", "into_external", "asana"],
    ["Replace Paige with GHL", "into_external", "gohighlevel"],
    ["GHL should replace Paige", "into_external", "gohighlevel"],
    ["Move GHL to Paige", "off_external_to_paige", "gohighlevel"],
    ["Move Paige to HubSpot", "into_external", "hubspot"],
    ["Replace Asana with Paige", "off_external_to_paige", "asana"],
    ["What can Paige do better than HubSpot?", "compare_only", "hubspot"],
    ["We need a GHL migration", "ambiguous", "gohighlevel"],
    ["Take over operations", "ambiguous", null],
  ] as const)("normalizes %s", (utterance, direction, source) => {
    const intent = normalizeMigrationIntent(utterance);
    expect(intent.direction).toBe(direction);
    if (source && direction === "into_external") expect(intent.target_state).toBe(source);
    else if (source) expect(intent.source_systems).toContain(source);
  });

  it("keeps saved configuration, provider connection, and workflow evidence separate", () => {
    const inventory = projectN8nMigrationInventory({ readiness: readiness(), workflow_inventory: workflowInventory(), now: NOW });
    expect(inventory.saved_configuration).toBe(true);
    expect(inventory.provider_connection_truth).toBe("connected");
    expect(inventory.readiness_freshness).toBe("current");
    expect(inventory.workflow_evidence).toBe("current_complete");
    expect(inventory.observed_active_workflow_count).toBe(1);
    expect(inventory.recorded_workflow_count).toBe(2);
    expect(inventory.external_changes).toEqual([]);
    expect(inventory.observed_workflows.every((workflow) => workflow.name === null)).toBe(true);
    expect(JSON.stringify(inventory)).not.toContain("Inbound lead routing");
  });

  it("does not turn zero approvals into proof that n8n is empty", () => {
    const row = readiness();
    row.mcp.approved_workflow_count = 0;
    const inventory = projectN8nMigrationInventory({ readiness: row, workflow_inventory: null, now: NOW });
    expect(inventory.workflow_evidence).toBe("unavailable");
    expect(inventory.observed_active_workflow_count).toBeNull();
    expect(inventory.unknowns).toContain("Live workflow inventory was not available; zero approved workflows does not mean the n8n account is empty.");
  });

  it("labels stale workflow inventory without promoting it to current truth", () => {
    const inventory = projectN8nMigrationInventory({
      readiness: readiness(),
      workflow_inventory: workflowInventory({ observed_at: "2026-09-01T00:00:00.000Z" }),
      now: NOW,
    });
    expect(inventory.workflow_evidence).toBe("stale");
    expect(inventory.observed_active_workflow_count).toBe(1);
    expect(inventory.unknowns.join(" ")).toContain("stale");
  });

  it("preserves stale readiness only as last-known provider state", () => {
    const row = readiness();
    row.api.last_successful_check = "2026-09-01T00:00:00.000Z";
    row.mcp.last_successful_check = "2026-09-01T00:00:00.000Z";
    const inventory = projectN8nMigrationInventory({ readiness: row, workflow_inventory: workflowInventory(), now: NOW });
    expect(inventory.provider_connection_truth).toBe("connected");
    expect(inventory.readiness_freshness).toBe("stale");
    expect(inventory.unknowns.join(" ")).toContain("last-known state");
  });

  it("rejects provider payloads and secret-shaped fields at the inventory boundary", () => {
    expect(() => projectN8nMigrationInventory({
      readiness: readiness(),
      workflow_inventory: workflowInventory({ access_token: "DO_NOT_SHOW" }),
      now: NOW,
    })).toThrow("unsafe_n8n_inventory");
  });

  it("returns the mandatory Paige-first order and an inline no-change receipt", async () => {
    const result = await runReadOnlyMigrationAdvisor(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.advisor_status).toBe("PROOF OWED");
    expect(result.migration_execution_status).toBe("UNAVAILABLE");
    expect(result.sections.map((section) => section.kind)).toEqual([
      "paige_coverage_now",
      "gaps_and_truth",
      "phased_transition",
      "exact_owner_approval",
    ]);
    expect(result.external_changes).toEqual([]);
    expect(result.receipt.durability).toBe("inline_only");
    expect(result.receipt.external_changes).toEqual([]);
    expect(result.receipt.not_changed).toEqual(expect.arrayContaining([
      "n8n workflow states",
      "GoHighLevel account or connections",
      "provider routing",
      "tenant data",
      "external messages",
    ]));
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(JSON.stringify(result)).not.toContain("Mogul Maker Academy");
  });

  it("derives coverage from canonical Spine keys and preserves truth dimensions", async () => {
    const result = await runReadOnlyMigrationAdvisor(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const readinessCapability = result.capability_manifest.find((item) => item.capability_key === "integrations.n8n_readiness");
    expect(readinessCapability).toMatchObject({
      delivery_truth: "PARTIAL",
      tenant_availability: "available",
      eligibility: "eligible",
      authority_lane: "read",
      evidence_verification: "VERIFIED",
      source_revision: REVISION,
    });
    expect(result.capability_manifest.some((item) => String(item.capability_key) === "made.up.capability")).toBe(false);
  });

  it("keeps dated external evidence separate and cannot let it upgrade Paige truth", async () => {
    const input = baseInput();
    input.external_comparison_evidence.push({
      subject: "asana",
      claim: "The referenced page describes project-management functionality.",
      source_url: "https://asana.com/product",
      publisher: "Asana",
      checked_as_of: "2026-01-01",
      applicable_plan_edition_region: "Public product page",
      limitation: "Packaging may have changed.",
      confidence: "limited",
      reverify_after_days: 30,
    });
    input.external_comparison_evidence.push({
      subject: "hubspot",
      claim: "The referenced page describes CRM functionality.",
      source_url: "https://www.hubspot.com/products/crm",
      publisher: "HubSpot",
      checked_as_of: "2026-09-08",
      applicable_plan_edition_region: "Public product page; plan and region not established",
      limitation: "Feature availability and packaging require re-verification before a decision.",
      confidence: "limited",
      reverify_after_days: 30,
    });
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.external_comparison_evidence.find((item) => item.subject === "asana")?.freshness).toBe("stale");
    expect(result.external_comparison_evidence.map((item) => item.subject)).toEqual(expect.arrayContaining(["gohighlevel", "hubspot", "asana"]));
    expect(result.capability_manifest.every((item) => item.evidence_source !== "external_research")).toBe(true);
  });

  it("fails closed for a denied role before any tenant read", async () => {
    const input = baseInput();
    input.scope.role = "member";
    input.scope.is_legal_owner = false;
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result).toMatchObject({ ok: false, error: "owner_role_required", external_changes: [] });
    expect(input.rpc_client.rpc).not.toHaveBeenCalled();
    expect(input.load_readonly_n8n_inventory).not.toHaveBeenCalled();
  });

  it("drops all tenant evidence after an account switch", async () => {
    const input = baseInput();
    let current = true;
    input.scope.is_current = () => current;
    input.rpc_client.rpc = vi.fn(async () => {
      current = false;
      return { data: readiness(), error: null };
    });
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result).toMatchObject({ ok: false, error: "scope_changed", external_changes: [] });
    expect(input.load_readonly_n8n_inventory).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it.each(["tenant_id", "workspace_ref", "context_epoch"] as const)("refuses when %s mutates during readiness even if is_current remains true", async (field) => {
    const input = baseInput();
    input.rpc_client.rpc = vi.fn(async () => {
      (input.scope as unknown as Record<string, unknown>)[field] = `changed-${field}`;
      return { data: readiness(), error: null };
    });
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result).toMatchObject({ ok: false, error: "scope_changed", external_changes: [] });
    expect(input.load_readonly_n8n_inventory).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(`changed-${field}`);
  });

  it.each([
    ["tenant_id", "22222222-2222-4222-8222-222222222222"],
    ["workspace_ref", "workspace-wrong"],
    ["context_epoch", "epoch-stale"],
  ] as const)("rejects workflow inventory bound to the wrong %s without evidence escape", async (field, value) => {
    const input = baseInput();
    input.load_readonly_n8n_inventory = vi.fn(async () => ({
      scope: { tenant_id: TENANT, workspace_ref: WORKSPACE, context_epoch: EPOCH, [field]: value },
      payload: workflowInventory(),
    }));
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result).toMatchObject({ ok: false, error: "scope_changed", external_changes: [] });
    expect(JSON.stringify(result)).not.toContain("wf_comm_1");
    expect(JSON.stringify(result)).not.toContain(value);
  });

  it("drops workflow evidence when account scope switches during inventory", async () => {
    const input = baseInput();
    let current = true;
    input.scope.is_current = () => current;
    input.load_readonly_n8n_inventory = vi.fn(async () => {
      current = false;
      return scopedInventory();
    });
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result).toMatchObject({ ok: false, error: "scope_changed", external_changes: [] });
    expect(JSON.stringify(result)).not.toContain("wf_comm_1");
  });

  it("fails closed when the readiness row belongs to another tenant", async () => {
    const input = baseInput();
    input.rpc_client.rpc = vi.fn(async () => ({ data: readiness({ tenant_id: "22222222-2222-4222-8222-222222222222" }), error: null }));
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result).toMatchObject({ ok: false, error: "scope_changed", external_changes: [] });
    expect(input.load_readonly_n8n_inventory).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("22222222-2222-4222-8222-222222222222");
  });

  it("rejects unknown capability evidence instead of creating a second registry", async () => {
    const input = baseInput();
    (input.capability_runtime_evidence as Record<string, unknown>)["made.up.capability"] = runtimeEvidence();
    await expect(runReadOnlyMigrationAdvisor(input)).rejects.toThrow("unknown_spine_capability_evidence");
  });

  it("reports provider reads as unavailable rather than disconnected", async () => {
    const input = baseInput();
    input.rpc_client.rpc = vi.fn(async () => ({ data: null, error: { message: "PRIVATE PROVIDER ERROR" } }));
    input.load_readonly_n8n_inventory = vi.fn(async () => scopedInventory(null));
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.n8n_inventory.provider_connection_truth).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("PRIVATE PROVIDER ERROR");
    expect(result.external_changes).toEqual([]);
  });

  it("redacts a workflow inventory loader failure", async () => {
    const input = baseInput();
    input.load_readonly_n8n_inventory = vi.fn(async () => { throw new Error("PRIVATE PROVIDER ERROR"); });
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("PRIVATE PROVIDER ERROR");
    if (!result.ok) return;
    expect(result.n8n_inventory.workflow_evidence).toBe("unavailable");
    expect(result.external_changes).toEqual([]);
  });

  it.each([
    ["request_id", `req_${TENANT.replace(/-/g, "")}`],
    ["request_id", `req_${WORKSPACE}`],
    ["plan_id", `plan_${EPOCH}`],
  ] as const)("rejects an artifact %s containing scope identity", async (field, value) => {
    const input = baseInput();
    (input as unknown as Record<string, unknown>)[field] = value;
    await expect(runReadOnlyMigrationAdvisor(input)).rejects.toThrow("invalid_advisor_artifact_identity");
  });

  it("derives stale and future capability evidence instead of trusting caller freshness", async () => {
    const input = baseInput();
    (input.capability_runtime_evidence as Record<string, unknown>)["integrations.n8n_readiness"] = runtimeEvidence({ observed_at: "2026-09-01T00:00:00.000Z", freshness: "current" });
    (input.capability_runtime_evidence as Record<string, unknown>)["integrations.n8n_list_workflows"] = runtimeEvidence({ observed_at: "2026-09-09T00:00:00.000Z", freshness: "current" });
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capability_manifest.find((item) => item.capability_key === "integrations.n8n_readiness")).toMatchObject({ freshness: "stale", evidence_verification: "UNVERIFIED" });
    expect(result.capability_manifest.find((item) => item.capability_key === "integrations.n8n_list_workflows")).toMatchObject({ freshness: "unknown", evidence_verification: "UNVERIFIED" });
    expect(result.sections[0].items.map((item) => typeof item === "object" && "capability_key" in item ? item.capability_key : null)).not.toContain("integrations.n8n_readiness");
  });

  it("fails closed on missing or mismatched runtime release identity", async () => {
    const input = baseInput();
    (input.capability_runtime_evidence as Record<string, unknown>)["integrations.n8n_readiness"] = runtimeEvidence({ source_revision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capability_manifest.find((item) => item.capability_key === "integrations.n8n_readiness")).toMatchObject({ evidence_verification: "UNVERIFIED" });
  });

  it("collapses conflicting provider records into one unavailable governance result", async () => {
    const input = baseInput();
    (input.provider_governance as Array<MigrationAdvisorInput["provider_governance"][number]>).push({ provider: "n8n", delivery_status: "LIVE", authority_lane: "read", source_revision: REVISION, observed_at: NOW });
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider_governance.filter((item) => item.provider === "n8n")).toHaveLength(1);
    expect(result.provider_governance.find((item) => item.provider === "n8n")).toMatchObject({ delivery_status: "UNAVAILABLE", authority_lane: "prohibited", evidence_verification: "UNVERIFIED" });
    expect(result.receipt.remaining_gaps.join(" ")).toContain("Provider governance gap for n8n");
  });

  it("makes duplicate provider evidence order-independent and surfaces stale provider gaps", async () => {
    const currentRecord = { provider: "n8n", delivery_status: "PARTIAL" as const, authority_lane: "confirm" as const, source_revision: REVISION, observed_at: NOW };
    const staleRecord = { ...currentRecord, observed_at: "2026-09-01T00:00:00.000Z" };
    const left: MigrationAdvisorInput = { ...baseInput(), provider_governance: [staleRecord, currentRecord] };
    const right: MigrationAdvisorInput = { ...baseInput(), provider_governance: [currentRecord, staleRecord] };
    const [leftResult, rightResult] = await Promise.all([runReadOnlyMigrationAdvisor(left), runReadOnlyMigrationAdvisor(right)]);
    expect(leftResult.ok && rightResult.ok).toBe(true);
    if (!leftResult.ok || !rightResult.ok) return;
    expect(leftResult.provider_governance[0]).toEqual(rightResult.provider_governance[0]);
    expect(leftResult.provider_governance[0]).toMatchObject({ observed_at: NOW, delivery_status: "UNAVAILABLE", evidence_verification: "UNVERIFIED" });

    const staleOnly: MigrationAdvisorInput = { ...baseInput(), provider_governance: [staleRecord] };
    const staleResult = await runReadOnlyMigrationAdvisor(staleOnly);
    expect(staleResult.ok).toBe(true);
    if (!staleResult.ok) return;
    expect(staleResult.provider_governance[0]).toMatchObject({ freshness: "stale", evidence_verification: "UNVERIFIED" });
    expect(staleResult.sections[1].items.join(" ")).toContain("freshness stale");

    const mismatch: MigrationAdvisorInput = { ...baseInput(), provider_governance: [{ ...currentRecord, source_revision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }] };
    const mismatchResult = await runReadOnlyMigrationAdvisor(mismatch);
    expect(mismatchResult.ok).toBe(true);
    if (!mismatchResult.ok) return;
    expect(mismatchResult.provider_governance[0]).toMatchObject({ delivery_status: "UNAVAILABLE", evidence_verification: "UNVERIFIED" });
    expect(mismatchResult.receipt.remaining_gaps.join(" ")).toContain("Provider governance gap for n8n");
  });

  it("never promotes an unavailable registry capability into coverage now", async () => {
    expect(isVerifiedCoverageNow({
      delivery_truth: "UNAVAILABLE",
      tenant_availability: "available",
      eligibility: "eligible",
      evidence_verification: "VERIFIED",
      freshness: "current",
      authority_lane: "read",
      conflicts: [],
    })).toBe(false);
  });

  it("rejects extra comparison/provider fields and credential-bearing URLs", async () => {
    const extraComparison = baseInput();
    (extraComparison.external_comparison_evidence[0] as unknown as Record<string, unknown>).access_token = "DO_NOT_SHOW";
    await expect(runReadOnlyMigrationAdvisor(extraComparison)).rejects.toThrow("invalid_external_comparison_evidence");

    const credentialUrl = baseInput();
    (credentialUrl.external_comparison_evidence[0] as unknown as Record<string, unknown>).source_url = "https://user:password@example.com/";
    await expect(runReadOnlyMigrationAdvisor(credentialUrl)).rejects.toThrow("invalid_external_comparison_evidence");

    const extraProvider = baseInput();
    (extraProvider.provider_governance[0] as unknown as Record<string, unknown>).api_key = "DO_NOT_SHOW";
    await expect(runReadOnlyMigrationAdvisor(extraProvider)).rejects.toThrow("invalid_provider_governance_evidence");
  });

  it("labels read time separately from historical provider observations", async () => {
    const input = baseInput();
    const row = readiness();
    row.api.last_successful_check = "2026-09-01T00:00:00.000Z";
    row.mcp.last_successful_check = "2026-09-01T00:00:00.000Z";
    input.rpc_client.rpc = vi.fn(async () => ({ data: row, error: null }));
    const result = await runReadOnlyMigrationAdvisor(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.provider_observations).toMatchObject({ readiness_read_at: NOW, readiness_freshness: "stale", readiness_observed_at: "2026-09-01T00:00:00.000Z" });
    expect(result.receipt.build_identity.verification).toBe("UNVERIFIED");
    expect(result.receipt.verified.join(" ")).toContain("last-success timestamps remain historical evidence");
  });
});
