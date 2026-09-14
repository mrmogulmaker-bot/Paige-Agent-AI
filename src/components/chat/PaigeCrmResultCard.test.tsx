import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaigeCrmResultCard } from "./PaigeCrmResultCard";

describe("PaigeCrmResultCard", () => {
  it("renders server readback, durable receipt, and the exact router-owned link", () => {
    const html = renderToStaticMarkup(<PaigeCrmResultCard result={{
      action: "deal.move",
      outcome: "succeeded",
      readback: { id: "deal-1", title: "Northwind renewal" },
      receipt_recorded: true,
      record_locator: { record_id: "deal-1", surface_url: "/solo/100/growth", deep_link: "/solo/100/growth?deal=deal-1", deep_link_status: "exact" },
    }} />);
    expect(html).toContain("Northwind renewal");
    expect(html).toContain("Recorded in Paige activity.");
    expect(html).toContain('href="/solo/100/growth?deal=deal-1"');
    expect(html).toContain("Open exact record");
  });

  it("labels activity as internal-only and does not invent a link", () => {
    const html = renderToStaticMarkup(<PaigeCrmResultCard result={{
      action: "activity.log",
      outcome: "succeeded",
      readback: { id: "activity-1" },
      receipt_recorded: true,
      record_locator: null,
      external_effect: false,
    }} />);
    expect(html).toContain("Logged internally only; nothing was sent or called.");
    expect(html).not.toContain("href=");
  });
});