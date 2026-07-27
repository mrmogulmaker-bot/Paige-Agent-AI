// Comms C-2a — tenant Twilio subaccount PROVISIONING / backfill (SUPER-ADMIN ONLY).
//
// One-shot, idempotent backfill: for every live tenant that has NO
// tenant_twilio_subaccounts row, mint a Twilio SUBaccount under the platform master
// account, VAULT its returned auth token, and INSERT the 1-per-tenant account row.
// This is the manual super-admin backfill for the live tenants that predate C-2 —
// NOT auto-provision-on-login (that would put subaccount minting on a user code path).
//
// DOCTRINE
//  §9  tenant_id is server-derived. The INSERT goes through the SERVICE-ROLE client so
//      set_tenant_twilio_subaccount_tenant() sees current_user_tenant_id()=null and honors
//      the EXPLICIT tenant_id we pass. (Inserting through the owner JWT would derive the
//      OWNER's tenant and mis-assign every row.) tenant_id is never read from the body.
//  §13 Honest: masterCreds unset => needs_config, provision NOTHING. Report REAL subaccount
//      SIDs only (from Twilio's response). Partial failures are per-tenant in the report;
//      the loop continues. No fabricated SIDs, ever.
//  §18 Reuses the ONE Twilio seam (_shared/twilio.ts) and the Vault bridge — no second
//      Twilio client, no inline REST. Vault write via write_channel_secret (mirrors the
//      read_channel_secret bridge).
//  §Reserved-number  This fn NEVER touches platform_phone_numbers or +1 470 200 3444.
//      It provisions tenant subaccounts only; the reserved master number is out of scope.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSubaccount, masterCreds } from "../_shared/twilio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Optional request body — a backfill with no body provisions ALL unprovisioned tenants. */
interface ProvisionBody {
  /** Optional allowlist: provision ONLY these tenant ids (still super-admin, still idempotent). */
  tenant_ids?: string[];
  /** When true, report who WOULD be provisioned without calling Twilio or writing anything. */
  dry_run?: boolean;
}

/** Per-tenant outcome in the report (§13 — real SIDs or a real error, never a fake). */
interface TenantResult {
  tenant_id: string;
  name: string | null;
  status: "provisioned" | "skipped_existing" | "failed" | "would_provision";
  subaccount_sid?: string | null; // REAL Twilio ACxx… on success, else omitted
  error?: string | null;
}

