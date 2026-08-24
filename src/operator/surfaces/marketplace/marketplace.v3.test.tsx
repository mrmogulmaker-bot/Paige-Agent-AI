import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StorefrontSurface from "@/operator/surfaces/marketplace/StorefrontSurface";
import MarketCatalogSurface from "@/operator/surfaces/marketplace/MarketCatalogSurface";
import PublishersSurface from "@/operator/surfaces/marketplace/PublishersSurface";
import {
  GRANT_RANK,
  aboveCeiling,
  catalogState,
  storefrontState,
  type Listing,
} from "@/operator/surfaces/marketplace/listingContract";

/**
 * BUILD-ORDER Layer 3c, pinned.
 *
 * THE INVARIANT THAT MATTERS MOST IS THE CEILING, and it has two halves that pull opposite ways:
 *
 *   · A listing must never read as runnable above the platform's rung. That is the governance
 *     claim the Trust Compass exists to make, and a marketplace that ignores it would sell
 *     capability the platform has said it will not grant.
 *   · A listing must never read as CAPPED when no rung is stored. The pack defaults `ceiling()`
 *     to 2 for its own demo; inheriting that default would have the console assert a governance
 *     decision nobody made, which is the §13 failure this console was rejected for twice.
 *
 * So `aboveCeiling` returns `null` rather than a boolean on an unread ceiling, and both halves
 * are asserted below — a capped listing reads capped, and an unread ceiling caps nothing.
 */

vi.mock("@/operator/data/usePlatformTrust", () => ({
  usePlatformTrust: () => ({
    level: null,
    tally: null,
    away: null,
    domains: {},
    loading: false,
    error: null,
    setLevel: async () => {},
  }),
}));

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/\s+/g, " ");

const LISTING: Listing = {
  id: "l1",
  name: "A listing",
  kind: "Skill",
  pub: "Platform · first party",
  cls: "Platform",
  version: "1.0",
  scope: "Platform-wide",
  needs: "Act and report",
  pitch: "What it does.",
  price: "—",
  state: "Listed",
};

describe("a listing answers to the ceiling, and says nothing when there is none", () => {
  it("ranks a grant by its index in the pack's own order", () => {
    expect(GRANT_RANK).toEqual([
      "Observe",
      "Draft only",
      "Ask first",
      "Act and report",
      "Autonomous",
    ]);
    expect(aboveCeiling("Autonomous", 2)).toBe(true);
    expect(aboveCeiling("Act and report", 2)).toBe(true);
    expect(aboveCeiling("Ask first", 2)).toBe(false);
    expect(aboveCeiling("Observe", 0)).toBe(false);
  });

  it("makes no claim when the platform holds no rung", () => {
    expect(aboveCeiling("Autonomous", null)).toBeNull();
    // And an unrankable grant name is not claimed to clear either.
    expect(aboveCeiling("Something else", 4)).toBeNull();
  });

  it("caps an install that outruns the ceiling, in both vocabularies", () => {
    expect(storefrontState(LISTING, 2, true)[0]).toBe("Installed · capped");
    expect(catalogState(LISTING, 2, true)).toBe("Installed · capped");
    expect(storefrontState(LISTING, 4, true)[0]).toBe("Installed");
    expect(catalogState(LISTING, 4, true)).toBe("Installed");
  });

  it("caps nothing when no rung is stored", () => {
    expect(storefrontState(LISTING, null, true)[0]).toBe("Installed");
    expect(storefrontState(LISTING, null, false)[0]).toBe("Install");
    expect(catalogState(LISTING, null, false)).toBe("Listed");
  });

  it("lets a terminal state win over the ceiling in both vocabularies", () => {
    const blocked = { ...LISTING, state: "Blocked" };
    expect(storefrontState(blocked, 0, false)[0]).toBe("Blocked");
    expect(catalogState(blocked, 0, false)).toBe("Blocked");
  });

  it("sells where the store sells and inventories where the catalog inventories", () => {
    // Same listing, same ceiling, two true sentences — the store invites, the catalog states.
    expect(storefrontState(LISTING, 4, false)[0]).toBe("Install");
    expect(catalogState(LISTING, 4, false)).toBe("Listed");
  });
});

