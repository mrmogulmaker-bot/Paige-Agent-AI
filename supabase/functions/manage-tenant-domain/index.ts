// Tenant domain management — EMAIL sender domains (Resend) + WEBSITE custom domains (#178).
//
// EMAIL verbs:  list | add | refresh | set_default | remove   (Resend sender-domain registry)
// WEB verbs:    web_list | web_add | web_verify | web_set_default | web_remove   (#178 publishing spine)
//
// §9 (fixed): the caller's tenant is SERVER-DERIVED. A non-owner admin is pinned to their OWN
// active tenant and can NEVER target another tenant via body.tenant_id (that was a live
// cross-tenant BIND/IDOR — any global-admin could register/delete a VICTIM tenant's domain).
// Only is_platform_owner() may pass an explicit body.tenant_id. Every by-id operation is
// tenant-scoped so a row from another tenant can't be read/mutated/deleted by id. Web-domain
// WRITES go through SECURITY DEFINER RPCs (web_domain_claim / web_domain_mark_verified) called
// with the USER's JWT, so those RPCs re-derive the tenant themselves — never a forgeable body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deriveCallerTenant } from "../_shared/tenant-domain-scope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const RESEND_BASE = "https://api.resend.com";

async function resend(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY missing");
  const res = await fetch(`${RESEND_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`resend_${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

function mapStatus(s: string | undefined): string {
  if (!s) return "pending";
  const k = s.toLowerCase();
  if (k === "verified") return "verified";
  if (k === "failed" || k === "temporary_failure") return "failed";
  return "verifying";
}

// Attach a verified custom host to the Vercel project so it actually resolves at the edge.
// Env-gated + honest degrade (§13): if Vercel isn't configured, the domain is still VERIFIED —
// attachment is reported as pending, never faked, and never fails the verify.
async function vercelAttach(host: string): Promise<{ attached: boolean; vercel_domain_id: string | null; note?: string }> {
  const token = Deno.env.get("VERCEL_API_TOKEN");
  const projectId = Deno.env.get("VERCEL_PROJECT_ID");
  if (!token || !projectId) {
    return { attached: false, vercel_domain_id: null, note: "vercel_not_configured" };
  }
  const teamId = Deno.env.get("VERCEL_TEAM_ID");
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  try {
    const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/domains${qs}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: host }),
    });
    const j = await res.json().catch(() => ({}));
    // 409 = already attached to this project → treat as success (idempotent).
    if (res.ok || res.status === 409) {
      return { attached: true, vercel_domain_id: (j?.uid || j?.id || host) as string };
    }
    console.error(`[manage-tenant-domain] vercel attach ${res.status} for ${host}: ${JSON.stringify(j).slice(0, 200)}`);
    return { attached: false, vercel_domain_id: null, note: `vercel_${res.status}` };
  } catch (e) {
    console.error(`[manage-tenant-domain] vercel attach threw for ${host}: ${(e as Error).message}`);
    return { attached: false, vercel_domain_id: null, note: "vercel_error" };
  }
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
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isOwner } = await admin.rpc("is_platform_owner");
  if (!isAdmin && !isOwner) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const verb: string = body?.verb;

  // §9 tenant derivation — SERVER-SIDE, never trust body for a non-owner.
  //   • platform owner: may target any tenant via body.tenant_id (fleet operation).
  //   • tenant admin: pinned to their OWN active tenant. A body.tenant_id that disagrees is a
  //     forged cross-tenant attempt → reject 403 + log (§13 honest failure), never silently honor.
  const { data: profile } = await admin.from("profiles").select("active_tenant_id").eq("user_id", user.id).maybeSingle();
  const activeTenant: string | null = profile?.active_tenant_id ?? null;
  const decision = deriveCallerTenant({ isOwner: !!isOwner, bodyTenantId: body?.tenant_id, activeTenant });
  if (!decision.ok) {
    if (decision.error === "cross_tenant_forbidden") {
      console.warn(`[manage-tenant-domain] §9 REJECT cross-tenant target: user=${user.id} active=${activeTenant} attempted=${body?.tenant_id} verb=${verb}`);
    }
    return json({ error: decision.error }, decision.status);
  }
  const tenantId = decision.tenantId;

  try {
    // ───────────────────────────── EMAIL sender domains (Resend) ─────────────────────────────
    if (verb === "list") {
      const { data } = await admin.from("tenant_email_domains").select("*").eq("tenant_id", tenantId).order("created_at");
      return json({ domains: data ?? [] });
    }

    if (verb === "add") {
      const domain = String(body.domain || "").trim().toLowerCase();
      const fromName = String(body.from_name || "").trim() || "Notifications";
      const fromLocal = String(body.from_email_local || "no-reply").trim().toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return json({ error: "invalid_domain" }, 400);
      const created = await resend("/domains", { method: "POST", body: JSON.stringify({ name: domain }) });
      const records = created?.records ?? [];
      const status = mapStatus(created?.status);
      const { data: existingDefault } = await admin
        .from("tenant_email_domains").select("id").eq("tenant_id", tenantId).eq("is_default", true).maybeSingle();
      const { data, error } = await admin
        .from("tenant_email_domains")
        .insert({
          tenant_id: tenantId, domain, from_email_local: fromLocal, from_name: fromName,
          resend_domain_id: created?.id ?? null, status, dns_records: records,
          is_default: !existingDefault, created_by_user_id: user.id,
        })
        .select().single();
      if (error) throw error;
      return json({ domain: data });
    }

    if (verb === "refresh") {
      const id = String(body.id);
      // §9: scope the lookup to the caller's tenant — a foreign row id resolves to nothing (404).
      const { data: row } = await admin.from("tenant_email_domains").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      if (!row) return json({ error: "not_found" }, 404);
      if (row.resend_domain_id) {
        try { await resend(`/domains/${row.resend_domain_id}/verify`, { method: "POST" }); } catch (_) { /* ignore */ }
        const info = await resend(`/domains/${row.resend_domain_id}`);
        const status = mapStatus(info?.status);
        await admin.from("tenant_email_domains").update({
          status, dns_records: info?.records ?? row.dns_records,
          verified_at: status === "verified" ? new Date().toISOString() : row.verified_at,
        }).eq("id", id).eq("tenant_id", tenantId);
      }
      const { data: fresh } = await admin.from("tenant_email_domains").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      return json({ domain: fresh });
    }

    if (verb === "set_default") {
      const id = String(body.id);
      // §9: only flip a row that belongs to the caller's tenant.
      const { data: target } = await admin.from("tenant_email_domains").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      if (!target) return json({ error: "not_found" }, 404);
      await admin.from("tenant_email_domains").update({ is_default: false }).eq("tenant_id", tenantId);
      await admin.from("tenant_email_domains").update({ is_default: true }).eq("id", id).eq("tenant_id", tenantId);
      return json({ ok: true });
    }

    if (verb === "remove") {
      const id = String(body.id);
      // §9: scope the lookup + delete to the caller's tenant — closes the cross-tenant destructive IDOR.
      const { data: row } = await admin.from("tenant_email_domains").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      if (!row) return json({ error: "not_found" }, 404);
      if (row.resend_domain_id) {
        try { await resend(`/domains/${row.resend_domain_id}`, { method: "DELETE" }); } catch (_) { /* ignore */ }
      }
      await admin.from("tenant_email_domains").delete().eq("id", id).eq("tenant_id", tenantId);
      return json({ ok: true });
    }

    // ───────────────────────────── WEBSITE custom domains (#178) ─────────────────────────────
    if (verb === "web_list") {
      const { data } = await admin.from("tenant_web_domains").select("*").eq("tenant_id", tenantId).order("created_at");
      return json({ domains: data ?? [] });
    }

    if (verb === "web_add") {
      // web_domain_claim is SECURITY DEFINER + JWT-derived tenant → call with the USER's client so
      // it derives the tenant itself (owner fleet-targeting isn't supported for web claims by design).
      const host = String(body.host || "").trim().toLowerCase();
      if (!host) return json({ error: "host_required" }, 400);
      const { data, error } = await userClient.rpc("web_domain_claim", { p_host: host });
      if (error) return json({ error: error.message }, 400);
      const token = data?.verification_token as string | undefined;
      return json({
        domain: data,
        challenge: token
          ? { type: "dns_txt", name: `_paige-verify.${data.host}`, value: `paige-verify=${token}` }
          : null,
      });
    }

    if (verb === "web_verify") {
      const host = String(body.host || "").trim().toLowerCase();
      if (!host) return json({ error: "host_required" }, 400);
      // Read the tenant's DNS TXT challenge. Loud-log + fail closed on any lookup error (§32) —
      // a resolver failure marks the row failed, never a false "verified".
      let observed: string[] = [];
      try {
        const records = await Deno.resolveDns(`_paige-verify.${host}`, "TXT");
        observed = records.flat().map((r) => r.trim())
          .filter((r) => r.startsWith("paige-verify="))
          .map((r) => r.slice("paige-verify=".length));
      } catch (e) {
        console.error(`[manage-tenant-domain] DNS TXT lookup failed for _paige-verify.${host}: ${(e as Error).message}`);
      }
      // Pass each OBSERVED token to the SECURITY DEFINER RPC (it compares to the stored token +
      // re-derives the tenant from the JWT). First match → verified; none → the RPC marks failed.
      let row: any = null;
      const candidates = observed.length ? observed : [null];
      for (const tok of candidates) {
        const { data, error } = await userClient.rpc("web_domain_mark_verified", { p_host: host, p_observed_token: tok });
        if (error) {
          // 23505 = another tenant already verified this exact host (globally-unique verified host).
          if ((error as any).code === "23505" || /uq_tenant_web_domains_verified_host/.test(error.message)) {
            return json({ error: "host_claimed_by_other_workspace" }, 409);
          }
          return json({ error: error.message }, 400);
        }
        row = data;
        if (row?.status === "verified") break;
      }
      // On genuine verification, attach to Vercel so the host resolves. Honest degrade if unconfigured.
      let attach: Awaited<ReturnType<typeof vercelAttach>> | null = null;
      if (row?.status === "verified") {
        attach = await vercelAttach(host);
        if (attach.attached && attach.vercel_domain_id) {
          const { data: updated } = await userClient.from("tenant_web_domains")
            .update({ vercel_domain_id: attach.vercel_domain_id }).eq("id", row.id).select().maybeSingle();
          if (updated) row = updated;
        }
      }
      return json({ domain: row, attach });
    }

    if (verb === "web_set_default") {
      const id = String(body.id);
      // RLS ("Tenant admins manage own web domains") scopes these writes to the caller's tenant.
      const { data: target } = await userClient.from("tenant_web_domains")
        .select("id,status").eq("id", id).maybeSingle();
      if (!target) return json({ error: "not_found" }, 404);
      if (target.status !== "verified") return json({ error: "not_verified" }, 400);
      await userClient.from("tenant_web_domains").update({ is_default: false }).eq("tenant_id", tenantId);
      await userClient.from("tenant_web_domains").update({ is_default: true }).eq("id", id);
      return json({ ok: true });
    }

    if (verb === "web_remove") {
      const id = String(body.id);
      const { error } = await userClient.from("tenant_web_domains").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "unknown_verb" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