/** Map Twilio's subaccount status onto our CHECK enum (pending|active|suspended|closed). */
function mapSubaccountStatus(twilioStatus: unknown): "pending" | "active" | "suspended" | "closed" {
  const s = String(twilioStatus ?? "").toLowerCase();
  if (s === "active" || s === "suspended" || s === "closed") return s;
  // A freshly created subaccount is active; default there rather than to 'pending'.
  return "active";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Super-admin gate (§9): is_platform_owner() on the caller JWT. Reject everyone else. ──
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: isOwner } = await userClient.rpc("is_platform_owner");
  if (isOwner !== true) return json({ error: "forbidden" }, 403);

  // ── §13: master creds must exist BEFORE we touch anything. Absent => needs_config, provision NOTHING. ──
  const master = masterCreds();
  if (!master) {
    return json({
      needs_config: true,
      error: "twilio_master_not_configured",
      message: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set as edge secrets. No tenant was provisioned.",
      provisioned: 0,
      results: [],
    });
  }

  let body: ProvisionBody = {};
  try { body = (await req.json()) as ProvisionBody; } catch { body = {}; }
  const filterIds = Array.isArray(body.tenant_ids) ? body.tenant_ids.filter((x) => typeof x === "string") : null;
  const dryRun = body.dry_run === true;

  // Service-role client for ALL data reads/writes (§9: the INSERT trigger must see
  // current_user_tenant_id()=null so the EXPLICIT tenant_id is honored).
  const admin = createClient(supabaseUrl, serviceKey);

  // ── Compute the unprovisioned set: all tenants MINUS those that already have a subaccount row. ──
  // (supabase-js has no LEFT JOIN; two selects + a JS set-difference is exact for this scope
  //  and avoids adding an RPC just for this.)
  const { data: tenants, error: tErr } = await admin
    .from("tenants")
    .select("id, name");
  if (tErr) return json({ error: `tenants_read_failed: ${tErr.message}` }, 500);

  const { data: existing, error: eErr } = await admin
    .from("tenant_twilio_subaccounts")
    .select("tenant_id");
  if (eErr) return json({ error: `subaccounts_read_failed: ${eErr.message}` }, 500);

  const provisionedSet = new Set<string>((existing ?? []).map((r: { tenant_id: string }) => r.tenant_id));

  let targets = (tenants ?? []).filter((t: { id: string }) => !provisionedSet.has(t.id));
  if (filterIds) targets = targets.filter((t: { id: string }) => filterIds.includes(t.id));

  const results: TenantResult[] = [];

  if (dryRun) {
    for (const t of targets) {
      results.push({ tenant_id: t.id, name: t.name ?? null, status: "would_provision" });
    }
    return json({
      dry_run: true,
      unprovisioned_count: targets.length,
      results,
    });
  }

  // ── Provision loop. Continue on per-tenant failure; report each honestly (§13). ──
  let provisioned = 0;
  for (const t of targets) {
    const tenantId: string = t.id;
    const name: string | null = t.name ?? null;
    const friendlyName = (name && name.trim()) ? `Paige — ${name.trim()}` : `Paige tenant ${tenantId}`;

    // 1) Mint the Twilio subaccount through the ONE seam (uses masterCreds internally).
    const sub = await createSubaccount(friendlyName);
    if (!sub.ok || !sub.data) {
      results.push({ tenant_id: tenantId, name, status: "failed", error: sub.error ?? "twilio_create_subaccount_failed" });
      continue;
    }
    const subSid = (sub.data as Record<string, unknown>).sid as string | undefined;
    const authToken = (sub.data as Record<string, unknown>).auth_token as string | undefined;
    if (!subSid || !authToken) {
      results.push({ tenant_id: tenantId, name, status: "failed", error: "twilio_subaccount_missing_sid_or_token" });
      continue;
    }

    // 2) VAULT the auth token (never the raw token into the table). Upsert-by-name so a
    //    re-run after a failed insert overwrites rather than duplicates.
    const vaultRef = `twilio_subaccount_token:${tenantId}`;
    const { data: writtenRef, error: vErr } = await admin.rpc("write_channel_secret", {
      _ref: vaultRef,
      _secret: authToken,
      _description: `Twilio subaccount auth token for tenant ${tenantId} (Comms C-2a).`,
    });
    if (vErr || writtenRef !== vaultRef) {
      results.push({
        tenant_id: tenantId,
        name,
        status: "failed",
        // Subaccount SID is real; report it so an operator can reconcile the orphaned subaccount.
        subaccount_sid: subSid,
        error: `vault_write_failed: ${vErr?.message ?? "unexpected_ref"}`,
      });
      continue;
    }

    // 3) INSERT the 1-per-tenant row via SERVICE ROLE with EXPLICIT tenant_id (§9). The unique
    //    constraint uq_tenant_twilio_subaccounts_tenant makes a concurrent double-provision a
    //    conflict, which we treat as already-provisioned (idempotent).
    const { error: iErr } = await admin
      .from("tenant_twilio_subaccounts")
      .insert({
        tenant_id: tenantId,                       // honored because service-role => current_user_tenant_id()=null
        twilio_subaccount_sid: subSid,             // REAL ACxx…
        auth_token_vault_ref: vaultRef,            // the Vault NAME, never the token
        friendly_name: friendlyName,
        status: mapSubaccountStatus((sub.data as Record<string, unknown>).status),
      });
    if (iErr) {
      // 23505 = unique_violation => a row already exists (race / prior partial run). Idempotent skip.
      const code = (iErr as { code?: string }).code;
      if (code === "23505") {
        results.push({ tenant_id: tenantId, name, status: "skipped_existing", subaccount_sid: subSid });
        continue;
      }
      results.push({ tenant_id: tenantId, name, status: "failed", subaccount_sid: subSid, error: `insert_failed: ${iErr.message}` });
      continue;
    }

    provisioned++;
    results.push({ tenant_id: tenantId, name, status: "provisioned", subaccount_sid: subSid });
  }

  return json({
    provisioned,
    unprovisioned_count: targets.length,
    failed: results.filter((r) => r.status === "failed").length,
    results, // REAL SIDs per tenant — no fabricated identifiers (§13)
  });
});
