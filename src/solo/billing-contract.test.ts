/**
 * Billing Foundation C — the presentation contract, asserted directly.
 *
 * The point of these tests is NOT that the resolver returns something for every input. It is the
 * negative property that the whole slice exists for: **no input that has not proven a plan can
 * produce a state that claims one**, and no state that means "we could not read this" can be
 * mistaken for "you have nothing".
 */
import { describe, expect, it } from "vitest";
import {
  resolveBillingPlanPresentation,
  resolveBillingPortalPresentation,
  type BillingPlanInput,
  type BillingPlanPresentation,
  type WorkspaceBillingEntitlement,
} from "./billing-contract";
import type { BillingAccountState, BillingScope } from "./data/useWorkspaceBillingAuthority";

const SCOPES: BillingScope[] = ["none", "sub_account", "agency", "enterprise", "top_level_solo"];
const ACCOUNT_STATES: BillingAccountState[] = ["not_applicable", "mapped", "ambiguous", "absent"];

function base(over: Partial<BillingPlanInput> = {}): BillingPlanInput {
  return { loading: false, readFailed: false, scope: "top_level_solo", canViewBilling: true, billingAccountState: "absent", entitlement: null, ...over };
}

function entitlement(over: Partial<WorkspaceBillingEntitlement> = {}): WorkspaceBillingEntitlement {
  return {
    source: "none", status: "active", label: null, planName: null, priceLabel: null,
    renewsAt: null, endsAt: null, noExpiry: false, daysRemaining: null, ...over,
  };
}

/** Every state that asserts the workspace HAS something. None may be reached without a record. */
const CLAIMS_ACCESS = new Set(["plan-current", "plan-trialing", "plan-promo", "plan-cancel-scheduled"]);
/** The one state that asserts the platform LOOKED and found nothing. */
const CLAIMS_NOTHING = "plan-none";

function allInputs(): BillingPlanInput[] {
  const out: BillingPlanInput[] = [];
  for (const scope of SCOPES) {
    for (const billingAccountState of ACCOUNT_STATES) {
      for (const loading of [true, false]) {
        for (const readFailed of [true, false]) {
          out.push(base({ scope, billingAccountState, loading, readFailed, entitlement: null }));
          out.push(base({ scope, billingAccountState, loading, readFailed, entitlement: null, canViewBilling: false }));
        }
      }
    }
  }
  return out;
}

describe("billing plan presentation — the negative properties", () => {
  it("never claims a plan, trial or promotional access without an entitlement record", () => {
    for (const input of allInputs()) {
      const r = resolveBillingPlanPresentation(input);
      expect(CLAIMS_ACCESS.has(r.state), `${r.state} from ${JSON.stringify(input)}`).toBe(false);
    }
  });

  it("never says 'no plan' for a read that was skipped, unsupported, absent, ambiguous or unavailable", () => {
    for (const input of allInputs()) {
      const r = resolveBillingPlanPresentation(input);
      expect(r.state, JSON.stringify(input)).not.toBe(CLAIMS_NOTHING);
    }
    // and the same for the two entitlement answers that are not a successful "found none"
    for (const status of ["unavailable", "not_applicable"] as const) {
      const r = resolveBillingPlanPresentation(
        base({ billingAccountState: "mapped", entitlement: entitlement({ status, source: "none" }) }),
      );
      expect(r.state).not.toBe(CLAIMS_NOTHING);
    }
  });

  it("reaches 'Choose a plan' ONLY from a successful read that returned source: none", () => {
    const r = resolveBillingPlanPresentation(
      base({ billingAccountState: "mapped", entitlement: entitlement({ source: "none", status: "active" }) }),
    );
    expect(r.state).toBe("plan-none");
  });

  it("never infers promotional access from a missing subscription (R13)", () => {
    for (const input of allInputs()) {
      expect(resolveBillingPlanPresentation(input).state).not.toBe("plan-promo");
    }
    const granted = resolveBillingPlanPresentation(
      base({ billingAccountState: "mapped", entitlement: entitlement({ source: "promotional_grant", noExpiry: true }) }),
    );
    expect(granted.state).toBe("plan-promo");
    expect(granted.body).toContain("No payment is due");
  });

  it("gives every unavailable state a cause, and never leaves one bare", () => {
    for (const input of allInputs()) {
      const r = resolveBillingPlanPresentation(input);
      if (r.state === "billing-unavailable") {
        expect(r.reason, JSON.stringify(input)).not.toBeNull();
        expect(r.body.length).toBeGreaterThan(40);
      } else {
        expect(r.reason).toBeNull();
      }
    }
  });

  it("says something true in every state — no empty heading anywhere", () => {
    for (const input of allInputs()) {
      expect(resolveBillingPlanPresentation(input).heading.trim().length).toBeGreaterThan(0);
    }
  });

  it("renders no price, renewal or invoice figure unless the projection supplied it", () => {
    const noFigures = resolveBillingPlanPresentation(
      base({ billingAccountState: "mapped", entitlement: entitlement({ source: "paid_subscription", status: "active", planName: "Solo" }) }),
    );
    expect(noFigures.fields.map((f) => f.label)).toEqual(["Plan", "Status"]);
    const withFigures = resolveBillingPlanPresentation(
      base({
        billingAccountState: "mapped",
        entitlement: entitlement({ source: "paid_subscription", status: "active", planName: "Solo", priceLabel: "$74.50 / month", renewsAt: "1 October 2026" }),
      }),
    );
    expect(withFigures.fields).toEqual([
      { label: "Plan", value: "Solo" },
      { label: "Status", value: "Active" },
      { label: "Price", value: "$74.50 / month" },
      { label: "Renews", value: "1 October 2026" },
    ]);
  });

  /**
   * The specific fabrication the owner named. The catalogue row `solo = $149/mo` exists and the
   * seeded `platform_subscriptions` rows point at it — but a catalogue price is a price LIST, not a
   * statement that this workspace is charged. Nothing in this resolver can turn one into the other,
   * because the catalogue is not an input.
   */
  it("cannot render a catalogue price: the plan catalogue is not an input to this resolver", () => {
    // SCOPE, stated precisely (a compliance read caught the over-claim): these are the states
    // reachable with NO entitlement projection — which is every state reachable today. Four of the
    // resolver's states DO render a figure once a projection exists (`plan-promo`'s "$0",
    // `plan-trialing`, `plan-current`, `plan-cancel-scheduled`), and they may: that figure comes
    // from the projection. What can never happen is a figure arriving from the CATALOGUE, because
    // the catalogue is not an input here at all.
    const withoutProjection = allInputs().map(resolveBillingPlanPresentation);
    for (const r of withoutProjection) {
      const text = [r.heading, r.body, r.note, ...r.fields.map((f) => `${f.label} ${f.value}`)].join(" ");
      expect(text).not.toMatch(/\$\s?\d/);
    }
  });
});

