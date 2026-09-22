// Connected MCP Gateway — VERIFY (Slice ①: the probe's first live caller).
//
// A connection created in the registry starts `pending_verification`: the row is a CLAIM
// (an address + a credential) that has never been proven. Postgres cannot make an outbound
// request, so a row can only become `connected` when something reaches the provider, runs the
// MCP handshake read-only, and writes the result through the service-role probe. This module is
// that something, factored out of the Deno edge wrapper so the whole authority + mapping path is
// headless-provable (the wrapper only builds the two clients and translates the result to HTTP).
//
// AUTHORITY (§9/§59). The caller's tenant is resolved SERVER-SIDE from their JWT
// (`current_user_tenant_id`), never from the body. Three gates, all bound to that one active
// tenant, must pass before any secret is read:
//   1. the body's `expected_tenant_id` (if present) equals the server-resolved tenant — the
//      workspace-switch-race guard the sibling `tenant-mcp-connect` established;
//   2. the caller is a tenant admin (`is_current_user_tenant_admin`) — the `manage` gate the
//      G1a-1 writer RPCs require;
//   3. the connection is visible to THIS caller in `get_mcp_connections_v2` (RLS + tenant +
//      owner_only visibility scoped) — a connection in another tenant is simply absent, so a
//      cross-tenant id gets the same `not_found` a nonexistent one does (no IDOR, no info leak).
// `get_mcp_connection_secret` is tenant-AGNOSTIC (service role, loads any id), so after the loader
// resolves the row we RE-ASSERT its tenant equals the caller's active tenant (defense in depth).
//
// SECRET DISCIPLINE (§13). The secret is decrypted server-side inside the loader, used for one
// read-only intake, and dropped. Nothing here returns the server URL, the credential, or raw
// provider text — only status/health, a tool count, and a closed error code the product renders.

import { makeRpcConnectionLoader } from "./connection.ts";
import { runReadOnlyIntake } from "./intake.ts";
import type { IntakeResult } from "./types.ts";

// deno-lint-ignore no-explicit-any
type RpcClient = { rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: any; error: any }> };

export type VerifyDeps = {
  /** RLS-scoped as the caller (anon key + the caller's Authorization). All authority gates run here. */
  userClient: RpcClient;
  /** service-role client — the ONLY thing allowed to read the decrypted secret and write the probe. */
  admin: RpcClient;
};

export type VerifyInput = {
  connectionId: string;
  /** The tenant the caller BELIEVED they were acting on when the request left the browser. */
  expectedTenantId: string | null;
};

export type VerifyResult = {
  httpStatus: number;
  // Response body carries only model-/browser-safe facts; never a secret or provider prose.
  body: Record<string, unknown>;
};

/** Map the read-only intake's tool fingerprints to the shape the probe RPC persists. The probe is
 *  authoritative for the catalog: it replaces the connection's tools with exactly this set. */
export function mapFingerprintsToProbeTools(intake: IntakeResult): Array<Record<string, unknown>> {
  return intake.tools.map((t) => ({
    tool_name: t.name,
    schema_hash: t.schemaHash,
    authority_hash: t.authorityHash,
    pin: t.pin,
    app: t.app,
    action_type: t.actionType,
    effects: t.effects,
  }));
}

/**
 * Authorize, then read-only-verify one connection and persist the result via the service-role probe.
 * Returns an HTTP status + a safe body; never throws through (a provider that is down or refuses the
 * credential is a health fact recorded on the row, not an exception). The caller is already
 * authenticated by the wrapper; this enforces tenant scope and the manage gate.
 */
