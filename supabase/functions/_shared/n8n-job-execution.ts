/** Server-only durable n8n runner. Run/claim identify authority; callers cannot supply
 * a tenant, credential, workflow, trigger, or input. No workflow authoring lives here. */
import { withN8nTransport, n8nFailureReason, type N8nLease } from './n8n-management.ts';

type Obj = Record<string, unknown>;
type Admin = { rpc: (name: string, args: Obj) => PromiseLike<{ data: unknown; error: { message?: string } | null }> };
type JobLease = N8nLease & {
  workflow_id: string; version_id: string; execution_mode: 'manual' | 'production';
  trigger_node_name?: string | null; inputs: Obj; execution_id: string | null;
  dispatch_state: 'ready' | 'dispatching' | 'running' | 'unknown' | 'terminal';
};
type Outcome = 'started' | 'succeeded' | 'failed' | 'unknown';
const object = (v: unknown): Obj => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
class JobFailure extends Error { constructor(public reason: string) { super(reason); } }
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const terminalSuccess = new Set(['success']);
const terminalFailure = new Set(['error', 'canceled', 'crashed']);

export async function runN8nJob(input: { admin: Admin; runId: string; claimToken: string }): Promise<Obj> {
  if (!uuid(input.runId) || !uuid(input.claimToken)) return { ok: false, error: 'invalid_job_claim', retry_safe: false };
  let lease: JobLease | undefined;
  let intent = false;
  let polling = false;
  let settling = false;
  const rpc = async (operation: string, extra: Obj = {}): Promise<unknown> => {
    const { data, error } = await input.admin.rpc('n8n_job_service', {
      _run_id: input.runId, _claim_token: input.claimToken, _operation: operation,
      _input: { ...(lease ? { lease: lease.lease, generation: lease.generation } : {}), ...extra },
    });
    if (error) throw new JobFailure('job_operation_refused');
    return data;
  };
  const settle = async (outcome: Outcome, receipt: Obj, executionId: string | null): Promise<Obj> => {
    settling = true;
    // A valid in-flight receipt must survive a later cancellation/revocation. This
    // RPC validates the original run/claim lease, not a fresh permission to execute.
    await rpc('settle', { outcome, execution_id: executionId, receipt });
    settling = false;
    return { ok: true, outcome, receipt, version_verified: Boolean(receipt.version_id) && receipt.version_id === lease?.version_id, delivery_verified: false };
  };
  try {
    lease = await rpc('acquire') as JobLease;
    if (!lease || !identifier(lease.workflow_id) || !identifier(lease.version_id)
      || !['manual', 'production'].includes(lease.execution_mode)) throw new JobFailure('invalid_job_contract');
    if (lease.dispatch_state === 'terminal') return { ok: true, outcome: 'already_terminal' };
    polling = ['running', 'unknown'].includes(lease.dispatch_state) && identifier(lease.execution_id);
    if (!polling && lease.dispatch_state !== 'ready') {
      return { ok: false, error: 'dispatch_outcome_unknown', retry_safe: false };
    }
    const required = polling ? ['execution:read'] : ['workflow:read', 'workflow:execute', 'execution:read'];
    if (!Array.isArray(lease.oauth_scopes) || required.some(scope => !lease!.oauth_scopes.includes(scope))) {
      throw new JobFailure('authorization_needed');
    }
    return await withN8nTransport(lease, rpc, async call => {
      if (polling) {
        const result = await call('n8n_execution_get', { workflow_id: lease!.workflow_id, execution_id: lease!.execution_id });
        const execution = object(result.execution);
        const status = String(execution.status);
        const receipt: Obj = { workflow_id: lease!.workflow_id, execution_id: lease!.execution_id, status };
        if (execution.versionId) receipt.version_id = execution.versionId;
        if (execution.startedAt) receipt.started_at = execution.startedAt;
        if (execution.stoppedAt) receipt.completed_at = execution.stoppedAt;
        if (execution.versionId && execution.versionId !== lease!.version_id) {
          delete receipt.version_id;
          receipt.result_code = 'execution_version_mismatch';
          return settle('unknown', receipt, lease!.execution_id);
        }
        if (terminalSuccess.has(status) && !execution.versionId) {
          receipt.result_code = 'version_unverified';
          return settle('unknown', receipt, lease!.execution_id);
        }
        const outcome = terminalSuccess.has(status) ? 'succeeded' : terminalFailure.has(status) ? 'failed' : 'started';
        receipt.result_code = outcome === 'succeeded' ? 'execution_succeeded' : outcome === 'failed' ? 'execution_failed' : 'execution_pending';
        // Execution metadata proves execution state, not any customer delivery or
        // node output. No fabricated echo receipt when the provider omits one.
        return settle(outcome, receipt, lease!.execution_id);
      }
      if (!lease!.inputs || typeof lease!.inputs !== 'object' || Array.isArray(lease!.inputs)) throw new JobFailure('invalid_job_contract');
      const details = await call('n8n_get_workflow', { workflow_id: lease!.workflow_id });
      const workflow = object(details.workflow);
      const version = lease!.execution_mode === 'production' ? workflow.activeVersionId : workflow.versionId;
      if (version !== lease!.version_id || (lease!.execution_mode === 'production' && workflow.active !== true)) {
        throw new JobFailure('workflow_version_changed');
      }
      const args: Obj = { workflow_id: lease!.workflow_id, execution_mode: lease!.execution_mode, inputs: lease!.inputs };
      if (lease!.trigger_node_name) args.trigger_node_name = lease!.trigger_node_name;
      const started = await call('n8n_run_workflow', args, async () => {
        await rpc('dispatch_intent', { verified_workflow_id: lease!.workflow_id, verified_version_id: version });
        intent = true;
      });
      const executionId = identifier(started.executionId) ? started.executionId : null;
      return settle(executionId ? 'started' : 'unknown', {
        status: 'started', workflow_id: lease!.workflow_id,
        ...(executionId ? { execution_id: executionId } : {}),
        result_code: executionId ? 'execution_started' : 'execution_identifier_missing',
      }, executionId);
    }, () => rpc('check').then(() => undefined));
  } catch (error) {
    if (settling) return { ok: false, error: 'receipt_persistence_failed', retry_safe: false };
    const reason = error instanceof JobFailure ? error.reason : n8nFailureReason(error);
    // Reading an existing execution can be retried; executing again cannot.
    if (polling) return { ok: false, error: reason, retry_safe: true };
    if (lease) {
      try {
        return await settle(intent ? 'unknown' : 'failed', {
          workflow_id: lease.workflow_id, result_code: intent ? 'dispatch_outcome_unknown' : reason,
        }, null);
      } catch { return { ok: false, error: 'receipt_persistence_failed', retry_safe: false }; }
    }
    return { ok: false, error: reason, retry_safe: false };
  } finally {
    if (lease) await rpc('release').catch(() => undefined);
  }
}
