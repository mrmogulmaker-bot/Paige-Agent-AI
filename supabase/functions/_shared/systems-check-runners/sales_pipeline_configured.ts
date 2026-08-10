// systems-check-runners/sales_pipeline_configured.ts — Check #7 (runner_key: sales_pipeline_configured).
//
// SEAM (reuse ONLY this): pipelines (a NON-default row for the tenant, is_default=false) that HAS at least
//   one pipeline_stages row. A tenant "configured a sales pipeline" when they authored their own pipeline
//   (beyond the seeded generic default) and gave it stages. Deals are optional (not required for pass).
//
// §51 tenant-scoped (pipelines + stages both filtered/joined to ctx.tenantId). §32 fail-loud; §13 honest.

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "./_kit.ts";

export const runnerKey = "sales_pipeline_configured";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const pipesRes = await admin
      .from("pipelines")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_default", false);
    throwOnDbError(pipesRes.error, "pipelines");

    const pipelineIds = ((pipesRes.data ?? []) as Array<{ id: string }>).map((p) => p.id);
    const hasCustomPipeline = pipelineIds.length > 0;

    let hasStages = false;
    if (hasCustomPipeline) {
      const stagesRes = await admin
        .from("pipeline_stages")
        .select("id")
        .in("pipeline_id", pipelineIds)
        .limit(1);
      throwOnDbError(stagesRes.error, "pipeline_stages");
      hasStages = (stagesRes.data?.length ?? 0) > 0;
    }

    const pass = hasCustomPipeline && hasStages;

    return {
      status: pass ? "pass" : "fail",
      evidence: {
        custom_pipeline_count: pipelineIds.length,
        has_stages: hasStages,
      },
      interpretation: pass
        ? "A tenant-authored sales pipeline with stages is configured."
        : hasCustomPipeline
          ? "A custom pipeline exists but has no stages — add the stages so deals can move through it."
          : "No tenant-authored sales pipeline yet — set up the pipeline and its stages so Paige can track deals.",
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
