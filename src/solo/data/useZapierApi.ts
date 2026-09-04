import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "../settings-contract";
import { readFunctionErrorBody } from "@/lib/integrations/connectError";

export type ZapierApiStateName = "not_connected"|"connecting"|"connected"|"needs_attention"|"authorization_expired"|"provider_unavailable"|"capability_unavailable";
export type ZapierApiReadiness = { tenantId: string;canManage:boolean;state:ZapierApiStateName;failureCode:string|null;accessibleZapCount:number|null;lastCheckedAt:string|null;lastSuccessAt:string|null;capabilities:string[];limitations:string[] };
const EMPTY: ZapierApiReadiness={tenantId:"",canManage:false,state:"not_connected",failureCode:null,accessibleZapCount:null,lastCheckedAt:null,lastSuccessAt:null,capabilities:[],limitations:[]};
const STATES=new Set<ZapierApiStateName>(["not_connected","connecting","connected","needs_attention","authorization_expired","provider_unavailable","capability_unavailable"]);
const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==="string").slice(0,8):[];
export function readZapierApi(value:unknown,tenantId:string):ZapierApiReadiness|null{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;const r=value as Record<string,unknown>;
 if(r.tenant_id!==tenantId&&r.tenant_id!==null||!STATES.has(r.state as ZapierApiStateName)||typeof r.can_manage!=="boolean")return null;
 const count=typeof r.accessible_zap_count==="number"&&Number.isSafeInteger(r.accessible_zap_count)&&r.accessible_zap_count>=0?r.accessible_zap_count:null;
 if(r.state==="connected"&&(typeof r.last_success_at!=="string"||typeof r.last_checked_at!=="string"))return null;
 return{tenantId,canManage:r.can_manage,state:r.state as ZapierApiStateName,failureCode:typeof r.failure_code==="string"?r.failure_code:null,accessibleZapCount:count,
  lastCheckedAt:typeof r.last_checked_at==="string"?r.last_checked_at:null,lastSuccessAt:typeof r.last_success_at==="string"?r.last_success_at:null,
  capabilities:strings(r.capabilities),limitations:strings(r.limitations)};
}
export function zapierApiWords(state:ZapierApiStateName){return state==="connected"?"Connected":state==="not_connected"?"Not connected":state==="connecting"?"Connecting":state==="authorization_expired"?"Authorization expired or revoked":state==="provider_unavailable"?"Provider unavailable":state==="capability_unavailable"?"Capability unavailable":"Needs attention";}

export function useZapierApi(){
 const{activeTenantId,activeUserId,loading:tenantLoading}=useTenantContext();const scope=`${activeUserId??""}:${activeTenantId??""}:${tenantLoading}`;
 const scopeRef=useRef(scope),gate=useRef(createSettingsRequestGate()),mounted=useRef(false);const[loaded,setLoaded]=useState<string|null>(null);
 const[state,setState]=useState({...EMPTY,loading:true,error:false,busy:false,message:null as string|null});
 if(scopeRef.current!==scope){scopeRef.current=scope;gate.current.clear();}
 const load=useCallback(async()=>{if(!mounted.current||scopeRef.current!==scope)return;const token=gate.current.begin();if(!activeTenantId||tenantLoading){setState({...EMPTY,loading:false,error:false,busy:false,message:null});return;}
  const{data,error}=await supabase.functions.invoke("tenant-zapier-api-connect",{body:{action:"status",expected_tenant_id:activeTenantId}});
  if(!mounted.current||scopeRef.current!==scope||!gate.current.isCurrent(token))return;setLoaded(scope);const parsed=!error?readZapierApi(data?.connection,activeTenantId):null;
  setState({...parsed??EMPTY,loading:false,error:!parsed,busy:false,message:parsed?null:"The Zapier API connection could not be read, so no state is being claimed."});
 },[activeTenantId,scope,tenantLoading]);
 useEffect(()=>{const activeGate=gate.current;mounted.current=true;if(!tenantLoading)void load();return()=>{mounted.current=false;activeGate.clear();};},[load,tenantLoading]);
 const invoke=useCallback(async(action:"oauth_begin"|"test"|"disconnect"|"cancel")=>{if(!activeTenantId||loaded!==scope||!state.canManage||state.busy)return action==="oauth_begin"?null:false;
  const token=gate.current.begin();setState(p=>({...p,busy:true,message:null}));const{data,error}=await supabase.functions.invoke("tenant-zapier-api-connect",{body:{action,expected_tenant_id:activeTenantId}});
  if(!mounted.current||scopeRef.current!==scope||!gate.current.isCurrent(token))return action==="oauth_begin"?null:false;const failure=await readFunctionErrorBody(error,data);
  if(error||failure?.error){setState(p=>({...p,busy:false,message:failure?.error==="capability_unavailable"?"Zapier API authorization is unavailable until Paige has provider-issued OAuth credentials for a published Zapier integration.":"The provider did not complete that request. Refresh the status and try again."}));return action==="oauth_begin"?null:false;}
  if(action==="oauth_begin")return typeof data?.authorize_url==="string"?data.authorize_url:null;const parsed=readZapierApi(data?.connection,activeTenantId);if(parsed)setState({...parsed,loading:false,error:false,busy:false,message:action==="disconnect"&&data?.provider_revoke_required?"Local API access is removed. Also revoke Paige from Zapier’s Authorized Applications page.":null});else await load();return true;
 },[activeTenantId,load,loaded,scope,state.busy,state.canManage]);
 return{...(loaded===scope&&!tenantLoading?state:{...EMPTY,loading:!!activeTenantId||tenantLoading,error:false,busy:false,message:null}),reload:load,begin:()=>invoke("oauth_begin") as Promise<string|null>,test:()=>invoke("test") as Promise<boolean>,cancel:()=>invoke("cancel") as Promise<boolean>,disconnect:()=>invoke("disconnect") as Promise<boolean>};
}
