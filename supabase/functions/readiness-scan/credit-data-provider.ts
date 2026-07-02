// §193 — Vendor-neutral credit data provider interface.
// Tenants select a provider via `tenant_features.credit_data_provider`.
// Vendor-specific implementations live in `./adapters/<vendor>.ts`.

export interface CreditPullResult {
  ok: boolean;
  calls: number;
  cost_usd: number;
  snapshot: unknown | null;
  error?: string;
}

export interface CreditDataProvider {
  id: string;
  unitCostUsd: number;
  pullSnapshot(contactUserId: string): Promise<CreditPullResult>;
}

import { isoftpullAdapter } from "./adapters/isoftpull.ts";

const REGISTRY: Record<string, CreditDataProvider> = {
  isoftpull: isoftpullAdapter,
  // smartcredit: smartcreditAdapter,  // future
  // nav_com: navComAdapter,           // future
};

export function resolveCreditDataProvider(id: string | null | undefined): CreditDataProvider | null {
  if (!id || id === "none") return null;
  return REGISTRY[id] ?? null;
}
