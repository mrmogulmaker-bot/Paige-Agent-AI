import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePipelineMove} from '../supabase/functions/_shared/pipelineMoveRequest.ts';
test('prepared command carries the owning pipeline required by the SQL executor',()=>{
  const pipelineId='10000000-0000-4000-8000-000000000010';
  const result=preparePipelineMove({ok:true,canManage:true,
    pipeline:{id:pipelineId,shortRef:'PPL-ABCDE',name:'Tenant workflow',lifecycleStatus:'active'},
    stages:[{id:'start',pipelineId,label:'First'},{id:'target',pipelineId,label:'Next',version:2,archivedAt:null,movePolicy:'direct'}],
    deals:[{id:'deal',pipelineId,stageId:'start',title:'Work',version:3}]},
    {dealId:'deal',targetStageId:'target'});
  assert.equal(result.ok,true);
  assert.equal(result.command.pipelineId,pipelineId);
});
