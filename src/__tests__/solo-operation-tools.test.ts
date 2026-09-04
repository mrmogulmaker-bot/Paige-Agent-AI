import { describe, expect, it, vi } from 'vitest';
import { runSoloOrchestrationTool } from '../../supabase/functions/_shared/solo-orchestration-tools';
import { runContactImportTool } from '../../supabase/functions/_shared/contact-import-tools';

describe('Solo domain canonical execution adapters', () => {
  it('does not activate a process on a model approval or synthetic reference argument', async () => {
    const rpc=vi.fn();
    const result=await runSoloOrchestrationTool({admin:{rpc},tenantId:'tenant',userId:'owner',tool:'solo_orchestrator_activate',args:{confirm:true,approval_ref:'fake'},claimedApprovalReference:null});
    expect(result.success).toBe(false);expect(rpc).not.toHaveBeenCalled();
  });
  it('passes the actual claimed reference with captured identity and rejects identity arguments', async () => {
    const rpc=vi.fn(async()=>({data:{revision:'revision'},error:null}));
    const base={admin:{rpc},tenantId:'tenant',userId:'owner',tool:'solo_orchestrator_activate',claimedApprovalReference:'claimed-canonical-fingerprint'};
    expect((await runSoloOrchestrationTool({...base,args:{tenant_id:'other'}})).success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    await runSoloOrchestrationTool({...base,args:{workflow_id:'wf',version_id:'v',execution_mode:'manual',approved_inputs:{},max_runs:1}});
    expect(rpc).toHaveBeenCalledWith('solo_orchestration_service',{_operation:'activate',_input:{workflow_id:'wf',version_id:'v',execution_mode:'manual',approved_inputs:{},max_runs:1,tenant_id:'tenant',actor_id:'owner',approval_ref:'claimed-canonical-fingerprint'}});
  });
  it('never writes contacts without the canonical approval result', async () => {
    const rpc=vi.fn();
    expect((await runContactImportTool({admin:{rpc},tenantId:'tenant',userId:'owner',tool:'contact_import_commit',args:{batch_id:'11111111-1111-4111-8111-111111111111',confirm:true},mutationApproved:false})).success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('commits only the selected batch and projects safe receipt counts', async () => {
    const rpc=vi.fn(async()=>({data:{status:'completed',created:1,retained:2,skipped:0,raw:'private'},error:null}));
    const result=await runContactImportTool({admin:{rpc},tenantId:'tenant',userId:'owner',tool:'contact_import_commit',args:{batch_id:'11111111-1111-4111-8111-111111111111'},mutationApproved:true,requestNonce:'canonical-turn-2'});
    expect(result).toEqual({success:true,status:'completed',created:1,retained:2,skipped:0,messages_sent:0,source:'committed_import_batch'});
    expect(rpc.mock.calls).toHaveLength(1);
  });
});
