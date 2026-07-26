// _shared/twilio.ts — the ONE authenticated Twilio client for the whole platform.
//
// Comms C-2 foundation. Every Twilio REST call (subaccount create, number search,
// number purchase, SMS send, A2P registration) goes THROUGH this seam so there is
// exactly one home for Twilio auth + form-encoding + retry + structured errors
// (§12/§18 — one capability, one home). It replaces the ~8 inline-REST duplicates
// scattered across the legacy send-sms* functions as a fast-follow; C-2's
// per-tenant SMS path uses it now.
//
// DESIGN CONTRACT
//   • Pure Deno/esm, no product logic, no table writes. It authenticates and speaks
//     Twilio's HTTP API and hands back a uniform result — callers own the DB/audit.
//   • Structured result, never a throw for an API-level failure: every call resolves
//     to { ok, status, error, data }. A thrown exception is reserved for genuinely
//     exceptional misuse; network faults degrade to { ok:false, status:0, error }.
//   • Secrets NEVER appear in an error string or a log. The auth token travels only
//     in the Basic-auth header; Twilio's own error bodies carry no secret, and we
//     cap the echoed body so a stray payload can't smuggle one out.
//   • HONESTY (§13): the A2P wrappers (createBrand/createCampaign) are NOT wired to
//     TrustHub yet — they return { ok:false, needs_config:true } and NEVER a fake
//     brand/campaign SID. A missing platform master credential likewise returns a
//     needs_config result, never a crash.
//
// PER-TENANT CREDENTIAL MODEL (§9, LOCKED design D1)
//   tenant_twilio_subaccounts is the 1-per-tenant ACCOUNT entity: it holds the
//   Twilio SUBaccount SID + a Vault REF (name) to that subaccount's auth token —
//   never the raw token. resolveTwilioCreds() reads that row and decrypts the token
//   through the proven Vault bridge RPC (read_channel_secret), the only server-side
//   path a Deno edge function can read vault.decrypted_secrets. Master (platform)
//   creds come from env via masterCreds() and are used ONLY to mint subaccounts and
//   for the +1 470 super-admin path (D2/D3).

// -----------------------------------------------------------------------------
// Result + credential shapes
// -----------------------------------------------------------------------------

/** Uniform return of every Twilio call. `data` is the parsed JSON body on success. */
export interface TwilioResult<T = Record<string, unknown>> {
  ok: boolean;
  /** HTTP status, or 0 for a transport-level failure (never reached the API). */
  status: number;
  /** Structured error message on failure, else null. Never contains a secret. */
  error: string | null;
  /** Parsed JSON body, or null when the call failed / returned no body. */
  data: T | null;
  /**
   * Present + true when the call could not run because something isn't wired yet
   * (unwired A2P stub, missing master credential, missing tenant subaccount). This
   * is an HONEST degrade (§13) — distinct from an API error — so callers can branch
   * to "not configured" UX instead of "send failed".
   */
  needs_config?: boolean;
}

/** A resolved Twilio credential pair (either a subaccount's or the platform master's). */
export interface TwilioCreds {
  accountSid: string;
  authToken: string;
}

/** Minimal shape of the tenant_twilio_subaccounts row this helper reads (§9, D1). */
interface TenantSubaccountRow {
  subaccount_sid: string | null;
  auth_token_vault_ref: string | null;
  status?: string | null;
}

// -----------------------------------------------------------------------------
// Core request primitive
// -----------------------------------------------------------------------------

const TWILIO_API_HOST = "https://api.twilio.com";
const MAX_ERROR_BODY = 400; // cap echoed error bodies (belt-and-suspenders on secrets)

type TwilioParamValue = string | number | boolean | undefined | null | string[];

/**
 * Form-encode a flat param map to application/x-www-form-urlencoded. Undefined/null
 * values are dropped; array values are repeated (Twilio's convention for e.g.
 * multiple MediaUrl entries). Booleans/numbers are stringified.
 */
