// Plaid item updates webhook. Verifies Plaid-Verification JWT before any writes.
import { corsHeaders } from "../_shared/adminAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID");
const PLAID_SECRET = Deno.env.get("PLAID_SECRET");
const PLAID_ENV = Deno.env.get("PLAID_ENV") ?? "sandbox";
const PLAID_HOST = `https://${PLAID_ENV}.plaid.com`;

const plaidKeyCache = new Map<string, JsonWebKey>();

function b64urlToUint8(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fetchPlaidVerificationKey(kid: string): Promise<JsonWebKey | null> {
  const cached = plaidKeyCache.get(kid);
  if (cached) return cached;
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) return null;
  try {
    const resp = await fetch(`${PLAID_HOST}/webhook_verification_key/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, key_id: kid }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const jwk = json?.key as JsonWebKey | undefined;
    if (!jwk) return null;
    plaidKeyCache.set(kid, jwk);
    return jwk;
  } catch {
    return null;
  }
}

async function verifyPlaidWebhook(body: string, signedJwt: string | null): Promise<boolean> {
  if (!signedJwt) return false;
  const parts = signedJwt.split(".");
  if (parts.length !== 3) return false;
  try {
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(new TextDecoder().decode(b64urlToUint8(headerB64)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToUint8(payloadB64)));
    if (header.alg !== "ES256" || !header.kid) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.iat !== "number" || nowSec - payload.iat > 5 * 60) return false;
    const bodyBytes = new TextEncoder().encode(body);
    const hashBuffer = await crypto.subtle.digest("SHA-256", bodyBytes);
    const bodyHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    if (payload.request_body_sha256 !== bodyHash) return false;
    const jwk = await fetchPlaidVerificationKey(header.kid);
    if (!jwk) return false;
    const cryptoKey = await crypto.subtle.importKey(
      "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
    );
    const signature = b64urlToUint8(signatureB64);
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, cryptoKey, signature, signingInput,
    );
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.text();
  const sig = req.headers.get("plaid-verification");
  const verified = await verifyPlaidWebhook(body, sig);
  if (!verified) {
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: Record<string, unknown> = {};
  try { event = JSON.parse(body); } catch { /* noop */ }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  await admin.from("webhook_event_log").insert({
    source: "paige-plaid",
    event_type: (event.webhook_type ?? "unknown") as string,
    payload: event,
  }).catch(() => null);

  // Only act when plaid_activated flag is on.
  const { data: cfg } = await admin
    .from("paige_config")
    .select("plaid_activated")
    .eq("id", 1)
    .maybeSingle();
  if (cfg?.plaid_activated && event.webhook_code === "SYNC_UPDATES_AVAILABLE" && event.item_id) {
    const { data: conn } = await admin
      .from("paige_bank_connections")
      .select("id")
      .eq("plaid_item_id", event.item_id)
      .maybeSingle();
    if (conn) {
      const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const url = Deno.env.get("SUPABASE_URL");
      await fetch(`${url}/functions/v1/paige-plaid-sync-transactions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${svc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: conn.id }),
      }).catch(() => null);
    }
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
