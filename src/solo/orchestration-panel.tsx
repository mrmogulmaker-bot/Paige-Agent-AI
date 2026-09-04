import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenantContext } from '@/hooks/useTenantContext';
type Process = { registry_id: string; name: string; enabled: boolean; max_runs: number };
type Run = { run_id: string; registry_id: string; status: string; dispatch_state: string; cancel_requested: boolean; created_at: string };
type Overview = { tenant_id: string; processes: Process[]; runs: Run[] };
const words: Record<string,string> = { queued:'Queued', running:'Running', succeeded:'Execution verified', failed:'Failed', cancelled:'Cancelled', unknown:'Outcome needs reconciliation' };

export function OrchestrationPanel({openPaige}:{openPaige?:()=>void}) {
  const {activeTenantId, accountContextLoading} = useTenantContext();
  return activeTenantId && !accountContextLoading ? <BoundPanel key={activeTenantId} tenantId={activeTenantId} openPaige={openPaige}/> : null;
}
function BoundPanel({tenantId,openPaige}:{tenantId:string;openPaige?:()=>void}) {
  const [data,setData]=useState<Overview|null>(null);
  const [error,setError]=useState(false);
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    let current=true;setData(null);setError(false);
    const rpc=supabase.rpc.bind(supabase) as unknown as (name:'solo_orchestration_overview')=>PromiseLike<{data:Overview|null;error:unknown}>;
    void Promise.resolve(rpc('solo_orchestration_overview')).then(result=>{
      if(!current)return;
      if(result.error || result.data?.tenant_id!==tenantId || !Array.isArray(result.data.processes) || !Array.isArray(result.data.runs)){setError(true);return;}
      setData(result.data);
    }).catch(()=>{if(current)setError(true);});
    return ()=>{current=false;};
  },[tenantId,version]);
  return <section className="ig-state" aria-label="Workspace orchestration" style={{display:'block'}}>
    <h2>Intake and lifecycle orchestration</h2>
    <p>PAIGE can coordinate approved work through your workspace’s connected workers. Ask her to configure a process, run a job, cancel work, or inspect its outcome.</p>
    {error ? <p role="alert">Orchestration status could not be read. Check your workspace access and try again.</p> : !data ? <p role="status">Loading this workspace’s processes…</p> : <>
      {!data.processes.length ? <p>No process has been approved for this workspace yet.</p> : <ul>{data.processes.map(process=><li key={process.registry_id}>{process.name} — {process.enabled?'Enabled':'Revoked'} · Approved limit: {process.max_runs} runs</li>)}</ul>}
      <h3>Recent jobs</h3>
      {!data.runs.length ? <p>No delegated jobs recorded.</p> : <ul>{data.runs.map(run=><li key={run.run_id}>
        {data.processes.find(process=>process.registry_id===run.registry_id)?.name ?? 'Workspace process'} — {words[run.dispatch_state==='unknown'?'unknown':run.status] ?? 'Status unavailable'}
        {run.cancel_requested && run.status!=='cancelled' ? ' · Cancellation requested; external effects may already have started.' : ''}
        <span> · {new Date(run.created_at).toLocaleString()}</span>
      </li>)}</ul>}
    </>}
    <button type="button" className="ig-btn" onClick={()=>setVersion(value=>value+1)}>Refresh jobs</button>
    {openPaige && <button type="button" className="ig-btn" onClick={openPaige}>Manage with PAIGE</button>}
  </section>;
}
