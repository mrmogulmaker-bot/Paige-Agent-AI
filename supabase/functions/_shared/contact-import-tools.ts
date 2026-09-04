/** Server-only adapter called after the canonical Chat action gate. Raw source rows
 * never enter model context; the owner reviews them in the import surface. */
type Obj = Record<string, unknown>;
type Admin = { rpc: (name: string, args: Obj) => PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export const CONTACT_IMPORT_TOOLS = [
  { type: 'function', function: { name: 'contact_import_list', description: 'Read this workspace contact import previews and selected batches. Explain counts and unresolved decisions; never expose internal IDs. A preview is not a completed import.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'contact_import_commit', description: 'Import the exact immutable batch the workspace owner selected after reviewing the import preview. Requires canonical owner approval. Preserve consent and existing records; never send messages or enroll contacts. Read the selected batch and report counts before requesting approval.', parameters: { type: 'object', properties: { batch_id: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['batch_id'], additionalProperties: false } } },
] as const;
export const CONTACT_IMPORT_TOOL_NAMES = new Set<string>(CONTACT_IMPORT_TOOLS.map(tool => tool.function.name));
export async function runContactImportTool(input: { admin: Admin; tenantId: string; userId: string; tool: string; args: Obj; mutationApproved: boolean; requestNonce?: string }): Promise<Obj> {
  if (!input.tenantId || !input.userId || !CONTACT_IMPORT_TOOL_NAMES.has(input.tool)) return { success: false, error: 'workspace_access_required' };
  const bound = { p_tenant: input.tenantId, p_actor: input.userId };
  if (input.tool === 'contact_import_commit' && (!input.mutationApproved || !input.requestNonce)) return { success: false, error: 'owner_approval_required' };
  const batch = input.args.batch_id;
  if (input.tool === 'contact_import_commit' && (typeof batch !== 'string' || !/^[0-9a-f-]{36}$/i.test(batch))) return { success: false, error: 'selected_batch_required' };
  const { data, error } = await input.admin.rpc(input.tool === 'contact_import_list' ? 'list_contact_imports' : 'commit_contact_import_batch', {
    ...bound, ...(input.tool === 'contact_import_commit' ? { p_batch: batch, p_request_nonce: input.requestNonce } : {}),
  });
  if (error) return { success: false, error: /WORKSPACE_CHANGED|TENANT_CHANGED/.test(error.message ?? '') ? 'workspace_changed' : 'import_refused', retry_safe: false };
  if (input.tool === 'contact_import_list') return { success: true, imports: data, source: 'stored_import_previews' };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { success: false, error: 'import_outcome_unavailable' };
  const result = data as Obj;
  const counts: Obj = {};
  for (const key of ['created', 'retained', 'skipped']) {
    if (!Number.isSafeInteger(result[key]) || Number(result[key]) < 0) return { success: false, error: 'import_outcome_unavailable' };
    counts[key] = result[key];
  }
  return { success: result.status === 'completed', status: result.status === 'completed' ? 'completed' : 'unknown', ...counts, messages_sent: 0, source: 'committed_import_batch' };
}
