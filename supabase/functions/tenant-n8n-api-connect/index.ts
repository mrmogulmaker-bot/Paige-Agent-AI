// API-only secure save / count-only validation / disconnect. No MCP or workflow writes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { normalizeApiAddress, validateN8nApi } from '../_shared/n8n-api-validation.ts';
const URL_BASE=Deno.env.get('SUPABASE_URL')!;
const ORIGINS=new Set((Deno.env.get('N8N_API_ALLOWED_ORIGINS')??'https://paigeagent.ai,https://app.paigeagent.ai').split(',').map(value=>value.trim()));
class SafeError extends Error{constructor(readonly code:string,readonly status=400){super(code);}}
async function readBody(req:Request):Promise<string>{
 if(!req.body)throw new SafeError('invalid_request');
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();throw new SafeError('invalid_request');}chunks.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new SafeError('invalid_request');}
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Vary':'Origin',...(origin&&ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin}:{})};
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response(null,{status:origin&&ORIGINS.has(origin)?204:403,headers});
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 if(origin&&!ORIGINS.has(origin))return json({error:'forbidden'},403);
 try{
  const userClient=createClient(URL_BASE,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('authorization')??''}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await userClient.auth.getUser();
  if(authError||!user)throw new SafeError('unauthorized',401);
  const raw=await readBody(req);
  const body=JSON.parse(raw) as Record<string,unknown>;
  if(!body||typeof body!=='object'||!['save','validate','disconnect'].includes(String(body.action)))throw new SafeError('invalid_request');
  const read=async()=>{const {data,error}=await userClient.rpc('get_tenant_n8n_api_readiness');if(error||!data)throw new SafeError('forbidden',403);return data;};
  const initial=await read();
  if(!initial.can_write)throw new SafeError('forbidden',403);
  if(typeof body.expected_tenant_id!=='string'||initial.tenant_id!==body.expected_tenant_id)throw new SafeError('tenant_changed',409);
  const tenantId=initial.tenant_id;
  const fresh=async()=>{const result=await read();if(result.tenant_id!==tenantId)throw new SafeError('tenant_changed',409);return result;};
  const mapped=(message:string,fallback:string)=>message.includes('TENANT_CHANGED')?new SafeError('tenant_changed',409):message.includes('FORBIDDEN')?new SafeError('forbidden',403):new SafeError(fallback,400);
  if(body.action==='disconnect'){
   const {error}=await userClient.rpc('disconnect_tenant_n8n_api_connection',{_expected_tenant_id:tenantId});
   if(error)throw mapped(error.message,'disconnect_failed');
   const connection=await fresh();
   return json({ok:true,outcome:connection.configured?'stale':'disconnected',connection});
  }
  let saved=false,revision:string|undefined;
  if(body.action==='save'){
   const address=normalizeApiAddress(body.base_url);
   if(!address||typeof body.api_key!=='string'||!body.api_key.trim()||body.api_key.length>8192||/[\r\n]/.test(body.api_key)||body.label!==undefined&&(typeof body.label!=='string'||body.label.length>200))throw new SafeError('invalid_request');
   const {data,error}=await userClient.rpc('save_tenant_n8n_api_connection',{_expected_tenant_id:tenantId,_base_url:address,_api_key:body.api_key,_label:typeof body.label==='string'?body.label.trim():null});
   if(error||!data?.saved)throw mapped(error?.message??'','save_failed');
   saved=true;revision=data.credential_revision;
  }
  const admin=createClient(URL_BASE,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:attempt,error:startError}=await admin.rpc('begin_tenant_n8n_api_validation',{_tenant_id:tenantId,_actor:user.id,...(revision?{_expected_revision:revision}:{})});
  if(startError){
   if(saved)return json({ok:true,saved:true,outcome:'stale',connection:await fresh()});
   if(startError.message.includes('VALIDATION_BUSY'))throw new SafeError('validation_busy',409);
   if(startError.message.includes('NOT_CONFIGURED'))throw new SafeError('not_configured');
   throw mapped(startError.message,'operation_failed');
  }
  if(attempt?.stale)return json({ok:true,...(saved?{saved:true}:{}),outcome:'stale',connection:await fresh()});
  if(!attempt?.api_key||!attempt?.base_url||!attempt?.validation_id||!attempt?.credential_revision)throw new SafeError('operation_failed',500);
  const result=await validateN8nApi(attempt.base_url,attempt.api_key);
  const {data:{user:stillUser},error:sessionError}=await userClient.auth.getUser();
  if(sessionError||stillUser?.id!==user.id)throw new SafeError('unauthorized',401);
  const {data:finished,error:finishError}=await admin.rpc('finish_tenant_n8n_api_validation',{_tenant_id:tenantId,_actor:user.id,_revision:attempt.credential_revision,_validation_id:attempt.validation_id,_failure_code:result.failure_code,_workflow_count:result.workflow_count});
  if(finishError){
   // A save may already be durable. Never claim it was rolled back on a late failure.
   if(saved)return json({ok:true,saved:true,outcome:'stale',connection:await fresh()});
   throw mapped(finishError.message,'operation_failed');
  }
  const connection=await fresh();
  const stale=finished?.stale||connection.checked_at!==finished?.checked_at||!['connected','needs_attention'].includes(connection.health);
  return json({ok:true,...(saved?{saved:true}:{}),outcome:stale?'stale':connection.health==='connected'?'connected':'needs_attention',connection});
 }catch(error){return json({error:error instanceof SafeError?error.code:'operation_failed'},error instanceof SafeError?error.status:500);}
});
