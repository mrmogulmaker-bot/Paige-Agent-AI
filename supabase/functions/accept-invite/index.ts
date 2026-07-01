// supabase/functions/accept-invite/index.ts
//
// Unified accept-invite endpoint. Detects token type and routes:
//   - BTF client token  (btf_workspace_invites)  → activates white-label workspace
//   - Internal team token (invitations)          → activates Paige team member
//
// Public endpoint (no JWT). Token is single-use, 7-day TTL.
//
// Request modes:
//   { action: "lookup", token }
//     → { ok, type, email, displayName, role|tier, expiresAt, alreadyUsed }
//   { action: "consume", token, password, fullName? }
//     → { ok, type, email, redirectTo }   (client signs in with email+password after)
//
// White-label: BTF responses NEVER mention "Paige". Team responses use Paige branding.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const ROLE_DASHBOARD: Record<string, string> = {
  admin: "/admin",
  owner: "/admin",
  moderator: "/admin",
  coach: "/admin/clients",
  sales_rep: "/admin/pipeline",
  cs_rep: "/admin/clients",
  finance: "/admin",
  broker: "/broker/app",
  affiliate: "/app/affiliate",
  viewer: "/app",
  user: "/app",
  client: "/app",
};

function dashboardFor(role: string): string {
  return ROLE_DASHBOARD[role] ?? "/app";
}

async function findBtfInvite(tokenHash: string) {
  const { data } = await admin
    .from("btf_workspace_invites")
    .select("id,client_id,email,expires_at,used_at,metadata")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  return data;
}

