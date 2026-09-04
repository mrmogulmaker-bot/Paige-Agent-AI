/**
 * Constructs a proposal from an already authorized Pipeline read. This is NOT an
 * approval or executor: the canonical gate must claim the stored proposal, and
 * the owning SQL command must recheck authority, policy and versions under lock.
 */
type Row = Record<string, unknown>;
const row = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value);
const version = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
const named = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const unavailable = () => ({ ok: false as const, code: "MOVE_NOT_AVAILABLE", message: "That move is not available in the current workspace. Refresh the pipeline and select the deal and stage again." });

export function preparePipelineMove(snapshot: unknown, selection: { dealId: string; targetStageId: string }) {
  if (!row(snapshot) || snapshot.ok !== true || snapshot.canManage !== true ||
      !row(snapshot.pipeline) || !Array.isArray(snapshot.stages) || !Array.isArray(snapshot.deals)) return unavailable();
  const pipeline = snapshot.pipeline;
  if (!named(pipeline.id) || !named(pipeline.shortRef) || !named(pipeline.name) || !named(pipeline.lifecycleStatus) || !["draft", "active", "archived"].includes(pipeline.lifecycleStatus)) return unavailable();
  const deals = snapshot.deals.filter((item) => row(item) && item.id === selection.dealId);
  const targets = snapshot.stages.filter((item) => row(item) && item.id === selection.targetStageId);
  if (deals.length !== 1 || targets.length !== 1) return unavailable();
  const deal = deals[0] as Row;
  const target = targets[0] as Row;
  if (deal.pipelineId !== pipeline.id || target.pipelineId !== pipeline.id ||
      target.archivedAt !== null || !version(deal.version) || !version(target.version) ||
      !named(deal.title) || !named(target.label) ||
      (target.movePolicy !== "direct" && target.movePolicy !== "approval")) return unavailable();
  const sources = snapshot.stages.filter((item) => row(item) && item.id === deal.stageId && item.pipelineId === pipeline.id);
  if (sources.length !== 1 || !named(sources[0].label)) return unavailable();
  if (deal.stageId === target.id) return { ok: false as const, code: "ALREADY_IN_STAGE", message: "The deal is already in that stage. Nothing changed." };
  return {
    ok: true as const,
    command: { type: "move-deal" as const, dealId: selection.dealId, targetStageId: selection.targetStageId, expectedVersion: deal.version, expectedTargetVersion: target.version },
    pipelineId: pipeline.id,
    pipelineRef: pipeline.shortRef,
    pipelineName: pipeline.name,
    dealTitle: deal.title,
    fromStageLabel: sources[0].label as string,
    targetStageLabel: target.label,
    expectedTargetVersion: target.version,
    // A requirement for the canonical gate, never evidence that approval occurred.
    requiresOperatorCard: target.movePolicy === "approval",
  };
}
