/**
 * RequireFeature — the §60 ROUTE-level tier gate (owner-ruled 2026-08-11).
 *
 * The nav (AdminLayout) hides a hub a tier doesn't have, but hiding a link is not
 * a lock (§13) — an agency user could still type "/choose-account" or
 * "/choose-account" and reach a surface their tier doesn't get. This wrapper makes
 * the lock REAL: it reads the ONE tier helper (`useTierFeatures`) and, if the
 * current classification's baseline does NOT include `feature`, redirects to the
 * safe home (`/choose-account`) instead of rendering the surface.
 *
 * §18 ONE HOME: the single route-guard primitive for every tier-feature-gated
 * route. Route decisions derive from the §60 helper — never an inline
 * `account_type` compare (which `lint:tier-features` rejects).
 */

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { tenantRoutePrefixForPath } from "@/components/tenant-shell/tenantShellRoutes";
import { useTierFeatures } from "@/hooks/useTierFeatures";
import type { Feature } from "@/lib/tier/tierFeatures";

export function RequireFeature({
  feature,
  children,
}: {
  feature: Feature;
  children: ReactNode;
}) {
  const { has, loading } = useTierFeatures();
  const location = useLocation();
  // Hold while the tenant context resolves — before it does, `activeTenant` is
  // null and the classification defaults to the permissive `solo` tier, so
  // deciding now would flash the forbidden surface to an agency user deep-linking
  // the route (fail-open). Mirrors FundingRoute's loading guard (§18).
  if (loading) return null;
  // Not available on this account type → redirect to the tenant/operator home.
  if (!has(feature)) {
    const root = tenantRoutePrefixForPath(location.pathname);
    return <Navigate to={root ? `${root}/command-center` : "/choose-account"} replace />;
  }
  return <>{children}</>;
}

export default RequireFeature;
