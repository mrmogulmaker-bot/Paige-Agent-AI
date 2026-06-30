// Admin-only: register, verify, refresh, or delete a tenant's Resend sender domain.
// Verbs: list | add | refresh | set_default | remove
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_BASE = "https://api.resend.com";

async function resend(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY missing");
  const res = await fetch(`${RESEND_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`resend_${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

function mapStatus(s: string | undefined): string {
  if (!s) return "pending";
  const k = s.toLowerCase();
  if (k === "verified") return "verified";
  if (k === "failed" || k === "temporary_failure") return "failed";
  return "verifying";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isOwner } = await admin.rpc("is_platform_owner");
  if (!isAdmin && !isOwner) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const verb: string = body?.verb;

  // Tenant context: prefer body.tenant_id (owner can target any), else user's active tenant.
  const { data: profile } = await admin.from("profiles").select("active_tenant_id").eq("user_id", user.id).maybeSingle();
  const tenantId: string = body?.tenant_id || profile?.active_tenant_id;
  if (!tenantId) {
    return new Response(JSON.stringify({ error: "no_tenant" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    if (verb === "list") {
      const { data } = await admin.from("tenant_email_domains").select("*").eq("tenant_id", tenantId).order("created_at");
      return new Response(JSON.stringify({ domains: data ?? [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (verb === "add") {
      const domain = String(body.domain || "").trim().toLowerCase();
      const fromName = String(body.from_name || "").trim() || "Notifications";
      const fromLocal = String(body.from_email_local || "no-reply").trim().toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
        return new Response(JSON.stringify({ error: "invalid_domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const created = await resend("/domains", { method: "POST", body: JSON.stringify({ name: domain }) });
      const records = created?.records ?? [];
      const status = mapStatus(created?.status);
      const { data: existingDefault } = await admin
        .from("tenant_email_domains")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .maybeSingle();
      const isDefault = !existingDefault;
      const { data, error } = await admin
        .from("tenant_email_domains")
        .insert({
          tenant_id: tenantId,
          domain,
          from_email_local: fromLocal,
          from_name: fromName,
          resend_domain_id: created?.id ?? null,
          status,
          dns_records: records,
          is_default: isDefault,
          created_by_user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ domain: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (verb === "refresh") {
      const id = String(body.id);
      const { data: row } = await admin.from("tenant_email_domains").select("*").eq("id", id).maybeSingle();
      if (!row) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: corsHeaders });
      if (row.resend_domain_id) {
        // Trigger verification + read status
        try { await resend(`/domains/${row.resend_domain_id}/verify`, { method: "POST" }); } catch (_) { /* ignore */ }
        const info = await resend(`/domains/${row.resend_domain_id}`);
        const status = mapStatus(info?.status);
        await admin.from("tenant_email_domains").update({
          status,
          dns_records: info?.records ?? row.dns_records,
          verified_at: status === "verified" ? new Date().toISOString() : row.verified_at,
        }).eq("id", id);
      }
      const { data: fresh } = await admin.from("tenant_email_domains").select("*").eq("id", id).maybeSingle();
      return new Response(JSON.stringify({ domain: fresh }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (verb === "set_default") {
      const id = String(body.id);
      await admin.from("tenant_email_domains").update({ is_default: false }).eq("tenant_id", tenantId);
      await admin.from("tenant_email_domains").update({ is_default: true }).eq("id", id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (verb === "remove") {
      const id = String(body.id);
      const { data: row } = await admin.from("tenant_email_domains").select("*").eq("id", id).maybeSingle();
      if (row?.resend_domain_id) {
        try { await resend(`/domains/${row.resend_domain_id}`, { method: "DELETE" }); } catch (_) { /* ignore */ }
      }
      await admin.from("tenant_email_domains").delete().eq("id", id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown_verb" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