export async function runVerify(deps: VerifyDeps, input: VerifyInput): Promise<VerifyResult> {
  const { userClient, admin } = deps;
  const { connectionId, expectedTenantId } = input;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(connectionId)) {
    return { httpStatus: 400, body: { error: "bad_connection_id" } };
  }
  // Normalize to the canonical lowercase form Postgres returns for a uuid, so the JS ownership
  // compare below matches a mixed-case input the way PG's case-insensitive uuid type does. Without
  // this, an uppercase/mixed-case id passes the case-insensitive regex, then fails the exact
  // string compare against the lowercase v2 rows → a spurious not_found. Fail-closed either way
  // (a case mismatch could only narrow the gate, never widen it — no IDOR), so this is a
  // usability fix, not a security fix; every downstream use keys off the canonical id.
  const id = connectionId.toLowerCase();

  // Tenant from the caller's JWT context — never the body (§9).
  const { data: tenantId, error: tErr } = await userClient.rpc("current_user_tenant_id");
  if (tErr || typeof tenantId !== "string" || !tenantId) {
    return { httpStatus: 400, body: { error: "no_tenant" } };
  }

  // Workspace-switch-race guard: refuse if the caller has since switched away from the tenant they
  // launched the verify from. A rebind to a different (also-theirs) workspace is silent otherwise.
  if (expectedTenantId && expectedTenantId !== tenantId) {
    return { httpStatus: 409, body: { error: "tenant_mismatch" } };
  }

  // Manage gate — mirror the G1a-1 writer RPCs (`mcp.connections.manage` = tenant admin).
  const { data: isAdmin } = await userClient.rpc("is_current_user_tenant_admin");
  if (isAdmin !== true) {
    return { httpStatus: 403, body: { error: "forbidden" } };
  }

  // §9 ownership + visibility: the connection must appear in the caller's own tenant-scoped v2 read.
  // A row in another tenant, or an owner_only row this caller cannot see, is absent → not_found.
  const { data: v2, error: vErr } = await userClient.rpc("get_mcp_connections_v2");
  if (vErr) return { httpStatus: 500, body: { error: "lookup_failed" } };
  const rows = Array.isArray(v2) ? v2 : [];
  const owned = rows.some((r) => r && typeof r === "object" && (r as { connection_id?: unknown }).connection_id === id);
  if (!owned) return { httpStatus: 404, body: { error: "not_found" } };

  // Authorized. Resolve the endpoint + auth SERVER-SIDE from the one row (the loader is the §18 home
  // for secret→connection resolution + usability). It fails closed on a disabled/unusable row.
  const loader = makeRpcConnectionLoader(admin);
  const resolved = await loader(id);
  if (!resolved.ok) {
    // Record an honest, secret-free health state so the row does not sit on a stale "pending".
    await admin.rpc("mcp_connection_probe", {
      _connection_id: id,
      _status: "error",
      _health: "needs_attention",
      _last_error_code: resolved.reason,
      _tools: null,
    });
    return { httpStatus: 200, body: { ok: false, status: "error", health: "needs_attention", tool_count: 0, error_code: resolved.reason } };
  }

  // Defense in depth (§9): the tenant-agnostic loader loaded SOME row; it must be the caller's.
  if (resolved.tenantId !== tenantId) {
    return { httpStatus: 403, body: { error: "forbidden" } };
  }

  // Read-only handshake: initialize + tools/list via the SSRF-guarded client. Never a tools/call.
  const intake = await runReadOnlyIntake({ serverUrl: resolved.serverUrl, auth: resolved.auth });

  // Persist through the service-role probe — the ONLY writer of status='connected'/health='healthy'
  // and of mcp_connection_tools. Replace the catalog only on a successful read (a failed probe must
  // not wipe a previously-good catalog to empty).
  const { error: pErr } = await admin.rpc("mcp_connection_probe", {
    _connection_id: id,
    _status: intake.status,
    _health: intake.health,
    _last_error_code: intake.errorCode,
    _tools: intake.ok ? mapFingerprintsToProbeTools(intake) : null,
  });
  if (pErr) return { httpStatus: 500, body: { error: "probe_write_failed" } };

  return {
    httpStatus: 200,
    body: {
      ok: intake.ok,
      status: intake.status,
      health: intake.health,
      tool_count: intake.ok ? intake.tools.length : 0,
      error_code: intake.errorCode,
    },
  };
}
