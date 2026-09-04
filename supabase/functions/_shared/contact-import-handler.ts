import { buildImportPreview, type ExistingImportIdentity, type ImportMapping, type ImportSource } from './contact-import-contract.ts';

type Obj = Record<string, unknown>;
type RpcResult = { data: unknown; error: { message?: string } | null };
export type ImportPorts = {
  authorize: (request: Request) => Promise<{ tenantId: string; actorId: string } | null>;
  rpc: (name: string, args: Obj) => PromiseLike<RpcResult>;
};
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const record = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Owner preparation only. Live contact writes have no HTTP operation here:
 * the canonical PAIGE approval dispatcher calls the separate commit RPC. */
export function createContactImportHandler(ports: ImportPorts) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    let authority: { tenantId: string; actorId: string } | null;
    try { authority = await ports.authorize(request); } catch { return json({ error: 'workspace_access_unavailable' }, 503); }
    if (!authority) return json({ error: 'workspace_access_required' }, 403);
    try {
      const raw = await request.text();
      if (raw.length > 5_500_000) return json({ error: 'import_too_large' }, 413);
      const body = record(JSON.parse(raw));
      if (body.expected_tenant_id !== authority.tenantId) return json({ error: 'workspace_changed' }, 409);
      const bound = { p_tenant: authority.tenantId, p_actor: authority.actorId };
      const call = async (name: string, args: Obj = {}) => {
        const result = await ports.rpc(name, { ...args, ...bound });
        if (result.error) throw new Error(result.error.message ?? 'IMPORT_UNAVAILABLE');
        return result.data;
      };
      if (body.operation === 'stage') {
        if (typeof body.csv !== 'string') return json({ error: 'import_file_required' }, 400);
        const source = record(body.source) as unknown as ImportSource;
        const mapping = record(body.mapping) as ImportMapping;
        const identities: ExistingImportIdentity[] = [];
        for (let offset = 0; ; offset += 1000) {
          if (offset >= 100_000) throw new Error('IMPORT_TOO_MANY_IDENTITIES');
          const page = await call('contact_import_identities', { p_offset: offset, p_limit: 1000 });
          if (!Array.isArray(page)) throw new Error('IMPORT_IDENTITIES_UNAVAILABLE');
          for (const value of page) {
            const identity = record(value);
            const base = identity as unknown as ExistingImportIdentity;
            identities.push(base);
            for (const item of Array.isArray(identity.sources) ? identity.sources : []) {
              const sourceIdentity = record(item);
              identities.push({ ...base, externalId: String(sourceIdentity.externalId ?? ''),
                sourceSystem: String(sourceIdentity.sourceSystem ?? ''), sourceAccountKey: String(sourceIdentity.sourceAccountKey ?? '') });
            }
          }
          if (page.length < 1000) break;
        }
        const preview = buildImportPreview(body.csv, mapping, identities, source);
        const runId = await call('stage_contact_import', { p_source: source, p_preview: preview });
        return json({ run_id: runId, counts: preview.counts, proposed_batch_size: preview.proposedBatchSize });
      }
      if (!uuid(body.run_id)) return json({ error: 'import_run_required' }, 400);
      if (body.operation === 'preview') {
        const offset = body.offset ?? 0;
        if (!Number.isInteger(offset) || Number(offset) < 0) return json({ error: 'invalid_page' }, 400);
        return json(await call('read_contact_import_preview', { p_run: body.run_id, p_offset: offset, p_limit: 100 }));
      }
      if (body.operation === 'status') return json(await call('contact_import_status', { p_run: body.run_id }));
      if (body.operation === 'select') {
        if (!Array.isArray(body.selection) || body.selection.length < 1 || body.selection.length > 100 || !uuid(body.request_nonce)) return json({ error: 'invalid_selection' }, 400);
        const batchId = await call('select_contact_import_batch', { p_run: body.run_id, p_selection: body.selection, p_request_nonce: body.request_nonce });
        return json({ batch_id: batchId, state: 'awaiting_paige_approval', contacts_written: 0 });
      }
      if (body.operation === 'cancel') { await call('cancel_contact_import', { p_run: body.run_id }); return json({ state: 'cancelled' }); }
      return json({ error: 'unsupported_operation' }, 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/WORKSPACE_CHANGED|TENANT_CHANGED/.test(message)) return json({ error: 'workspace_changed' }, 409);
      // Never return SQL/provider text, source fields, or identifiers as an error.
      const code = /^IMPORT_[A-Z_]+$/.test(message) ? message.toLowerCase() : 'import_unavailable';
      return json({ error: code }, 400);
    }
  };
}
