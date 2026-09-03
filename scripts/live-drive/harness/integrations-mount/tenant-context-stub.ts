/** Synthetic workspace-switch seam for the real Integration UI. No auth or provider calls. */
import { useSyncExternalStore } from 'react';
let tenantId = 'harness-tenant-a';
const listeners = new Set<() => void>();
export const currentHarnessTenantId = () => tenantId;
window.addEventListener('n8n-harness-switch', () => { tenantId = tenantId.endsWith('-a') ? 'harness-tenant-b' : 'harness-tenant-a'; listeners.forEach(notify => notify()); });
export function useTenantContext() {
 const activeTenantId = useSyncExternalStore(notify => { listeners.add(notify); return () => { listeners.delete(notify); }; }, currentHarnessTenantId);
 const tenants = [{ id: 'harness-tenant-a', account_number: '1971670', name: 'Harness workspace A' }, { id: 'harness-tenant-b', account_number: '1971671', name: 'Harness workspace B' }];
 return { activeUserId: 'harness-owner', activeTenantId, loading: false, activeTenant: tenants.find(t => t.id === activeTenantId), tenants, isPlatformStaff: false };
}
export default { useTenantContext };
