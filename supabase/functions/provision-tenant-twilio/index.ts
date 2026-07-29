// Comms C-2a — tenant Twilio subaccount PROVISIONING / backfill (SUPER-ADMIN ONLY).
//
// One-shot, idempotent backfill: for every live tenant that has NO
// tenant_twilio_subaccounts row, mint a Twilio SUBaccount under the platform master
// account, mint a SUBACCOUNT-scoped API Key on it, VAULT the API-Key SECRET, and
// INSERT the 1-per-tenant account row (twilio_subaccount_sid + api_key_sid +
// auth_token_vault_ref). This is the manual super-admin backfill for the live tenants
// that predate C-2 — NOT auto-provision-on-login (that would put subaccount minting on
// a user code path).
//
// C-2a API-KEY AUTH (owner-confirmed 2026-07-28, Path A): under MASTER API-Key auth
// Twilio's POST /Accounts.json returns the subaccount `sid` but OMITS `auth_token`, so
// we no longer depend on it. Every provisioned/adopted subaccount instead gets its OWN
// API Key (SK… + secret) via createSubaccountApiKey; the secret is Vault-only (§34).
//
// ORPHAN ADOPTION: the `adopt` body map ({tenant_id: existing_subaccount_sid}) lets the
// operator reconcile subaccounts that already exist at Twilio but never got a DB row (a
// failed prior run) — it SKIPS createSubaccount, mints an API Key on the existing SID, and
// writes the row. Idempotent: a tenant that already HAS a row is excluded from targets.
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
//  §Scope  This fn provisions tenant subaccounts ONLY. The Super Admin's imported
//      +1 470 200 3444 is a tenant_phone_numbers row (source='imported') on the master
//      account, managed by the dedicated import seam (C-2s-A / D2) — out of scope here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSubaccount, createSubaccountApiKey, ensureTwimlApp, masterCreds, type SupabaseAdminLike } from "../_shared/twilio.ts";

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
  /**
   * ORPHAN ADOPTION (C-2a): map of tenant_id → an EXISTING Twilio subaccount SID that was
   * already created at Twilio (under the master account) but never got a DB row (a failed
   * prior run). For a tenant present here we SKIP createSubaccount and instead ADOPT the
   * given SID — mint a subaccount API Key on it + write the row. When `adopt` is present it
   * also acts as an implicit allowlist (unioned with tenant_ids) so `{adopt:{…}}` alone
   * targets exactly those tenants. Idempotent: a tenant that already HAS a row is excluded.
   */
  adopt?: Record<string, string>;
}

