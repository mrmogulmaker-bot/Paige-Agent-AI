// Nav.com: batch refresh stale business credit profiles.
import { requireAdmin, corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { admin } = gate;

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await admin
    .from("paige_business_credit_profiles")
    .select("contact_id")
    .or(`last_pulled_at.is.null,last_pulled_at.lt.${cutoff}`)
    .limit(25);

  const projectRef = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let queued = 0;
  for (const row of stale ?? []) {
    try {
      await fetch(`${projectRef}/functions/v1/nav-pull-profile`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contact_id: row.contact_id }),
      });
      queued++;
    } catch {
      // continue
    }
  }
  return jsonResponse({ ok: true, refreshed: queued });
});
