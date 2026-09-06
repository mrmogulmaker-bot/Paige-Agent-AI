import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("BUSINESS_VAULT_ALLOWED_ORIGINS") ?? "https://paigeagent.ai,https://app.paigeagent.ai")
    .split(",")
    .map((value) => value.trim()),
);

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const cors = {
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  };
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (request.method === "OPTIONS") return new Response(null, { status: origin && ALLOWED_ORIGINS.has(origin) ? 204 : 403, headers: cors });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "download_refused" }, 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "session_required" }, 401);

  const scoped = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await scoped.auth.getUser();
  if (userError || !userData.user) return json({ error: "session_required" }, 401);
  const body = await request.json().catch(() => null) as { version_id?: unknown; expected_tenant?: unknown } | null;
  if (!body || typeof body.version_id !== "string" || typeof body.expected_tenant !== "string"
    || !/^[0-9a-f-]{36}$/i.test(body.version_id) || !/^[0-9a-f-]{36}$/i.test(body.expected_tenant)) {
    return json({ error: "download_refused" }, 403);
  }
  const { data: version, error } = await scoped.rpc("business_vault_download_version", {
    p_expected_tenant: body.expected_tenant,
    p_version_id: body.version_id,
  });
  if (error || !version) return json({ error: "download_refused" }, 403);

  const { data: object, error: storageError } = await admin.storage.from("business-vault-files").download(version.storage_path);
  if (storageError || !object) return json({ error: "download_unavailable" }, 503);
  const safeName = version.original_filename.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "vault-document";
  return new Response(object, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": version.actual_mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "X-Business-Vault-Validation": version.validation_state,
    },
  });
});