describe("billing plan presentation — precedence", () => {
  const cases: Array<[string, BillingPlanInput, BillingPlanPresentation["state"]]> = [
    ["loading wins over everything", base({ loading: true, readFailed: true, scope: "sub_account" }), "plan-loading"],
    ["a failed read is never a state about the account", base({ readFailed: true, scope: "sub_account" }), "plan-error"],
    ["no workspace", base({ scope: "none" }), "plan-no-workspace"],
    ["sub-account", base({ scope: "sub_account" }), "plan-subaccount"],
    ["agency", base({ scope: "agency" }), "plan-unsupported"],
    ["enterprise", base({ scope: "enterprise" }), "plan-unsupported"],
    ["ambiguous mapping beats a present entitlement", base({ billingAccountState: "ambiguous", entitlement: entitlement({ source: "paid_subscription" }) }), "billing-unavailable"],
    ["absent mapping beats a present entitlement", base({ billingAccountState: "absent", entitlement: entitlement({ source: "paid_subscription" }) }), "billing-unavailable"],
    ["mapped with no projection", base({ billingAccountState: "mapped" }), "billing-unavailable"],
    ["two records disagree", base({ billingAccountState: "mapped", entitlement: entitlement({ status: "unavailable" }) }), "billing-unavailable"],
    ["a status with no approved wording is not invented", base({ billingAccountState: "mapped", entitlement: entitlement({ source: "paid_subscription", status: "past_due" }) }), "billing-unavailable"],
    ["trial", base({ billingAccountState: "mapped", entitlement: entitlement({ source: "beta_trial", status: "trialing", daysRemaining: 19 }) }), "plan-trialing"],
    ["trial ended", base({ billingAccountState: "mapped", entitlement: entitlement({ source: "beta_trial", status: "expired" }) }), "plan-trial-ended"],
    ["cancel scheduled", base({ billingAccountState: "mapped", entitlement: entitlement({ source: "paid_subscription", status: "cancel_scheduled" }) }), "plan-cancel-scheduled"],
    ["canceled", base({ billingAccountState: "mapped", entitlement: entitlement({ source: "paid_subscription", status: "canceled" }) }), "plan-canceled"],
  ];
  for (const [name, input, expected] of cases) {
    it(name, () => expect(resolveBillingPlanPresentation(input).state).toBe(expected));
  }

  /**
   * The negative properties in the block above all pass over this: they assert what is NOT claimed,
   * and a body that wrongly says "this workspace has a billing account" claims nothing they test.
   * So it is asserted positively, per state.
   */
  it("never asserts a billing account exists unless the mapping says mapped", () => {
    for (const state of [...ACCOUNT_STATES, "pending_review" as BillingAccountState]) {
      const r = resolveBillingPlanPresentation(base({ billingAccountState: state }));
      if (state !== "mapped") {
        expect(r.state, `${state}`).toBe("billing-unavailable");
        expect(r.body, `${state}`).not.toContain("has a billing account");
      }
      const portal = resolveBillingPortalPresentation({ scope: "top_level_solo", canManageBilling: true, billingAccountState: state });
      expect(portal.canOpen, `portal ${state}`).toBe(state === "mapped");
    }
  });

  it("names an unmodelled mapping state as unknown instead of defaulting into one it models", () => {
    const r = resolveBillingPlanPresentation(base({ billingAccountState: "pending_review" as BillingAccountState }));
    expect(r.reason).toBe("mapping_unknown");
    expect(r.body).toContain("does not recognise");
  });

  it("distinguishes the five unavailable causes rather than collapsing them", () => {
    const reasons: Array<string | null> = [
      resolveBillingPlanPresentation(base({ billingAccountState: "absent" })).reason,
      resolveBillingPlanPresentation(base({ billingAccountState: "ambiguous" })).reason,
      resolveBillingPlanPresentation(base({ billingAccountState: "mapped" })).reason,
      resolveBillingPlanPresentation(base({ billingAccountState: "mapped", entitlement: entitlement({ status: "unavailable" }) })).reason,
    ];
    reasons.push(resolveBillingPlanPresentation(base({ billingAccountState: "pending_review" as BillingAccountState })).reason);
    expect(new Set(reasons).size).toBe(5);
  });

  /** Today's live answer for every current top-level workspace, asserted as such. */
  it("resolves a top-level Solo workspace with no mapping and no projection to an explained unavailable", () => {
    const r = resolveBillingPlanPresentation(base());
    expect(r.state).toBe("billing-unavailable");
    expect(r.reason).toBe("no_billing_account");
    expect(r.body).toContain("nothing is being charged");
  });
});

