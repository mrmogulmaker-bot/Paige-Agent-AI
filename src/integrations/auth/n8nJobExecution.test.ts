/* eslint-disable @typescript-eslint/no-explicit-any -- Executes real server helpers with isolated provider/RPC ports. */
// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, it, expect, vi } from 'vitest';
const RUN='10000000-0000-0000-0000-000000000001';
const CLAIM='20000000-0000-0000-0000-000000000001';
function load(path:string,modules:Record<string,unknown>){
 const output:any={};
 const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',js)((key:string)=>{if(!(key in modules))throw Error('Unmocked module '+key);return modules[key]},output);
 return output;
}
function harness(options:{state?:string;executionId?:string|null;version?:string;scope?:string[];execution?:Record<string,unknown>;nullExecution?:boolean;callFails?:boolean;rpcFails?:string;revokeAfterDispatch?:boolean;expired?:boolean;refreshScopes?:string[];providerMissing?:string}={}){
 const events:string[]=[];
 const lease={lease:'lease',generation:'generation',workflow_id:'wf1',version_id:'v1',execution_mode:'manual',inputs:{proof:'contained'},execution_id:options.executionId??null,dispatch_state:options.state??'ready',server_url:'https://n8n.example/mcp-server/http',access_token:'canary-access',refresh_token:'canary-refresh',client_secret:'canary-client',expires_at:'2099-01-01',issuer:'https://n8n.example',client_id:'client',oauth_scopes:options.scope??['workflow:read','workflow:execute','execution:read']};
 let revoked=false;
 const admin={rpc:vi.fn(async(name:string,args:any)=>{expect(name).toBe('n8n_job_service');expect(args._run_id).toBe(RUN);expect(args._claim_token).toBe(CLAIM);expect(args._input).not.toHaveProperty('tenant_id');events.push(args._operation);
  if(args._operation===options.rpcFails||(revoked&&args._operation==='check'))return {data:null,error:{message:'private-canary-revoked'}};
  return {data:args._operation==='acquire'?lease:{ok:true},error:null};
 })};
 const call=vi.fn(async(name:string,args:any)=>{events.push(name);
  if(name==='get_workflow_details')return {structuredContent:{workflow:{id:'wf1',versionId:options.version??'v1',activeVersionId:options.version??'v1',active:true,nodes:[{parameters:{secret:'canary-customer'}}]}}};
  if(name==='get_workflow_execution')return {structuredContent:{execution:options.execution??{id:lease.execution_id,workflowId:'wf1',status:'success',data:'canary-private-output'}}};
  if(name==='execute_workflow'){
   if(options.revokeAfterDispatch)revoked=true;
   if(options.callFails)throw Error('canary-access customer-body');
   return {structuredContent:{status:'started',executionId:options.nullExecution?null:'e1'}};
  }
  throw Error('Unexpected provider method '+name);
 });
 const revoke=vi.fn(async()=>true);
 const modules={
  './mcp-client.ts':{withApprovedCapabilitySession:async(_opts:any,body:any)=>body({tools:['get_workflow_details','get_workflow_execution','execute_workflow'].filter(name=>name!==options.providerMissing).map(name=>({name})),call})},
  './mcp-oauth.ts':{isExpired:(s:string)=>options.expired&&s==='2099-01-01',discoverAuthorizationServer:async()=>({issuer:lease.issuer}),refreshTokens:async()=>{events.push('refresh_tokens');return {accessToken:'canary-new',refreshToken:'canary-refresh-new',expiresAt:'2100-01-01',scopes:options.refreshScopes??lease.oauth_scopes}},revokeToken:revoke},
  './n8n-oauth.ts':{validateN8nResource:()=>{},validateServer:()=>{}},
 };
 const transport=load('supabase/functions/_shared/n8n-management.ts',modules);
 const adapter=load('supabase/functions/_shared/n8n-job-execution.ts',{'./n8n-management.ts':transport});
 return {run:()=>adapter.runN8nJob({admin,runId:RUN,claimToken:CLAIM}),admin,call,events,revoke,lease};
}
describe('durable tenant n8n job execution',()=>{
 it('verifies version, checks authority and persists intent before one execute; stores only safe started receipt',async()=>{
  const h=harness();const result=await h.run();expect(result).toMatchObject({ok:true,outcome:'started',version_verified:false,delivery_verified:false});
  expect(h.events).toEqual(['acquire','check','get_workflow_details','check','dispatch_intent','execute_workflow','settle','release']);
  expect(h.call).toHaveBeenCalledWith('execute_workflow',{workflowId:'wf1',executionMode:'manual',inputs:{proof:'contained'}});
  expect(JSON.stringify(result)).not.toContain('canary');expect(h.admin.rpc.mock.calls.find(c=>c[1]._operation==='dispatch_intent')?.[1]._input).toMatchObject({verified_workflow_id:'wf1',verified_version_id:'v1'});
 });
 it('refuses version drift before dispatch intent or execution',async()=>{const h=harness({version:'v2'});expect(await h.run()).toMatchObject({outcome:'failed',receipt:{result_code:'workflow_version_changed'}});expect(h.events).not.toContain('dispatch_intent');expect(h.events).not.toContain('execute_workflow')});
 it('refuses a missing execute scope before any provider call',async()=>{const h=harness({scope:['workflow:read']});expect(await h.run()).toMatchObject({outcome:'failed',receipt:{result_code:'authorization_needed'}});expect(h.call).not.toHaveBeenCalled()});
 it('refuses revoked authority before outbound call',async()=>{const h=harness({rpcFails:'check'});expect(await h.run()).toMatchObject({outcome:'failed'});expect(h.call).not.toHaveBeenCalled()});
 it('does not execute if durable dispatch intent fails',async()=>{const h=harness({rpcFails:'dispatch_intent'});expect(await h.run()).toMatchObject({outcome:'failed'});expect(h.events).not.toContain('execute_workflow')});
 it('records uncertain acceptance without retry or provider error leakage',async()=>{const h=harness({callFails:true});const result=await h.run();expect(result).toMatchObject({outcome:'unknown',receipt:{result_code:'dispatch_outcome_unknown'}});expect(h.events.filter(e=>e==='execute_workflow')).toHaveLength(1);expect(JSON.stringify(result)).not.toContain('canary')});
 it('does not treat accepted work without execution identifier as completed',async()=>{const h=harness({nullExecution:true});expect(await h.run()).toMatchObject({outcome:'unknown',receipt:{result_code:'execution_identifier_missing'}})});
 it.each(['dispatching','unknown'])('never redispatches an uncertain %s run',async state=>{const h=harness({state});expect(await h.run()).toMatchObject({error:'dispatch_outcome_unknown',retry_safe:false});expect(h.call).not.toHaveBeenCalled()});
 it('polls an existing execution without executing again; no raw output or inferred delivery/version',async()=>{const h=harness({state:'running',executionId:'e1'});const result=await h.run();expect(result).toMatchObject({outcome:'unknown',version_verified:false,delivery_verified:false,receipt:{status:'success',result_code:'version_unverified'}});expect(h.call).toHaveBeenCalledExactlyOnceWith('get_workflow_execution',{workflowId:'wf1',executionId:'e1',includeData:false});expect(JSON.stringify(result)).not.toContain('canary')});
 it.each(['error','canceled','crashed'])('records provider %s terminal state as a failed job',async status=>{const h=harness({state:'running',executionId:'e1',execution:{id:'e1',workflowId:'wf1',status}});expect(await h.run()).toMatchObject({outcome:'failed',receipt:{status}})});
 it('retains pending execution for later polling',async()=>{const h=harness({state:'running',executionId:'e1',execution:{id:'e1',workflowId:'wf1',status:'waiting'}});expect(await h.run()).toMatchObject({outcome:'started',receipt:{result_code:'execution_pending'}})});
 it('rejects unrelated execution receipt and preserves reconciliation instead of retrying execute',async()=>{const h=harness({state:'running',executionId:'e1',execution:{id:'other',workflowId:'other',status:'success'}});expect(await h.run()).toMatchObject({ok:false,error:'provider_response_invalid',retry_safe:true});expect(h.events).not.toContain('settle');expect(h.events).not.toContain('execute_workflow')});
 it('records an already-started effect even when permission was revoked during outbound call',async()=>{const h=harness({revokeAfterDispatch:true});expect(await h.run()).toMatchObject({outcome:'started'});expect(h.events.slice(-2)).toEqual(['settle','release'])});
 it('does not claim durable completion when settling the provider receipt fails',async()=>{const h=harness({rpcFails:'settle'});expect(await h.run()).toEqual({ok:false,error:'receipt_persistence_failed',retry_safe:false});expect(h.events.filter(e=>e==='execute_workflow')).toHaveLength(1)});
 it('checks authority before token refresh and preserves exact scope set',async()=>{const h=harness({expired:true});expect(await h.run()).toMatchObject({outcome:'started'});expect(h.events.slice(0,4)).toEqual(['acquire','check','refresh_tokens','rotate'])});
 it('revokes expanded refresh credentials and performs no workflow calls',async()=>{const h=harness({expired:true,refreshScopes:['workflow:read','workflow:execute','execution:read','agent:write']});expect(await h.run()).toMatchObject({outcome:'failed',receipt:{result_code:'provider_scope_refused'}});expect(h.revoke).toHaveBeenCalledOnce();expect(h.call).not.toHaveBeenCalled()});
 it('reports actual execution version when it matches and refuses mismatch',async()=>{for(const version of ['v1','v2']){const h=harness({state:'running',executionId:'e1',execution:{id:'e1',workflowId:'wf1',status:'success',versionId:version}});expect(await h.run()).toMatchObject({outcome:version==='v1'?'succeeded':'unknown',version_verified:version==='v1',receipt:version==='v1'?{version_id:version}:{result_code:'execution_version_mismatch'}})}});
});

it('reconciles an unknown run with a known execution ID without executing again',async()=>{const h=harness({state:'unknown',executionId:'e1',execution:{id:'e1',workflowId:'wf1',status:'success',versionId:'v1'}});expect(await h.run()).toMatchObject({outcome:'succeeded',version_verified:true});expect(h.events).not.toContain('execute_workflow')});
