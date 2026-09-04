type Obj = Record<string, unknown>;

export type SoloConfirmationInput = {
  operation: string;
  args: Obj;
  verifiedWorkflow?: unknown;
  overview?: unknown;
};

const object = (value: unknown): Obj | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Obj : null;
const safeText = (value: unknown, max = 200): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text && text.length <= max ? text : null;
};
const safeId = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null;
const operationName = (value: string) => value.replace(/^solo_orchestrator_/, '');

function workflow(value: unknown): { id: string; name: string; versionId: string | null; activeVersionId: string | null; active: boolean; nodes: Obj[] } | null {
  const result = object(value);
  const item = object(result?.workflow);
  const id = safeId(item?.id), name = safeText(item?.name);
  if (result?.ok !== true || !id || !name) return null;
  return { id, name, versionId: safeId(item?.versionId), activeVersionId: safeId(item?.activeVersionId),
    active: item?.active === true, nodes: Array.isArray(result?.nodes) ? result.nodes.map(object).filter((v): v is Obj => v !== null) : [] };
}

function processFor(overviewValue: unknown, registryId: unknown, revision?: unknown): Obj | null {
  const overview = object(overviewValue);
  const processes = Array.isArray(overview?.processes) ? overview.processes.map(object).filter((v): v is Obj => v !== null) : [];
  const id = safeId(registryId);
  if (!id) return null;
  const process = processes.find(item => item.registry_id === id);
  if (!process || (revision !== undefined && process.revision !== revision)) return null;
  const name = safeText(process.name);
  if (!name || processes.filter(item => safeText(item.name) === name).length !== 1) return null;
  return process;
}

/** Formats only source-backed, human-reviewable proposals. Returning null means refuse the action. */
export function formatSoloOrchestrationConfirmation(input: SoloConfirmationInput): string | null {
  const operation = operationName(input.operation);
  const args = object(input.args);
  if (!args) return null;

  if (operation === 'activate') {
    const item = workflow(input.verifiedWorkflow);
    const workflowId = safeId(args.workflow_id), versionId = safeId(args.version_id);
    const mode = args.execution_mode === 'manual' || args.execution_mode === 'production' ? args.execution_mode : null;
    const maxRuns = Number.isInteger(args.max_runs) && Number(args.max_runs) >= 1 && Number(args.max_runs) <= 100 ? Number(args.max_runs) : null;
    const approvedInputs = object(args.approved_inputs);
    if (!item || !workflowId || !versionId || !mode || !maxRuns || !approvedInputs || Object.keys(approvedInputs).length !== 0 || item.id !== workflowId) return null;
    if (mode === 'production' ? (!item.active || item.activeVersionId !== versionId) : item.versionId !== versionId) return null;
    const trigger = args.trigger_node_name === undefined || args.trigger_node_name === '' ? null : safeText(args.trigger_node_name);
    if (args.trigger_node_name && (!trigger || !item.nodes.some(node => safeText(node.name) === trigger && /(trigger|webhook)/i.test(safeText(node.type) ?? '')))) return null;
    return `Authorize “${item.name}” in ${mode} mode${trigger ? ` from the “${trigger}” trigger` : ''} for up to ${maxRuns} runs. No runtime inputs are authorized. The workflow may perform its configured external actions.`;
  }

  if (operation === 'delegate' || operation === 'revoke') {
    const process = processFor(input.overview, args.registry_id, operation === 'delegate' ? args.revision : undefined);
    const name = safeText(process?.name);
    if (!name) return null;
    if (operation === 'delegate') return `Delegate one execution of “${name}”. PAIGE will report its stored provider outcome; a queued job is not a completed job.`;
    return `Revoke “${name}” so it cannot start further work. Existing execution outcomes remain recorded.`;
  }

  if (operation === 'cancel' || operation === 'retry') {
    const overview = object(input.overview);
    const runs = Array.isArray(overview?.runs) ? overview.runs.map(object).filter((v): v is Obj => v !== null) : [];
    const runId = safeId(args.run_id), run = runId ? runs.find(item => item.run_id === runId) : null;
    const process = run ? processFor(input.overview, run.registry_id) : null;
    const name = safeText(process?.name), created = safeText(run?.created_at, 40);
    if (!run || !name || !created || !Number.isFinite(Date.parse(created))) return null;
    const when = new Date(created).toISOString();
    return operation === 'cancel'
      ? `Cancel the “${name}” job created ${when}, or request cancellation if dispatch began. Already-started external effects cannot be undone.`
      : `Retry the “${name}” job created ${when}, only if its stored history proves no external dispatch occurred.`;
  }
  return null;
}
