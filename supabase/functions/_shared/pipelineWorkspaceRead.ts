/** Caller-JWT read adapter only. The caller must authenticate the user and supply
 * the server-resolved conversation tenant, never a tool/request tenant. This
 * module grants no mutation permission; every write must recheck its own guards.
 * get_pipeline_workspace embeds get_pipeline_catalogue and returns unpaginated
 * tenant stages but visibility-filtered deals. Reads are NOT an atomic snapshot.
 */
export type PipelineCallerRpc = (name: string, args?: Record<string, unknown>) =>
  PromiseLike<{ data: unknown; error: unknown }>;
export type PipelineWorkspaceSelection = { pipelineId?: string; pipelineRef?: string };
export type PipelineReadStage = {
  id: string; pipelineId: string; label: string; version: number;
  movePolicy: "direct" | "approval"; archivedAt: string | null; orderIndex: number;
};
export type PipelineReadDeal = {
  id: string; pipelineId: string; stageId: string; version: number; title: string; status: string;
};
export type PipelineWorkspaceReadResult = {
  ok: true;
  pipeline: { id: string; shortRef: string; name: string; version: number;
    lifecycleStatus: string; stageCount: number; dealCount: number };
  stages: PipelineReadStage[]; deals: PipelineReadDeal[]; canManage: boolean;
  coverage: { stages: "all_returned"; deals: "caller_visible"; snapshot: "non_atomic" };
} | { ok: false; code: "INVALID_SELECTION" | "CONTEXT_CHANGED" | "READ_UNAVAILABLE" | "NO_MATCH" | "MALFORMED_RESPONSE"; message: string };

type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const reference = (v: unknown): v is string => typeof v === "string" && /^PPL-[A-Z0-9]{5}$/.test(v);
const version = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 1;
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const text = (v: unknown): v is string => typeof v === "string";
const failure = (code: Extract<PipelineWorkspaceReadResult, { ok: false }>['code']): PipelineWorkspaceReadResult => ({
  ok: false, code, message: {
    INVALID_SELECTION: "Select an exact pipeline ID or reference.",
    CONTEXT_CHANGED: "The active workspace changed. Reopen the pipeline before continuing.",
    READ_UNAVAILABLE: "Pipeline data could not be verified. Retry before making changes.",
    NO_MATCH: "No pipeline matches the exact selected identity in this workspace.",
    MALFORMED_RESPONSE: "Pipeline data is incomplete or inconsistent. Refresh before continuing.",
  }[code],
});

export async function readPipelineWorkspace(
  callerRpc: PipelineCallerRpc, expectedConversationTenantId: string, selection: PipelineWorkspaceSelection,
): Promise<PipelineWorkspaceReadResult> {
  if (!uuid(expectedConversationTenantId) || !row(selection) ||
      (selection.pipelineId === undefined && selection.pipelineRef === undefined) ||
      (selection.pipelineId !== undefined && !uuid(selection.pipelineId)) ||
      (selection.pipelineRef !== undefined && !reference(selection.pipelineRef))) return failure("INVALID_SELECTION");
  try {
    const before = await callerRpc("current_user_tenant_id");
    if (before.error) return failure("READ_UNAVAILABLE");
    if (before.data !== expectedConversationTenantId) return failure("CONTEXT_CHANGED");
    const response = await callerRpc("get_pipeline_workspace", { _tenant_id: expectedConversationTenantId });
    // Revalidate even when the domain read fails: never expose stale workspace data.
    const after = await callerRpc("current_user_tenant_id");
    if (after.error) return failure("READ_UNAVAILABLE");
    if (after.data !== expectedConversationTenantId) return failure("CONTEXT_CHANGED");
    if (response.error) return failure("READ_UNAVAILABLE");
    const w = response.data;
    if (!row(w) || typeof w.can_manage !== "boolean" || !Array.isArray(w.pipelines) ||
        !Array.isArray(w.stages) || !Array.isArray(w.deals)) return failure("MALFORMED_RESPONSE");
    const pipelines = w.pipelines;
    const seen = new Set<string>(); const refs = new Set<string>();
    for (const p of pipelines) {
      if (!row(p) || !uuid(p.id) || !reference(p.short_ref) || !text(p.name) || !version(p.version) ||
          !text(p.lifecycle_status) || !["draft", "active", "archived"].includes(p.lifecycle_status) ||
          !count(p.stage_count) || !count(p.deal_count) || seen.has(p.id) || refs.has(p.short_ref)) return failure("MALFORMED_RESPONSE");
      seen.add(p.id); refs.add(p.short_ref);
    }
    const matches = pipelines.filter((p: Row) =>
      (selection.pipelineId === undefined || p.id === selection.pipelineId) &&
      (selection.pipelineRef === undefined || p.short_ref === selection.pipelineRef));
    if (matches.length !== 1) return failure("NO_MATCH");
    const p = matches[0] as Row;
    const stages: PipelineReadStage[] = []; const deals: PipelineReadDeal[] = [];
    const stageIds = new Set<string>(); const dealIds = new Set<string>();
    for (const s of w.stages) {
      if (!row(s) || !uuid(s.id) || !uuid(s.pipeline_id)) return failure("MALFORMED_RESPONSE");
      if (s.pipeline_id !== p.id) continue;
      if (!text(s.label) || !version(s.version) || (s.move_policy !== "direct" && s.move_policy !== "approval") ||
          !(s.archived_at === null || (text(s.archived_at) && Number.isFinite(Date.parse(s.archived_at)))) ||
          !Number.isSafeInteger(s.order_index) || stageIds.has(s.id)) return failure("MALFORMED_RESPONSE");
      stageIds.add(s.id);
      stages.push({ id:s.id, pipelineId:s.pipeline_id, label:s.label, version:s.version,
        movePolicy:s.move_policy, archivedAt:s.archived_at as string|null, orderIndex:s.order_index as number });
    }
    for (const d of w.deals) {
      if (!row(d) || !uuid(d.id) || !uuid(d.pipeline_id)) return failure("MALFORMED_RESPONSE");
      if (d.pipeline_id !== p.id) continue;
      if (!uuid(d.stage_id) || !stageIds.has(d.stage_id) || !version(d.version) || !text(d.title) ||
          !text(d.status) || dealIds.has(d.id)) return failure("MALFORMED_RESPONSE");
      dealIds.add(d.id);
      deals.push({ id:d.id, pipelineId:d.pipeline_id, stageId:d.stage_id, version:d.version, title:d.title, status:d.status });
    }
    return { ok:true, pipeline:{id:p.id as string,shortRef:p.short_ref as string,name:p.name as string,
      version:p.version as number,lifecycleStatus:p.lifecycle_status as string,stageCount:p.stage_count as number,dealCount:p.deal_count as number},
      stages,deals,canManage:w.can_manage,coverage:{stages:"all_returned",deals:"caller_visible",snapshot:"non_atomic"} };
  } catch { return failure("READ_UNAVAILABLE"); }
}
