// SmartCredit: pull owner 3-bureau snapshot — FUNDING ELIGIBILITY LENS ONLY.
// PAIGE_SCOPE_GUARD: no dispute / repair / FCRA workflows here.
import { requireAdmin, corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";
import { assertNoDisputeFields } from "../_shared/scopeGuard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { admin, userId } = gate;

  const body = await req.json().catch(() => ({}));
  const violation = assertNoDisputeFields(body);
  if (violation) {
    await admin.from("audit_logs").insert({
      user_id: userId,
      entity: "smartcredit-pull-snapshot",
      action: "scope_violation",
      data: { field: violation },
    });
    return jsonResponse({ error: "scope_violation", field: violation }, 400);
  }

  const { contact_id } = body;
  if (!contact_id) return jsonResponse({ error: "contact_id required" }, 400);

  const { data: cfg } = await admin
    .from("paige_config")
    .select("smartcredit_enabled")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.smartcredit_enabled) {
    return jsonResponse({ activated: false, message: "SmartCredit not yet enabled" }, 200);
  }

  const apiKey = Deno.env.get("SMARTCREDIT_API_KEY");
  if (!apiKey) return jsonResponse({ activated: false, message: "SMARTCREDIT_API_KEY missing" }, 200);

  const { data: contact } = await admin
    .from("clients")
    .select("id, email, first_name, last_name")
    .eq("id", contact_id)
    .maybeSingle();
  if (!contact) return jsonResponse({ error: "contact not found" }, 404);

  let snapshot: Record<string, unknown> = {};
  try {
    const res = await fetch("https://api.smartcredit.com/v1/snapshot", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: contact.email }),
    });
    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({ error: "smartcredit_api_error", status: res.status, body: text }, 502);
    }
    snapshot = await res.json();
  } catch (e) {
    return jsonResponse({ error: "smartcredit_fetch_failed", detail: String((e as Error).message) }, 502);
  }

  const bureaus = (snapshot.bureaus as Array<{ bureau: string; score: number; factors?: unknown[] }>) ?? [];
  const inserts = bureaus
    .filter((b) => ["experian", "equifax", "transunion"].includes(b.bureau?.toLowerCase()))
    .map((b) => ({
      contact_id,
      bureau: b.bureau.toLowerCase(),
      score: b.score,
      factors: b.factors ?? [],
    }));

  if (inserts.length === 0) return jsonResponse({ ok: true, snapshots: 0 });

  const { data, error } = await admin
    .from("paige_owner_credit_snapshots")
    .insert(inserts)
    .select("id, bureau, score");
  if (error) return jsonResponse({ error: error.message }, 500);

  // Funding-eligibility lens: highest mid-bureau score → strong/moderate/limited
  const top = Math.max(...(data ?? []).map((d) => d.score ?? 0));
  const eligibility = top >= 700 ? "strong" : top >= 640 ? "moderate" : "limited";

  return jsonResponse({ ok: true, snapshots: data, funding_eligibility: eligibility });
});
