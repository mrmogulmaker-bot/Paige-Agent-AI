import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Claim = { version_id: string; storage_path: string };
type QuarantineClaim = { quarantine_id: string; storage_path: string };

Deno.serve(async (request) => {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff",
  };
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (request.headers.get("authorization") !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: "reconciliation_unavailable" }, 403);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("business_vault_claim_stale_uploads", {
    p_before: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    p_limit: 50,
  });
  if (error) return json({ error: "reconciliation_unavailable" }, 503);
  let cleaned = 0;
  let deferred = 0;
  for (const claim of (data ?? []) as Claim[]) {
    const removed = await admin.storage.from("business-vault-files").remove([claim.storage_path]);
    if (removed.error) {
      deferred += 1;
      continue;
    }
    const cancelled = await admin.rpc("business_vault_cancel_stale_upload", {
      p_version_id: claim.version_id,
    });
    if (cancelled.error) deferred += 1;
    else cleaned += 1;
  }
  const quarantine = await admin.rpc("business_vault_claim_quarantine_cleanup", { p_limit: 50 });
  if (quarantine.error) return json({ error: "reconciliation_unavailable" }, 503);
  let quarantineCleaned = 0;
  for (const claim of (quarantine.data ?? []) as QuarantineClaim[]) {
    const removed = await admin.storage.from("business-vault-quarantine").remove([claim.storage_path]);
    if (removed.error) {
      deferred += 1;
      await admin.rpc("business_vault_defer_quarantine_cleanup", {
        p_quarantine_id: claim.quarantine_id,
      });
      continue;
    }
    const completed = await admin.rpc("business_vault_complete_quarantine_cleanup", {
      p_quarantine_id: claim.quarantine_id,
    });
    if (completed.error) deferred += 1;
    else quarantineCleaned += 1;
  }
  return json({ ok: true, cleaned, quarantine_cleaned: quarantineCleaned, deferred }, 200);
});
