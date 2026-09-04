/** Domain-owned definitions. Invoked only after canonical Chat claims stored args. */
type Obj = Record<string, unknown>;
type Admin = { rpc: (name: string, args: Obj) => PromiseLike<{ data: unknown; error: { message?: string } | null }> };
const id = { type: 'string', minLength: 1, maxLength: 100 };
const confirm = { type: 'boolean' };
const specs = {
  solo_orchestrator_list: { operation: 'list', description: 'Read this workspace approved processes and real job outcomes. Unknown execution remains unknown. Do not expose internal IDs.', properties: {}, required: [] },
  solo_orchestrator_activate: { operation: 'activate', description: 'Approve this workspace orchestration process for the exact n8n workflow version, no runtime inputs, trigger and run limit. Rich input schemas require an owner review surface before activation. Explain effects first. Workflow ownership requires this workspace connection and owner selection, never a workflow name alone.', properties: { registry_id:id, workflow_id:id, version_id:id, execution_mode:{type:'string',enum:['manual','production']}, trigger_node_name:{type:'string',maxLength:200}, approved_inputs:{type:'object'}, max_runs:{type:'integer',minimum:1,maximum:100}, confirm }, required:['workflow_id','version_id','execution_mode','approved_inputs','max_runs'] },
  solo_orchestrator_delegate: { operation: 'delegate', description: 'Delegate one job to this workspace approved process. Use its revision and a stable request key. Queued is not completed; inspect the actual result afterward.', properties:{registry_id:id,revision:id,idempotency_key:{type:'string',minLength:1,maxLength:200},confirm},required:['registry_id','revision','idempotency_key'] },
  solo_orchestrator_cancel: { operation:'cancel', description:'Cancel an undispatched job or request in-flight cancellation. This does not undo external effects.',properties:{run_id:id,confirm},required:['run_id'] },
  solo_orchestrator_retry: { operation:'retry',description:'Retry only when stored state proves no external dispatch occurred. Uncertain outcomes require reconciliation.',properties:{run_id:id,confirm},required:['run_id'] },
  solo_orchestrator_revoke: { operation:'revoke',description:'Revoke this process authority for future execution. Existing external effects remain attributable.',properties:{registry_id:id,confirm},required:['registry_id'] },
} as const;
export const SOLO_ORCHESTRATION_TOOLS = Object.entries(specs).map(([name,spec]) => ({type:'function',function:{name,description:spec.description,parameters:{type:'object',properties:spec.properties,required:spec.required,additionalProperties:false}}}));
export const SOLO_ORCHESTRATION_TOOL_NAMES = new Set(Object.keys(specs));
export async function runSoloOrchestrationTool(input:{admin:Admin;tenantId:string;userId:string;tool:string;args:Obj;claimedApprovalReference:string|null}):Promise<Obj>{
  const spec=specs[input.tool as keyof typeof specs];
  if(!spec || !input.tenantId || !input.userId) return {success:false,error:'workspace_access_required'};
  // Supplied by Chat only after its successful atomic canonical claim, never
  // copied from model arguments or synthesized as an approval marker.
  if(spec.operation!=='list' && !input.claimedApprovalReference) return {success:false,error:'owner_approval_required'};
  if(Object.keys(input.args).some(key=>!(key in spec.properties))) return {success:false,error:'invalid_arguments'};
  if (spec.operation === 'activate' && (!input.args.approved_inputs || typeof input.args.approved_inputs !== 'object' || Array.isArray(input.args.approved_inputs) || Object.keys(input.args.approved_inputs).length !== 0)) return {success:false,error:'reviewed_input_contract_required'};
  const args:Obj={...input.args};delete args.confirm;
  const {data,error}=await input.admin.rpc('solo_orchestration_service',{_operation:spec.operation,_input:{...args,
    tenant_id:input.tenantId,actor_id:input.userId,...(spec.operation==='activate'?{approval_ref:input.claimedApprovalReference}:{}),
  }});
  if(error) return {success:false,error:/WORKSPACE_CHANGED|TENANT_CHANGED/.test(error.message??'')?'workspace_changed':'orchestration_refused',retry_safe:false};
  return {success:true,result:data,source:'tenant_orchestration_records'};
}