function formEncode(params: Record<string, TwilioParamValue>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) usp.append(k, String(item));
    } else {
      usp.append(k, String(v));
    }
  }
  return usp.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The single authenticated Twilio REST call. Basic-auth with the supplied creds,
 * form-encodes params (for write verbs) or query-strings them (for GET), retries
 * ONCE on a 429 or 5xx (transient), and always resolves to a structured
 * TwilioResult — never leaking the auth token into an error.
 *
 * @param accountSid  The account the credentials authenticate as (master or subaccount).
 * @param authToken   The matching auth token (Basic-auth password). Never logged.
 * @param path        Either an absolute https URL or a path beginning with "/"
 *                    (prefixed with https://api.twilio.com). Lets A2P/TrustHub hosts
 *                    be addressed by passing their full URL.
 * @param method      HTTP verb.
 * @param params      Flat param map. For GET these become the query string; for
 *                    write verbs, the form body.
 */
export async function twilioRequest<T = Record<string, unknown>>(
  accountSid: string,
  authToken: string,
  path: string,
  method: "GET" | "POST" | "DELETE" = "POST",
  params: Record<string, TwilioParamValue> = {},
): Promise<TwilioResult<T>> {
  if (!accountSid || !authToken) {
    return { ok: false, status: 0, error: "twilio_missing_credentials", data: null, needs_config: true };
  }

  const isAbsolute = /^https?:\/\//i.test(path);
  let url = isAbsolute ? path : `${TWILIO_API_HOST}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    // Token lives ONLY here, never in the URL — so a fetch-reject TypeError (which
    // echoes the request URL) can never surface the secret.
    Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
  };

  let bodyStr: string | undefined;
  const encoded = formEncode(params);
  if (method === "GET" || method === "DELETE") {
    if (encoded) url += (url.includes("?") ? "&" : "?") + encoded;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    bodyStr = encoded;
  }

  const attempt = async (): Promise<TwilioResult<T>> => {
    try {
      const res = await fetch(url, { method, headers, body: bodyStr });
      const raw = await res.text();
      let json: unknown = null;
      if (raw) {
        try {
          json = JSON.parse(raw);
        } catch {
          json = null;
        }
      }
      if (!res.ok) {
        // Twilio error bodies are { code, message, more_info, status } — safe to echo,
        // but cap length defensively. Prefer the API's own message.
        const apiMsg =
          (json && typeof json === "object" && "message" in (json as Record<string, unknown>)
            ? String((json as Record<string, unknown>).message)
            : raw) || `twilio_http_${res.status}`;
        return {
          ok: false,
          status: res.status,
          error: `twilio_${res.status}: ${apiMsg.slice(0, MAX_ERROR_BODY)}`,
          data: (json as T) ?? null,
        };
      }
      return { ok: true, status: res.status, error: null, data: (json as T) ?? null };
    } catch (e) {
      // Transport-level failure — never reached Twilio. status 0 signals "retryable".
      return { ok: false, status: 0, error: `twilio_network: ${(e as Error).message.slice(0, MAX_ERROR_BODY)}`, data: null };
    }
  };

  let result = await attempt();
  // Retry ONCE on a transient failure: 429 (rate limit), any 5xx, or a transport fault (status 0).
  if (!result.ok && (result.status === 0 || result.status === 429 || result.status >= 500)) {
    await sleep(result.status === 429 ? 1000 : 400);
    result = await attempt();
  }
  return result;
}

// -----------------------------------------------------------------------------
// Master (platform) credentials — env only (D2/D3)
// -----------------------------------------------------------------------------

/**
 * The platform master Twilio credentials from env (TWILIO_ACCOUNT_SID / _AUTH_TOKEN).
 * Read at CALL time (never module load) so rotation needs no redeploy. Returns null
 * when unset — callers surface a needs_config degrade, never a crash (§13).
 */
export function masterCreds(): TwilioCreds | null {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken };
}

// -----------------------------------------------------------------------------
// Per-tenant credential resolution (Vault bridge, §9 / D1)
// -----------------------------------------------------------------------------

/**
 * Loose structural type for the supabase-js admin (service-role) client this helper
 * needs — kept permissive (mirrors railAutomation's RpcClient) so any service-role
 * SupabaseClient assigns without friction, and twilio.ts stays dependency-free /
 * importable by the pure layer. The caller passes the real service-role client.
 */
// deno-lint-ignore no-explicit-any
export type SupabaseAdminLike = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

/**
 * Resolve a tenant's Twilio subaccount credentials: read tenant_twilio_subaccounts
 * for the tenant, then decrypt the auth token from Vault via the read_channel_secret
 * SECURITY-DEFINER RPC (the only path an edge function can read vault.decrypted_secrets;
 * precedent: cron_token_header()). Returns a TwilioResult<TwilioCreds>:
 *   • ok:true  + data:{accountSid, authToken}          — tenant is provisioned
 *   • ok:false + needs_config:true                     — no subaccount / no vault ref yet
 *   • ok:false + error                                 — a real lookup/decrypt failure
 *
 * MUST be called with a SERVICE-ROLE client — the RPC is granted to service_role only,
 * and the token must never transit an anon/authenticated context.
 */
export async function resolveTwilioCreds(
  supabaseAdmin: SupabaseAdminLike,
  tenantId: string,
): Promise<TwilioResult<TwilioCreds>> {
  if (!tenantId) {
    return { ok: false, status: 0, error: "twilio_missing_tenant_id", data: null };
  }

  const { data, error: rowErr } = await supabaseAdmin
    .from("tenant_twilio_subaccounts")
    // NOTE: the column is `twilio_subaccount_sid` on tenant_twilio_subaccounts;
    // alias it to subaccount_sid so the reads below stay stable (verify-crew fix #3).
    .select("subaccount_sid:twilio_subaccount_sid, auth_token_vault_ref, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const row = data as TenantSubaccountRow | null;

  if (rowErr) {
    return { ok: false, status: 0, error: `twilio_subaccount_lookup_failed: ${String((rowErr as { message?: string })?.message ?? rowErr).slice(0, MAX_ERROR_BODY)}`, data: null };
  }
  if (!row || !row.subaccount_sid || !row.auth_token_vault_ref) {
    // Tenant hasn't been provisioned a Twilio subaccount yet — honest degrade.
    return { ok: false, status: 0, error: "twilio_subaccount_not_provisioned", data: null, needs_config: true };
  }

  const { data: secret, error: secErr } = await supabaseAdmin.rpc("read_channel_secret", {
    _ref: row.auth_token_vault_ref,
  });
  if (secErr) {
    return { ok: false, status: 0, error: `twilio_vault_read_failed: ${String((secErr as { message?: string })?.message ?? secErr).slice(0, MAX_ERROR_BODY)}`, data: null };
  }
  const authToken = typeof secret === "string" ? secret : "";
  if (!authToken) {
    return { ok: false, status: 0, error: "twilio_vault_ref_empty", data: null, needs_config: true };
  }

  return { ok: true, status: 200, error: null, data: { accountSid: row.subaccount_sid, authToken } };
}

// -----------------------------------------------------------------------------
// Typed wrappers used by C-2
// -----------------------------------------------------------------------------

/**
 * Create a Twilio SUBaccount under the platform master account (D1: the 1-per-tenant
 * account entity). Uses master creds (env). The response `data.sid` is the subaccount
 * SID and `data.auth_token` its auth token — the caller stores the SID on
 * tenant_twilio_subaccounts and the token in Vault (never in the table).
 * Returns needs_config when master creds are unset.
 */
export async function createSubaccount(friendlyName: string): Promise<TwilioResult> {
  const master = masterCreds();
  if (!master) {
    return { ok: false, status: 0, error: "twilio_master_not_configured", data: null, needs_config: true };
  }
  return await twilioRequest(
    master.accountSid,
    master.authToken,
    "/2010-04-01/Accounts.json",
    "POST",
    { FriendlyName: friendlyName },
  );
}

export interface AvailableNumberSearch {
  areaCode?: string;
  contains?: string;
  /** ISO country for the AvailablePhoneNumbers path; defaults to "US". */
  country?: string;
  /** Number type segment; defaults to "Local". */
  type?: "Local" | "TollFree" | "Mobile";
  smsEnabled?: boolean;
}

/**
 * Search available phone numbers to purchase, authenticated as the tenant's SUBaccount
 * (numbers are bought into the subaccount). `data.available_phone_numbers` is the list.
 */
export async function listAvailableNumbers(
  subaccountSid: string,
  subToken: string,
  opts: AvailableNumberSearch = {},
): Promise<TwilioResult> {
  const country = opts.country || "US";
  const type = opts.type || "Local";
  return await twilioRequest(
    subaccountSid,
    subToken,
    `/2010-04-01/Accounts/${encodeURIComponent(subaccountSid)}/AvailablePhoneNumbers/${encodeURIComponent(country)}/${encodeURIComponent(type)}.json`,
    "GET",
    {
      AreaCode: opts.areaCode,
      Contains: opts.contains,
      SmsEnabled: opts.smsEnabled === undefined ? "true" : String(opts.smsEnabled),
    },
  );
}

export interface PurchaseNumberOptions {
  /** Delivery/status callback URL Twilio hits with message status events. */
  statusCallback?: string;
  /** Inbound SMS webhook URL (the C-2 Twilio inbound handler). */
  smsUrl?: string;
  friendlyName?: string;
}

/**
 * Purchase a phone number into the tenant's SUBaccount. `data.sid` is the
 * IncomingPhoneNumber SID; `data.phone_number` the E.164 number.
 */
export async function purchaseNumber(
  subaccountSid: string,
  subToken: string,
  phoneNumber: string,
  opts: PurchaseNumberOptions = {},
): Promise<TwilioResult> {
  return await twilioRequest(
    subaccountSid,
    subToken,
    `/2010-04-01/Accounts/${encodeURIComponent(subaccountSid)}/IncomingPhoneNumbers.json`,
    "POST",
    {
      PhoneNumber: phoneNumber,
      FriendlyName: opts.friendlyName,
      SmsUrl: opts.smsUrl,
      StatusCallback: opts.statusCallback,
    },
  );
}

export interface SendSmsOptions {
  from: string;
  to: string;
  body: string;
  /** Per-message delivery status callback (overrides the number-level one). */
  statusCallback?: string;
  /** Optional Messaging Service SID (A2P) to send through instead of a bare From. */
  messagingServiceSid?: string;
}

/**
 * Send an SMS authenticated as the tenant's SUBaccount. `data.sid` is the Twilio
 * message SID (the vendor_message_id the caller records). Mirrors the shape the
 * legacy inline path posted — but through the ONE authenticated seam.
 */
export async function sendSms(
  subaccountSid: string,
  subToken: string,
  opts: SendSmsOptions,
): Promise<TwilioResult> {
  const params: Record<string, TwilioParamValue> = {
    To: opts.to,
    Body: opts.body,
    StatusCallback: opts.statusCallback,
  };
  // A2P Messaging Service takes precedence over a bare From when present.
  if (opts.messagingServiceSid) {
    params.MessagingServiceSid = opts.messagingServiceSid;
  } else {
    params.From = opts.from;
  }
  return await twilioRequest(
    subaccountSid,
    subToken,
    `/2010-04-01/Accounts/${encodeURIComponent(subaccountSid)}/Messages.json`,
    "POST",
    params,
  );
}

// -----------------------------------------------------------------------------
// A2P 10DLC stubs — NOT wired yet (§13 honest degrade)
// -----------------------------------------------------------------------------
//
// A2P brand/campaign registration runs through Twilio TrustHub
// (https://trusthub.twilio.com/v1 + https://messaging.twilio.com/v1) and requires
// business-profile onboarding we haven't built. Until that lands these return a
// needs_config result so no caller ever mistakes an unwired stub for a real
// brand/campaign SID. When wired, replace the body with a twilioRequest to the
// TrustHub endpoint — the signature stays stable so callers don't change.

export interface CreateBrandInput {
  tenantId: string;
  legalBusinessName?: string;
  ein?: string;
  [k: string]: unknown;
}

export interface CreateCampaignInput {
  tenantId: string;
  brandSid?: string;
  useCase?: string;
  [k: string]: unknown;
}

/** A2P brand registration — NOT wired. Returns needs_config, never a fake brand SID. */
export function createBrand(_input: CreateBrandInput): Promise<TwilioResult> {
  return Promise.resolve({
    ok: false,
    status: 0,
    error: "a2p_brand_registration_not_wired",
    data: null,
    needs_config: true,
  });
}

/** A2P campaign registration — NOT wired. Returns needs_config, never a fake campaign SID. */
export function createCampaign(_input: CreateCampaignInput): Promise<TwilioResult> {
  return Promise.resolve({
    ok: false,
    status: 0,
    error: "a2p_campaign_registration_not_wired",
    data: null,
    needs_config: true,
  });
}
