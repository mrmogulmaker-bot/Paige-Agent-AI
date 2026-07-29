/**
 * connectError — the ONE home (§18) for turning a `supabase.functions.invoke()`
 * failure into an honest, friendly, code-aware message for a tenant.
 *
 * WHY THIS EXISTS (Cowork #156): `supabase.functions.invoke()` returns
 * `{ data, error }`. On a NON-2xx response the framework sets `data = null` and
 * `error` to a `FunctionsHttpError` whose `.context` is the raw `Response` — the
 * honest JSON body (e.g. `{ error: "gmail_oauth_not_configured" }`) lives INSIDE
 * that Response, not on `data`. Call sites that read the code from `data` only
 * therefore miss it on a non-2xx and fall through to `error.message`, which is the
 * raw framework string "Edge Function returned a non-2xx status code" — jargon a
 * coach should NEVER see (§3/§13/§36). This helper reads the code from BOTH shapes
 * (2xx-with-error on `data`, and non-2xx from the Response body), maps known codes
 * to plain-English copy, and ALWAYS falls back to a friendly line — never the raw
 * message.
 *
 * PURE + framework-agnostic: it returns `{ code, message }` and shows nothing
 * itself. The caller decides toast vs. inline note (a needs-config state is an
 * honest inline note, not a red error scream — §13/§36).
 */

export interface ResolvedFunctionError {
  /** The honest machine code we extracted, or null when none was present. */
  code: string | null;
  /** Coach-readable, one-read copy (§36). Never the raw framework message (§13). */
  message: string;
}

/**
 * A short human phrase naming what the tenant was trying to do, e.g.
 * "connect Gmail", "disconnect Zoom", "connect your SMTP server". It drives the
 * generic-fallback and permission copy so they read naturally for connect AND
 * disconnect alike. No jargon (§3) — say "connect"/"sign in", never "OAuth".
 */
type ActionPhrase = string;

// ---------------------------------------------------------------------------
// Code → copy map. Provider-specific "not switched on yet" lines are keyed by the
// EXACT code each edge function emits (verified against source, not guessed):
//   gmail-oauth-start           → "gmail_oauth_not_configured"          (500)
//   google-calendar-oauth-start → "google_oauth_not_configured"         (500)
//   zoom-oauth-start            → "zoom_oauth_not_configured"           (500)
// smtp-connect's failure codes are folded in so SMTP shares this one home too.
// ---------------------------------------------------------------------------

// Honest "not switched on yet" copy — a needs-config state is NOT an error scream.
const NOT_CONFIGURED_COPY: Record<string, string> = {
  gmail_oauth_not_configured:
    "Gmail sign-in isn’t switched on yet — it needs a quick verification step before it goes live. You can verify a sending domain to start sending today, or check back shortly.",
  google_oauth_not_configured:
    "Google Calendar sign-in isn’t switched on yet — it needs a quick verification step before it goes live. Check back shortly and we’ll have it ready.",
  // Defensive aliases (§13): the calendar function currently emits
  // "google_oauth_not_configured", but tolerate these adjacent spellings so a
  // future rename can't silently leak the raw framework message.
  google_calendar_oauth_not_configured:
    "Google Calendar sign-in isn’t switched on yet — it needs a quick verification step before it goes live. Check back shortly and we’ll have it ready.",
  gcal_oauth_not_configured:
    "Google Calendar sign-in isn’t switched on yet — it needs a quick verification step before it goes live. Check back shortly and we’ll have it ready.",
  zoom_oauth_not_configured:
    "Zoom sign-in isn’t switched on yet — it needs a quick verification step before it goes live. Check back shortly and we’ll have it ready.",
};