describe("R22 — view is a permission of its own", () => {
  it("refuses the plan to a Solo member who may not view billing, and shows them no figure", () => {
    const r = resolveBillingPlanPresentation(base({
      canViewBilling: false, billingAccountState: "mapped",
      entitlement: entitlement({ source: "paid_subscription", status: "active", planName: "Solo", priceLabel: "$74.50 / month", renewsAt: "1 October 2026" }),
    }));
    expect(r.state).toBe("role-refusal");
    expect(r.fields).toEqual([]);
    expect([r.heading, r.body].join(" ")).not.toMatch(/\$\s?\d/);
  });

  it("still shows the owner the same entitlement", () => {
    const r = resolveBillingPlanPresentation(base({
      canViewBilling: true, billingAccountState: "mapped",
      entitlement: entitlement({ source: "paid_subscription", status: "active", planName: "Solo", priceLabel: "$74.50 / month" }),
    }));
    expect(r.state).toBe("plan-current");
    expect(r.fields.some((f) => f.value === "$74.50 / month")).toBe(true);
  });

  it("does not let a view refusal mask a failed read or a wrong scope", () => {
    expect(resolveBillingPlanPresentation(base({ canViewBilling: false, readFailed: true })).state).toBe("plan-error");
    expect(resolveBillingPlanPresentation(base({ canViewBilling: false, loading: true })).state).toBe("plan-loading");
    expect(resolveBillingPlanPresentation(base({ canViewBilling: false, scope: "sub_account" })).state).toBe("plan-subaccount");
  });
});

describe("manage billing entry", () => {
  it("refuses a non-owner before offering anything", () => {
    const r = resolveBillingPortalPresentation({ scope: "top_level_solo", canManageBilling: false, billingAccountState: "mapped" });
    expect(r.state).toBe("role-refusal");
    expect(r.canOpen).toBe(false);
  });

  it("is not applicable outside a top-level Solo workspace, whatever the mapping says", () => {
    for (const scope of SCOPES.filter((s) => s !== "top_level_solo")) {
      for (const billingAccountState of ACCOUNT_STATES) {
        const r = resolveBillingPortalPresentation({ scope, canManageBilling: true, billingAccountState });
        expect(r.state).toBe("portal-not-applicable");
        expect(r.canOpen).toBe(false);
      }
    }
  });

  it("states why it cannot open rather than offering a button that must fail", () => {
    for (const billingAccountState of ["absent", "ambiguous"] as const) {
      const r = resolveBillingPortalPresentation({ scope: "top_level_solo", canManageBilling: true, billingAccountState });
      expect(r.state).toBe("portal-unavailable");
      expect(r.canOpen).toBe(false);
      expect(r.body.length).toBeGreaterThan(40);
    }
  });

  it("offers the act only to an owner of a mapped top-level Solo workspace", () => {
    const r = resolveBillingPortalPresentation({ scope: "top_level_solo", canManageBilling: true, billingAccountState: "mapped" });
    expect(r.state).toBe("portal-entry");
    expect(r.canOpen).toBe(true);
  });
});
