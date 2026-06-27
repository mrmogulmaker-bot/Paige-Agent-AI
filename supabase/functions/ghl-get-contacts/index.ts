// Read contacts from GoHighLevel via Private Integration Token.
// Body: { limit?: number, startAfterId?: string }
import { corsHeaders, jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";

const GHL_BASE = "https://services.leadconnectorhq.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { admin } = guard;

  const body = await req.json().catch(() => ({}));
  const pit = Deno.env.get("GHL_PIT");
  const locationId = Deno.env.get("GHL_LOCATION_ID");
  if (!pit || !locationId) return jsonResponse({ error: "ghl_not_configured" }, 500);

  const params = new URLSearchParams({
    locationId,
    limit: String(Math.min(body.limit ?? 100, 100)),
  });
  if (body.startAfterId) params.set("startAfterId", body.startAfterId);

  const res = await fetch(`${GHL_BASE}/contacts/?${params}`, {
    headers: {
      Authorization: `Bearer ${pit}`,
      Version: "2021-07-28",
      Accept: "application/json",
    },
  });
  if (!res.ok) return jsonResponse({ error: `ghl_${res.status}`, detail: (await res.text()).slice(0, 500) }, 502);
  const json = await res.json();
  return jsonResponse({ ok: true, contacts: json?.contacts ?? [], meta: json?.meta ?? null });
});
