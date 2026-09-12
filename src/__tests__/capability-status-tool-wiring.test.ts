/* eslint-disable @typescript-eslint/no-explicit-any -- Source-string assertions on the edge handler. */
// @vitest-environment node
//
// Piece 3b WIRING — the `capability_status` read tool in paige-ai-chat. The pure signal builder and
// the decision core are unit-tested in paige-capability-signals.test.ts; this asserts the edge
// handler actually OFFERS the tool, ROUTES it into the role-gated owner block, resolves the three
// facts server-side, and returns the honest statuses — the seams a unit test can't see (§32/§37).
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const src = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

describe("capability_status tool wiring (source assertions)", () => {
  it("imports the pure decision core, the MVP signal builder, and the Spine maturity lookup", () => {
    expect(src).toContain('import { resolveCapabilityStatus } from "../_shared/paige-capability-status/resolver.ts"');
    expect(src).toContain('import { buildCapabilitySignals } from "../_shared/paige-capability-status/signals.ts"');
    expect(src).toContain('import { getSpineCapability } from "../_shared/paige-spine/registry.ts"');
  });

  it("offers the tool via the Capability Gateway (not inline) with no body params", () => {
    // MIGRATED 2026-09 — the def moved OFF the inline handler array and onto the Capability Gateway
    // (owner ruling 2026-09-01: domains/Spine own features, Chat consumes), which is how the
    // chat-tool-registry ratchet descended 10 → 8. So the handler no longer DECLARES it inline; it
    // spreads it in from the gateway, and the no-body-params shape now lives (and is asserted) in
    // the gateway module.
    expect(src).not.toMatch(/^\s*name: "capability_status",\s*$/m);
    expect(src).toContain("...buildGatewayToolDefs()");
    expect(src).toContain('import { buildGatewayToolDefs } from "../_shared/paige-capability-gateway/gateway.ts"');

    const gw = readFileSync("supabase/functions/_shared/paige-capability-gateway/gateway.ts", "utf8");
    const at = gw.indexOf('name: "capability_status"');
    expect(at).toBeGreaterThan(-1);
    // the tool-def occurrence sits next to an empty parameters object — tenant is server-resolved,
    // never taken from the wire.
    const defWindow = gw.slice(at, at + 1200);
    expect(defWindow).toContain("parameters: {");
    expect(defWindow).toContain("properties: {}");
  });

  it("has a describeStep case so the live trace reads honestly", () => {
    expect(src).toContain('case "capability_status": return { label: "Checking what I can do here", group: "owner" };');
  });

  it("routes capability_status INTO the admin/coach/super_admin role-gated owner block", () => {
    // if it is not in the outer gate condition, the dispatch branch is unreachable dead code
    expect(src).toContain('tc.function.name === "capability_status" ||');
  });

  it("resolves all three facts SERVER-SIDE and lets the pure core decide", () => {
    const at = src.indexOf('} else if (tc.function.name === "capability_status") {');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 1600);
    // the ceiling-clamped lane for the star write comes from the existing resolver, not the model
    expect(block).toContain('await resolveToolAutonomy("crm_create_contact")');
    // the integrations read maturity comes from the Spine registry, null-safe
    expect(block).toContain('getSpineCapability("integrations.list")?.maturity ?? null');
    // the caller's tier is the one resolved early (never taken from the request body)
    expect(block).toContain("callerTier,");
    expect(block).toContain("buildCapabilitySignals({");
    expect(block).toContain("resolveCapabilityStatus(signals)");
    expect(block).toContain("result = { success: true, count: capabilities.length, capabilities };");
  });

  it("is NOT declared a mutating tool — it is a read, so no approval gate wraps it (§no false confirm)", () => {
    // capability_status must not appear in the action-risk classification table
    const risk = readFileSync("supabase/functions/_shared/action-risk.ts", "utf8");
    expect(risk).not.toContain("capability_status");
    // and the MUTATION_VERB backstop must not catch the name (neither segment is a mutation verb)
    const verb = /(^|_)(create|update|delete|remove|save|send|publish|install|uninstall|grant|revoke|run|assign|enroll|book|set|draft|generate|file|advance|forge|archive|activate|deactivate|move|add|build|log|author|enable|disable|invite|upload|apply|approve|reject|import|export|sync|write|post|schedule|cancel|start|stop|trigger|fire|configure|buy|purchase|name|rename|propose|provision|claim|release)(_|$)/;
    expect(verb.test("capability_status")).toBe(false);
  });
});
