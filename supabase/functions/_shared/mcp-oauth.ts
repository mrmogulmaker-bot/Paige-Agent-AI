// _shared/mcp-oauth.ts — OAuth 2.1 for a tenant's MCP provider.
//
// WHY THERE IS NO PASTED TOKEN HERE
//
// n8n is a tenant's own instance and a tenant credential is the only thing that could
// authenticate to it. Zapier is not: it runs an authorization server, so a workspace can
// grant access without anyone pasting a long-lived secret, and Paige can hold a rotating
// refresh token instead of a standing key. A pasted Zapier token would be a permanent
// credential in our custody that nobody can rotate or revoke from their side — which is
// why the registry's own CHECK constraint refuses to store one.
//
// There is also no PLATFORM client secret. The client is registered per workspace through
// Dynamic Client Registration, so one workspace's registration is not the key to another's.
//
// WHAT IS ENFORCED
//
//   - Every endpoint is discovered, never guessed, and every discovery response must name
//     the issuer we asked about. An authorization server that claims a different identity
//     is refused rather than followed.
//   - PKCE with S256 only. `plain` is refused even when a server offers it, because a
//     `plain` challenge is the verifier and offers no protection at all.
//   - `state` is random, single-use, short-lived, and compared in constant time.
//   - Refresh tokens rotate: the response's new refresh token replaces the old one.
//   - Disconnecting revokes at the provider before the local row is cleared.
//   - Every request goes through `safeFetch`, so discovery, registration, token exchange,
//     refresh and revocation all inherit https-only, public-address-only, no-redirect,
//     bounded-time and bounded-size handling.
//
// NOTHING HERE LOGS A TOKEN. Failures carry a stable code and never the response body.
import { safeFetch, SsrfError } from "./ssrfGuard.ts";

export type OAuthErrorCode =
  | "discovery_failed"
  | "issuer_mismatch"
  | "no_authorization_server"
  | "registration_unsupported"
  | "registration_failed"
  | "pkce_unsupported"
  | "token_exchange_failed"
  | "refresh_failed"
  | "revocation_failed"
  | "malformed_metadata"
  | "malformed_token_response";

export class OAuthError extends Error {
  constructor(public readonly code: OAuthErrorCode, public readonly httpStatus?: number) {
    super(code);
    this.name = "OAuthError";
  }
}

export type AuthorizationServer = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
  revocationEndpoint: string | null;
  scopesSupported: string[];
};

export type ClientRegistration = { clientId: string; clientSecret: string | null };

export type TokenSet = {
  accessToken: string;
  /** Absent when the server does not rotate or does not issue one. */
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
};

const JSON_HEADERS = { Accept: "application/json" };
const DISCOVERY_TIMEOUT_MS = 10_000;
const TOKEN_TIMEOUT_MS = 15_000;

async function getJson(url: string, timeoutMs = DISCOVERY_TIMEOUT_MS): Promise<Record<string, unknown>> {
  let res;
  try {
    res = await safeFetch(url, { method: "GET", headers: JSON_HEADERS }, { timeoutMs, maxBytes: 262_144 });
  } catch (e) {
    if (e instanceof SsrfError) throw new OAuthError("discovery_failed");
    throw new OAuthError("discovery_failed");
  }
  if (res.status < 200 || res.status >= 300) throw new OAuthError("discovery_failed", res.status);
  try {
    const parsed = JSON.parse(res.body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch { throw new OAuthError("malformed_metadata"); }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * RFC 9728. Asks the MCP server itself which authorization servers protect it, rather than
 * assuming one. The `resource` it declares is carried into the token request so a token
 * minted for this resource cannot be replayed against another.
 */
export async function discoverProtectedResource(serverUrl: string): Promise<{ resource: string; authorizationServers: string[] }> {
  const u = new URL(serverUrl);
  // RFC 9728 §3.1: the path is appended to the well-known segment, so a server hosted at
  // a sub-path advertises its own metadata rather than the origin's.
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
  const metadata = await getJson(`${u.origin}/.well-known/oauth-protected-resource${path}`);
  const authorizationServers = strArray(metadata.authorization_servers);
  if (authorizationServers.length === 0) throw new OAuthError("no_authorization_server");
  return { resource: str(metadata.resource) ?? `${u.origin}${path}`, authorizationServers };
}

/**
 * RFC 8414. The returned `issuer` MUST equal the issuer we asked about — that check is the
 * whole point of the document, and skipping it lets any reachable server nominate itself
 * as the authority for another's identity.
 */
export async function discoverAuthorizationServer(issuer: string): Promise<AuthorizationServer> {
  const u = new URL(issuer);
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
  const metadata = await getJson(`${u.origin}/.well-known/oauth-authorization-server${path}`);

  const declared = str(metadata.issuer);
  // Compared exactly, after normalising only a trailing slash. A prefix or suffix match
  // would accept `https://evil.example/?x=https://real.example`.
  if (!declared || declared.replace(/\/$/, "") !== issuer.replace(/\/$/, "")) {
    throw new OAuthError("issuer_mismatch");
  }

  const authorizationEndpoint = str(metadata.authorization_endpoint);
  const tokenEndpoint = str(metadata.token_endpoint);
  if (!authorizationEndpoint || !tokenEndpoint) throw new OAuthError("malformed_metadata");

  // A server that does not advertise S256 is not one we will do PKCE with. Absent means
  // unknown, and unknown is refused rather than assumed to be capable.
  const methods = strArray(metadata.code_challenge_methods_supported);
  if (!methods.includes("S256")) throw new OAuthError("pkce_unsupported");

  // Every endpoint must belong to the issuer's own origin. Otherwise a compromised or
  // hostile metadata document could point the token request — carrying our code and
  // verifier — at a host of its choosing.
  for (const endpoint of [authorizationEndpoint, tokenEndpoint, str(metadata.registration_endpoint), str(metadata.revocation_endpoint)]) {
    if (endpoint && new URL(endpoint).origin !== u.origin) throw new OAuthError("malformed_metadata");
  }

  return {
    issuer: declared,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: str(metadata.registration_endpoint),
    revocationEndpoint: str(metadata.revocation_endpoint),
    scopesSupported: strArray(metadata.scopes_supported),
  };
}

/** RFC 7636. S256 only — the method is not a parameter, because `plain` is never correct. */
export async function createPkce(): Promise<{ verifier: string; challenge: string; method: "S256" }> {
  // 32 random bytes → 43 base64url characters, the RFC's minimum verifier length.
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)), method: "S256" };
}

