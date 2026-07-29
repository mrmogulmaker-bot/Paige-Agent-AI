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
// PER-TENANT CREDENTIAL MODEL (§9, D1 + C-2a API-Key auth 2026-07-28)
//   tenant_twilio_subaccounts is the 1-per-tenant ACCOUNT entity: it holds the Twilio
//   SUBaccount SID + a SUBACCOUNT-scoped API Key SID (api_key_sid, "SK…") + a Vault REF
//   (name) to that API Key's SECRET — never the raw secret. Under MASTER API-Key auth
//   Twilio's subaccount-create response OMITS auth_token, so we no longer depend on it;
//   provisioning mints a subaccount API Key (createSubaccountApiKey) and vaults that
//   secret. resolveTwilioCreds() reads the row, decrypts the API-Key secret through the
//   proven Vault bridge RPC (read_channel_secret), and builds Basic auth as
//   api_key_sid : <secret> (the master API-Key pattern — username is the SK…, NOT the
//   subaccount SID). Master (platform) creds come from env via masterCreds() and are
//   used to mint subaccounts, mint subaccount API Keys, and for the +1 470 super-admin
//   path (D2/D3).

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
  /** AC… — the account the request ACTS ON, used only in the URL path. */
  accountSid: string;
  /** Basic-auth PASSWORD: an API Key Secret (master path) or a subaccount auth token. */
  authToken: string;
  /**
   * SK… — Basic-auth USERNAME for the API-Key auth path (Twilio best-practice). When
   * present the Basic-auth username is this API Key SID, NOT accountSid; the account is
   * still addressed by accountSid in the URL path. Set on BOTH the master path (D2/D3
   * master creds) AND the per-subaccount path (C-2a: the subaccount-scoped api_key_sid
   * resolved by resolveTwilioCreds). Callers thread it to twilioRequest as `authUser`.
   */
  apiKeySid?: string;
}

