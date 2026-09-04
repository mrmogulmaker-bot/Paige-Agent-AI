import { useCallback,useEffect,useRef,useState } from "react";
import { useNavigate,useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { readFunctionErrorBody } from "@/lib/integrations/connectError";
import "./McpOAuthCallback.css";

type Phase={kind:"working"}|{kind:"done";healthy:boolean}|{kind:"failed";message:string};
export default function ZapierOAuthCallback(){
 const[params,setParams]=useSearchParams();const navigate=useNavigate();const[phase,setPhase]=useState<Phase>({kind:"working"});const started=useRef(false);
 const complete=useCallback(async(code:string,state:string)=>{const{data,error}=await supabase.functions.invoke("tenant-zapier-api-connect",{body:{action:"oauth_complete",code,state}});const failure=await readFunctionErrorBody(error,data);
  if(error||failure?.error){setPhase({kind:"failed",message:failure?.error==="oauth_state_invalid"?"That authorization has expired, was already used, or belongs to another workspace. Start again from Integrations.":"Zapier did not complete the connection. Start again from Integrations."});return;}
  setPhase({kind:"done",healthy:data?.outcome==="connected"});},[]);
 useEffect(()=>{if(started.current)return;started.current=true;const code=params.get("code"),state=params.get("state"),refusal=params.get("error");setParams(new URLSearchParams(),{replace:true});
  if(refusal){setPhase({kind:"failed",message:"The Zapier authorization was not approved, so nothing was changed."});return;}if(!code||!state){setPhase({kind:"failed",message:"That authorization link is incomplete. Start again from Integrations."});return;}void complete(code,state);},[complete,params,setParams]);
 return <main className="mcp-cb" role="status" aria-live="polite"><div className="mcp-cb-card">
  {phase.kind==="working"&&<><h1>Finishing the Zapier API connection…</h1><p>This takes a moment. No Zap is being changed.</p></>}
  {phase.kind==="done"&&<><h1>{phase.healthy?"Zapier API connected":"Connected, but needs attention"}</h1><p>{phase.healthy?"The read-only API connection passed a real provider check. PAIGE tools remain separate.":"Authorization completed, but the provider check did not. Review its truthful state in Integrations."}</p><button className="mcp-cb-btn" onClick={()=>navigate("/")}>Back to your workspace</button></>}
  {phase.kind==="failed"&&<><h1>That did not connect</h1><p>{phase.message}</p><button className="mcp-cb-btn" onClick={()=>navigate("/")}>Back to your workspace</button></>}
 </div></main>;
}
