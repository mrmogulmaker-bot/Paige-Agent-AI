import test from 'node:test';
import assert from 'node:assert/strict';
import { readPipelineWorkspace } from '../supabase/functions/_shared/pipelineWorkspaceRead.ts';
import { preparePipelineMove } from '../supabase/functions/_shared/pipelineMoveRequest.ts';

const tenant='10000000-0000-4000-8000-000000000001';
const pipeline='20000000-0000-4000-8000-000000000001';
test('lifecycle arrays cannot masquerade as source-backed strings', async () => {
  const rpc=async name=>({error:null,data:name==='current_user_tenant_id'?tenant:{
    can_manage:true,pipelines:[{id:pipeline,short_ref:'PPL-ABCDE',name:'Actual',version:1,
      lifecycle_status:['active'],stage_count:0,deal_count:0}],stages:[],deals:[]}});
  assert.equal((await readPipelineWorkspace(rpc,tenant,{pipelineId:pipeline})).code,'MALFORMED_RESPONSE');
});

const snapshot=lifecycleStatus=>({ok:true,canManage:true,
  pipeline:{id:pipeline,shortRef:'PPL-ABCDE',name:'Actual',lifecycleStatus},
  stages:[{id:'s1',pipelineId:pipeline,label:'First'},
    {id:'s2',pipelineId:pipeline,label:'Second',version:7,movePolicy:'approval',archivedAt:null}],
  deals:[{id:'d1',pipelineId:pipeline,stageId:'s1',title:'Actual work',version:3}]});
test('move preparation also rejects coerced lifecycle values',()=>{
  assert.equal(preparePipelineMove(snapshot(['active']),{dealId:'d1',targetStageId:'s2'}).ok,false);
});
for(const lifecycle of ['draft','active','archived']) test(`preserves existing ${lifecycle} move eligibility`,()=>{
  assert.equal(preparePipelineMove(snapshot(lifecycle),{dealId:'d1',targetStageId:'s2'}).ok,true);
});
test('target version travels inside the exact stored command',()=>{
  const result=preparePipelineMove(snapshot('active'),{dealId:'d1',targetStageId:'s2'});
  assert.equal(result.command.expectedTargetVersion,7);
});
