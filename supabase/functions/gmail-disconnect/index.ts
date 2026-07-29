// Disconnects the caller's tenant Gmail connector (#141b). Idempotent.
//
// §18 clone of google-calendar-disconnect, adapted to the comms rail:
//   • §9: scoped to the caller's OWN tenant (current_user_tenant_id from the JWT), and
//     gated to an admin/coach — never a cross-tenant teardown.
//   • Deactivates the tenant's provider='gmail' channel_connectors row (active=false,
//     status='disabled') and clears credentials_vault_ref so the row no longer references
//     the secret.
//   • Best-effort REVOKE of the Google token (POST https://oauth2.googleapis.com/revoke)
//     using the refresh token read back from Vault — this invalidates the token at Google,
//     making any orphaned Vault secret inert.
//   • Best-effort delete of the Vault secret: there is no delete half of the Vault bridge
//     yet (only write_channel_secret/read_channel_secret), so we OVERWRITE it with a
//     tombstone value and unlink the ref from the row. §13 HONEST: the secret row itself
//     remains in vault.secrets (revoked at Google, so inert); a true delete bridge is a
//     follow-up, not silently claimed here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userSupa = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userSupa.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // §9: role + tenant gate. has_role is global, so bind the teardown to the caller's own
  // tenant (JWT-scoped) — never a cross-tenant disconnect.
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isCoach } = await admin.rpc("has_role", { _user_id: user.id, _role: "coach" });
  if (!isAdmin && !isCoach) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: callerTenant } = await userSupa.rpc("current_user_tenant_id");
  if (!callerTenant) {
    // No tenant context → nothing to disconnect. Idempotent success.
    return new Response(JSON.stringify({ ok: true, disconnected: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Locate the tenant's Gmail connector (service role, explicitly tenant-scoped §9).
  const { data: row } = await admin
    .from("channel_connectors")
    .select("id, credentials_vault_ref")
    .eq("tenant_id", callerTenant)
    .eq("channel_type", "email")
    .eq("provider", "gmail")
    .maybeSingle();

  if (!row?.id) {
    // Already gone / never connected — idempotent success (§31 no dead-end).
    return new Response(JSON.stringify({ ok: true, disconnected: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Best-effort revoke at Google using the refresh token from Vault (never logged).
  if (row.credentials_vault_ref) {
    try {
      const { data: secret } = await admin.rpc("read_channel_secret", { _ref: row.credentials_vault_ref });
      const refreshToken = typeof secret === "string" ? secret : "";
      if (refreshToken) {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: refreshToken }),
        }).catch(() => { /* best-effort */ });
      }
      // Best-effort tombstone of the Vault value (no delete bridge yet, §13). A failure here
      // never blocks the disconnect — the row is unlinked + Google-revoked regardless.
      // supabase-js returns { data, error } (it does not throw), so awaiting + ignoring the
      // result is the safe best-effort form (no .catch on the builder).
      await admin.rpc("write_channel_secret", {
        _ref: row.credentials_vault_ref,
        _secret: "revoked",
        _description: `Gmail refresh token revoked/disconnected for tenant ${callerTenant}`,
      });
    } catch { /* best-effort — teardown proceeds */ }
  }

  // Deactivate + unlink the secret ref (§9 tenant-scoped). Idempotent.
  const { error } = await admin
    .from("channel_connectors")
    .update({
      active: false,
      status: "disabled",
      credentials_vault_ref: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("tenant_id", callerTenant);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, disconnected: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
