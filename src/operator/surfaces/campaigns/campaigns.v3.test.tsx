import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CampaignsActive from "@/operator/surfaces/campaigns/CampaignsActive";
import CatalogSurface from "@/operator/surfaces/campaigns/CatalogSurface";
import SalesSurface from "@/operator/surfaces/campaigns/SalesSurface";
import { clampGrant, money } from "@/operator/surfaces/campaigns/campaignContract";
import type { CampaignRow, OfferRow, SalesLine } from "@/operator/surfaces/campaigns/campaignContract";

/**
 * The money spine's two invariants, pinned.
 *
 * 1. SALES DERIVES. Claude Design's constraint on this group is that Sales *"must derive from
 *    lines, never hold its own ledger"* — restated in the builder header (*"Every figure is a
 *    sum over the lines. Nothing on this surface is typed."*) and again in the foot. A typed
 *    total is the regression that matters here, because it would be a revenue figure nothing
 *    backs, so the sums are asserted against known lines rather than trusted.
 *
 * 2. NOTHING IS INVENTED WHEN NOTHING IS WIRED. All three surfaces ship with no rows, which is
 *    the finished Layer 3 state under BUILD-ORDER's structure-before-data rule. A future edit
 *    that "helpfully" seeds the pack's illustration would put fabricated campaigns, prices and
 *    revenue on an operator's screen — so the empty render is asserted to carry the authored
 *    absence and none of the pack's fixture strings.
 */

vi.mock("@/operator/data/usePlatformTrust", () => ({
  usePlatformTrust: () => ({
    level: 2,
    tally: [0, 23, 0, 0],
    away: "hold",
    domains: {},
    loading: false,
    error: null,
    setLevel: async () => {},
  }),
}));

const OFFERS: OfferRow[] = [
  {
    id: "off-1",
    name: "Tenancy",
    kind: "product",
    category: "Platform",
    state: "selling",
    price: 490,
    period: "monthly",
    unit: "per tenant",
    pitch: "One tenant on the operator substrate.",
    tiers: [],
    where: ["Outreach"],
    fulfil: [["What", "A provisioned tenant"]],
  },
];

const LINES: SalesLine[] = [
  { id: "l1", when: "4 Feb", day: 4, offerId: "off-1", tier: "Standalone", who: "A", camp: "Outreach", stage: "Paid", state: "booked", amount: 1000 },
  { id: "l2", when: "3 Feb", day: 3, offerId: "off-1", tier: "Standalone", who: "B", camp: "Outreach", stage: "Paid", state: "booked", amount: 500 },
  { id: "l3", when: "2 Feb", day: 2, offerId: "off-1", tier: "Standalone", who: "C", camp: "Outreach", stage: "Paid", state: "refunded", amount: 300 },
  { id: "l4", when: "1 Feb", day: 1, offerId: "off-1", tier: "Standalone", who: "D", camp: "— direct", stage: "Invoiced", state: "pending", amount: 250 },
];

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/&minus;/g, "−")
    .replace(/\s+/g, " ");

describe("Sales derives every figure from the lines", () => {
  it("sums booked, refunded, net and in-flight rather than reading a stored total", () => {
    const t = text(
      renderToStaticMarkup(<SalesSurface lines={LINES} offers={OFFERS} target={null} />),
    );
    expect(t).toContain("$1,500"); // booked: 1000 + 500
    expect(t).toContain("−$300"); // refunded reverses the line and keeps the record
    expect(t).toContain("$1,200"); // net: booked less refunds
    expect(t).toContain("$250"); // in flight: invoiced, not landed
  });

  it("shows no percentage against a target nobody set", () => {
    const t = text(
      renderToStaticMarkup(<SalesSurface lines={LINES} offers={OFFERS} target={null} />),
    );
    expect(t).toContain("No target is set");
    expect(t).not.toMatch(/\d+%/);
  });

  it("measures against a target once one exists", () => {
    const t = text(
      renderToStaticMarkup(
        <SalesSurface
          lines={LINES}
          offers={OFFERS}
          target={{ period: "this quarter", target: 2400, note: "Set by hand." }}
        />,
      ),
    );
    expect(t).toContain("50%"); // 1200 of 2400
  });

  it("keeps the §38 money boundary in the pack's own words", () => {
    const t = text(renderToStaticMarkup(<SalesSurface />));
    expect(t).toContain("the provider is an adapter, not the interface");
    expect(t).toContain(
      "No tenant sale is ever split. Revenue share exists in the marketplace and nowhere else.",
    );
    expect(t).toContain("Marketplace only — never tenant sales");
  });
});