/** Per-tenant outcome in the report (§13 — real SIDs or a real error, never a fake). */
interface TenantResult {
  tenant_id: string;
  name: string | null;
  status: "provisioned" | "adopted" | "skipped_existing" | "failed" | "would_provision" | "would_adopt";
  subaccount_sid?: string | null; // REAL Twilio ACxx… on success, else omitted
  api_key_sid?: string | null;     // REAL Twilio SK… on success, else omitted (NEVER the secret, §34)
  twiml_app_sid?: string | null;   // C-2v (#140 A1): REAL Twilio AP… voice app SID, or null if minting failed
  twiml_app_error?: string | null; // C-2v: non-fatal — the subaccount row is written; app can be re-minted (idempotent)
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
      message: "The master Twilio credentials (TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET) are not set as edge secrets. No tenant was provisioned.",
      provisioned: 0,
      results: [],
    });
  }

  let body: ProvisionBody = {};
  try { body = (await req.json()) as ProvisionBody; } catch { body = {}; }
  const filterIds = Array.isArray(body.tenant_ids) ? body.tenant_ids.filter((x) => typeof x === "string") : null;
  const dryRun = body.dry_run === true;

  // ── Orphan-adoption map (C-2a): tenant_id → EXISTING subaccount SID. Keep only well-formed
  //    string→string entries; the keys also act as an implicit allowlist (unioned below). ──
  const adoptMap: Record<string, string> = {};
  if (body.adopt && typeof body.adopt === "object" && !Array.isArray(body.adopt)) {
    for (const [k, v] of Object.entries(body.adopt)) {
      if (typeof k === "string" && typeof v === "string" && v.length > 0) adoptMap[k] = v;
    }
  }
  const adoptKeys = Object.keys(adoptMap);

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
  // Allowlist = explicit tenant_ids ∪ adopt keys. When either is present, restrict to it so
  // `{adopt:{…}}` alone targets exactly the orphans (and never mass-provisions everyone else).
  if (filterIds || adoptKeys.length > 0) {
    const allow = new Set<string>([...(filterIds ?? []), ...adoptKeys]);
    targets = targets.filter((t: { id: string }) => allow.has(t.id));
  }

  const results: TenantResult[] = [];

  if (dryRun) {
    for (const t of targets) {
      const adoptSid = adoptMap[t.id];
      results.push(
        adoptSid
          ? { tenant_id: t.id, name: t.name ?? null, status: "would_adopt", subaccount_sid: adoptSid }
          : { tenant_id: t.id, name: t.name ?? null, status: "would_provision" },
      );
    }
    return json({
      dry_run: true,
      unprovisioned_count: targets.length,
      adopt_count: results.filter((r) => r.status === "would_adopt").length,
      results,
    });
  }

  // ── Provision/adopt loop. Continue on per-tenant failure; report each honestly (§13). ──
  //    C-2a: under MASTER API-Key auth the subaccount-create response OMITS auth_token, so we
  //    never depend on it. Every tenant (new OR adopted) gets a SUBACCOUNT-scoped API Key
  //    (SK… + secret); the SECRET is vaulted and the SK stored on the row.
  let provisioned = 0;
  let adopted = 0;
  for (const t of targets) {
    const tenantId: string = t.id;
    const name: string | null = t.name ?? null;
    const friendlyName = (name && name.trim()) ? `Paige — ${name.trim()}` : `Paige tenant ${tenantId}`;
    const adoptSid = adoptMap[tenantId]; // present => adopt an EXISTING subaccount, don't create
    const isAdopt = typeof adoptSid === "string" && adoptSid.length > 0;

    // 1) Resolve the subaccount SID: ADOPT the existing one, or MINT a new subaccount.
    let subSid: string | undefined;
    let twilioStatus: unknown = undefined;
    if (isAdopt) {
      subSid = adoptSid;
    } else {
      const sub = await createSubaccount(friendlyName);
      if (!sub.ok || !sub.data) {
        results.push({ tenant_id: tenantId, name, status: "failed", error: sub.error ?? "twilio_create_subaccount_failed" });
        continue;
      }
      subSid = (sub.data as Record<string, unknown>).sid as string | undefined;
      twilioStatus = (sub.data as Record<string, unknown>).status;
      if (!subSid) {
        // Under API-Key auth auth_token is legitimately absent — a missing SID is the only fatal case.
        results.push({ tenant_id: tenantId, name, status: "failed", error: "twilio_subaccount_missing_sid" });
        continue;
      }
    }

    // 2) Mint a SUBACCOUNT-scoped API Key on subSid (master-authed). The SECRET is shown ONCE.
    const key = await createSubaccountApiKey(subSid);
    if (!key.ok || !key.data) {
      results.push({
        tenant_id: tenantId, name, status: "failed",
        subaccount_sid: subSid, // real SID — report so an operator can reconcile / re-run
        error: key.error ?? "twilio_api_key_create_failed",
      });
      continue;
    }
    const apiKeySid = key.data.sid;       // SK…
    const apiKeySecret = key.data.secret; // vault this immediately, NEVER log/return (§34)

    // 3) VAULT the API-Key SECRET (never the raw secret into the table). Upsert-by-name so a
    //    re-run after a failed insert overwrites rather than duplicates.
    const vaultRef = `twilio_subaccount_api_key_secret:${tenantId}`;
    const { data: writtenRef, error: vErr } = await admin.rpc("write_channel_secret", {
      _ref: vaultRef,
      _secret: apiKeySecret,
      _description: `Twilio subaccount API-Key secret for tenant ${tenantId} (Comms C-2a).`,
    });
    if (vErr || writtenRef !== vaultRef) {
      results.push({
        tenant_id: tenantId, name, status: "failed",
        subaccount_sid: subSid, api_key_sid: apiKeySid,
        error: `vault_write_failed: ${vErr?.message ?? "unexpected_ref"}`,
      });
      continue;
    }

    // 4) INSERT the 1-per-tenant row via SERVICE ROLE with EXPLICIT tenant_id (§9). The unique
    //    constraint uq_tenant_twilio_subaccounts_tenant makes a concurrent double-provision a
    //    conflict, which we treat as already-provisioned (idempotent).
    const { error: iErr } = await admin
      .from("tenant_twilio_subaccounts")
      .insert({
        tenant_id: tenantId,                       // honored because service-role => current_user_tenant_id()=null
        twilio_subaccount_sid: subSid,             // REAL ACxx…
        api_key_sid: apiKeySid,                     // REAL SK… (Basic-auth username, non-secret)
        auth_token_vault_ref: vaultRef,            // the Vault NAME of the API-Key secret, never the secret
        friendly_name: friendlyName,
        // Adopted subaccounts were created earlier; default them 'active' (mapSubaccountStatus
        // with undefined → 'active'), same as a fresh mint.
        status: mapSubaccountStatus(twilioStatus),
      });
    if (iErr) {
      // 23505 = unique_violation => a row already exists (race / prior partial run). Idempotent skip.
      const code = (iErr as { code?: string }).code;
      if (code === "23505") {
        results.push({ tenant_id: tenantId, name, status: "skipped_existing", subaccount_sid: subSid, api_key_sid: apiKeySid });
        continue;
      }
      results.push({ tenant_id: tenantId, name, status: "failed", subaccount_sid: subSid, api_key_sid: apiKeySid, error: `insert_failed: ${iErr.message}` });
      continue;
    }

    // 5) Mint + persist the TwiML Application on the subaccount (Voice foundation,
    //    #140 A1). Reuse the just-minted creds (no extra Vault round-trip). A TwiML-app
    //    failure is NON-FATAL: the subaccount row is already written, and ensureTwimlApp
    //    is idempotent on twiml_app_sid, so a re-run backfills the app. Report it (§13)
    //    so an operator sees which tenants still owe a Voice app.
    let twimlAppSid: string | null = null;
    let twimlAppError: string | null = null;
    const appRes = await ensureTwimlApp(admin as unknown as SupabaseAdminLike, tenantId, {
      creds: { accountSid: subSid, authToken: apiKeySecret, apiKeySid },
    });
    if (appRes.ok && appRes.data) twimlAppSid = appRes.data.applicationSid;
    else twimlAppError = appRes.error ?? "twiml_app_unavailable";

    if (isAdopt) {
      adopted++;
      results.push({ tenant_id: tenantId, name, status: "adopted", subaccount_sid: subSid, api_key_sid: apiKeySid, twiml_app_sid: twimlAppSid, twiml_app_error: twimlAppError });
    } else {
      provisioned++;
      results.push({ tenant_id: tenantId, name, status: "provisioned", subaccount_sid: subSid, api_key_sid: apiKeySid, twiml_app_sid: twimlAppSid, twiml_app_error: twimlAppError });
    }
  }

  return json({
    provisioned,
    adopted,
    unprovisioned_count: targets.length,
    failed: results.filter((r) => r.status === "failed").length,
    results, // REAL SIDs / SK ids per tenant — no fabricated identifiers, no secrets (§13/§34)
  });
});
