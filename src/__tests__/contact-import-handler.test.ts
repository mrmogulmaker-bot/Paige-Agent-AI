import { describe, expect, it, vi } from 'vitest';
import { createContactImportHandler } from '../../supabase/functions/_shared/contact-import-handler';

const tenant = '11111111-1111-4111-8111-111111111111';
const run = '22222222-2222-4222-8222-222222222222';
const request = (body: unknown) => new Request('https://example.test/import', { method: 'POST', body: JSON.stringify(body) });
function setup() {
  const rpc = vi.fn(async (name: string) => ({ data: name === 'contact_import_identities' ? [] : run, error: null as {message:string} | null }));
  return { rpc, handler: createContactImportHandler({ authorize: async () => ({ tenantId: tenant, actorId: 'actor' }), rpc }) };
}
describe('owner contact import preparation boundary', () => {
  it('refuses a changed workspace before reading identities or staging', async () => {
    const {handler,rpc} = setup();
    expect((await handler(request({ operation: 'stage', expected_tenant_id: run }))).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('has no public commit operation even for an authenticated owner', async () => {
    const {handler,rpc} = setup();
    expect((await handler(request({ operation: 'commit', expected_tenant_id: tenant, run_id: run }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('normalizes and stages through server-derived actor and tenant only', async () => {
    const {handler,rpc} = setup();
    const response = await handler(request({ operation: 'stage', expected_tenant_id: tenant, p_tenant: run, p_actor:'spoof',
      source:{system:'csv',accountKey:'source',snapshotKey:'version-1',observedAt:'2026-09-04T00:00:00Z'},
      mapping:{Email:'email'},csv:'Email\nPERSON@EXAMPLE.TEST' }));
    expect(response.status).toBe(200);
    expect(rpc.mock.calls[1][0]).toBe('stage_contact_import');
    const args = (rpc.mock.calls[1] as unknown as [string,Record<string,unknown>])[1];
    expect(args.p_tenant).toBe(tenant); expect(args.p_actor).toBe('actor');
    expect(JSON.stringify(args.p_preview)).toContain('person@example.test');
    expect(await response.json()).not.toHaveProperty('rows');
  });
  it('maps a database workspace race to refusal without SQL details', async () => {
    const {handler,rpc} = setup();
    rpc.mockResolvedValue({data:null as unknown as string,error:{message:'WORKSPACE_CHANGED secret row detail'}});
    const response = await handler(request({ operation: 'status', expected_tenant_id:tenant,run_id:run }));
    expect(response.status).toBe(409); expect(await response.json()).toEqual({error:'workspace_changed'});
  });
  it('refuses access without a verified workspace owner', async () => {
    const rpc=vi.fn(); const handler=createContactImportHandler({authorize:async()=>null,rpc});
    expect((await handler(request({operation:'stage'}))).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  });
});
