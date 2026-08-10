// systems-check-runners/comms_configured.ts — Check #1 (runner_key: comms_configured).
//
// SEAM (reuse ONLY this): tenant_email_identities (a row exists) AND
//   (tenant_phone_numbers.is_primary OR a tenant_a2p_registrations row) AND tenants.business_phone.
// A tenant is "comms configured" when it can BOTH email (an identity registered) and text/call (a
// primary from-number or an A2P registration) AND has a business phone on record.
//
// §51 tenant-scoped: every read is `.eq("tenant_id", ctx.tenantId)` (the tenants row keys on id).
// §32 fail-loud: any db error throws → status:'error' (never a silent pass). §13 honest evidence.
// NOTE: the core does the forge(remediation) + department routing from the registry row on 'fail';
//   this runner only observes and returns the CheckResult (the CheckResult interface carries no
//   draftedFix/departmentSlug field — that is the core's job, §18 one home).

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult, hasText } from "./_kit.ts";

export const runnerKey = "comms_configured";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const [emailRes, phoneRes, a2pRes, tenantRes] = await Promise.all([
      admin.from("tenant_email_identities").select("id").eq("tenant_id", tenantId).limit(1),
      admin.from("tenant_phone_numbers").select("id").eq("tenant_id", tenantId).eq("is_primary", true).limit(1),
      admin.from("tenant_a2p_registrations").select("tenant_id").eq("tenant_id", tenantId).limit(1),
      admin.from("tenants").select("business_phone").eq("id", tenantId).maybeSingle(),
    ]);
    throwOnDbError(emailRes.error, "tenant_email_identities");
    throwOnDbError(phoneRes.error, "tenant_phone_numbers");
    throwOnDbError(a2pRes.error, "tenant_a2p_registrations");
    throwOnDbError(tenantRes.error, "tenants.business_phone");

    const hasEmailIdentity = (emailRes.data?.length ?? 0) > 0;
    const hasPrimaryPhone = (phoneRes.data?.length ?? 0) > 0;
    const hasA2p = (a2pRes.data?.length ?? 0) > 0;
    const businessPhone = (tenantRes.data as { business_phone?: string } | null)?.business_phone ?? null;
    const hasBusinessPhone = hasText(businessPhone);

    const canText = hasPrimaryPhone || hasA2p;
    const pass = hasEmailIdentity && canText && hasBusinessPhone;

    const missing: string[] = [];
    if (!hasEmailIdentity) missing.push("no sending email identity");
    if (!canText) missing.push("no primary phone number or A2P registration");
    if (!hasBusinessPhone) missing.push("no business phone on the profile");

    return {
      status: pass ? "pass" : "fail",
      evidence: {
        has_email_identity: hasEmailIdentity,
        has_primary_phone: hasPrimaryPhone,
        has_a2p_registration: hasA2p,
        has_business_phone: hasBusinessPhone,
      },
      interpretation: pass
        ? "Communications are configured — a sending email identity plus a phone/A2P path and a business phone are on record."
        : `Communications are not fully set up: ${missing.join("; ")}.`,
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