/** A `state` value with enough entropy that guessing it is not a strategy. */
export const createState = (): string => base64Url(crypto.getRandomValues(new Uint8Array(32)));

/**
 * Constant-time comparison. A `state` check that returns early on the first differing
 * character leaks the value one character at a time to anyone who can time it.
 */
export function statesMatch(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Length is compared inside the accumulator so an early return cannot reveal it.
  let diff = ab.length ^ bb.length;
  const max = Math.max(ab.length, bb.length);
  for (let i = 0; i < max; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/**
 * RFC 7591. One client registration per workspace, so a registration is never a shared
 * platform credential and revoking one affects nobody else.
 */
export async function registerClient(opts: {
  server: AuthorizationServer;
  redirectUri: string;
  clientName: string;
}): Promise<ClientRegistration> {
  if (!opts.server.registrationEndpoint) throw new OAuthError("registration_unsupported");
  let res;
  try {
    res = await safeFetch(opts.server.registrationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...JSON_HEADERS },
      body: JSON.stringify({
        client_name: opts.clientName,
        redirect_uris: [opts.redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        // No client secret is wanted. PKCE is the proof, and a public client keeps us
        // from holding a credential we would then have to protect and rotate.
        token_endpoint_auth_method: "none",
      }),
    }, { timeoutMs: TOKEN_TIMEOUT_MS, maxBytes: 262_144 });
  } catch { throw new OAuthError("registration_failed"); }
  if (res.status < 200 || res.status >= 300) throw new OAuthError("registration_failed", res.status);
  let body: Record<string, unknown>;
  try { body = JSON.parse(res.body); } catch { throw new OAuthError("registration_failed"); }
  const clientId = str(body.client_id);
  if (!clientId) throw new OAuthError("registration_failed");
  // A server may issue a secret anyway. It is kept encrypted rather than discarded,
  // because the token endpoint will then require it.
  return { clientId, clientSecret: str(body.client_secret) };
}

/** Builds the consent URL. Nothing secret is placed in it — only the challenge. */
export function buildAuthorizationUrl(opts: {
  server: AuthorizationServer;
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  scopes: string[];
  resource: string;
}): string {
  const url = new URL(opts.server.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // RFC 8707. Binds the token to this MCP server so it cannot be replayed at another.
  url.searchParams.set("resource", opts.resource);
  if (opts.scopes.length) url.searchParams.set("scope", opts.scopes.join(" "));
  return url.toString();
}

/**
 * RFC 6749 §5.1 gives meaning to an OMITTED `scope` -- "identical to the scope requested by
 * the client" -- and gives none to a malformed one. So the KEY'S ABSENCE is what inherits,
 * and nothing else does. An explicit `null`, a number or an array is a broken response, and
 * reading a provider's bug as agreement would record privileges nothing ever established.
 *
 * A present EMPTY string is a server genuinely saying "none": it parses to [] and is still
 * refused downstream, which is the pre-existing behaviour and stays that way.
 */
function resolveScopes(body: Record<string, unknown>, requestedScopes?: string[]): string[] {
  if (!("scope" in body)) return requestedScopes ?? [];
  if (typeof body.scope !== "string") throw new OAuthError("malformed_token_response");
  return body.scope.split(/\s+/).filter(Boolean);
}

async function postToken(
  server: AuthorizationServer,
  form: Record<string, string>,
  failure: OAuthErrorCode,
  /**
   * What the client asked for. RFC 6749 §5.1 makes `scope` OPTIONAL in a token response
   * "if identical to the scope requested by the client" -- so an ABSENT scope means the
   * grant is exactly this, and reading it as NO scopes is simply wrong.
   *
   * That misreading is not cosmetic. A refresh whose response omits `scope` produced
   * `[]`, which then failed every scope assertion downstream; the caller revoked the
   * freshly-issued token, while the provider had already invalidated the old refresh
   * token by rotating it. The connection was then unrecoverable and the only way back
   * was a full re-authorization -- one per token lifetime, forever.
   */
  requestedScopes?: string[],
): Promise<TokenSet> {
  let res;
  try {
    res = await safeFetch(server.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...JSON_HEADERS },
      body: new URLSearchParams(form).toString(),
    }, { timeoutMs: TOKEN_TIMEOUT_MS, maxBytes: 262_144 });
  } catch { throw new OAuthError(failure); }
  // The body is not carried into the error: it is where an authorization server puts
  // detail, and detail here means tokens.
  if (res.status < 200 || res.status >= 300) throw new OAuthError(failure, res.status);
  let body: Record<string, unknown>;
  try { body = JSON.parse(res.body); } catch { throw new OAuthError("malformed_token_response"); }
  const accessToken = str(body.access_token);
  if (!accessToken) throw new OAuthError("malformed_token_response");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
  return {
    accessToken,
    refreshToken: str(body.refresh_token),
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    scopes: resolveScopes(body, requestedScopes),
  };
}

