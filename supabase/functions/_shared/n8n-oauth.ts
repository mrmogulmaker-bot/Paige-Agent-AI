/** n8n's instance-level MCP is scoped independently of the ordinary REST API key.
 * Owner-approved OAuth grant: workflow:read and workflow:write. No workflow:execute.
 * Initial verification and this endpoint remain metadata-only; a grant is not action approval.
 * Never add execute/test/create/update tools to this read-preview boundary.
 */
import { discoverAuthorizationServer, discoverProtectedResource, type AuthorizationServer, type TokenSet } from './mcp-oauth.ts';
import { safeFetch } from './ssrfGuard.ts';
import { withApprovedCapabilitySession, type McpSessionOptions } from './mcp-client.ts';
export const N8N_OAUTH_SCOPES = ['workflow:read','workflow:write'];
export class N8nSafeError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function validateN8nResource(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new N8nSafeError('invalid_server_url');
  let url: URL;
  try { url = new URL(value); } catch { throw new N8nSafeError('invalid_server_url'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !url.pathname.endsWith('/mcp-server/http')) throw new N8nSafeError('invalid_server_url');
  return url.toString();
}
export function validateServer(server: AuthorizationServer): void {
  for (const value of [server.issuer, server.authorizationEndpoint, server.tokenEndpoint, server.registrationEndpoint, server.revocationEndpoint]) {
    if (value === null) continue;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new N8nSafeError('provider_metadata_refused');
    if (new URL(server.issuer).origin !== url.origin) throw new N8nSafeError('provider_metadata_refused');
  }
  if (!N8N_OAUTH_SCOPES.every(scope=>server.scopesSupported.includes(scope))) throw new N8nSafeError('required_oauth_scopes_unavailable');
}
export async function discoverN8n(resource: string): Promise<AuthorizationServer & {responseIssuerRequired:boolean}> {
  const protectedResource = await discoverProtectedResource(resource);
  if (protectedResource.resource !== resource || protectedResource.authorizationServers.length !== 1) throw new N8nSafeError('provider_metadata_refused');
  const server = await discoverAuthorizationServer(protectedResource.authorizationServers[0]);
  validateServer(server);
  const issuer=new URL(server.issuer);
  const issuerPath=issuer.pathname==='/'?'':issuer.pathname.replace(/\/$/,'');
  const metadata=await safeFetch(`${issuer.origin}/.well-known/oauth-authorization-server${issuerPath}`,{method:'GET',headers:{Accept:'application/json'}},{timeoutMs:10000,maxBytes:262144});
  if(metadata.status!==200||metadata.truncated)throw new N8nSafeError('provider_metadata_refused');
  let record:Record<string,unknown>;
  try{record=JSON.parse(metadata.body);}catch{throw new N8nSafeError('provider_metadata_refused');}
  if(record.issuer!==server.issuer)throw new N8nSafeError('provider_metadata_refused');
  return {...server,responseIssuerRequired:record.authorization_response_iss_parameter_supported===true};
}
export function assertScopedTokens(tokens: TokenSet): void {
  if (tokens.scopes.length !== N8N_OAUTH_SCOPES.length || !N8N_OAUTH_SCOPES.every(scope=>tokens.scopes.includes(scope)) || !tokens.accessToken ||
      (tokens.expiresAt !== null && (!Number.isFinite(Date.parse(tokens.expiresAt)) || Date.parse(tokens.expiresAt) <= Date.now()))) {
    throw new N8nSafeError('provider_scope_refused');
  }
}
export async function hashOpaque(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export type WorkflowPreview = { id: string; name: string };
export function parseWorkflowPreviews(value: unknown): { workflows: WorkflowPreview[]; revision: string; inventory_complete: boolean; total_count: number } {
  const envelope = value as { isError?: boolean; structuredContent?: unknown; content?: {type?: string;text?: string}[] } | null;
  if (!envelope || envelope.isError) throw new N8nSafeError('provider_unavailable');
  let payload = envelope.structuredContent;
  if (!payload) {
    const text = envelope.content?.find(item=>item.type==='text')?.text;
    try { payload = JSON.parse(text ?? ''); } catch { throw new N8nSafeError('provider_unavailable'); }
  }
  const data = payload as {data?: unknown[];count?: number;error?:unknown};
  if (!data || data.error || !Array.isArray(data.data) || !Number.isSafeInteger(data.count) || data.count! < data.data.length || data.data.length > 200) {
    // n8n 2.37.9 count is the total matching inventory, not the returned page size.
    throw new N8nSafeError('workflow_inventory_incomplete');
  }
  const total_count=data.count!;
  const inventory_complete=total_count===data.data.length;
  const rows: {id:string;name:string;updatedAt:string|null}[]=[];
  for (const item of data.data) {
    const row = item as Record<string,unknown>;
    if (!row || row.availableInMCP !== true) continue;
    if (typeof row.id!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(row.id) || typeof row.name!=='string' || row.name.length>200 || Array.from(row.name).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127)) throw new N8nSafeError('provider_unavailable');
    if (rows.some(existing=>existing.id===row.id)) throw new N8nSafeError('provider_unavailable');
    rows.push({id:row.id,name:row.name,updatedAt:typeof row.updatedAt==='string'?row.updatedAt:null});
  }
  rows.sort((a,b)=>a.id.localeCompare(b.id));
  return {workflows:rows.map(({id,name})=>({id,name})), inventory_complete,total_count,revision:JSON.stringify({rows,inventory_complete,total_count})};
}
/** The sole permitted provider call is search_workflows. Even a read-only details
 * response contains workflow internals; previews deliberately return id/name only.
 */
export async function discoverWorkflowPreviews(options: McpSessionOptions): Promise<{workflows:WorkflowPreview[];pin:string;inventory_complete:boolean;total_count:number}> {
  return await withApprovedCapabilitySession(options,async session=>{
    const search=session.tools.find(tool=>tool.name==='search_workflows');
    if (!search) throw new N8nSafeError('workflow_discovery_unavailable');
    const preview=parseWorkflowPreviews(await session.call('search_workflows',{limit:200}));
    return {workflows:preview.workflows,inventory_complete:preview.inventory_complete,total_count:preview.total_count,pin:await hashOpaque(search.schemaHash+'\n'+preview.revision)};
  });
}
export function validateApproval(ids: unknown, discovered: WorkflowPreview[]): string[] {
  if (!Array.isArray(ids) || ids.length>200 || ids.some(id=>typeof id!=='string') || new Set(ids).size!==ids.length || ids.some(id=>!discovered.some(row=>row.id===id))) throw new N8nSafeError('approval_changed');
  return ids as string[];
}
