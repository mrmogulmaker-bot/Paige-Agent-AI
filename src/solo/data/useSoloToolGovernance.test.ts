import { describe, it, expect } from "vitest";
import { deriveGovernance } from "./useSoloToolGovernance";
import type { ToolMode } from "./capabilityTools";

// Rows in the shape `list_tool_autonomy` returns. Real tool keys, so the risk classes come from the
// guarded map, not from the test.
const row = (tool_key: string, mode: ToolMode, is_default = false) => ({
  tool_key,
  label: tool_key,
  category: "x",
  mode,
  is_default,
});

describe("deriveGovernance — effective = min(stored, ceiling, risk)", () => {
  it("an ordinary tool at auto with no ceiling runs auto (Acts within guardrails)", () => {
    const { byTool } = deriveGovernance([row("crm_create_contact", "auto")], {});
    const t = byTool["crm_create_contact"];
    expect(t.effective).toBe("auto");
    expect(t.heldBack).toBeNull();
    expect(t.settable).toBe(true);
    expect(t.maxSettable).toBe("auto");
  });

  it("a HIGH tool at auto is held to confirm by risk, with an honest reason (§70.1 no false affordance)", () => {
    const { byTool } = deriveGovernance([row("crm_delete_contact", "auto")], {});
    const t = byTool["crm_delete_contact"];
    expect(t.stored).toBe("auto");
    expect(t.effective).toBe("confirm");
    expect(t.maxSettable).toBe("confirm");
    expect(t.heldBack).toEqual({ by: "risk", reason: "This action is consequential, so it still asks first." });
  });

  it("the platform CEILING narrows auto→confirm and is attributed to policy, never the ceiling itself", () => {
    // ceiling probe reports that a stored 'auto' resolves to 'confirm' (rung <= 1)
    const { byTool, ceilingLimiting } = deriveGovernance([row("crm_create_contact", "auto")], { auto: "confirm" });
    const t = byTool["crm_create_contact"];
    expect(t.effective).toBe("confirm");
    expect(t.heldBack).toEqual({ by: "policy", reason: "Further limited by platform policy right now." });
    expect(ceilingLimiting).toBe(true);
  });

  it("a rung<=0 ceiling forces everything off", () => {
    const { byTool } = deriveGovernance([row("crm_create_contact", "confirm")], { confirm: "off" });
    expect(byTool["crm_create_contact"].effective).toBe("off");
    expect(byTool["crm_create_contact"].heldBack?.by).toBe("policy");
  });

  it("a HIGH tool whose ceiling ALSO narrows is attributed to RISK, not policy (the cap is permanent)", () => {
    // Both the risk cap (confirm) and the ceiling (auto→confirm) would bring a stored 'auto' to
    // confirm. Lifting the ceiling would NOT change the outcome — risk still caps it — so the honest,
    // permanent reason is risk, and the platform is not the binding constraint (ceilingLimiting false).
    const { byTool, ceilingLimiting } = deriveGovernance([row("crm_delete_contact", "auto")], { auto: "confirm" });
    const t = byTool["crm_delete_contact"];
    expect(t.effective).toBe("confirm");
    expect(t.heldBack).toEqual({ by: "risk", reason: "This action is consequential, so it still asks first." });
    expect(ceilingLimiting).toBe(false);
  });

  it("a HIGH tool whose ceiling is STRICTLY below the risk cap is attributed to policy", () => {
    // Ceiling forces off, which is more restrictive than the risk cap (confirm), so the ceiling is the
    // binding reason and the hold is honestly policy — and the platform IS limiting here.
    const { byTool, ceilingLimiting } = deriveGovernance([row("crm_delete_contact", "auto")], { auto: "off" });
    const t = byTool["crm_delete_contact"];
    expect(t.effective).toBe("off");
    expect(t.heldBack?.by).toBe("policy");
    expect(ceilingLimiting).toBe(true);
  });

  it("a MISSING ceiling bucket falls back to the unnarrowed stored mode (why the hook flags ceilingUnconfirmed)", () => {
    // The probe for 'auto' failed, so its bucket is unset. derive falls back to stored — i.e. it fails
    // toward MORE permissive. That is precisely why the hook raises ceilingUnconfirmed so the surface
    // says the limit is unverified rather than presenting this as confirmed-unrestricted (§13).
    const { byTool, ceilingLimiting } = deriveGovernance([row("crm_create_contact", "auto")], {});
    expect(byTool["crm_create_contact"].effective).toBe("auto");
    expect(ceilingLimiting).toBe(false);
  });

  it("owner_only reads as Your call, is not settable, and is never 'held back'", () => {
    const { byTool, domains } = deriveGovernance([row("automation_set_grant", "off")], {});
    const t = byTool["automation_set_grant"];
    expect(t.settable).toBe(false);
    expect(t.heldBack).toBeNull();
    const autos = domains.find((d) => d.key === "autos")!;
    expect(autos.counts.your_call).toBe(1);
  });

  it("ignores catalogue rows that are not mapped governed tools", () => {
    const { byTool } = deriveGovernance([row("pipeline_create", "auto"), row("crm_add_note", "auto")], {});
    expect(byTool["pipeline_create"]).toBeUndefined();
    expect(byTool["crm_add_note"]).toBeDefined();
  });

  it("carries is_default through", () => {
    const { byTool } = deriveGovernance(
      [row("crm_add_note", "confirm", true), row("crm_update_contact", "auto", false)],
      {},
    );
    expect(byTool["crm_add_note"].isDefault).toBe(true);
    expect(byTool["crm_update_contact"].isDefault).toBe(false);
  });
});

