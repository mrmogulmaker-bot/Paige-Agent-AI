// systems-check-runners/social_handles_captured.ts — Check #3 (runner_key: social_handles_captured).
//
// §38 CAPTURE-ONLY: Paige does NOT own the tenant's social accounts, so this is a DECLARED-field read,
//   not a live per-network verification (that per-vendor deep-verify is a post-MVP Playbook slice, §38).
// SEAM (reuse ONLY this): tenants.features->'social_handles' (jsonb the L2 migration adds). Pass if any
//   handle is present. The value may be an object ({instagram:"@x", linkedin:"…"}) or an array of handles
//   — either shape counts as "captured" if it carries at least one non-empty entry.
//
// §51 tenant-scoped; §32 fail-loud; §13 honest evidence.

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult, hasText } from "./_kit.ts";

export const runnerKey = "social_handles_captured";

function countHandles(raw: unknown): number {
  if (!raw) return 0;
  if (Array.isArray(raw)) {
    return raw.filter((v) => hasText(v) || (v && typeof v === "object" && hasText((v as { handle?: string }).handle))).length;
  }
  if (typeof raw === "object") {
    return Object.values(raw as Record<string, unknown>).filter((v) => hasText(v)).length;
  }
  return hasText(raw) ? 1 : 0;
}

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const res = await admin.from("tenants").select("features").eq("id", tenantId).maybeSingle();
    throwOnDbError(res.error, "tenants.features->social_handles");

    const features = (res.data as { features?: Record<string, unknown> } | null)?.features ?? {};
    const socialHandles = (features as Record<string, unknown>)?.social_handles;
    const count = countHandles(socialHandles);
    const pass = count > 0;

    return {
      status: pass ? "pass" : "fail",
      evidence: { social_handle_count: count, declared_capture_only: true },
      interpretation: pass
        ? `${count} social handle(s) captured on the tenant profile.`
        : "No social handles captured yet — add the tenant's social accounts so Paige can reference and route to them.",
      metric: { name: "social_handle_count", value: count },
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
