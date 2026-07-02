// §193 — Vendor adapter for iSoftpull credit data provider.
// Vendor names are permitted here because this file is a clearly labeled
// vendor-specific adapter. Platform code must reference the neutral
// `CreditDataProvider` interface, never this module directly outside the
// adapter registry.

import type { CreditDataProvider, CreditPullResult } from "../credit-data-provider.ts";

const UNIT_COST_USD = 0.35; // placeholder until real contract price is wired

export const isoftpullAdapter: CreditDataProvider = {
  id: "isoftpull",
  unitCostUsd: UNIT_COST_USD,
  async pullSnapshot(_contactUserId: string): Promise<CreditPullResult> {
    // Placeholder pull — real integration will hit iSoftpull API here.
    // Kept as a no-op that reports one billable call so cost tracking
    // stays honest until the live wire-up lands.
    return { ok: true, calls: 1, cost_usd: UNIT_COST_USD, snapshot: null };
  },
};
