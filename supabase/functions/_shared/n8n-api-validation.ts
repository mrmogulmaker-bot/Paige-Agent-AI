/** Count-only validation of a tenant's n8n public API. Never synchronizes workflows. */
import { safeFetch, SsrfError } from './ssrfGuard.ts';
export type ApiFailure = 'authentication_rejected'|'request_refused'|'endpoint_not_found'|'provider_unavailable'|'response_invalid'|'inventory_incomplete'|'address_rejected'|'validation_expired';
export type ValidationResult = {failure_code:ApiFailure|null;workflow_count:number|null};
export function normalizeApiAddress(raw:unknown):string|null {
 if(typeof raw!=='string'||raw.length>2048||raw!==raw.trim())return null;
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||/\s/.test(raw)||!/^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[^?#\s@]*)?$/.test(raw))return null;
  return url.toString().replace(/\/$/,'');
 }catch{return null;}
}
export function observedFailure(status:number):ApiFailure {
 if(status===401)return 'authentication_rejected';
 if(status===403)return 'request_refused';
 if(status===404)return 'endpoint_not_found';
 return 'provider_unavailable';
}
type Transport=typeof safeFetch;
const failure=(code:ApiFailure):ValidationResult=>({failure_code:code,workflow_count:null});
/** Every page uses the vetted same endpoint. A cursor is data, never a next URL.
 * Hard global deadline includes DNS/transport/body time. The shared fetch has its own
 * abort deadline; a delayed resolver cannot cause this loop to launch another request.
 */
export async function validateN8nApi(baseUrl:string,apiKey:string,ports:{fetch?:Transport;now?:()=>number;budgetMs?:number}={}):Promise<ValidationResult>{
 const base=normalizeApiAddress(baseUrl);
 let decodedBase='';try{decodedBase=decodeURIComponent(base??'');}catch{return failure('address_rejected');}
 if(!base||!apiKey||base.includes(apiKey)||decodedBase.includes(apiKey)||base.includes(encodeURIComponent(apiKey)))return failure('address_rejected');
 const fetchPage=ports.fetch??safeFetch,now=ports.now??Date.now;
 const budget=Math.min(15000,Math.max(1,ports.budgetMs??15000)),deadline=now()+budget;
 let expired=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const run=async():Promise<ValidationResult>=>{
  const cursors=new Set<string>(),ids=new Set<string>();let cursor:string|null=null,totalBytes=0;
  for(let page=0;page<50;page++){
   if(expired||now()>=deadline)return failure('inventory_incomplete');
   const url=new URL(`${base}/api/v1/workflows`);url.searchParams.set('limit','200');if(cursor)url.searchParams.set('cursor',cursor);
   let response:Awaited<ReturnType<Transport>>;
   try{response=await fetchPage(url.toString(),{method:'GET',headers:{'X-N8N-API-KEY':apiKey,Accept:'application/json'}},{timeoutMs:Math.max(1,deadline-now()),maxBytes:2097152});}
   catch(error){return failure(error instanceof SsrfError&&['url_must_be_https','url_has_embedded_credentials','url_resolves_to_private_address','url_host_not_allowed','url_redirect_refused','invalid_url'].includes(error.reason)?'address_rejected':'provider_unavailable');}
   if(expired||now()>=deadline)return failure('inventory_incomplete');
   if(response.status!==200)return failure(observedFailure(response.status));
   totalBytes+=new TextEncoder().encode(response.body).length;
   if(response.truncated||totalBytes>4194304)return failure('inventory_incomplete');
   let body:Record<string,unknown>;
   try{const parsed=JSON.parse(response.body);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return failure('response_invalid');body=parsed;}
   catch{return failure('response_invalid');}
   if(!Array.isArray(body.data)||body.data.length>200)return failure('response_invalid');
   for(const row of body.data){
    if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id||ids.has(row.id))return failure('inventory_incomplete');
    ids.add(row.id);
   }
   if(ids.size>10000)return failure('inventory_incomplete');
   const next=body.nextCursor;
   if(next===null||next===undefined||next==='')return {failure_code:null,workflow_count:ids.size};
   if(typeof next!=='string'||next.length>4096||!body.data.length||cursors.has(next))return failure('inventory_incomplete');
   // A hostile provider may echo our key as a pagination cursor. Never put that in a URL.
   let decoded='',percentDecoded='';try{percentDecoded=decodeURIComponent(next);}catch{/* Opaque cursor. */}
   try{const b64=(percentDecoded||next).replace(/-/g,'+').replace(/_/g,'/');decoded=atob(b64.padEnd(Math.ceil(b64.length/4)*4,'='));}catch{/* Opaque provider cursors need not be base64. */}
   if(next.includes(apiKey)||percentDecoded.includes(apiKey)||decoded.includes(apiKey)||next.includes(encodeURIComponent(apiKey)))return failure('response_invalid');
   cursors.add(next);cursor=next;
  }
  return failure('inventory_incomplete');
 };
 try{return await Promise.race([run(),new Promise<ValidationResult>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(failure('inventory_incomplete'));},budget);})]);}
 finally{if(timer)clearTimeout(timer);}
}