describe("deriveGovernance — domain aggregation", () => {
  it("a domain of all-auto ordinary tools reads guardrails", () => {
    const { domains } = deriveGovernance(
      [row("crm_create_contact", "auto"), row("crm_update_contact", "auto"), row("crm_add_note", "auto")],
      {},
    );
    const crm = domains.find((d) => d.key === "crm")!;
    expect(crm.posture).toBe("guardrails");
    expect(crm.level).toBe("auto");
    expect(crm.mixed).toBe(false);
  });

  it("a single held (off) tool pulls the domain aggregate to held", () => {
    const { domains } = deriveGovernance(
      [row("crm_create_contact", "auto"), row("crm_add_note", "off")],
      {},
    );
    const crm = domains.find((d) => d.key === "crm")!;
    expect(crm.posture).toBe("held");
    expect(crm.mixed).toBe(true);
  });

  it("a mix of guardrails + asks (no off) reads asks", () => {
    const { domains } = deriveGovernance(
      [row("crm_create_contact", "auto"), row("crm_update_contact", "confirm")],
      {},
    );
    expect(domains.find((d) => d.key === "crm")!.posture).toBe("asks");
  });

  it("surfaces a held-back note when a consequential tool is capped", () => {
    const { domains } = deriveGovernance([row("crm_create_contact", "auto"), row("crm_delete_contact", "auto")], {});
    const crm = domains.find((d) => d.key === "crm")!;
    expect(crm.heldBackNote).toBe("Some consequential actions here still ask first.");
  });

  it("every domain always renders (empty tools → your_call, never a crash)", () => {
    const { domains } = deriveGovernance([], {});
    expect(domains.length).toBeGreaterThan(0);
    for (const d of domains) expect(d.tools.length).toBe(0);
  });

  it("clamps the domain read-back level to the domain cap (never a level above domainMax, §70.1)", () => {
    // A domain whose only settable tool is HIGH (cap confirm) but happens to be stored 'auto' must not
    // read 'auto' on the domain knob — that would be aria-valuenow above aria-valuemax on the control.
    const { domains } = deriveGovernance([row("crm_delete_contact", "auto")], {});
    const crm = domains.find((d) => d.key === "crm")!;
    expect(crm.domainMax).toBe("confirm");
    expect(crm.level).toBe("confirm");
  });
});