// SMTP reachability / credential codes (from smtp-connect) — honest, specific copy.
const SMTP_COPY: Record<string, string> = {
  smtp_host_not_allowed:
    "That host or port isn’t allowed. Use your provider’s public mail server (ports 465, 587, 25, or 2525) — internal addresses are blocked for safety.",
  smtp_port_not_allowed: "Use a standard mail port: 465, 587, 25, or 2525.",
  smtp_host_invalid: "That server address doesn’t look right — check it and try again.",
  smtp_host_unresolvable: "We couldn’t find that mail server. Double-check the host name.",
  smtp_host_unreachable: "We couldn’t reach that mail server on that port. Check the host and port.",
  smtp_connect_failed: "We couldn’t reach that mail server. Check the host, port, and login, then try again.",
  invalid_from_address: "Enter a valid from-address (e.g. you@yourdomain.com).",
  missing_fields: "Fill in the server, port, username, password, and from-address.",
  invalid_json: "Something went wrong sending your details. Please try again.",
  no_tenant_for_user: "Your account isn’t attached to a workspace yet.",
  vault_write_failed: "We couldn’t securely store your credentials just now. Try again in a moment.",
  connector_update_failed: "We couldn’t save that connection just now. Try again in a moment.",
  connector_insert_failed: "We couldn’t save that connection just now. Try again in a moment.",
};

/** Codes that mean "you lack the role to do this". */
const PERMISSION_CODES = new Set(["unauthorized", "forbidden"]);

/**
 * Pull the honest machine code out of an invoke() result, handling BOTH shapes:
 *  (a) 2xx-with-error: the code sits on `data.error`.
 *  (b) non-2xx: `data` is null and the code is in the `FunctionsHttpError`'s
 *      `.context` Response body — read it with a guarded `.json()`.
 * Also tolerates `.context` already being a parsed object (version differences).
 */
async function extractCode(error: unknown, data: unknown): Promise<string | null> {
  // Shape (a): a JSON body was returned on a 2xx (or the client parsed it onto data).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataCode = (data as any)?.error;
  if (typeof dataCode === "string" && dataCode.length > 0) return dataCode;

  // Shape (b): non-2xx → the body lives on FunctionsHttpError.context (the Response).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context = (error as any)?.context;
  if (!context) return null;

  // Prefer a duck-typed check over `instanceof Response` — instanceof is brittle
  // across the esm.sh / bundler boundary. If .json exists, it's Response-like.
  if (typeof context.json === "function") {
    try {
      const body = await context.json();
      const code = body?.error;
      return typeof code === "string" && code.length > 0 ? code : null;
    } catch {
      // Non-JSON body (HTML error page, empty, already-consumed) — do NOT throw.
      return null;
    }
  }

  // Some versions expose an already-parsed object on .context.
  if (typeof context === "object" && typeof context.error === "string" && context.error.length > 0) {
    return context.error;
  }

  return null;
}

/**
 * Turn a `supabase.functions.invoke()` failure into `{ code, message }`.
 *
 * @param args.error  the `error` returned by invoke() (a FunctionsHttpError on non-2xx)
 * @param args.data   the `data` returned by invoke() (carries `.error` on a 2xx-with-error)
 * @param args.action a short verb phrase, e.g. "connect Gmail" / "disconnect Zoom",
 *                    used only for the generic + permission fallbacks so they read
 *                    naturally. No jargon (§3).
 */
export async function resolveFunctionError(args: {
  error: unknown;
  data: unknown;
  action: ActionPhrase;
}): Promise<ResolvedFunctionError> {
  const { error, data, action } = args;
  const code = await extractCode(error, data);

  // Keep the real reason for support, but NEVER surface it to the tenant (§13).
  if (code) {
    console.debug(`[connectError] ${action} failed with code:`, code);
  } else if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.debug(`[connectError] ${action} failed:`, (error as any)?.message ?? error);
  }

  if (code && NOT_CONFIGURED_COPY[code]) {
    return { code, message: NOT_CONFIGURED_COPY[code] };
  }
  if (code && SMTP_COPY[code]) {
    return { code, message: SMTP_COPY[code] };
  }
  if (code && PERMISSION_CODES.has(code)) {
    return {
      code,
      message: `You don’t have permission to ${action} — ask a workspace admin.`,
    };
  }
  if (code === "origin_required") {
    return {
      code,
      message: "We couldn’t start the connection from this page. Please refresh and try again.",
    };
  }

  // GENERIC fallback — an unknown code, or no code at all (a non-2xx with no honest
  // body, a network blip). NEVER the raw framework message (§13/§36).
  return {
    code,
    message: `We couldn’t ${action} just now. Please try again in a moment.`,
  };
}
