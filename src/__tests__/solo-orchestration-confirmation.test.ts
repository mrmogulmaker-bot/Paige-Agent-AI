import { describe, expect, it } from 'vitest';
import { formatSoloOrchestrationConfirmation as format } from '../../supabase/functions/_shared/solo-orchestration-confirmation';

const wf = { ok:true, workflow:{id:'wf_1',name:'Skool Intake',versionId:'v_2',activeVersionId:'v_2',active:true}, nodes:[{name:'Member joined',type:'webhookTrigger'}] };
const overview = { processes:[{registry_id:'reg_1',revision:'rev_1',name:'Skool Intake'}], runs:[{run_id:'run_1',registry_id:'reg_1',created_at:'2026-09-04T12:00:00Z'}] };
describe('source-backed orchestration confirmations',()=>{
  it('describes the exact verified activation without raw identifiers',()=>{
    const value=format({operation:'activate',verifiedWorkflow:wf,args:{workflow_id:'wf_1',version_id:'v_2',execution_mode:'production',trigger_node_name:'Member joined',approved_inputs:{},max_runs:3}});
    expect(value).toContain('“Skool Intake”'); expect(value).toContain('production'); expect(value).toContain('3 runs');
    expect(value).not.toContain('wf_1'); expect(value).not.toContain('v_2');
  });
  it('refuses version mismatch, unverified triggers, and nonempty runtime inputs',()=>{
    const base={workflow_id:'wf_1',version_id:'v_2',execution_mode:'manual',approved_inputs:{},max_runs:1};
    expect(format({operation:'activate',verifiedWorkflow:wf,args:{...base,version_id:'other'}})).toBeNull();
    expect(format({operation:'activate',verifiedWorkflow:wf,args:{...base,trigger_node_name:'missing'}})).toBeNull();
    expect(format({operation:'activate',verifiedWorkflow:wf,args:{...base,approved_inputs:{password:'secret'}}})).toBeNull();
  });
  it('names a verified process for delegate and revoke without IDs',()=>{
    const delegated=format({operation:'solo_orchestrator_delegate',overview,args:{registry_id:'reg_1',revision:'rev_1'}});
    expect(delegated).toContain('“Skool Intake”'); expect(delegated).not.toContain('reg_1');
    expect(format({operation:'revoke',overview,args:{registry_id:'reg_1'}})).toContain('“Skool Intake”');
    expect(format({operation:'delegate',overview,args:{registry_id:'reg_1',revision:'wrong'}})).toBeNull();
  });
  it('identifies cancel and retry by process name and created time',()=>{
    const cancelled=format({operation:'cancel',overview,args:{run_id:'run_1'}});
    expect(cancelled).toContain('Skool Intake'); expect(cancelled).toContain('2026-09-04T12:00:00.000Z'); expect(cancelled).not.toContain('run_1');
    expect(format({operation:'retry',overview,args:{run_id:'missing'}})).toBeNull();
  });
  it('refuses ambiguous process names and unsafe provider names',()=>{
    expect(format({operation:'delegate',overview:{...overview,processes:[...overview.processes,{registry_id:'reg_2',revision:'rev_2',name:'Skool Intake'}]},args:{registry_id:'reg_1',revision:'rev_1'}})).toBeNull();
    expect(format({operation:'activate',verifiedWorkflow:{...wf,workflow:{...wf.workflow,name:'secret\nname'}},args:{workflow_id:'wf_1',version_id:'v_2',execution_mode:'production',approved_inputs:{},max_runs:1}})).toContain('secret name');
  });
});
