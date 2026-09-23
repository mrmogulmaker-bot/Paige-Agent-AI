// Connected MCP Gateway — OAUTH CALLBACK core (Slice ②), factored out of the Deno edge wrapper so the
// whole flow is headless-provable (§32) — the same pattern as verify.ts / create.ts / oauth.ts. The
// wrapper (mcp-oauth-callback/index.ts) only reads env, builds the service-role client, and turns the
// GET query into this call; every decision — state redemption, the token exchange, the grant write, and
// crucially the REDIRECT that must never carry code/state (the #1355 structural fix) — lives here where
// the smoke can measure it against a real request shape, not a reading of the code.
//
// AUTHORITY / SECRET DISCIPLINE / #1355: see mcp-oauth-callback/index.ts. In short: the single-use,
// PKCE-bound `state` is the authenticator (no JWT on a provider redirect); the connection + tenant come
// from the consumed state, never the browser; complete_mcp_oauth_grant re-verifies tenant scope in-body;
// and every outcome is a 302 to a CLEAN app URL whose only query params are `mcp` + a closed detail/id —
// the authorization code and state never appear in the destination, so they never reach the SPA/analytics.

import { discoverAuthorizationServer, exchangeCode, OAuthError, statesMatch } from "../mcp-oauth.ts";
import { resolveCanonicalAppPath, type CanonicalTier } from "../canonical-app-url.ts";

