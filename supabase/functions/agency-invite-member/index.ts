// agency-invite-member — add / invite a teammate to the AGENCY team (Task #213)
//
// Owner directive: an agency is a team; the operator needs to invite people to
// help run the book, with agency-distinct roles. This is a STAFF-style invite to
// the AGENCY operator side (§9) — NOT a client-portal invite and NOT a
// sub-account staff invite.
//
// Authorization (§13): the caller must MANAGE this agency's team
// (agency_team_can_manage → owner/admin), proven from THEIR JWT via
// agency_my_membership(); the agency id comes from the server, never the body,
// so a caller can't target an agency they don't run. New emails get an auth user
// + a set-password link; existing users are added active and told where to sign in.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_BASE = "https://paigeagent.ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

const ASSIGNABLE = new Set([
  "agency_admin", "agency_manager", "agency_biller", "agency_specialist", "agency_viewer",
]);
const ROLE_LABEL: Record<string, string> = {
  agency_owner: "Agency Owner",
  agency_admin: "Agency Admin",
  agency_manager: "Agency Manager",
  agency_biller: "Agency Billing",
  agency_specialist: "Agency Specialist",
  agency_viewer: "Agency Viewer",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    // User-scoped client so agency_my_membership() sees auth.uid() = the caller.
    const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userErr } = await asUser.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: membership, error: memErr } = await asUser.rpc("agency_my_membership");
    if (memErr) return json({ error: "Could not verify agency access" }, 500);
    const m = (membership ?? {}) as { agency_id?: string; can_manage_team?: boolean };
    if (!m.agency_id) return json({ error: "You don't run an agency." }, 403);
    if (m.can_manage_team !== true) {
      return json({ error: "Only an agency owner or admin can invite teammates." }, 403);
    }
    const agencyId = m.agency_id;

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const role = String(body?.role ?? "");
    const scoped: string[] = Array.isArray(body?.scoped_subaccounts) ? body.scoped_subaccounts : [];
    if (!email || !/.+@.+\..+/.test(email)) return json({ error: "A valid email is required." }, 400);
    if (!ASSIGNABLE.has(role)) return json({ error: `Invalid or non-assignable role: ${role}` }, 400);

    // Agency brand (for the email + the branded /join card) — service client,
    // read-only. Resolve UP the parent chain so the teammate sees the agency's logo
    // + color; the resolver floors unset colors to the platform tokens (§6/§9),
    // never the operator master brand. Falls back to the raw tenant name.
    const { data: brandRows } = await admin.rpc("resolve_tenant_brand", { _tenant_id: agencyId });
    const rb = (Array.isArray(brandRows) ? brandRows[0] : brandRows) as
      | { tenant_name?: string; primary_color?: string; logo_url?: string | null }
      | null;
    const agencyName = rb?.tenant_name ?? "your agency";
    const brandLogoUrl = rb?.logo_url ?? null;
    const brandColor = rb?.primary_color ?? null;

    // Resolve existing user by email via a service-role-only lookup RPC — NOT
    // listUsers(), which returns only the first page and would silently miss (then
    // try to re-create, and collide on) anyone past ~50 users.
    const { data: existingUserId, error: lookupErr } = await admin.rpc("agency_lookup_user_id", { _email: email });
    if (lookupErr) return json({ error: "Could not look up that email." }, 500);

    // Guard: the agency's TENANT OWNER is the immutable agency_owner — you don't
    // "invite" them onto their own team through this staff path.
    if (existingUserId) {
      const { data: ownerRow } = await admin
        .from("tenant_members")
        .select("user_id")
        .eq("tenant_id", agencyId)
        .eq("user_id", existingUserId)
        .eq("status", "active")
        .eq("role", "owner")
        .maybeSingle();
      if (ownerRow) return json({ error: "That person already owns this agency." }, 400);
    }

    let target: { id: string } | null = existingUserId ? { id: existingUserId as string } : null;
    let createdUser = false;
    let actionLink: string | null = null;

    if (!target) {
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { invited_by: user.id, agency_invite: agencyId, agency_role: role },
      });
      if (createErr || !created?.user) return json({ error: `Could not create the account: ${createErr?.message ?? "unknown"}` }, 500);
      target = created.user;
      createdUser = true;
      // A set-password link so the new teammate can get in.
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${APP_BASE}/reset-password` },
      });
      actionLink = linkData?.properties?.action_link ?? null;
    }

    // Specialist scope is only meaningful for agency_specialist, and only for REAL
    // children of THIS agency — filter out junk/foreign ids server-side (mirrors
    // agency_set_member_role, so the invite path can't seed a wider scope than an
    // edit could set).
    let scopedClean: string[] = [];
    if (role === "agency_specialist" && scoped.length > 0) {
      const { data: children } = await admin
        .from("tenants")
        .select("id")
        .eq("parent_tenant_id", agencyId)
        .in("id", scoped);
      scopedClean = (children ?? []).map((c) => c.id as string);
    }

    // Upsert the agency team membership (service role bypasses RLS; the table's
    // unique index keys on (agency, user_id)).
    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await admin
      .from("agency_team_members")
      .upsert({
        agency_tenant_id: agencyId,
        user_id: target.id,
        email,
        agency_role: role,
        status: "active",
        scoped_subaccounts: scopedClean,
        invited_by: user.id,
        invited_at: nowIso,
        joined_at: nowIso,
      }, { onConflict: "agency_tenant_id,user_id" });
    if (upsertErr) return json({ error: `Could not add the teammate: ${upsertErr.message}` }, 500);

    // Mint a BRANDED, single-use agency-team invite token so the teammate lands on
    // the agency-branded /join card with inline account creation — never the
    // unbranded /reset-password or /auth page (§6/§9). Authorization already
    // happened above (agency_team_can_manage, agency id from the server), so this
    // direct service-role INSERT is safe; it deliberately bypasses
    // create_tenant_invite_token's auth gate, which keys off auth.uid() (null here).
    // TTL + max_uses=1 keep it single-use and expiring like every other invite kind.
    let inviteUrl: string | null = null;
    try {
      const rawBytes = crypto.getRandomValues(new Uint8Array(24));
      const mintToken = btoa(String.fromCharCode(...rawBytes))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      const { data: tokRow, error: tokErr } = await admin
        .from("tenant_invite_tokens")
        .insert({
          tenant_id: agencyId,
          token: mintToken,
          kind: "agency_team",
          default_role: "member",        // placeholder; agency authority lives in agency_role
          agency_role: role,
          created_by: user.id,
          email,                          // bound recipient — anti-relay + single-redeemer
          max_uses: 1,
          expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
        })
        .select("token")
        .maybeSingle();
      if (tokErr) throw tokErr;
      if (tokRow?.token) inviteUrl = `${APP_BASE}/join/${tokRow.token}`;
    } catch (e) {
      // PRESERVE the prior working behavior as a fallback: a new teammate still gets
      // their set-password recovery link, an existing one is pointed at sign-in.
      console.error("agency-invite-member: branded token mint failed, falling back to prior link:", e);
    }
    if (!inviteUrl) inviteUrl = actionLink ?? `${APP_BASE}/auth`;

    // Branded email — reuse the transactional role-invitation template, now wearing
    // the AGENCY's brand (name/logo/color) so the email and the /join card it opens
    // read as one continuous system (§6).
    const inviterName = user.user_metadata?.full_name || user.email || "Your agency";
    try {
      await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "role-invitation",
          recipientEmail: email,
          idempotencyKey: `agency-invite-${agencyId}-${target.id}-${role}`,
          tenantId: agencyId,
          templateData: {
            role: ROLE_LABEL[role] ?? role,   // matches the agency-role copy keys
            inviteUrl,
            invitedBy: inviterName,
            brandName: agencyName,
            brandLogoUrl,
            brandColor,
            message: createdUser
              ? `You've been added to ${agencyName}'s team. Set up your account to get in.`
              : `You've been added to ${agencyName}'s team. Sign in to get started.`,
          },
        },
      });
    } catch (e) {
      console.error("agency-invite-member: email send failed (membership still created):", e);
    }

    // Audit
    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        entity: "agency_team_member",
        action: "agency_member_invited",
        entity_id: agencyId,
        data: { invited_email: email, agency_role: role, target_user_id: target.id, created_user: createdUser },
      });
    } catch (_e) { /* best-effort */ }

    return json({ success: true, created_user: createdUser, emailed: true });
  } catch (error) {
    console.error("Error in agency-invite-member:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
