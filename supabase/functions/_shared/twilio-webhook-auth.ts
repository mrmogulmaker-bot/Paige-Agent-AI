/**
 * Authenticating a Twilio webhook in a deployment that holds no auth token.
 *
 * THE PROBLEM THIS EXISTS FOR. `handle-inbound-sms` and `twilio-status-callback`
 * each re-implemented HMAC validation inline and each ended with:
 *
 *     const token = Deno.env.get("TWILIO_AUTH_TOKEN");
 *     if (!token) { console.warn("... not set — accepting unsigned"); return true; }
 *
 * That is fail-OPEN. Anyone who can POST the URL could write to a tenant's
 * suppression and consent ledger by naming their number in `To`, or mark any
 * message delivered by naming its SID. And the token genuinely is absent:
 * `_shared/twilio.ts` documents that this deployment authenticates with scoped
 * API keys and that the master auth token is "intentionally absent". Tenant
 * numbers sit on subaccounts whose auth tokens are not stored either. So the
 * fail-open branch was not an edge case — it was the only branch that ran.
 *
 * THE POSTURE HERE. Two accepted proofs, tried in order, and no third:
 *   1. A valid Twilio signature, when an auth token IS resolvable.
 *   2. The per-tenant `inbound_webhook_secret` carried in the stamped URL,
 *      compared in constant time.
 * Anything else is refused. A request that proves nothing is not trusted
 * because we happen to lack a key.
 *
 * §18: signature computation is NOT re-implemented — `validateTwilioSignature`
 * in `_shared/twilio.ts` is the one home, and both handlers now come here
 * instead of carrying their own copy.
 */
import { validateTwilioSignature } from "./twilio.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: { env: { get(k: string): string | undefined } } | undefined;

export type WebhookAuthOutcome =
  | { ok: true; via: "signature" | "shared_secret" }
  | { ok: false; reason: "no_proof_offered" | "bad_signature" | "bad_secret" | "unknown_recipient" };

/** Constant-time compare so a secret cannot be recovered by timing the response. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // Compare a fixed number of bytes regardless of length, then fold length in.
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Resolve the secret stamped for the account that owns the receiving number.
 * Service-role client required: `authenticated` holds no grant on this table.
 */
/** The narrow slice of the Supabase client this module needs — typed rather
 *  than `any`, so a shape change is a compile error instead of a runtime one. */
interface ReadOnlyTable {
  select: (cols: string) => {
    eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
  };
}
export interface WebhookAuthAdmin { from: (table: string) => ReadOnlyTable }

export async function inboundSecretForNumber(
  admin: WebhookAuthAdmin,
  toNumberNormalized: string,
): Promise<string | null> {
  const { data: num } = await admin
    .from("tenant_phone_numbers")
    .select("tenant_id")
    .eq("phone_number", toNumberNormalized)
    .maybeSingle();
  if (!num?.tenant_id) return null;
  const { data: sub } = await admin
    .from("tenant_twilio_subaccounts")
    .select("inbound_webhook_secret")
    .eq("tenant_id", num.tenant_id as string)
    .maybeSingle();
  return (sub?.inbound_webhook_secret as string | undefined) ?? null;
}

/**
 * Decide whether a provider callback is authentic. FAILS CLOSED.
 *
 * `expectedSecret` is resolved by the caller (it knows which number was hit).
 * Pass null when the recipient could not be resolved — that is refused as
 * `unknown_recipient` rather than waved through.
 */
export async function authenticateTwilioWebhook(
  req: Request,
  rawBody: string,
  opts: { authToken?: string | null; expectedSecret?: string | null },
): Promise<WebhookAuthOutcome> {
  const sig = req.headers.get("x-twilio-signature");
  // Read through a guard rather than touching `Deno` directly: this module's
  // decisions are the ones that used to fail open, so they must be exercisable
  // by a plain Node smoke test instead of only inside the edge runtime.
  const envToken = typeof Deno !== "undefined" ? Deno.env.get("TWILIO_AUTH_TOKEN") : undefined;
  const token = opts.authToken ?? envToken ?? "";

  if (sig && token) {
    const ok = await validateTwilioSignature(token, sig, req.url, rawBody);
    return ok ? { ok: true, via: "signature" } : { ok: false, reason: "bad_signature" };
  }

  const offered = new URL(req.url).searchParams.get("t");
  if (!offered) return { ok: false, reason: "no_proof_offered" };
  if (!opts.expectedSecret) return { ok: false, reason: "unknown_recipient" };
  return timingSafeEqual(offered, opts.expectedSecret)
    ? { ok: true, via: "shared_secret" }
    : { ok: false, reason: "bad_secret" };
}

/** The URLs stamped onto a purchased number. One home, so the two handlers and
 *  the purchase path can never drift to different names again. */
export function stampedWebhookUrls(supabaseUrl: string, secret: string) {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1`;
  const q = `?t=${encodeURIComponent(secret)}`;
  return {
    smsUrl: `${base}/handle-inbound-sms${q}`,
    statusCallback: `${base}/twilio-status-callback${q}`,
  };
}
