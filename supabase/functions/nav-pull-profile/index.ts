// Nav.com: pull a business credit profile for a contact.
// SCOPE: business credit only. PAIGE_SCOPE_GUARD applies.
import { requireAdmin, corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";
import { fireAndForgetBridge } from "../_shared/mmaOsBridge.ts";

const NAV_API = "https://api.nav.com/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { admin } = gate;

  const { contact_id } = await req.json().catch(() => ({}));
  if (!contact_id) return jsonResponse({ error: "contact_id required" }, 400);

  const apiKey = Deno.env.get("NAV_API_KEY");
  const partnerId = Deno.env.get("NAV_PARTNER_ID");
  if (!apiKey || !partnerId) {
    return jsonResponse({ activated: false, message: "Nav not yet configured" }, 200);
  }

  const { data: contact } = await admin
    .from("clients")
    .select("id, business_name, ein, email")
    .eq("id", contact_id)
    .maybeSingle();
  if (!contact) return jsonResponse({ error: "contact not found" }, 404);

  let navData: Record<string, unknown> = {};
  try {
    const res = await fetch(`${NAV_API}/business-credit/profile`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "X-Partner-Id": partnerId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ein: contact.ein, business_name: contact.business_name }),
    });
    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({ error: "nav_api_error", status: res.status, body: text }, 502);
    }
    navData = await res.json();
  } catch (e) {
    return jsonResponse({ error: "nav_fetch_failed", detail: String((e as Error).message) }, 502);
  }

  const scores = (navData.scores as Record<string, number>) ?? {};
  const tradeLines = (navData.trade_lines as unknown[]) ?? [];
  const navProfileId = (navData.profile_id as string) ?? null;

  // Fetch prior profile for delta detection
  const { data: prior } = await admin
    .from("paige_business_credit_profiles")
    .select("id, scores, history")
    .eq("contact_id", contact_id)
    .maybeSingle();

  const now = new Date().toISOString();
  const history = Array.isArray(prior?.history) ? [...prior!.history] : [];
  history.push({ at: now, scores });

  const payload = {
    contact_id,
    business_name: contact.business_name,
    ein: contact.ein,
    nav_profile_id: navProfileId,
    scores,
    trade_lines: tradeLines,
    last_pulled_at: now,
    history: history.slice(-50),
  };

  let saved: { id: string } | null = null;
  if (prior?.id) {
    const { data } = await admin
      .from("paige_business_credit_profiles")
      .update(payload)
      .eq("id", prior.id)
      .select("id")
      .single();
    saved = data;
  } else {
    const { data } = await admin
      .from("paige_business_credit_profiles")
      .insert(payload)
      .select("id")
      .single();
    saved = data;
  }

  // Threshold delta -> bridge
  const { data: cfg } = await admin
    .from("paige_config")
    .select("nav_threshold_delta")
    .eq("id", 1)
    .maybeSingle();
  const threshold = (cfg?.nav_threshold_delta as number) ?? 20;
  const priorScores = (prior?.scores ?? {}) as Record<string, number>;
  for (const [scoreType, newVal] of Object.entries(scores)) {
    const oldVal = priorScores[scoreType];
    if (typeof oldVal === "number" && Math.abs(newVal - oldVal) >= threshold) {
      fireAndForgetBridge("business_credit_score_changed", {
        contact_id,
        business_name: contact.business_name,
        score_type: scoreType,
        old_value: oldVal,
        new_value: newVal,
        delta: newVal - oldVal,
        snapshot_id: saved?.id,
      });
    }
  }

  return jsonResponse({ ok: true, profile_id: saved?.id, scores });
});