export function exchangeCode(opts: {
  server: AuthorizationServer;
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  code: string;
  verifier: string;
  resource: string;
  /** The scopes this authorization requested; used when the response omits `scope`. */
  requestedScopes?: string[];
}): Promise<TokenSet> {
  return postToken(opts.server, {
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    code_verifier: opts.verifier,
    resource: opts.resource,
    ...(opts.clientSecret ? { client_secret: opts.clientSecret } : {}),
  }, "token_exchange_failed", opts.requestedScopes);
}

/**
 * Refresh, with rotation. The caller stores what comes back: when a server issues a new
 * refresh token the old one is dead, and keeping it would leave the connection broken at
 * the next refresh with no obvious cause.
 */
export function refreshTokens(opts: {
  server: AuthorizationServer;
  clientId: string;
  clientSecret: string | null;
  refreshToken: string;
  resource: string;
  /**
   * The scopes this grant already holds. A refresh_token grant sends no `scope`, so the
   * server has nothing to echo and commonly omits it; the grant is unchanged, and this is
   * what "unchanged" means. Pass the stored scopes wherever the caller asserts on them.
   */
  grantedScopes?: string[];
}): Promise<TokenSet> {
  return postToken(opts.server, {
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    resource: opts.resource,
    ...(opts.clientSecret ? { client_secret: opts.clientSecret } : {}),
  }, "refresh_failed", opts.grantedScopes);
}

/**
 * RFC 7009. Disconnecting locally leaves a live grant at the provider, so the grant is
 * revoked there first. Reports whether it succeeded: the caller clears the local row
 * either way — a workspace must always be able to disconnect — but a failure is worth
 * telling someone about rather than swallowing.
 */
export async function revokeToken(opts: {
  server: AuthorizationServer;
  clientId: string;
  clientSecret: string | null;
  token: string;
  tokenTypeHint: "refresh_token" | "access_token";
}): Promise<boolean> {
  if (!opts.server.revocationEndpoint) return false;
  try {
    const res = await safeFetch(opts.server.revocationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...JSON_HEADERS },
      body: new URLSearchParams({
        token: opts.token,
        token_type_hint: opts.tokenTypeHint,
        client_id: opts.clientId,
        ...(opts.clientSecret ? { client_secret: opts.clientSecret } : {}),
      }).toString(),
    }, { timeoutMs: TOKEN_TIMEOUT_MS, maxBytes: 65_536 });
    return res.status >= 200 && res.status < 300;
  } catch { return false; }
}

/** An access token is treated as expired slightly early, so it cannot lapse mid-request. */
export function isExpired(expiresAt: string | null | undefined, skewSeconds = 60): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) ? true : at - skewSeconds * 1000 <= Date.now();
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
