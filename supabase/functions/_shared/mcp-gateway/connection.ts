// Connected MCP Gateway — CANONICAL CONNECTION resolution (MCP PR-1, single-source).
//
// THE INVARIANT. Consent verification and the eventual dispatch destination must derive from the
// EXACT SAME server-loaded connection record. Phase S/the #1262 runner verified consent against the
// endpoint stored on the connection row (keyed by `connection_id`, via `verify_mcp_connection_approval`)
// but dispatched to a `serverUrl` the CALLER supplied on the request — two independent inputs. A
// caller could then verify consent for connection A's endpoint and dispatch to endpoint B.
//
// This module closes that: the runner never accepts a caller URL. It resolves the endpoint (and auth)
// SERVER-SIDE from the one `mcp_connections` row, keyed by the same `connection_id` that backs
// consent. Both sides then read the same row — a caller cannot influence where a run dispatches.
//
// The production loader is `get_mcp_connection_secret` (migration 20270319000000, service_role only):
// the ONE decrypted read of the row. It is tenant-AGNOSTIC (it loads any connection by id and returns
// the row's `tenant_id`), so the CALLER — here, the runner — must enforce that the row's tenant is the
// caller's server-derived tenant (§9). The auth mapping reuses `authFromSecret` from `../mcp-client.ts`
// (§18: one home; the guard and the mapping already live together there).

import { authFromSecret, authUsable, type McpAuth, type StoredMcpSecret } from "../mcp-client.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

/** The canonical connection, resolved server-side from the one `mcp_connections` row keyed by
 *  `connection_id`. Both the dispatch endpoint AND the consent identity derive from THIS. `ok:false`
 *  carries a closed refusal reason — never provider prose. */
export type ResolvedConnection =
  | { ok: true; connectionId: string; tenantId: string; serverUrl: string; auth: McpAuth }
  | { ok: false; reason: "no_connection" | "connection_disabled" | "connection_unusable" };

/** What the runner calls to resolve a connection to its canonical endpoint + auth + tenant. In
 *  production this is the RPC-backed loader; the smoke injects a fixture-bound fake. The runner never
 *  takes a URL from its own request. */
export type ConnectionLoader = (connectionId: string) => Promise<ResolvedConnection> | ResolvedConnection;

// The registry (`mcp_connections`, migration 20270319000000) holds rows this MCP client CANNOT drive,
// so a listed connection is not by itself an executable one. Two facets in particular:
//   • transports `sse`/`stdio` — the client speaks JSON-RPC over ONE HTTP POST (MCP Streamable HTTP;
//     an SSE-framed *reply* to that POST is read, but the legacy two-endpoint `sse` transport and the
//     local-process `stdio` transport are not implemented). The migration is explicit: "client
//     implements http today."
//   • `auth_kind='api_key'` — the n8n REST facet, backfilled 1:1 from `tenant_n8n_connections` with a
//     REST base URL (migration §6b). It is a REST API, NOT an MCP JSON-RPC server. `authFromSecret`
//     maps it through its bearer fallthrough, so WITHOUT this gate the loader would resolve `ok:true`
//     and the runner would POST MCP JSON-RPC to a REST endpoint with the wrong header.
// Both are allow-listed to the facets the client can actually execute, checked BEFORE `ok:true` — so
// `prepare` cannot affirm and `execute` cannot contact a listed-but-non-MCP connection; a non-executable
// facet resolves `connection_unusable`, never a dispatch. Widening the client (real `sse`/`stdio`, an
// `api_key` header scheme) is what widens these sets; until then, refuse.
const MCP_EXECUTABLE_TRANSPORTS = new Set(["http"]);
const MCP_EXECUTABLE_AUTH_KINDS = new Set(["oauth", "bearer", "header", "url"]);

/**
 * Production loader: the service-role `get_mcp_connection_secret` RPC is the single decrypted read of
 * the row. It returns the endpoint, auth and tenant from THAT read, so dispatch and consent cannot
 * diverge. Fails CLOSED (`no_connection`) on any RPC/transport error — an unresolvable connection is
 * never a usable one. `configured:false` → `no_connection`; `enabled:false` → `connection_disabled`;
 * a row with no usable endpoint/credential → `connection_unusable`.
 */
export function makeRpcConnectionLoader(admin: Admin): ConnectionLoader {
  return async (connectionId: string): Promise<ResolvedConnection> => {
    try {
      const { data, error } = await admin.rpc("get_mcp_connection_secret", { _connection_id: connectionId });
      if (error) return { ok: false, reason: "no_connection" };
      const row = (data ?? {}) as {
        configured?: unknown;
        enabled?: unknown;
        connection_id?: unknown;
        tenant_id?: unknown;
        server_url?: unknown;
        auth_token?: unknown;
        auth_kind?: unknown;
        auth_header_name?: unknown;
        transport?: unknown;
        expires_at?: unknown;
      };
      if (row.configured !== true) return { ok: false, reason: "no_connection" };
      if (row.enabled !== true) return { ok: false, reason: "connection_disabled" };
      // §18: the guard ("usable?") and the mapping ("which auth?") answered in one place.
      const auth = authFromSecret(row as StoredMcpSecret);
      if (
        auth === null ||
        typeof row.server_url !== "string" || !row.server_url ||
        typeof row.connection_id !== "string" ||
        typeof row.tenant_id !== "string" ||
        // Refuse a facet the MCP client cannot execute — a non-http transport, or an auth kind that is
        // not an MCP credential scheme (the n8n REST `api_key` facet). See the allow-list note above.
        typeof row.transport !== "string" || !MCP_EXECUTABLE_TRANSPORTS.has(row.transport) ||
        typeof row.auth_kind !== "string" || !MCP_EXECUTABLE_AUTH_KINDS.has(row.auth_kind)
      ) {
        return { ok: false, reason: "connection_unusable" };
      }
      // `auth` is now non-null (narrowed by the guard above).
      // A `header` facet whose name the client cannot present — an invalid RFC 9110 token, or a
      // reserved header (`Authorization`/`Accept`/…) — is accepted by `authFromSecret` (which only
      // requires a non-empty name) but REJECTED by `authHeaders` at dispatch. Refuse it here (§18:
      // `authUsable` is the one home for that check) so `prepare` cannot affirm what `execute` throws on.
      // And an OAuth row whose access token has already EXPIRED would dispatch a dead credential —
      // this loader does not refresh/rotate (a later PR), so refuse it rather than contact the provider
      // with a stale token. Scoped to `auth_kind === "oauth"`: a connection switched OFF oauth (to
      // bearer/header) keeps its old `access_token_expires_at` because the setter does not clear it, so
      // an unconditional check would wrongly refuse a valid non-oauth credential once that stale
      // timestamp passes. Only an oauth row's `expires_at` is a live access-token expiry.
      const expiresAt = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : NaN;
      const oauthExpired = row.auth_kind === "oauth" && Number.isFinite(expiresAt) && expiresAt <= Date.now();
      if (!authUsable(auth) || oauthExpired) {
        return { ok: false, reason: "connection_unusable" };
      }
      return { ok: true, connectionId: row.connection_id, tenantId: row.tenant_id, serverUrl: row.server_url, auth };
    } catch {
      return { ok: false, reason: "no_connection" };
    }
  };
}
