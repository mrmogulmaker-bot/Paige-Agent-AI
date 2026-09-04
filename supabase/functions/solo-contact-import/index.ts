import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createContactImportHandler } from '../_shared/contact-import-handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createContactImportHandler({
  async authorize(request) {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return null;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: identity, error: authError } = await caller.auth.getUser();
    if (authError || !identity.user) return null;
    const { data: tenantId, error: tenantError } = await caller.rpc('current_user_tenant_id');
    if (tenantError || typeof tenantId !== 'string') return null;
    // Database preparation RPCs also recheck this captured actor/workspace under their locks.
    const { data: allowed, error: roleError } = await admin.rpc('is_tenant_admin_as', { _actor: identity.user.id, _tenant: tenantId });
    if (roleError || allowed !== true) return null;
    return { actorId: identity.user.id, tenantId };
  },
  rpc: (name, args) => admin.rpc(name, args),
}));
