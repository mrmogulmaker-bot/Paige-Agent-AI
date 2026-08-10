// operator/operator_doctrine_binding.ts — OPERATOR check #9 (runner_key: operator_doctrine_binding).
//
// SEAM (reuse ONLY these): public.user_roles (the super_admin/God grant — §53) + public.paige_owner_memory
// (the §52 operator briefing memory). Service role reads directly (platform-global, no tenant filter, §53).
// This proves the operator governance binding is intact: a God account exists and the operator opens every
// session already briefed (§52).
//
// VERDICT (§13 honest):
//   • >= 1 super_admin AND >= 1 active owner-memory row → 'pass'.
//   • 0 super_admin (no God account) OR 0 active owner-memory (operator not briefed) → 'fail'.
// A super_admin count > 1 is reported (the §53 target is a single God account until more are invited) but
// is NOT a fail on its own — invited operators are legitimate.
// §32 fail-loud: a db error throws → status:'error'.

import type { CheckRunner } from "../../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "../_kit.ts";

export const runnerKey = "operator_doctrine_binding";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin } = ctx;
  try {
    const [superAdminRes, ownerMemRes] = await Promise.all([
      admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "super_admin"),
      admin.from("paige_owner_memory").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    throwOnDbError(superAdminRes.error, "user_roles.super_admin");
    throwOnDbError(ownerMemRes.error, "paige_owner_memory.active");

    const superAdmins = superAdminRes.count ?? 0;
    const ownerMemories = ownerMemRes.count ?? 0;

    const hasGod = superAdmins >= 1;
    const hasBriefing = ownerMemories >= 1;
    const pass = hasGod && hasBriefing;

    const gaps: string[] = [];
    if (!hasGod) gaps.push("no super_admin (God) account is provisioned (§53)");
    if (!hasBriefing) gaps.push("the operator has no seeded briefing memory (§52)");

    return {
      status: pass ? "pass" : "fail",
      evidence: {
        super_admin_count: superAdmins,
        owner_memory_active: ownerMemories,
        super_admin_advisory: superAdmins > 1 ? "more_than_one_super_admin" : null,
      },
      interpretation: pass
        ? `Operator doctrine binding is intact — ${superAdmins} super_admin account(s) and ${ownerMemories} active operator-briefing memory row(s).${superAdmins > 1 ? " Note: more than one super_admin exists (§53 target is a single God account until more are invited)." : ""}`
        : `Operator doctrine binding is incomplete: ${gaps.join("; ")}.`,
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