// deno-lint-ignore no-explicit-any
type RpcClient = { rpc: (fn: string, params?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };

/** The two OAuth network operations the callback performs, injectable so the smoke can drive the whole
 *  flow headless (defaulting to the real, safeFetch-guarded implementations). */
export type OauthOps = {
  discoverAuthorizationServer: typeof discoverAuthorizationServer;
  exchangeCode: typeof exchangeCode;
};

export const defaultOauthOps: OauthOps = { discoverAuthorizationServer, exchangeCode };

export type OauthCallbackDeps = {
  /** service-role client — consumes the state (decrypts the verifier) and persists the grant. */
  admin: RpcClient;
  /** Overridable network ops (default: the real safeFetch-guarded ones). */
  ops?: OauthOps;
};

export type OauthCallbackQuery = {
  code: string | null;
  state: string | null;
  error: string | null;
};

export type OauthCallbackResult = {
  /** Always a redirect. The whole point is that the browser leaves this URL for a clean one. */
  status: 302;
  /** The absolute Location. INVARIANT: it never contains `code` or `state`. */
  location: string;
  /** A stable, secret-free outcome tag for logging/asserting (never rendered to the user). */
  outcome:
    | "connected"
    | "access_denied" | "missing_params" | "state_error" | "state_invalid"
    | "persist_failed" | "exchange_failed" | (string & Record<never, never>);
};

/** Fail toward login with a closed, secret-free detail code. */
function errorLocation(appOrigin: string, detail: string): string {
  const url = new URL(`${appOrigin}/auth`);
  url.searchParams.set("mode", "login");
  url.searchParams.set("mcp", "error");
  url.searchParams.set("mcp_detail", detail);
  return url.toString();
}

/** Land on the connecting tenant's own Connections surface, resolved from the account type + number the
 *  grant writer returned (canonical route contract). Falls closed to login if unresolvable — never a
 *  guessed or shared address. The destination carries only `mcp=connected` + the connection id. */
function connectedLocation(appOrigin: string, accountType: unknown, accountNumber: unknown, connectionId: string): string {
  let path: string | null = null;
  try {
    path = resolveCanonicalAppPath({
      actor: "account",
      tier: String(accountType ?? "") as CanonicalTier,
      account: (typeof accountNumber === "number" || typeof accountNumber === "string") ? accountNumber : null,
      destination: "connections",
    });
  } catch {
    path = null;
  }
  const url = new URL(path ? `${appOrigin}${path}` : `${appOrigin}/auth?mode=login`);
  url.searchParams.set("mcp", "connected");
  url.searchParams.set("connection", connectionId);
  return url.toString();
}

/**
 * Run the OAuth callback. Returns a 302 result whose Location NEVER carries `code`/`state`, for every
 * branch. `appOrigin` is the app base to send the browser back to. Never throws through.
 */
export async function runOauthCallback(
  deps: OauthCallbackDeps,
  query: OauthCallbackQuery,
  opts: { appOrigin: string },
): Promise<OauthCallbackResult> {
  const { admin } = deps;
  const ops = deps.ops ?? defaultOauthOps;
  const origin = opts.appOrigin.replace(/\/$/, "");
  const err = (detail: string): OauthCallbackResult => ({ status: 302, location: errorLocation(origin, detail), outcome: detail });

  // INDISTINGUISHABLE STATE REFUSAL (coordinator condition). An unknown, expired, replayed, tampered, or
  // even un-redeemable (store-error) state must present ONE identical browser outcome: it must never reveal
  // whether that state existed. So every state-redemption failure emits the SAME browser detail
  // (`mcp=error&mcp_detail=state_invalid`) via errorLocation — the browser cannot tell them apart. The
  // internal `outcome` tag stays precise (state_invalid vs state_error) for tests/telemetry, but that is
  // NOT what the browser sees. The code is never echoed in any form, and only closed codes ever reach the
  // browser (no PG/operator text) — the same property the signing page holds, for the same reason.
  const stateRefusal = (internal: "state_invalid" | "state_error"): OauthCallbackResult =>
    ({ status: 302, location: errorLocation(origin, "state_invalid"), outcome: internal });

  // A provider denial or a malformed callback: nothing to consume, so no legitimate in-flight flow can
  // be burned. (An error redirect carries no state to spend.) These are pre-redemption conditions that
  // reveal nothing about the state store, so they keep their own closed detail.
  if (query.error) return err("access_denied");
  if (!query.code || !query.state) return err("missing_params");
  const code = query.code;
  const state = query.state;

  // ORDERING — CONSUME FIRST (atomic single-use), then exchange, then grant. Rationale:
  //   • Replay safety: consume_mcp_oauth_state redeems in the SAME UPDATE that reads it, so exactly one
  //     callback ever proceeds past this line. A replayed callback (same state) matches nothing here →
  //     stateRefusal, NO exchange, NO second grant. Consuming AFTER the exchange would let two racing
  //     callbacks both pass a "state valid" check.
  //   • Recoverability: on ANY post-consume failure (exchange or grant), the connection row is UNCHANGED
  //     — it is still the pre-flow shell, because complete_mcp_oauth_grant validates before its single
  //     atomic UPDATE (all-or-nothing). The only cost of a failure is one spent state, and the tenant
  //     recovers fully by re-running oauth_begin (which mints a fresh state). The connection is never
  //     stranded "flow spent, no grant, no way forward".
  let pending: Record<string, unknown> | null = null;
  try {
    const { data, error } = await admin.rpc("consume_mcp_oauth_state", { _state: state });
    if (error) return stateRefusal("state_error");
    pending = (data ?? null) as Record<string, unknown> | null;
  } catch {
    return stateRefusal("state_error");
  }
  if (!pending || pending.found !== true) return stateRefusal("state_invalid");

  // Constant-time re-compare: the lookup was keyed on the state, but a lookup and a comparison are
  // different guarantees — writing only the lookup silently drops the check if flow-finding later changes.
  if (typeof pending.state !== "string" || !statesMatch(state, pending.state)) return stateRefusal("state_invalid");

  // Connection + tenant come from the STORED flow, never from anything the browser sent.
  const tenantId = typeof pending.tenant_id === "string" ? pending.tenant_id : "";
  const connectionId = typeof pending.connection_id === "string" ? pending.connection_id : "";
  const issuer = typeof pending.issuer === "string" ? pending.issuer : "";
  const clientId = typeof pending.client_id === "string" ? pending.client_id : "";
  const redirectUri = typeof pending.redirect_uri === "string" ? pending.redirect_uri : "";
  const resource = typeof pending.resource === "string" && pending.resource ? pending.resource : "";
  const verifier = typeof pending.code_verifier === "string" ? pending.code_verifier : "";
  const clientSecret = typeof pending.client_secret === "string" && pending.client_secret ? pending.client_secret : null;
  if (!tenantId || !connectionId || !issuer || !clientId || !redirectUri || !resource || !verifier) {
    return stateRefusal("state_invalid");
  }

  try {
    // Re-discover the AS from the STORED issuer (issuer-verified in the helper), then exchange the code
    // with the STORED verifier + client credentials. redirect_uri + resource come from the stored flow,
    // so the token is bound to the exact resource consent was for (RFC 8707) and nothing the browser sent
    // steers the exchange except the code itself.
    const server = await ops.discoverAuthorizationServer(issuer);
    const tokens = await ops.exchangeCode({
      server, clientId, clientSecret, redirectUri, code, verifier, resource,
      // RFC 6749 §5.1: an omitted response `scope` means "identical to requested"; oauth_begin requested
      // this same server's advertised scopes, so this is the exact requested set (honest, never a widening).
      requestedScopes: server.scopesSupported,
    });

    // Persist through the service-role, connection-keyed grant writer. §9/§59: it re-verifies in-body that
    // the connection is in this tenant, re-keys auth_kind->oauth, stores the tokens encrypted, records the
    // granted scopes, resets to pending_verification (so the shipped verify action proves it next), and
    // returns the tenant's routing address for the landing. _actor is null: a provider redirect has no
    // authenticated user; the grant is tenant-scoped and the row's state change IS the record.
    const { data: grant, error } = await admin.rpc("complete_mcp_oauth_grant", {
      _connection_id: connectionId,
      _tenant_id: tenantId,
      _access_token: tokens.accessToken,
      _refresh_token: tokens.refreshToken,
      _oauth_issuer: server.issuer,
      _oauth_client_id: clientId,
      _oauth_client_secret: clientSecret,
      _oauth_scopes: tokens.scopes,
      _access_token_expires_at: tokens.expiresAt,
      _actor: null,
    });
    if (error) return err("persist_failed");

    const g = (grant ?? {}) as { account_type?: unknown; account_number?: unknown };
    return {
      status: 302,
      location: connectedLocation(origin, g.account_type, g.account_number, connectionId),
      outcome: "connected",
    };
  } catch (e) {
    // OAuthError carries a closed code (token_exchange_failed / issuer_mismatch / …); anything else is an
    // internal fault. Never the provider's body — that is where tokens live.
    return err(e instanceof OAuthError ? e.code : "exchange_failed");
  }
}
