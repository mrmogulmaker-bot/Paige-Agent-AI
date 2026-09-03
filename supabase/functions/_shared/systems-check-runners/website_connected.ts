// systems-check-runners/website_connected.ts — Check #2 (runner_key: website_connected).
//
// SEAM (reuse ONLY this): growth_pages (a published row: status='published') OR the Spine-owned
//   business_context_readiness contract's 'website' field (owner_confirmed = Setup has a website
//   on file). A tenant "has a website" if they either published a page in the platform's own
//   growth authoring seam OR confirmed an external site URL in Setup.
//
// This runner used to read tenants.brand->>'website' directly, which the current Setup save path
// (save_solo_setup_context -> save_solo_setup_identity) never writes -- a fresh scan reported
// "missing" regardless of what an Owner saved. Reading the readiness contract instead fixes this
// at the one broken pointer (§18) rather than re-deriving Setup's storage shape here.
//
// §51 tenant-scoped; §32 fail-loud; §13 honest evidence. Remediation forge + routing is the core's job.

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "./_kit.ts";
import { readBusinessContextReadiness, isConfirmed } from "./_business-context-readiness.ts";

export const runnerKey = "website_connected";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const [pageRes, readiness] = await Promise.all([
      admin
        .from("growth_pages")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("status", "published")
        .limit(1),
      readBusinessContextReadiness(admin, tenantId),
    ]);
    throwOnDbError(pageRes.error, "growth_pages");

    const hasPublishedPage = (pageRes.data?.length ?? 0) > 0;
    const hasDeclaredSite = isConfirmed(readiness.website.status);
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
