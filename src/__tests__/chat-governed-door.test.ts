/**
 * THE GOVERNED CHAT DOOR — the second adopter of the shared seam, tested as a decision matrix.
 *
 * REAL CODE, NOT A DOUBLE. `decideChatToolCall`, `decideGovernedExecution`, and `classifyAction`
 * are the shipped modules. This asserts what the Chat door DECIDES, and — because it is a
 * characterization of a behaviour-preserving refactor (the inline gate's decision, extracted into
 * the seam) — it is written so that the two regressions this change could introduce FAIL here:
 *
 *   1. EDGE #1 (arg drift): on an approved `execute`, the door must return the STORED claim
 *      arguments, never the model's request args. The MCP adapter left this open; Chat must close it.
 *   2. CHANNEL-2 PRESERVATION: a non-`high` tool the handler scope-claimed for the model must still
 *      execute, and one with no claim on a `confirm` lane must `propose` — so the five card-less
 *      surfaces are not stranded (the R1 regression).
 *
 * WHAT IT DOES NOT PROVE (§13/§32): this exercises the pure DECISION. It is not authenticated
 * runtime proof against the deployed handler; that evidence class is owed to a capable session.
 */
import { describe, it, expect } from "vitest";
import {
  decideChatToolCall,
  chatGovernedAuditRow,
  type ChatGovernedInput,
} from "../../supabase/functions/_shared/chat-governed-adapter.ts";
import {
  decideGovernedExecution,
  type GovernedDecision,
} from "../../supabase/functions/_shared/paige-spine/governedExecution.ts";
import { classifyAction } from "../../supabase/functions/_shared/action-risk.ts";

// A fully-resolved, permitted, authenticated person in a real workspace. Individual cases override
// exactly the field under test, so a failure names the one thing that changed.
const OK: ChatGovernedInput = {
  tool: "crm_create_contact", // ordinary in action-risk
  requestArgs: { name: "Model Re-Emitted" },
  effect: "mutate",
  authenticated: true,
  userId: "user-1",
  tenantId: "tenant-A",
  access: { allowed: true },
  autonomyLane: "confirm",
  outcomeChannel: "paige_audit_log",
};

const STORED = { name: "Jacqueline Turner", phone: "+1-310-661-1679" };

describe("chat governed door — grounding facts", () => {
  it("crm_create_contact is ordinary (the contact vertical's class)", () => {
    expect(classifyAction("crm_create_contact")).toBe("ordinary");
  });
});

describe("chat governed door — fail-closed refusals (server facts missing)", () => {
  it("refuses an unauthenticated caller", () => {
    const { outcome } = decideChatToolCall({ ...OK, authenticated: false });
    expect(outcome.kind).toBe("refuse");
    if (outcome.kind === "refuse") expect(outcome.code).toBe("unauthenticated");
  });
  it("refuses a person with no resolved user id", () => {
    const { outcome } = decideChatToolCall({ ...OK, userId: null });
    expect(outcome.kind === "refuse" && outcome.code).toBe("unauthenticated");
  });
  it("refuses when no workspace resolved", () => {
    const { outcome } = decideChatToolCall({ ...OK, tenantId: null });
    expect(outcome.kind === "refuse" && outcome.code).toBe("tenant_unresolved");
  });
  it("refuses when the role gate said no", () => {
    const { outcome } = decideChatToolCall({ ...OK, access: { allowed: false, reason: "not staff" } });
    expect(outcome.kind === "refuse" && outcome.code).toBe("access_denied");
  });
  it("refuses an absent access verdict as denial, never permission", () => {
    const { access: _drop, ...noAccess } = OK;
    const { outcome } = decideChatToolCall(noAccess as ChatGovernedInput);
    expect(outcome.kind === "refuse" && outcome.code).toBe("access_denied");
  });
  it("refuses a mutation that declares no durable outcome channel", () => {
    const { outcomeChannel: _drop, ...noChannel } = OK;
    const { outcome } = decideChatToolCall(noChannel as ChatGovernedInput);
    expect(outcome.kind === "refuse" && outcome.code).toBe("outcome_channel_undeclared");
  });
});

describe("chat governed door — the two declaration lies", () => {
  it("refuses a classified mutation dressed as a read (effect_mismatch)", () => {
    const { outcome } = decideChatToolCall({ ...OK, effect: "read" });
    expect(outcome.kind === "refuse" && outcome.code).toBe("effect_mismatch");
  });
  it("refuses an unclassified write-shaped name (unclassified_mutation)", () => {
    // `social_post` is unclassified and matches MUTATION_VERB (`post`) — the exact main-branch drift.
    const { outcome } = decideChatToolCall({ ...OK, tool: "social_post" });
    expect(outcome.kind).toBe("refuse");
    if (outcome.kind === "refuse") expect(outcome.code).toBe("unclassified_mutation");
  });
});

describe("chat governed door — owner_only never runs from chat", () => {
  it("refuses automation_set_grant at any lane, with or without a claim", () => {
    for (const lane of ["auto", "confirm", "off"] as const) {
      const { outcome } = decideChatToolCall({
        ...OK, tool: "automation_set_grant", autonomyLane: lane,
        claimedArgs: STORED, claimedFor: "automation_set_grant",
      });
      expect(outcome.kind === "refuse" && outcome.code).toBe("owner_only");
    }
  });
});

