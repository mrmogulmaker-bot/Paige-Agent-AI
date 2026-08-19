import type { ReactNode } from "react";

import { CalendarMonth, CalendarWeek } from "@/operator/surfaces/CalendarSurfaces";
import { ComposeSurface } from "@/operator/surfaces/ComposeSurface";
import { MarketplaceReview, IntegrationsGrid } from "@/operator/surfaces/MarketplaceSurfaces";
import { SupportThread } from "@/operator/surfaces/SupportThread";

/**
 * The tabs CD does NOT draw as a generic panel all the way down.
 *
 * Six of the console's surfaces have a purpose-built body inside the ordinary page chrome:
 * Month is a real 35-cell grid, Inbox is a two-column thread, Outbound is a compose card,
 * Submissions is a review queue, Platform hours is a week ruler, Connected is a tile grid.
 * Those components are built and ported; before this they were imported and never rendered,
 * so every one of these tabs showed the registry's "not connected yet" paragraph instead of
 * CD's actual surface. Each one is handed to the single block whose body it replaces, which
 * keeps the eyebrow, title, anchor, KPIs, group chips and rail the port already carries
 * (§18: one panel renderer; §58: nothing the registry already draws is dropped).
 *
 * WHAT IS DELIBERATELY *NOT* SLOTTED — Discover. `MarketplaceStore` needs a catalog to draw,
 * and the Discover panel ALREADY renders CD's real shelves as cards beside the hero block.
 * Slotting the store with an empty catalog would replace richer ported content with a single
 * "not connected" plate AND duplicate the shelves underneath it — strictly worse on both
 * counts. It joins the others when a catalog read exists, not before (§13/§58).
 *
 * None of these components is given invented data. Each is handed what is genuinely known —
 * which today is nothing — and each states its own gap in its own words rather than drawing a
 * plausible fixture. Real reads land with the backend wiring, and only the props change.
 */
export function bespokeSlots(
  branchSlug: string,
  subSlug: string | null,
  leafSlug: string | null,
): Record<string, ReactNode> | undefined {
  const key = leafSlug ? `${branchSlug}/${subSlug}/${leafSlug}` : `${branchSlug}/${subSlug}`;
  switch (key) {
    case "calendar/month":
      // Draws the month from dates alone. `sourceConnected` stays false, so an empty grid
      // reads as "no calendar is attached" rather than as "nothing is scheduled".
      return { "month-grid": <CalendarMonth events={[]} layers={[]} sourceConnected={false} /> };
    case "calendar/settings":
      return { "platform-hours": <CalendarWeek days={[]} timezone={null} /> };
    case "marketplace/submissions":
      return { "review-cards": <MarketplaceReview submissions={[]} /> };
    case "support/inbox":
      return { thread: <SupportThread clock={null} draft={null} /> };
    case "comms/outbound":
      return { compose: <ComposeSurface subject={null} body={null} /> };
    case "settings/integrations/connected":
      return { grid: <IntegrationsGrid items={[]} /> };
    default:
      return undefined;
  }
}
