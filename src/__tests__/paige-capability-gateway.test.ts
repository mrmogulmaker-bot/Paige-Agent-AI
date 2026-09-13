/**
 * THE CAPABILITY GATEWAY — admissibility as a decision, and emission that descends the ratchet.
 *
 * Two things are proven here, and they are different. The CORE (`decideGatewayEntry`) is the
 * owner's per-entry decision — executable tool / approval card / setup explanation / planned or
 * unavailable explanation / nothing — asserted across every availability the resolver can report,
 * so a status the resolver reports can never be cheered up into an exposed tool (§13). The
 * EMISSION (`buildGatewayToolDefs`) is the concrete relocation that took the chat-tool-registry
 * ratchet from 10 to 8: the two tools it owns come back with their exact shipped shapes, so nothing
 * a caller sees changed (§58).
 *
 * REAL CODE, NOT A DOUBLE. The gateway module and the resolver's vocabulary are the shipped ones.
 */
import { describe, it, expect } from "vitest";
import {
  decideGatewayEntry,
  buildGatewayToolDefs,
  CAPABILITY_STATUS_TOOL,
  CONTACT_EVENT_STATUS_TOOL,
  type GatewayDisposition,
} from "../../supabase/functions/_shared/paige-capability-gateway/gateway.ts";
import type { CapabilityAvailability, CapabilityActionKind }
  from "../../supabase/functions/_shared/paige-capability-status/resolver.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("the gateway's per-entry decision is the resolver's truth, never cheered up", () => {
  // The exhaustive map from availability → disposition, for a capability that HAS a chat verb.
  const EXPECTED: Record<CapabilityAvailability, { disposition: GatewayDisposition; emitTool: boolean }> = {
    live: { disposition: "tool", emitTool: true },
    needs_approval: { disposition: "approval_card", emitTool: true },
    needs_setup: { disposition: "setup_explanation", emitTool: false },
    planned: { disposition: "planned_explanation", emitTool: false },
    proof_owed: { disposition: "unavailable", emitTool: false },
    not_for_tier: { disposition: "tier_explanation", emitTool: false },
    unavailable: { disposition: "unavailable", emitTool: false },
    no_applicable_capability: { disposition: "unavailable", emitTool: false },
  };

  it.each(Object.keys(EXPECTED) as CapabilityAvailability[])(
    "%s maps to its one honest disposition", (availability) => {
      const got = decideGatewayEntry({ availability, actionKind: "read", hasChatTool: true });
      expect(got).toEqual(EXPECTED[availability]);
    });

  it("only live and needs_approval ever hand the model a callable tool", () => {
    // The load-bearing safety property: a capability that is not built, not connected, not for this
    // tier, or unconfirmable NEVER becomes an executable tool def — the same statuses the shared
    // seam refuses at execution. Asserted as a partition, not case by case.
    const emitting: CapabilityAvailability[] = [];
    const withholding: CapabilityAvailability[] = [];
    for (const a of Object.keys(EXPECTED) as CapabilityAvailability[]) {
      (decideGatewayEntry({ availability: a, actionKind: "create", hasChatTool: true }).emitTool
        ? emitting : withholding).push(a);
    }
    expect(emitting.sort()).toEqual(["live", "needs_approval"]);
    expect(withholding.sort()).toEqual([
      "needs_setup",
      "no_applicable_capability",
      "not_for_tier",
      "planned",
      "proof_owed",
      "unavailable",
    ]);
  });

  it("a capability with no chat verb is `none`, whatever its availability — there is nothing to emit", () => {
    for (const a of Object.keys(EXPECTED) as CapabilityAvailability[]) {
      for (const actionKind of ["read", "draft", "create", "update", "configure", "external_effect"] as CapabilityActionKind[]) {
        const got = decideGatewayEntry({ availability: a, actionKind, hasChatTool: false });
        expect(got).toEqual({ disposition: "none", emitTool: false });
      }
    }
  });
});

describe("the gateway emits exactly the two tools it owns, with their shipped shapes", () => {
  it("contributes capability_status and contact_event_status, in that order", () => {
    const defs = buildGatewayToolDefs();
    expect(defs.map((d) => d.function.name)).toEqual(["capability_status", "contact_event_status"]);
  });

  it("every emitted def is a well-formed OpenAI function tool", () => {
    for (const def of buildGatewayToolDefs()) {
      expect(def.type).toBe("function");
      expect(typeof def.function.name).toBe("string");
      expect(def.function.name).toMatch(/^[a-z0-9_]+$/);
      expect(typeof def.function.description).toBe("string");
      expect(def.function.description.length).toBeGreaterThan(0);
      expect(def.function.parameters).toMatchObject({ type: "object" });
    }
  });

  it("contact_event_status still takes an optional contact_id and nothing required", () => {
    // §58: the shape the handler used to declare inline. A regression here would silently change
    // what the model can pass.
    const params = CONTACT_EVENT_STATUS_TOOL.function.parameters as {
      type: string; properties: Record<string, unknown>; required?: string[];
    };
    expect(params.properties).toHaveProperty("contact_id");
    expect(params.required ?? []).toEqual([]);
  });

  it("capability_status takes no parameters", () => {
    const params = CAPABILITY_STATUS_TOOL.function.parameters as { type: string; properties: Record<string, unknown> };
    expect(params.properties).toEqual({});
  });
});

describe("the relocation is real — the handler no longer DECLARES these two inline", () => {
  it("the handler contains no inline `name:` line for the gateway-owned tools", () => {
    // This is the ratchet's mechanism made into a test: the chat-tool-registry lint counts
    // `name: "x",` lines in the handler, so the defs living here (spread as objects) must NOT also
    // appear as inline declarations there, or the move would be a duplication rather than a
    // migration and the lint would still see 10.
    const handler = readFileSync(
      resolve(process.cwd(), "supabase/functions/paige-ai-chat/index.ts"), "utf8");
    expect(handler).not.toMatch(/^\s*name: "capability_status",\s*$/m);
    expect(handler).not.toMatch(/^\s*name: "contact_event_status",\s*$/m);
    // …and it DOES spread them in from the gateway, so they are still offered to the model.
    expect(handler).toMatch(/\.\.\.buildGatewayToolDefs\(\)/);
  });
});
