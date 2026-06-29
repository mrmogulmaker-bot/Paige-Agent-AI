// Admin-guarded hard delete for a CRM contact. Cleans up child rows that have
// FK references and leaves any linked portal user account alone.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { ok: false, error: "Missing Authorization" });

    // Identify caller + confirm admin role.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json(401, { ok: false, error: "Invalid session" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin" || r.role === "owner");
    if (!isAdmin) return json(403, { ok: false, error: "Admin only" });

    const body = await req.json().catch(() => ({}));
    const contactId = body?.contact_id;
    if (!contactId || typeof contactId !== "string") {
      return json(400, { ok: false, error: "contact_id required" });
    }

    // Walk child tables. Best-effort: ignore tables that don't apply.
    const childOps = [
      admin.from("deal_activities").delete().in(
        "deal_id",
        (await admin.from("deals").select("id").eq("contact_id", contactId)).data?.map((d: any) => d.id) || [],
      ),
      admin.from("deals").delete().eq("contact_id", contactId),
      admin.from("client_memory").delete().eq("client_id", contactId),
      admin.from("documents").delete().eq("client_id", contactId),
      admin.from("paige_coach_assignments").delete().eq("client_id", contactId),
      admin.from("coach_clients").delete().eq("client_id", contactId),
    ];
    await Promise.allSettled(childOps);

    const { error: delErr } = await admin.from("clients").delete().eq("id", contactId);
    if (delErr) return json(400, { ok: false, error: delErr.message });

    // Audit (best effort)
    await admin.from("audit_logs").insert({
      action: "contact.deleted",
      entity: "client",
      entity_id: contactId,
      user_id: user.id,
      data: { source: "delete-contact-fn" },
    }).then(() => {}).catch(() => {});

    return json(200, { ok: true, deleted_id: contactId });
  } catch (e) {
    return json(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
