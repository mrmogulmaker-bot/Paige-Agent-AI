// systems-check-runners/revenue_tracking_configured.ts — Check #8 (runner_key: revenue_tracking_configured).
//
// SEAM (reuse ONLY this): the tenant's own `pipeline_stages`, read directly with an explicit
//   tenant_id. Nothing else. This check answers one question — CAN this workspace record money as
//   landed? — and it answers it from pipeline shape alone.
//
// ─── WHY THIS WAS REWRITTEN, so nobody points it back at the operator (owner ruling 2026-09-05) ───
//
// It used to call `operator_revenue_integrity_audit`, which measures whether the PLATFORM is billing
// this tenant correctly — an "agreement + live subscription + classification" chain. That is
// is_platform_owner()-gated, the scan runs as service-role with no user identity, so it raised 42501
// on every tenant, every run, forever. The check reported an honest `skip`, and every workspace on
// the platform therefore carried a permanent PARTIAL badge it could never clear.
//
// The owner's ruling: *"The revenue tracking is not from the platform admin. It should be isolated
// for the tenant... all of the sales revenue that sits inside the campaigns and tracks throughout
// the metrics — that has to do with the revenue that the actual customer is making."* The check was
// correctly named and correctly placed; it was pointed at the wrong data.
//
// DO NOT "improve" this by calling `practice_dashboard_metrics()`. It computes exactly the right
// numbers, and it derives its tenant from `current_user_tenant_id()` and raises
// `practice_scope_forbidden` when that is NULL — which is always, here. Reaching for it would
// reproduce the original defect through a different door.
//
// ─── WHAT IT ASSERTS, AND WHY THAT AND NOT SOMETHING ELSE ─────────────────────────────────────
//
// PASS iff the tenant owns at least one LIVE stage of type 'won'. That is the structural
// precondition for any deal to ever be recorded as money landed.
//
// `archived_at IS NULL` is load-bearing, not defensive tidiness. Archiving a stage is a shipped
// one-click control (`growth2.tsx` renders Archive on every stage with no won-stage guard, and
// Paige exposes "archive-stage" via `pipeline_configure`). `enforce_deal_tenant_links()` raises
// DEAL_STAGE_INVALID_OR_ARCHIVED on an archived target, and `prevent_occupied_stage_archive()`
// only blocks archiving a stage that already HOLDS deals — every won stage on production is empty,
// so every one of them is archivable right now. Without this clause the check would report
// "ready" about a stage no deal can ever enter again, which is precisely the silent failure it
// exists to catch.
//
// Scoped on `pipeline_stages.tenant_id`, NOT through `pipelines`. Two reasons, both measured:
// production carries orphan `pipelines` rows with `tenant_id IS NULL` holding real stages, so
// joining through them reaches across unowned rows (§9); and scoping through
// `pipelines.is_default = false` — the way its sibling does — was measured to agree with
// `sales_pipeline_configured` on 14 of 14 tenants, i.e. the same check wearing two names.
//
// PIPELINE SCOPE — read this before "fixing" the missing pipeline predicate. The §39 peer gate
// raised it and it is genuinely half right, so the decision is recorded rather than left to be
// re-argued. The read is tenant-wide: it asks "does this tenant own a live won stage", while a deal
// is confined to its OWN pipeline's stages (`enforce_deal_tenant_links()` requires
// `s.pipeline_id = new.pipeline_id`; `move_deal` selects the target with
// `pipeline_id = _deal.pipeline_id`). Those are different propositions and this check asserts the
// second from the first.
//
// It is NOT narrowed, for three measured reasons:
//   1. DRAFT pipelines are fully workable — `growth2.tsx` filters only `lifecycleStatus !==
//      "archived"` — so counting a draft's won stage is correct, not a false pass.
//   2. An ARCHIVED pipeline's live won stage can still legitimately receive a deal: nothing —
//      not the trigger, not `move_deal`, not Paige's `deal_create` — reads
//      `pipelines.lifecycle_status`, and the resulting deal stamps `status='won'`, which
//      `won_value_cents` counts. Excluding it would produce a FALSE FAIL, trading a rare
//      over-claim for a rare false alarm. Archiving is also refused while any deal, route,
//      approval, automation or history exists, so such a pipeline is by construction one the
//      tenant never worked in.
//   3. `won_value_cents` — the consumer this check exists to protect — is itself tenant-wide with
//      no pipeline or lifecycle filter. The runner's granularity matches its consumer's.
// Production carries zero occurrences: of the tenants holding a won stage, every one sits in an
// `active` pipeline — zero draft, zero archived, zero orphan (measured 2026-09-05).
//
// What the gate WAS right about is fixed: the pass sentence no longer says "your pipeline" in the
// singular, because on a multi-pipeline tenant that asserted something this read never checked.
//
// THE HARD RULE (owner-implied, stated explicitly): a workspace that tracks correctly and has sold
// NOTHING must PASS. Zero revenue is not a broken setup. Honoured structurally — the verdict never
// reads the `deals` table at all, so no quantity of revenue, including none, can produce a fail.
// Deal counts ride along as evidence only.
//
// §51 tenant-scoped. §32 fail-loud. §13 honest — and deliberately silent about what the revenue
// FIGURE will show, because `won_value_cents` additionally requires `actual_close_date` to be set
// and is a 30-day rolling window. A live won stage does not promise a non-zero number.

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "./_kit.ts";

export const runnerKey = "revenue_tracking_configured";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const stagesRes = await admin
      .from("pipeline_stages")
      .select("id, archived_at")
      .eq("tenant_id", tenantId)
      .eq("stage_type", "won");
    throwOnDbError(stagesRes.error, "pipeline_stages");

    const wonStages = (stagesRes.data ?? []) as Array<{ id: string; archived_at: string | null }>;
    const live = wonStages.filter((s) => s.archived_at === null);
    const archived = wonStages.length - live.length;

    // Evidence only — never part of the verdict (see THE HARD RULE above).
    const dealsRes = await admin
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    throwOnDbError(dealsRes.error, "deals");
    const dealCount = dealsRes.count ?? 0;

    const evidence = {
      live_won_stages: live.length,
      archived_won_stages: archived,
      deal_count: dealCount,
    };

    if (live.length > 0) {
      return {
        status: "pass",
        evidence,
        // Says what is TRUE of the setup. Says nothing about what the revenue figure will show, and
        // nothing about the pipeline in general — its sibling check owns that sentence, and on most
        // tenants the two disagree, so a broad claim here would contradict it on the same screen.
        //
        // "You have a live stage", not "YOUR PIPELINE has a stage": the read is tenant-wide, so on a
        // tenant owning several pipelines the singular was asserting something it had not checked —
        // see the note on pipeline scope in the header.
        interpretation:
          "You have a live stage that marks a deal as won, so a sale can be recorded against it.",
      };
    }

    if (archived > 0) {
      // The silent failure. The stage exists in the record, so nothing looks missing, but an
      // archived stage rejects every deal — revenue would read zero indefinitely with no signal.
      return {
        status: "fail",
        evidence,
        interpretation:
          "The stage that marks a deal as won has been archived, so no deal can be moved into it and no revenue can be recorded. Restore it or add a new closing stage.",
      };
    }

    return {
      status: "fail",
      evidence,
      interpretation:
        "No stage marks a deal as won yet, so there is nothing for revenue to be recorded against. Add a closing stage to your pipeline.",
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
