import React from "react";
import { Navigate } from "react-router-dom";
import { useTenantFeature } from "@/hooks/useTenantFeature";

/**
 * Funding/credit is an opt-in vertical, never a platform default (§2/§9).
 * These guards keep funding-specific admin surfaces reachable ONLY for tenants
 * whose config turns the `funding_readiness` feature on (the credit/funding
 * Playbook enables it). Generic coaching/consulting/agency tenants never see
 * them — including via a direct URL.
 */

/**
 * FundingRoute — route-level guard. A non-funding tenant who navigates directly
 * to a funding URL is bounced back to /admin. While the flag resolves we render
 * nothing so finance content never flashes.
 */
export function FundingRoute({ children }: { children: React.ReactNode }) {
  const { enabled, loading } = useTenantFeature("funding_readiness");
  if (loading) return null;
  return enabled ? <>{children}</> : <Navigate to="/admin" replace />;
}

/**
 * FundingGate — inline guard for a finance block that lives *inside* a route
 * shared with non-finance content (e.g. the funding accuracy panel beside the
 * generic analytics dashboard). Hides its children for non-funding tenants and
 * during flag resolution; no redirect.
 */
export function FundingGate({ children }: { children: React.ReactNode }) {
  const { enabled } = useTenantFeature("funding_readiness");
  return enabled ? <>{children}</> : null;
}
