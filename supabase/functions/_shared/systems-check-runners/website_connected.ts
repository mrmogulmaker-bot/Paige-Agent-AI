// systems-check-runners/website_connected.ts — Check #2 (runner_key: website_connected).
//
// SEAM (reuse ONLY this): growth_pages (a published row: status='published') OR a non-empty
//   tenants.brand->>'website' (the §10 config-as-data home; there is no tenants.website column).
//   A tenant "has a website" if they either published a page in the platform's own growth
//   authoring seam OR declared an external site URL on their brand profile.
//
// §51 tenant-scoped; §32 fail-loud; §13 honest evidence. Remediation forge + routing is the core's job.

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult, hasText } from "./_kit.ts";

export const runnerKey = "website_connected";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const [pageRes, tenantRes] = await Promise.all([
      admin
        .from("growth_pages")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("status", "published")
        .limit(1),
      admin.from("tenants").select("brand").eq("id", tenantId).maybeSingle(),
    ]);
    throwOnDbError(pageRes.error, "growth_pages");
    throwOnDbError(tenantRes.error, "tenants.brand");

    const hasPublishedPage = (pageRes.data?.length ?? 0) > 0;
    // external site URL lives in the tenant-authored brand jsonb (no tenants.website column).
    const brand = ((tenantRes.data as { brand?: Record<string, unknown> } | null)?.brand ?? {}) as Record<string, unknown>;
    const website = brand.website ?? null;
    const hasDeclaredSite = hasText(website);
    const pass = hasPublishedPage || hasDeclaredSite;

    return {
      status: pass ? "pass" : "fail",
      evidence: {
        has_published_growth_page: hasPublishedPage,
        has_declared_website: hasDeclaredSite,
      },
      interpretation: pass
        ? hasPublishedPage
          ? "A published page exists in the growth authoring seam — the tenant has a live web presence."
          : "An external website URL is on the tenant profile."
        : "No published page and no website URL on file — the tenant has no connected web presence yet.",
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