async function findTeamInvite(tokenHash: string) {
  const { data } = await admin
    .from("invitations")
    .select("id,email,role,expires_at,accepted_at,metadata,template_name,tenant_id,created_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  return data;
}

async function findAuthUserByEmail(email: string) {
  // listUsers is paginated; for our scale this is acceptable.
  const lc = email.toLowerCase();
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === lc);
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST required" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const action: string = body?.action ?? "lookup";
  const token: string = (body?.token ?? "").trim();
  if (!token || token.length < 16) {
    return json(400, { ok: false, error: "Missing or malformed token" });
  }

  const tokenHash = await sha256Hex(token);

  // ---- Try BTF first (white-label client) ----
  const btf = await findBtfInvite(tokenHash);
  if (btf) {
    const expired = new Date(btf.expires_at).getTime() < Date.now();
    const alreadyUsed = !!btf.used_at;
    const meta = (btf.metadata ?? {}) as Record<string, any>;
    const displayName = meta.preferred_name || meta.full_name || btf.email.split("@")[0];

    if (action === "lookup") {
      return json(200, {
        ok: true,
        type: "btf_client",
        email: btf.email,
        displayName,
        tier: "btf_dfy",
        expiresAt: btf.expires_at,
        expired,
        alreadyUsed,
        // White-label: never expose "Paige" branding to BTF clients
        brand: { name: "Mogul Maker Academy", program: "Build to Fund" },
        redirectTo: "/onboard/welcome",
      });
    }

    if (action === "consume") {
      if (expired) return json(410, { ok: false, error: "This invite has expired" });
      if (alreadyUsed) return json(409, { ok: false, error: "This invite has already been used" });

      const password: string = body?.password ?? "";
      if (password.length < 10) {
        return json(400, { ok: false, error: "Password must be at least 10 characters" });
      }

      // Find or create auth user for this email
      let authUser = await findAuthUserByEmail(btf.email);
      if (!authUser) {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: btf.email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: meta.full_name ?? displayName,
            tier: "btf_dfy",
            invited_via: "btf_workspace_invite",
          },
        });
        if (cErr || !created?.user) {
          return json(500, { ok: false, error: `Account create failed: ${cErr?.message}` });
        }
        authUser = created.user;
      } else {
        const { error: uErr } = await admin.auth.admin.updateUserById(authUser.id, {
          password,
          email_confirm: true,
        });
        if (uErr) return json(500, { ok: false, error: `Password set failed: ${uErr.message}` });
      }

      // Grant the 'client' role so RoleGate(['client']) admits them to /workspace
      // after onboarding completes. Idempotent via (user_id, role) unique constraint.
      await admin
        .from("user_roles")
        .upsert(
          { user_id: authUser.id, role: "client" },
          { onConflict: "user_id,role", ignoreDuplicates: true },
        );

      // Link client row + ensure onboarding_stage so OnboardLayout routes them
      // into Step 1 (Welcome → Agreement → Payment → Intake → Documents → Complete).
      const clientPatch: Record<string, unknown> = { linked_user_id: authUser.id };
      const { data: existingClient } = await admin
        .from("clients")
        .select("onboarding_stage")
        .eq("id", btf.client_id)
        .maybeSingle();
      if (!existingClient?.onboarding_stage) {
        clientPatch.onboarding_stage = "invited";
      }
      await admin.from("clients").update(clientPatch).eq("id", btf.client_id);

      // Mark invite consumed
      await admin
        .from("btf_workspace_invites")
        .update({ used_at: new Date().toISOString() })
        .eq("id", btf.id);

      await admin.from("paige_audit_log").insert({
        actor_user_id: authUser.id,
        action: "btf_invite_consumed",
        target_type: "client",
        target_id: btf.client_id,
        metadata: { email: btf.email },
      }).then(() => {}, () => {});

      return json(200, {
        ok: true,
        type: "btf_client",
        email: btf.email,
        // Route the freshly-activated client into the onboarding sequence
        // (welcome → agreement → payment → intake → documents → complete).
        // OnboardLayout reads clients.onboarding_stage and lands them on the right step.
        redirectTo: "/onboard/welcome",
      });
    }
  }

  // ---- Try internal team invite ----
  const team = await findTeamInvite(tokenHash);
  if (team) {
    const expired = new Date(team.expires_at).getTime() < Date.now();
    const meta = (team.metadata ?? {}) as Record<string, any>;
    const displayName = meta.full_name || meta.preferred_name || team.email.split("@")[0];

    if (action === "lookup") {
      return json(200, {
        ok: true,
        type: "team_member",
        email: team.email,
        displayName,
        role: team.role,
        expiresAt: team.expires_at,
        expired,
        alreadyUsed: !!team.accepted_at && expired === false ? false : false, // team invites are reusable for set-password
        brand: { name: "Paige", program: "Paige Agent AI" },
        redirectTo: dashboardFor(team.role),
      });
    }

    if (action === "consume") {
      if (expired) return json(410, { ok: false, error: "This invite has expired" });

      const password: string = body?.password ?? "";
      const fullName: string | null = body?.fullName ?? null;
      if (password.length < 10) {
        return json(400, { ok: false, error: "Password must be at least 10 characters" });
      }

      const authUser = await findAuthUserByEmail(team.email);
      if (!authUser) {
        return json(404, { ok: false, error: "Account not found. Contact your administrator." });
      }

      const { error: uErr } = await admin.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(authUser.user_metadata ?? {}),
          ...(fullName ? { full_name: fullName } : {}),
        },
      });
      if (uErr) return json(500, { ok: false, error: `Password set failed: ${uErr.message}` });

      if (fullName) {
        await admin
          .from("profiles")
          .update({ full_name: fullName })
          .eq("user_id", authUser.id);
      }

      // Ensure role + tenant membership are assigned. Tenant-scoped RLS uses
      // tenant_members, not user_roles alone, for live CRM/pipeline visibility.
      await admin
        .from("user_roles")
        .upsert({ user_id: authUser.id, role: team.role }, { onConflict: "user_id,role" });

      if (team.tenant_id && team.role !== "super_admin") {
        const tenantRole = team.role === "admin" ? "admin" : team.role === "coach" ? "coach" : "member";
        await admin
          .from("tenant_members")
          .upsert(
            {
              tenant_id: team.tenant_id,
              user_id: authUser.id,
              role: tenantRole,
              status: "active",
              invited_at: team.created_at ?? new Date().toISOString(),
              joined_at: new Date().toISOString(),
            },
            { onConflict: "tenant_id,user_id" },
          );

        await admin
          .from("profiles")
          .update({ active_tenant_id: team.tenant_id })
          .eq("user_id", authUser.id)
          .is("active_tenant_id", null);
      }

      await admin
        .from("invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", team.id);

      await admin.from("audit_logs").insert({
        user_id: authUser.id,
        entity: "invitation",
        action: "invite_consumed",
        entity_id: team.id,
        data: { role: team.role, email: team.email },
      }).then(() => {}, () => {});

      return json(200, {
        ok: true,
        type: "team_member",
        email: team.email,
        redirectTo: dashboardFor(team.role),
      });
    }
  }

  return json(404, { ok: false, error: "Invite not found or no longer valid" });
});
