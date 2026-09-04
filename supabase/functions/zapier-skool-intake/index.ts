// Dedicated Zapier -> Skool intake. The secret header resolves one immutable route;
// no tenant/workspace identifier from the request body is read or trusted.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/adminAuth.ts";

const MAX_BYTES = 64 * 1024;
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function digest(value: string) { return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BYTES) return jsonResponse({ error: "payload_too_large" }, 413);
  const routeToken = req.headers.get("x-paige-route-token") ?? "";
  const idempotency_key = (req.headers.get("idempotency-key") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(routeToken) || !idempotency_key || idempotency_key.length > 180) return jsonResponse({ error: "request_refused" }, 401);
  const text = await req.text();
  if (!text || new TextEncoder().encode(text).byteLength > MAX_BYTES) return jsonResponse({ error: "payload_invalid" }, 400);
  const body = (() => { try { const value = JSON.parse(text); return value && typeof value === "object" && !Array.isArray(value) ? value : null; } catch { return null; } })();
  if (!body) return jsonResponse({ error: "payload_invalid" }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.rpc("process_zapier_skool_intake", {
    _route_token_hash: await digest(routeToken), _idempotency_key: idempotency_key, _payload_hash: await digest(text), _payload: body,
  });
  if (error) {
    const code = String(error.message ?? "");
    if (code.includes("IDEMPOTENCY_CONFLICT")) return jsonResponse({ error: "idempotency_conflict" }, 409);
    if (code.includes("ROUTE_NOT_FOUND")) return jsonResponse({ error: "request_refused" }, 401);
    return jsonResponse({ error: "intake_failed" }, 500);
  }
  // A receipt id is safe operational correlation; no contact id, tenant id, or payload returns.
  return jsonResponse({ ok: data?.ok === true, outcome: data?.outcome, receipt_id: data?.receipt_id }, data?.outcome === "failed" ? 422 : 200);
});