/** Minimal shape of the tenant_twilio_subaccounts row this helper reads (§9, D1/C-2a). */
interface TenantSubaccountRow {
  subaccount_sid: string | null;
  /** SK… — the subaccount-scoped API Key SID; Basic-auth USERNAME (C-2a). */
  api_key_sid: string | null;
  /** Vault ref for the API-Key SECRET (Basic-auth password). Meaning changed in C-2a. */
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
 * @param accountSid  The account the request ACTS ON (master or subaccount) — used to
 *                    address the account in the URL path. Also the Basic-auth username
 *                    UNLESS `authUser` is supplied.
 * @param authToken   The Basic-auth PASSWORD (a subaccount auth token, or an API Key
 *                    Secret when `authUser` is an API Key SID). Never logged.
 * @param path        Either an absolute https URL or a path beginning with "/"
 *                    (prefixed with https://api.twilio.com). Lets A2P/TrustHub hosts
 *                    be addressed by passing their full URL.
 * @param method      HTTP verb.
 * @param params      Flat param map. For GET these become the query string; for
 *                    write verbs, the form body.
 * @param authUser    Optional Basic-auth USERNAME override. When set (e.g. an API Key
 *                    SID `SK…` for the master path), the Basic-auth username is this
 *                    instead of `accountSid`, while the URL still addresses `accountSid`.
 *                    This is how API-Key auth (Twilio best-practice) decouples the
 *                    credential from the account it acts on.
 */
export async function twilioRequest<T = Record<string, unknown>>(
  accountSid: string,
  authToken: string,
  path: string,
  method: "GET" | "POST" | "DELETE" = "POST",
  params: Record<string, TwilioParamValue> = {},
  authUser?: string,
): Promise<TwilioResult<T>> {
  // The Basic-auth username is the API Key SID when provided, else the account SID.
  const basicUser = (authUser && authUser.length > 0) ? authUser : accountSid;
  if (!basicUser || !authToken) {
    return { ok: false, status: 0, error: "twilio_missing_credentials", data: null, needs_config: true };
  }

  const isAbsolute = /^https?:\/\//i.test(path);
  let url = isAbsolute ? path : `${TWILIO_API_HOST}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    // Credentials live ONLY here, never in the URL — so a fetch-reject TypeError (which
    // echoes the request URL) can never surface the secret. username = API Key SID
    // (master, best-practice) or subaccount SID; password = API Key Secret / auth token.
    Authorization: "Basic " + btoa(`${basicUser}:${authToken}`),
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
 * The platform master Twilio credentials from env. Read at CALL time (never module
 * load) so rotation needs no redeploy. Returns null when unset — callers surface a
 * needs_config degrade, never a crash (§13).
 *
 * CREDENTIAL PATTERN (owner-confirmed 2026-07-27): prod carries an API KEY trio —
 * TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SID (SK…) + TWILIO_API_KEY_SECRET — and NOT the
 * master TWILIO_AUTH_TOKEN (intentionally absent; Twilio best-practice is scoped,
 * rotatable API Keys over the all-powerful account Auth Token). So the master Basic-auth
 * USERNAME is the API Key SID and the PASSWORD is the API Key Secret, while the URL path
 * still addresses the master Account SID (returned as `accountSid`, threaded to
 * twilioRequest, and paired with `apiKeySid` as the auth username).
 *
 * Legacy fallback: if the API Key trio isn't fully set but a legacy TWILIO_AUTH_TOKEN
 * IS present (e.g. an older env), fall back to account-SID:auth-token Basic auth so the
 * change is safe across environments. Prod uses the API Key path.
 */
export function masterCreds(): TwilioCreds | null {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  if (!accountSid) return null;
  const apiKeySid = Deno.env.get("TWILIO_API_KEY_SID") ?? "";
  const apiKeySecret = Deno.env.get("TWILIO_API_KEY_SECRET") ?? "";
  if (apiKeySid && apiKeySecret) {
    // Preferred: API Key auth. username = SK…, password = secret, path account = AC….
    return { accountSid, authToken: apiKeySecret, apiKeySid };
  }
  // Legacy fallback: master Auth Token (username = account SID). Prod does NOT carry this.
  const legacyToken = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  if (legacyToken) return { accountSid, authToken: legacyToken };
  return null;
}

/**
 * The ready-to-use `Authorization: Basic …` header value for the platform MASTER
 * account, honoring the API-Key-first credential pattern above (username = API Key SID,
 * password = API Key Secret; legacy fallback = account SID : auth token). Returns null
 * when no master credential is configured (honest degrade — the caller surfaces
 * needs_config, never sends with an empty password). This is the ONE master-auth home
 * (§18) the legacy inline SMS senders reuse so none of them re-derive the auth pattern.
 */
export function masterBasicAuthHeader(): string | null {
  const m = masterCreds();
  if (!m) return null;
  const user = (m.apiKeySid && m.apiKeySid.length > 0) ? m.apiKeySid : m.accountSid;
  return "Basic " + btoa(`${user}:${m.authToken}`);
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
 * for the tenant, then decrypt the API-Key SECRET from Vault via the read_channel_secret
 * SECURITY-DEFINER RPC (the only path an edge function can read vault.decrypted_secrets;
 * precedent: cron_token_header()). Returns a TwilioResult<TwilioCreds>:
 *   • ok:true  + data:{accountSid, authToken, apiKeySid} — tenant is provisioned
 *   • ok:false + needs_config:true                       — no subaccount / no api_key_sid / no vault ref
 *   • ok:false + error                                   — a real lookup/decrypt failure
 *
 * C-2a (owner-confirmed 2026-07-28): the Basic-auth USERNAME is the subaccount-scoped
 * API Key SID (api_key_sid, "SK…"), NOT the subaccount SID, and the PASSWORD is the
 * vaulted API-Key SECRET (auth_token_vault_ref now refs that secret). This is exactly
 * the master API-Key pattern (masterBasicAuthHeader). If api_key_sid is null (a legacy/
 * none row) we degrade to needs_config rather than send with the WRONG username.
 * The URL path still addresses the subaccount via accountSid.
 *
 * MUST be called with a SERVICE-ROLE client — the RPC is granted to service_role only,
 * and the secret must never transit an anon/authenticated context.
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
    .select("subaccount_sid:twilio_subaccount_sid, api_key_sid, auth_token_vault_ref, status")
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
  if (!row.api_key_sid) {
    // Legacy/none row without a subaccount-scoped API Key — under API-Key auth we cannot
    // send with the subaccount SID as the username, so degrade honestly (§13) instead of
    // authing with the wrong username (which Twilio would 401).
    return { ok: false, status: 0, error: "twilio_subaccount_api_key_missing", data: null, needs_config: true };
  }

  const { data: secret, error: secErr } = await supabaseAdmin.rpc("read_channel_secret", {
    _ref: row.auth_token_vault_ref,
  });
  if (secErr) {
    return { ok: false, status: 0, error: `twilio_vault_read_failed: ${String((secErr as { message?: string })?.message ?? secErr).slice(0, MAX_ERROR_BODY)}`, data: null };
  }
  const apiKeySecret = typeof secret === "string" ? secret : "";
  if (!apiKeySecret) {
    return { ok: false, status: 0, error: "twilio_vault_ref_empty", data: null, needs_config: true };
  }

  // authToken = API-Key SECRET (password); apiKeySid = SK… (username). accountSid = the
  // subaccount SID (URL path). twilioRequest uses apiKeySid as the Basic-auth username
  // whenever the caller threads it through (see sendSms/purchaseNumber/listAvailableNumbers).
  return {
    ok: true,
    status: 200,
    error: null,
    data: { accountSid: row.subaccount_sid, authToken: apiKeySecret, apiKeySid: row.api_key_sid },
  };
}

// -----------------------------------------------------------------------------
// Typed wrappers used by C-2
// -----------------------------------------------------------------------------

/**
 * Create a Twilio SUBaccount under the platform master account (D1: the 1-per-tenant
 * account entity). Uses master creds (env). The response `data.sid` is the subaccount
 * SID — the caller stores it on tenant_twilio_subaccounts.
 *
 * IMPORTANT (C-2a, owner-confirmed 2026-07-28): under MASTER API-KEY auth Twilio's
 * POST /Accounts.json returns the new subaccount's `sid` but OMITS `auth_token`
 * (confirmed empirically). So `data.auth_token` may be absent — the caller MUST NOT
 * depend on it. Instead it mints a subaccount-scoped API Key via createSubaccountApiKey()
 * and vaults THAT secret. Returns needs_config when master creds are unset.
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
    master.apiKeySid, // API Key SID as the Basic-auth username (master path); undefined on legacy fallback
  );
}

/** Twilio's response body for a new subaccount API Key (the SECRET is shown ONCE). */
export interface SubaccountApiKey {
  /** SK… — the API Key SID (Basic-auth USERNAME). Non-secret. */
  sid: string;
  /** The API Key SECRET (Basic-auth PASSWORD). Shown ONCE by Twilio — vault it immediately. */
  secret: string;
}

/**
 * Mint a SUBACCOUNT-scoped API Key on an existing subaccount, authenticated with MASTER
 * creds (the master API Key is account-scoped, so it can create keys on any subaccount
 * under the master account). POSTs to /2010-04-01/Accounts/{subaccountSid}/Keys.json;
 * Twilio returns { sid: "SK…", secret } and the SECRET is shown ONCE. Returns both so
 * the caller can vault the secret immediately (§34 — the secret is NEVER logged, NEVER
 * persisted outside Vault). Reuses the ONE Twilio seam (twilioRequest + masterCreds,
 * §18). Returns needs_config when master creds are unset, and a structured error if
 * Twilio's response is missing the SK/secret pair (§13 — never a fabricated key).
 */
export async function createSubaccountApiKey(subaccountSid: string): Promise<TwilioResult<SubaccountApiKey>> {
  if (!subaccountSid) {
    return { ok: false, status: 0, error: "twilio_missing_subaccount_sid", data: null };
  }
  const master = masterCreds();
  if (!master) {
    return { ok: false, status: 0, error: "twilio_master_not_configured", data: null, needs_config: true };
  }
  const res = await twilioRequest<SubaccountApiKey>(
    // URL path addresses the SUBaccount; Basic-auth is the MASTER API Key (account-scoped).
    subaccountSid,
    master.authToken,
    `/2010-04-01/Accounts/${encodeURIComponent(subaccountSid)}/Keys.json`,
    "POST",
    { FriendlyName: "Paige subaccount API key (C-2a)" },
    master.apiKeySid, // master API Key SID as the Basic-auth username; undefined on legacy fallback
  );
  if (!res.ok) return res;
  const sid = res.data?.sid;
  const secret = res.data?.secret;
  if (!sid || !secret) {
    // Twilio should always return both on a 2xx; guard so a caller never vaults an empty
    // secret or stores a null SID (§13 — honest, no fabricated key).
    return { ok: false, status: res.status, error: "twilio_api_key_missing_sid_or_secret", data: null };
  }
  return { ok: true, status: res.status, error: null, data: { sid, secret } };
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
  authUser?: string,
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
      // Capabilities are DISPLAY, not a gate (§36, bug #149): when the caller does not
      // explicitly constrain SMS, OMIT the SmsEnabled param entirely so Twilio returns
      // ALL numbers (SMS-capable or not) — undefined is dropped by formEncode. Only pass
      // the flag when a caller deliberately set it.
      SmsEnabled: opts.smsEnabled === undefined ? undefined : String(opts.smsEnabled),
    },
    // C-2a: the subaccount-scoped API Key SID as the Basic-auth username. Omitted →
    // username falls back to subaccountSid (wrong under API-Key auth), so callers that
    // resolve via resolveTwilioCreds MUST pass creds.data.apiKeySid here.
    authUser,
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
  authUser?: string,
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
    // C-2a: the subaccount-scoped API Key SID as the Basic-auth username. Omitted →
    // username falls back to subaccountSid (wrong under API-Key auth), so callers that
    // resolve via resolveTwilioCreds MUST pass creds.data.apiKeySid here.
    authUser,
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
  authUser?: string,
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
  // `authUser` (an API Key SID) is the master-path Basic-auth username for the
  // Super-Admin +1 470 number, which lives on the MASTER account (not a subaccount).
  // For the subaccount path it's omitted → username = subaccountSid. The URL always
  // addresses the account passed as `subaccountSid` (master AC… or subaccount AC…).
  return await twilioRequest(
    subaccountSid,
    subToken,
    `/2010-04-01/Accounts/${encodeURIComponent(subaccountSid)}/Messages.json`,
    "POST",
    params,
    authUser,
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
