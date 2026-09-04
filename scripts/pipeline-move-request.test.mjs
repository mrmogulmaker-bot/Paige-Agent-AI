import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePipelineMove } from '../supabase/functions/_shared/pipelineMoveRequest.ts';

const snapshot = () => ({ok:true,pipeline:{id:'p1',shortRef:'PPL-ABCDE',name:'Duplicate',version:2,lifecycleStatus:'active',stageCount:2,dealCount:1},canManage:true,stages:[{id:'s1',pipelineId:'p1',label:'First',version:1,movePolicy:'direct',archivedAt:null,orderIndex:1},{id:'s2',pipelineId:'p1',label:'Review',version:3,movePolicy:'approval',archivedAt:null,orderIndex:2}],deals:[{id:'d1',pipelineId:'p1',stageId:'s1',version:4,title:'Work',status:'open'}],coverage:{stages:'all_returned',deals:'caller_visible',snapshot:'non_atomic'}});

test('normalizes exact target and version from the read, never invented caller versions',()=>{
  const result=preparePipelineMove(snapshot(),{dealId:'d1',targetStageId:'s2'});
  assert.equal(result.ok,true);
  assert.equal(result.requiresOperatorCard,true);
  assert.deepEqual(result.command,{type:'move-deal',dealId:'d1',targetStageId:'s2',expectedVersion:4,expectedTargetVersion:3});
  assert.equal(result.pipelineRef,'PPL-ABCDE');
  assert.equal(result.expectedTargetVersion,3);
});
test('direct targets do not claim stage approval is required',()=>{
  const state=snapshot();state.stages[1].movePolicy='direct';
  assert.equal(preparePipelineMove(state,{dealId:'d1',targetStageId:'s2'}).requiresOperatorCard,false);
});
for(const [label,mutate] of [
  ['read refusal',s=>{s.ok=false;}],['read only',s=>{s.canManage=false;}],
  ['unknown lifecycle',s=>{s.pipeline.lifecycleStatus='invented';}],
  ['foreign deal',s=>{s.deals[0].pipelineId='other';}],
  ['foreign target',s=>{s.stages[1].pipelineId='other';}],
  ['archived target',s=>{s.stages[1].archivedAt='2026-09-04';}],
  ['unknown policy',s=>{s.stages[1].movePolicy='auto';}],
  ['missing version',s=>{delete s.deals[0].version;}],
  ['duplicate deal',s=>{s.deals.push({...s.deals[0]});}],
  ['duplicate target',s=>{s.stages.push({...s.stages[1]});}],
])test(`refuses ${label}`,()=>{const state=snapshot();mutate(state);assert.equal(preparePipelineMove(state,{dealId:'d1',targetStageId:'s2'}).ok,false);});
test('same-stage request is a no-op, not an approval or write',()=>{
  assert.equal(preparePipelineMove(snapshot(),{dealId:'d1',targetStageId:'s1'}).code,'ALREADY_IN_STAGE');
});
test('unseen deal does not disclose whether it exists elsewhere',()=>{
  assert.equal(preparePipelineMove(snapshot(),{dealId:'missing',targetStageId:'s2'}).code,'MOVE_NOT_AVAILABLE');
});
