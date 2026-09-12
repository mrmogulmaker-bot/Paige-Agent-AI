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

  it("declares the tool with no body params (tenant is always server-resolved, never from the wire)", () => {
    const at = src.indexOf('name: "capability_status"');
    expect(at).toBeGreaterThan(-1);
    // the tool-def occurrence sits next to an empty parameters object
    const defWindow = src.slice(at, at + 900);
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
