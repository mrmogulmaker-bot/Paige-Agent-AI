import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { readPipelineWorkspace } from '../supabase/functions/_shared/pipelineWorkspaceRead.ts';

const tenant='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const pid='20000000-0000-4000-8000-000000000001';
const sid='30000000-0000-4000-8000-000000000001';
const did='40000000-0000-4000-8000-000000000001';
const selection={pipelineId:pid,pipelineRef:'PPL-ABCDE'};
const fixture=()=>({can_manage:true,pipelines:[{id:pid,short_ref:'PPL-ABCDE',name:'Same name',version:1,lifecycle_status:'active',stage_count:1,deal_count:1}],stages:[{id:sid,pipeline_id:pid,label:'Custom',version:2,move_policy:'approval',archived_at:null,order_index:0}],deals:[{id:did,pipeline_id:pid,stage_id:sid,title:'Actual deal',status:'open',version:3,secret:'excluded'}],secret:'excluded'});
function adapter(workspace=fixture(), tenants=[tenant,tenant], failAt=-1){
  const calls=[];let checks=0;
  return {calls,rpc:async(name,args)=>{calls.push({name,args});if(calls.length===failAt) return {data:null,error:{message:'SECRET'}};return {data:name==='current_user_tenant_id'?tenants[checks++]:workspace,error:null};}};
}
test('projects exact identities, versions, policy and no arbitrary payload',async()=>{
  const a=adapter();const r=await readPipelineWorkspace(a.rpc,tenant,selection);
  assert.equal(r.ok,true);assert.equal(r.stages[0].version,2);assert.equal(r.deals[0].version,3);
  assert.equal(r.stages[0].movePolicy,'approval');assert.equal(JSON.stringify(r).includes('secret'),false);
  assert.deepEqual(a.calls.map(x=>x.name),['current_user_tenant_id','get_pipeline_workspace','current_user_tenant_id']);
  assert.deepEqual(a.calls[1].args,{_tenant_id:tenant});assert.equal(r.coverage.deals,'caller_visible');
});
test('zero stages/deals and duplicate names preserved by exact reference',async()=>{
 const f=fixture();f.stages=[];f.deals=[];f.pipelines[0].stage_count=0;f.pipelines[0].deal_count=0;
 f.pipelines.push({...f.pipelines[0],id:other,short_ref:'PPL-FGHIJ'});
 const r=await readPipelineWorkspace(adapter(f).rpc,tenant,{pipelineRef:'PPL-FGHIJ'});
 assert.equal(r.ok,true);assert.equal(r.pipeline.id,other);assert.deepEqual(r.deals,[]);
});
test('before and after context switch refuses without leaking payload',async()=>{
 for(const tenants of [[other,tenant],[tenant,other],[null,tenant],[tenant,null]]){
 const r=await readPipelineWorkspace(adapter(fixture(),tenants).rpc,tenant,selection);assert.deepEqual(Object.keys(r).sort(),['code','message','ok']);assert.equal(r.code,'CONTEXT_CHANGED');}
});
test('every RPC error and thrown request refuses without raw message',async()=>{
 for(const n of [1,2,3]){const r=await readPipelineWorkspace(adapter(fixture(),undefined,n).rpc,tenant,selection);assert.equal(r.ok,false);assert.equal(JSON.stringify(r).includes('SECRET'),false);}
 assert.equal((await readPipelineWorkspace(async()=>{throw Error('SECRET')},tenant,selection)).code,'READ_UNAVAILABLE');
});
test('invalid selection cannot query and names cannot identify',async()=>{
 for(const s of [{},{pipelineId:'Same name'},{pipelineRef:'Same name'},{pipelineId:null}]){const a=adapter();assert.equal((await readPipelineWorkspace(a.rpc,tenant,s)).code,'INVALID_SELECTION');assert.equal(a.calls.length,0);}
});
test('no match and conflicting exact identity refuse',async()=>{
 for(const s of [{pipelineId:other},{pipelineId:pid,pipelineRef:'PPL-FGHIJ'}])assert.equal((await readPipelineWorkspace(adapter().rpc,tenant,s)).code,'NO_MATCH');
});
test('malformed identity/version/policy/array/permission refuses',async()=>{
 const edits=[f=>f.stages[0].move_policy='auto',f=>delete f.stages[0].version,f=>f.deals[0].version=Number.MAX_SAFE_INTEGER+1,f=>f.pipelines[0].version='1',f=>f.stages=null,f=>f.can_manage='true',f=>f.deals[0].stage_id='bad',f=>f.pipelines.push({...f.pipelines[0]})];
 for(const edit of edits){const f=fixture();edit(f);assert.equal((await readPipelineWorkspace(adapter(f).rpc,tenant,selection)).code,'MALFORMED_RESPONSE');}
});
test('caller-visible subset never upgrades to all-deal coverage',async()=>{
 const f=fixture();f.deals=[];f.pipelines[0].deal_count=12;const r=await readPipelineWorkspace(adapter(f).rpc,tenant,selection);
 assert.equal(r.ok,true);assert.equal(r.pipeline.dealCount,12);assert.equal(r.coverage.deals,'caller_visible');
});
test('negative controls: removing each tenant guard makes the denial oracle fail',async()=>{
 const source=await readFile(new URL('../supabase/functions/_shared/pipelineWorkspaceRead.ts',import.meta.url),'utf8');
 for(const marker of ['before.data !== expectedConversationTenantId','after.data !== expectedConversationTenantId']){
 assert.ok(source.includes(marker));const js=stripTypeScriptTypes(source.replace(marker,'false'));
 const m=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const tenants=marker.startsWith('before')?[other,tenant]:[tenant,other];
 await assert.rejects(async()=>assert.equal((await m.readPipelineWorkspace(adapter(fixture(),tenants).rpc,tenant,selection)).ok,false));
 }
});