describe("nothing is invented when nothing is wired", () => {
  const empties = [
    ["Storefront", renderToStaticMarkup(<StorefrontSurface />)],
    ["Catalog", renderToStaticMarkup(<MarketCatalogSurface />)],
    ["Publishers", renderToStaticMarkup(<PublishersSurface />)],
  ] as const;

  it.each(empties)("%s carries none of the pack's fixture listings", (_name, html) => {
    const t = text(html);
    for (const fixture of [
      "sweep-brief",
      "stalled-triage",
      "quiet-hours",
      "callback-agent",
      "reseller-pack",
      "intake-pipe",
      "churn-read",
      "auto-outreach",
      "ledger-export",
      "client-digest",
      "AUTHORIZED PUBLISHER",
    ]) {
      expect(t).not.toContain(fixture);
    }
  });

  it("Storefront says the shop is here and has nothing to sell", () => {
    const t = text(renderToStaticMarkup(<StorefrontSurface />));
    expect(t).toContain("0 of 0 listings");
    // The capped figure is an em-dash, not a zero: unknown-capped and zero-capped differ.
    expect(t).toContain("— capped by your ceiling");
    expect(t).toContain("0 out of reach");
    expect(t).toContain("Everything, including what will not run");
    // The pack's authored foot, which says what does not exist.
    expect(t).toContain("what does not exist is the install ledger");
  });

  it("Storefront ships no curated shelf it cannot fill", () => {
    const t = text(renderToStaticMarkup(<StorefrontSurface />));
    for (const title of ["Made by us", "From agencies", "Needs more room than you have given her"]) {
      expect(t).not.toContain(title);
    }
  });

  it("Catalog keeps its five shelves and reads zero on every decision", () => {
    const t = text(renderToStaticMarkup(<MarketCatalogSurface />));
    for (const kind of ["Skill", "Automation", "Integration", "Template", "Agent"]) {
      expect(t).toContain(kind);
    }
    // The four decisions, phrased as questions rather than statuses.
    expect(t).toContain("held below grant");
    expect(t).toContain("your ceiling, not their code");
    expect(t).toContain("waiting on a reviewer");
    expect(t).toContain("listed, never installed");
    expect(t).toContain("0 listings");
  });
});

describe("Publishers draws the security boundary, not a pricing table", () => {
  const html = renderToStaticMarkup(<PublishersSurface />);
  const t = text(html);

  it("names all four classes with their reach and their split", () => {
    for (const label of ["Platform", "Verified agency", "Solo", "Unverified"]) {
      expect(t).toContain(label);
    }
    expect(t).toContain("Platform-wide");
    expect(t).toContain("Its own sub-accounts");
    expect(t).toContain("100% retained");
    expect(t).toContain("70 / 30");
  });

  it("strikes through a kind the class may not ship, and says why in the title", () => {
    // Agency consults the ruling: Integration and Agent are platform-only.
    expect(html).toContain("Integration is platform-only until a security review exists");
    expect(html).toContain("Agent is platform-only until a security review exists");
    expect(html).toContain("line-through");
    // Automation is reviewed every time rather than blocked.
    expect(t).toContain("Automation · review");
    expect(html).toContain("May ship, reviewed every time");
  });

  it("counts nothing it cannot count", () => {
    // Every `listed` figure is an em-dash with no read, and Unverified stays one even with one.
    expect(t).toContain("— listed");
    const withRows = text(renderToStaticMarkup(<PublishersSurface listings={[LISTING]} />));
    expect(withRows).toContain("1 listed");
    expect(withRows).toContain("— listed"); // Unverified, which cannot list at all.
  });
});