describe("chat governed door — the confirm lane (ordinary contact create)", () => {
  it("proposes when no approval was attempted", () => {
    const { outcome } = decideChatToolCall({ ...OK, claimedArgs: undefined });
    expect(outcome.kind).toBe("propose");
    if (outcome.kind === "propose") expect(outcome.revalidate).toBe(false);
  });
  it("proposes with revalidate when an approval was attempted and nothing backed it", () => {
    const { outcome } = decideChatToolCall({ ...OK, claimedArgs: null });
    expect(outcome.kind).toBe("propose");
    if (outcome.kind === "propose") expect(outcome.revalidate).toBe(true);
  });
  it("EXECUTES the STORED claim — never the model's re-emitted args (edge #1)", () => {
    const { outcome } = decideChatToolCall({
      ...OK, requestArgs: { name: "Model Re-Emitted" },
      claimedArgs: STORED, claimedFor: "crm_create_contact",
    });
    expect(outcome.kind).toBe("execute");
    if (outcome.kind === "execute") {
      expect(outcome.args).toEqual(STORED);
      expect(outcome.args).not.toEqual({ name: "Model Re-Emitted" });
    }
  });
  it("refuses an approval granted for a DIFFERENT capability", () => {
    const { outcome } = decideChatToolCall({
      ...OK, claimedArgs: STORED, claimedFor: "crm_delete_contact",
    });
    expect(outcome.kind === "refuse" && outcome.code).toBe("approval_claim_capability_mismatch");
  });
  it("refuses a malformed claim (a bare boolean is not a stored call)", () => {
    const { outcome } = decideChatToolCall({ ...OK, claimedArgs: true as unknown as Record<string, unknown> });
    expect(outcome.kind === "refuse" && outcome.code).toBe("approval_claim_malformed");
  });
});

describe("chat governed door — the off lane is a brake at any class", () => {
  it("refuses autonomy_off for an ordinary tool", () => {
    const { outcome } = decideChatToolCall({ ...OK, autonomyLane: "off" });
    expect(outcome.kind === "refuse" && outcome.code).toBe("autonomy_off");
  });
});

describe("chat governed door — the auto lane", () => {
  it("executes an ordinary tool on auto with the request args (no approval required)", () => {
    const { outcome } = decideChatToolCall({ ...OK, autonomyLane: "auto", requestArgs: STORED });
    expect(outcome.kind).toBe("execute");
    if (outcome.kind === "execute") expect(outcome.args).toEqual(STORED);
  });
  it("CLAMPS a high tool on auto to a proposal (auto cannot retire a high approval)", () => {
    const { outcome } = decideChatToolCall({
      ...OK, tool: "crm_delete_contact", autonomyLane: "auto", claimedArgs: undefined,
    });
    expect(outcome.kind).toBe("propose");
  });
  it("still executes a high tool on auto when a real claim was redeemed for it", () => {
    const { outcome } = decideChatToolCall({
      ...OK, tool: "crm_delete_contact", autonomyLane: "auto",
      claimedArgs: { contact_id: "c-9" }, claimedFor: "crm_delete_contact",
    });
    expect(outcome.kind).toBe("execute");
    if (outcome.kind === "execute") expect(outcome.args).toEqual({ contact_id: "c-9" });
  });
  it("refuses an unrecognised lane rather than defaulting (fail closed)", () => {
    const { outcome } = decideChatToolCall({ ...OK, autonomyLane: "AUTO" });
    expect(outcome.kind === "refuse" && outcome.code).toBe("autonomy_lane_unrecognized");
  });
});

describe("chat governed door — genuine reads (self-knowledge through the gateway)", () => {
  for (const tool of ["capability_status", "contact_event_status"]) {
    it(`${tool} is a read that executes at any lane, returning its request args`, () => {
      const { outcome } = decideChatToolCall({
        tool, requestArgs: { q: 1 }, effect: "read",
        authenticated: true, userId: "u", tenantId: "t",
        access: { allowed: true }, autonomyLane: "confirm",
      });
      expect(outcome.kind).toBe("execute");
      if (outcome.kind === "execute") expect(outcome.args).toEqual({ q: 1 });
    });
  }
});

describe("chat governed door — door invariance (no permission from the door you knocked on)", () => {
  it("decides identically to the raw seam for the same inputs", () => {
    const seam: GovernedDecision = decideGovernedExecution({
      caller: {
        authenticated: true, userId: "user-1", principal: "person",
        tenantId: "tenant-A", tenantSource: "server", door: "mcp",
        access: { allowed: true },
      },
      capability: { id: "crm_create_contact", effect: "mutate", outcomeChannel: "paige_audit_log" },
      approval: { autonomyLane: "confirm", claimedArgs: STORED, claimedFor: "crm_create_contact" },
      requestArgs: { name: "Model Re-Emitted" },
    });
    const { outcome } = decideChatToolCall({ ...OK, claimedArgs: STORED, claimedFor: "crm_create_contact" });
    expect(seam.kind).toBe("execute");
    expect(outcome.kind).toBe("execute");
    if (seam.kind === "execute" && outcome.kind === "execute") {
      expect(outcome.args).toEqual(seam.args);
    }
  });
});

describe("chat governed door — the durable audit row", () => {
  it("puts the workspace on the tenant_id column and never a name in target_id", () => {
    const { audit } = decideChatToolCall({
      ...OK, claimedArgs: STORED, claimedFor: "crm_create_contact",
    });
    const row = chatGovernedAuditRow(audit);
    expect(row.tenant_id).toBe("tenant-A");
    expect(row.target_id).toBeNull();
    expect(row.target_type).toBe("chat_tool");
    expect(row.action).toBe("chat_governed_execute");
    expect(row.payload.capability).toBe("crm_create_contact");
    expect(row.payload.decision).toBe("execute");
  });
  it("records a refusal's code in the audit payload", () => {
    const { audit } = decideChatToolCall({ ...OK, autonomyLane: "off" });
    const row = chatGovernedAuditRow(audit);
    expect(row.action).toBe("chat_governed_refuse");
    expect(row.payload.refusal_code).toBe("autonomy_off");
  });
});
