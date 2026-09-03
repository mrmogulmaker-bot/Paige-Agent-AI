// systems-check-runners/company_info_populated.ts — Check #5 (runner_key: company_info_populated).
//
// SEAM (reuse ONLY this): tenants(name, brand.about) + the Spine-owned business_context_readiness
//   contract for website/business_phone/industry (owner_confirmed = Setup has it on file) +
//   signup_intake(business_name, industry) as a supplementary source for name/industry. This is NOT
//   the verify_business flow — it only reads whether the core company profile is populated.
// CORE SET (pass): name AND website AND business_phone AND an industry (website/phone/industry from
//   the readiness contract, OR the owner's signup_intake.industry for industry specifically).
//   `about` is captured as bonus evidence but is not required for pass.
//
// This runner used to read website/business_phone/industry off tenants.brand directly, which the
// current Setup save path never writes -- a fresh scan reported "missing" regardless of what an
// Owner saved. Reading the readiness contract instead fixes this at the one broken pointer (§18).
//
// NOTE (§9/§51): signup_intake keys on user_id (the tenant OWNER), not tenant_id, so it is resolved via
//   tenants.owner_user_id — still strictly this tenant's own owner, never another tenant's.
// §32 fail-loud; §13 honest evidence.

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult, hasText } from "./_kit.ts";
import { readBusinessContextReadiness, isConfirmed } from "./_business-context-readiness.ts";

export const runnerKey = "company_info_populated";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const [tenantRes, readiness] = await Promise.all([
      admin
        .from("tenants")
        .select("name, brand, owner_user_id")
        .eq("id", tenantId)
        .maybeSingle(),
      readBusinessContextReadiness(admin, tenantId),
    ]);
    throwOnDbError(tenantRes.error, "tenants.core");
    const t = (tenantRes.data ?? {}) as {
      name?: string;
      brand?: Record<string, unknown>;
      owner_user_id?: string;
    };
    const brand = (t.brand ?? {}) as Record<string, unknown>;

    // Supplementary signup_intake, resolved via THIS tenant's owner only (§9).
    let intakeIndustry: unknown = null;
    let intakeBusinessName: unknown = null;
    if (t.owner_user_id) {
      const intakeRes = await admin
        .from("signup_intake")
        .select("business_name, industry")
        .eq("user_id", t.owner_user_id)
        .maybeSingle();
      throwOnDbError(intakeRes.error, "signup_intake");
      const si = (intakeRes.data ?? {}) as { business_name?: string; industry?: string };
      intakeIndustry = si.industry ?? null;
      intakeBusinessName = si.business_name ?? null;
    }

    const hasName = hasText(t.name) || hasText(intakeBusinessName);
    const hasWebsite = isConfirmed(readiness.website.status);
    const hasBusinessPhone = isConfirmed(readiness.business_phone.status);
    const hasIndustry = isConfirmed(readiness.industry.status) || hasText(intakeIndustry);
    const hasAbout = hasText(brand.about);

    const pass = hasName && hasWebsite && hasBusinessPhone && hasIndustry;
    const missing: string[] = [];
    if (!hasName) missing.push("company name");
    if (!hasWebsite) missing.push("website");
    if (!hasBusinessPhone) missing.push("business phone");
    if (!hasIndustry) missing.push("industry");

    return {
      status: pass ? "pass" : "fail",
      evidence: {
        has_name: hasName,
        has_website: hasWebsite,
        has_business_phone: hasBusinessPhone,
        has_industry: hasIndustry,
        has_about: hasAbout,
      },
      interpretation: pass
        ? "The core company profile is populated (name, website, business phone, industry)."
        : `Company profile is incomplete — missing: ${missing.join(", ")}.`,
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
