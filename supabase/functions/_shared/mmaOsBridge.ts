// Shared MMA OS bridge client.
// All Paige → MMA OS bridge calls go through this module.
// Server-side only — token must never reach the browser.
//
// Compliance (§75): hard payload denylist strips any consumer-credit-regulated
// field before send. Paige Agent AI stays on the MMA business side; consumer
// credit / dispute / bureau data lives on Mogul Credit AI's separate spine
// and never crosses into the MMA OS ledger.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;
const TIMEOUT_MS = 10_000;

export type BridgeVerb =
  | "update_paige_member_state"
  | "record_paige_feature_use"
  | "record_cross_system_event"
  | "record_member_event"
  | "customer_support_intake"
  | "ghl_send_sms_fallback"
  | "ghl_send_email_fallback"
  | "tier_change_notify"
  | "query_supabase"
  | "get_member_360"
  | "get_workflow_status"
  | "booking_created"
  | "signature_completed"
  | "social_comment_received"
  | "business_credit_score_changed"
  | "funding_readiness_assessed"
  | "handle_new_lead"
  | "client.onboarding_started"
  | "client.agreement_signed"
  | "client.payment_authorized"
  | "client.intake_submitted"
  | "client.initial_docs_uploaded"
  | "client.onboarding_completed";



// Fields that must never leave Paige for the MMA OS ledger.
// Matched case-insensitively as prefix OR exact key.
const CONSUMER_CREDIT_DENYLIST = [
  "ssn",
  "ssn_",
  "date_of_birth",
  "dob",
  "credit_score",
  "fico",
  "fico_",
  "tradeline",
  "tradeline_",
  "bureau",
  "bureau_",
  "dispute",
  "dispute_",
  "credit_report",
  "credit_report_",
  "experian",
  "equifax",
  "transunion",
  "vantagescore",
];

function isDenied(key: string): boolean {
  const k = key.toLowerCase();
  for (const banned of CONSUMER_CREDIT_DENYLIST) {
    if (k === banned) return true;
    if (banned.endsWith("_") && k.startsWith(banned)) return true;
    if (k.startsWith(banned + "_")) return true;
  }
  return false;
}

/** Deep-strip denylisted keys from objects/arrays. */
export function sanitizePayload<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((v) => sanitizePayload(v)) as unknown as T;
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (isDenied(k)) continue;
      out[k] = sanitizePayload(v);
    }
    return out as unknown as T;
  }
  return input;
}

function backoffDelay(attempt: number): number {
  const exp = Math.min(BASE_DELAY_MS * Math.pow(3, attempt - 1), MAX_DELAY_MS);
  // Jitter ±20%
  const jitter = exp * 0.2 * (Math.random() * 2 - 1);
  return Math.max(50, Math.floor(exp + jitter));
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(`[mmaOsBridge] ${event}`, JSON.stringify(data));
}

async function enqueueOutbox(verb: BridgeVerb, payload: unknown, error: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      log("outbox_enqueue_skipped_missing_env");
      return;
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const { error: insertErr } = await supabase
      .from("mma_os_bridge_outbox")
      .insert({
        verb,
        payload,
        attempts: MAX_ATTEMPTS,
        last_error: error.slice(0, 1000),
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
      });
    if (insertErr) log("outbox_enqueue_failed", { error: String(insertErr.message) });
    else log("outbox_enqueued", { verb });
  } catch (e) {
    log("outbox_enqueue_exception", { error: String((e as Error).message) });
  }
}

/**
 * Call MMA OS bridge with retries. Returns true on success, false on terminal failure.
 * On terminal failure, payload is enqueued in mma_os_bridge_outbox for cron retry.
 * Never throws.
 */
export async function callMmaOsBridge(
  verb: BridgeVerb,
  rawPayload: Record<string, unknown>,
  opts: { enqueueOnFailure?: boolean } = {},
): Promise<boolean> {
  const enqueueOnFailure = opts.enqueueOnFailure !== false;
  const url = Deno.env.get("PAIGE_OS_BRIDGE_URL") || Deno.env.get("PAIGE_OS_EDGE_URL");
  const key = Deno.env.get("PAIGE_OS_BRIDGE_API_KEY");

  if (!url || !key) {
    log("skipped_missing_env", { hasUrl: !!url, hasKey: !!key });
    return false;
  }

  const payload = sanitizePayload(rawPayload);
  const body = JSON.stringify({ verb, payload });

  let lastError = "unknown";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        await res.text().catch(() => "");
        log("succeeded", { verb, attempt });
        return true;
      }

      const respText = await res.text().catch(() => "");
      lastError = `http_${res.status}: ${respText.slice(0, 200)}`;

      if (!isTransientStatus(res.status) || attempt === MAX_ATTEMPTS) {
        log("failed_terminal", { verb, attempt, status: res.status });
        break;
      }
      log("failed_transient_retrying", { verb, attempt, status: res.status });
    } catch (e) {
      clearTimeout(timeout);
      lastError = `network: ${(e as Error).message}`;
      if (attempt === MAX_ATTEMPTS) {
        log("network_error_terminal", { verb, attempt, error: lastError });
        break;
      }
      log("network_error_retrying", { verb, attempt, error: lastError });
    }

    await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
  }

  if (enqueueOnFailure) {
    await enqueueOutbox(verb, payload, lastError);
  }
  return false;
}

/**
 * Fire-and-forget bridge call. Wraps in EdgeRuntime.waitUntil so the parent
 * request returns immediately. Use from request handlers.
 */
export function fireAndForgetBridge(
  verb: BridgeVerb,
  payload: Record<string, unknown>,
) {
  const promise = callMmaOsBridge(verb, payload).catch((e) =>
    log("waituntil_unhandled", { error: String((e as Error).message) }),
  );
  // @ts-expect-error EdgeRuntime is global in Supabase edge runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-expect-error see above
    EdgeRuntime.waitUntil(promise);
  }
}
