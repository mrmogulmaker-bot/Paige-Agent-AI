/* eslint-disable @typescript-eslint/no-explicit-any -- Source-string assertions on the edge handler. */
// @vitest-environment node
//
// Piece 3b WIRING — the capability manifest seams a unit test can't see (§32/§37). The pure signal
// builder, decision core, and render block are unit-tested in paige-capability-signals.test.ts and
// paige-capability-render.test.ts; this asserts the edge handler actually: imports the pure pieces;
// OFFERS capability_status via the gateway; resolves the manifest through ONE gatherer that feeds
// BOTH the capability_status read tool AND the per-turn prompt block (§18, so they can't diverge);
// and injects that block into the model's system context (the P0 Defect-1 grounding).
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const src = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

describe("capability_status tool wiring (source assertions)", () => {
  it("imports the pure decision core, the signal builder, the render block, and the Spine maturity lookup", () => {
    expect(src).toContain('import { resolveCapabilityStatus } from "../_shared/paige-capability-status/resolver.ts"');
    expect(src).toContain('import { buildCapabilitySignals } from "../_shared/paige-capability-status/signals.ts"');
    expect(src).toContain('import { renderCapabilityStatusBlock } from "../_shared/paige-capability-status/render.ts"');
    expect(src).toContain('import { getSpineCapability } from "../_shared/paige-spine/registry.ts"');
  });

  it("offers the tool via the Capability Gateway (not inline) with no body params", () => {
    // MIGRATED 2026-09 — the def moved OFF the inline handler array and onto the Capability Gateway
    // (owner ruling 2026-09-01: domains/Spine own features, Chat consumes), which is how the
    // chat-tool-registry ratchet descended 10 → 8.
    expect(src).not.toMatch(/^\s*name: "capability_status",\s*$/m);
    expect(src).toContain("...buildGatewayToolDefs()");
    expect(src).toContain('import { buildGatewayToolDefs } from "../_shared/paige-capability-gateway/gateway.ts"');

    const gw = readFileSync("supabase/functions/_shared/paige-capability-gateway/gateway.ts", "utf8");
    const at = gw.indexOf('name: "capability_status"');
    expect(at).toBeGreaterThan(-1);
    const defWindow = gw.slice(at, at + 1200);
    expect(defWindow).toContain("parameters: {");
    expect(defWindow).toContain("properties: {}");
  });

  it("has a describeStep case so the live trace reads honestly", () => {
    expect(src).toContain('case "capability_status": return { label: "Checking what I can do here", group: "owner" };');
  });

  it("routes capability_status INTO the admin/coach/super_admin role-gated owner block", () => {
    expect(src).toContain('tc.function.name === "capability_status" ||');
  });

  it("resolves the manifest through ONE shared gatherer — server-side facts, the pure core decides", () => {
    // the gatherer is the §18 one home: it resolves the tier (resolved early, never the body),
    // the ceiling-clamped lanes, and the REAL Spine maturities, then lets the pure core decide.
    expect(src).toContain("const gatherCapabilityManifest = async (workflowsConnected: boolean) =>");
    expect(src).toContain('getSpineCapability(key)?.maturity ?? null');
    expect(src).toContain('resolveToolAutonomy("crm_create_contact")');
    expect(src).toContain('resolveToolAutonomy("campaign_brief_create")');
    expect(src).toContain('resolveToolAutonomy("n8n_run_workflow")');
    expect(src).toContain("buildCapabilitySignals({");
    expect(src).toContain("resolveCapabilityStatus(signals)");

    // the tool dispatch calls the SAME gatherer (never its own divergent resolution)
    const at = src.indexOf('} else if (tc.function.name === "capability_status") {');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 900);
    expect(block).toContain("await gatherCapabilityManifest(n8nEvidence?.status === \"available\")");
    expect(block).toContain("result = { success: true, count: capabilities.length, capabilities };");
  });

  it("injects the per-turn capability block into the model's system context, tenant-only and never a client seat", () => {
    // the block is built from the SAME gatherer and gated exactly like the over-claimed tools' role gate
    expect(src).toContain("let capabilityStatusBlock = \"\";");
    expect(src).toContain('if (personaCtx.tenant_id && callerTier !== "client") {');
    expect(src).toContain("capabilityStatusBlock = renderCapabilityStatusBlock(capabilities);");
    // and it is actually spread into the aiMessages array the model reads
    expect(src).toContain("...(capabilityStatusBlock ? [{ role: \"system\", content: capabilityStatusBlock }] : [])");
  });

  it("is NOT declared a mutating tool — it is a read, so no approval gate wraps it (§no false confirm)", () => {
    const risk = readFileSync("supabase/functions/_shared/action-risk.ts", "utf8");
    expect(risk).not.toContain("capability_status");
    const verb = /(^|_)(create|update|delete|remove|save|send|publish|install|uninstall|grant|revoke|run|assign|enroll|book|set|draft|generate|file|advance|forge|archive|activate|deactivate|move|add|build|log|author|enable|disable|invite|upload|apply|approve|reject|import|export|sync|write|post|schedule|cancel|start|stop|trigger|fire|configure|buy|purchase|name|rename|propose|provision|claim|release)(_|$)/;
    expect(verb.test("capability_status")).toBe(false);
  });
});