describe("nothing is invented when nothing is wired", () => {
  const empties = [
    ["Active", renderToStaticMarkup(<CampaignsActive />)],
    ["Catalog", renderToStaticMarkup(<CatalogSurface />)],
    ["Sales", renderToStaticMarkup(<SalesSurface />)],
  ] as const;

  it.each(empties)("%s renders the authored absence", (_name, html) => {
    const t = text(html);
    expect(t).toContain("Substrate exists · one seam missing");
    expect(t).toContain("an order cannot name a campaign");
  });

  it.each(empties)("%s carries none of the pack's fixture rows", (_name, html) => {
    const t = text(html);
    // Named campaigns and offerings CD drew to illustrate the surfaces.
    for (const fixture of [
      "Reseller intent",
      "Operator outreach",
      "Provisioning welcome",
      "Standalone tenancy",
      "Fractional operator",
      "Agent build",
    ]) {
      expect(t).not.toContain(fixture);
    }
    // And no money figure at all, since no line exists to sum.
    expect(t).not.toMatch(/\$\d/);
  });

  it("Active shows zero on every filter rather than hiding the counts", () => {
    const t = text(renderToStaticMarkup(<CampaignsActive />));
    expect(t).toContain("Active");
    expect(t).toContain("Everything");
    expect(t).toContain("0 campaigns · all states");
  });
});

describe("a campaign grant answers to the Trust Compass ceiling", () => {
  /**
   * CD's comment on `clampGrant`: *"Inventing a second scale here is what made every agent read
   * Held at the default."* So the grant runs the SAME arithmetic as the compass tally, and a
   * platform with no stored rung reports the grant as unknown rather than clamping against a
   * ceiling that does not exist.
   */
  it("never reads above the ceiling", () => {
    expect(clampGrant("Autonomous", 4)).toBe("Autonomous");
    expect(clampGrant("Autonomous", 2)).toBe("Ask first");
    expect(clampGrant("Autonomous", 1)).toBe("Observe");
    expect(clampGrant("Autonomous", 0)).toBe("Held");
  });

  it("never promotes a grant the campaign does not carry", () => {
    expect(clampGrant("Draft only", 4)).toBe("Observe");
    expect(clampGrant("Ask first", 4)).toBe("Ask first");
  });

  it("reports unknown, not clamped, when the platform holds no rung", () => {
    expect(clampGrant("Autonomous", null)).toBeNull();
  });

  it("renders the clamped grant on the card", () => {
    const campaign: CampaignRow = {
      id: "c1",
      name: "A motion",
      kind: "outbound",
      state: "running",
      channel: "Email",
      segment: "a segment",
      grant: "Autonomous",
      opened: null,
      reach: null,
      offerId: null,
      steps: [{ name: "Intro", at: "day 0", done: true, held: false, body: "" }],
    };
    // The mocked ceiling is 2 (Ask first), so an Autonomous grant must read down to it.
    const t = text(renderToStaticMarkup(<CampaignsActive campaigns={[campaign]} />));
    expect(t).toContain("Ask first");
    expect(t).not.toContain("Autonomous");
  });
});

describe("money()", () => {
  it("states an absence rather than asserting a zero", () => {
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
    expect(money(0)).toBe("$0");
    expect(money(1234567)).toBe("$1,234,567");
  });
});
