// One-shot seeder for _internal_secrets rows.
// POST { key: "automation_webhook_key" }  -> reads env AUTOMATION_WEBHOOK_ENCRYPTION_KEY
// POST { key: "platform_stage_change_webhook_url", value: "https://..." } -> stores literal value
// Requires header x-seed-token equal to PAIGE_MCP_PLATFORM_KEY.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED: Record<string, string> = {
  automation_webhook_key: 'AUTOMATION_WEBHOOK_ENCRYPTION_KEY',
  // value-supplied keys use empty env mapping
  platform_stage_change_webhook_url: '',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    // Auth: platform owner via JWT, OR x-seed-token = PAIGE_MCP_PLATFORM_KEY
    const authHeader = req.headers.get('Authorization') ?? '';
    const seedToken = req.headers.get('x-seed-token');
    const expectedToken = Deno.env.get('PAIGE_MCP_PLATFORM_KEY');
    let authorized = !!(expectedToken && seedToken === expectedToken);
    if (!authorized && authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: owner } = await userClient.rpc('is_platform_owner');
      authorized = owner === true;
    }
    if (!authorized) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const key = String(body.key ?? '');
    if (!(key in ALLOWED)) return json({ error: 'unknown key', allowed: Object.keys(ALLOWED) }, 400);

    let value: string;
    const envName = ALLOWED[key];
    if (envName) {
      const v = Deno.env.get(envName);
      if (!v) return json({ error: `env ${envName} not set` }, 500);
      value = v;
    } else {
      value = String(body.value ?? '');
      if (!value) return json({ error: 'value required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await supabase
      .from('_internal_secrets')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, key, length: value.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
