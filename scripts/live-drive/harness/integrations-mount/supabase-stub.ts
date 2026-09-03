/** Local transport fixtures only. The actual Solo UI and hooks remain under measurement. */
import { currentHarnessTenantId } from './tenant-context-stub';
const params = () => new URLSearchParams(window.location.search);
const mode = () => params().get('data') || 'empty';
const apiRows = new Map<string, Record<string, unknown>>();
const mcpRows = new Map<string, Record<string, unknown>>();
const none = () => ({ configured: false, status: 'unconfigured' });
function apiRow() {
 const tenant = currentHarnessTenantId();
 if (!apiRows.has(tenant)) apiRows.set(tenant, tenant.endsWith('-b') || mode() === 'empty' ? none() : { configured: true, status: mode() === 'broken' ? 'error' : 'connected', label: 'Harness instance', base_url: 'https://harness.example.invalid', api_key_last4: 'demo', last_sync_at: '2026-09-03T12:00:00Z', workflow_count: 0 });
 return apiRows.get(tenant);
}
function mcpRow() {
 const tenant = currentHarnessTenantId();
 if (!mcpRows.has(tenant)) mcpRows.set(tenant, tenant.endsWith('-b') || mode() === 'empty' ? none() : { configured: true, enabled: true, status: mode() === 'connected' || mode() === 'readonly' ? 'connected' : 'error', auth_kind: 'bearer', transport: 'http', server_url_host: 'harness.example.invalid', last_probed_at: '2026-09-03T12:00:00Z', tool_count: mode() === 'connected' ? 2 : null, approved_capabilities: mode() === 'connected' ? ['fixture_read'] : [], pinned_count: mode() === 'connected' ? 1 : 0 });
 return mcpRows.get(tenant);
}
const ok = (data: unknown = null) => Promise.resolve({ data, error: null });
const fail = (message: string) => Promise.resolve({ data: null, error: { message } });
const pending: Array<() => void> = [];
window.addEventListener('n8n-harness-finish', () => pending.splice(0).forEach(finish => finish()));
const mutate = (fn: () => void) => mode() === 'pending' ? new Promise<{data:null;error:null}>(resolve => pending.push(() => { fn(); resolve({data:null,error:null}); })) : (fn(), ok());
export const supabase = {
 rpc: (name: string, args?: Record<string, unknown>) => {
  if (name === 'get_tenant_n8n_connection') return mode() === 'error' || mode() === 'api-error' ? fail('fixture-read-refused') : ok(apiRow());
  if (name === 'get_tenant_mcp_connections') return mode() === 'error' || mode() === 'mcp-error' ? fail('fixture-read-refused') : ok({ n8n: mcpRow(), zapier: none() });
  if (name === 'is_current_user_tenant_admin') return ok(mode() !== 'readonly');
  if (name === 'set_tenant_n8n_connection' || name === 'clear_tenant_n8n_connection') {
   const tenant = currentHarnessTenantId();
   if (args?._tenant_id && args._tenant_id !== tenant) return fail('N8N_FORBIDDEN');
   if (mode() === 'readonly' || mode() === 'refused') return fail('N8N_FORBIDDEN');
   if (name === 'clear_tenant_n8n_connection') return mutate(() => apiRows.set(tenant, none()));
   let url: URL; try { url = new URL(String(args?._base_url)); } catch { return fail('N8N_INSECURE_URL'); }
   if (url.protocol !== 'https:' || url.username || url.password) return fail('N8N_INSECURE_URL');
   // Deliberately do not retain the supplied key. Saved does not mean health checked.
   return mutate(() => apiRows.set(tenant, { configured: true, status: 'connected', base_url: url.origin, label: 'Harness instance', api_key_last4: 'demo', workflow_count: 0, last_sync_at: '2026-09-03T12:00:00Z' }));
  }
  return ok();
 },
 functions: { invoke: (name: string, options: {body?: Record<string,unknown>}) => {
  const body = options?.body ?? {}; const tenant = currentHarnessTenantId();
  if (name !== 'tenant-mcp-connect' || body.action !== 'disconnect') return ok({ error: 'unavailable', code: 'MCP_FORBIDDEN' });
  if (body.expected_tenant_id !== tenant || mode() === 'readonly' || mode() === 'refused') return ok({ error: 'forbidden', code: 'MCP_FORBIDDEN' });
  return mutate(() => mcpRows.set(tenant, none()));
 } },
};
export default { supabase };
